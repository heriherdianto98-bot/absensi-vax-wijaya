-- ERP VAX — Owner read marker for Pulang Lebih Awal
-- Scope: new module only. Does not modify Absensi approval/status logic.

alter table public.pengajuan_pulang_awal
  add column if not exists owner_read_at timestamptz,
  add column if not exists owner_read_by uuid;

create or replace function public.mark_pulang_awal_owner_read_v1(p_pengajuan_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_row public.pengajuan_pulang_awal%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_erp_owner() then
    raise exception 'OWNER_ONLY';
  end if;

  update public.pengajuan_pulang_awal
     set owner_read_at = coalesce(owner_read_at, now()),
         owner_read_by = coalesce(owner_read_by, auth.uid()),
         updated_at = now()
   where id = p_pengajuan_id
     and status in ('DISETUJUI_SPV','DITOLAK_SPV')
  returning * into v_row;

  if not found then
    raise exception 'PENGAJUAN_NOT_FOUND_OR_NOT_DECIDED';
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'owner_read_at', v_row.owner_read_at,
    'owner_read_by', v_row.owner_read_by
  );
end;
$function$;

revoke all on function public.mark_pulang_awal_owner_read_v1(bigint) from public;
grant execute on function public.mark_pulang_awal_owner_read_v1(bigint) to authenticated;

create or replace function public.pulang_awal_list_reviewer_v1(p_scope text default 'ALL'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text;
  v_scope text := upper(trim(coalesce(p_scope,'ALL')));
  v_data jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  if public.is_erp_owner() then
    v_role := 'owner';
  elsif public.is_erp_spv() then
    v_role := 'spv';
  else
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
    into v_data
    from (
      select
        p.id,p.created_at,p.updated_at,p.karyawan_id,p.cabang_id,p.absensi_id,
        p.tanggal,p.jenis,p.alasan,p.bukti_path,p.status,
        p.jam_masuk_snapshot,p.jam_pulang_sebelum,p.jam_pulang_setelah,
        p.absensi_status_sebelum,p.absensi_status_setelah,
        p.status_absensi_sebelum,p.status_absensi_setelah,
        p.denda_sebelum,p.status_denda_sebelum,
        p.spv_user_id,p.spv_catatan,p.spv_reviewed_at,
        p.owner_read_at,p.owner_read_by,
        k.nama_karyawan,k.jabatan,
        c.nama_cabang,
        pr.nama as spv_nama
      from public.pengajuan_pulang_awal p
      left join public.karyawan k on k.id=p.karyawan_id
      left join public.cabang c on c.id=p.cabang_id
      left join public.profiles pr on pr.id=p.spv_user_id
      where
        case
          when v_role='spv' and v_scope='PENDING' then p.status='MENUNGGU_SPV'
          when v_role='spv' and v_scope='DECIDED' then p.status in ('DISETUJUI_SPV','DITOLAK_SPV')
          when v_role='owner' and v_scope='PENDING' then p.status='MENUNGGU_SPV'
          when v_role='owner' and v_scope='DECIDED' then p.status in ('DISETUJUI_SPV','DITOLAK_SPV')
          else true
        end
      order by p.created_at desc
      limit 200
    ) x;

  return jsonb_build_object('ok',true,'role',v_role,'scope',v_scope,'rows',v_data);
end;
$function$;

revoke all on function public.pulang_awal_list_reviewer_v1(text) from public;
grant execute on function public.pulang_awal_list_reviewer_v1(text) to authenticated;
