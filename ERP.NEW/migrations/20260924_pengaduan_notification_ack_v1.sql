-- Pengaduan notification acknowledgement for employee ticket detail.
create or replace function public.karyawan_pengaduan_notifications_mark_ticket(
  p_token text,
  p_pengaduan_id bigint
) returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_kid bigint := public.karyawan_session_id_from_token(p_token);
  v_count integer;
begin
  if v_kid is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  if not exists(
    select 1 from public.erp_pengaduan
    where id=p_pengaduan_id and pelapor_id=v_kid
  ) then
    return jsonb_build_object('ok',false,'reason','NOT_FOUND');
  end if;

  update public.erp_pengaduan_notification
  set read_at=coalesce(read_at,now())
  where pengaduan_id=p_pengaduan_id
    and recipient_karyawan_id=v_kid
    and read_at is null;

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok',true,'marked',v_count);
end;
$$;

revoke all on function public.karyawan_pengaduan_notifications_mark_ticket(text,bigint) from public;
grant execute on function public.karyawan_pengaduan_notifications_mark_ticket(text,bigint) to anon,authenticated;
