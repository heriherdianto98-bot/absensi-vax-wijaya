-- ERP VAX — Payroll Manual Adjustments
-- Manual-only payroll components. Canonical Minutes/provider/product sources remain untouched.

create table if not exists public.payroll_manual_adjustments (
    id uuid primary key default gen_random_uuid(),
    employee_id bigint not null references public.karyawan(id),
    period_month date not null,
    bonus_insentif numeric not null default 0 check (bonus_insentif >= 0),
    bonus_kpi numeric not null default 0 check (bonus_kpi >= 0),
    note text null,
    created_by uuid null default auth.uid(),
    updated_by uuid null default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payroll_manual_adjustments_period_month_first_day
        check (period_month = date_trunc('month', period_month)::date),
    constraint payroll_manual_adjustments_employee_period_unique
        unique (employee_id, period_month)
);

create index if not exists payroll_manual_adjustments_period_idx
    on public.payroll_manual_adjustments(period_month);
create index if not exists payroll_manual_adjustments_employee_idx
    on public.payroll_manual_adjustments(employee_id);

alter table public.payroll_manual_adjustments enable row level security;
revoke all on table public.payroll_manual_adjustments from anon;
grant select, insert, update on table public.payroll_manual_adjustments to authenticated;

create policy payroll_manual_adjustments_select_erp
on public.payroll_manual_adjustments
for select to authenticated
using (is_erp_owner() or is_erp_spv());

create policy payroll_manual_adjustments_owner_insert
on public.payroll_manual_adjustments
for insert to authenticated
with check (is_erp_owner());

create policy payroll_manual_adjustments_owner_update
on public.payroll_manual_adjustments
for update to authenticated
using (is_erp_owner())
with check (is_erp_owner());
