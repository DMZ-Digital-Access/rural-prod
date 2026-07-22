-- ============================================================================
-- Migration: configuracao_extracao_lancamentos — tabela nova, singleton,
--            GLOBAL (sem fazenda_id) — controle do prompt de extração e do
--            schema JSON de saída usados por classificar-documento.
--
-- Contexto (pedido de JP, 2026-07-22): "uma ferramenta de controle de prompt
-- e do formato do json do output" — hoje PROMPT_EXTRACAO_LANCAMENTO e
-- GEMINI_RESPONSE_SCHEMA são hardcoded em
-- supabase/functions/classificar-documento/logica.ts. Esta migration move os
-- dois valores pra uma tabela editável, com o EXATO conteúdo hoje hardcoded
-- como seed — troca de fonte sem mudar comportamento até alguém editar pela
-- tela nova (ConfiguracaoExtracaoIaPage.tsx).
--
-- Por que GLOBAL, não por fazenda (diferente de fazendas.llm_provider/
-- llm_model): decisão de JP — é a mesma extração/schema pra todo o sistema,
-- só o modelo/provedor varia por fazenda. Edição restrita a admin do
-- software (public.is_admin_software(), migration 20260722110000) — mesma
-- fronteira agora usada pra Modelo de IA (migration 20260722120000).
--
-- Singleton: `id boolean primary key default true check (id)` — só existe
-- UM valor possível de chave primária (true), então só pode existir 1 linha.
-- Sem policy de INSERT/DELETE — a única linha nasce nesta migration (seed
-- abaixo) e nunca é recriada nem apagada, só corrigida via UPDATE.
--
-- RLS de SELECT liberada a todo `authenticated`, sem checar papel/fazenda:
-- todo usuário precisa ler esta config pra sua PRÓPRIA chamada de extração
-- funcionar (Edge Function usa o client "do usuário", ver
-- classificar-documento/index.ts) — não há dado de fazenda ou sensível aqui,
-- é config compartilhada por design, mesmo raciocínio de "sem risco de
-- vazamento cross-fazenda porque não é dado de fazenda" já usado para outras
-- tabelas verdadeiramente globais do projeto.
-- ============================================================================

create table public.configuracao_extracao_lancamentos (
  id              boolean primary key default true
                  constraint configuracao_extracao_lancamentos_singleton check (id),
  prompt_extracao text not null,
  schema_json     jsonb not null,
  updated_at      timestamptz not null default now()
);

comment on table public.configuracao_extracao_lancamentos is
  'Config GLOBAL (sem fazenda_id, singleton — no máximo 1 linha) do prompt de '
  'extração e do schema JSON de saída usados por classificar-documento '
  '(Módulo Financeiro, item 18). Editável só por admin do software '
  '(public.is_admin_software()) — tela /app/configuracoes/extracao-ia. '
  'SELECT liberado a todo authenticated (todo usuário precisa ler pra sua '
  'própria extração funcionar). Sem policy de INSERT/DELETE — linha única '
  'nasce nesta migration, corrigida só via UPDATE.';

comment on column public.configuracao_extracao_lancamentos.prompt_extracao is
  'Texto do prompt enviado ao provedor de IA junto com o documento (imagem/ '
  'PDF) — pede os 7 campos de lancamentos_financeiros, valor default (seed '
  'desta migration) é o mesmo hoje hardcoded em '
  'classificar-documento/logica.ts (PROMPT_EXTRACAO_LANCAMENTO).';

comment on column public.configuracao_extracao_lancamentos.schema_json is
  'JSON Schema do formato de saída pedido ao provedor (response_format da '
  'Interactions API do Gemini) — valor default (seed desta migration) é o '
  'mesmo hoje hardcoded em classificar-documento/logica.ts '
  '(GEMINI_RESPONSE_SCHEMA). Editável como JSON livre — se um admin remover/ '
  'renomear um campo, extrairCamposDaResposta() (logica.ts) simplesmente '
  'devolve null pra esse campo específico (mesmo comportamento já usado hoje '
  'pra "IA não confiante"), nunca quebra a function.';

create trigger set_updated_at
  before update on public.configuracao_extracao_lancamentos
  for each row
  execute function public.trigger_set_updated_at();

alter table public.configuracao_extracao_lancamentos enable row level security;

create policy configuracao_extracao_lancamentos_select_authenticated
  on public.configuracao_extracao_lancamentos
  for select
  to authenticated
  using (true);

create policy configuracao_extracao_lancamentos_update_admin_software
  on public.configuracao_extracao_lancamentos
  for update
  to authenticated
  using (public.is_admin_software())
  with check (public.is_admin_software());

-- ----------------------------------------------------------------------------
-- Seed — conteúdo EXATO hoje hardcoded em
-- classificar-documento/logica.ts (PROMPT_EXTRACAO_LANCAMENTO/
-- GEMINI_RESPONSE_SCHEMA) — troca de fonte sem mudar comportamento.
-- ----------------------------------------------------------------------------
insert into public.configuracao_extracao_lancamentos (id, prompt_extracao, schema_json)
values (
  true,
  $prompt$Você está lendo um documento financeiro de uma fazenda (nota fiscal, boleto, recibo ou comprovante). Extraia os dados para preencher um lançamento financeiro e devolva APENAS o JSON pedido pelo schema, sem texto adicional.

Campos:
- tipo: "receita" se o documento representa dinheiro entrando (venda, recebimento), "despesa" se representa dinheiro saindo (compra, pagamento a fornecedor). Na dúvida, use "despesa" (caso mais comum para notas de insumos/serviços).
- categoria: categoria curta do gasto/receita (ex.: "Insumos", "Combustível", "Manutenção", "Mão de obra", "Impostos", "Venda de produção"). Se não conseguir identificar, retorne null.
- descricao: descrição curta do que foi comprado/vendido/pago. Se não conseguir identificar, retorne null.
- data_lancamento: data do documento no formato YYYY-MM-DD. Se não conseguir identificar com confiança, retorne null.
- valor: valor total do documento, número puro (sem símbolo de moeda, sem separador de milhar — ex.: 1500.50). Se não conseguir identificar, retorne null.
- numero_nota: número da nota/documento, se houver. Se não houver ou não conseguir ler, retorne null.
- contraparte: nome do fornecedor (se despesa) ou cliente (se receita). Se não conseguir identificar, retorne null.

Nunca invente um valor em que não tenha confiança — prefira retornar null, o usuário vai revisar e completar manualmente.$prompt$,
  '{
    "type": "object",
    "properties": {
      "tipo": { "type": "string", "enum": ["receita", "despesa"] },
      "categoria": { "type": "string", "nullable": true },
      "descricao": { "type": "string", "nullable": true },
      "data_lancamento": { "type": "string", "nullable": true },
      "valor": { "type": "number", "nullable": true },
      "numero_nota": { "type": "string", "nullable": true },
      "contraparte": { "type": "string", "nullable": true }
    },
    "required": ["tipo"]
  }'::jsonb
);
