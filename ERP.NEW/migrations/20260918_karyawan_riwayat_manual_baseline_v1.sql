-- Task 2 additive historical baseline. Never writes absensi, jadwal_libur, payroll or Minutes.
create table if not exists public.karyawan_riwayat_manual_baseline (
  karyawan_id bigint primary key references public.karyawan(id),
  periode_mulai date not null,
  periode_sampai date not null,
  hadir_hari integer not null default 0 check (hadir_hari >= 0),
  terlambat_hari integer not null default 0 check (terlambat_hari >= 0),
  libur_hari integer not null default 0 check (libur_hari >= 0),
  sakit_hari integer not null default 0 check (sakit_hari >= 0),
  izin_hari integer not null default 0 check (izin_hari >= 0),
  sumber_verifikasi text not null check (length(btrim(sumber_verifikasi)) >= 10),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint karyawan_manual_period_valid check (periode_mulai <= periode_sampai),
  constraint karyawan_manual_late_valid check (terlambat_hari <= hadir_hari),
  constraint karyawan_manual_days_valid check ((hadir_hari + libur_hari + sakit_hari + izin_hari) <= (periode_sampai - periode_mulai + 1))
);
create table if not exists public.karyawan_riwayat_manual_audit (
  id bigint generated always as identity primary key,
  karyawan_id bigint not null references public.karyawan(id),
  aksi text not null check (aksi in ('INSERT','UPDATE')),
  sebelum jsonb,
  sesudah jsonb not null,
  actor_id uuid not null,
  dicatat_pada timestamptz not null default now()
);
create or replace function public.karyawan_riwayat_manual_guard() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_first date; v_join date;
begin
  if tg_op = 'DELETE' then raise exception 'Riwayat manual tidak boleh dihapus; koreksi tercatat melalui UPDATE'; end if;
  if not public.is_erp_owner() or auth.uid() is null or new.updated_by is distinct from auth.uid() then
    raise exception 'Hanya Owner aktif dengan identitas sesi sah yang dapat menyimpan';
  end if;
  if tg_op = 'UPDATE' and new.karyawan_id is distinct from old.karyawan_id then
    raise exception 'ID karyawan tidak boleh diubah';
  end if;
  if new.periode_sampai >= (timezone('Asia/Jakarta',now()))::date then
    raise exception 'Periode manual hanya sampai kemarin';
  end if;
  select tanggal_bergabung into v_join from public.karyawan_identitas where karyawan_id = new.karyawan_id;
  if v_join is not null and new.periode_mulai < v_join then
    raise exception 'Periode manual lebih awal dari tanggal bergabung';
  end if;
  select min(tanggal) into v_first from (
    select tanggal from public.absensi where karyawan_id = new.karyawan_id
    union all
    select tanggal from public.jadwal_libur where karyawan_id = new.karyawan_id
  ) rec;
  if v_first is not null and new.periode_sampai >= v_first then
    raise exception 'Periode bertabrakan dengan catatan ERP (mulai %). Pilih periode sebelum tanggal tersebut',v_first;
  end if;
  new.updated_at := now();
  insert into public.karyawan_riwayat_manual_audit(karyawan_id,aksi,sebelum,sesudah,actor_id)
  values(new.karyawan_id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
  return new;
end $$;
drop trigger if exists karyawan_riwayat_manual_guard_trigger on public.karyawan_riwayat_manual_baseline;
create trigger karyawan_riwayat_manual_guard_trigger before insert or update or delete
on public.karyawan_riwayat_manual_baseline for each row execute function public.karyawan_riwayat_manual_guard();
alter table public.karyawan_riwayat_manual_baseline enable row level security;
alter table public.karyawan_riwayat_manual_audit enable row level security;
revoke all on public.karyawan_riwayat_manual_baseline from anon,authenticated;
revoke all on public.karyawan_riwayat_manual_audit from anon,authenticated;
grant select,insert,update on public.karyawan_riwayat_manual_baseline to authenticated;
grant select on public.karyawan_riwayat_manual_audit to authenticated;
drop policy if exists karyawan_manual_owner_read on public.karyawan_riwayat_manual_baseline;
create policy karyawan_manual_owner_read on public.karyawan_riwayat_manual_baseline for select to authenticated using (public.is_erp_owner());
drop policy if exists karyawan_manual_owner_insert on public.karyawan_riwayat_manual_baseline;
create policy karyawan_manual_owner_insert on public.karyawan_riwayat_manual_baseline for insert to authenticated with check (public.is_erp_owner() and updated_by = auth.uid());
drop policy if exists karyawan_manual_owner_update on public.karyawan_riwayat_manual_baseline;
create policy karyawan_manual_owner_update on public.karyawan_riwayat_manual_baseline for update to authenticated using (public.is_erp_owner()) with check (public.is_erp_owner() and updated_by = auth.uid());
drop policy if exists karyawan_manual_owner_audit_read on public.karyawan_riwayat_manual_audit;
create policy karyawan_manual_owner_audit_read on public.karyawan_riwayat_manual_audit for select to authenticated using (public.is_erp_owner());
-- Audit writes only through the invoker trigger, not client API.
grant insert on public.karyawan_riwayat_manual_audit to authenticated;
grant usage on sequence public.karyawan_riwayat_manual_audit_id_seq to authenticated;
