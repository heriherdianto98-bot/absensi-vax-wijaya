-- ERP VAX — SVP Invoice secure PDF share links
-- Additive only. Does not modify existing invoice/email engine behavior.

create table if not exists public.svp_invoice_share_links (
  invoice_id uuid primary key references public.svp_invoices(id) on delete cascade,
  token text not null unique check (char_length(token) = 10),
  created_by uuid null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

revoke all on table public.svp_invoice_share_links from anon, authenticated;
grant select, insert, update, delete on table public.svp_invoice_share_links to service_role;

comment on table public.svp_invoice_share_links is 'Owner-created short secure token mapping for read-only SVP invoice PDF sharing.';
