alter table public.laporan_bulanan_provider_mapping
  alter column source_provider_row_id type uuid
  using source_provider_row_id::text::uuid;
