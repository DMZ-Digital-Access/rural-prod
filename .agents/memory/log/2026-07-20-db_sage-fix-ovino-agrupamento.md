# Log — Correção de dado: faixas etárias de Ovino em agrupamentos_etarios — `db_sage` (SOFIA)

- **Data:** 2026-07-20
- **Agente responsável:** db_sage (SOFIA) — correção pontual, a pedido de JP após comparação
  com prints reais do sistema da Secretaria Estadual de Agricultura (mesma fonte de verdade que
  a spec cita para `Bovinos-saldo-atual.png` — item 12 da seção 10, checkpoint de validação de
  saldo).
- **O que motivou:** JP compartilhou 6 prints reais das telas "Saldo Atual" (Bovino e Ovino),
  "Controle de entradas e saídas" (planilha manual da fazenda, não da Secretaria), "Declarações"
  e "GTAs". O print de Ovino mostra as faixas etárias **"0-12 meses"** e **"mais de 12 meses"**
  (2 faixas) — diferente do que a migration `20260720120000_fase3_especies_agrupamentos.sql`
  havia semeado (**"0-6 meses"**/**"Mais de 6 meses"**), decisão que vinha da validação com o
  cliente registrada em 2026-07-16 (`PROJECT_CONTEXT.md` seção 2). O print de Bovino, por outro
  lado, confirmou que as faixas 0-12/13-24/25-36/Mais de 36 já semeadas estão corretas — sem
  mudança necessária ali.
- **Decisão:** JP confirmou seguir o print real (0-12/mais de 12), corrigindo a decisão anterior
  de 2026-07-16 para Ovino.
- **Por que uma migration NOVA em vez de editar `20260720120000` diretamente:** aquela migration
  já estava aplicada ao banco remoto (achado do gate do `cyber_chief` nesta mesma data, ver
  `PROJECT_CONTEXT.md` seção 1) — editar o conteúdo de uma migration já aplicada quebraria a
  reprodutibilidade (`supabase db reset` local aplicaria um conteúdo diferente do que já rodou no
  remoto). Migrations são sempre aditivas, mesmo para corrigir dado recente.
- **O que foi feito:** nova migration
  `supabase/migrations/20260720190000_fix_ovino_agrupamento_etario.sql` — 2 `UPDATE`s em
  `agrupamentos_etarios` (linhas existentes de Ovino, identificadas por `especie_id`/`ordem`,
  sem tocar `id`), corrigindo `label`/`idade_min`/`idade_max`. Nenhuma outra espécie/tabela
  tocada.
- **Por que é seguro sem gate novo do `cyber_chief`:** é uma correção de dado de seed numa
  tabela de catálogo já revisada (RLS/estrutura inalteradas, sem função/policy nova) — não abre
  nenhuma superfície de segurança nova. Nenhum dado de `transacoes_detalhe`/saldo depende dessas
  faixas ainda (item 12 não implementado), então a correção não tem efeito colateral em dado já
  lançado.
- **Validação:** `supabase db reset` local aplicou as 7 migrations sem erro; query direta
  confirmou Ovino com `0-12 meses`/`Mais de 12 meses` (`idade_min`/`idade_max` = 0/12 e 13/null).
  Aplicado ao remoto via `supabase db push` e reconfirmado por `psql` direto contra
  `bsoofshttpboaaokejwt` — mesmo resultado.
- **Achados secundários registrados, não bloqueantes (ver `PROJECT_CONTEXT.md` seção 4):** o
  print de Bovino tem uma aba "Vacinação" inexistente na spec/schema atual (não implementado
  agora); o print de Declarações lista "Caninos" como espécie (sempre 0 nesta fazenda,
  provavelmente categoria genérica do formulário do Estado) — não existe no catálogo de 8
  espécies do produto.
- **Pendências:** os 6 prints em si (imagens) não foram versionados no repositório — só a
  transcrição dos números relevantes foi usada para esta correção e fica registrada aqui. Se JP
  quiser os arquivos originais no repo (ex.: `docs/referencia/`), precisa fornecê-los como
  arquivo (o agente só os viu inline na conversa, sem um caminho de arquivo para copiar). Seguem
  como massa de teste de aceite para quando o item 12 (view de saldo de rebanho) for
  implementado.
