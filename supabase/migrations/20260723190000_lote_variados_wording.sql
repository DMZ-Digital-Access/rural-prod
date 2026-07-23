-- Ajuste de texto (pedido de JP, 2026-07-23): quando os animais pesados numa
-- sessão de Dia de Pesagem pertencem a lotes diferentes, o texto exibido
-- passa de "Vários" para "Variados" — alinhado com o rótulo usado na aba
-- Pesagem (ao vivo), que mostra "Lotes: Variados" nesse mesmo caso (ver
-- DiaPesagemPage). Mesma função/assinatura de
-- 20260723150000_sessoes_pesagem.sql, só troca o literal do CASE.

create or replace function public.listar_sessoes_pesagem_finalizadas(p_fazenda_id uuid)
returns table (
  id                 uuid,
  iniciada_em        timestamptz,
  finalizada_em      timestamptz,
  usuario_nome       text,
  quantidade_animais bigint,
  peso_medio_kg      numeric,
  peso_total_kg      numeric,
  lote_nome          text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autorizado boolean;
begin
  select exists (
    select 1
      from public.usuarios_fazendas uf
     where uf.usuario_id = auth.uid()
       and uf.fazenda_id = p_fazenda_id
       and uf.papel <> 'financeiro'
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'Você não tem permissão para ver pesagens desta fazenda.';
  end if;

  return query
    select
      s.id,
      s.iniciada_em,
      s.finalizada_em,
      u.nome as usuario_nome,
      coalesce(stats.quantidade, 0)::bigint as quantidade_animais,
      stats.peso_medio_kg,
      stats.peso_total_kg,
      lote.lote_nome
    from public.sessoes_pesagem s
    join public.usuarios u on u.id = s.usuario_id
    left join lateral (
      select
        count(*) as quantidade,
        avg(p.peso_kg) as peso_medio_kg,
        sum(p.peso_kg) as peso_total_kg
      from public.pesagens p
     where p.sessao_pesagem_id = s.id
    ) stats on true
    left join lateral (
      select
        case
          when count(distinct coalesce(a.lote_id::text, '__sem_lote__')) = 0 then null
          when count(distinct coalesce(a.lote_id::text, '__sem_lote__')) = 1
               and bool_and(a.lote_id is null) then null
          when count(distinct coalesce(a.lote_id::text, '__sem_lote__')) = 1 then max(l.nome)
          else 'Variados'
        end as lote_nome
      from public.pesagens p
      join public.animais a on a.id = p.animal_id
      left join public.lotes l on l.id = a.lote_id
     where p.sessao_pesagem_id = s.id
    ) lote on true
   where s.fazenda_id = p_fazenda_id
     and s.finalizada_em is not null
   order by s.iniciada_em desc;
end;
$$;

comment on function public.listar_sessoes_pesagem_finalizadas(uuid) is
  '2026-07-23 — histórico de "Dia de Pesagem" (aba Histórico): data, quem '
  'registrou, lote derivado (todos os animais da sessão do mesmo lote → '
  'nome; nenhum lote → null; lotes diferentes → "Variados"), nº de animais, '
  'peso médio/total. SECURITY DEFINER pelo mesmo motivo de '
  'obter_sessao_pesagem_ativa (expor nome de usuário entre colegas).';
