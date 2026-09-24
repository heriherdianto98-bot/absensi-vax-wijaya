-- ERP VAX Pengaduan estimate required guard V1
-- Requires an estimate before START / resume handling.

create or replace function public.erp_pengaduan_action(
  p_pengaduan_id bigint,
  p_action text,
  p_catatan text default null,
  p_estimasi_selesai_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_owner boolean := public.is_erp_owner();
  v_spv boolean := public.is_erp_spv();
  v_action text := upper(trim(coalesce(p_action,'')));
  v public.erp_pengaduan%rowtype;
  v_from text;
  v_to text;
  v_actor text;
begin
  if not (v_owner or v_spv) then return jsonb_build_object('ok',false,'reason','STAFF_ONLY'); end if;
  select * into v from public.erp_pengaduan where id=p_pengaduan_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','NOT_FOUND'); end if;
  if v.status in ('SELESAI','DITUTUP_OTOMATIS') then return jsonb_build_object('ok',false,'reason','ALREADY_CLOSED'); end if;

  v_from:=v.status;
  v_actor:=case when v_owner then 'OWNER' else 'SVP' end;

  if v_action='ACCEPT' then v_to:='DITERIMA_SVP';
  elsif v_action='START' then v_to:='DALAM_PENANGANAN';
  elsif v_action='WAIT_INFO' then v_to:='MENUNGGU_INFO';
  elsif v_action='WAIT_ACTION' then v_to:='MENUNGGU_TINDAKAN';
  elsif v_action='RESOLVE' then v_to:='SELESAI_MENUNGGU_KONFIRMASI';
  elsif v_action='ESCALATE_OWNER' then v_to:='ESKALASI_OWNER';
  else return jsonb_build_object('ok',false,'reason','ACTION_INVALID'); end if;

  if v_owner and v_action in ('ACCEPT') then
    return jsonb_build_object('ok',false,'reason','ACTION_SVP_ONLY');
  end if;

  if v_action='START' and coalesce(p_estimasi_selesai_at,v.estimasi_selesai_at) is null then
    return jsonb_build_object('ok',false,'reason','ESTIMATE_REQUIRED');
  end if;

  update public.erp_pengaduan set
    status=v_to,
    svp_user_id=case when not v_owner and svp_user_id is null then auth.uid() else svp_user_id end,
    owner_user_id=case when v_owner then auth.uid() else owner_user_id end,
    estimasi_selesai_at=coalesce(p_estimasi_selesai_at,estimasi_selesai_at),
    escalated_at=case when v_to='ESKALASI_OWNER' then coalesce(escalated_at,now()) else escalated_at end,
    escalation_reason=case when v_to='ESKALASI_OWNER' then coalesce(nullif(trim(p_catatan),''),'Eskalasi manual oleh SVP.') else escalation_reason end,
    resolved_at=case when v_to='SELESAI_MENUNGGU_KONFIRMASI' then now() else resolved_at end,
    completion_note=case when v_to='SELESAI_MENUNGGU_KONFIRMASI' then nullif(trim(p_catatan),'') else completion_note end,
    updated_at=now()
  where id=v.id;

  insert into public.erp_pengaduan_event(
    pengaduan_id,actor_kind,actor_user_id,event_type,status_from,status_to,message,metadata
  ) values (
    v.id,v_actor,auth.uid(),v_action,v_from,v_to,nullif(trim(coalesce(p_catatan,'')),''),
    jsonb_build_object('estimate_at',p_estimasi_selesai_at)
  );

  insert into public.erp_pengaduan_notification(
    pengaduan_id,recipient_kind,recipient_karyawan_id,level,title,body,action_path
  ) values (
    v.id,'KARYAWAN',v.pelapor_id,
    case when v_to='ESKALASI_OWNER' then 'PERHATIAN' else 'INFO' end,
    'Update pengaduan · '||v.ticket_no,
    case v_to
      when 'DITERIMA_SVP' then 'Pengaduan sudah diterima SVP.'
      when 'DALAM_PENANGANAN' then 'Pengaduan sedang ditangani SVP.'
      when 'MENUNGGU_INFO' then 'SVP membutuhkan informasi tambahan.'
      when 'MENUNGGU_TINDAKAN' then 'Pengaduan menunggu tindakan lanjutan.'
      when 'SELESAI_MENUNGGU_KONFIRMASI' then 'SVP menyatakan masalah selesai. Mohon konfirmasi.'
      when 'ESKALASI_OWNER' then 'Pengaduan diteruskan ke Owner.'
      else 'Status pengaduan berubah.'
    end,
    'pengaduan.html?ticket='||v.id
  );

  if v_to='ESKALASI_OWNER' then
    perform public.erp_pengaduan_notify_staff(
      v.id,'OWNER','PERHATIAN','Eskalasi pengaduan · '||v.ticket_no,
      coalesce(nullif(trim(p_catatan),''),'Pengaduan diteruskan ke Owner.')
    );
  end if;

  return jsonb_build_object('ok',true,'status',v_to);
end;
$$;

revoke all on function public.erp_pengaduan_action(bigint,text,text,timestamptz) from public;
grant execute on function public.erp_pengaduan_action(bigint,text,text,timestamptz) to authenticated;
