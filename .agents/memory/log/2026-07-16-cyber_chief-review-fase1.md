# Log — Security Review da Fase 1 (migration usuarios/fazendas/usuarios_fazendas)

- **Data:** 2026-07-16
- **Agente responsável:** cyber_chief (CONSTANTINE) — gate de segurança da Fase 1, atribuído
  por `.agents/rules/multi-agent-workflow.md` seção 5 ("cyber_chief: gate: RLS e auth
  revisados antes de avançar"), a pedido do squad DMZ.
- **Tipo de tarefa:** Security review formal (RLS + auth) de migration ainda não aplicada,
  com correção direta no arquivo SQL (não migration de correção separada — nada foi aplicado
  ao banco ainda).
- **Escopo:** exclusivamente
  `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql`. Nenhuma outra tabela/fase
  tocada.

## O que foi lido antes da análise

1. `.agents/memory/adr/ADR-0001-provisionamento-conta.md` — decisão arquitetural que a
   migration implementa (trigger `on_auth_user_created`, `SECURITY DEFINER`, atomicidade,
   implicação de RLS: sem INSERT/DELETE client-side nas 3 tabelas).
2. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` — arquivo revisado linha a
   linha (versão anterior às correções desta tarefa).
3. `especificacao-sistema.md`, seção 5.4 — papel futuro "Financeiro/Contábil": login próprio,
   vínculo N:N via `usuarios_fazendas`, acesso **restrito a consulta** (Painel Financeiro,
   Declarações, Saldo), **sem acesso** a manejo/GTAs/edição de transações. Confirma que o
   papel `financeiro` é estruturalmente menos privilegiado que `dono`, não apenas "outro
   papel" — o que torna qualquer caminho de auto-promoção `financeiro → dono` uma escalação
   vertical real, não uma nuance cosmética.

---

## [SECURITY ANALYSIS]

**Componente:** `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` (tabelas
`usuarios`, `fazendas`, `usuarios_fazendas`; função `handle_new_user()`; RLS das 3 tabelas)

**Status (após correções aplicadas nesta revisão):** 🟢 Seguro

**Status antes das correções (como recebido):** 🟡 Seguro com Observações — nenhum caminho de
exploração ativo hoje, mas um achado de severidade crítica-quando-ativado (ver item 1) e dois
achados de endurecimento (itens 2 e 3) que eu não deixaria passar para aplicação sem correção,
mesmo sendo tecnicamente "aprovável" no estado atual isolado.

---

### [VULNERABILIDADES IDENTIFICADAS]

**1. `usuarios_fazendas_update_own` — Elevação de Privilégio Horizontal→Vertical latente**
(o ponto levantado pelo squad)

- **Impacto:** Crítico (quando ativado) | **Probabilidade:** Certa, no dia em que a Fase 6
  estender `usuarios_fazendas_papel_check` para incluir `'financeiro'` sem revisitar esta
  policy — não é um cenário hipotético, é o próprio roadmap documentado (spec seção 5.4,
  ADR-0001 critério de revisão nº 1).
- **Classificação:** STRIDE = Elevation of Privilege. OWASP Top 10 (2021) = A01 Broken Access
  Control, próximo de CWE-915 (Improperly Controlled Modification of Dynamically-Determined
  Object Attributes / "mass assignment") — a policy autorizava UPDATE de **qualquer** coluna
  da própria linha, incluindo `papel`, sem lista de colunas permitidas.
- **DREAD:**
  - Damage: Alto quando ativo (usuário `financeiro`, cujo desenho de produto é
    explicitamente "sem acesso a manejo/GTAs/edição de transações", consegue virar `dono`
    completo da própria fazenda com um único `UPDATE`) / **zero hoje** (constraint
    `usuarios_fazendas_papel_check` só aceita `'dono'` — fisicamente não há para onde
    escalar ainda).
  - Reproducibility: Alta — um único `PATCH`/`UPDATE` via PostgREST, sem race condition nem
    pré-condição especial.
  - Exploitability: Alta — não exige ferramenta além de um client HTTP autenticado; a policy
    não tinha nenhuma barreira (nem coluna, nem trigger) além do `CHECK` da constraint, que é
    o único motivo de estar inerte hoje.
  - Affected users: hoje, nenhum (papel `financeiro` não existe ainda); no cenário Fase 6,
    todo usuário com esse papel em qualquer fazenda.
  - Discoverability: Alta — RLS policies são introspectáveis via metadata do Postgres/
    PostgREST; a própria migration documentava a policy sem esconder a superfície.
- **Por que não classifiquei o componente inteiro como 🔴 antes de corrigir:** o
  `CHECK (papel in ('dono'))` é, hoje, uma barreira real e não contornável por este caminho —
  não é "segurança por obscuridade", é uma constraint de banco de dados que qualquer tentativa
  de `UPDATE ... SET papel = 'financeiro'` (ou qualquer valor além de `'dono'`) já rejeita
  agora, independente da policy de RLS. Mas um controle de acesso que só é seguro **porque uma
  constraint não relacionada ainda não foi estendida** não é um controle de acesso — é uma
  bomba-relógio documentada no próprio ADR que o squad já sabe que vai detonar na Fase 6. Meu
  veto aqui não é sobre o estado atual do banco, é sobre deixar essa premissa viajar para
  produção dentro de uma migration "aprovada" sem correção — o custo de corrigir agora é zero
  (a policy nunca foi usada pela aplicação) e o custo de corrigir depois, sob pressão, no meio
  da entrega da Fase 6, é uma janela real de exposição em produção.
- **Mitigação aplicada:** removida a policy `usuarios_fazendas_update_own` inteiramente — não
  restringida coluna a coluna. Justificativa (detalhada também em comentário SQL na própria
  migration, seção 3.3): não existe hoje, nem está previsto, nenhum campo do próprio vínculo
  que o usuário deva poder editar por conta própria; mudança de papel é sempre operação
  administrativa/de fluxo de convite (Fase 6), nunca self-service. RLS é default-deny — sem
  policy de UPDATE para `authenticated`/`anon`, qualquer tentativa de UPDATE direto do client
  falha por padrão, mesmo padrão já usado para INSERT/DELETE nesta migration. Rejeitei a
  alternativa "manter a policy, mas com `with check (papel = (valor antigo))`" porque ela só
  protege a coluna `papel` especificamente — deixa a porta aberta para qualquer outra coluna
  sensível que venha a ser adicionada a esta tabela no futuro (ex.: um campo de permissões
  granulares dentro do vínculo, plausível dado que a tabela já é modelada para crescer). Sem
  caso de uso legítimo hoje, o princípio de menor privilégio manda não conceder a capacidade,
  não apenas restringi-la ao caso conhecido de abuso.

**2. `fazendas_update_vinculada` — coluna `usuario_id` (proveniência) reescrevível sem
restrição**

- **Impacto:** Baixo hoje / Médio como risco estrutural futuro | **Probabilidade:** Baixa
  (depende de um desenvolvedor futuro usar `fazendas.usuario_id` como atalho de autorização
  sem revisar que é client-writable).
- **Classificação:** STRIDE = Tampering (dado de auditoria) com potencial de virar Elevation
  of Privilege *indireta* se algum código futuro confiar nesta coluna para decisão de acesso
  (a própria migration documenta explicitamente que "controle de acesso efetivo é sempre via
  `usuarios_fazendas`, nunca via `fazendas.usuario_id`" — mas essa é uma convenção de
  disciplina de equipe, não uma garantia técnica; nada no schema impedia o valor de ser
  reescrito).
- **Achado:** a policy de UPDATE em `fazendas` não restringia colunas — um usuário vinculado
  (hoje, sempre `dono`) podia rodar `UPDATE fazendas SET usuario_id = <qualquer uuid válido de
  usuarios.id> WHERE id = <fazenda própria>`, contanto que o `id` da linha permanecesse entre
  as fazendas vinculadas a ele (é só isso que o `WITH CHECK` validava). Isso não abre acesso
  hoje porque nenhuma policy de RLS consulta esta coluna — mas corrompe o dado de
  "dono/criador original" arbitrariamente, e é exatamente o tipo de campo que um
  desenvolvedor apressado no futuro poderia usar como atalho (`where usuario_id = auth.uid()`)
  sem saber que é client-writable.
- **Mitigação aplicada:** trigger `BEFORE UPDATE` (`prevent_fazendas_identity_change()`)
  bloqueando mudança de `id`, `usuario_id` e `created_at`; `nome` (único campo com caso de uso
  real hoje, spec seção 5.3) e `updated_at` (já gerido por `trigger_set_updated_at`)
  permanecem livres. Defesa em profundidade — a garantia não depende só do `WITH CHECK` da
  policy de RLS continuar bem escrito em toda migration futura.

**3. `usuarios_update_own` — coluna `email` (espelho de `auth.users`) reescrevível sem
restrição**

- **Impacto:** Baixo | **Probabilidade:** Baixa.
- **Classificação:** STRIDE = Spoofing (de baixo alcance). A policy de SELECT em `usuarios` é
  `id = auth.uid()` — só o próprio usuário vê sua própria linha, então um `email` divergente
  não é visível a terceiros via esta tabela hoje. Ainda assim, é uma divergência silenciosa
  entre a identidade real (`auth.users.email`) e o espelho em `public.usuarios`, que qualquer
  tela/relatório/exportação futura que trate `usuarios.email` como fonte da verdade herdaria
  sem aviso.
- **Mitigação aplicada:** trigger `BEFORE UPDATE` (`prevent_usuarios_identity_change()`)
  bloqueando mudança de `id`, `email` e `created_at`; `nome` permanece livre (único campo de
  perfil real).

### [OUTROS PONTOS REVISADOS — SEM ACHADO]

- **Ausência de policies de INSERT/DELETE (usuarios/fazendas/usuarios_fazendas):** correta e
  suficiente. RLS é default-deny; sem policy explícita para `authenticated`/`anon`, qualquer
  tentativa de insert/delete direto do client falha. Confirma a garantia central do ADR-0001.
  **Recomendo formalmente** (não bloqueante para este gate, mas necessário antes de a Fase 1
  ser dada como encerrada) o caso de teste explícito já pedido pelo próprio ADR-0001: "insert
  direto do client autenticado nas 3 tabelas deve falhar" — hoje é garantia estrutural, não
  testada automaticamente. Delegar a `qa` (Emma).
- **`handle_new_user()` — `SECURITY DEFINER` + `search_path`:** função roda com privilégio do
  owner (bypassa RLS), como desenhado no ADR. Todas as referências a tabelas dentro do corpo
  já eram schema-qualificadas (`public.usuarios`, `public.fazendas`,
  `public.usuarios_fazendas`) — sem risco de search_path hijacking mesmo antes da correção.
  Endurecido mesmo assim: troquei `set search_path = public` por `set search_path = ''`
  (mais restritivo, padrão recomendado pelo Supabase/OWASP para funções `SECURITY DEFINER` —
  qualquer referência não qualificada que viesse a ser introduzida por engano numa edição
  futura falharia explicitamente em vez de silenciosamente resolver para um schema errado).
  Nenhuma mudança de comportamento — mudança puramente de postura defensiva.
- **`trigger_set_updated_at()`:** não tinha `search_path` fixado (função `SECURITY INVOKER`,
  risco de exploração baixo já que não referencia objetos não qualificados, mas é o tipo de
  achado que o Supabase Security Advisor sinaliza — "Function Search Path Mutable"). Corrigido
  por consistência/higiene, mesmo sem exploração identificada.
- **Roles usados nas policies (`to authenticated`, nunca `anon`):** correto — nenhuma policy
  concede qualquer acesso a `anon`, consistente com "sem sessão = sem visibilidade".
- **`fazendas_select_vinculada`/`usuarios_fazendas_select_own`:** predicados corretos,
  restritos ao próprio `auth.uid()` via `usuarios_fazendas`. Nenhuma forma de um usuário ver
  linha de outro usuário/fazenda não vinculada.
- **Observação não bloqueante (nota para Fase 6, não achado de segurança desta migration):**
  a policy `usuarios_fazendas_select_own` só permite ao usuário ver **os próprios** vínculos
  (`usuario_id = auth.uid()`). Isso significa que, quando a Fase 6 chegar, um `dono` não vai
  conseguir ver via esta policy quais outros usuários (`financeiro`) estão vinculados à sua
  própria fazenda — provavelmente vai precisar de uma policy adicional tipo "dono vê todos os
  vínculos das fazendas onde ele mesmo é dono". Não é um problema de segurança hoje (é
  sub-permissivo, não sobre-permissivo — falha para o lado seguro), só um lembrete para quando
  a Fase 6 for desenhada, já registrado aqui para não se perder.
- **FKs com `on delete cascade`:** apropriado para o modelo (deletar `auth.users` limpa
  `usuarios`→`fazendas`→`usuarios_fazendas` em cascata). Nenhuma policy de DELETE existe para
  o client de qualquer forma, então isso só afeta exclusão administrativa/via `service_role`,
  fora do escopo de RLS.

---

### [VERIFICAÇÃO DE DADOS]

- **Criptografia em repouso:** sim (padrão Supabase/Postgres gerenciado — não alterado nem
  precisa ser por esta migration).
- **Criptografia em trânsito:** sim (padrão Supabase — TLS obrigatório na API/Postgres
  connection pooler).
- **RLS / Controle de acesso:** validado, após correções. Antes das correções: válido para o
  estado atual do banco, mas com uma lacuna estrutural que se tornaria inválida
  automaticamente (sem nenhuma mudança de RLS) no momento em que outra parte do sistema
  (constraint de `papel`) mudasse — isso é, por definição, um controle de acesso frágil.
  Depois das correções: cada policy de UPDATE agora reflete exatamente as colunas com caso de
  uso legítimo (`nome` em `usuarios`/`fazendas`; nenhuma em `usuarios_fazendas`), reforçada por
  trigger onde a RLS sozinha não consegue expressar "coluna imutável" (limitação conhecida do
  Postgres: `WITH CHECK` não tem acesso ao valor anterior da linha).

---

### [NOTAS DO CONSTANTINE]

- "Se não corrigirmos a policy de `usuarios_fazendas` agora, o dia em que a Fase 6 ligar o
  papel `financeiro` é o mesmo dia em que qualquer usuário de consulta vira dono da fazenda
  com um `PATCH`. Não vou aprovar uma migration cujo controle de acesso depende de uma
  constraint não relacionada continuar do jeito que está — isso não é RLS, é sorte."
- "As duas guardas de imutabilidade que adicionei em `usuarios`/`fazendas` (colunas
  `id`/`email`/`created_at`/`usuario_id`) não corrigem um exploit ativo — corrigem o hábito de
  escrever `USING (dono = auth.uid())` e achar que isso é suficiente. Não é. RLS de linha
  sem RLS de coluna é meia porta trancada."
- "Nada aqui bloqueia a Fase 1. O que eu não aceitaria era aplicar a migration como estava
  recebida — as correções já estão no arquivo, não é uma pendência para depois."

---

## Correções aplicadas

Todas no próprio arquivo
`supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` (migration ainda não
aplicada a nenhum banco — editado diretamente, sem migration de correção separada):

1. **Removida a policy `usuarios_fazendas_update_own`** (seção 3.3). `usuarios_fazendas`
   passa a ter apenas `usuarios_fazendas_select_own` (SELECT). Substituído o comentário da
   seção 3.3 por explicação completa do achado, da decisão (remover, não restringir por
   coluna) e do que precisaria acontecer para uma policy de UPDATE ser reintroduzida no
   futuro (revisão nova do cyber_chief, `with check` explícito por coluna sensível).
2. **Novo trigger `prevent_usuarios_identity_change()` + `BEFORE UPDATE` em
   `public.usuarios`** — bloqueia mudança de `id`, `email`, `created_at`; deixa `nome` livre.
3. **Novo trigger `prevent_fazendas_identity_change()` + `BEFORE UPDATE` em
   `public.fazendas`** — bloqueia mudança de `id`, `usuario_id`, `created_at`; deixa `nome`
   livre.
4. **`handle_new_user()`:** `set search_path = public` → `set search_path = ''` (hardening,
   sem mudança de comportamento — todas as referências já eram schema-qualificadas).
5. **`trigger_set_updated_at()`:** adicionado `set search_path = ''` (não tinha nenhum antes).
6. **Comentário de cabeçalho da migration** (topo do arquivo) atualizado para refletir que
   `usuarios_fazendas` não tem mais UPDATE e que `usuarios`/`fazendas` têm guardas de
   imutabilidade além da RLS; adicionada linha de autoria da revisão de segurança.

Nenhuma tabela, função de provisionamento (`handle_new_user`, lógica de negócio) ou policy de
SELECT foi alterada em comportamento — todas as correções são adição de restrição
(remover uma capacidade não usada / bloquear colunas sem caso de uso legítimo), não mudança de
funcionalidade esperada pela aplicação.

## Pendências / próximos passos

- **Não bloqueante, recomendado antes de fechar a Fase 1:** `qa` (Emma) adicionar caso de
  teste automatizado explícito para "insert direto do client autenticado falha nas 3 tabelas"
  (já pedido pelo ADR-0001) e, agora, também "update de `email`/`id`/`created_at`/`usuario_id`
  falha mesmo pelo dono da linha" e "update em `usuarios_fazendas` falha sempre".
- **Fase 6 (papel Financeiro/Contábil):** quando a constraint `usuarios_fazendas_papel_check`
  for estendida para incluir `'financeiro'`, este gate (cyber_chief) precisa revisar de novo
  qualquer nova policy de UPDATE que venha a ser proposta para `usuarios_fazendas` — nenhuma
  deve ser criada sem `with check` explícito por coluna e sem essa revisão, dado o histórico
  documentado aqui.
- **Migration liberada para aplicação** (`supabase db push`) do ponto de vista deste gate —
  decisão de quando aplicar continua sendo humana/orchestrator, fora do escopo desta revisão.

## Mudanças de arquivo

- `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` — editado (ver "Correções
  aplicadas" acima). Nenhum outro arquivo de migration tocado.
- Este log.
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, linkando este log.
