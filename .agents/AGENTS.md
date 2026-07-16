## Livestock Control — Squad de 13 agentes

Este projeto usa uma equipe enxuta do Squad DMZ, selecionada especificamente para construir
o sistema descrito em [`especificacao-sistema.md`](../especificacao-sistema.md) (raiz do
projeto) — leia esse documento primeiro, ele é a fonte de verdade funcional e de dados.

### Ordem de leitura recomendada para qualquer agente/sessão nova

1. [`especificacao-sistema.md`](../especificacao-sistema.md) — o que estamos construindo.
2. [`rules/multi-agent-workflow.md`](./rules/multi-agent-workflow.md) — quem faz o quê, em
   que ordem (mapeado às 6 fases da spec), e os pontos em aberto que precisam de validação
   com o usuário antes de avançar.
3. [`memory/PROJECT_CONTEXT.md`](./memory/PROJECT_CONTEXT.md) — o que já foi decidido e
   feito até agora. **Sempre leia antes de começar qualquer tarefa.**
4. [`rules/memory-protocol.md`](./rules/memory-protocol.md) — como atualizar o contexto
   acima ao terminar uma tarefa complexa (trigger: always_on, carrega sozinho).

### Onde estão os agentes

- `.agents/agents/<handle>.md` — 15 subagentes estáticos no formato nativo do Antigravity.
  Ver a tabela completa (handle, nome, papel, quando acionar) em
  `rules/multi-agent-workflow.md` seção 4.
- `scripts/sync_agents.py` — resincroniza estes 15 agentes a partir da biblioteca base do
  Squad DMZ (`AI Products/__agents-projects/Agents`) se você editar o prompt-fonte de algum
  deles lá, ou adiciona um agente novo da biblioteca a este projeto
  (`python3 scripts/sync_agents.py --add <handle>`).

### Regra de uma linha

Leia `PROJECT_CONTEXT.md` antes de começar qualquer tarefa; atualize-o (mais o seu log em
`.agents/memory/log/`) ao terminar qualquer tarefa complexa — ver definição exata em
`memory-protocol.md` seção 0.
