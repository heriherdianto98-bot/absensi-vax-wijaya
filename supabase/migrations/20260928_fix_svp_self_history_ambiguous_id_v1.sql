-- Fix PL/pgSQL output-column ambiguity in SVP self attendance history RPC.
-- The RETURNS TABLE output variable "id" conflicted with unqualified profiles.id.

create or replace function public.svp_absensi_self_history_v1(
    p_limit integer default 31
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
    v_limit integer := greatest(1, least(coalesce(p_limit,31), 90));
begin
    if v_uid is null then
        raise exception 'SESSION_INVALID';
    end if;

    select p.* into v_profile
    from public.profiles p
    where p.id = v_uid
      and p.aktif is true
      and lower(trim(p.role)) in ('svp','spv')
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
select pg_notify('pgrst','reload schema');
