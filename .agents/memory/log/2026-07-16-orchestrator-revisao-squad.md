# Log — Revisão crítica do squad (15 → 13 agentes) + gate de validação de saldo

- **Data:** 2026-07-16
- **Agente responsável:** orchestrator (ORCH) — executado via Claude em sessão Cowork
- **Tipo de tarefa:** Ajuste estrutural do squad, a pedido de JP ("essa é a equipe ideal
  para o projeto?")

## Diagnóstico

Ao ser questionado sobre se o squad de 15 agentes era ideal, a reavaliação identificou:

1. **`squad_manager` (Syd)** — protocolo desenhado para dinâmica de squad humano (carga de
   trabalho persistente, conflito de pessoas, onboarding). Não mapeia bem para subagentes
   que nascem e terminam por tarefa. A função real que sobra — perceber sobrecarga ou
   ambiguidade de escopo entre agentes — cabe como checklist do Root Orchestrator ao fechar
   cada fase, sem precisar de um subagente dedicado.
2. **`tools_orchestrator` (Quantum)** — papel de integração/MCP redundante para um projeto
   com só 2 MCPs relevantes (Supabase, GitHub). `devops` (Oliver) já cobre infraestrutura;
   absorver a configuração de MCP nele evita um handoff desnecessário.
3. **Emma (QA) e o cálculo de saldo** — não é falta de headcount (um segundo QA seria
   desproporcional para o tamanho do projeto), é um problema de processo: a validação do
   saldo de rebanho (Fase 3, item 12 da seção 10 da spec) estava tratada com a mesma regra
   de aprovação de rotina do resto do fluxo ("Emma comenta status técnico, segue"). Dado que
   esse número é usado para prestação de contas ao Estado, o custo de um erro só aparece
   depois que o produtor já declarou o valor errado — isso justifica um gate mais formal,
   não mais gente.

## Decisão

JP concordou com a recomendação (remover Syd e Quantum, manter Emma como está e formalizar
o gate de saldo).

## O que foi alterado

- `.agents/agents/squad_manager.md` e `.agents/agents/tools_orchestrator.md` — removidos
  (permissão de delete solicitada via `allow_cowork_file_delete`, pasta é sincronizada via
  Dropbox e bloqueia `rm` direto por padrão).
- `scripts/sync_agents.py` — `PROJECT_TEAM` atualizado para 13 handles, com comentário
  explicando a remoção e como trazer os dois de volta se o projeto crescer
  (`--add squad_manager` / `--add tools_orchestrator`).
- `.agents/rules/multi-agent-workflow.md`:
  - Seção 1: Root Agent agora explicitamente absorve o checkpoint de saúde do squad.
  - Seção 3: Oliver (não mais Quantum) é quem configura os MCPs do projeto.
  - Seção 4: tabela de roster atualizada para 13 agentes, com nota da remoção.
  - Seção 5: fluxo da Fase 3 agora aponta para o novo gate antes de liberar a Fase 4.
  - Nova seção "🔒 Checkpoint de Validação de Saldo": exige que Emma reproduza os números
    dos prints de referência da spec e que o Root Agent apresente a comparação ao usuário
    explicitamente antes de avançar — distinto da aprovação técnica de rotina.
- `.agents/AGENTS.md` — contagem atualizada de 15 para 13 agentes.
- `.agents/memory/PROJECT_CONTEXT.md` — decisões registradas na seção 2, estado atualizado
  na seção 1, esta entrada na seção 5.

## Pendências

Nenhuma nova. As pendências já listadas na seção 4 de `PROJECT_CONTEXT.md` continuam sendo
o que trava o início da Fase 0.
