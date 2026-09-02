-- VAX ERP — Setoran 3 Harian Direct Flow + Audit Trail V1
-- Additive only. Does not alter canonical money formulas.

alter table public.setoran_3_harian
  add column if not exists taken_status text not null default 'BELUM DIAMBIL',
  add column if not exists taken_at timestamptz null,
  add column if not exists taken_by uuid null,
  add column if not exists bri_non_cash_actual numeric null,
  add column if not exists non_cash_difference numeric null,
  add column if not exists non_cash_note text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'setoran_3_harian_taken_status_check'
      and conrelid = 'public.setoran_3_harian'::regclass
  ) then
    alter table public.setoran_3_harian
      add constraint setoran_3_harian_taken_status_check
      check (taken_status in ('BELUM DIAMBIL','SUDAH DIAMBIL'));
  end if;
end $$;

create table if not exists public.setoran_3_harian_audit (
  id bigint generated always as identity primary key,
  setoran_id uuid not null references public.setoran_3_harian(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  cabang_id bigint not null,
  action text not null,
  actor_id uuid null,
  actor_role text null,
  note text null,
  before_data jsonb null,
  after_data jsonb null,
  proof_data jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_setoran_3_harian_audit_lookup
  on public.setoran_3_harian_audit(cabang_id, period_start, period_end, created_at desc);

alter table public.setoran_3_harian_audit enable row level security;

drop policy if exists setoran_3_harian_audit_read_owner_svp on public.setoran_3_harian_audit;
create policy setoran_3_harian_audit_read_owner_svp
on public.setoran_3_harian_audit
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.aktif is distinct from false
      and lower(coalesce(p.role,'')) in ('owner','svp')
  )
);

create or replace function public.vax_setoran_actor_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(p.role,''))
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.vax_audit_setoran_3_harian()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.vax_setoran_actor_role();
  v_proofs jsonb;
  v_action text;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'storage_path', p.storage_path,
    'proof_kind', p.proof_kind,
    'uploaded_by', p.uploaded_by,
    'uploaded_at', p.uploaded_at
  ) order by p.uploaded_at), '[]'::jsonb)
  into v_proofs
  from public.setoran_3_harian_proofs p
  where p.setoran_id = new.id;

  if tg_op = 'INSERT' then
    insert into public.setoran_3_harian_audit(
      setoran_id, period_start, period_end, cabang_id,
      action, actor_id, actor_role, note,
      before_data, after_data, proof_data
    ) values (
      new.id, new.period_start, new.period_end, new.cabang_id,
      'CREATE', v_actor, v_role, coalesce(new.non_cash_note, new.spv_note),
      null, to_jsonb(new), v_proofs
    );
    return new;
  end if;

  if to_jsonb(old) is distinct from to_jsonb(new) then
    v_action := case
      when old.taken_status is distinct from new.taken_status then 'TAKEN_STATUS_CHANGE'
      else 'UPDATE'
    end;

    insert into public.setoran_3_harian_audit(
      setoran_id, period_start, period_end, cabang_id,
      action, actor_id, actor_role, note,
      before_data, after_data, proof_data
    ) values (
      new.id, new.period_start, new.period_end, new.cabang_id,
      v_action, v_actor, v_role, coalesce(new.non_cash_note, new.spv_note),
      to_jsonb(old), to_jsonb(new), v_proofs
    );
  end if;

  return new;
end
$$;

drop trigger if exists trg_vax_audit_setoran_3_harian on public.setoran_3_harian;
create trigger trg_vax_audit_setoran_3_harian
after insert or update on public.setoran_3_harian
for each row execute function public.vax_audit_setoran_3_harian();

create or replace function public.vax_audit_setoran_3_harian_proof()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setoran public.setoran_3_harian%rowtype;
  v_actor uuid := auth.uid();
  v_role text := public.vax_setoran_actor_role();
  v_proof jsonb;
  v_setoran_id uuid;
begin
  v_setoran_id := case when tg_op = 'DELETE' then old.setoran_id else new.setoran_id end;
  select * into v_setoran from public.setoran_3_harian where id = v_setoran_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_proof := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  insert into public.setoran_3_harian_audit(
    setoran_id, period_start, period_end, cabang_id,
    action, actor_id, actor_role, note,
    before_data, after_data, proof_data
  ) values (
    v_setoran.id, v_setoran.period_start, v_setoran.period_end, v_setoran.cabang_id,
    case when tg_op = 'DELETE' then 'PROOF_DELETE' else 'PROOF_ADD' end,
    v_actor, v_role, coalesce(v_setoran.non_cash_note, v_setoran.spv_note),
    null, null, jsonb_build_array(v_proof)
  );

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists trg_vax_audit_setoran_3_harian_proof on public.setoran_3_harian_proofs;
create trigger trg_vax_audit_setoran_3_harian_proof
after insert or delete on public.setoran_3_harian_proofs
for each row execute function public.vax_audit_setoran_3_harian_proof();
