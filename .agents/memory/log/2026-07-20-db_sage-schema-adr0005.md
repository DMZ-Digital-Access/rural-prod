# Log — Schema ADR-0005: expansão de transacoes (nascimento/obito/consumo, docs independentes, saldo Não classificado) — `db_sage` (SOFIA)

- **Data:** 2026-07-20
- **Agente responsável:** db_sage (SOFIA) — implementação do ADR-0005
  (`.agents/memory/adr/ADR-0005-expansao-transacoes-doc-tracking.md`), motivado pelo pedido de
  JP de mudar a UX da tela de Animais ("Individualizar Animal" + "Entradas e Saídas de Animais
  de Lote").

## O que foi feito

Migration nova `supabase/migrations/20260720210000_adr0005_expansao_transacoes.sql`, aditiva
sobre os itens 11 e 12 (já gateados no mesmo dia, não editados):

1. `tipo_operacao` (transacoes e transacoes_animais.tipo_operacao_transacao): 4→7 valores,
   `nascimento`/`obito`/`consumo` somados aos já existentes.
2. `aplicar_status_animal_apos_vinculo()` estendida: `obito`→`morte`, `consumo`→`baixa` (mesmo
   domínio de `animais.status` da Fase 2). `nascimento` deliberadamente fora do mecanismo — trata
   como `compra` (agregado só, sem `transacoes_animais`).
3. `transacoes` ganha `arquivo_nota_path`/`arquivo_nota_mime_type`,
   `arquivo_contranota_path`/`arquivo_contranota_mime_type` (nullable), `peso_total_kg`
   (nullable); perde `tem_contranota` (substituída pela presença do arquivo).
4. `transacoes_detalhe.agrupamento_etario_id` vira nullable — permite lançar sexo sem faixa
   etária (tela nova de Entradas/Saídas de Lote).
5. `saldo_rebanho_movimentos` reescrita (resolve `especie_id` direto de
   `transacoes.especie_id`); `obter_saldo_rebanho()` ganha seção "Não classificado" (UNION,
   só aparece com movimento real).

## Validação real executada (local)

`supabase db reset` aplicou as 9 migrations sem erro. Usuários reais via GoTrue local:
- **Nascimento** (3 macho + 2 fêmea, Bovino 0-12 meses): aparece corretamente como entrada (+)
  no saldo, sem nenhuma linha em `transacoes_animais`.
- **Óbito** vinculado a animal existente: `animais.status` → `morte`.
- **Consumo** vinculado a animal existente: `animais.status` → `baixa`.
- **Sexo sem faixa etária** (4 macho + 3 fêmea): aparece isolado na linha "Não classificado",
  separado das faixas regulatórias reais (que continuam 0/0 sem poluição).
- **Regressão:** reprodução do cenário Ovino 0-12 meses do gate do item 12 (8 macho/19 fêmea) —
  números idênticos após a reescrita da view.
- **`financeiro`** vê os mesmos números que `admin` na linha "Não classificado"; `anon` vê 0
  linhas.

## Mudanças de arquivo

- Novo `supabase/migrations/20260720210000_adr0005_expansao_transacoes.sql`.
- Este log; log do gate do `cyber_chief`
  (`.agents/memory/log/2026-07-20-cyber_chief-review-adr0005.md`); `PROJECT_CONTEXT.md`.

## Pendências

- Gate do `cyber_chief`: **CONCLUÍDO no mesmo dia, 🟢, sem correção necessária.**
- Item 14 (Storage): as colunas de arquivo de Nota/Contranota ficam sempre `null` até os
  buckets existirem.
- Frontend: renomear "Novo Animal"→"Individualizar Animal" + novo fluxo "Entradas e Saídas de
  Animais de Lote" — próxima tarefa desta sessão, escopo de `developer`.
- `supabase db push` não executado nesta entrada — decisão humana/orchestrator.
