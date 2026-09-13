-- ERP VAX — Historical Payroll Corrections V1
-- Additive overlay only. Does NOT modify immutable period snapshots or LOCKED payroll engine/formulas.

create table if not exists public.payroll_historical_corrections (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  employee_id bigint not null references public.karyawan(id),
  gaji_pokok_override numeric(14,2) null check (gaji_pokok_override is null or gaji_pokok_override >= 0),
  bonus_insentif_override numeric(14,2) null check (bonus_insentif_override is null or bonus_insentif_override >= 0),
  bonus_kpi_override numeric(14,2) null check (bonus_kpi_override is null or bonus_kpi_override >= 0),
  note text null,
  created_by uuid null default auth.uid(),
  updated_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_historical_corrections_month_start check (period_month = date_trunc('month', period_month)::date),
  constraint payroll_historical_corrections_unique unique (period_month, employee_id)
);

create table if not exists public.payroll_historical_corrections_audit (
  id bigserial primary key,
  correction_id uuid null,
  action text not null check (action in ('INSERT','UPDATE')),
  old_row jsonb null,
  new_row jsonb null,
  changed_by uuid null default auth.uid(),
  changed_at timestamptz not null default now()
);

create or replace function public.payroll_historical_corrections_audit_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op='INSERT' then
    insert into public.payroll_historical_corrections_audit(correction_id,action,old_row,new_row,changed_by)
    values(new.id,'INSERT',null,to_jsonb(new),auth.uid());
    return new;
  elsif tg_op='UPDATE' then
    insert into public.payroll_historical_corrections_audit(correction_id,action,old_row,new_row,changed_by)
    values(new.id,'UPDATE',to_jsonb(old),to_jsonb(new),auth.uid());
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payroll_historical_corrections_audit on public.payroll_historical_corrections;
create trigger trg_payroll_historical_corrections_audit
after insert or update on public.payroll_historical_corrections
for each row execute function public.payroll_historical_corrections_audit_fn();

alter table public.payroll_historical_corrections enable row level security;
alter table public.payroll_historical_corrections_audit enable row level security;
revoke all on public.payroll_historical_corrections from anon;
revoke all on public.payroll_historical_corrections_audit from anon;
grant select on public.payroll_historical_corrections to authenticated;
grant select on public.payroll_historical_corrections_audit to authenticated;

drop policy if exists payroll_historical_corrections_select on public.payroll_historical_corrections;
create policy payroll_historical_corrections_select on public.payroll_historical_corrections
for select to authenticated
using (
  is_erp_owner() or is_erp_spv() or employee_id = (select p.karyawan_id from public.profiles p where p.id=auth.uid() limit 1)
);

drop policy if exists payroll_historical_corrections_audit_select on public.payroll_historical_corrections_audit;
create policy payroll_historical_corrections_audit_select on public.payroll_historical_corrections_audit
for select to authenticated
using (is_erp_owner());

create or replace function public.erp_get_historical_payroll_corrections(p_period_month date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_month date;
  v_end date;
  v_locked boolean;
  v_scope text;
  v_employee_id bigint;
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_month := date_trunc('month',p_period_month)::date;
  v_end := (v_month + interval '1 month - 1 day')::date;

  select id,role,aktif,karyawan_id into v_profile from public.profiles where id=v_uid limit 1;
  if v_profile.id is null or v_profile.aktif is not true then raise exception 'ERP_PROFILE_INACTIVE'; end if;

  select exists(select 1 from public.erp_period_snapshots s where s.period_start=v_month and s.period_end=v_end and s.status='LOCKED') into v_locked;
  if not v_locked then return jsonb_build_object('status','NOT_LOCKED','rows','[]'::jsonb); end if;

  if lower(trim(coalesce(v_profile.role,'')))='owner' then v_scope:='OWNER';
  elsif lower(trim(coalesce(v_profile.role,''))) in ('spv','svp') then v_scope:='SPV';
  elsif v_profile.karyawan_id is not null then v_scope:='SELF'; v_employee_id:=v_profile.karyawan_id;
  else raise exception 'ERP_SNAPSHOT_ACCESS_DENIED'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'period_month',c.period_month,'employee_id',c.employee_id,
    'gaji_pokok_override',c.gaji_pokok_override,
    'bonus_insentif_override',c.bonus_insentif_override,
    'bonus_kpi_override',c.bonus_kpi_override,
    'note',c.note,'updated_at',c.updated_at
  ) order by c.employee_id),'[]'::jsonb)
  into v_rows
  from public.payroll_historical_corrections c
  where c.period_month=v_month
    and (v_scope in ('OWNER','SPV') or c.employee_id=v_employee_id);

  return jsonb_build_object('status','LOCKED','scope',v_scope,'rows',v_rows);
end;
$$;

create or replace function public.erp_save_historical_payroll_correction(
  p_period_month date,
  p_employee_id bigint,
  p_gaji_pokok_override numeric default null,
  p_bonus_insentif_override numeric default null,
  p_bonus_kpi_override numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date;
  v_end date;
  v_locked boolean;
  v_row public.payroll_historical_corrections%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not is_erp_owner() then raise exception 'OWNER_ONLY'; end if;
  if p_employee_id is null then raise exception 'EMPLOYEE_REQUIRED'; end if;

  v_month:=date_trunc('month',p_period_month)::date;
  v_end:=(v_month + interval '1 month - 1 day')::date;
  select exists(select 1 from public.erp_period_snapshots s where s.period_start=v_month and s.period_end=v_end and s.status='LOCKED') into v_locked;
  if not v_locked then raise exception 'PERIOD_NOT_LOCKED'; end if;

  insert into public.payroll_historical_corrections(
    period_month,employee_id,gaji_pokok_override,bonus_insentif_override,bonus_kpi_override,note,created_by,updated_by,updated_at
  ) values(
    v_month,p_employee_id,p_gaji_pokok_override,p_bonus_insentif_override,p_bonus_kpi_override,nullif(trim(coalesce(p_note,'')),''),auth.uid(),auth.uid(),now()
  )
  on conflict(period_month,employee_id) do update set
    gaji_pokok_override=excluded.gaji_pokok_override,
    bonus_insentif_override=excluded.bonus_insentif_override,
    bonus_kpi_override=excluded.bonus_kpi_override,
    note=excluded.note,
    updated_by=auth.uid(),
    updated_at=now()
  returning * into v_row;

  return jsonb_build_object('status','OK','row',to_jsonb(v_row));
end;
$$;

revoke all on function public.erp_get_historical_payroll_corrections(date) from public;
revoke all on function public.erp_save_historical_payroll_correction(date,bigint,numeric,numeric,numeric,text) from public;
grant execute on function public.erp_get_historical_payroll_corrections(date) to authenticated;
grant execute on function public.erp_save_historical_payroll_correction(date,bigint,numeric,numeric,numeric,text) to authenticated;

create or replace function public.erp_read_locked_payroll_snapshot_v4(p_period_start date,p_period_end date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_corr jsonb;
begin
  v_result:=public.erp_read_locked_payroll_snapshot_v3(p_period_start,p_period_end);
  if upper(coalesce(v_result->>'status',''))<>'LOCKED' then return v_result; end if;
  v_corr:=public.erp_get_historical_payroll_corrections(p_period_start);
  return jsonb_set(v_result,'{historical_corrections}',coalesce(v_corr->'rows','[]'::jsonb),true);
end;
$$;

revoke all on function public.erp_read_locked_payroll_snapshot_v4(date,date) from public;
grant execute on function public.erp_read_locked_payroll_snapshot_v4(date,date) to authenticated;