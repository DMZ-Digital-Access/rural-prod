# CONTEXTO DO PROJETO — Livestock Control

> Memória viva do squad. Regra completa de leitura/escrita em `.agents/rules/memory-protocol.md`.
> A especificação funcional completa está em `especificacao-sistema.md` (raiz do projeto) —
> este arquivo não repete o conteúdo dela, guarda o que já foi decidido/feito ao longo do
> desenvolvimento e o que ainda está em aberto.

---

## 1. Estado Atual do Projeto

- **Nome:** Livestock Control — Gestão Agropecuária (Rebanho + Compliance + Financeiro)
- **Fase:** Fase 0 (Setup do projeto) — em andamento. Feito: repositório Git (GitHub,
  `DMZ-Digital-Access/rural-prod`, branch `main`), scaffold React+TS+Vite com Tailwind v4 +
  shadcn/ui, libs da stack instaladas (router, react-query, react-hook-form+zod, supabase-js,
  sonner, lucide-react, recharts), CI básico (GitHub Actions: lint+build). Pendente: linkar o
  projeto Supabase via CLI (ver Bloqueios, seção 4) e estruturar convenções adicionais do
  repositório (padrão de commits formal, se necessário).
- **Repositório:** criado — `https://github.com/DMZ-Digital-Access/rural-prod` (branch `main`)
- **Stack confirmada:** React 18 + TypeScript + Vite, Tailwind + shadcn/ui, react-hook-form +
  zod, @tanstack/react-query, Supabase (Postgres + Auth + Storage), sonner, recharts
  (roadmap). Hospedagem: Vercel/Netlify (frontend) + Supabase (backend gerenciado).
- **Última entrega:** nenhuma ainda
- **Em andamento agora:** nada em código ainda — todas as 5 pendências de modelagem que bloqueavam o início da Fase 0/3 foram resolvidas com JP em 2026-07-16; próximo passo real é iniciar a Fase 0 (criar repositório, inicializar projeto, criar Supabase novo)
- **Última atualização:** 2026-07-16 — pendências de modelagem resolvidas (ver seção 2); escopo da Fase 3/4 cresceu por causa da Opção B de reconciliação (não é mais roadmap, é entrega inicial)

---

## 2. Decisões Importantes

> Decisões já tomadas na própria especificação (não precisam ser revalidadas) + decisões
> novas tomadas durante o desenvolvimento.

| Data | Decisão | Origem/Responsável | Detalhe |
|---|---|---|---|
| spec v2.0 | Código do protótipo Bolt.new **não será reaproveitado** — projeto novo do zero | Cliente/spec | Seção "Decisão de projeto importante", topo da spec |
| 2026-07-16 | Reconciliação Eixo 1 ↔ Eixo 2: **Opção B (vinculada)** confirmada por JP — não é mais roadmap | JP | Nova tabela `transacoes_animais` (N:N transação↔animal) entra na Fase 3, não na Fase 6; trigger/lógica atualiza `animais.status` automaticamente ao vincular venda; `architect` formaliza ADR na Fase 3. Ver spec seção 3.3 atualizada |
| spec v2.0 | Saldo de rebanho: começar com **view calculada on-the-fly**; migrar para saldo materializado só se houver problema real de performance | Spec, seção 7 e item 8 da seção 9 | `architect` + `db_sage` revisitam se performance virar problema |
| spec v2.0 | Prazo de Declaração Anual: **RS, 01/abril–30/junho** como padrão/fallback, configurável por estado/ano em `prazos_declaracao_estado`, nunca hardcoded | Spec, seções 3.2, 4.2, item 10 da seção 9 | — |
| spec v2.0 | Provisionamento de conta no signup via **trigger de banco ou Edge Function com service_role**, nunca insert client-side | Spec, item 1 da seção 9 | Maior risco identificado no protótipo — resolver corretamente desde a Fase 1 |
| spec v2.0 | GMD = `(peso_atual - peso_inicial) / dias_totais` (não a média simples acumulada do protótipo) | Spec, item 2 da seção 9 | `qa` prioriza teste automatizado disso |
| spec v2.0 | Modelo de dados já nasce com `usuarios_fazendas` (usuario_id, fazenda_id, papel), mesmo a 1ª entrega só usando papel "dono" | Spec, seção 5.4, item 6 da seção 9 | Papel "Financeiro/Contábil" (consulta restrita) é Fase 6 |
| spec v2.0 | Declarações anuais (PDF) nunca apagáveis pelo usuário — no máximo substituíveis com histórico | Spec, item 9 da seção 9 | `cyber_chief` valida na RLS de storage |
| 2026-07-16 | Squad enxuto de 15 agentes definido para este projeto (a partir dos 112 da biblioteca base) | Claude (a pedido de JP) | Ver roster completo em `.agents/rules/multi-agent-workflow.md` seção 4 |
| 2026-07-16 | Squad reduzido de 15 para **13 agentes**: removidos `squad_manager` (Syd) e `tools_orchestrator` (Quantum) | JP + Claude, após revisão crítica do squad | Saúde do squad virou checklist do Root Orchestrator a cada fase; MCPs (Supabase/GitHub) absorvidos pelo `devops` (Oliver). Ambos disponíveis na biblioteca base via `scripts/sync_agents.py --add` se necessário depois |
| 2026-07-16 | Validação de saldo de rebanho (fim da Fase 3) virou **gate nomeado com sign-off explícito do usuário**, não aprovação técnica de rotina da Emma | JP + Claude | Ver `.agents/rules/multi-agent-workflow.md` seção "🔒 Checkpoint de Validação de Saldo" |
| 2026-07-16 | Burro e Jumento: **subtipo único** de Muares (sinônimos regionais, sem distinção prática de manejo) | JP | Seed de `subtipos_especie` — spec seção 3.2 atualizada |
| 2026-07-16 | Unidade de idade de Aves: **semanas** (`unidade_idade` configurável por espécie), mas faixas confirmadas valem **só para o subtipo Frango de Corte** | JP | Matriz/Poedeira/Peru/Codorna/Avestruz seguem sem faixa definida (ciclo de vida >1 ano, incompatível com as faixas do Frango de Corte) |
| 2026-07-16 | Faixas etárias completas para Caprino (meses: 0-6/7-12/13-24/24+), Suíno (dias: 0-30/30-70/70-150/180+), Muar (meses: 0-12/13-24/25-36/36+), Aves-Frango de Corte (semanas: 0-1/1-6/6-8/8+) | JP | Suíno: "acima de 6 meses" convertido para 180 dias para manter unidade única da espécie. Spec seção 3.2 atualizada com seed completo |
| 2026-07-16 | Supabase: **projeto novo** (não reaproveita o do protótipo Bolt.new) | JP | Resolve item 2 da Fase 0, seção 10 da spec |

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

As 5 pendências que travavam o início da Fase 0/3 foram **todas resolvidas por JP em
2026-07-16** — ver seção 2 (Decisões) e o log
`.agents/memory/log/2026-07-16-orchestrator-resolucao-pendencias.md`. Nenhum bloqueio aberto
no momento; próximo passo é iniciar a Fase 0.

Pendência residual (não bloqueante, não fazia parte das 5 originais): faixa etária dos
subtipos de Aves além de Frango de Corte (Matriz, Poedeira, Peru, Codorna, Avestruz) — segue
sem padrão definido, seguir o mesmo tratamento estrutural (sem seed até validação).

**Novo bloqueio (2026-07-16):** o projeto Supabase do produto (`bsoofshttpboaaokejwt`, ver
`.env`) foi criado por JP na conta **Dmz Labs 06** — diferente da conta "DMZ Devops 01" com a
qual a Supabase CLI local está autenticada (essa só enxerga `oddra-dev` e um `rural-prod`
distinto, ref `salvrbdjyxontsjpfjyp`, que **não é** o projeto do produto). Para rodar
`supabase link`/migrations via CLI sem alterar o login global (usado por outros projetos),
falta um **Personal Access Token da conta Dmz Labs 06** (gerado em
supabase.com/dashboard/account/tokens), a ser adicionado em `.env` como
`SUPABASE_ACCESS_TOKEN`. Bloqueia: linkar o schema local ao projeto remoto (Fase 0/3).

---

## 5. Histórico de Tarefas Complexas (mais recente primeiro)

### 2026-07-16 — Fase 0: repositório + scaffold do projeto — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** criado o repositório Git novo (`DMZ-Digital-Access/rural-prod`,
  branch `main`) e feito o primeiro push; scaffold do projeto React 18 + TypeScript + Vite
  (template react-ts), Tailwind CSS v4 + shadcn/ui inicializado, path alias `@/*`, todas as
  libs da stack instaladas (react-router-dom, @tanstack/react-query, react-hook-form + zod,
  @supabase/supabase-js, sonner, lucide-react, recharts). Cliente Supabase básico em
  `src/lib/supabase.ts`, `.env.example` como convenção, CI básico (GitHub Actions: lint +
  build) em `.github/workflows/ci.yml`. Build e lint validados localmente (`npm run build`,
  `npm run lint`) antes do commit.
- **Decisões:** nenhuma nova (execução do que já estava decidido na spec, seção 10, Fase 0).
- **Bloqueio encontrado:** projeto Supabase do produto está em conta diferente da que a CLI
  local usa — ver seção 4 (Bloqueios), novo item.
- **Mudanças de arquivo:** scaffold completo do app na raiz do repo (ver commit
  `ee7e657`); `.env` ganhou `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (duplicando as
  versões sem prefixo, necessárias para o client Vite expor a variável ao browser).
- **Pendências:** obter `SUPABASE_ACCESS_TOKEN` da conta Dmz Labs 06 para linkar o projeto.
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-fase0-scaffold.md`

### 2026-07-16 — Resolução das 5 pendências de modelagem — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** JP respondeu diretamente às 5 pendências da seção 4 (bloqueio de
  Fase 0/3). A mais relevante: reconciliação Eixo 1 ↔ Eixo 2 mudou de Opção A (recomendação
  da spec) para **Opção B** — vínculo automático entre transação e animais individuais desde
  a primeira entrega, não mais roadmap (item 28 da Fase 6 removido, absorvido pela Fase 3/4).
  Também confirmadas: Muares como subtipo único, faixas etárias completas de Caprino/Suíno/
  Muar/Aves-Frango de Corte, e Supabase novo.
- **Decisões:** ver seção 2 (cinco linhas de 2026-07-16).
- **Mudanças de arquivo:** `especificacao-sistema.md` atualizada (seções 3.2, 3.3, 9, 10);
  `PROJECT_CONTEXT.md` (esta seção + seções 1, 2, 4); `multi-agent-workflow.md` (seções 5, 6).
- **Pendências:** nenhuma das 5 originais. Resta apenas a faixa etária dos demais subtipos de
  Aves (não bloqueante, ver seção 4).
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-resolucao-pendencias.md`

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
