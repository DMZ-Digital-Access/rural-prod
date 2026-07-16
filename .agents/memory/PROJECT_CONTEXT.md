# CONTEXTO DO PROJETO — Livestock Control

> Memória viva do squad. Regra completa de leitura/escrita em `.agents/rules/memory-protocol.md`.
> A especificação funcional completa está em `especificacao-sistema.md` (raiz do projeto) —
> este arquivo não repete o conteúdo dela, guarda o que já foi decidido/feito ao longo do
> desenvolvimento e o que ainda está em aberto.

---

## 1. Estado Atual do Projeto

- **Nome:** Livestock Control — Gestão Agropecuária (Rebanho + Compliance + Financeiro)
- **Fase:** Fase 0 (Setup do projeto) — ainda não iniciada
- **Repositório:** ainda não criado (projeto novo, greenfield — ver seção 10 da spec)
- **Stack confirmada:** React 18 + TypeScript + Vite, Tailwind + shadcn/ui, react-hook-form +
  zod, @tanstack/react-query, Supabase (Postgres + Auth + Storage), sonner, recharts
  (roadmap). Hospedagem: Vercel/Netlify (frontend) + Supabase (backend gerenciado).
- **Última entrega:** nenhuma ainda
- **Em andamento agora:** nada — squad acabou de ser montado, aguardando início da Fase 0
- **Última atualização:** 2026-07-16 — squad ajustado para 13 agentes (removidos Syd e Quantum) após revisão crítica

---

## 2. Decisões Importantes

> Decisões já tomadas na própria especificação (não precisam ser revalidadas) + decisões
> novas tomadas durante o desenvolvimento.

| Data | Decisão | Origem/Responsável | Detalhe |
|---|---|---|---|
| spec v2.0 | Código do protótipo Bolt.new **não será reaproveitado** — projeto novo do zero | Cliente/spec | Seção "Decisão de projeto importante", topo da spec |
| spec v2.0 | Reconciliação Eixo 1 ↔ Eixo 2: **Opção A (desacoplada)** para a primeira entrega | Spec, seção 3.3 | Vínculo automático (Opção B) fica para o roadmap (item 28, Fase 6) — **ainda precisa confirmação final do cliente antes da Fase 3**, ver Bloqueios |
| spec v2.0 | Saldo de rebanho: começar com **view calculada on-the-fly**; migrar para saldo materializado só se houver problema real de performance | Spec, seção 7 e item 8 da seção 9 | `architect` + `db_sage` revisitam se performance virar problema |
| spec v2.0 | Prazo de Declaração Anual: **RS, 01/abril–30/junho** como padrão/fallback, configurável por estado/ano em `prazos_declaracao_estado`, nunca hardcoded | Spec, seções 3.2, 4.2, item 10 da seção 9 | — |
| spec v2.0 | Provisionamento de conta no signup via **trigger de banco ou Edge Function com service_role**, nunca insert client-side | Spec, item 1 da seção 9 | Maior risco identificado no protótipo — resolver corretamente desde a Fase 1 |
| spec v2.0 | GMD = `(peso_atual - peso_inicial) / dias_totais` (não a média simples acumulada do protótipo) | Spec, item 2 da seção 9 | `qa` prioriza teste automatizado disso |
| spec v2.0 | Modelo de dados já nasce com `usuarios_fazendas` (usuario_id, fazenda_id, papel), mesmo a 1ª entrega só usando papel "dono" | Spec, seção 5.4, item 6 da seção 9 | Papel "Financeiro/Contábil" (consulta restrita) é Fase 6 |
| spec v2.0 | Declarações anuais (PDF) nunca apagáveis pelo usuário — no máximo substituíveis com histórico | Spec, item 9 da seção 9 | `cyber_chief` valida na RLS de storage |
| 2026-07-16 | Squad enxuto de 15 agentes definido para este projeto (a partir dos 112 da biblioteca base) | Claude (a pedido de JP) | Ver roster completo em `.agents/rules/multi-agent-workflow.md` seção 4 |
| 2026-07-16 | Squad reduzido de 15 para **13 agentes**: removidos `squad_manager` (Syd) e `tools_orchestrator` (Quantum) | JP + Claude, após revisão crítica do squad | Saúde do squad virou checklist do Root Orchestrator a cada fase; MCPs (Supabase/GitHub) absorvidos pelo `devops` (Oliver). Ambos disponíveis na biblioteca base via `scripts/sync_agents.py --add` se necessário depois |
| 2026-07-16 | Validação de saldo de rebanho (fim da Fase 3) virou **gate nomeado com sign-off explícito do usuário**, não aprovação técnica de rotina da Emma | JP + Claude | Ver `.agents/rules/multi-agent-workflow.md` seção "🔒 Checkpoint de Validação de Saldo" |

---

## 3. Glossário do Domínio

- **Eixo 1** — gestão individual de rebanho bovino já validada (peso, GMD, lotes de manejo).
- **Eixo 2** — novo escopo: saldo de rebanho por espécie, GTA, transações, financeiro,
  declaração anual. Trabalha em granularidade de lote/lançamento, não animal individual.
- **GTA (Guia de Trânsito Animal)** — documento oficial que autoriza/registra a movimentação
  de animais entre propriedades. Pode ou não estar vinculada a uma transação do sistema.
- **Saldo de Rebanho** — quantidade de animais por espécie/agrupamento etário/sexo,
  **sempre derivado** das transações (nunca digitado manualmente). Tem "Qtd. Registrada"
  (confirmado) e "Qtd. Pendente" (aguardando, ex. GTA não liberada).
  Exceção: **Abelhas** — saldo por unidade de colônia (colmeia/caixa), sem sexo/faixa etária.
- **Agrupamento Etário** — faixa de idade usada no saldo (Eixo 2), **diferente** da
  categoria zootécnica do animal individual (Eixo 1) — são dois sistemas paralelos e
  intencionalmente independentes (ver spec seção 3.2, "não confundir").
- **Declaração Anual de Rebanho** — prestação de contas formal à Secretaria Estadual de
  Agricultura, por espécie/ano, com prazo regulatório configurável.
- **Fazenda** — unidade de propriedade rural no sistema; um usuário pode ter mais de uma.

---

## 4. Bloqueios e Pendências Abertas

> Pontos que a própria spec marca como "validar com o cliente antes de implementar"
> (ver `.agents/rules/multi-agent-workflow.md` seção 6). Remover a linha assim que o usuário
> confirmar.

| Pendência | Bloqueia | Quem pergunta |
|---|---|---|
| Unidade de idade para Aves (dias/semanas/meses, não só meses) | Modelagem de `agrupamentos_etarios` para Aves — Fase 3 | `clara` / `architect` |
| Burro e Jumento: subtipo único ou separado? | Seed de `subtipos_especie` (Muares) — Fase 3 | `clara` |
| Confirmação final da Opção A (reconciliação Eixo 1/Eixo 2 desacoplada) | Início da Fase 3 | `architect` |
| Supabase: projeto novo ou reaproveitar o existente do protótipo? | Fase 0, item 2 | `devops` / `tools_orchestrator` |
| Faixas etárias de Caprino, Suíno, Muar e subtipos de Aves (ainda sem padrão definido) | Seed completo de `agrupamentos_etarios` — pode ser parcial na Fase 3 sem bloquear | `clara` |

---

## 5. Histórico de Tarefas Complexas (mais recente primeiro)

### 2026-07-16 — Revisão crítica do squad: 15 → 13 agentes + gate de saldo — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** JP pediu uma avaliação honesta de "essa é a equipe ideal?". Reanálise
  identificou dois agentes sem responsabilidade exclusiva (`squad_manager`, `tools_orchestrator`)
  e um risco de processo (validação de saldo tratada como aprovação técnica de rotina em vez
  de gate de alta consequência).
- **Decisões:** ver seção 2 (duas linhas de 2026-07-16 mais recentes).
- **Mudanças de arquivo:** removidos `squad_manager.md` e `tools_orchestrator.md` de
  `.agents/agents/`; `scripts/sync_agents.py` e `rules/multi-agent-workflow.md` atualizados
  (roster, seções 1/3/4/5, novo gate "🔒 Checkpoint de Validação de Saldo"); `AGENTS.md`
  atualizado para 13 agentes.
- **Pendências:** nenhuma nova — as pendências da seção 4 continuam as mesmas.
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-revisao-squad.md`

### 2026-07-16 — Squad montado para o projeto — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** Lida a especificação completa (`especificacao-sistema.md`), definida
  uma equipe enxuta de 15 agentes (a partir dos 112 da biblioteca base) e instalado o bundle
  `.agents/` completo neste projeto: agentes, regras de orquestração mapeadas às 6 fases da
  spec, protocolo de memória e este documento de contexto.
- **Decisões:** ver seção 2 (linha 2026-07-16) e roster completo em
  `.agents/rules/multi-agent-workflow.md`.
- **Pendências:** ver seção 4 acima — nenhuma delas bloqueia o início da Fase 0, mas todas
  devem ser resolvidas antes das fases que dependem delas.
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-setup-squad.md`
