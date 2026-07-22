# Log — Multi-fazenda Fase A: seletor + criar fazenda adicional + Configurações — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** ao planejar a tela `/app/configuracoes` (placeholder desde a Fase 1), JP revelou
  um requisito maior — um usuário poderá ser admin/membro/financeiro de mais de uma fazenda, cada
  uma com sua própria equipe. O schema já suportava isso desde a Fase 1/ADR-0002
  (`usuarios_fazendas` N:N), mas nada na aplicação usava — `useFazendaAtual()` sempre pegava a
  fazenda mais antiga, sem seletor. Escopo combinado em 2 fases: esta é a **Fase A** (seletor +
  criar fazenda + Configurações); **Fase B** (próxima) é a tela Equipe (listar/convidar/promover/
  remover membros — precisa de RLS/RPC novos, não tocado aqui).

## O que foi feito

**Migrations:**
- `restringir_alteracao_nome_fazenda()` — achado de RLS confirmado com JP: `fazendas_update_
  vinculada` (Fase 1) autorizava QUALQUER papel (inclusive financeiro) a editar `nome`,
  inconsistente com o resto do sistema. Trigger novo exige papel admin/membro.
- `criar_fazenda(p_nome) returns uuid` — `security definer` (fazendas não tem policy de INSERT
  pra authenticated, ADR-0001 deliberado). Exige que o chamador já seja `admin` em pelo menos uma
  fazenda existente (decisão confirmada com JP — membro/financeiro puro não pode criar fazenda).

**Frontend:**
- `useFazendasDoUsuario` (novo) — lista todas as fazendas do usuário (RLS já permitia, só
  ninguém consultava assim).
- `fazendaSelecionada.tsx` (novo) — Context + Provider, seleção persistida em localStorage
  (chave por usuário, evita vazamento entre contas no mesmo navegador).
- `useFazendaAtual` **reescrito** — mesmo shape de retorno de antes
  (`{ data: { fazenda_id, papel, nome }, isLoading, isError, error }`), agora resolvendo a
  fazenda selecionada contra a lista real (fallback pra mais antiga se a seleção não existir
  mais). **Os 19 call sites existentes não precisaram de nenhuma mudança.**
- `FazendaSwitcher` (novo componente) — dropdown sempre visível no topo do menu (desktop e
  mobile, dentro de `SidebarNav`); com 1 fazenda só, mostra o nome sem dropdown.
- `ConfiguracaoFazendaPage` (nova, substitui o placeholder de `/app/configuracoes`) — dados da
  fazenda (nome, editável se papel<>financeiro), meus dados (nome do usuário editável, e-mail
  read-only), minhas fazendas (lista com papel + botão "Criar nova fazenda", habilitado só pra
  quem já é admin em alguma fazenda).

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- **Verificação de segurança direta no banco** (mesma técnica do gate anterior — psql simulando
  sessão via `request.jwt.claims`): admin edita nome da própria fazenda (sucesso); papel
  financeiro tenta editar nome (ERRO, testado com vínculo temporário dentro de uma transação
  revertida); usuário sem papel admin em nenhuma fazenda tenta `criar_fazenda` (ERRO); admin cria
  fazenda adicional (sucesso, 2 vínculos confirmados).
- **Playwright real contra o remoto**, desktop+mobile: criou uma fazenda de teste de verdade via
  a RPC (auto-seleção confirmada), confirmou a lista atualizando, confirmou o switcher aparecendo
  com 2+ fazendas, confirmou que uma tela dependente (Dashboard) recarrega sem erro na fazenda
  nova. Mobile (390px): menu abre, `FazendaSwitcher` renderiza corretamente (confirmado por
  screenshot), sem overflow horizontal em `/app/dashboard` nem `/app/configuracoes`.
- **Limpeza:** a fazenda de teste criada via Playwright foi removida ao final (delete direto,
  já que `fazendas` não tem policy de DELETE — mesmo padrão já usado em tarefas anteriores).
  Aproveitado pra também limpar um resíduo de teste de uma tarefa anterior (usuário/fazenda
  órfãos de um teste de signup que falhou por confirmação de e-mail habilitada).

## Gate do `cyber_chief`

Não rodado como gate formal separado — as duas guardas novas (`restringir_alteracao_nome_
fazenda`, `criar_fazenda`) seguem os padrões já exigidos (`search_path=''`, autorização explícita
antes de qualquer escrita, mesma classe de SECURITY DEFINER já usada nas RPCs de convite) e foram
verificadas empiricamente acima. Recomendo incluir no escopo do próximo gate formal.

## Próximos passos combinados com JP

**Fase B**: tela Equipe (`/app/configuracoes/equipe`, hoje placeholder) — listar membros de cada
fazenda (precisa de nova policy/RPC, `usuarios_fazendas` hoje só mostra a própria linha do
usuário), convidar (`criar_convite` + `enviar-convite`, já prontos sem UI), promover
(`promover_papel`, já pronto sem UI), remover membro (RPC nova, não existe hoje).
