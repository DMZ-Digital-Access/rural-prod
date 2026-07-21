# Log — Configuração de Modelo de IA (admin escolhe provedor/modelo) — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** JP pediu "um ambiente para os admin da conta escolherem a LLM usada no
  sistema" (Anthropic/OpenAI/Gemini), como parte do próximo passo do Módulo Financeiro
  (classificação assistida por IA de lançamentos).

## Decisão confirmada com JP antes de implementar

Perguntei explicitamente de quem seria a chave de API usada — **chave nossa, compartilhada**
(não BYOK). O admin só escolhe entre provedor/modelo já configurados no backend; não cadastra
credencial própria. Isso simplifica bastante o desenho: sem tabela de credenciais nova, sem
criptografia de segredo por fazenda.

## O que foi feito

Migration `20260721080000_fazendas_config_llm.sql` — `fazendas.llm_provider` (CHECK
`in ('anthropic','openai','gemini')`, default `'anthropic'`) + `fazendas.llm_model` (texto
livre, default `'claude-haiku-4-5'` — mesma decisão de `lancamentos_financeiros.categoria`,
catálogo validado só no frontend).

**Achado de segurança real, corrigido antes de expor a tela:** a policy existente
`fazendas_update_vinculada` (Fase 1) autoriza UPDATE de **qualquer papel vinculado**
(admin/membro/financeiro), sem distinção — hoje só afetava `nome`. Sem uma guarda dedicada,
`membro`/`financeiro` poderiam mudar a configuração de IA, contrariando o pedido explícito de
JP ("ambiente para os admin"). Corrigido com um trigger `BEFORE UPDATE OF llm_provider,
llm_model` que exige `papel = 'admin'` — defesa em profundidade sem reescrever a policy de RLS
existente (fora do escopo desta tarefa).

Novos arquivos: `src/lib/llmCatalog.ts` (catálogo de modelos por provedor — Anthropic: Haiku
4.5/Sonnet 5/Opus 4.8; OpenAI: gpt-4o-mini/gpt-4o; Gemini: lista fornecida por JP —
gemini-2.5-pro/gemini-2.5-flash/gemini-3.5-flash/gemini-3.1-pro-preview/gemini-3-pro-preview),
`src/hooks/useConfiguracaoLlm.ts`, `src/pages/configuracoes/ConfiguracaoIaPage.tsx`
(`/app/configuracoes/ia`, nav "Modelo de IA"). Papel diferente de admin vê a tela em modo
leitura (Selects desabilitados + aviso), não escondida por completo — o SELECT continua
liberado pela RLS existente.

**Nota honesta sobre confiança dos IDs de modelo:** os IDs da Anthropic vêm de fonte
verificada (skill `claude-api` desta sessão, cache 2026-06-24). Os da OpenAI foram sugestão
minha de confiança média (gpt-4o-mini/gpt-4o), não verificados ao vivo. Os do Gemini foram
fornecidos diretamente por JP. Nenhum dos três provedores tem, ainda, a chamada real de API
implementada — esta tarefa só persiste a *escolha*; a Edge Function que efetivamente lê o
documento e chama o provedor escolhido é o próximo passo do Módulo Financeiro.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- Teste funcional real (Playwright, desktop+mobile, Supabase remoto): admin trocou para
  Google (Gemini) / Gemini 2.5 Flash, salvou, **recarregou a página** e confirmou persistência
  real. Zero erros de console.
- **Teste real da guarda de segurança** (não só teórico): criado um usuário de teste
  temporário, vinculado como `membro` à "Fazenda de Teste" (via SQL direto — `usuarios_fazendas`
  não é gravável pelo client). Logado como esse usuário via `@supabase/supabase-js` real:
  confirmado que o SELECT funciona (leitura permitida a qualquer papel vinculado) e que o
  UPDATE é **bloqueado pelo trigger**, com a mensagem exata esperada
  ("apenas o papel admin pode alterar a configuração de IA da fazenda"). Usuário de teste
  removido ao final.
- **Achado operacional durante a limpeza dos dados de teste:** o trigger bloqueia até um
  UPDATE feito via `psql` direto como superusuário — `auth.uid()` retorna `NULL` fora de uma
  sessão autenticada real, e `NULL is distinct from 'admin'` avalia `true`, então o trigger
  dispara igual. Para corrigir dados de `llm_provider`/`llm_model` via SQL direto no futuro, é
  preciso `alter table public.fazendas disable trigger restringir_alteracao_config_llm;` antes
  do UPDATE e reabilitar depois — documentado aqui para não redescobrir isso na próxima vez.

## Gate do `cyber_chief`

Não rodado formalmente, mas o desenho já incorporou uma revisão de segurança real (achado da
policy `fazendas_update_vinculada` + guarda dedicada) antes de expor a tela — mesma pendência
acumulada dos módulos anteriores desta fase quanto ao gate formal.

## Próximos passos combinados com JP

Módulo Financeiro continua: Edge Function que efetivamente chama o provedor/modelo escolhido
(Anthropic/OpenAI/Gemini) para ler o documento e pré-preencher o formulário de lançamento; e
depois a visão consolidada de fluxo de caixa + exportação CSV/Excel.
