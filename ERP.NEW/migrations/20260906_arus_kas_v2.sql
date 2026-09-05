-- VAX ERP — Arus Kas V2
-- Ledger sederhana seperti sheet UANG BARBER, dengan audit + Owner verification.
-- Tidak mengubah DailyDataEngine / SetoranMoneyEngine / Setoran 3 Harian.

create table if not exists public.arus_kas_v2_transactions (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  amount bigint not null check (amount > 0),
  from_wallet text not null,
  to_wallet text not null,
  entry_type text not null default 'MANUAL',
  category text not null,
  description text,
  source_type text,
  source_key text,
  source_period_start date,
  source_period_end date,
  proof_path text,
  verification_status text not null default 'BELUM_DIVERIFIKASI'
    check (verification_status in ('BELUM_DIVERIFIKASI','OWNER_VERIFIED','MINTA_KOREKSI')),
  correction_note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(source_type, source_key)
);

create index if not exists arus_kas_v2_transactions_tanggal_idx
  on public.arus_kas_v2_transactions(tanggal desc);
create index if not exists arus_kas_v2_transactions_verify_idx
  on public.arus_kas_v2_transactions(verification_status);
create index if not exists arus_kas_v2_transactions_period_idx
  on public.arus_kas_v2_transactions(source_period_start, source_period_end);

alter table public.arus_kas_v2_transactions enable row level security;

drop policy if exists "arus_kas_v2_read_owner_svp" on public.arus_kas_v2_transactions;
create policy "arus_kas_v2_read_owner_svp"
on public.arus_kas_v2_transactions for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('owner','svp')
      and coalesce(p.aktif,true) = true
  )
);

drop policy if exists "arus_kas_v2_insert_owner_svp" on public.arus_kas_v2_transactions;
create policy "arus_kas_v2_insert_owner_svp"
on public.arus_kas_v2_transactions for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('owner','svp')
      and coalesce(p.aktif,true) = true
  )
);

drop policy if exists "arus_kas_v2_update_owner_svp" on public.arus_kas_v2_transactions;
create policy "arus_kas_v2_update_owner_svp"
on public.arus_kas_v2_transactions for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('owner','svp')
      and coalesce(p.aktif,true) = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('owner','svp')
      and coalesce(p.aktif,true) = true
  )
);

create table if not exists public.arus_kas_v2_audit (
  id bigserial primary key,
  transaction_id uuid references public.arus_kas_v2_transactions(id) on delete cascade,
  action text not null,
  actor_id uuid references auth.users(id),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.arus_kas_v2_audit enable row level security;

drop policy if exists "arus_kas_v2_audit_read_owner_svp" on public.arus_kas_v2_audit;
create policy "arus_kas_v2_audit_read_owner_svp"
on public.arus_kas_v2_audit for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('owner','svp')
      and coalesce(p.aktif,true) = true
  )
);

drop policy if exists "arus_kas_v2_audit_insert_owner_svp" on public.arus_kas_v2_audit;
create policy "arus_kas_v2_audit_insert_owner_svp"
on public.arus_kas_v2_audit for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role,'')) in ('owner','svp')
      and coalesce(p.aktif,true) = true
  )
);
