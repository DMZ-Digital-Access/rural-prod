# Log — Security review ADR-0006: animais pendentes de individualização — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-20
- **Agente responsável:** cyber_chief (Constantine) — gate de segurança de
  `supabase/migrations/20260720230000_adr0006_animais_pendentes.sql`, que reabre (de forma
  aditiva) o schema de `animais` (Fase 2, já gateado) e `registrar_entrada_saida_lote()`
  (ADR-0005, já gateada no mesmo dia).
- **Veredito:** 🟢 Seguro. Liberada para `supabase db push`.

## Ponto 1 — `calcular_categoria_animal()` NULL-safe

**Achado corrigido na própria migration (não um achado novo deste gate — já antecipado no
ADR-0006 D2 pela própria `db_sage`):** sem o `when p_idade_meses is null then null` explícito, o
`CASE` cairia no `ELSE` e fabricaria `'Boi'`/`'Vaca'` (categoria de animal ADULTO) para um animal
cuja idade é desconhecida. Não é uma falha de autorização, mas uma classe de bug que a squad já
tratou como prioritária em gates anteriores (dado exibido ao usuário que parece correto mas é
fabricado). Validado por teste real: 7 animais pendentes criados via
`registrar_entrada_saida_lote('compra', ...)` retornam `categoria = NULL`/`idade_meses = NULL`
em `animais_com_detalhes`, não uma categoria fabricada.

## Ponto 2 — INSERT em `animais` dentro de `registrar_entrada_saida_lote()` (SECURITY INVOKER)

**Sem achado.** A função continua `SECURITY INVOKER` (ADR-0005, inalterado) — o novo `INSERT`
em `public.animais` roda com o privilégio do chamador, respeitando a RLS de `animais` já
estabelecida na Fase 2 (`admin`/`membro`, `financeiro` excluído). Nenhuma elevação de privilégio
introduzida. Consistente com o resto do schema desta fase.

## Ponto 3 — Geração de `identificacao` sem colisão

**Sem achado.** A extração do sequencial via `regexp_replace`/cast para `integer`, restrita por
`identificacao ~ '^{prefixo}[0-9]+$'`, evita que uma linha renomeada manualmente (fora do padrão
esperado) interfira no cálculo do próximo número. Validado por teste real: duas chamadas de
`compra` no MESMO dia para a MESMA fazenda continuam a sequência (001-005, depois 006-007) sem
colisão com `unique(fazenda_id, identificacao)`.

## Ponto 4 — `animais.data_nascimento`/`peso_inicial_kg` NULLABLE

**Sem achado de segurança** (mudança de integridade referencial/de negócio, não de
autorização). As `CHECK`s existentes (`peso_inicial_kg > 0`, `data_nascimento <= current_date`)
já passam corretamente com `NULL` — comportamento padrão do Postgres (uma `CHECK` só rejeita
quando avalia para `false`, nunca quando avalia para `NULL`) — nenhuma reescrita de constraint
foi necessária, confirmado por teste real sem erro de constraint ao inserir `animais` sem esses
dois campos.

## Restante da migration — revisado, sem achados adicionais

- Nenhuma policy de RLS nova/alterada — a mudança é inteiramente de schema (colunas nullable) e
  de lógica de função já auditada.
- Venda/Óbito/Consumo/Saída de Pastoreio confirmados sem efeito colateral em `animais` (nenhuma
  linha nova) — validado por teste real (contagem de `animais` inalterada após uma `venda`).

## [VERIFICAÇÃO DE DADOS]

- RLS / Controle de acesso: **validado** — usuário real via GoTrue local, sessão `authenticated`
  simulada. Nenhum teste de `financeiro` novo necessário aqui — a fronteira de `financeiro` em
  `transacoes`/`animais` já é a mesma testada nos gates anteriores do mesmo dia (ADR-0005, item
  11), e esta migration não introduz nenhuma policy nova a revisar.

## [NOTAS DO CONSTANTINE]

- "O achado mais valioso deste gate não foi de autorização — foi de correção silenciosa. Uma
  categoria fabricada (`'Boi'` para um animal de idade desconhecida) é o tipo de bug que passa
  despercebido em produção porque não gera erro nenhum, só um dado errado exibido com confiança."

## Mudanças de arquivo

- Nenhuma mudança em `supabase/migrations/20260720230000_adr0006_animais_pendentes.sql` —
  aprovada como está.
- Novo `.agents/memory/log/2026-07-20-cyber_chief-review-adr0006.md` (este log).
- `PROJECT_CONTEXT.md` — nova entrada + seções 1/4.

## Pendências

- `supabase db push` não executado neste log.
- Frontend: indicador visual de "pendente" na lista de Animais (categoria/peso em branco não é
  sinal suficientemente claro) — próxima tarefa de `developer`.
- Fluxo de "completar" um animal pendente (preencher `data_nascimento`/`peso_inicial_kg` via
  `EditarAnimalDialog`, hoje só edita identificação/lote/status) — não implementado ainda.
