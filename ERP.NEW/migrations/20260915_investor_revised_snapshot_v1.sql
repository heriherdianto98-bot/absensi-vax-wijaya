-- Investor Revised permanent snapshot v1
-- Dedicated to Laporan Bulanan Investor Revised only.
-- Does NOT modify canonical Minutes sync tables or ORIGINAL/FROZEN ERP snapshots.

create table if not exists public.investor_revised_snapshots (
  id uuid primary key default gen_random_uuid(),
  branch_id bigint not null references public.cabang(id) on delete restrict,
  period_month date not null,
  revision_no integer not null,
  status text not null default 'READY' check (status in ('READY','LOCKED')),
  dataset_schema text not null,
  dataset_version integer not null default 1,
  source_kind text not null default 'MINUTES_LIVE_REVISED',
  source_fetched_at timestamptz not null default now(),
  payload jsonb not null,
  checksum_sha256 text null,
  created_at timestamptz not null default now(),
  created_by text null,
  locked_at timestamptz null,
  constraint investor_revised_period_month_first_day check (period_month = date_trunc('month', period_month)::date),
  constraint investor_revised_revision_positive check (revision_no > 0),
  constraint investor_revised_unique_revision unique (branch_id, period_month, revision_no)
);

comment on table public.investor_revised_snapshots is
'Dedicated permanent snapshots for Laporan Bulanan Investor Revised. Separate from ORIGINAL/FROZEN ERP and canonical Minutes sync tables.';

comment on column public.investor_revised_snapshots.payload is
'Full structured Investor Revised dataset (daily recap, cash out detail, provider, product, provider product, Jan-Dec year trend).';

comment on column public.investor_revised_snapshots.source_kind is
'Source identifier only; this table never replaces canonical ERP source tables.';

create index if not exists investor_revised_snapshots_lookup_idx
  on public.investor_revised_snapshots (branch_id, period_month, revision_no desc);

create index if not exists investor_revised_snapshots_status_idx
  on public.investor_revised_snapshots (status, period_month);

alter table public.investor_revised_snapshots enable row level security;

revoke all on table public.investor_revised_snapshots from anon;
revoke insert, update, delete on table public.investor_revised_snapshots from authenticated;
grant select on table public.investor_revised_snapshots to authenticated;

drop policy if exists investor_revised_owner_select on public.investor_revised_snapshots;
create policy investor_revised_owner_select
  on public.investor_revised_snapshots
  for select
  to authenticated
  using (public.is_erp_owner());

create or replace function public.erp_investor_revised_snapshot_latest(
  p_branch_id bigint,
  p_period_month date
) returns setof public.investor_revised_snapshots
language sql
stable
security invoker
set search_path = public
as $$
  select s.*
  from public.investor_revised_snapshots s
  where s.branch_id = p_branch_id
    and s.period_month = date_trunc('month', p_period_month)::date
  order by s.revision_no desc
  limit 1;
$$;

grant execute on function public.erp_investor_revised_snapshot_latest(bigint,date) to authenticated;
revoke execute on function public.erp_investor_revised_snapshot_latest(bigint,date) from anon;
