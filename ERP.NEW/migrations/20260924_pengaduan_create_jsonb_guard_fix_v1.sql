-- Fix Pengaduan intake JSON guard for Supabase Postgres.
-- Additive only; does not touch locked engines.

create or replace function public.karyawan_pengaduan_create(
  p_token text,
  p_kategori text,
  p_subjek text,
  p_deskripsi text,
  p_answers jsonb,
  p_prioritas text default 'NORMAL'
) returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_kid bigint := public.karyawan_session_id_from_token(p_token);
  v_cat text := upper(trim(coalesce(p_kategori,'')));
  v_priority text := upper(trim(coalesce(p_prioritas,'NORMAL')));
  v_cabang bigint;
  v_id bigint;
  v_ticket text;
  v_summary text;
  v_sensitive boolean;
begin
  if v_kid is null then return jsonb_build_object('ok',false,'reason','SESSION_INVALID'); end if;
  if v_cat not in ('ALAT_KERJA','FASILITAS_BARBER','REKAN_KERJA','LAIN_LAIN') then
    return jsonb_build_object('ok',false,'reason','CATEGORY_INVALID');
  end if;
  if v_priority not in ('RENDAH','NORMAL','TINGGI','KRITIS') then v_priority:='NORMAL'; end if;
  if nullif(trim(coalesce(p_subjek,'')),'') is null then
    return jsonb_build_object('ok',false,'reason','SUBJECT_REQUIRED');
  end if;
  if coalesce(jsonb_typeof(p_answers),'') <> 'object'
     or coalesce(p_answers,'{}'::jsonb) = '{}'::jsonb then
    return jsonb_build_object('ok',false,'reason','INTAKE_ANSWERS_REQUIRED');
  end if;

  select k.cabang_id into v_cabang
  from public.karyawan k where k.id=v_kid and k.aktif is true;
  if not found then return jsonb_build_object('ok',false,'reason','EMPLOYEE_INACTIVE'); end if;

  v_sensitive := v_cat='REKAN_KERJA';
  v_summary := 'Kategori: '||replace(v_cat,'_',' ')||E'\n'
    ||'Subjek: '||trim(p_subjek)||E'\n'
    ||coalesce((
      select string_agg(initcap(replace(key,'_',' '))||': '||value, E'\n' order by key)
      from jsonb_each_text(p_answers)
    ),'');

  insert into public.erp_pengaduan(
    pelapor_id,cabang_id,kategori,subjek,deskripsi,intake_answers,intake_summary,prioritas,sensitive
  ) values (
    v_kid,v_cabang,v_cat,trim(p_subjek),nullif(trim(coalesce(p_deskripsi,'')),''),
    p_answers,v_summary,v_priority,v_sensitive
  ) returning id into v_id;

  v_ticket := 'PENG-'||to_char(now() at time zone 'Asia/Jakarta','YYYY')||'-'||lpad(v_id::text,6,'0');
  update public.erp_pengaduan set ticket_no=v_ticket,updated_at=now() where id=v_id;

  insert into public.erp_pengaduan_event(
    pengaduan_id,actor_kind,actor_karyawan_id,event_type,status_to,message,metadata
  ) values (
    v_id,'KARYAWAN',v_kid,'CREATED','MENUNGGU_SVP',
    'Pengaduan dibuat dan intake ERP selesai.',
    jsonb_build_object('category',v_cat,'priority',v_priority)
  );

  insert into public.erp_pengaduan_notification(
    pengaduan_id,recipient_kind,recipient_karyawan_id,level,title,body,action_path
  ) values (
    v_id,'KARYAWAN',v_kid,'INFO',
    'Pengaduan '||v_ticket||' berhasil dibuat',
    'Pengaduan sudah dirangkum ERP dan diteruskan ke SVP.',
    'pengaduan.html?ticket='||v_id
  );

  perform public.erp_pengaduan_notify_staff(
    v_id,'SVP',
    case when v_priority='KRITIS' then 'KRITIS' else 'INFO' end,
    'Pengaduan baru · '||v_ticket,
    trim(p_subjek)||' · menunggu penanganan SVP.'
  );

  if v_priority='KRITIS' then
    perform public.erp_pengaduan_notify_staff(
      v_id,'OWNER','KRITIS',
      'Pengaduan kritis · '||v_ticket,
      trim(p_subjek)||' · Owner menerima notifikasi awal karena prioritas kritis.'
    );
  end if;

  return jsonb_build_object(
    'ok',true,'id',v_id,'ticket_no',v_ticket,'status','MENUNGGU_SVP',
    'sla_due_at',(select sla_due_at from public.erp_pengaduan where id=v_id),
    'owner_escalate_at',(select owner_escalate_at from public.erp_pengaduan where id=v_id)
  );
end;
$$;

revoke all on function public.karyawan_pengaduan_create(text,text,text,text,jsonb,text) from public;
grant execute on function public.karyawan_pengaduan_create(text,text,text,text,jsonb,text) to anon,authenticated;
