-- ERP VAX — Kasbon Monthly No-Arus-Kas V2
-- Owner decision 2026-09-11:
-- - Pencairan Kasbon tetap AUTO mengurangi KAS_BESAR.
-- - Pembayaran HARIAN / OWNER_MANUAL yang benar-benar mengembalikan uang tetap AUTO menambah KAS_BESAR.
-- - Potongan Kasbon BULANAN via PAYROLL TIDAK boleh membuat Arus Kas masuk ke KAS_BESAR,
--   karena nilai Kasbon sudah menjadi pengurang Gaji Bersih dan tidak ada uang fisik yang masuk kembali.
-- Scope: hanya override RPC pembayaran Kasbon; tidak mengubah engine/formula Arus Kas.

create or replace function public.erp_kasbon_record_payment(
  p_kasbon_id uuid,p_amount numeric,p_payment_date date default null,p_note text default null,
  p_source text default 'SVP_HARIAN',p_payroll_period date default null,p_dedupe_key text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_k public.employee_cash_advances%rowtype;
  v_payment_id uuid;
  v_new_outstanding numeric;
  v_is_owner boolean:=public.is_erp_owner();
  v_is_spv boolean:=public.is_erp_spv();
  v_source text:=upper(trim(coalesce(p_source,'')));
  v_date date:=coalesce(p_payment_date,(timezone('Asia/Jakarta',now()))::date);
begin
  if not(v_is_owner or v_is_spv) then raise exception 'Akses pembayaran kasbon ditolak'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Nominal pembayaran harus > 0'; end if;
  if v_source not in ('PAYROLL','SVP_HARIAN','OWNER_MANUAL') then raise exception 'Source pembayaran tidak valid'; end if;

  select * into v_k
  from public.employee_cash_advances
  where id=p_kasbon_id
  for update;

  if not found then raise exception 'Kasbon tidak ditemukan'; end if;
  if v_k.status not in ('DICAIRKAN','AKTIF') then raise exception 'Kasbon belum aktif / sudah selesai'; end if;
  if coalesce(v_k.current_outstanding,0)<=0 then raise exception 'Kasbon tidak memiliki outstanding'; end if;
  if p_amount>v_k.current_outstanding then raise exception 'Pembayaran melebihi outstanding'; end if;

  if v_source='SVP_HARIAN' and v_k.payment_method<>'HARIAN' then
    raise exception 'Kasbon ini bukan metode HARIAN';
  end if;

  if v_source='PAYROLL' then
    if not v_is_owner then raise exception 'Pembayaran PAYROLL hanya boleh diposting Owner'; end if;
    if v_k.payment_method<>'BULANAN' then raise exception 'Kasbon ini bukan metode BULANAN'; end if;
    if p_payroll_period is null then raise exception 'payroll_period wajib untuk pembayaran PAYROLL'; end if;
  end if;

  if v_source='OWNER_MANUAL' and not v_is_owner then
    raise exception 'OWNER_MANUAL hanya boleh Owner';
  end if;

  insert into public.employee_cash_advance_payments(
    kasbon_id,employee_id,branch_id,payment_date,amount,payment_method,source,
    payroll_period,note,dedupe_key,created_by,metadata
  ) values(
    v_k.id,v_k.employee_id,v_k.branch_id,v_date,p_amount,v_k.payment_method,v_source,
    p_payroll_period,nullif(trim(coalesce(p_note,'')),''),p_dedupe_key,auth.uid(),
    jsonb_build_object('outstanding_before',v_k.current_outstanding)
  ) returning id into v_payment_id;

  v_new_outstanding:=greatest(0,v_k.current_outstanding-p_amount);

  perform set_config('erp.kasbon_payment_internal','1',true);
  update public.employee_cash_advances
  set total_paid=coalesce(total_paid,0)+p_amount,
      current_outstanding=v_new_outstanding,
      status=case when v_new_outstanding=0 then 'LUNAS' else status end,
      settled_at=case when v_new_outstanding=0 then now() else settled_at end
  where id=v_k.id;
  perform set_config('erp.kasbon_payment_internal','0',true);

  -- Hanya pembayaran yang benar-benar mengembalikan uang yang masuk kembali ke KAS_BESAR.
  -- PAYROLL/BULANAN adalah potongan Gaji Bersih, jadi tidak membuat mutasi Arus Kas masuk.
  if v_source <> 'PAYROLL' then
    insert into public.arus_kas_v2_transactions(
      tanggal,amount,from_wallet,to_wallet,entry_type,category,description,source_type,source_key,
      source_period_start,source_period_end,verification_status,created_by,updated_by,metadata
    ) values(
      v_date,p_amount,'EXTERNAL','KAS_BESAR','AUTO','KASBON',
      'Pembayaran Kasbon - '||v_k.employee_name_snapshot,
      'KASBON_PAYMENT',v_payment_id::text,v_date,v_date,
      case when v_is_owner then 'OWNER_VERIFIED' else 'BELUM_DIVERIFIKASI' end,
      auth.uid(),auth.uid(),
      jsonb_build_object(
        'kasbon_id',v_k.id,
        'payment_id',v_payment_id,
        'employee_id',v_k.employee_id,
        'employee_name',v_k.employee_name_snapshot,
        'branch_id',v_k.branch_id,
        'branch_name',v_k.branch_name_snapshot,
        'payment_method',v_k.payment_method,
        'payment_source',v_source,
        'outstanding_before',v_k.current_outstanding,
        'outstanding_after',v_new_outstanding,
        'event','PAYMENT'
      )
    ) on conflict(source_type,source_key) do nothing;
  end if;

  perform public.erp_kasbon_write_history(
    v_k.id,
    v_k.status,
    case when v_new_outstanding=0 then 'LUNAS' else v_k.status end,
    nullif(trim(coalesce(p_note,'')),''),
    v_k.current_outstanding,
    v_new_outstanding,
    jsonb_build_object(
      'event','PAYMENT',
      'payment_id',v_payment_id,
      'payment_source',v_source,
      'payment_method',v_k.payment_method,
      'amount',p_amount,
      'payment_date',v_date,
      'arus_kas_posted',case when v_source='PAYROLL' then false else true end
    )
  );

  return v_payment_id;
end $$;

revoke all on function public.erp_kasbon_record_payment(uuid,numeric,date,text,text,date,text) from public;
grant execute on function public.erp_kasbon_record_payment(uuid,numeric,date,text,text,date,text) to authenticated;
