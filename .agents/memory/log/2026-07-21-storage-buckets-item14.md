# Log — Storage buckets, item 14 da spec — `db_sage`+`cyber_chief` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** terceiro dos 4 próximos passos combinados com JP.

## O que foi feito

Migration `20260721030000_fase3_storage_buckets.sql` — 3 buckets privados:
1. `declaracoes-rebanho` (só PDF, spec original) — `financeiro` lê, admin/membro escreve, sem
   DELETE (spec: nunca apagável).
2. `gtas-documentos` (PDF ou imagem, spec original) — `financeiro` ZERO acesso (mesma fronteira
   de `gtas`), admin/membro lê/escreve, sem DELETE.
3. `transacoes-documentos` (**novo, não estava na spec original — ADR-0005 D3**) — para os
   arquivos de Nota/Contranota (`transacoes.arquivo_nota_path`/`arquivo_contranota_path`).
   `financeiro` lê (mesma fronteira de `transacoes`), admin/membro escreve, sem DELETE.

Convenção de caminho `{fazenda_id}/...` em todos, RLS via
`(storage.foldername(name))[1]::uuid`.

## Validação atípica: direto no remoto, não `supabase db reset` local

CLI local desatualizada não inicializa o serviço `storage-api` (pendência conhecida desde a
Fase 1) — `supabase db reset` falha antes mesmo de chegar nesta migration
(`relation "storage.buckets" does not exist"`). Migration aplicada via `supabase db push`
direto ao remoto e validada com chamadas reais à Storage API (`@supabase/supabase-js`,
usuários reais via GoTrue): upload/download como admin nos 3 buckets; `financeiro` bloqueado em
GTA (zero acesso), liberado em Declarações/Transações (só leitura), bloqueado de escrever em
Declarações.

Gate do `cyber_chief` concluído (🟢) — ver
`.agents/memory/log/2026-07-21-cyber_chief-review-storage-buckets.md`.

## Pendências

- Frontend: upload real de arquivos ainda não implementado em nenhuma tela — as telas de
  GTA/Declarações (Fase 4, ainda não construídas) e os formulários de Entradas/Saídas
  (já existentes) precisam de um componente de upload apontando pros buckets certos. Fica para
  quando as telas do Eixo 2 forem construídas (próximo passo combinado com JP) ou como reforço
  posterior nos formulários já existentes.
- 3 arquivos de teste (conteúdo fake) permanecem nos buckets do remoto — sem `service_role` no
  `.env` para limpar via Storage API; sem risco real, ver log do gate.
- `especificacao-sistema.md`: item 14 (seção 10) e a lista de buckets (seção 7) ainda citam só
  2 buckets — vale uma entrada no changelog (seção 12) mencionando o bucket novo
  `transacoes-documentos`.
