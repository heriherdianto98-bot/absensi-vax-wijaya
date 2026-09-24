-- ERP VAX Pengaduan staff detail + acknowledgement V1
-- Additive only. Does not modify locked engines.

create or replace function public.erp_pengaduan_detail(p_pengaduan_id bigint)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_owner boolean := public.is_erp_owner();
  v_spv boolean := public.is_erp_spv();
  v public.erp_pengaduan%rowtype;
  v_emp record;
  v_branch text;
begin
  if not (v_owner or v_spv) then return jsonb_build_object('ok',false,'reason','STAFF_ONLY'); end if;
  select * into v from public.erp_pengaduan where id=p_pengaduan_id;
  if not found then return jsonb_build_object('ok',false,'reason','NOT_FOUND'); end if;
  select k.nama_karyawan,k.jabatan,k.cabang_id into v_emp from public.karyawan k where k.id=v.pelapor_id;
  select c.nama_cabang into v_branch from public.cabang c where c.id=v.cabang_id;
  return jsonb_build_object(
    'ok',true,'role',case when v_owner then 'OWNER' else 'SVP' end,
    'ticket',jsonb_build_object(
      'id',v.id,'ticket_no',v.ticket_no,'employee_id',v.pelapor_id,'employee_name',v_emp.nama_karyawan,
      'employee_job',v_emp.jabatan,'cabang_id',v.cabang_id,'cabang_name',v_branch,'category',v.kategori,
      'subject',v.subjek,'description',v.deskripsi,'answers',v.intake_answers,'summary',v.intake_summary,
      'priority',v.prioritas,'sensitive',v.sensitive,'status',v.status,'estimate_at',v.estimasi_selesai_at,
      'sla_due_at',v.sla_due_at,'owner_escalate_at',v.owner_escalate_at,'sla_warning_at',v.sla_warning_sent_at,
      'escalated_at',v.escalated_at,'escalation_reason',v.escalation_reason,'completion_note',v.completion_note,
      'resolved_at',v.resolved_at,'employee_confirmed_at',v.employee_confirmed_at,'closed_at',v.closed_at,
      'created_at',v.created_at,'updated_at',v.updated_at,
      'age_days',greatest(0,floor(extract(epoch from (coalesce(v.closed_at,now())-v.created_at))/86400)::int)
    ),
    'timeline',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'actor',e.actor_kind,'event',e.event_type,'status_from',e.status_from,'status_to',e.status_to,
        'message',e.message,'metadata',e.metadata,'created_at',e.created_at
      ) order by e.created_at,e.id)
      from public.erp_pengaduan_event e where e.pengaduan_id=v.id
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.erp_pengaduan_detail(bigint) from public;
grant execute on function public.erp_pengaduan_detail(bigint) to authenticated;

create or replace function public.erp_pengaduan_notifications_mark_ticket(p_pengaduan_id bigint)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_count integer := 0;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','AUTH_REQUIRED'); end if;
  select lower(coalesce(role,'')) into v_role from public.profiles where id=v_uid and aktif is true;
  if v_role not in ('owner','spv','svp') then return jsonb_build_object('ok',false,'reason','STAFF_ONLY'); end if;
  update public.erp_pengaduan_notification
  set read_at=coalesce(read_at,now())
  where pengaduan_id=p_pengaduan_id and recipient_user_id=v_uid and read_at is null;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok',true,'marked',v_count);
end;
$$;
revoke all on function public.erp_pengaduan_notifications_mark_ticket(bigint) from public;
grant execute on function public.erp_pengaduan_notifications_mark_ticket(bigint) to authenticated;
