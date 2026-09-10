-- ERP VAX — Owner-only safe delete for Kasbon test data
-- Scope: Kasbon only.
-- Hard delete is allowed ONLY before disbursement / payment posting.
-- DICAIRKAN / AKTIF / LUNAS are blocked to protect Arus Kas and Payroll audit trail.

create or replace function public.erp_kasbon_delete_test(p_kasbon_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_k public.employee_cash_advances%rowtype;
  v_has_payment boolean := false;
  v_has_arus boolean := false;
begin
  if not public.is_erp_owner() then
    raise exception 'Hapus data Kasbon hanya boleh Owner';
  end if;

  select * into v_k
  from public.employee_cash_advances
  where id = p_kasbon_id
  for update;

  if not found then
    raise exception 'Kasbon tidak ditemukan';
  end if;

  if upper(coalesce(v_k.status,'')) in ('DICAIRKAN','AKTIF','LUNAS') then
    raise exception 'Kasbon sudah masuk alur keuangan. Tidak boleh hard delete; gunakan koreksi/reversal.';
  end if;

  select exists(
    select 1 from public.employee_cash_advance_payments p
    where p.kasbon_id = p_kasbon_id
  ) into v_has_payment;

  if v_has_payment then
    raise exception 'Kasbon sudah memiliki pembayaran dan tidak boleh hard delete';
  end if;

  select exists(
    select 1
    from public.arus_kas_v2_transactions a
    where (a.source_type = 'KASBON_DISBURSEMENT' and a.source_key = p_kasbon_id::text)
       or (a.metadata ->> 'kasbon_id') = p_kasbon_id::text
  ) into v_has_arus;

  if v_has_arus then
    raise exception 'Kasbon sudah memiliki jejak Arus Kas dan tidak boleh hard delete';
  end if;

  -- Remove approval/status history first, then the test advance itself.
  delete from public.employee_cash_advance_history
  where kasbon_id = p_kasbon_id;

  delete from public.employee_cash_advances
  where id = p_kasbon_id;

  return true;
end;
$$;

revoke all on function public.erp_kasbon_delete_test(uuid) from public;
grant execute on function public.erp_kasbon_delete_test(uuid) to authenticated;
