-- Pre-ERP manual fine totals, entered once per employee + payroll month.
-- Independent from absensi, payroll_manual_adjustments and immutable payroll snapshots.
create table if not exists public.payroll_pre_erp_manual_fines (
  employee_id bigint not null references public.karyawan(id),
  period_month date not null,
  amount numeric(14,0) not null default 0 check (amount >= 0),
  note text not null check (length(btrim(note)) > 0),
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_pre_erp_manual_fines_pk primary key (employee_id,period_month),
  constraint payroll_pre_erp_manual_fines_first_day check (extract(day from period_month) = 1)
);
comment on table public.payroll_pre_erp_manual_fines is 'Owner-entered totals of historic manual fines NOT present in ERP absensi. One value per employee/month; never backfill absensi or alter locked payroll snapshots.';
alter table public.payroll_pre_erp_manual_fines enable row level security;
revoke all on public.payroll_pre_erp_manual_fines from public, anon;
grant select on public.payroll_pre_erp_manual_fines to authenticated;
grant insert,update on public.payroll_pre_erp_manual_fines to authenticated;
create policy payroll_pre_erp_fines_read on public.payroll_pre_erp_manual_fines for select to authenticated using (public.is_erp_owner() or public.is_erp_spv());
create policy payroll_pre_erp_fines_owner_insert on public.payroll_pre_erp_manual_fines for insert to authenticated with check (public.is_erp_owner() and created_by = auth.uid() and updated_by = auth.uid());
create policy payroll_pre_erp_fines_owner_update on public.payroll_pre_erp_manual_fines for update to authenticated using (public.is_erp_owner()) with check (public.is_erp_owner() and updated_by = auth.uid());
-- No DELETE grant/policy. No triggers modifying Absensi, Payroll bonus or historical snapshots.
