-- SVP self attendance history v1
-- Read-only RPC for the currently authenticated SVP/SPV.

create or replace function public.svp_absensi_self_history_v1(
    p_limit integer default 30
)
returns table (
    id bigint,
    tanggal date,
    jam_masuk time without time zone,
    jam_pulang time without time zone,
    alamat_masuk text,
    alamat_pulang text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    v_uid uuid := auth.uid();
    v_profile public.profiles%rowtype;
    v_limit integer := greatest(1, least(coalesce(p_limit,30), 90));
begin
    if v_uid is null then
        raise exception 'SESSION_INVALID';
    end if;

    select * into v_profile
    from public.profiles
    where id = v_uid
      and aktif is true
      and lower(trim(role)) in ('svp','spv')
    limit 1;

    if not found then
        raise exception 'SVP_ACCESS_REQUIRED';
    end if;

    if v_profile.karyawan_id is null then
        raise exception 'SVP_KARYAWAN_MAPPING_MISSING';
    end if;

    return query
    select
        a.id,
        a.tanggal,
        a.jam_masuk,
        a.jam_pulang,
        a.alamat_masuk,
        a.alamat_pulang
    from public.svp_absensi_v1 a
    where a.karyawan_id = v_profile.karyawan_id
    order by a.tanggal desc, a.id desc
    limit v_limit;
end;
$function$;

grant execute on function public.svp_absensi_self_history_v1(integer) to authenticated;
