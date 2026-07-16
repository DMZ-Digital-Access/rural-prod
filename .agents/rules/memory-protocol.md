---
trigger: always_on
---

# Protocolo de Memória Persistente — Livestock Control

Este projeto usa `.agents/memory/PROJECT_CONTEXT.md` como memória viva compartilhada entre
os 15 agentes da equipe (ver roster em `multi-agent-workflow.md`). Subagentes nascem sem
memória a cada invocação — sem este arquivo, o squad perde decisões de arquitetura,
convenções de domínio (GTA, saldo, agrupamento etário) e histórico entre sessões.

## 0. O que conta como "tarefa complexa"

Atualize a memória ao terminar qualquer tarefa que se encaixe em pelo menos um destes casos:

- Produziu um artefato durável: ADR, PRD de módulo, modelo de dados, migration aplicada,
  deploy, revisão de segurança/LGPD, decisão de UX de navegação.
- Fechou uma das "fases" da seção 5 de `multi-agent-workflow.md`, ou um módulo inteiro
  dentro de uma fase (ex.: "Módulo de GTAs implementado e testado").
- Resolveu um dos pontos em aberto listados na seção 6 de `multi-agent-workflow.md`
  (ex.: usuário confirmou a unidade de idade para Aves).
- Encontrou um problema que outro agente vai encontrar de novo (ex.: um comportamento do
  Supabase Storage com HEIC, uma armadilha de RLS).

Não precisa atualizar para: perguntas simples, leitura de código, ajustes triviais de estilo.

## 1. Antes de começar qualquer tarefa

1. Leia `.agents/memory/PROJECT_CONTEXT.md` seção 1 (Estado Atual) e seção 4 (Bloqueios) —
   sempre.
2. Leia seção 2 (Decisões) e 3 (Glossário) quando a tarefa toca arquitetura, schema ou
   qualquer um dos pontos em aberto da spec.
3. Se a memória contradiz `especificacao-sistema.md` ou o prompt estático do agente, **a
   memória mais recente vence** — ela reflete decisões já tomadas com o usuário (ex.: se o
   usuário já confirmou Supabase novo vs. reaproveitado, isso vale mais que a pergunta em
   aberto que ainda está na spec original).

## 2. Ao terminar uma tarefa complexa

1. Crie um log em `.agents/memory/log/<AAAA-MM-DD>-<handle>-<slug>.md` (nunca edite o log de
   outro agente). Use `2026-07-16-orchestrator-setup-squad.md` como modelo de formato.
2. Adicione uma entrada no topo da seção 5 (Histórico) de `PROJECT_CONTEXT.md`, com link
   para o log.
3. Atualize a seção 1 (Estado Atual) SE a tarefa mudou o estado real do projeto (fase
   avançou, módulo entregue, stack decidida).
4. Atualize a seção 2 (Decisões) se a tarefa gerou uma decisão que o resto do squad precisa
   conhecer — especialmente ao resolver um dos pontos em aberto da spec.
5. Atualize a seção 4 (Bloqueios) — adicione o que travou esperando o usuário, remova o que
   foi resolvido.
6. Atualize a seção 3 (Glossário) se surgiu um termo novo de domínio.

## 3. Concorrência

Em tarefas paralelas (ex.: `developer` trabalhando em dois módulos independentes ao mesmo
tempo), cada tarefa escreve seu próprio arquivo de log — nunca dois agentes no mesmo log. A
consolidação das seções 1 e 2 de `PROJECT_CONTEXT.md` (que são sobrescritas, não anexadas) é
feita pelo Root Agent/Orchestrator depois de coletar os resultados, não por cada subagente
individualmente.

## 4. Higiene do arquivo

Se a seção 5 (Histórico) passar de ~30 entradas, mova as mais antigas para
`.agents/memory/log/ARCHIVE.md` (resumo + link; o log individual continua intacto). Quem faz
essa limpeza é `squad_manager` (Syd) ou o Root Agent.
