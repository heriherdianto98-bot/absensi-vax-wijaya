-- VAX ERP: isolated owner-only attendance correction. Does not modify existing attendance engines.
create table if not exists public.absensi_manual_audit (
  id bigint generated always as identity primary key,
  absensi_id bigint not null references public.absensi(id),
  karyawan_id bigint not null references public.karyawan(id),
  tanggal date not null,
  action text not null check (action in ('INSERT','UPDATE')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  before_row jsonb,
  after_row jsonb not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_absensi_manual_audit_record on public.absensi_manual_audit (karyawan_id, tanggal, created_at desc);
alter table public.absensi_manual_audit enable row level security;
revoke all on public.absensi_manual_audit from public, anon, authenticated;
grant select on public.absensi_manual_audit to authenticated;
drop policy if exists absensi_manual_owner_read on public.absensi_manual_audit;
create policy absensi_manual_owner_read on public.absensi_manual_audit for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and lower(p.role) = 'owner' and p.aktif is true));

create or replace function public.owner_save_absensi_manual(
  p_karyawan_id bigint,
  p_tanggal date,
  p_cabang_id bigint,
  p_status text,
  p_jam_masuk time without time zone,
  p_jam_pulang time without time zone,
  p_alasan text
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_employee public.karyawan%rowtype;
  v_before public.absensi%rowtype;
  v_after public.absensi%rowtype;
  v_record_id bigint;
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_reason text := btrim(coalesce(p_alasan, ''));
  v_minutes integer := 0;
  v_denda integer := 0;
  v_state text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id = v_actor and lower(p.role) = 'owner' and p.aktif is true
  ) then raise exception 'Hanya Owner aktif dapat mengoreksi absensi' using errcode = '42501'; end if;
  if p_karyawan_id is null or p_tanggal is null or p_cabang_id is null then
    raise exception 'Karyawan, tanggal, dan cabang wajib diisi'; end if;
  if p_tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Absensi manual tidak boleh untuk tanggal mendatang'; end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan wajib 5 sampai 500 karakter'; end if;
  if v_status not in ('H','L','I','S') then
    raise exception 'Status tidak valid'; end if;
  select * into v_employee from public.karyawan where id = p_karyawan_id and aktif is true;
  if not found then raise exception 'Karyawan tidak aktif atau tidak ditemukan'; end if;
  if not exists (select 1 from public.cabang where id = p_cabang_id) then
    raise exception 'Cabang tidak ditemukan'; end if;
  if v_status = 'H' then
    if p_jam_masuk is null then raise exception 'Jam masuk wajib untuk Hadir'; end if;
    if p_jam_pulang is not null and p_jam_pulang < p_jam_masuk then
      raise exception 'Jam pulang tidak boleh mendahului jam masuk'; end if;
    v_minutes := greatest(0, ceil(extract(epoch from (p_jam_masuk - time '10:15:00')) / 60)::integer);
    v_denda := v_minutes * 1000;
    v_state := case when v_minutes > 0 then 'Terlambat' else 'Hadir' end;
  else
    if p_jam_masuk is not null or p_jam_pulang is not null then
      raise exception 'Jam masuk/pulang harus kosong untuk status non-Hadir'; end if;
    v_state := case v_status when 'L' then 'LIBUR' when 'I' then 'IZIN' else 'SAKIT' end;
  end if;

  -- Serialize writes for this employee/day to avoid duplicate corrections.
  perform pg_advisory_xact_lock(p_karyawan_id, (p_tanggal - date '2000-01-01')::integer);
  select * into v_before from public.absensi where karyawan_id = p_karyawan_id and tanggal = p_tanggal for update;
  if found then
    v_record_id := v_before.id;
    update public.absensi set
      cabang_id = p_cabang_id,
      cabang_asal_id = v_employee.cabang_id,
      jam_masuk = case when v_status = 'H' then p_jam_masuk else null end,
      jam_pulang = case when v_status = 'H' then p_jam_pulang else null end,
      status = v_state,
      status_absensi = v_status::char(1),
      terlambat_menit = v_minutes,
      tarif_denda = 1000,
      denda = v_denda,
      status_denda = 'Berlaku',
      updated_at = now()
    where id = v_record_id returning * into v_after;
  else
    insert into public.absensi (
      id,karyawan_id,cabang_id,cabang_asal_id,tanggal,jam_masuk,jam_pulang,
      status,status_absensi,terlambat_menit,tarif_denda,denda,status_denda
    ) values (
      nextval('public.absensi_id_seq'::regclass),p_karyawan_id,p_cabang_id,v_employee.cabang_id,p_tanggal,
      case when v_status = 'H' then p_jam_masuk else null end,
      case when v_status = 'H' then p_jam_pulang else null end,
      v_state,v_status::char(1),v_minutes,1000,v_denda,'Berlaku'
    ) returning * into v_after;
    v_record_id := v_after.id;
  end if;
  insert into public.absensi_manual_audit (absensi_id,karyawan_id,tanggal,action,reason,before_row,after_row,actor_id)
  values (v_record_id,p_karyawan_id,p_tanggal,case when v_before.id is null then 'INSERT' else 'UPDATE' end,
          v_reason,to_jsonb(v_before),to_jsonb(v_after),v_actor);
  return v_record_id;
end;
$$;
revoke all on function public.owner_save_absensi_manual(bigint,date,bigint,text,time,time,text) from public, anon;
grant execute on function public.owner_save_absensi_manual(bigint,date,bigint,text,time,time,text) to authenticated;
