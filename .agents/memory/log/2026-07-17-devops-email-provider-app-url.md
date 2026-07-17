# Log — Provedor de e-mail transacional (Resend) + `APP_URL` — `devops` (Oliver)

- **Data:** 2026-07-17
- **Agente responsável:** devops (OLIVER)
- **Tipo de tarefa:** duas pendências abertas desde o gate do `cyber_chief` no ADR-0002 (ver
  `.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md`, seção "Pendências"): decidir
  provedor de e-mail transacional para `enviarEmailConvite()` e configurar/documentar `APP_URL`.
- **Escopo:** `supabase/functions/enviar-convite/{logica.ts,index.ts,index.test.ts}` (código) +
  `.agents/memory/adr/ADR-0003-provedor-email-transacional.md` (decisão registrada). Nenhuma
  migration, nenhuma policy, nenhuma mudança na estrutura de segurança revisada pelo
  `cyber_chief` (revalidação de permissão do chamador em `index.ts` intocada).

## O que foi lido antes da tarefa

1. `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md` (seção D3) — onde o provedor fica
   marcado "a definir por devops".
2. `supabase/functions/enviar-convite/logica.ts` — `enviarEmailConvite()` como placeholder,
   `TODO(devops)` explícito.
3. `.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md` — avaliação do `cyber_chief`
   (placeholder não-bloqueante de segurança, mas recomendado resolver antes de considerar o
   fluxo "convite para usuário existente" pronto para uso real).
4. `.agents/memory/PROJECT_CONTEXT.md` — estado atual (schema completo aplicado, Edge Function
   já deployada, pendência explícita na seção 4 atribuída a `devops`).
5. `supabase/functions/enviar-convite/index.ts` e `index.test.ts` — para entender o contrato
   exato de `enviarEmailConvite()`/`montarUrlAceite()` já coberto por teste, e não quebrar o
   comportamento existente.
6. `vite.config.ts`/`package.json` — para confirmar que o scaffold Vite usa a porta padrão
   (nenhum `server.port` customizado), logo `APP_URL` de dev local é `http://localhost:5173`.

## [DECISÃO — PROVEDOR]

**Resend**, escolhido contra SendGrid/Postmark/Amazon SES pelos três critérios pedidos:
integração HTTP simples em Deno sem SDK Node-específico (Resend: um único `fetch()` POST com
`Authorization: Bearer`; SES foi descartado principalmente aqui — exige assinatura AWS SigV4,
desproporcional sem SDK), tier gratuito generoso e permanente (3.000 e-mails/mês, contra tiers de
trial/aprovação de SendGrid e Postmark, e ausência de tier gratuito dedicado da SES), e
deliverability adequada para um produto pré-lançamento. Justificativa completa, incluindo tabela
comparativa, em `.agents/memory/adr/ADR-0003-provedor-email-transacional.md`.

## [DECISÃO — IMPLEMENTAÇÃO]

Código gated por `RESEND_API_KEY` (env var opcional, ausente hoje — ninguém criou a conta ainda):

- `logica.ts`: nova função pura `montarChamadaResend(convite, appUrl, remetente)` monta o
  payload exato da chamada REST à Resend (`POST https://api.resend.com/emails`), sem fazer I/O —
  mesmo padrão do resto do arquivo (lógica pura aqui, rede em `index.ts`). `enviarEmailConvite()`
  deixou de ser "placeholder aguardando decisão de provedor" e virou o **fallback deliberado**:
  usado quando `RESEND_API_KEY` está ausente OU quando a chamada real à Resend falha por
  qualquer motivo — nunca falha a função, o convite já é válido nesse ponto.
- `index.ts`: branch "convidado já tem conta" agora tenta `fetch()` real à Resend quando
  `RESEND_API_KEY` está configurada (sucesso → `emailEnviado: true, canal: 'resend'`; falha HTTP
  ou exceção → cai no fallback, preservando o formato de resposta pré-existente). Nova env var
  opcional `RESEND_FROM_EMAIL` (default no código: `Livestock Control <onboarding@resend.dev>`,
  sender de sandbox da própria Resend, funciona sem domínio verificado). Comentário de cabeçalho
  do arquivo atualizado documentando as duas env vars novas.
- `index.test.ts`: dois testes novos cobrindo `montarChamadaResend()` (payload correto com
  APP_URL definida/ausente), seguindo o mesmo padrão dos testes já existentes para
  `montarChamadaInviteUserByEmail()`. Deno não está disponível nesta máquina (mesma limitação já
  registrada pelo `developer` no log anterior) — testes escritos e revisados manualmente linha a
  linha contra o comportamento esperado, não executados via `deno test`.

**Comportamento preservado:** sem `RESEND_API_KEY` (caso atual), `index.ts` nunca entra no bloco
de `fetch()` — vai direto para `enviarEmailConvite()`, idêntico ao placeholder anterior (loga a
URL, `emailEnviado: false`). Nenhuma regressão no caminho hoje ativo.

## [DECISÃO — APP_URL]

Sem frontend deployado ainda. `vite.config.ts` não define `server.port` customizado → porta
padrão do Vite (`5173`). Valor decidido para agora (dev local): `http://localhost:5173`.

Documentado em `ADR-0003-provedor-email-transacional.md` com aviso explícito (⚠️) de que este
valor **precisa** ser atualizado para a URL pública real assim que o frontend for deployado
(Vercel/Netlify, conforme stack confirmada).

## Comandos gerados (NÃO executados por este agente)

```
supabase secrets set APP_URL=http://localhost:5173 --project-ref bsoofshttpboaaokejwt

supabase secrets set RESEND_API_KEY=re_SUBSTITUA_PELA_CHAVE_REAL --project-ref bsoofshttpboaaokejwt

# opcional, só depois de domínio verificado na Resend:
supabase secrets set RESEND_FROM_EMAIL="Livestock Control <convites@dominio-do-produto.com>" --project-ref bsoofshttpboaaokejwt
```

Aplicar secrets em produção é decisão humana/orchestrator (mesmo padrão já usado para as
migrations) — este agente não tem os valores reais de `.env` e, mesmo que tivesse, não é sua
alçada rodar `supabase secrets set` fora de uma tarefa explícita de execução.

## Limites respeitados

- Nenhuma conta criada em serviço externo (Resend) — decisão de negócio/ação humana fora do
  alcance de um agente.
- Nenhum `supabase secrets set`/`supabase functions deploy` executado.
- Nenhum `git commit`/`git push`.
- `index.ts` tocado só no necessário para passar a chamada Resend adiante — a revalidação de
  permissão do chamador (passo 4, o ponto de segurança central revisado pelo `cyber_chief`) não
  foi alterada.

## Mudanças de arquivo

- `supabase/functions/enviar-convite/logica.ts` — editado (`montarChamadaResend()` nova,
  `enviarEmailConvite()` recontextualizada como fallback, comentários atualizados).
- `supabase/functions/enviar-convite/index.ts` — editado (branch Resend + fallback, novas env
  vars documentadas no cabeçalho).
- `supabase/functions/enviar-convite/index.test.ts` — editado (2 testes novos para
  `montarChamadaResend()`, 1 comentário ajustado).
- `.agents/memory/adr/ADR-0003-provedor-email-transacional.md` — novo.
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5; seção 4 atualizada
  (pendência "devops decidir provedor" removida, nova pendência específica de ação humana
  adicionada).

## Pendências (ação humana, fora do alcance deste agente)

- Criar conta na Resend, gerar API key, rodar os dois `supabase secrets set` acima (ou
  equivalente com valores reais) e `supabase functions deploy enviar-convite --project-ref
  bsoofshttpboaaokejwt` para a nova versão do código ir ao ar.
- Quando o frontend for deployado (Vercel/Netlify): atualizar `APP_URL` para a URL pública real.
- Antes de expor o fluxo a usuários reais fora da equipe: verificar um domínio próprio na Resend
  e configurar `RESEND_FROM_EMAIL` (sandbox `onboarding@resend.dev` é aceitável só para testes
  iniciais).
- `qa` (Emma): segue pendente o teste de integração real do handler HTTP completo (recomendado
  nos dois gates do `cyber_chief`), agora incluindo o novo branch de `fetch()` à Resend.
