-- ============================================================================
-- Migration: policy de DELETE em public.lotes
--
-- Contexto: a Fase 2 (20260717140000_fase2_lotes_animais_pesagens.sql)
-- deliberadamente não criou policy de DELETE em `lotes` — a decisão de
-- modelagem da época era "arquivamento é flag (ativo=false), não exclusão
-- física". JP pediu, nesta sessão, uma opção real de "Excluir" lote (com
-- dupla confirmação na UI), ao lado de "Arquivar" — isso exige a policy que
-- faltava.
--
-- Por que é seguro: animais.lote_id já usa `on delete set null` (Fase 2) —
-- excluir um lote nunca apaga os animais associados, só desvincula
-- (`lote_id` volta a NULL, "Sem lote"). Nenhuma outra tabela referencia
-- `lotes(id)`. Mesma fronteira de acesso já usada em
-- lotes_select/insert/update_vinculada (admin/membro, financeiro excluído,
-- spec seção 5.4).
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- ============================================================================

create policy lotes_delete_vinculada
  on public.lotes
  for delete
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

comment on policy lotes_delete_vinculada on public.lotes is
  'Exclusão física de lote — mesma fronteira das demais policies de lotes '
  '(admin/membro da fazenda vinculada, financeiro excluído). Segura por '
  'animais.lote_id usar ON DELETE SET NULL (Fase 2) — nunca apaga animais, '
  'só desvincula.';
