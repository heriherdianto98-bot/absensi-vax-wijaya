-- ERP VAX — Minutes Provider ↔ ERP Employee stable identity bridge
-- Additive only. Does not define or modify ERP jabatan.

create table if not exists public.provider_master_identity_map (
  provider_minutes_id text primary key,
  employee_id bigint not null references public.karyawan(id) on update cascade on delete restrict,
  provider_name_alias text,
  source text not null default 'OWNER_CONFIRMED',
  confirmed_by_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_master_identity_map_employee_idx
  on public.provider_master_identity_map(employee_id);

comment on table public.provider_master_identity_map is
  'Stable identity bridge Minutes provider ID to ERP employee ID. Does not define ERP jabatan.';

alter table public.provider_master_identity_map enable row level security;
