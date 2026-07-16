# Log — ADR-0002: convites para fazenda existente e papéis admin/membro/financeiro — `architect` (Alex, via Claude)

- **Data:** 2026-07-16
- **Agente responsável:** `architect` (Alex).
- **Tipo de tarefa:** Architecture Decision Record — revisão parcial do ADR-0001 (Critério de
  Revisão nº 1 e nº 4 do próprio ADR-0001 previam este momento).
- **Escopo:** exclusivamente decisão e documentação. Nenhuma migration SQL foi escrita, nenhum
  arquivo em `supabase/migrations/` foi tocado — é trabalho do `db_sage` a partir deste ADR.

## O que foi lido antes da decisão

1. `.agents/memory/adr/ADR-0001-provisionamento-conta.md` — decisão que este ADR revisa
   parcialmente, com atenção ao Critério de Revisão nº 1 ("entrar em fazenda existente por
   convite" exigiria estender `handle_new_user()`).
2. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` — schema atual, já
   aplicado no banco remoto.
3. `.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md` — motivo da remoção da policy
   de UPDATE em `usuarios_fazendas` (achado de escalação de privilégio horizontal→vertical,
   CWE-915), para não reabrir o mesmo padrão de risco no desenho de promoção/convite.
4. `especificacao-sistema.md`, seção 5.4 — papel "Financeiro/Contábil" original da spec
   (Fase 6, roadmap), absorvido antecipadamente por este ADR dentro de um modelo mais amplo.
5. `.agents/memory/PROJECT_CONTEXT.md` — estado atual do projeto (Fase 1 em andamento).

## Decisões já tomadas por JP (não revisitadas, só formalizadas tecnicamente)

1. Papel único hierárquico `'admin' | 'membro' | 'financeiro'` em `usuarios_fazendas.papel`,
   substituindo `'dono'`. Quem cria a fazenda vira o primeiro `'admin'`, sem privilégio
   adicional.
2. Qualquer admin pode promover (ou rebaixar) outro membro — sem hierarquia especial para o
   criador original.
3. Convite funciona tanto para usuário novo quanto para usuário já cadastrado — modelo N:N
   usuário↔fazenda vale desde já, não só na Fase 6.

## O que foi feito

Produzido `ADR-0002-convites-e-papeis-admin.md`, decidindo:

- **Problema A (caminho de escrita controlado):** quatro funções `SECURITY DEFINER` novas —
  `aceitar_convite(token)`, `promover_papel(fazenda_id, usuario_id, novo_papel)`,
  `criar_convite(fazenda_id, email, papel)`, `cancelar_convite(convite_id)` — cada uma
  validando a permissão do chamador (`auth.uid()`) dentro do próprio corpo, nunca via `WITH
  CHECK` declarativo. Princípio generalizado a partir da correção do `cyber_chief`: nenhuma
  tabela cujas colunas codificam autorização (`usuarios_fazendas.papel`, `convites.status`)
  ganha policy de INSERT/UPDATE/DELETE para `authenticated`/`anon` — todo write passa por
  função revisada. `handle_new_user()` ganha um branch: se `raw_user_meta_data->>
  'convite_token'` estiver presente e válido (status pendente, não expirado, e-mail bate com
  `new.email`), entra na fazenda existente em vez de criar uma nova; se o token vier presente
  mas inválido, bloqueia o signup com erro explícito (ao contrário do fallback silencioso do
  ADR-0001 para `nome_fazenda` — justificado no ADR por ser um dado de segurança, não de UX).
  `promover_papel` inclui guarda contra deixar uma fazenda com zero admins.
- **Problema B (convite para quem não tem conta):** tabela `convites` (fazenda, papel
  oferecido, quem convidou, e-mail do convidado + `usuario_id` resolvido se já existir conta,
  token, status, validade) como fonte da verdade; uma Edge Function nova (`enviar-convite`,
  `service_role`) fica responsável pelo envio em si, chamada pelo client depois de
  `criar_convite()` — não atômica com a criação do convite, decisão justificada explicitamente
  no ADR (diferente do caso do ADR-0001: uma falha aqui só deixa um convite pendente sem
  e-mail enviado, recuperável por reenvio, não uma conta inconsistente). A função ramifica:
  e-mail já tem conta → e-mail transacional próprio + aceite via `aceitar_convite`; e-mail sem
  conta → `supabase.auth.admin.inviteUserByEmail`, que cria a linha em `auth.users`
  imediatamente e já dispara `handle_new_user()` com o mesmo `convite_token` em
  `raw_user_meta_data` — unificando os dois pontos de entrada (Admin API e `signUp()` normal)
  no mesmo branch do trigger.
- **Problema C (migração dos dados existentes):** ordem obrigatória documentada — drop da
  constraint antiga, `UPDATE ... SET papel = 'admin' WHERE papel = 'dono'`, add da constraint
  nova (`admin`/`membro`/`financeiro`). Fazer o UPDATE antes de trocar a constraint falha,
  porque a constraint antiga só aceita `'dono'`.

Alternativas rejeitadas documentadas em detalhe no ADR: reabrir policy de INSERT/UPDATE em
`usuarios_fazendas` com `WITH CHECK` referenciando `convites` (rejeitada — não atômica para o
aceite em dois passos, e repete a forma estrutural do achado nº 1 do `cyber_chief`); usar
`admin.inviteUserByEmail` para todo mundo, inclusive quem já tem conta (rejeitada — API
desenhada só para criação de conta); convite sem tabela própria, só em metadata (rejeitada —
não cobre o caso de usuário já cadastrado nem permite consulta estruturada de pendências por
fazenda).

## Mudanças de arquivo

- Criado `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md`.
- Editado `.agents/memory/adr/ADR-0001-provisionamento-conta.md` — campo `Status:` atualizado
  para indicar substituição parcial pelo ADR-0002 (só a premissa "todo signup cria fazenda
  nova"), com nota explícita de que o restante do ADR-0001 continua válido. Nenhum outro
  conteúdo do ADR-0001 foi alterado.
- Este log.
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, nova linha na seção 2 (Decisões),
  nova pendência na seção 4.

## Pendências / próximos passos

- **Implementação (fora do escopo desta tarefa):** `db_sage` escreve a migration SQL a partir
  deste ADR — tabela `convites`, as quatro funções `SECURITY DEFINER`, atualização de
  `handle_new_user()`, troca de constraint de `papel` com migração de dados (Problema C), RLS
  de `convites` (SELECT apenas). Depois, gate de segurança do `cyber_chief` obrigatório antes
  de aplicar — mesmo padrão já usado na Fase 1, com atenção redobrada às quatro funções
  `SECURITY DEFINER` novas e à Edge Function `enviar-convite` (revalidação de JWT do chamador,
  nunca confiar em `fazenda_id`/`papel` vindos do corpo da requisição).
- **Não bloqueante:** decidir provedor de e-mail transacional para o caso "convite a usuário
  já cadastrado" (fora de `admin.inviteUserByEmail`, que só serve para criação de conta) — é
  do `devops` (Oliver), não decidido neste ADR.
