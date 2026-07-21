-- ============================================================================
-- Migration: fazendas.llm_provider/llm_model — ambiente para o papel admin
--            escolher qual LLM (Anthropic/OpenAI/Gemini) o sistema usa na
--            classificação assistida por IA de lançamentos financeiros
--            (Módulo Financeiro, item 18, ver especificacao-sistema.md
--            seção 12).
--
-- Pedido de JP: "vamos criar um ambiente para os admin da conta, para
-- escolherem a LLM usada no sistema". Decisão confirmada com JP: a chave de
-- API de cada provedor é NOSSA (compartilhada, configurada no backend/Edge
-- Function) — o admin só escolhe QUAL provedor/modelo usar dentre os que já
-- temos configurados, não cadastra credencial própria (BYOK ficou
-- descartado). Por isso não há tabela de credenciais nova aqui — só a
-- preferência de provedor/modelo por fazenda.
--
-- `llm_model` é texto livre (mesma decisão já usada em
-- lancamentos_financeiros.categoria, item 13) — o catálogo de modelos
-- válidos por provedor muda com frequência demais para travar em CHECK; a
-- validação de que o modelo escolhido pertence ao provedor escolhido fica
-- no frontend (Select dependente).
--
-- SEGURANÇA — achado real ao revisar a policy existente antes de escrever
-- esta migration: `fazendas_update_vinculada` (item 6/Fase 1) autoriza
-- UPDATE de QUALQUER papel vinculado (admin/membro/financeiro), sem
-- restrição de papel — hoje isso só afeta `nome` (único campo antes
-- editável). Sem uma guarda dedicada, `membro` e até `financeiro`
-- poderiam alterar a configuração de IA da fazenda, contradizendo o pedido
-- explícito de JP ("ambiente para os admin"). Corrigido com um trigger
-- BEFORE UPDATE OF (só dispara quando o UPDATE do client lista
-- llm_provider/llm_model no SET, mesmo comportamento column-scoped já
-- validado empiricamente nesta sessão) que exige papel = 'admin' —
-- defesa em profundidade sem reescrever a policy de RLS existente (que
-- continua servindo `nome`, fora do escopo desta tarefa).
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- ============================================================================

alter table public.fazendas
  add column llm_provider text not null default 'anthropic'
    constraint fazendas_llm_provider_check
    check (llm_provider in ('anthropic', 'openai', 'gemini')),
  add column llm_model text not null default 'claude-haiku-4-5';

comment on column public.fazendas.llm_provider is
  'Provedor de LLM escolhido pelo admin para a classificação assistida por '
  'IA de lançamentos financeiros (pedido de JP, 2026-07-21, fora da spec '
  'original). Chave de API é compartilhada/nossa, não BYOK — o admin só '
  'escolhe entre o que já está configurado no backend.';

comment on column public.fazendas.llm_model is
  'Modelo específico do provedor escolhido (texto livre — catálogo validado '
  'no frontend, mesma decisão de lancamentos_financeiros.categoria).';

create or replace function public.restringir_alteracao_config_llm()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_papel text;
begin
  select papel
    into v_papel
    from public.usuarios_fazendas
   where usuario_id = auth.uid()
     and fazenda_id = old.id;

  if v_papel is distinct from 'admin' then
    raise exception 'apenas o papel admin pode alterar a configuração de IA da fazenda';
  end if;

  return new;
end;
$$;

comment on function public.restringir_alteracao_config_llm() is
  'Defesa em profundidade sobre fazendas_update_vinculada (Fase 1, item 6),
  que autoriza UPDATE de qualquer papel vinculado sem distinção — sem esta
  guarda, membro/financeiro poderiam mudar a configuração de IA da fazenda,
  contrariando o pedido de JP ("ambiente para os admin"). BEFORE UPDATE OF
  só dispara quando o UPDATE do client lista llm_provider/llm_model no SET
  (comportamento column-scoped, validado empiricamente nesta sessão —
  ver migration 20260721010000).';

create trigger restringir_alteracao_config_llm
  before update of llm_provider, llm_model on public.fazendas
  for each row
  execute function public.restringir_alteracao_config_llm();
