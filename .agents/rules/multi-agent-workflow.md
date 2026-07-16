---
trigger: always_on
---

# Livestock Control — Fluxo de Trabalho Multi-Agente

> Carregado automaticamente pelo Antigravity no início de toda sessão neste projeto
> (trigger: always_on). Este projeto usa uma equipe enxuta de 13 agentes, selecionada a
> partir da biblioteca completa do Squad DMZ (112 agentes) especificamente para o que a
> especificação em `especificacao-sistema.md` exige. Ver `.agents/AGENTS.md` para o ponto
> de entrada e `.agents/memory/PROJECT_CONTEXT.md` para o estado vivo do projeto.

## 0. O produto, em uma frase

Webapp de gestão agropecuária (Livestock Control): gestão individual de rebanho bovino
(peso/GMD/lotes, já validado) + um novo eixo de saldo de rebanho por espécie, GTA, compras
e vendas, financeiro e Declaração Anual à Secretaria de Agricultura (RS). Stack: React +
TypeScript + Vite + Tailwind/shadcn + Supabase (Postgres/Auth/Storage). Projeto novo, do
zero, sem reaproveitar código do protótipo Bolt.new. Ver `especificacao-sistema.md` na raiz
do projeto para a especificação funcional e de dados completa — este arquivo de regras não
repete o conteúdo dela, só organiza como o squad trabalha em cima dela.

## 1. Quem é o orquestrador

O **Root Agent da sessão (Mission Control) atua como Master Orchestrator** — não invoca um
subagente `orchestrator` separado para cada pedido. `.agents/agents/orchestrator.md` fica
disponível para quando você quiser um plano de orquestração isolado e auditável antes de
mexer em código (ex.: "gere o plano de execução da Fase 3 antes de tocar em banco").

O Root Agent também absorve a checagem de saúde do squad que, numa versão anterior deste
projeto, era papel de um agente `squad_manager` dedicado (removido em 2026-07-16 — ver
`memory/PROJECT_CONTEXT.md` seção 2). Ao fechar cada Fase da seção 5, o Root Agent deve
fazer um checkpoint rápido: algum agente ficou sobrecarregado ou com escopo ambíguo em
relação a outro (ex.: Alex vs. Sofia em decisão de schema)? Isso muda a equipe da próxima
fase? Não precisa de arquivo de log próprio — é uma checagem de 2 minutos, não uma tarefa
complexa.

## 2. Método de delegação — Direct Injection Proxy

> [!IMPORTANT]
> **REGRA CRÍTICA DE ORQUESTRAÇÃO — LEIA ANTES DE DELEGAR QUALQUER TAREFA:**
> Ao delegar para um subagente, você DEVE:
> 1. Ler o arquivo markdown exato do agente em `.agents/agents/<handle>.md`.
> 2. Injetar o conteúdo **verbatim** desse arquivo (frontmatter + corpo) como instruções do
>    subagente, anexado à tarefa específica.
> 3. **NUNCA gerar instruções de subagente "na hora"** a partir de suposições sobre o que o
>    agente faria. Use sempre o arquivo estático, mesmo que pareça mais lento.
>
> Isso existe porque o Antigravity CLI tem um bug conhecido de gerar instruções dinâmicas de
> subagente em vez de usar a definição estática do arquivo — o que faz o agente perder a
> identidade, os protocolos e as regras de comportamento definidos para ele. Pular esta regra
> é o jeito mais comum de um subagente "genérico" aparecer no lugar do Ryan/Alex/Emma
> específicos que este squad define.

⚠️ Limitação conhecida (Antigravity CLI 1.0.x): subagentes podem falhar em herdar as
definições de MCP configuradas no projeto (Supabase, GitHub). Se um subagente disser que não
tem acesso a um MCP que você configurou, confirme a configuração também no nível dele, não
só no root.

## 3. Ferramentas dos agentes = ilustrativas

Cada `.agents/agents/<handle>.md` tem uma seção "FERRAMENTAS REFERENCIADAS" com JSON de
exemplo. **Não são integrações reais.** A capacidade de execução vem de
`enable_write_tools`/`enable_mcp_tools` no frontmatter (arquivo, terminal, browser nativos)
e dos MCPs reais conectados ao projeto. Para este projeto, os MCPs que realmente importam
são: **Supabase** (schema, RLS, migrations, storage) e **GitHub** (repositório novo do
projeto). Configurar e documentar essas duas conexões é responsabilidade do `devops`
(Oliver) — acione-o na Fase 0, item 2. (Um agente dedicado só a integrações — `tools_orchestrator`/
Quantum — foi removido em 2026-07-16 por ser overhead desnecessário para só 2 MCPs; ainda
disponível na biblioteca base se o projeto crescer e justificar trazê-lo de volta.)

## 4. Equipe deste projeto (13 agentes)

> Removidos em 2026-07-16: `squad_manager` (Syd) e `tools_orchestrator` (Quantum) — ver
> seções 1 e 3 acima para onde as responsabilidades deles foram. Ainda na biblioteca base,
> disponíveis via `scripts/sync_agents.py --add <handle>` se o projeto crescer.

| Handle | Nome | Papel | Quando acionar |
|---|---|---|---|
| `orchestrator` | ORCH | Master Orchestrator | Plano de execução isolado/auditável (uso pontual — o Root Agent já cobre o dia a dia) |
| `clara` | Clara | PRD Specialist | Formalizar requisitos de cada módulo antes de implementar (já há muito conteúdo pronto na spec — Clara estrutura o que falta: casos de borda, critérios de aceite) |
| `pm` | Jose | Project Manager | Cronograma das Fases 0–6, riscos, status report para você |
| `po` | Lucas | Product Owner | Fatiar cada Fase em user stories priorizadas no backlog |
| `sm` | David | Scrum Master | Remove impedimentos, facilita ciclos de trabalho |
| `architect` | Alex | Tech Architect | Toda decisão estrutural: ADR de reconciliação Eixo1/Eixo2, view vs. saldo materializado, modelo `usuarios_fazendas` com papéis |
| `developer` | Ryan | Developer | Implementação — frontend, backend, triggers, Edge Functions |
| `devops` | Oliver | DevOps Engineer | CI/CD, deploy Vercel/Netlify, Supabase Storage buckets, Sentry (Fase 5) |
| `qa` | Emma | QA Engineer | Testes automatizados — prioridade máxima: cálculo de saldo de rebanho e de GMD (ver seção 7/9 da spec) |
| `cyber_chief` | Constantine | Cyber Chief | RLS de tabelas e de storage, provisionamento seguro de conta (trigger `on_auth_user_created`, nunca insert client-side), validação de upload (HEIC/PDF) |
| `legal_chief` | Theron | Legal Chief | LGPD dos dados de `usuarios`/financeiro, termos de uso, acesso de terceiro (papel contador/financeiro) antes do lançamento |
| `db_sage` | Sofia | Database Sage | Schema Postgres/Supabase completo, RLS policies, migrations, otimização das views de saldo |
| `ux` | Victoria | UX Designer | Navegação (shell com 2 seções), tabelas densas com paginação, badges de status, Painel Inteligente |

Agentes deliberadamente fora da equipe (disponíveis na biblioteca base se precisar depois):
`cra`/`radar` (orquestração de vendas — não se aplica a um projeto de dev), squads inteiros
de marketing/sales/copy/finance/admin/strategy (nenhum módulo deste sistema depende deles).
Para trazer um agente novo da biblioteca, use `scripts/sync_agents.py --add <handle>` e
adicione a linha na tabela acima.

## 5. SDLC deste projeto = as 6 fases da especificação (seção 10)

> A spec já define o sequenciamento certo — este squad segue exatamente essa ordem, não um
> fluxo genérico de feature única. Ao terminar uma fase, ver seção "tarefa complexa" em
> `memory-protocol.md` antes de avançar.

```
Fase 0 — Setup             → tools_orchestrator (MCPs), devops (CI/CD), architect (convenções)
Fase 1 — Fundação (Auth)   → architect (ADR de provisionamento via trigger) → developer → qa
                               → cyber_chief (gate: RLS e auth revisados antes de avançar)
Fase 2 — Eixo 1 (individual)→ clara/po (stories) → developer → qa (fórmula de GMD correta)
Fase 3 — Eixo 2 dados       → architect + db_sage (schema completo: especies, gtas,
                               transacoes, saldo, financeiro) → qa (saldo validado contra
                               os números reais dos prints de referência, conforme item 12
                               da seção 10 da spec) → 🔒 CHECKPOINT DE VALIDAÇÃO DE SALDO
                               (ver abaixo) → só então segue para a Fase 4
Fase 4 — Eixo 2 telas       → po (prioriza módulos: Transações → Saldo → GTAs → Financeiro
                               → Declarações → Painel) → ux (navegação/hierarquia) →
                               developer → qa
Fase 5 — Qualidade/Produção → qa (suite completa) → devops (Sentry, deploy) → cyber_chief +
                               legal_chief (gate final antes de produção)
Fase 6 — Roadmap futuro     → pm/po decidem quando entra no backlog (não é bloqueio de
                               lançamento)
```

### Regra de aprovação (herdada do padrão do squad, mantida)

- Nenhum agente move uma tarefa para "concluído"/"aprovado" sozinho — decisão do usuário.
- `qa` (Emma) comenta status técnico mas não aprova sozinha.
- Se `cyber_chief` (Constantine) sinalizar risco (ex.: RLS mal configurada, upload sem
  validação), a tarefa fica bloqueada até ele liberar — veto técnico e final em segurança.
- Antes de ir para produção (fim da Fase 5), `legal_chief` (Theron) precisa dar sign-off em
  termos de uso/privacidade — mesmo que informal nesta fase inicial.

### 🔒 Checkpoint de Validação de Saldo (gate elevado, não é aprovação de rotina)

O cálculo de saldo de rebanho é o dado que o produtor usa para prestar contas ao Estado —
maior consequência real de qualquer lógica do sistema. Por isso, diferente do resto do
fluxo (onde Emma aprova tecnicamente e segue), a saída da Fase 3 exige:

1. `qa` (Emma) roda os testes automatizados de saldo e GMD e reporta os casos de borda
   cobertos (datas retroativas, transação sem detalhamento por sexo/idade — ver seção 7 da
   spec).
2. `qa` reproduz os números dos prints de referência citados na spec (`Bovinos-saldo-atual.png`
   e equivalentes) usando o motor de cálculo implementado e mostra a comparação lado a lado.
3. O Root Agent apresenta essa comparação a **você** explicitamente — não avança para a
   Fase 4 sem sua confirmação de que os números batem. Isso não é o mesmo que o "Aprovado
   tecnicamente por Emma (QA)" de rotina; é um gate nomeado porque o custo de um erro aqui
   só aparece quando o produtor já declarou o número errado ao órgão regulador.

## 6. Pontos em aberto da especificação — não decidir sozinho, perguntar ao usuário

A spec já marca isso explicitamente (⚠️ na seção 3.2 e nota na seção 3.3/10) — reforçando
aqui porque são decisões que travam código se erradas:

- Unidade de idade para Aves (dias/semanas/meses) — `architect`/`clara` validam com o
  usuário antes de modelar `agrupamentos_etarios` para essa espécie.
- Distinção prática entre Burro e Jumento (subtipo único ou separado) — `clara` confirma.
- Reconciliação Eixo 1 ↔ Eixo 2 (Opção A recomendada, mas precisa confirmação antes da
  Fase 3) — `architect` traz a decisão em formato de ADR para o usuário aprovar.
- Supabase: projeto novo ou reaproveitar o existente do protótipo — `devops`/`tools_orchestrator`
  perguntam antes da Fase 0, item 2.

Ver `.agents/memory/PROJECT_CONTEXT.md` seção 4 (Bloqueios) para o estado atual dessas
pendências.

## 7. Memória persistente

Este squad mantém memória viva entre sessões — protocolo completo em
`.agents/rules/memory-protocol.md`, documento em `.agents/memory/PROJECT_CONTEXT.md`. Leia
antes de começar qualquer fase; atualize ao terminar qualquer tarefa complexa (nova decisão
de arquitetura, módulo entregue, bloqueio novo/resolvido).
