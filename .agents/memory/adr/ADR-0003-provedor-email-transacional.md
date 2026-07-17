[ADR-0003]
Título: Provedor de e-mail transacional para convite de usuário já cadastrado + valor de
`APP_URL` para o ambiente atual
Data: 2026-07-17
Status: aceito

---

Este é um ADR leve (decisão de infraestrutura, não de arquitetura de dados/segurança) — não
segue o protocolo completo de 5 seções do `architect`. Registrado porque outros agentes
(`developer`, `qa`, `cyber_chief`) e o próprio JP vão precisar saber o que foi decidido e o que
ainda depende de ação humana.

## [CONTEXTO]

ADR-0002 D3 deixou o provedor de e-mail transacional para o branch "convidado já tem conta" de
`enviarEmailConvite()` (`supabase/functions/enviar-convite/logica.ts`) marcado como "a definir
por devops". O `cyber_chief` avaliou o placeholder (só loga a URL de aceite) como não-bloqueante
de segurança no gate do ADR-0002, mas recomendou resolver antes de considerar esse fluxo pronto
para uso real (`.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md`).

Também estava pendente `APP_URL`, secret da Edge Function usado para CORS, `redirectTo` do
convite nativo e a URL de aceite montada no e-mail — hoje ausente em qualquer ambiente.

## [DECISÃO — PROVEDOR]

**Resend**, avaliado contra SendGrid, Postmark e Amazon SES pelos três critérios pedidos:

| Critério | Resend | SendGrid | Postmark | Amazon SES |
|---|---|---|---|---|
| Integração HTTP simples em Deno (sem SDK Node-específico) | Sim — um único `POST` JSON com `Authorization: Bearer`, literalmente `fetch()` puro | Sim, API REST similar, mas SDK oficial é Node-first (não usado aqui de qualquer forma) | Sim, API REST simples | **Não** — autenticação exige assinatura AWS SigV4; sem SDK isso é implementação de crypto própria, desproporcional a um único envio de e-mail |
| Tier gratuito generoso para pré-lançamento | 3.000 e-mails/mês, 100/dia, permanente | Sem tier gratuito permanente atualmente (trial por tempo limitado) | Sem tier gratuito contínuo — créditos de trial, requer aprovação de conta | Sem tier gratuito dedicado (fora do free tier geral de conta AWS nova); custo baixo por e-mail, mas exige conta AWS + sandbox mode + pedido de saída de sandbox |
| Reputação de deliverability | Boa, provedor moderno, usado amplamente em stacks Supabase/Deno | Boa, mercado maduro | Excelente (foco histórico em transacional), mas processo de aprovação de conta mais burocrático | Boa quando bem configurado, mas exige mais trabalho de configuração (DKIM/SPF manual, sandbox) para chegar lá |

**Escolha: Resend.** É o único dos quatro que atende ao critério (a) sem ressalva — chamar a API
é um `fetch()` com header `Authorization: Bearer <key>` e corpo JSON, nada além disso, o que
importa especialmente aqui porque Deno Edge Functions têm suporte limitado a SDKs pensados para
Node (a maioria assume `fs`/streams Node-específicos que não existem ou se comportam diferente
no runtime Deno). SES foi descartado principalmente por isso: exigiria implementar assinatura
SigV4 à mão ou trazer o SDK AWS inteiro para assinar uma request — desproporcional para o volume
baixo deste produto. SendGrid e Postmark são tecnicamente viáveis via REST simples também, mas
perdem no critério (b): nenhum dos dois tem hoje um tier gratuito permanente comparável ao da
Resend (3.000/mês) para um produto que ainda nem lançou.

## [DECISÃO — IMPLEMENTAÇÃO]

Código já implementado, gated pela env var `RESEND_API_KEY` (opcional, ausente hoje):

- `supabase/functions/enviar-convite/logica.ts` ganhou `montarChamadaResend(convite, appUrl,
  remetente)` — função pura que monta `{ url, body }` da chamada à API da Resend
  (`POST https://api.resend.com/emails`), sem fazer a chamada de rede (mesmo padrão do resto do
  arquivo: lógica pura aqui, I/O em `index.ts`).
- `enviarEmailConvite()` (já existente) deixou de ser "placeholder aguardando decisão" e virou o
  **fallback deliberado**: usado quando `RESEND_API_KEY` está ausente OU quando a chamada real à
  Resend falha por qualquer motivo (rede, chave inválida, domínio não verificado). Nunca falha a
  função — o convite já foi processado com sucesso nesse ponto, só o canal de notificação fica
  pendente.
- `supabase/functions/enviar-convite/index.ts`: branch "convidado já tem conta" agora tenta
  `fetch()` real à Resend quando `RESEND_API_KEY` está configurada; em sucesso retorna
  `emailEnviado: true, canal: 'resend'`; em falha (HTTP não-2xx ou exceção) cai no fallback
  acima, preservando o formato de resposta já usado (`emailEnviado: false`, `aceiteUrl`).

Nova env var opcional: `RESEND_FROM_EMAIL` — remetente usado na chamada. Default no código:
`Livestock Control <onboarding@resend.dev>` (sender de sandbox da própria Resend, funciona sem
domínio verificado, mas com volume/reputação limitados — trocar por um remetente do domínio do
produto assim que houver domínio verificado na conta Resend).

**Nada disso quebra o comportamento atual**: sem `RESEND_API_KEY` configurada (o caso agora),
`index.ts` nunca entra no bloco de `fetch()` — vai direto para `enviarEmailConvite()`, idêntico
ao comportamento pré-existente (loga a URL, `emailEnviado: false`).

## [PENDÊNCIA HUMANA — NÃO EXECUTADA POR ESTE AGENTE]

Um agente não pode criar conta em serviço externo nem decidir qual cartão/CNPJ usar para
faturamento — isso é ação humana (JP ou quem ele designar):

1. Criar conta em https://resend.com (tier gratuito serve para pré-lançamento).
2. Gerar uma API key na conta Resend.
3. (Opcional, mas recomendado antes de produção real) Verificar um domínio próprio na Resend e
   trocar o remetente default por algo como `Livestock Control <convites@dominio-do-produto.com>`
   — sandbox (`onboarding@resend.dev`) é aceitável para os primeiros testes, não para produção
   com usuários reais (limites de volume e a mensagem chega identificada como enviada "via
   resend.dev").
4. Configurar o secret na Edge Function (comando exato abaixo) e, se o remetente padrão for
   trocado, configurar também `RESEND_FROM_EMAIL`.
5. Rodar `supabase functions deploy enviar-convite --project-ref bsoofshttpboaaokejwt` para a
   nova versão do código (já no repo) ir ao ar.

Comando exato (placeholder de API key — substituir antes de rodar; **não rodado por este
agente**, decisão de quando aplicar secrets em produção é do orchestrator/humano, mesmo padrão
já usado para as migrations):

```
supabase secrets set RESEND_API_KEY=re_SUBSTITUA_PELA_CHAVE_REAL --project-ref bsoofshttpboaaokejwt

# Só se/quando um domínio próprio for verificado na Resend (opcional no início):
supabase secrets set RESEND_FROM_EMAIL="Livestock Control <convites@dominio-do-produto.com>" --project-ref bsoofshttpboaaokejwt
```

## [DECISÃO — APP_URL]

Não existe frontend deployado ainda (Fase 1 sem UI). O scaffold Vite (`vite.config.ts`,
`package.json`) não define `server.port` customizado, então a porta padrão do Vite (`5173`)
vale.

**Valor para agora (ambiente de desenvolvimento local):**

```
APP_URL=http://localhost:5173
```

Comando exato para configurar o secret da Edge Function com esse valor (dev/local; pode ser
rodado já, não depende de nenhuma conta externa nova):

```
supabase secrets set APP_URL=http://localhost:5173 --project-ref bsoofshttpboaaokejwt
```

**⚠️ ATUALIZAR EM PRODUÇÃO:** assim que o frontend for deployado de verdade (Vercel ou Netlify,
conforme a stack confirmada em `especificacao-sistema.md` seção 2 / `PROJECT_CONTEXT.md` seção
1), este secret **precisa** ser atualizado para a URL pública real do frontend, por exemplo:

```
supabase secrets set APP_URL=https://app.dominio-do-produto.com --project-ref bsoofshttpboaaokejwt
```

Enquanto `APP_URL` apontar para `localhost`, o `redirectTo` do e-mail de convite nativo
(`admin.inviteUserByEmail`) e o link de aceite do e-mail transacional (Resend) vão apontar para
uma URL que só funciona na máquina de quem está rodando `npm run dev` — **inofensivo em dev,
mas silenciosamente quebrado se alguém deployar a Edge Function assim e testar o fluxo a partir
de um ambiente de produção real**. Ninguém mais precisa lembrar disso de cabeça: este ADR e o
comentário em `index.ts` (linhas do bloco "Variáveis de ambiente") são os dois lugares onde essa
instrução fica registrada.

## [CONSEQUÊNCIAS]

**Positivas:**
- Código pronto para funcionar assim que a conta Resend existir — nenhum trabalho de
  `developer`/`devops` adicional será necessário além de rodar os dois `supabase secrets set`
  acima e o deploy.
- Nenhuma decisão de negócio (conta, cartão) foi tomada por este agente — só a escolha técnica
  de provedor, dentro do escopo do papel de `devops`.
- Comportamento atual (fallback de log) preservado integralmente enquanto a env var não existir
  — zero risco de quebrar o fluxo de convite hoje em produção.

**Negativas / trade-offs aceitos:**
- Até que o secret exista, o branch "convidado já tem conta" continua sem enviar e-mail de
  verdade — mitigação de produto (tela de "convites pendentes" para quem já está logado, ver
  recomendação do `cyber_chief` no gate do ADR-0002) continua válida e recomendada
  independentemente deste ADR.
- `onboarding@resend.dev` como remetente default é adequado só para testes iniciais — antes de
  expor o fluxo a usuários reais fora da equipe, o domínio verificado (`RESEND_FROM_EMAIL`)
  deveria estar configurado.

## [CRITÉRIOS DE REVISÃO]

Revisar esta decisão se: o volume de convites crescer a ponto de aproximar do limite gratuito da
Resend (3.000/mês); a Resend apresentar problemas de deliverability observados na prática; ou o
frontend for deployado e `APP_URL` precisar ser atualizada (nesse ponto, não é uma revisão de
decisão, só execução do que este ADR já deixou documentado).
