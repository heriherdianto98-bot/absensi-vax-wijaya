-- ERP VAX — OWNER TO SVP INVOICE V1
-- Dokumen administratif internal. Tidak membuat transaksi Cash Out / Arus Kas.

create table if not exists public.svp_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  title text not null default 'INVOICE SVP',
  invoice_date date not null default current_date,
  due_date date,
  notes text,
  status text not null default 'draft' check (status in ('draft','sent')),
  total numeric(14,0) not null default 0 check (total >= 0),
  sent_to_email text,
  sent_at timestamptz,
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svp_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.svp_invoices(id) on delete cascade,
  item_name text not null,
  qty numeric(12,2) not null default 1 check (qty > 0),
  unit_price numeric(14,0) not null default 0 check (unit_price >= 0),
  amount numeric(14,0) not null default 0 check (amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.svp_invoices is 'Invoice internal dari Owner ERP VAX untuk SVP. Dokumen administratif; tidak membuat transaksi Arus Kas.';
comment on table public.svp_invoice_items is 'Detail item invoice Owner ke SVP.';

alter table public.svp_invoices enable row level security;
alter table public.svp_invoice_items enable row level security;

drop policy if exists svp_invoices_read_owner_svp on public.svp_invoices;
create policy svp_invoices_read_owner_svp on public.svp_invoices
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and lower(coalesce(p.role,'')) in ('owner','svp','spv')
));

drop policy if exists svp_invoices_write_owner on public.svp_invoices;
create policy svp_invoices_write_owner on public.svp_invoices
for all to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and lower(coalesce(p.role,'')) = 'owner'
))
with check (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and lower(coalesce(p.role,'')) = 'owner'
));

drop policy if exists svp_invoice_items_read_owner_svp on public.svp_invoice_items;
create policy svp_invoice_items_read_owner_svp on public.svp_invoice_items
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and lower(coalesce(p.role,'')) in ('owner','svp','spv')
));

drop policy if exists svp_invoice_items_write_owner on public.svp_invoice_items;
create policy svp_invoice_items_write_owner on public.svp_invoice_items
for all to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and lower(coalesce(p.role,'')) = 'owner'
))
with check (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and lower(coalesce(p.role,'')) = 'owner'
));

grant select, insert, update, delete on public.svp_invoices to authenticated;
grant select, insert, update, delete on public.svp_invoice_items to authenticated;
