-- VAX ERP — Setoran 3 Harian Owner Verification V1
-- Additive only. Does not alter canonical Setoran formulas/engines.

alter table public.setoran_3_harian
  add column if not exists owner_verified boolean not null default false,
  add column if not exists owner_verified_at timestamptz null,
  add column if not exists owner_verified_by uuid null;

create index if not exists idx_setoran_3_harian_owner_verified
  on public.setoran_3_harian(owner_verified, period_start, period_end, cabang_id);

create or replace function public.vax_guard_setoran_owner_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(coalesce(public.vax_setoran_actor_role(), ''));
begin
  -- Jika uang kembali dianggap belum diambil, verifikasi Owner otomatis gugur.
  if coalesce(new.taken_status, 'BELUM DIAMBIL') <> 'SUDAH DIAMBIL' then
    new.owner_verified := false;
    new.owner_verified_at := null;
    new.owner_verified_by := null;
    return new;
  end if;

  -- Verifikasi Owner hanya boleh diubah oleh role owner.
  if tg_op = 'INSERT' then
    if new.owner_verified is true then
      if v_role <> 'owner' then
        raise exception 'Verifikasi Setoran hanya dapat dilakukan Owner.';
      end if;
      new.owner_verified_at := coalesce(new.owner_verified_at, now());
      new.owner_verified_by := coalesce(new.owner_verified_by, auth.uid());
    end if;
    return new;
  end if;

  if new.owner_verified is distinct from old.owner_verified
     or new.owner_verified_at is distinct from old.owner_verified_at
     or new.owner_verified_by is distinct from old.owner_verified_by then
    if v_role <> 'owner' then
      raise exception 'Verifikasi Setoran hanya dapat dilakukan Owner.';
    end if;

    if new.owner_verified is true then
      new.owner_verified_at := coalesce(new.owner_verified_at, now());
      new.owner_verified_by := coalesce(new.owner_verified_by, auth.uid());
    else
      new.owner_verified_at := null;
      new.owner_verified_by := null;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_vax_guard_setoran_owner_verification on public.setoran_3_harian;
create trigger trg_vax_guard_setoran_owner_verification
before insert or update on public.setoran_3_harian
for each row execute function public.vax_guard_setoran_owner_verification();
