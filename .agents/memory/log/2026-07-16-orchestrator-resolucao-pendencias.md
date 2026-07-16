# Log — Resolução das 5 pendências de modelagem (bloqueio de Fase 0/3)

- **Data:** 2026-07-16
- **Agente responsável:** orchestrator (ORCH) — executado via Claude em sessão Cowork
- **Tipo de tarefa:** Decisões de arquitetura/modelagem que a spec marcava como "validar com
  o cliente antes de implementar" (seção 4 de `PROJECT_CONTEXT.md`, seção 6 de
  `multi-agent-workflow.md`)

## Contexto

JP respondeu diretamente às 5 pendências listadas. Antes de gravar as respostas na memória,
duas delas foram reconfirmadas com JP via pergunta objetiva, por terem consequência de
schema e não estarem 100% inequívocas na resposta original:

1. A resposta ao item de reconciliação Eixo 1 ↔ Eixo 2 veio como comentário sobre *ordem* de
   implementação, não sobre *qual opção* (A ou B) adotar — perguntado diretamente, JP
   escolheu **Opção B**.
2. As faixas etárias de Aves fornecidas (0-1/1-6/6-8/8+ semanas) batem com o ciclo de um
   Frango de Corte (~45 dias), mas a spec também prevê subtipos de Aves com ciclo de vida de
   mais de 1 ano (Matriz, Poedeira, Peru, Codorna, Avestruz) — perguntado, JP confirmou que
   as faixas valem **só para Frango de Corte**.
3. Suínos vieram com 3 faixas em dias e a última em meses ("acima de 6 meses") — perguntado,
   JP confirmou a conversão para **180 dias**, mantendo unidade única na espécie.

## Decisões registradas

| # | Pendência original | Resposta |
|---|---|---|
| 1 | Unidade de idade para Aves | `unidade_idade` configurável (dias/semanas/meses); Aves usa **semanas**, mas só para o subtipo Frango de Corte |
| 2 | Burro vs. Jumento | **Subtipo único** de Muares (sinônimos regionais) |
| 3 | Reconciliação Eixo 1 ↔ Eixo 2 | **Opção B** (vinculada) — muda de roadmap (Fase 6) para escopo da Fase 3/4 |
| 4 | Supabase novo ou reaproveitado | **Projeto novo** |
| 5 | Faixas etárias de Caprino/Suíno/Muar/Aves | Seed completo — ver spec seção 3.2 |

A decisão de maior impacto é a **#3**: a spec recomendava a Opção A (desacoplada) para a
primeira entrega, com o vínculo automático como item de roadmap pós-lançamento (item 28,
Fase 6). Com a Opção B confirmada, esse trabalho entra na Fase 3 (nova tabela
`transacoes_animais`, N:N entre `transacoes` e `animais`) e na Fase 4 (UI de seleção de
animais individuais no cadastro de transação). Isso é escopo adicional em relação ao MVP
descrito originalmente na spec — vale monitorar impacto em cronograma quando `pm` (Jose)
planejar a Fase 3/4.

## O que foi alterado

- `especificacao-sistema.md`:
  - Seção 3.2 — Muares como subtipo único; `agrupamentos_etarios` com seed completo
    (Caprino, Suíno, Muar, Aves-Frango de Corte) e nota de conversão do Suíno (180 dias).
  - Seção 3.3 — reconciliação Eixo 1 ↔ Eixo 2 reescrita para refletir a Opção B, com o
    detalhamento de `transacoes_animais` e da lógica de atualização de status.
  - Seção 9, item 7 — marcado como resolvido (Opção B).
  - Seção 10 — Fase 0 item 2 (Supabase novo), Fase 3 itens 10/11 (seed completo +
    `transacoes_animais`), Fase 4 item 15 (UI de seleção de animais), Fase 6 (item 28
    removido, renumerado).
- `.agents/memory/PROJECT_CONTEXT.md` — seções 1 (estado), 2 (decisões, 5 linhas novas de
  2026-07-16), 4 (bloqueios zerados), 5 (esta entrada no topo do histórico).
- `.agents/rules/multi-agent-workflow.md` — seção 5 (Fase 3/4 com Opção B explícita), seção 6
  (pendências marcadas como resolvidas, pendência residual de Aves mantida).

## Pendências

Nenhuma das 5 originais. Resta uma pendência residual, não bloqueante: faixa etária dos
subtipos de Aves além de Frango de Corte — não trava a Fase 3, `clara` resolve quando for
modelar esses subtipos especificamente.

## Próximo passo real

Iniciar a Fase 0 (criar repositório Git novo do produto, inicializar projeto React/Vite,
criar o projeto Supabase novo, configurar CI/CD básico) — nada mais bloqueia.
