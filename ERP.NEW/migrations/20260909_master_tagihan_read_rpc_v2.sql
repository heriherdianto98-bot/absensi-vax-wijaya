-- ERP VAX — MASTER TAGIHAN READ RPC V2
-- Read-only helper for Owner/SPV authenticated sessions.
-- Does not touch Cash Out, Arus Kas, Minutes, or reminder delivery.

create or replace function public.get_master_tagihan()
returns setof public.master_tagihan
language sql
security definer
set search_path=public
as $$
  select m.*
  from public.master_tagihan m
  where exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('owner','svp','spv')
      and coalesce(p.aktif,true)=true
  )
  order by m.jatuh_tempo_hari asc, m.kategori asc, m.cabang asc;
$$;

revoke all on function public.get_master_tagihan() from public;
grant execute on function public.get_master_tagihan() to authenticated;
