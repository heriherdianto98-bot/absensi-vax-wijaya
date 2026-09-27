-- Prevent accidental same-second SVP PULANG after MASUK.
-- Isolated from locked employee attendance engine.

create or replace function public.svp_absen_self_v1(
    p_action text,
    p_lat double precision,
    p_lon double precision,
    p_accuracy double precision,
    p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    v_uid uuid := auth.uid();
    v_profile public.profiles%rowtype;
    v_k public.karyawan%rowtype;
    v_row public.svp_absensi_v1%rowtype;
    v_existing public.svp_absensi_v1%rowtype;
    v_day date := (now() at time zone 'Asia/Jakarta')::date;
    v_clock time := (now() at time zone 'Asia/Jakarta')::time(0);
    v_action text := upper(trim(coalesce(p_action,'')));
    v_address text := nullif(trim(coalesce(p_address,'')),'');
begin
    if v_uid is null then raise exception 'SESSION_INVALID'; end if;

    select * into v_profile
    from public.profiles
    where id = v_uid
      and aktif is true
      and lower(trim(role)) in ('svp','spv')
    limit 1;

    if not found then raise exception 'SVP_ACCESS_REQUIRED'; end if;
    if v_profile.karyawan_id is null then raise exception 'SVP_KARYAWAN_MAPPING_MISSING'; end if;

    select * into v_k
    from public.karyawan
    where id = v_profile.karyawan_id
    limit 1;

    if not found then raise exception 'SVP_KARYAWAN_NOT_FOUND'; end if;
    if v_action not in ('MASUK','PULANG') then raise exception 'ACTION_INVALID'; end if;

    if p_lat is null or p_lon is null or p_accuracy is null
       or p_lat::text in ('NaN','Infinity','-Infinity')
       or p_lon::text in ('NaN','Infinity','-Infinity')
       or p_accuracy::text in ('NaN','Infinity','-Infinity')
       or p_lat not between -90 and 90
       or p_lon not between -180 and 180
       or p_accuracy <= 0
       or p_accuracy > 100 then
        raise exception 'GPS_INVALID';
    end if;

    if v_action = 'MASUK' then
        insert into public.svp_absensi_v1 (
            profile_id,karyawan_id,tanggal,jam_masuk,
            latitude_masuk,longitude_masuk,accuracy_masuk,alamat_masuk
        ) values (
            v_profile.id,v_profile.karyawan_id,v_day,v_clock,
            p_lat,p_lon,p_accuracy,v_address
        )
        on conflict (karyawan_id,tanggal) do nothing
        returning * into v_row;

        if v_row.id is null then raise exception 'ABSEN_MASUK_SUDAH_TERCATAT'; end if;
    else
        select * into v_existing
        from public.svp_absensi_v1
        where karyawan_id = v_profile.karyawan_id
          and tanggal = v_day
        limit 1;

        if not found or v_existing.jam_masuk is null or v_existing.jam_pulang is not null then
            raise exception 'ABSEN_PULANG_TIDAK_TERSEDIA';
        end if;

        if now() < v_existing.created_at + interval '10 seconds' then
            raise exception 'PULANG_TOO_SOON';
        end if;

        update public.svp_absensi_v1
           set jam_pulang = v_clock,
               latitude_pulang = p_lat,
               longitude_pulang = p_lon,
               accuracy_pulang = p_accuracy,
               alamat_pulang = v_address,
               updated_at = now()
         where id = v_existing.id
           and jam_pulang is null
        returning * into v_row;

        if v_row.id is null then raise exception 'ABSEN_PULANG_TIDAK_TERSEDIA'; end if;
    end if;

    return jsonb_build_object(
        'ok', true,
        'action', v_action,
        'id', v_row.id,
        'tanggal', v_row.tanggal,
        'karyawan_id', v_row.karyawan_id,
        'nama', coalesce(v_k.nama_karyawan, v_profile.nama),
        'jam_masuk', v_row.jam_masuk,
        'jam_pulang', v_row.jam_pulang,
        'alamat_masuk', v_row.alamat_masuk,
        'alamat_pulang', v_row.alamat_pulang
    );
end;
$function$;

update public.svp_absensi_v1
set jam_pulang = null,
    latitude_pulang = null,
    longitude_pulang = null,
    accuracy_pulang = null,
    alamat_pulang = null,
    updated_at = now()
where karyawan_id = 39
  and tanggal = (now() at time zone 'Asia/Jakarta')::date
  and jam_masuk is not null
  and jam_pulang = jam_masuk;
