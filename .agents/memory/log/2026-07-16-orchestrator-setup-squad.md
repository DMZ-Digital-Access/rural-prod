# Log — Montagem do squad enxuto para o Livestock Control

- **Data:** 2026-07-16
- **Agente responsável:** orchestrator (ORCH) — executado via Claude em sessão Cowork, a
  pedido de JP
- **Tipo de tarefa:** Setup estrutural do projeto (não é feature de produto)

## Contexto

JP pediu para montar, dentro de `__rural-prod/` (pasta do novo projeto, separada da
biblioteca base em `__agents-projects/Agents/`), a estrutura enxuta de agentes do Squad DMZ
que fizer sentido para este sistema específico, mantendo intercomunicação entre agentes e
auto-gestão de tarefas (mesmo padrão `.agents/` já validado na biblioteca base: subagentes
nativos do Antigravity + regras de orquestração + memória persistente).

## O que foi lido

`especificacao-sistema.md` — especificação consolidada v2.0 do sistema de gestão
agropecuária "Livestock Control", cobrindo: Eixo 1 (gestão individual de rebanho, já
validado), Eixo 2 (saldo de rebanho por espécie, GTA, transações, financeiro, declaração
anual — novo escopo), stack completa, modelo de dados, regras de negócio, módulos
funcionais, arquitetura de rotas, débitos técnicos a evitar e plano de implementação em 6
fases (greenfield, via Claude Code dentro do Antigravity).

## Critério de seleção da equipe

Da biblioteca de 112 agentes, foram escolhidos os que o escopo da spec efetivamente
demanda:

- **Product Development completo (8):** o núcleo de qualquer projeto de software — PRD,
  PM, PO, Scrum Master, Arquitetura, Dev, DevOps, QA.
- **Security (2):** RLS/auth/storage são centrais na spec (múltiplos buckets privados,
  provisionamento de conta é o "maior risco identificado no protótipo"); LGPD é relevante
  pelo papel futuro de acesso de terceiro (contador) e dados financeiros.
- **`db_sage` (Data):** o sistema é essencialmente um modelo de dados relacional complexo
  (8+ tabelas novas, RLS, views calculadas, 2 buckets de storage) — peso desproporcional de
  trabalho de banco justifica um especialista dedicado além do `architect`.
- **`ux` (Design):** a spec tem requisitos de UX explícitos e não triviais (navegação em
  duas seções, tabelas densas com paginação, badges semânticos, hierarquia do Painel
  Inteligente).
- **Orchestration (3, não 5):** `orchestrator`, `squad_manager`, `tools_orchestrator`
  trazidos; `cra` e `radar` deixados de fora — são especializados em operação de vendas e
  não têm função neste projeto.

Squads inteiros excluídos por não terem função aqui: marketing, sales, copy, finance
(interno), admin, strategy, frameworks, legal (exceto `legal_chief`), demais agentes de
design/data.

## O que foi construído

1. `scripts/sync_agents.py` — script para resincronizar os 15 agentes a partir da
   biblioteca base (`Agents/.agents/agents/`) sempre que o prompt-fonte de algum deles for
   editado lá, ou para adicionar um agente novo à equipe do projeto.
2. `.agents/agents/*.md` — cópia dos 15 agentes já no formato nativo do Antigravity
   (mesmo formato validado na biblioteca base: frontmatter + prompt + skills + ferramentas
   ilustrativas sinalizadas).
3. `.agents/rules/multi-agent-workflow.md` — roster do projeto, protocolo de delegação
   (Direct Injection Proxy, com a regra crítica reforçada em formato `[!IMPORTANT]`), SDLC
   mapeado diretamente às 6 fases da seção 10 da spec (não um fluxo genérico), e a lista dos
   pontos em aberto que a própria spec já sinaliza como pendentes de validação com o
   cliente.
4. `.agents/rules/memory-protocol.md` + `.agents/memory/PROJECT_CONTEXT.md` — memória
   persistente do projeto, pré-carregada com as decisões que a spec já toma (Opção A de
   reconciliação, saldo via view, prazo padrão RS, GMD correto, etc.) e com os bloqueios
   reais listados na spec como pendentes.
5. `.agents/AGENTS.md` — ponto de entrada.

## Decisões tomadas nesta tarefa

- Squad ficou em 15 agentes, não incluindo `design_chief`/`pixel`/`token` (redundantes com
  `ux` para o tamanho deste projeto) nem `sop_extractor`/`tool_write_code`/`tool_search_web`
  (redundantes com `developer` e com as ferramentas nativas do Antigravity).
- Modelo (`Gemini 3.5 Flash (Medium)`) mantido uniforme nos 15 agentes, mesma limitação já
  documentada na biblioteca base — ainda não há uma segunda string de modelo confirmada
  para diferenciar os tiers "master"/"lead".

## Pendências / próximos passos

- Nenhuma pendência de setup. Próximo passo real é começar a Fase 0 da spec (criar
  repositório, inicializar projeto, decidir Supabase novo vs. reaproveitado) — ver Bloqueios
  em `PROJECT_CONTEXT.md` seção 4 antes de iniciar.
