-- Laporan Bulanan provider mapping access for ERP browser runtime.
-- Consumer-only metadata table; does not alter locked source engines.

alter table public.laporan_bulanan_provider_mapping enable row level security;

grant select, insert, update, delete on table public.laporan_bulanan_provider_mapping to anon, authenticated;
grant usage, select on sequence public.laporan_bulanan_provider_mapping_id_seq to anon, authenticated;

drop policy if exists laporan_bulanan_provider_mapping_read on public.laporan_bulanan_provider_mapping;
create policy laporan_bulanan_provider_mapping_read
on public.laporan_bulanan_provider_mapping
for select
to anon, authenticated
using (true);

drop policy if exists laporan_bulanan_provider_mapping_write on public.laporan_bulanan_provider_mapping;
create policy laporan_bulanan_provider_mapping_write
on public.laporan_bulanan_provider_mapping
for all
to anon, authenticated
using (true)
with check (true);
