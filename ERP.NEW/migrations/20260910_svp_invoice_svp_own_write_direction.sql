-- ERP VAX — additive SVP -> Owner invoice direction support.
-- Owner invoice policies remain unchanged.

alter table public.svp_invoices
  add column if not exists sender_role text;

create policy "svp_invoices_write_svp_own"
on public.svp_invoices
for all
to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('svp','spv')
  )
)
with check (
  created_by = auth.uid()
  and lower(coalesce(sender_role,'')) in ('svp','spv')
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('svp','spv')
  )
);

create policy "svp_invoice_items_write_svp_own"
on public.svp_invoice_items
for all
to authenticated
using (
  exists (
    select 1
    from public.svp_invoices i
    join public.profiles p on p.id = auth.uid()
    where i.id = svp_invoice_items.invoice_id
      and i.created_by = auth.uid()
      and lower(coalesce(i.sender_role,'')) in ('svp','spv')
      and lower(coalesce(p.role,'')) in ('svp','spv')
  )
)
with check (
  exists (
    select 1
    from public.svp_invoices i
    join public.profiles p on p.id = auth.uid()
    where i.id = svp_invoice_items.invoice_id
      and i.created_by = auth.uid()
      and lower(coalesce(i.sender_role,'')) in ('svp','spv')
      and lower(coalesce(p.role,'')) in ('svp','spv')
  )
);
