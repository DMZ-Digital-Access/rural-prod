# Log — Migration SQL do ADR-0002 (convites + papéis admin/membro/financeiro)

- **Data:** 2026-07-16
- **Agente responsável:** db_sage (SOFIA), a pedido do squad DMZ.
- **Tipo de tarefa:** Implementação SQL de um ADR já aceito (`ADR-0002-convites-e-papeis-admin.md`),
  em migration nova, aditiva sobre `20260716171522_fase1_usuarios_fazendas.sql`.
- **Escopo:** exclusivamente
  `supabase/migrations/20260716183000_adr0002_convites_papeis.sql`. D3 implementado só no
  schema Postgres (tabela `convites`) — a Edge Function `enviar-convite` (Deno/TS) está
  fora do escopo desta tarefa (é do `developer`).

## O que foi lido antes de escrever o SQL

1. `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md` — decisão completa (D1 a D4),
   incluindo as 3 alternativas rejeitadas para o caminho de escrita de `usuarios_fazendas`
   (todas via policy declarativa `WITH CHECK`) e o motivo da rejeição (mesma classe de risco
   do achado nº 1 do `cyber_chief` na Fase 1).
2. `.agents/memory/adr/ADR-0001-provisionamento-conta.md` — confirmado que só a premissa
   "todo signup cria fazenda nova" foi substituída; o resto (trigger vs. Edge Function,
   atomicidade) continua valendo e foi preservado no branch "sem convite" de
   `handle_new_user()`.
3. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` — schema já aplicado no
   banco remoto. Migration nova é estritamente aditiva: nenhuma tabela recriada, `ALTER`/
   `CREATE OR REPLACE` sobre o que já existe.
4. `.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md` — padrão de rigor a repetir:
   `search_path = ''` em toda função nova, referências schema-qualificadas, comentários SQL
   extensos justificando cada decisão, e a lição central (nunca misturar autorização e
   mutação de dado num `WITH CHECK` declarativo) generalizada aqui para `usuarios_fazendas`
   E `convites` desde o primeiro dia.

## O que a migration faz

1. **D1/D4 — migração de papel**, na ordem exata do ADR: `DROP CONSTRAINT
   usuarios_fazendas_papel_check` → `UPDATE ... SET papel='admin' WHERE papel='dono'` →
   `ADD CONSTRAINT ... CHECK (papel IN ('admin','membro','financeiro'))`.
2. **D3 (parcial) — tabela `convites`**: todos os campos do ADR (`fazenda_id`,
   `convidado_email`, `convidado_usuario_id` nullable, `papel_oferecido`, `convidado_por`,
   `token` uuid único, `status`, `expires_at` default `now() + 7 dias`, `accepted_at`
   nullable, `created_at`/`updated_at` com o mesmo `trigger_set_updated_at()` já existente).
   RLS habilitada, **só duas policies de SELECT** (`convites_select_admin`:
   `fazenda_id IN (... WHERE usuario_id = auth.uid() AND papel = 'admin')`;
   `convites_select_convidado`: `convidado_email = auth.email() OR convidado_usuario_id =
   auth.uid()`). Zero policy de INSERT/UPDATE/DELETE.
3. **D2 — as 4 funções `SECURITY DEFINER`**: `aceitar_convite`, `promover_papel`,
   `criar_convite`, `cancelar_convite`, todas com `set search_path = ''`, `REVOKE ALL ...
   FROM PUBLIC` seguido de `GRANT EXECUTE ... TO authenticated` (nunca `anon`).
4. **D2 — `handle_new_user()` atualizada** (`CREATE OR REPLACE`, função já existia): novo
   branch no início checando `raw_user_meta_data->>'convite_token'`. Presente e válido →
   entra na fazenda existente (`papel = convite.papel_oferecido`), marca convite aceito.
   Presente e inválido/expirado/e-mail não bate → `RAISE EXCEPTION`, bloqueando o signup.
   Ausente → comportamento original do ADR-0001, só com `papel = 'admin'` em vez de `'dono'`.

## Decisões de implementação que o ADR deixava em aberto (resolvidas aqui)

1. **`DEFAULT` da coluna `papel`** (não coberto pelos 3 passos literais do D4): o texto do
   ADR só pede `DROP`/`UPDATE`/`ADD CONSTRAINT`, mas isso deixaria o `DEFAULT 'dono'` da
   coluna apontando para um valor agora inválido pela própria `CHECK`. Resolvido com um
   quarto passo (`ALTER COLUMN papel SET DEFAULT 'membro'`) — escolhido `'membro'` (menor
   privilégio), não `'admin'`, mesmo raciocínio de least-privilege do resto do ADR. Na
   prática esse `DEFAULT` nunca é exercitado (todo INSERT passa por `handle_new_user()`/
   `aceitar_convite()`, que sempre especificam `papel`), então é higiene de schema, não
   mudança de comportamento.
2. **Nomes dos parâmetros/retornos das funções**: o ADR já era bastante específico
   (assinaturas completas), segui literalmente. Onde o ADR não especificava um detalhe
   (ex.: usar `SELECT ... FOR UPDATE` no convite dentro de `aceitar_convite()` e no branch de
   `handle_new_user()`), adicionei lock de linha explícito para fechar a janela de corrida
   entre duas chamadas concorrentes com o mesmo token — não é estritamente exigido pelo texto
   do ADR, mas decorre diretamente do argumento de atomicidade que o próprio ADR usa para
   rejeitar a Alternativa 2 (double-accept). Também adicionei a checagem de conflito
   antes/depois do insert em `usuarios_fazendas` dentro de `aceitar_convite()`, exatamente
   como o texto do D2 pedia.
3. **FKs de `convites`**: `convidado_usuario_id` usa `ON DELETE SET NULL` (perder a conta do
   convidado não deve apagar o histórico do convite); `convidado_por` usa `ON DELETE CASCADE`
   (mesmo padrão já usado em toda a Fase 1 para FKs de `usuarios`). O ADR não especificava
   comportamento de FK para nenhum dos dois campos.
4. **Valores válidos de `convites.status`**: implementado só `'pendente' | 'aceito' |
   'cancelado'` (os 3 únicos valores que o corpo das funções efetivamente escreve). O ADR
   menciona `'expirado'` só como extensão futura não decidida (job de `pg_cron`) — não
   incluí no `CHECK` para não introduzir um valor que nada no schema atual escreve; se um job
   de expiração for implementado depois, é uma migration pequena de troca de constraint,
   mesmo padrão já usado para `papel`.
5. **Tratamento de `convite_token` malformado** (não uuid válido) em `handle_new_user()`:
   como o campo chega como `text` de `raw_user_meta_data` e precisa de cast para `uuid`,
   qualquer string malformada dispara `invalid_text_representation` no cast. Capturei essa
   exceção explicitamente para converter num `RAISE EXCEPTION` com mensagem clara, em vez de
   deixar o erro genérico de cast do Postgres vazar para o client.

## Trade-offs / riscos a revisar antes do gate do cyber_chief

- **Superfície nova de `SECURITY DEFINER`**: 4 funções novas + `handle_new_user()` alterada,
  todas manipulando diretamente `usuarios_fazendas`/`convites` sob bypass de RLS. Cada uma
  faz sua própria checagem de admin via `SELECT EXISTS (...)` — vale o `cyber_chief` conferir
  linha a linha que nenhuma dessas checagens tem uma lacuna (ex.: `promover_papel` e
  `cancelar_convite` fazem a mesma checagem "chamador é admin da fazenda X" de formas
  ligeiramente diferentes — não há função utilitária compartilhada para isso, decisão de
  manter cada função autocontida/auditável isoladamente, como o próprio ADR recomenda na
  Alternativa 1 escolhida, mas significa 4 cópias quase idênticas da mesma checagem).
- **`aceitar_convite()` e o branch de convite em `handle_new_user()` duplicam boa parte da
  mesma lógica de validação** (status/expiração/e-mail) — inevitável dado que são dois pontos
  de entrada estruturalmente diferentes (RPC autenticado vs. trigger em `auth.users`, que não
  pode chamar `aceitar_convite()` porque não há `auth.uid()` disponível ainda nesse momento
  do signup). Vale o `cyber_chief` confirmar que as duas cópias ficam equivalentes ao longo
  do tempo se uma delas for editada no futuro.
- **`convites_select_admin` consulta `usuarios_fazendas` dentro do `USING` da policy** — é
  uma subquery de leitura (SELECT), não de escrita, então não é o mesmo padrão de risco do
  achado nº 1 da Fase 1 (que era `WITH CHECK` misturando autorização e mutação). Mas é uma
  policy de RLS que depende de outra tabela protegida por RLS — vale confirmar que a
  subquery, ao rodar como parte da avaliação de RLS do usuário chamador (não `SECURITY
  DEFINER`), consegue enxergar as próprias linhas de `usuarios_fazendas` (deveria, via
  `usuarios_fazendas_select_own`, já que o predicado usa `usuario_id = auth.uid()` igual à
  policy de select).
- **Migration não testada contra o banco** (fora do escopo desta tarefa — não rodei
  `supabase db push` nem qualquer validação de sintaxe via `psql`/`supabase db lint`).
  Revisão de sintaxe foi só leitura cuidadosa do arquivo final.

## Mudanças de arquivo

- Novo `supabase/migrations/20260716183000_adr0002_convites_papeis.sql`.
- Este log.
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, e seção 4 atualizada (pendência de
  `db_sage` marcada como "migration escrita, aguardando gate do `cyber_chief`"). Seção 1
  (Estado Atual) **não foi alterada** — a migration ainda não foi aplicada a nenhum banco.

## Pendências / próximos passos

- **Gate obrigatório do `cyber_chief`** antes de qualquer `supabase db push` — mesmo processo
  já usado na Fase 1. Atenção redobrada às 4 funções novas e ao branch novo de
  `handle_new_user()` (ver riscos acima).
- Depois do gate: aplicação no banco remoto é decisão humana/orchestrator (fora do escopo
  desta tarefa, propositalmente não executada).
- Segue pendente, fora do escopo do `db_sage`: Edge Function `enviar-convite` (`developer`) e
  os testes de RLS/RPC recomendados desde a Fase 1 (`qa`), agora ampliados para cobrir as 4
  funções novas.
