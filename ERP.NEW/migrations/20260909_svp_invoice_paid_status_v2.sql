-- ERP VAX — OWNER TO SVP INVOICE STATUS V2
-- Additive only. Tidak menyentuh Cash Out / Arus Kas / engine LOCK.

alter table public.svp_invoices
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid;

alter table public.svp_invoices
  drop constraint if exists svp_invoices_status_check;

alter table public.svp_invoices
  add constraint svp_invoices_status_check
  check (status in ('draft','sent','paid'));

comment on column public.svp_invoices.paid_at is 'Waktu Owner menandai invoice sudah dibayar.';
comment on column public.svp_invoices.paid_by is 'User Owner yang menandai invoice sudah dibayar.';
