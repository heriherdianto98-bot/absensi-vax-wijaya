-- Employee Profile consumer adapter.
-- READ ONLY: Master Karyawan remains the source of truth.
-- No attendance, payroll, Minutes, or credential engine is modified.

create or replace function public.karyawan_master_profile_self(
  p_token text
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_kid bigint;
  v_emp record;
  v_identity record;
  v_manual record;
  v_attendance jsonb;
  v_schedule jsonb;
  v_auto_share bigint := 0;
  v_manual_salary bigint := 0;
  v_cutoff date := date '0001-01-01';
begin
  v_kid := public.karyawan_session_id_from_token(p_token);
  if v_kid is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  select
    k.id,
    k.nama_karyawan,
    k.jabatan,
    k.cabang_id,
    k.aktif,
    k.no_hp_wa,
    k.alamat_ktp,
    k.foto,
    c.nama_cabang
  into v_emp
  from public.karyawan k
  left join public.cabang c on c.id=k.cabang_id
  where k.id=v_kid
  limit 1;

  if v_emp.id is null or v_emp.aktif is distinct from true then
    return jsonb_build_object('ok',false,'reason','KARYAWAN_INACTIVE');
  end if;

  select
    i.nama_lengkap_ktp,
    i.nik,
    i.tanggal_lahir,
    i.tempat_lahir,
    i.tanggal_bergabung,
    i.status_verifikasi,
    i.catatan
  into v_identity
  from public.karyawan_identitas i
  where i.karyawan_id=v_kid
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tanggal',a.tanggal,
    'status_absensi',a.status_absensi,
    'status',a.status,
    'terlambat_menit',a.terlambat_menit
  ) order by a.tanggal),'[]'::jsonb)
  into v_attendance
  from public.absensi a
  where a.karyawan_id=v_kid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tanggal',j.tanggal,
    'status_canonical',j.status_canonical,
    'status',j.status
  ) order by j.tanggal),'[]'::jsonb)
  into v_schedule
  from public.jadwal_libur j
  where j.karyawan_id=v_kid;

  select g.total_gaji,g.periode_sampai,g.catatan
  into v_manual
  from public.karyawan_riwayat_gaji_manual g
  where g.karyawan_id=v_kid
  limit 1;

  if v_manual.periode_sampai is not null then
    v_cutoff := v_manual.periode_sampai;
    v_manual_salary := coalesce(v_manual.total_gaji,0);
  end if;

  if lower(trim(coalesce(v_emp.jabatan,'')))='capster' then
    select coalesce(sum(coalesce(p.provider_share,0)),0)::bigint
    into v_auto_share
    from public.provider_sales_daily_source p
    where p.employee_id=v_kid
      and p.mapping_status='MATCHED'
      and p.activity_date>v_cutoff
      and p.activity_date<=timezone('Asia/Jakarta',now())::date;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source','MASTER_KARYAWAN_CONSUMER',
    'employee',jsonb_build_object(
      'id',v_emp.id,
      'nama_karyawan',v_emp.nama_karyawan,
      'jabatan',v_emp.jabatan,
      'cabang_id',v_emp.cabang_id,
      'nama_cabang',v_emp.nama_cabang,
      'aktif',v_emp.aktif,
      'no_hp_wa',v_emp.no_hp_wa,
      'alamat_ktp',v_emp.alamat_ktp,
      'foto',v_emp.foto
    ),
    'identity',jsonb_build_object(
      'nama_lengkap_ktp',v_identity.nama_lengkap_ktp,
      'nik',v_identity.nik,
      'tanggal_lahir',v_identity.tanggal_lahir,
      'tempat_lahir',v_identity.tempat_lahir,
      'tanggal_bergabung',v_identity.tanggal_bergabung,
      'status_verifikasi',v_identity.status_verifikasi,
      'catatan',v_identity.catatan
    ),
    'history',jsonb_build_object(
      'absensi',v_attendance,
      'jadwal_libur',v_schedule
    ),
    'salary',jsonb_build_object(
      'manual_total',v_manual_salary,
      'manual_until',v_manual.periode_sampai,
      'manual_note',v_manual.catatan,
      'matched_capster_share_after_manual',v_auto_share,
      'total_recorded',v_manual_salary+v_auto_share,
      'is_partial',true
    )
  );
end;
$function$;

revoke all on function public.karyawan_master_profile_self(text) from public;
grant execute on function public.karyawan_master_profile_self(text) to anon,authenticated;
