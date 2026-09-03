-- ERP VAX — Payroll Salary Master V1
-- Fixed salary source for non-Capster employees.
-- Capster base salary remains canonical Minutes provider_share.

create extension if not exists btree_gist;

create table if not exists public.payroll_salary_master (
    id uuid primary key default gen_random_uuid(),
    employee_id bigint not null references public.karyawan(id),
    pay_basis text not null check (pay_basis in ('MONTHLY','DAILY')),
    amount numeric(14,2) not null check (amount >= 0),
    effective_from date not null,
    effective_to date null,
    active boolean not null default true,
    note text null,
    created_by uuid null default auth.uid(),
    updated_by uuid null default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payroll_salary_master_date_range
        check (effective_to is null or effective_to >= effective_from),
    constraint payroll_salary_master_employee_start_unique
        unique (employee_id, effective_from)
);

create index if not exists payroll_salary_master_employee_idx
    on public.payroll_salary_master(employee_id);
create index if not exists payroll_salary_master_effective_idx
    on public.payroll_salary_master(effective_from, effective_to);

alter table public.payroll_salary_master
    drop constraint if exists payroll_salary_master_no_overlap;
alter table public.payroll_salary_master
    add constraint payroll_salary_master_no_overlap
    exclude using gist (
        employee_id with =,
        daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
    ) where (active);

alter table public.payroll_salary_master enable row level security;
revoke all on table public.payroll_salary_master from anon;
grant select, insert, update on table public.payroll_salary_master to authenticated;

drop policy if exists payroll_salary_master_select_erp on public.payroll_salary_master;
create policy payroll_salary_master_select_erp
on public.payroll_salary_master
for select to authenticated
using (is_erp_owner() or is_erp_spv());

drop policy if exists payroll_salary_master_owner_spv_insert on public.payroll_salary_master;
create policy payroll_salary_master_owner_spv_insert
on public.payroll_salary_master
for insert to authenticated
with check (is_erp_owner() or is_erp_spv());

drop policy if exists payroll_salary_master_owner_spv_update on public.payroll_salary_master;
create policy payroll_salary_master_owner_spv_update
on public.payroll_salary_master
for update to authenticated
using (is_erp_owner() or is_erp_spv())
with check (is_erp_owner() or is_erp_spv());
