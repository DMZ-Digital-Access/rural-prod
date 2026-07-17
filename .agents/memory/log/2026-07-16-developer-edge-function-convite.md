# Log — Edge Function `enviar-convite` (ADR-0002 D3)

- **Data:** 2026-07-16
- **Agente responsável:** developer (RYAN), a pedido do squad DMZ.
- **Tipo de tarefa:** Implementação de uma Edge Function Deno/TypeScript já especificada por
  ADR aceito (`ADR-0002-convites-e-papeis-admin.md`, seção D3), consumindo o schema Postgres já
  escrito pelo `db_sage` (`supabase/migrations/20260716183000_adr0002_convites_papeis.sql`,
  ainda não aplicada).
- **Escopo:** `supabase/functions/enviar-convite/index.ts` (handler HTTP),
  `supabase/functions/enviar-convite/logica.ts` (lógica de decisão pura, extraída para
  testabilidade) e `supabase/functions/enviar-convite/index.test.ts` (testes `Deno.test`).
  Nenhum arquivo `.sql` tocado. Nenhum `supabase functions deploy` executado.

## O que foi lido antes de escrever o código

1. `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md` — seção D3, a especificação exata
   desta função (contrato de entrada, os dois branches por `convidado_usuario_id`, por que a
   não-atomicidade entre `criar_convite()` e `enviar-convite` é aceitável aqui).
2. `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` — schema Postgres que a
   função consome via `service_role` (tabela `convites` com todos os campos, `usuarios_fazendas`
   para a revalidação de permissão). Confirmado que `criar_convite()` já resolve
   `convidado_usuario_id` no momento da criação do convite (lookup por e-mail em
   `public.usuarios`), então a função só precisa ler esse campo, nunca resolvê-lo de novo.
3. `.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md` — padrão de rigor de segurança
   do squad (nunca delegar autorização a uma camada declarativa/implícita; checagem de
   permissão sempre explícita no código, mesmo quando a camada por baixo já teria bypassado
   qualquer restrição — aqui aplicado ao client `service_role`, que bypassa RLS por padrão, mas
   a checagem de "chamador é admin da fazenda do convite" é feita em código mesmo assim, nunca
   assumida).

## O que a função faz

1. CORS: trata `OPTIONS` (preflight) e usa `APP_URL` como `Access-Control-Allow-Origin` quando
   configurada, caindo para `*` se ausente (não é risco de CSRF aqui — autenticação é via header
   `Authorization`, nunca cookie — mas fica mais restritivo assim que `APP_URL` for configurada
   em produção).
2. Único campo de entrada aceito do corpo: `convite_id`. Qualquer outro campo é ignorado.
3. Client "do usuário" (`createClient` com o JWT do header `Authorization`, repassado
   automaticamente pelo `supabase-js` na chamada `functions.invoke`) — usado exclusivamente para
   `auth.getUser()`, nunca para decodificar o JWT manualmente.
4. Client `service_role` (env var injetada automaticamente pelo runtime, sem secret manual) —
   usado para ler `convites`/`usuarios_fazendas` e para `auth.admin.inviteUserByEmail`.
5. Busca o convite por `id` via `service_role`. Não encontrado → 404.
6. **Revalida a permissão do chamador**: consulta `usuarios_fazendas` (mesmo client
   `service_role`, checagem explícita em código) confirmando `papel = 'admin'` na
   `fazenda_id` **do convite lido do banco**, nunca de qualquer campo do corpo da requisição.
   Não-admin → 403. Este é o ponto de segurança central da função.
7. `status !== 'pendente'` → 409 com mensagem indicando o status atual (não reenvia
   aceito/cancelado).
8. Branch por `convidado_usuario_id`:
   - `null` (sem conta): monta e chama `serviceClient.auth.admin.inviteUserByEmail(email, {
     data: { convite_token }, redirectTo })`. Isso dispara `handle_new_user()` no momento da
     criação da linha em `auth.users`, populando `raw_user_meta_data.convite_token` conforme a
     migration já espera. Falha da Admin API → 502 com a mensagem original do Supabase.
   - preenchido (já tem conta): branch **deliberadamente placeholder**. Monta a URL de aceite
     (`${APP_URL}/convites/aceitar?token=...`) e só loga via `console.log` — não lança exceção.
     Retorna `success: true, emailEnviado: false, motivo: 'provedor de e-mail pendente de
     decisão (devops)'`. Ver decisão abaixo.
9. Todo o corpo do handler roda dentro de um único `try/catch` — nenhuma exceção não prevista
   escapa sem virar uma resposta JSON (`{ error: ... }`, status 500).

## Decisão sobre o branch de e-mail sem provedor definido

O ADR-0002 D3 deixa explícito que o provedor de e-mail transacional para quem já tem conta "é a
definir por devops" — não é uma decisão do `developer`. A escolha implementada foi: a função
**nunca falha** por causa disso. O convite já existe e é válido (passou pelas validações de
admin/pendente); o único passo que não está implementado é a notificação por e-mail em si. Fazer
a função retornar erro nesse caso obrigaria o admin a pensar que o convite não foi criado, quando
na verdade foi — e a aceitação em si (`aceitar_convite(token)` via RPC) não depende deste e-mail
ter sido enviado, só de o convidado conseguir a URL por algum canal (hoje, só via log do servidor
— um risco/lacuna real, documentado abaixo). A função `enviarEmailConvite()` em `logica.ts` é
isolada e comentada como `TODO(devops)`, para nunca ser confundida com um esquecimento.

## Estrutura dos arquivos

- **`logica.ts`**: toda a lógica de decisão pura (tipos `ConviteRow`/`VinculoRow`,
  `corsHeadersFor`, `chamadorEhAdminDaFazenda`, `validarConvitePendente`,
  `montarChamadaInviteUserByEmail`, `montarUrlAceite`, `enviarEmailConvite`) — zero dependência
  de rede ou `createClient`. Extraído para um módulo separado de `index.ts` por um motivo
  técnico específico, não só estilo: `index.ts` precisa chamar `Deno.serve(...)` no top-level
  (exigência do runtime de Edge Functions do Supabase para reconhecer o entrypoint), e isso
  executaria como efeito colateral do próprio `import` se o teste importasse `index.ts`
  diretamente — levantando um listener HTTP real durante a suíte de testes. Importando só
  `logica.ts`, o teste nunca dispara esse efeito colateral.
- **`index.ts`**: só a orquestração HTTP (parsing do request, os dois clients Supabase, as
  chamadas de rede, montagem das respostas) — usa as funções de `logica.ts` para toda decisão.

## Cobertura de teste — honestidade explícita

`index.test.ts` cobre as quatro funções puras de `logica.ts` (chamador não-admin, convite
não-pendente com os dois status possíveis, payload de `inviteUserByEmail` com e sem `APP_URL`,
URL de aceite/log do branch TODO) e `corsHeadersFor`. **O handler HTTP completo de `index.ts`
não está coberto** — mockar `@supabase/supabase-js` de ponta a ponta (builder encadeável
`.from().select().eq().eq().maybeSingle()` + client de auth) para um teste unitário real daria
falsa confiança (passaria mesmo com uma coluna/tabela errada na query), e um teste de integração
de verdade exige Supabase local rodando (`supabase start` + `supabase functions serve`), fora do
alcance desta tarefa. Isso está documentado no cabeçalho do próprio arquivo de teste, com
recomendação explícita para o `qa` (Emma) fazer esse teste de integração depois. Não consegui
rodar `deno test` localmente para confirmar execução real dos testes — Deno não está instalado
nesta máquina (`deno --version` falhou) e a Supabase CLI local (v2.26.9) não expõe um `deno test`
direto sem subir a stack completa. Revisão manual linha a linha dos dois arquivos como
mitigação, mas isso é uma lacuna de verificação real que o `qa`/`cyber_chief` devem saber antes
do gate.

## Riscos de segurança para o `cyber_chief` revisar com atenção especial

1. **CORS com fallback `*`** quando `APP_URL` não está configurada (`corsHeadersFor` em
   `logica.ts`). Não é CSRF (auth via `Authorization` header, não cookie), mas é mais permissivo
   do que o necessário — deveria virar bloqueante (falhar em vez de cair para `*`) se
   `cyber_chief` julgar que o risco de alguém esquecer de configurar `APP_URL` em produção supera
   o custo de travar localmente sem ela.
2. **Branch de e-mail placeholder (`enviarEmailConvite`)** só loga a URL de aceite via
   `console.log` — hoje não existe canal real para o convidado (que já tem conta) descobrir essa
   URL fora dos logs do servidor. Não é uma vulnerabilidade de autorização (a aceitação em si
   ainda exige RPC autenticado com e-mail/uuid batendo), mas é uma lacuna funcional real que
   `cyber_chief`/produto devem tratar como bloqueante de UX antes de expor este fluxo a usuários
   reais, não só como débito técnico de infraestrutura.
3. A revalidação de permissão (passo 6) é o ponto mais crítico e já está isolada em
   `chamadorEhAdminDaFazenda()` com teste dedicado — mas vale o `cyber_chief` confirmar que a
   ausência de `.single()`/`for update` (a query usa `maybeSingle()`, sem lock) não abre uma
   janela de corrida relevante aqui: ao contrário das funções `SECURITY DEFINER` em SQL (que
   fazem leitura+escrita atômica), esta Edge Function só LÊ o convite e delega toda mutação de
   estado (marcar aceito) a `aceitar_convite()`/`handle_new_user()` — não há escrita em
   `convites`/`usuarios_fazendas` feita por esta função além do `inviteUserByEmail` (que só
   afeta `auth.users`), então uma corrida entre duas chamadas simultâneas de `enviar-convite`
   para o mesmo convite no máximo dispara `inviteUserByEmail` duas vezes (idempotente-ish do
   lado do GoTrue, reenvia o e-mail), não duplica vínculo nem convite.
4. **Import `npm:@supabase/supabase-js@2`** sem versão de patch pinada — decisão consciente de
   seguir a convenção mais comum dos templates oficiais do Supabase (`npm:@supabase/supabase-js@2`),
   mas isso significa que a versão exata resolvida no deploy pode variar ao longo do tempo; se o
   squad quiser reprodutibilidade estrita, pinar uma versão completa (`@2.45.x`) é uma mudança de
   uma linha.

## Mudanças de arquivo

- Novo `supabase/functions/enviar-convite/index.ts`.
- Novo `supabase/functions/enviar-convite/logica.ts`.
- Novo `supabase/functions/enviar-convite/index.test.ts`.
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, seção 4 atualizada
  (pendência do ADR-0002 sobre a Edge Function marcada como resolvida, gate do `cyber_chief`
  ainda pendente).

## Pendências / próximos passos

- **Gate obrigatório do `cyber_chief`** antes de qualquer `supabase functions deploy` — mesmo
  processo já usado para as migrations SQL. Atenção aos 4 riscos listados acima, especialmente
  o CORS com fallback `*` e a lacuna funcional do branch de e-mail placeholder.
- Migration `20260716183000_adr0002_convites_papeis.sql` continua não aplicada — esta Edge
  Function depende das tabelas/funções dela existirem no banco antes de funcionar de fato
  (fora do escopo desta tarefa aplicar).
- Provedor de e-mail transacional para convite a usuário já cadastrado: decisão de `devops`,
  ainda não tomada — `enviarEmailConvite()` em `logica.ts` é o ponto de extensão exato quando
  isso for decidido.
- Teste de integração real (Supabase local + `supabase functions serve`) do handler completo de
  `index.ts`: recomendado para `qa` (Emma), não feito aqui (ver seção "Cobertura de teste" acima).
