create or replace function public.erp_master_sewa_update_full(
  p_branch_code text,
  p_monthly_rent numeric,
  p_period_type text,
  p_due_rule text,
  p_loss_rule text,
  p_effective_from date,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.master_biaya_sewa_tempat%rowtype;
  v_new public.master_biaya_sewa_tempat%rowtype;
begin
  if coalesce(trim(p_branch_code),'') = '' then raise exception 'Cabang wajib diisi'; end if;
  if p_monthly_rent is null or p_monthly_rent <= 0 then raise exception 'Nominal sewa harus lebih dari 0'; end if;
  if p_effective_from is null then raise exception 'Tanggal berlaku wajib diisi'; end if;
  select * into v_old from public.master_biaya_sewa_tempat
  where branch_code = p_branch_code and upper(status) = 'AKTIF' and effective_to is null
  order by id desc limit 1 for update;
  if not found then raise exception 'Master sewa aktif untuk cabang % tidak ditemukan', p_branch_code; end if;
  if v_old.effective_from is not null and v_old.effective_from = p_effective_from then
    update public.master_biaya_sewa_tempat
    set monthly_rent=p_monthly_rent,
        period_type=upper(coalesce(nullif(trim(p_period_type),''),'BULANAN')),
        due_rule=upper(coalesce(nullif(trim(p_due_rule),''),'AKHIR_BULAN')),
        loss_rule=upper(coalesce(nullif(trim(p_loss_rule),''),'JADI_HUTANG_BULAN_BERIKUTNYA')),
        notes=p_notes, updated_at=now()
    where id=v_old.id returning * into v_new;
  else
    update public.master_biaya_sewa_tempat
    set effective_to=p_effective_from-1,status='SELESAI',updated_at=now()
    where id=v_old.id;
    insert into public.master_biaya_sewa_tempat(
      branch_code,branch_name,monthly_rent,period_type,due_rule,loss_rule,effective_from,effective_to,status,notes
    ) values (
      v_old.branch_code,v_old.branch_name,p_monthly_rent,
      upper(coalesce(nullif(trim(p_period_type),''),'BULANAN')),
      upper(coalesce(nullif(trim(p_due_rule),''),'AKHIR_BULAN')),
      upper(coalesce(nullif(trim(p_loss_rule),''),'JADI_HUTANG_BULAN_BERIKUTNYA')),
      p_effective_from,null,'AKTIF',p_notes
    ) returning * into v_new;
  end if;
  return to_jsonb(v_new);
end;
$$;

grant execute on function public.erp_master_sewa_update_full(text,numeric,text,text,text,date,text) to anon, authenticated, service_role;

create or replace function public.erp_master_investor_update_full(
  p_branch_code text,
  p_investor_name text,
  p_profit_share_percent numeric,
  p_rent_entitlement boolean,
  p_profit_basis text,
  p_deductions_before_share text,
  p_payment_day_start smallint,
  p_payment_day_end smallint,
  p_payment_timing text,
  p_effective_from date,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.master_investor%rowtype;
  v_new public.master_investor%rowtype;
begin
  if coalesce(trim(p_branch_code),'') = '' then raise exception 'Cabang wajib diisi'; end if;
  if coalesce(trim(p_investor_name),'') = '' then raise exception 'Nama investor wajib diisi'; end if;
  if p_profit_share_percent is null or p_profit_share_percent < 0 or p_profit_share_percent > 100 then raise exception 'Persentase harus 0 sampai 100'; end if;
  if p_payment_day_start is null or p_payment_day_end is null or p_payment_day_start < 1 or p_payment_day_start > 31 or p_payment_day_end < 1 or p_payment_day_end > 31 or p_payment_day_start > p_payment_day_end then raise exception 'Rentang tanggal pembayaran tidak valid'; end if;
  if p_effective_from is null then raise exception 'Tanggal berlaku wajib diisi'; end if;
  select * into v_old from public.master_investor
  where branch_code = p_branch_code and upper(status) = 'AKTIF' and effective_to is null
  order by id desc limit 1 for update;
  if not found then raise exception 'Master investor aktif untuk cabang % tidak ditemukan', p_branch_code; end if;
  if v_old.effective_from is not null and v_old.effective_from = p_effective_from then
    update public.master_investor
    set investor_name=trim(p_investor_name),
        profit_share_percent=p_profit_share_percent,
        rent_entitlement=coalesce(p_rent_entitlement,true),
        profit_basis=upper(coalesce(nullif(trim(p_profit_basis),''),'LABA_BERSIH')),
        deductions_before_share=coalesce(nullif(trim(p_deductions_before_share),''),'SEWA + GAJI + OPERASIONAL + BIAYA_LAIN_DISETUJUI'),
        payment_day_start=p_payment_day_start,
        payment_day_end=p_payment_day_end,
        payment_timing=upper(coalesce(nullif(trim(p_payment_timing),''),'AWAL_BULAN')),
        notes=p_notes,updated_at=now()
    where id=v_old.id returning * into v_new;
  else
    update public.master_investor
    set effective_to=p_effective_from-1,status='SELESAI',updated_at=now()
    where id=v_old.id;
    insert into public.master_investor(
      branch_code,branch_name,investor_name,profit_share_percent,rent_entitlement,profit_basis,
      deductions_before_share,payment_day_start,payment_day_end,payment_timing,status,notes,effective_from,effective_to
    ) values (
      v_old.branch_code,v_old.branch_name,trim(p_investor_name),p_profit_share_percent,
      coalesce(p_rent_entitlement,true),upper(coalesce(nullif(trim(p_profit_basis),''),'LABA_BERSIH')),
      coalesce(nullif(trim(p_deductions_before_share),''),'SEWA + GAJI + OPERASIONAL + BIAYA_LAIN_DISETUJUI'),
      p_payment_day_start,p_payment_day_end,upper(coalesce(nullif(trim(p_payment_timing),''),'AWAL_BULAN')),
      'AKTIF',p_notes,p_effective_from,null
    ) returning * into v_new;
  end if;
  return to_jsonb(v_new);
end;
$$;

grant execute on function public.erp_master_investor_update_full(text,text,numeric,boolean,text,text,smallint,smallint,text,date,text) to anon, authenticated, service_role;