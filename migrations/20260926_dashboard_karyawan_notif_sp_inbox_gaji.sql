alter table public.karyawan_dashboard_notifikasi_baca_v1
  drop constraint if exists karyawan_dashboard_notifikasi_baca_v1_jenis_check;

alter table public.karyawan_dashboard_notifikasi_baca_v1
  add constraint karyawan_dashboard_notifikasi_baca_v1_jenis_check
  check (jenis = any (array['IZIN'::text,'DENDA'::text,'SP'::text,'GAJI'::text]));

create or replace function public.karyawan_dashboard_notifikasi_self_v1(p_token text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id bigint;
  v_me text;
  v_items jsonb;
  v_month_start date := date_trunc('month',(now() at time zone 'Asia/Jakarta'))::date;
  v_month_key bigint := to_char((now() at time zone 'Asia/Jakarta'),'YYYYMM')::bigint;
begin
  v_id:=public.karyawan_session_id_from_token(p_token);
  if v_id is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;
  v_me:='E:'||v_id::text;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.waktu desc, x.jenis, x.id),'[]'::jsonb)
  into v_items
  from (
    select 'PENGUMUMAN'::text jenis,a.id,a.judul::text judul,
      case when a.prioritas in ('penting','sangat_penting') then 'Pengumuman penting' else 'Pengumuman baru' end::text ringkasan,
      a.dibuat_pada waktu,'pengumuman.html#'||a.id::text tujuan
    from public.erp_pengumuman a
    left join public.erp_pengumuman_baca b on b.pengumuman_id=a.id and b.karyawan_id=v_id
    where a.aktif=true and b.dibaca_pada is null

    union all

    select 'IZIN'::text,i.id,('Pengajuan '||coalesce(i.jenis,'izin'))::text,
      ('Status: '||replace(coalesce(i.status,'MENUNGGU'),'_',' ')||' · '||i.tanggal::text)::text,
      coalesce(i.owner_reviewed_at,i.spv_reviewed_at) waktu,'riwayat.html'::text tujuan
    from public.pengajuan_izin i
    left join public.karyawan_dashboard_notifikasi_baca_v1 b
      on b.karyawan_id=v_id and b.jenis='IZIN' and b.sumber_id=i.id
    where i.karyawan_id=v_id
      and (i.spv_reviewed_at is not null or i.owner_reviewed_at is not null)
      and coalesce(i.owner_reviewed_at,i.spv_reviewed_at)>=now()-interval '30 days'
      and b.sumber_id is null

    union all

    select 'DENDA'::text,d.absensi_id,('Keputusan denda '||d.tanggal::text)::text,
      (case when d.status='DIBEBASKAN' then 'Denda dibebaskan'
            else 'Denda final Rp'||to_char(coalesce(d.nominal_final,0),'FM999G999G999G990') end)::text,
      d.diputus_pada waktu,'absensi.html'::text tujuan
    from public.absensi_denda_review_v1 d
    left join public.karyawan_dashboard_notifikasi_baca_v1 b
      on b.karyawan_id=v_id and b.jenis='DENDA' and b.sumber_id=d.absensi_id
    where d.karyawan_id=v_id
      and d.status in ('DITETAPKAN','DIBEBASKAN')
      and d.diputus_pada>=now()-interval '30 days'
      and b.sumber_id is null

    union all

    select 'SP'::text,s.id,('Surat Peringatan SP'||s.tingkat::text)::text,
      ('SP'||s.tingkat::text||' telah diterbitkan · konfirmasi penerimaan diperlukan')::text,
      s.diterbitkan_pada waktu,
      ('surat-peringatan-saya.html?id='||s.id::text)::text tujuan
    from public.vax_surat_peringatan_v1 s
    left join public.karyawan_dashboard_notifikasi_baca_v1 b
      on b.karyawan_id=v_id and b.jenis='SP' and b.sumber_id=s.id
    where s.karyawan_id=v_id
      and s.status='TERBIT'
      and s.diterbitkan_pada is not null
      and b.sumber_id is null

    union all

    select 'INBOX'::text,t.id,
      ('Pesan baru dari '||coalesce(p.nama,'Owner / SPV'))::text judul,
      coalesce((
        select m.body
        from public.vax_inbox_messages m
        where m.thread_id=t.id and m.sender_key<>v_me
        order by m.id desc limit 1
      ),'Pesan baru')::text ringkasan,
      coalesce((
        select m.created_at
        from public.vax_inbox_messages m
        where m.thread_id=t.id and m.sender_key<>v_me
        order by m.id desc limit 1
      ),t.updated_at) waktu,
      'pesan-karyawan.html'::text tujuan
    from public.vax_inbox_threads t
    cross join lateral (
      select case when t.party_a=v_me then t.party_b else t.party_a end as peer_key
    ) other
    left join public.profiles p
      on left(other.peer_key,2)='S:'
     and p.id=(case when left(other.peer_key,2)='S:' then substring(other.peer_key from 3)::uuid else null end)
    left join public.vax_inbox_reads r
      on r.thread_id=t.id and r.participant_key=v_me
    where (t.party_a=v_me or t.party_b=v_me)
      and exists(
        select 1
        from public.vax_inbox_messages m
        where m.thread_id=t.id
          and m.sender_key<>v_me
          and m.id>coalesce(r.last_message_id,0)
      )

    union all

    select 'GAJI'::text,v_month_key,
      'Data Gaji Bulan Ini'::text judul,
      ('Data penghasilan '||to_char(v_month_start,'FMMonth YYYY')||' tersedia di Gaji Saya')::text ringkasan,
      coalesce(
        (select max((activity_date::timestamp at time zone 'Asia/Jakarta'))
         from public.provider_sales_daily_source
         where employee_id=v_id and activity_date>=v_month_start),
        (select max((tanggal::timestamp at time zone 'Asia/Jakarta'))
         from public.absensi
         where karyawan_id=v_id and tanggal>=v_month_start),
        now()
      ) waktu,
      'gaji-saya.html'::text tujuan
    from public.karyawan k
    left join public.karyawan_dashboard_notifikasi_baca_v1 b
      on b.karyawan_id=v_id and b.jenis='GAJI' and b.sumber_id=v_month_key
    where k.id=v_id
      and lower(trim(coalesce(k.jabatan,''))) like '%capster%'
      and b.sumber_id is null
      and (
        exists(select 1 from public.provider_sales_daily_source where employee_id=v_id and activity_date>=v_month_start)
        or exists(select 1 from public.absensi where karyawan_id=v_id and tanggal>=v_month_start)
      )

    order by waktu desc
    limit 50
  ) x;

  return jsonb_build_object('ok',true,'items',v_items);
end;
$function$;

create or replace function public.karyawan_dashboard_notifikasi_baca_self_v1(
  p_token text,
  p_jenis text,
  p_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id bigint;
  v_me text;
  v_last bigint;
  v_month_key bigint := to_char((now() at time zone 'Asia/Jakarta'),'YYYYMM')::bigint;
begin
  v_id:=public.karyawan_session_id_from_token(p_token);
  if v_id is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;
  v_me:='E:'||v_id::text;

  if p_jenis='PENGUMUMAN' then
    if not exists(select 1 from public.erp_pengumuman where id=p_id and aktif=true) then
      return jsonb_build_object('ok',false,'reason','NOT_FOUND');
    end if;
    insert into public.erp_pengumuman_baca(pengumuman_id,karyawan_id,dibaca_pada)
    values(p_id,v_id,now())
    on conflict(pengumuman_id,karyawan_id) do update set dibaca_pada=excluded.dibaca_pada;

  elsif p_jenis='IZIN' then
    if not exists(select 1 from public.pengajuan_izin where id=p_id and karyawan_id=v_id and (spv_reviewed_at is not null or owner_reviewed_at is not null)) then
      return jsonb_build_object('ok',false,'reason','NOT_FOUND');
    end if;
    insert into public.karyawan_dashboard_notifikasi_baca_v1(karyawan_id,jenis,sumber_id)
    values(v_id,'IZIN',p_id) on conflict do nothing;

  elsif p_jenis='DENDA' then
    if not exists(select 1 from public.absensi_denda_review_v1 where absensi_id=p_id and karyawan_id=v_id and status in ('DITETAPKAN','DIBEBASKAN')) then
      return jsonb_build_object('ok',false,'reason','NOT_FOUND');
    end if;
    insert into public.karyawan_dashboard_notifikasi_baca_v1(karyawan_id,jenis,sumber_id)
    values(v_id,'DENDA',p_id) on conflict do nothing;

  elsif p_jenis='SP' then
    if not exists(select 1 from public.vax_surat_peringatan_v1 where id=p_id and karyawan_id=v_id and status='TERBIT') then
      return jsonb_build_object('ok',false,'reason','NOT_FOUND');
    end if;
    insert into public.karyawan_dashboard_notifikasi_baca_v1(karyawan_id,jenis,sumber_id)
    values(v_id,'SP',p_id) on conflict do nothing;

  elsif p_jenis='INBOX' then
    if not exists(select 1 from public.vax_inbox_threads t where t.id=p_id and (t.party_a=v_me or t.party_b=v_me)) then
      return jsonb_build_object('ok',false,'reason','NOT_FOUND');
    end if;
    select coalesce(max(m.id),0) into v_last
    from public.vax_inbox_messages m
    where m.thread_id=p_id;
    insert into public.vax_inbox_reads(thread_id,participant_key,last_message_id)
    values(p_id,v_me,v_last)
    on conflict(thread_id,participant_key) do update
      set last_message_id=greatest(public.vax_inbox_reads.last_message_id,excluded.last_message_id),
          read_at=now();

  elsif p_jenis='GAJI' then
    if p_id<>v_month_key then
      return jsonb_build_object('ok',false,'reason','NOT_FOUND');
    end if;
    insert into public.karyawan_dashboard_notifikasi_baca_v1(karyawan_id,jenis,sumber_id)
    values(v_id,'GAJI',p_id) on conflict do nothing;

  else
    return jsonb_build_object('ok',false,'reason','TYPE_INVALID');
  end if;

  return jsonb_build_object('ok',true);
end;
$function$;