# Log — Edge Function classificar-documento (IA, Gemini) — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** próximo passo do Módulo Financeiro (item 18) — pedido de JP: "constroi a edge
  function usando gemini como padrao".

## O que foi feito

1. **Migration `20260721090000_fazendas_llm_padrao_gemini.sql`** — DEFAULT de
   `fazendas.llm_provider`/`llm_model` trocado para `'gemini'`/`'gemini-2.5-flash'` (era
   `'anthropic'`/`'claude-haiku-4-5'`). Motivo: dos 3 provedores do catálogo (tela
   Configurações > Modelo de IA), só o Gemini tem chamada de API real nesta entrega — manter o
   default no provedor não implementado deixaria o recurso quebrado "out of the box" para
   fazenda nova. Linhas já existentes (só fazendas de teste) também atualizadas — mudar o
   DEFAULT não afeta linhas já gravadas.
2. **Edge Function nova `supabase/functions/classificar-documento/`** (`logica.ts` + `index.ts`
   + `index.test.ts`, mesma separação de `enviar-convite/`):
   - Recebe `{ fazenda_id, mime_type, arquivo_base64 }` do client autenticado.
   - Client "do usuário" (Authorization repassado) lê `fazendas.llm_provider/llm_model` — RLS
     de `fazendas_select_vinculada` já garante que só fazendas vinculadas ao chamador são lidas,
     sem precisar de `service_role` nesta function (só leitura, sem escrita privilegiada).
   - Se `llm_provider !== 'gemini'`, retorna erro claro (só Gemini implementado hoje).
   - Chama `generateContent` do Gemini (`responseMimeType: application/json` +
     `responseSchema` — pede JSON estruturado direto, sem parsing de texto livre) com um prompt
     que pede os 7 campos de `lancamentos_financeiros` e instrui explicitamente a devolver
     `null` em vez de inventar valor sem confiança.
   - **Nunca grava no banco** — devolve `{ campos }` pro client só pré-preencher; o INSERT
     continua sendo `useCriarLancamento`, depois que o usuário revisa/confirma.
3. **Frontend:** `LancamentoForm.tsx` ganhou um botão "Enviar documento" (topo do form, PDF ou
   imagem, mesmo conjunto de formatos dos buckets do item 14) que chama a function via
   `supabase.functions.invoke` e pré-preenche os campos com `form.setValue` (só sobrescreve
   campos não-nulos retornados — o usuário sempre revisa antes de salvar).
4. **Deploy real:** `supabase functions deploy classificar-documento` — sucesso, function ativa
   no projeto remoto.

## Pendência de infraestrutura (mesma classe do RESEND_API_KEY, ADR-0003)

`GEMINI_API_KEY` **não está configurada** — ninguém gerou a chave ainda. A function detecta
isso e retorna erro claro (500, mensagem "ação pendente do time de infraestrutura") em vez de
falhar de forma confusa. **Ação humana pendente:** gerar uma API key no Google AI Studio/Vertex
e rodar `supabase secrets set GEMINI_API_KEY=...`.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos no frontend.
- **Testes Deno escritos, mas NÃO executados** — ambiente de desenvolvimento (Windows) não tem
  o Deno CLI instalado (`deno --version` não encontrado). Escritos seguindo exatamente o padrão
  de `enviar-convite/index.test.ts`, cobrindo `mimeTypeValido`, `montarChamadaGemini`
  (URL/body corretos) e `extrairCamposDaResposta` (parsing correto, `null` em campo ausente,
  erro em `tipo` inválido/`finishReason` não-STOP/`candidates` vazio) — honestidade de
  cobertura registrada no próprio arquivo de teste.
- **Teste funcional real de ponta a ponta contra a function DEPLOYADA** (Playwright, Supabase
  remoto): upload de um PDF de teste real, confirmado que a function respondeu HTTP 500 com a
  mensagem exata esperada ("Chave de API do Gemini não configurada..."), e que o frontend
  mostra essa mensagem no toast corretamente. Isso confirma toda a cadeia funcionando (auth,
  leitura de `fazendas` via RLS, checagem de provedor, checagem de chave) — só a chamada real ao
  Gemini não pôde ser validada (sem chave real disponível), mesma limitação honesta já aceita
  para o branch Resend em ADR-0003.

## Gate do `cyber_chief`

Não rodado formalmente. Pontos de segurança já observados no próprio desenho: `fazenda_id` do
corpo nunca é confiado sozinho (RLS via client do usuário faz o mesmo papel que a
revalidação explícita de `enviar-convite`); nenhuma escrita privilegiada nesta function (não
precisa de `service_role`); limite de tamanho de arquivo (10MB, alinhado ao bucket do item 14).

## Próximos passos combinados com JP

1. Ação humana: gerar `GEMINI_API_KEY` e configurar via `supabase secrets set`.
2. Testar a extração real assim que a chave existir.
3. Continuar o Módulo Financeiro: visão consolidada de fluxo de caixa + exportação CSV/Excel.
