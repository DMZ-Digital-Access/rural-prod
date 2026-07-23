# Log — Security review: Multi-fazenda (Fases A+B) + tela Equipe — `cyber_chief` (CONSTANTINE, via Claude)

- **Data:** 2026-07-22
- **Motivação:** item 4 do roadmap salvo em PROJECT_CONTEXT.md — multi-fazenda e Equipe nunca
  tinham passado por um gate formal, apesar de introduzirem RPCs novas (`criar_fazenda`,
  `listar_membros_fazenda`, `remover_membro`) e um trigger novo (`restringir_alteracao_nome_
  fazenda`).

## Escopo

4 migrations (`20260722150000` a `20260722180000`) + toda a camada de frontend que as consome
(`FazendaSwitcher`, `ConfiguracaoFazendaPage`, `EquipePage`, hooks
`useFazendaAtual`/`useFazendasDoUsuario`/`useCriarFazenda`/`useAtualizarNomeFazenda`/
`useEquipeFazenda`).

## Verificação adversarial específica

Foco nas classes de risco mais relevantes pra esse tipo de recurso (gestão de equipe/multi-
tenant): IDOR e elevação de privilégio.

- `criar_fazenda`: só cria fazenda pro próprio `auth.uid()`, sem parâmetro pra outro usuário.
- `remover_membro`: testado o caso de um admin de uma fazenda tentando agir sobre um usuário
  vinculado a OUTRA fazenda que ele não administra — bloqueado corretamente em todos os pontos.
  Guarda "nunca zero admins" reaproveita o padrão `for update` já validado no gate do ADR-0002.
- `listar_membros_fazenda`: SECURITY DEFINER expõe nome/e-mail de colegas, decisão deliberada
  (evita policy ampla em `usuarios`), escopada corretamente, sem vazamento cross-tenant. Bug de
  ambiguidade de coluna do achado anterior confirmado corrigido.
- Frontend: todos os gates de UI são cosméticos — cada RPC tem checagem servidor independente.
  `EquipePage.tsx` desabilita as próprias queries quando `!ehAdmin`, evitando até a chamada de
  rede — melhor que o padrão de telas anteriores.
- Sem sobreposição indevida entre `usuarios.papel_sistema` (admin do software) e
  `usuarios_fazendas.papel` (admin da fazenda) — separação de responsabilidades limpa.

## Veredito

🟢 **Seguro.** Gate liberado — nenhum achado, nenhuma correção necessária.

## Nota do Constantine

"O único ponto que sigo observando não é desta superfície — `lancamentos_financeiros` sem
trilha de auditoria no DELETE, já registrado no roadmap. Não bloqueia este gate."
