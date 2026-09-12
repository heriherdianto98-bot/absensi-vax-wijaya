-- VAX ERP — Laporan Bulanan provider mapping manual historical name
-- Consumer-only metadata. Does not modify Payroll / provider source engines.

alter table public.laporan_bulanan_provider_mapping
  alter column employee_id drop not null;

alter table public.laporan_bulanan_provider_mapping
  alter column employee_cabang_id drop not null;
