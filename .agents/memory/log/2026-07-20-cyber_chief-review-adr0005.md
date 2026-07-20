# Log — Security review ADR-0005: expansão de transacoes (nascimento/obito/consumo, docs independentes, saldo Não classificado) — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-20
- **Agente responsável:** cyber_chief (Constantine) — gate de segurança de
  `supabase/migrations/20260720210000_adr0005_expansao_transacoes.sql`, que reabre (de forma
  aditiva) os itens 11 e 12 da Fase 3, ambos já gateados anteriormente no mesmo dia.
- **Veredito:** 🟢 Seguro. Liberada para `supabase db push`.

## Escopo do gate

Mudanças cobertas pelo ADR-0005: expansão de `tipo_operacao` (3 valores novos), extensão de
`aplicar_status_animal_apos_vinculo()` (ADR-0004 D2), 5 colunas novas + 1 removida em
`transacoes`, `agrupamento_etario_id` relaxado para nullable em `transacoes_detalhe`, reescrita
de `saldo_rebanho_movimentos` e `obter_saldo_rebanho()`.

## Ponto 1 — extensão do trigger `aplicar_status_animal_apos_vinculo()`

**Sem achado.** `SECURITY INVOKER` preservado (mesma justificativa do ADR-0004 D2: quem insere
em `transacoes_animais` já tem `UPDATE` direto em `animais.status` via a policy declarativa —
nenhuma elevação de privilégio introduzida pelos 2 ramos novos). Validado por teste real: um
animal vinculado a uma transação `obito` teve `status` alterado para `morte`; outro vinculado a
`consumo` teve `status` alterado para `baixa` — ambos valores já existentes no domínio de
`animais.status` desde a Fase 2, sem mudança de schema em `animais`. Nascimento confirmado FORA
do mecanismo (nenhuma linha esperada/testada em `transacoes_animais` para esse tipo — consistente
com o ADR).

## Ponto 2 — `transacoes_detalhe.agrupamento_etario_id` agora NULLABLE

**Sem achado de segurança** (é uma mudança de integridade referencial, não de autorização). A
FK composta de `agrupamentos_etarios.subtipo_especie_id` (item 10) já lida com MATCH SIMPLE e
colunas NULL desde a origem — o mesmo comportamento se aplica aqui sem necessidade de mudança
adicional. RLS de `transacoes_detalhe` (INSERT/SELECT/UPDATE, item 11) não referencia
`agrupamento_etario_id` em nenhuma policy — nenhuma policy precisou mudar.

## Ponto 3 — `saldo_rebanho_movimentos` resolvendo `especie_id` direto de `transacoes.especie_id`

**Avaliação: correta, sem achado.** Antes, a view obtinha `especie_id` via `JOIN
agrupamentos_etarios` (que exigia `agrupamento_etario_id` não-nulo); agora usa
`transacoes.especie_id` diretamente — mesma coluna, mesma tabela já protegida por RLS, nenhuma
exposição nova. `security_invoker=true` preservado. Validado por regressão: reproduzido
novamente o cenário Ovino 0-12 meses (8 macho/19 fêmea) já usado no gate do item 12 — números
idênticos após a reescrita, confirma que a mudança de fonte de `especie_id` não alterou o
comportamento para o caso já validado.

## Ponto 4 — seção "Não classificado" em `obter_saldo_rebanho()`

**Sem achado.** A nova CTE `nao_classificados` lê de `saldo_rebanho_movimentos` (já
RLS-protegida via `security_invoker`) e de `especies` (catálogo de leitura aberta, já revisado
no item 10) — nenhuma tabela nova consultada, nenhuma superfície nova. O filtro explícito `m.
fazenda_id in (select fazenda_id from fazendas_do_usuario)` é defesa em profundidade redundante
(a RLS de `saldo_rebanho_movimentos` já escopa isso), mantido por consistência com o padrão já
estabelecido no resto da função. Validado por teste real: `financeiro` e `admin` da mesma
fazenda leem o mesmo número (4 registrada) na linha "Não classificado"; `anon` continua vendo 0
linhas na função inteira.

## Ponto 5 — colunas novas de `transacoes` (arquivo_nota_path, arquivo_contranota_path,
## peso_total_kg) e remoção de `tem_contranota`

**Sem achado.** Todas nullable, sem policy nova necessária (RLS de `transacoes`, item 11, já
cobre a tabela inteira por linha, não por coluna). Nenhum dado sensível novo introduzido — são
apenas referências de caminho de arquivo (ainda sempre `null`, já que o bucket do item 14 não
existe) e um número opcional. Remoção de `tem_contranota`: confirmado que nenhuma outra parte do
schema (função, view, policy) referenciava essa coluna — `DROP COLUMN` limpo, sem quebra.

## [VERIFICAÇÃO DE DADOS]

- RLS / Controle de acesso: **validado** — mesmo padrão de smoke test real via `docker exec`/
  `psql` com usuários reais criados via GoTrue local, sessões `anon`/`authenticated`
  (`admin`/`financeiro`) simuladas via `set local role` + `request.jwt.claims`. Regressão do
  cenário Ovino do item 12 confirmada idêntica após a reescrita da view.

## [NOTAS DO CONSTANTINE]

- "Reabrir uma migration já gateada não é motivo de alarme por si só — o risco está em reabrir
  SEM revalidar o que já tinha sido fechado. A regressão do Ovino confirma que a reescrita não
  introduziu uma divergência silenciosa no número que já tínhamos validado contra o print real."

## Mudanças de arquivo

- Nenhuma mudança em `supabase/migrations/20260720210000_adr0005_expansao_transacoes.sql` —
  aprovada como está.
- Novo `.agents/memory/log/2026-07-20-cyber_chief-review-adr0005.md` (este log).
- `PROJECT_CONTEXT.md` — nova entrada + seções 1/4.

## Pendências

- `supabase db push` não executado neste log — decisão humana/orchestrator, mas parte do fluxo
  desta sessão.
- Item 14 (Storage) segue como dependência para os campos de arquivo de Nota/Contranota
  produzirem efeito real (upload de verdade).
- Frontend (Fase 4 adiantada): renomear botão + novo fluxo "Entradas e Saídas de Animais de
  Lote" — fora do escopo deste gate (schema apenas).
