-- ERP VAX — Kasbon Payment Flow V1
-- Business rule:
-- - Capster default HARIAN.
-- - Kasir / Supervisor / Floating / non-Capster default BULANAN.
-- - Owner may change method before disbursement.
-- - Disbursement posts AUTO Arus Kas OUT.
-- - Daily/monthly payment posts AUTO Arus Kas IN, reduces outstanding, auto LUNAS at zero.
-- - BULANAN is Payroll-only; HARIAN is SVP daily input.

alter table public.employee_cash_advances
  add column if not exists payment_method text,
  add column if not exists payment_method_set_at timestamptz,
  add column if not exists payment_method_set_by uuid references auth.users(id);

alter table public.employee_cash_advances disable trigger trg_employee_cash_advances_guard;
update public.employee_cash_advances
set payment_method = case
  when lower(coalesce(position_snapshot,'')) = 'capster' then 'HARIAN'
  else 'BULANAN'
end,
payment_method_set_at = coalesce(payment_method_set_at, now())
where payment_method is null;
alter table public.employee_cash_advances enable trigger trg_employee_cash_advances_guard;

alter table public.employee_cash_advances alter column payment_method set not null;
alter table public.employee_cash_advances drop constraint if exists employee_cash_advances_payment_method_check;
alter table public.employee_cash_advances add constraint employee_cash_advances_payment_method_check
  check (payment_method in ('BULANAN','HARIAN'));

create or replace function public.employee_cash_advances_payment_method_defaults_trg()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.payment_method is null then
      new.payment_method := case when lower(coalesce(new.position_snapshot,''))='capster' then 'HARIAN' else 'BULANAN' end;
    end if;
    new.payment_method_set_at := coalesce(new.payment_method_set_at,now());
    new.payment_method_set_by := coalesce(new.payment_method_set_by,auth.uid());
  elsif new.payment_method is distinct from old.payment_method then
    if not public.is_erp_owner() then raise exception 'Metode pembayaran kasbon hanya boleh diubah Owner'; end if;
    if old.status in ('DICAIRKAN','AKTIF','LUNAS') then raise exception 'Metode pembayaran tidak boleh diubah setelah kasbon dicairkan'; end if;
    new.payment_method_set_at := now(); new.payment_method_set_by := auth.uid();
  else
    new.payment_method_set_at := old.payment_method_set_at;
    new.payment_method_set_by := old.payment_method_set_by;
  end if;
  return new;
end $$;

drop trigger if exists trg_employee_cash_advances_payment_method_defaults on public.employee_cash_advances;
create trigger trg_employee_cash_advances_payment_method_defaults
before insert or update on public.employee_cash_advances
for each row execute function public.employee_cash_advances_payment_method_defaults_trg();

create table if not exists public.employee_cash_advance_payments(
  id uuid primary key default gen_random_uuid(),
  kasbon_id uuid not null references public.employee_cash_advances(id) on delete restrict,
  employee_id bigint not null,
  branch_id bigint not null,
  payment_date date not null default ((timezone('Asia/Jakarta',now()))::date),
  amount numeric not null check(amount>0),
  payment_method text not null check(payment_method in ('BULANAN','HARIAN')),
  source text not null check(source in ('PAYROLL','SVP_HARIAN','OWNER_MANUAL')),
  payroll_period date,
  note text,
  dedupe_key text unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists employee_cash_advance_payments_kasbon_idx on public.employee_cash_advance_payments(kasbon_id,payment_date desc);
create index if not exists employee_cash_advance_payments_employee_idx on public.employee_cash_advance_payments(employee_id,payment_date desc);
alter table public.employee_cash_advance_payments enable row level security;
drop policy if exists employee_cash_advance_payments_select_owner_spv on public.employee_cash_advance_payments;
create policy employee_cash_advance_payments_select_owner_spv on public.employee_cash_advance_payments
for select to authenticated using(public.is_erp_owner() or public.is_erp_spv());
revoke insert,update,delete on public.employee_cash_advance_payments from authenticated;
grant select on public.employee_cash_advance_payments to authenticated;

-- Extend existing Kasbon guard only for controlled internal payment updates.
do $$
declare
  v_def text;
  v_marker text := E'\r\n  -- UPDATE\r\n';
  v_insert text := E'\r\n  -- INTERNAL PAYMENT UPDATE (dedicated RPC only)\r\n  IF current_setting(''erp.kasbon_payment_internal'', true) = ''1'' THEN\r\n    IF TG_OP <> ''UPDATE'' THEN RAISE EXCEPTION ''Internal payment update hanya untuk UPDATE''; END IF;\r\n    NEW.employee_id := OLD.employee_id; NEW.branch_id := OLD.branch_id;\r\n    NEW.requested_amount := OLD.requested_amount; NEW.approved_amount := OLD.approved_amount;\r\n    NEW.reason := OLD.reason; NEW.request_description := OLD.request_description;\r\n    NEW.spv_note := OLD.spv_note; NEW.spv_recommendation := OLD.spv_recommendation;\r\n    NEW.spv_actor := OLD.spv_actor; NEW.spv_action_at := OLD.spv_action_at;\r\n    NEW.owner_note := OLD.owner_note; NEW.owner_actor := OLD.owner_actor; NEW.owner_action_at := OLD.owner_action_at;\r\n    NEW.disbursement_date := OLD.disbursement_date; NEW.disbursement_method := OLD.disbursement_method; NEW.disbursement_reference := OLD.disbursement_reference;\r\n    NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;\r\n    RETURN NEW;\r\n  END IF;\r\n\r\n  -- UPDATE\r\n';
begin
  select pg_get_functiondef('public.employee_cash_advances_guard()'::regprocedure) into v_def;
  if position('erp.kasbon_payment_internal' in v_def)=0 then
    if position(v_marker in v_def)=0 then raise exception 'Kasbon guard marker tidak ditemukan'; end if;
    execute replace(v_def,v_marker,v_insert);
  end if;
end $$;

create or replace function public.erp_kasbon_post_disbursement_to_arus_kas_trg()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and old.status not in ('DICAIRKAN','AKTIF') and new.status in ('DICAIRKAN','AKTIF') and coalesce(new.approved_amount,0)>0 then
    insert into public.arus_kas_v2_transactions(
      tanggal,amount,from_wallet,to_wallet,entry_type,category,description,source_type,source_key,
      source_period_start,source_period_end,verification_status,created_by,updated_by,metadata
    ) values(
      coalesce(new.disbursement_date,(timezone('Asia/Jakarta',now()))::date),new.approved_amount,
      'KAS_BESAR','EXTERNAL','AUTO','KASBON','Pencairan Kasbon - '||new.employee_name_snapshot,
      'KASBON_DISBURSEMENT',new.id::text,
      coalesce(new.disbursement_date,(timezone('Asia/Jakarta',now()))::date),
      coalesce(new.disbursement_date,(timezone('Asia/Jakarta',now()))::date),
      'OWNER_VERIFIED',auth.uid(),auth.uid(),
      jsonb_build_object('kasbon_id',new.id,'employee_id',new.employee_id,'employee_name',new.employee_name_snapshot,
        'branch_id',new.branch_id,'branch_name',new.branch_name_snapshot,'payment_method',new.payment_method,'event','DISBURSEMENT')
    ) on conflict(source_type,source_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_employee_cash_advances_arus_kas_disbursement on public.employee_cash_advances;
create trigger trg_employee_cash_advances_arus_kas_disbursement
after update of status on public.employee_cash_advances
for each row execute function public.erp_kasbon_post_disbursement_to_arus_kas_trg();

create or replace function public.erp_kasbon_record_payment(
  p_kasbon_id uuid,p_amount numeric,p_payment_date date default null,p_note text default null,
  p_source text default 'SVP_HARIAN',p_payroll_period date default null,p_dedupe_key text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_k public.employee_cash_advances%rowtype; v_payment_id uuid; v_new_outstanding numeric;
  v_is_owner boolean:=public.is_erp_owner(); v_is_spv boolean:=public.is_erp_spv();
  v_source text:=upper(trim(coalesce(p_source,'')));
  v_date date:=coalesce(p_payment_date,(timezone('Asia/Jakarta',now()))::date);
begin
  if not(v_is_owner or v_is_spv) then raise exception 'Akses pembayaran kasbon ditolak'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Nominal pembayaran harus > 0'; end if;
  if v_source not in ('PAYROLL','SVP_HARIAN','OWNER_MANUAL') then raise exception 'Source pembayaran tidak valid'; end if;
  select * into v_k from public.employee_cash_advances where id=p_kasbon_id for update;
  if not found then raise exception 'Kasbon tidak ditemukan'; end if;
  if v_k.status not in ('DICAIRKAN','AKTIF') then raise exception 'Kasbon belum aktif / sudah selesai'; end if;
  if coalesce(v_k.current_outstanding,0)<=0 then raise exception 'Kasbon tidak memiliki outstanding'; end if;
  if p_amount>v_k.current_outstanding then raise exception 'Pembayaran melebihi outstanding'; end if;
  if v_source='SVP_HARIAN' and v_k.payment_method<>'HARIAN' then raise exception 'Kasbon ini bukan metode HARIAN'; end if;
  if v_source='PAYROLL' then
    if not v_is_owner then raise exception 'Pembayaran PAYROLL hanya boleh diposting Owner'; end if;
    if v_k.payment_method<>'BULANAN' then raise exception 'Kasbon ini bukan metode BULANAN'; end if;
    if p_payroll_period is null then raise exception 'payroll_period wajib untuk pembayaran PAYROLL'; end if;
  end if;
  if v_source='OWNER_MANUAL' and not v_is_owner then raise exception 'OWNER_MANUAL hanya boleh Owner'; end if;

  insert into public.employee_cash_advance_payments(kasbon_id,employee_id,branch_id,payment_date,amount,payment_method,source,payroll_period,note,dedupe_key,created_by,metadata)
  values(v_k.id,v_k.employee_id,v_k.branch_id,v_date,p_amount,v_k.payment_method,v_source,p_payroll_period,
    nullif(trim(coalesce(p_note,'')),''),p_dedupe_key,auth.uid(),jsonb_build_object('outstanding_before',v_k.current_outstanding))
  returning id into v_payment_id;

  v_new_outstanding:=greatest(0,v_k.current_outstanding-p_amount);
  perform set_config('erp.kasbon_payment_internal','1',true);
  update public.employee_cash_advances
  set total_paid=coalesce(total_paid,0)+p_amount,current_outstanding=v_new_outstanding,
      status=case when v_new_outstanding=0 then 'LUNAS' else status end,
      settled_at=case when v_new_outstanding=0 then now() else settled_at end
  where id=v_k.id;
  perform set_config('erp.kasbon_payment_internal','0',true);

  insert into public.arus_kas_v2_transactions(
    tanggal,amount,from_wallet,to_wallet,entry_type,category,description,source_type,source_key,
    source_period_start,source_period_end,verification_status,created_by,updated_by,metadata
  ) values(
    v_date,p_amount,'EXTERNAL','KAS_BESAR','AUTO','KASBON','Pembayaran Kasbon - '||v_k.employee_name_snapshot,
    'KASBON_PAYMENT',v_payment_id::text,v_date,v_date,
    case when v_is_owner then 'OWNER_VERIFIED' else 'BELUM_DIVERIFIKASI' end,auth.uid(),auth.uid(),
    jsonb_build_object('kasbon_id',v_k.id,'payment_id',v_payment_id,'employee_id',v_k.employee_id,'employee_name',v_k.employee_name_snapshot,
      'branch_id',v_k.branch_id,'branch_name',v_k.branch_name_snapshot,'payment_method',v_k.payment_method,'payment_source',v_source,
      'outstanding_before',v_k.current_outstanding,'outstanding_after',v_new_outstanding,'event','PAYMENT')
  ) on conflict(source_type,source_key) do nothing;

  perform public.erp_kasbon_write_history(v_k.id,v_k.status,case when v_new_outstanding=0 then 'LUNAS' else v_k.status end,
    nullif(trim(coalesce(p_note,'')),''),v_k.current_outstanding,v_new_outstanding,
    jsonb_build_object('event','PAYMENT','payment_id',v_payment_id,'payment_source',v_source,'payment_method',v_k.payment_method,'amount',p_amount,'payment_date',v_date));
  return v_payment_id;
end $$;
revoke all on function public.erp_kasbon_record_payment(uuid,numeric,date,text,text,date,text) from public;
grant execute on function public.erp_kasbon_record_payment(uuid,numeric,date,text,text,date,text) to authenticated;

create or replace function public.erp_kasbon_monthly_due(p_employee_id bigint,p_period_end date default null)
returns table(kasbon_id uuid,employee_id bigint,branch_id bigint,disbursement_date date,outstanding numeric,due_amount numeric,payment_method text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not(public.is_erp_owner() or public.is_erp_spv()) then raise exception 'Akses erp_kasbon_monthly_due ditolak'; end if;
  return query
  select e.id,e.employee_id,e.branch_id,e.disbursement_date,e.current_outstanding,e.current_outstanding,e.payment_method
  from public.employee_cash_advances e
  where e.employee_id=p_employee_id and e.payment_method='BULANAN'
    and e.status in ('DICAIRKAN','AKTIF') and e.current_outstanding>0
    and (p_period_end is null or coalesce(e.disbursement_date,e.request_date)<=p_period_end)
  order by coalesce(e.disbursement_date,e.request_date),e.created_at;
end $$;
revoke all on function public.erp_kasbon_monthly_due(bigint,date) from public;
grant execute on function public.erp_kasbon_monthly_due(bigint,date) to authenticated;

create or replace function public.erp_kasbon_post_monthly_payroll(p_employee_id bigint,p_payroll_period date,p_payment_date date default null)
returns numeric language plpgsql security definer set search_path=public as $$
declare r record; v_total numeric:=0; v_key text;
begin
  if not public.is_erp_owner() then raise exception 'Posting potongan kasbon payroll hanya boleh Owner'; end if;
  if p_payroll_period is null then raise exception 'Periode payroll wajib'; end if;
  for r in select * from public.erp_kasbon_monthly_due(p_employee_id,p_payment_date) loop
    v_key:='PAYROLL:'||r.kasbon_id::text||':'||to_char(p_payroll_period,'YYYY-MM');
    if not exists(select 1 from public.employee_cash_advance_payments p where p.dedupe_key=v_key) then
      perform public.erp_kasbon_record_payment(r.kasbon_id,r.due_amount,p_payment_date,
        'Potong gaji '||to_char(p_payroll_period,'YYYY-MM'),'PAYROLL',p_payroll_period,v_key);
      v_total:=v_total+r.due_amount;
    end if;
  end loop;
  return v_total;
end $$;
revoke all on function public.erp_kasbon_post_monthly_payroll(bigint,date,date) from public;
grant execute on function public.erp_kasbon_post_monthly_payroll(bigint,date,date) to authenticated;
