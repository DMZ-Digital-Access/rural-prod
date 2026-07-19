# Log — Frontend Fase 2, Eixo 1: Gestão Individual de Rebanho

- **Data:** 2026-07-17
- **Agente responsável:** developer (RYAN), squad DMZ.
- **Tipo de tarefa:** implementação de frontend — as 6 telas do Eixo 1 (spec
  seção 5.1/10 item 9): Dashboard, Animais (lista + detalhe), Lotes (lista +
  detalhe), Comparativo entre lotes. Consome o schema `lotes`/`animais`/
  `pesagens` da migration `20260717140000_fase2_lotes_animais_pesagens.sql`,
  já revisada pelo `cyber_chief` (🟢, ver
  `.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md`) e — segundo o
  briefing desta tarefa — já aplicada ao banco remoto. Nenhuma migration
  tocada.

## O que foi lido antes de escrever qualquer código

1. `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` —
   completa, linha a linha: tabelas, views (`animais_com_detalhes`,
   `lotes_com_estatisticas`), RPC `registrar_pesagem()`, RLS (exclusão de
   `papel='financeiro'` nas 3 tabelas), guardas de campos calculados.
2. `especificacao-sistema.md` seções 5.1 (módulos do Eixo 1) e 4.1
   (categorização automática).
3. `src/router.tsx`, `src/lib/auth.tsx`, `src/lib/supabase.ts`,
   `src/components/layout/AppShell.tsx`, `src/components/ProtectedRoute.tsx`,
   `src/components/ui/{form,button,input,card}.tsx`, páginas de auth
   (`LoginPage`/`SignupPage`) — padrões já estabelecidos na Fase 1
   (react-hook-form + zodResolver + `Form`/`FormField` escrito à mão sobre
   `@base-ui/react`, não Radix).
4. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` — para
   entender `usuarios_fazendas` (fonte do `fazenda_id` do usuário logado, não
   existia hook nenhum para isso ainda).
5. `.agents/memory/PROJECT_CONTEXT.md` seções 1 e 4 — estado da Fase 1/2 e
   pendências abertas.

## O que foi feito

### 1. Componentes shadcn/ui
Adicionados via `npx shadcn@latest add table dialog select badge textarea
--yes`: `table.tsx`, `select.tsx`, `badge.tsx`, `textarea.tsx`, `dialog.tsx`
(todos gerados sem problema pelo CLI desta vez — ao contrário de `form` na
Fase 1). `select.tsx`/`dialog.tsx` usam `@base-ui/react/select` e
`@base-ui/react/dialog` (consistente com o resto do projeto, não Radix).

### 2. Tipos e camada de dados
- `src/lib/types/rebanho.ts` — tipos manuais espelhando o schema (sem geração
  automática de tipos Supabase configurada no projeto): `Animal`,
  `AnimalComDetalhes`, `Lote`, `LoteComEstatisticas`, `Pesagem`.
- `src/hooks/useFazendaAtual.ts` — não existia nenhum jeito de descobrir o
  `fazenda_id` do usuário logado no frontend antes desta tarefa. Query em
  `usuarios_fazendas` (RLS já escopa por `auth.uid()`), pega o vínculo mais
  antigo (`order by created_at asc, limit 1`) como "a" fazenda do usuário.
  **Débito técnico documentado no próprio arquivo:** ADR-0002 já permite
  multi-fazenda (convites), mas não há seletor de fazenda na UI — fora do
  escopo desta tarefa, spec não pede.
- `src/hooks/useLotes.ts` — `useLotes(fazendaId)`/`useLote(id)` (sempre via
  `lotes_com_estatisticas`, nunca `lotes` direto), `useCriarLote`,
  `useAtualizarLote`, `useDefinirLoteAtivo` (arquivar/reativar — sempre
  `UPDATE ativo=<bool>`, nunca DELETE, não existe policy de DELETE).
- `src/hooks/useAnimais.ts` — idem para `animais_com_detalhes`, com filtro
  opcional por `lote_id`. `useCriarAnimal`/`useAtualizarAnimal` **nunca**
  enviam `peso_atual_kg`/`gmd_medio_kg`/`ultima_pesagem_data` (comentário no
  código explica por quê: o backend sobrescreve incondicionalmente via
  trigger, mas o client não deve nem tentar).
- `src/hooks/usePesagens.ts` — `usePesagens(animalId)` (SELECT) e
  `useRegistrarPesagem(animalId)`, que chama **exclusivamente**
  `supabase.rpc('registrar_pesagem', {...})` — comentário explícito no código
  de que um `.from('pesagens').insert()` direto falharia por RLS (não existe
  policy de INSERT). `onSuccess` invalida `pesagens`, `animais` e `lotes` em
  conjunto, porque o trigger de recálculo do backend propaga a mudança de uma
  pesagem para `animais.peso_atual_kg/gmd_medio_kg` e, por consequência, para
  as agregações de `lotes_com_estatisticas`.

### 3. Schemas zod (`src/lib/validations/{animais,lotes,pesagens}.ts`)
- `criarAnimalSchema` / `editarAnimalSchema` — schemas **separados** (edição
  não inclui `data_nascimento`/`sexo`/`peso_inicial_kg`, só
  `identificacao`/`lote_id`/`status`, conforme o limite explícito da tarefa).
  Nenhum dos dois schemas tem `peso_atual_kg`/`gmd_medio_kg`/
  `ultima_pesagem_data` — testado explicitamente
  (`não expõe campos calculados no schema`).
- `loteSchema` — `data_fim >= data_inicio` via `.refine()`.
- `pesagemSchema` — só `data_evento`/`peso_kg`, ambos validados contra "não
  pode ser no futuro"/"maior que zero". Comentário explícito: a decisão
  "correção vs. novo registro" é do backend, o schema não tenta replicá-la.
- **Achado de tooling durante a validação (não documentado na Fase 1):**
  `z.coerce.number()` combinado com `zodResolver` do `@hookform/resolvers`
  v5 + Zod v4 quebra a inferência de tipos do `useForm<T>()` — o `Resolver`
  gerado tem tipo de entrada (`unknown`, por causa do coerce) diferente do
  tipo de saída (`number`), e o `useForm<T>` espera os dois iguais. Resolvido
  **sem** `z.coerce`: os schemas usam `z.number()` puro, e os campos
  numéricos dos formulários (`peso_inicial_kg`, `peso_kg`) convertem
  string→number no próprio `<Input type="number">` via
  `onChange={(e) => field.onChange(e.target.valueAsNumber)}` (documentado nos
  dois arquivos de schema, com comentário cruzando para o componente).
  `Number.isFinite(field.value)` decide se o campo mostra o valor ou uma
  string vazia (cobre tanto `undefined` do estado inicial quanto `NaN` de um
  campo limpo pelo usuário).

### 4. Componentes compartilhados
- `src/components/rebanho/StatusAnimalBadge.tsx` — badge por `status`
  (ativo/venda/morte/baixa) seguindo a paleta semântica da spec seção 6
  (verde/azul/vermelho/laranja), sobre `variant="outline"` do `Badge` gerado.
- `src/components/rebanho/LoteSelectField.tsx` — `Select` de lote reusado nos
  dois formulários de animal, com sentinela `"__sem_lote__"` convertido para
  `null` (o `Select` do base-ui não aceita item com `value=null`).

### 5. Páginas — Animais
- `src/pages/animais/AnimaisListPage.tsx` (`/app/animais`) — tabela
  (identificação/categoria/status/peso atual/GMD/última pesagem), botão
  "Novo animal" (`CriarAnimalDialog`), ação de editar por linha
  (`EditarAnimalDialog`).
- `src/pages/animais/CriarAnimalDialog.tsx` — dialog com
  identificação/data_nascimento/sexo/peso_inicial_kg/lote (opcional).
- `src/pages/animais/EditarAnimalDialog.tsx` — dialog com
  identificação/lote/status apenas (nunca os campos calculados).
- `src/pages/animais/AnimalDetailPage.tsx` (`/app/animais/:id`) — card de
  dados (status/lote/nascimento/idade/peso inicial/peso atual/ganho
  total/GMD/última pesagem/nº pesagens, todos os calculados vindos direto da
  view), `RegistrarPesagemForm` e tabela de histórico de pesagens.
- `src/pages/animais/RegistrarPesagemForm.tsx` — só data+peso, chama a RPC,
  mostra o resultado via toast **sem** tentar prever se foi correção ou novo
  registro (isso é decisão do backend).

### 6. Páginas — Lotes
- `src/pages/lotes/LotesListPage.tsx` (`/app/lotes`) — tabela com estatísticas
  (nº animais ativos, peso médio, GMD médio), badge ativo/arquivado, botão
  "Novo lote".
- `src/pages/lotes/LoteFormDialog.tsx` — componente único para criar/editar
  (mesmo schema, `mode: "criar" | "editar"` como union type discriminada).
- `src/pages/lotes/ArquivarLoteButton.tsx` — toggle `ativo`, sem DELETE.
- `src/pages/lotes/LoteDetailPage.tsx` (`/app/lotes/:id`) — estatísticas +
  lista de animais associados (reusa `useAnimais(fazendaId, loteId)`).

### 7. Dashboard e Comparativo
- `src/pages/dashboard/DashboardPage.tsx` (`/app/dashboard`) — stat tiles
  (animais ativos, peso médio, GMD médio geral), distribuição por status
  (lista) e por categoria (bar chart recharts, hue único `var(--chart-2)`),
  filtro por lote via `Select` (`useState` local, sentinela
  `"__todos__"`).
- `src/pages/comparativo/ComparativoPage.tsx` (`/app/comparativo`) — dois bar
  charts single-hue (peso médio `var(--chart-2)`, GMD médio `var(--chart-3)`)
  + tabela, só lotes com pelo menos 1 animal ativo (métricas de lote vazio
  são `NULL`, comparar não faz sentido). Consultada a skill `dataviz` antes
  de desenhar os gráficos — "um eixo", single-hue por série única (não
  rainbow por categoria), cores puxadas das CSS vars `--chart-N` já
  existentes no tema (mantém consistência com o resto do app, sem inventar
  paleta nova).

### 8. `src/router.tsx`
As 6 rotas (`dashboard`, `animais`, `animais/:id`, `lotes`, `lotes/:id`,
`comparativo`) trocadas de `<PlaceholderPage>` para as páginas reais. As
rotas de Eixo 2/Fases 3-4 continuam como `PlaceholderPage`, sem alteração.

## Testes

`src/lib/validations/{animais,lotes,pesagens}.test.ts` — 25 testes novos,
mesmo padrão de `auth.test.ts` (schemas puros, sem DOM). Cobrem: payload
válido, campos obrigatórios vazios, datas no futuro rejeitadas, `data_fim <
data_inicio` rejeitada, todos os `status` válidos aceitos, status inválido
rejeitado, ausência de campos calculados no schema de edição, e — depois do
achado de tooling do `z.coerce` — que um `peso_inicial_kg`/`peso_kg` vindo
como `string` é **rejeitado** pelo schema (documentando que a conversão
string→number é responsabilidade do componente, não do schema).

**Total da suíte:** 35/35 testes passando (10 de `auth.test.ts` da Fase 1 +
25 novos).

## Validação

1. `npm run build` (`tsc -b && vite build`) — **passou limpo**, zero erros de
   tipo. Mesmo aviso de chunk >500kB já existente desde a Fase 1 (bundle
   único, sem code-splitting).
2. `npm run lint` (oxlint) — **passou, exit code 0**. Só os mesmos 4 warnings
   `react(only-export-components)` pré-existentes (`form.tsx`, `auth.tsx`,
   `badge.tsx`, `button.tsx`) — nenhum arquivo novo desta tarefa gerou
   warning novo.
3. `npm run test` (Vitest) — 35/35 PASS.
4. `npm run dev` subiu em background sem erro. `Invoke-WebRequest` confirmou
   HTTP 200 em `/`, `/app/dashboard`, `/app/animais`, `/app/animais/<uuid
   fake>`, `/app/lotes`, `/app/lotes/<uuid fake>`, `/app/comparativo`
   (smoke test SPA — todas servem o mesmo `index.html`, roteamento é
   client-side). Adicionalmente, requisitei os módulos `.tsx` novos
   diretamente pela URL de transform do Vite dev server
   (`/src/pages/.../*.tsx`) — todos retornaram HTTP 200 (não 500), o que
   confirma que o Vite consegue transformar/importar cada arquivo sem erro
   de sintaxe/import além do que `tsc -b` já garante. Processo derrubado
   depois.

**Limitação honesta, igual à da Fase 1:** sem navegador real disponível
neste ambiente. O smoke test confirma que o servidor sobe, que o roteador
serve as rotas certas, e que cada módulo novo transforma sem erro — **não**
confirma que os componentes renderizam sem exceção em runtime (ex.: um erro
de hook, um `undefined.map()`, um dado incompatível com o que a view
realmente retorna) nem que os formulários/dialogs funcionam interativamente
no DOM. Nenhum teste de componente (Testing Library) foi escrito — mesma
lacuna já declarada na Fase 1, ainda não fechada.

## Decisões

- `useFazendaAtual()` pega o vínculo mais antigo do usuário como "a" fazenda
  — não há seletor multi-fazenda na UI (débito técnico documentado no
  próprio hook, não é uma escolha de produto validada).
- `criarAnimalSchema`/`editarAnimalSchema` separados em vez de um schema
  único condicional — refletem literalmente o limite da tarefa (edição só
  toca nome/lote/status), mais simples de ler que um único schema com campos
  opcionais condicionais.
- Abandonado `z.coerce.number()` nos 3 schemas com campos numéricos, por
  causa do conflito de tipos com `zodResolver`/`useForm` documentado acima —
  decisão de tooling, não de produto, documentada nos próprios arquivos de
  schema para o próximo agente não redescobrir o mesmo problema.
- Gráficos do dashboard/comparativo usam as CSS vars `--chart-1..5` já
  existentes no tema (grayscale hoje) em vez de introduzir uma paleta nova —
  mantém uma só fonte de verdade de cor no projeto; se/quando o tema ganhar
  cor de verdade, os gráficos herdam automaticamente.
- Badges de status/lote usam classes Tailwind com cores fixas (verde/azul/
  vermelho/laranja) direto no componente, não uma nova `variant` no
  `badge.tsx` gerado pelo CLI — evita divergir do arquivo gerado (mais fácil
  de re-sincronizar com `shadcn add --overwrite` no futuro).

## Mudanças de arquivo

**Novos:**
`src/lib/types/rebanho.ts`;
`src/lib/validations/{animais,lotes,pesagens}.ts` + `.test.ts` de cada um;
`src/hooks/{useFazendaAtual,useLotes,useAnimais,usePesagens}.ts`;
`src/components/rebanho/{StatusAnimalBadge,LoteSelectField}.tsx`;
`src/pages/animais/{AnimaisListPage,AnimalDetailPage,CriarAnimalDialog,EditarAnimalDialog,RegistrarPesagemForm}.tsx`;
`src/pages/lotes/{LotesListPage,LoteDetailPage,LoteFormDialog,ArquivarLoteButton}.tsx`;
`src/pages/dashboard/DashboardPage.tsx`;
`src/pages/comparativo/ComparativoPage.tsx`;
`src/components/ui/{table,select,badge,textarea,dialog}.tsx` (via shadcn CLI).

**Editados:** `src/router.tsx` (6 rotas reais substituindo `PlaceholderPage`).

**Não tocados:** nenhuma migration, nenhum arquivo em `supabase/`, nenhuma
rota de Eixo 2 (GTAs/transações/saldo/financeiro/declarações — continuam
`PlaceholderPage`).

## Pendências / próximos passos

- **Fecha a Fase 2 — Eixo 1 do ponto de vista de frontend** (spec seção 10,
  item 9). Ver seção 1 de `PROJECT_CONTEXT.md` atualizada.
- Seletor de fazenda multi-tenant (`useFazendaAtual` pega só o vínculo mais
  antigo) — não implementado, fora do escopo, fica como débito visível.
- Nenhum teste de componente/E2E real do frontend (Testing Library não
  instalada) — mesma lacuna da Fase 1, ainda maior agora com 6 telas novas
  de CRUD/formulário não exercitadas em runtime real.
- Bundle único >500kB pós-minificação, sem code-splitting por rota — aviso
  desde a Fase 1, ainda não endereçado (6 páginas novas aumentam o problema
  marginalmente, recharts é a maior contribuição de peso).
- `financeiro` não tem nenhuma tela específica nesta entrega (a spec nega
  qualquer acesso a Eixo 1 para esse papel, RLS já bloqueia no backend) — o
  frontend não esconde os itens de menu "Manejo Individual" condicionalmente
  por papel; um usuário financeiro veria os links no `AppShell` e receberia
  erro/lista vazia ao tentar usá-los (RLS filtra, não vaza dado, mas a UX é
  ruim). Não implementado por estar fora do escopo desta tarefa — pendência
  de UX para uma rodada futura.
