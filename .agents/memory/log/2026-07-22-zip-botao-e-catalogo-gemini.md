# Log — Botão "Baixar ZIP" (Documentos Fiscais) + catálogo de modelos Gemini — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** dois pedidos de JP — (1) "o botão baixar zip na aba documentos fiscais... não
  está ativo"; (2) atualizar o catálogo de modelos Gemini (gemini-2.5-flash-lite como padrão,
  gemini-3.5-flash-lite como segundo, resto da lista mantida na ordem atual).

## 1. Botão "Baixar ZIP do mês" — achado real

Não era bug de lógica — reproduzido via Playwright, o botão FUNCIONA corretamente quando ano e
mês estão selecionados (chama `gerar-zip-lancamentos`, baixa um ZIP real, ~100KB, com o documento
de verdade dentro). O problema é de UX: `DocumentosFiscaisPage.tsx` nascia com
`filtro = { ano: null, mes: null }` ("Todos"/"Todos"), e o botão fica desabilitado até os dois
campos serem preenchidos — no primeiro acesso à tela, o botão aparece cinza sem nenhuma ação
óbvia do usuário, lido como "não está ativo"/quebrado.

**Corrigido:** o filtro agora nasce já com o ano/mês corrente selecionados — o botão fica ativo
desde o primeiro carregamento da tela, sem exigir nenhuma ação prévia. O usuário ainda pode voltar
pra "Todos" a qualquer momento (só desabilita o botão de novo, que é o comportamento correto — a
Edge Function sempre exige um período específico).

## 2. Catálogo de modelos Gemini — achado real (mesma classe do incidente de 2026-07-21)

Pedido de JP: `gemini-2.5-flash-lite` como novo padrão, `gemini-3.5-flash-lite` como segundo,
resto da lista mantida. Antes de aplicar cegamente, testei os dois modelos com uso real (upload
de documento via `classificar-documento`, Playwright contra o Supabase remoto):

- **`gemini-2.5-flash-lite`: MORTO.** Erro real do Gemini: "This model
  models/gemini-2.5-flash-lite is no longer available to new users." — mesmíssima classe de
  achado do incidente de 2026-07-21 (gemini-2.5-flash também estava morto). Removido do catálogo.
- **`gemini-3.5-flash-lite`: funciona.** Upload real extraiu os campos corretamente (nota de
  ferragem, valor R$114,25, fornecedor "FERRAGEM DO JESUS"). Virou o novo padrão em lugar do
  modelo morto.

Resto da lista (`gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.1-pro-preview`) mantida na
mesma ordem, como pedido.

**Migrations:** `20260722190000` (troca inicial pro pedido original) seguida de
`20260722200000` (correção — acabou sendo necessária por causa do achado acima, mesmo padrão de
"migration seguida de correção" já usado no incidente de 2026-07-21). `fazendas.llm_model` default
e as 4 fazendas existentes (todas ainda no default anterior, nenhuma escolha manual) atualizadas
pra `gemini-3.5-flash-lite`.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos, nos dois commits.
- Playwright real contra o remoto: botão ativo no carregamento, download real do ZIP confirmado
  (arquivo de ~100KB salvo em disco, toast de sucesso); upload real de documento com o novo
  modelo padrão extraindo campos corretos; tela "Modelo de IA" confirmada mostrando o catálogo
  corrigido (Gemini 3.5 Flash Lite primeiro, sem a entrada morta).

## Gate do `cyber_chief`

Não se aplica — ZIP é frontend puro (RLS/Edge Function já revisados); catálogo Gemini é uma
constante de frontend + migration de UPDATE simples, mesmo padrão já usado sem gate dedicado em
2026-07-21.
