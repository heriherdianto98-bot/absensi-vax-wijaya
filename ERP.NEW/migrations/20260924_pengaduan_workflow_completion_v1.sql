-- ERP VAX Pengaduan workflow completion V1
-- Employee reply, staff history visibility, and auto-close after 2 days.

create or replace function public.karyawan_pengaduan_reply(
  p_token text,p_pengaduan_id bigint,p_message text
) returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_kid bigint := public.karyawan_session_id_from_token(p_token);
  v public.erp_pengaduan%rowtype;
  v_from text;
  v_to text;
  v_msg text := nullif(trim(coalesce(p_message,'')),'');
begin
  if v_kid is null then return jsonb_build_object('ok',false,'reason','SESSION_INVALID'); end if;
  if v_msg is null then return jsonb_build_object('ok',false,'reason','MESSAGE_REQUIRED'); end if;
  select * into v from public.erp_pengaduan
  where id=p_pengaduan_id and pelapor_id=v_kid for update;
  if not found then return jsonb_build_object('ok',false,'reason','NOT_FOUND'); end if;
  if v.status in ('SELESAI','DITUTUP_OTOMATIS') then return jsonb_build_object('ok',false,'reason','TICKET_CLOSED'); end if;
  v_from:=v.status;
  v_to:=case when v.status='MENUNGGU_INFO' then 'DALAM_PENANGANAN' else v.status end;
  update public.erp_pengaduan set status=v_to,updated_at=now() where id=v.id;
  insert into public.erp_pengaduan_event(
    pengaduan_id,actor_kind,actor_karyawan_id,event_type,status_from,status_to,message
  ) values(v.id,'KARYAWAN',v_kid,'EMPLOYEE_REPLY',v_from,v_to,v_msg);
  perform public.erp_pengaduan_notify_staff(v.id,'SVP','INFO','Jawaban karyawan · '||v.ticket_no,v_msg);
  return jsonb_build_object('ok',true,'status',v_to);
end;
$$;
revoke all on function public.karyawan_pengaduan_reply(text,bigint,text) from public;
grant execute on function public.karyawan_pengaduan_reply(text,bigint,text) to anon,authenticated;

create or replace function public.erp_pengaduan_queue(p_status text default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp'
as $$
declare v_owner boolean:=public.is_erp_owner(); v_spv boolean:=public.is_erp_spv(); v_role text;
begin
  if not(v_owner or v_spv) then return jsonb_build_object('ok',false,'reason','STAFF_ONLY'); end if;
  v_role:=case when v_owner then 'OWNER' else 'SVP' end;
  return jsonb_build_object('ok',true,'role',v_role,'items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'ticket_no',p.ticket_no,'employee_id',p.pelapor_id,'employee_name',k.nama_karyawan,
      'cabang_id',p.cabang_id,'cabang_name',c.nama_cabang,'category',p.kategori,'subject',p.subjek,
      'summary',p.intake_summary,'priority',p.prioritas,'sensitive',p.sensitive,'status',p.status,
      'estimate_at',p.estimasi_selesai_at,'sla_due_at',p.sla_due_at,'owner_escalate_at',p.owner_escalate_at,
      'escalated_at',p.escalated_at,'escalation_reason',p.escalation_reason,'created_at',p.created_at,
      'closed_at',p.closed_at,
      'age_days',greatest(0,floor(extract(epoch from (coalesce(p.closed_at,now())-p.created_at))/86400)::int)
    ) order by case when p.closed_at is null then 0 else 1 end,
      case p.prioritas when 'KRITIS' then 0 when 'TINGGI' then 1 when 'NORMAL' then 2 else 3 end,
      p.created_at desc)
    from public.erp_pengaduan p join public.karyawan k on k.id=p.pelapor_id
    left join public.cabang c on c.id=p.cabang_id
    where (p_status is null or p.status=upper(p_status))
  ),'[]'::jsonb));
end;
$$;
revoke all on function public.erp_pengaduan_queue(text) from public;
grant execute on function public.erp_pengaduan_queue(text) to authenticated;

create or replace function public.erp_pengaduan_sla_sweep()
returns jsonb language plpgsql security definer set search_path='public','pg_temp'
as $$
declare r record; v_warn int:=0; v_escalate int:=0; v_autoclose int:=0;
begin
  for r in select * from public.erp_pengaduan
    where closed_at is null and status not in ('SELESAI','DITUTUP_OTOMATIS','SELESAI_MENUNGGU_KONFIRMASI')
      and now()>=sla_due_at and sla_warning_sent_at is null
  loop
    update public.erp_pengaduan set sla_warning_sent_at=now(),updated_at=now() where id=r.id;
    perform public.erp_pengaduan_notify_staff(r.id,'SVP','PERHATIAN','SLA 4 hari · '||r.ticket_no,'Pengaduan sudah mencapai batas target penanganan 4 hari.');
    insert into public.erp_pengaduan_event(pengaduan_id,actor_kind,event_type,status_from,status_to,message)
    values(r.id,'SYSTEM','SLA_WARNING',r.status,r.status,'SLA 4 hari tercapai; reminder dikirim ke SVP.');
    v_warn:=v_warn+1;
  end loop;

  for r in select * from public.erp_pengaduan
    where closed_at is null and status not in ('SELESAI','DITUTUP_OTOMATIS','ESKALASI_OWNER','SELESAI_MENUNGGU_KONFIRMASI')
      and now()>=owner_escalate_at
  loop
    update public.erp_pengaduan set status='ESKALASI_OWNER',escalated_at=now(),
      escalation_reason=coalesce(escalation_reason,'Melewati 7 hari tanpa penyelesaian SVP.'),updated_at=now()
    where id=r.id;
    insert into public.erp_pengaduan_event(pengaduan_id,actor_kind,event_type,status_from,status_to,message)
    values(r.id,'SYSTEM','AUTO_ESCALATION',r.status,'ESKALASI_OWNER','Melewati 7 hari; sistem otomatis meneruskan ke Owner.');
    perform public.erp_pengaduan_notify_staff(r.id,'OWNER','KRITIS','Auto eskalasi 7 hari · '||r.ticket_no,'Pengaduan belum selesai dalam 7 hari. Alasan sistem: belum ada penyelesaian SVP.');
    perform public.erp_pengaduan_notify_staff(r.id,'SVP','KRITIS','Pengaduan dieskalasi · '||r.ticket_no,'Pengaduan otomatis diteruskan ke Owner karena melewati 7 hari.');
    insert into public.erp_pengaduan_notification(pengaduan_id,recipient_kind,recipient_karyawan_id,level,title,body,action_path)
    values(r.id,'KARYAWAN',r.pelapor_id,'PERHATIAN','Pengaduan diteruskan ke Owner · '||r.ticket_no,'Pengaduan belum selesai dalam 7 hari dan otomatis dieskalasi ke Owner.','pengaduan.html?ticket='||r.id);
    v_escalate:=v_escalate+1;
  end loop;

  for r in select * from public.erp_pengaduan
    where status='SELESAI_MENUNGGU_KONFIRMASI' and closed_at is null
      and resolved_at is not null and now()>=resolved_at+interval '2 days'
  loop
    update public.erp_pengaduan set status='DITUTUP_OTOMATIS',closed_at=now(),updated_at=now() where id=r.id;
    insert into public.erp_pengaduan_event(pengaduan_id,actor_kind,event_type,status_from,status_to,message)
    values(r.id,'SYSTEM','AUTO_CLOSE_NO_RESPONSE','SELESAI_MENUNGGU_KONFIRMASI','DITUTUP_OTOMATIS','Ditutup otomatis setelah 2 hari tidak ada sanggahan dari pelapor.');
    insert into public.erp_pengaduan_notification(pengaduan_id,recipient_kind,recipient_karyawan_id,level,title,body,action_path)
    values(r.id,'KARYAWAN',r.pelapor_id,'INFO','Pengaduan ditutup otomatis · '||r.ticket_no,'Tidak ada sanggahan selama 2 hari setelah dinyatakan selesai.','pengaduan.html?ticket='||r.id);
    v_autoclose:=v_autoclose+1;
  end loop;
  return jsonb_build_object('ok',true,'warnings',v_warn,'escalations',v_escalate,'auto_closed',v_autoclose,'ran_at',now());
end;
$$;
revoke all on function public.erp_pengaduan_sla_sweep() from public;
grant execute on function public.erp_pengaduan_sla_sweep() to service_role;
