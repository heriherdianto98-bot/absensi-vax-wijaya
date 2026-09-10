alter table public.master_investor add column if not exists effective_from date null;
alter table public.master_investor add column if not exists effective_to date null;

alter table public.master_biaya_sewa_tempat drop constraint if exists master_biaya_sewa_tempat_branch_code_key;
alter table public.master_investor drop constraint if exists master_investor_branch_code_key;
drop index if exists public.master_biaya_sewa_tempat_branch_code_key;
drop index if exists public.master_investor_branch_code_key;

create unique index if not exists uq_master_sewa_active_branch
on public.master_biaya_sewa_tempat(branch_code)
where effective_to is null and status='AKTIF';

create unique index if not exists uq_master_investor_active_branch
on public.master_investor(branch_code)
where effective_to is null and status='AKTIF';

create index if not exists idx_master_sewa_branch_period
on public.master_biaya_sewa_tempat(branch_code,effective_from,effective_to);
create index if not exists idx_master_investor_branch_period
on public.master_investor(branch_code,effective_from,effective_to);

create or replace function public.erp_master_finance_get()
returns jsonb language sql security definer set search_path=public as $$
select jsonb_build_object(
  'sewa',coalesce((select jsonb_agg(to_jsonb(s) order by s.branch_name,s.effective_from nulls first,s.id) from public.master_biaya_sewa_tempat s),'[]'::jsonb),
  'investor',coalesce((select jsonb_agg(to_jsonb(i) order by i.branch_name,i.effective_from nulls first,i.id) from public.master_investor i),'[]'::jsonb)
);
$$;
grant execute on function public.erp_master_finance_get() to anon,authenticated;

create or replace function public.erp_master_sewa_set(p_branch_code text,p_monthly_rent numeric,p_effective_from date,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old public.master_biaya_sewa_tempat%rowtype; v_new public.master_biaya_sewa_tempat%rowtype;
begin
  if nullif(trim(p_branch_code),'') is null then raise exception 'Cabang wajib diisi'; end if;
  if coalesce(p_monthly_rent,0)<=0 then raise exception 'Nominal sewa harus lebih dari 0'; end if;
  if p_effective_from is null then raise exception 'Tanggal berlaku wajib diisi'; end if;
  select * into v_old from public.master_biaya_sewa_tempat where branch_code=p_branch_code and effective_to is null and status='AKTIF' order by id desc limit 1 for update;
  if not found then raise exception 'Master sewa aktif cabang % tidak ditemukan',p_branch_code; end if;
  if v_old.effective_from is not null and p_effective_from<v_old.effective_from then raise exception 'Tanggal berlaku tidak boleh sebelum periode aktif'; end if;
  if v_old.effective_from=p_effective_from then
    update public.master_biaya_sewa_tempat set monthly_rent=p_monthly_rent,notes=p_notes,updated_at=now() where id=v_old.id returning * into v_new;
  else
    update public.master_biaya_sewa_tempat set effective_to=p_effective_from-1,status='SELESAI',updated_at=now() where id=v_old.id;
    insert into public.master_biaya_sewa_tempat(branch_code,branch_name,monthly_rent,period_type,due_rule,loss_rule,effective_from,effective_to,status,notes,created_at,updated_at)
    values(v_old.branch_code,v_old.branch_name,p_monthly_rent,v_old.period_type,v_old.due_rule,v_old.loss_rule,p_effective_from,null,'AKTIF',p_notes,now(),now()) returning * into v_new;
  end if;
  return to_jsonb(v_new);
end;
$$;
grant execute on function public.erp_master_sewa_set(text,numeric,date,text) to anon,authenticated;

create or replace function public.erp_master_investor_set(p_branch_code text,p_profit_share_percent numeric,p_effective_from date,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old public.master_investor%rowtype; v_new public.master_investor%rowtype;
begin
  if nullif(trim(p_branch_code),'') is null then raise exception 'Cabang wajib diisi'; end if;
  if p_profit_share_percent is null or p_profit_share_percent<0 or p_profit_share_percent>100 then raise exception 'Persentase harus antara 0 dan 100'; end if;
  if p_effective_from is null then raise exception 'Tanggal berlaku wajib diisi'; end if;
  select * into v_old from public.master_investor where branch_code=p_branch_code and effective_to is null and status='AKTIF' order by id desc limit 1 for update;
  if not found then raise exception 'Master investor aktif cabang % tidak ditemukan',p_branch_code; end if;
  if v_old.effective_from is not null and p_effective_from<v_old.effective_from then raise exception 'Tanggal berlaku tidak boleh sebelum periode aktif'; end if;
  if v_old.effective_from=p_effective_from then
    update public.master_investor set profit_share_percent=p_profit_share_percent,notes=p_notes,updated_at=now() where id=v_old.id returning * into v_new;
  else
    update public.master_investor set effective_to=p_effective_from-1,status='SELESAI',updated_at=now() where id=v_old.id;
    insert into public.master_investor(branch_code,branch_name,investor_name,profit_share_percent,rent_entitlement,profit_basis,deductions_before_share,payment_day_start,payment_day_end,payment_timing,effective_from,effective_to,status,notes,created_at,updated_at)
    values(v_old.branch_code,v_old.branch_name,v_old.investor_name,p_profit_share_percent,v_old.rent_entitlement,v_old.profit_basis,v_old.deductions_before_share,v_old.payment_day_start,v_old.payment_day_end,v_old.payment_timing,p_effective_from,null,'AKTIF',p_notes,now(),now()) returning * into v_new;
  end if;
  return to_jsonb(v_new);
end;
$$;
grant execute on function public.erp_master_investor_set(text,numeric,date,text) to anon,authenticated;