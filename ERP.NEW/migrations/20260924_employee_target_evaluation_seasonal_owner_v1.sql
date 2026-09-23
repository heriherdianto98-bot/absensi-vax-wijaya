-- VAX ERP Employee Target Evaluation + Owner Seasonal Calendar Management V1
-- Additive management/status layer. Core target calculation remains untouched.

create or replace function public.karyawan_income_target_status_self(
  p_token text,
  p_month date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_employee_id bigint;
  v_payload jsonb;
  v_last_success date;
  v_miss_streak integer := 0;
begin
  v_employee_id := public.karyawan_session_id_from_token(p_token);
  if v_employee_id is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  v_payload := public.karyawan_income_target_self(p_token,p_month);
  if coalesce((v_payload->>'ok')::boolean,false) is not true then
    return v_payload;
  end if;

  select max(month_start) into v_last_success
  from public.karyawan_income_target_monthly
  where employee_id=v_employee_id
    and status='FINAL'
    and achievement_pct>=100;

  select count(*)::integer into v_miss_streak
  from public.karyawan_income_target_monthly
  where employee_id=v_employee_id
    and status='FINAL'
    and achievement_pct<100
    and (v_last_success is null or month_start>v_last_success);

  return v_payload || jsonb_build_object(
    'miss_streak',v_miss_streak,
    'evaluation_required',v_miss_streak>=3,
    'evaluation_message',case
      when v_miss_streak>=3 then v_miss_streak||' bulan berturut-turut belum mencapai target. Evaluasi diperlukan.'
      when v_miss_streak=2 then '2 bulan berturut-turut belum mencapai target.'
      when v_miss_streak=1 then 'Bulan terakhir belum mencapai target.'
      else null
    end
  );
end;
$function$;

revoke all on function public.karyawan_income_target_status_self(text,date) from public;
grant execute on function public.karyawan_income_target_status_self(text,date) to anon,authenticated,service_role;

create or replace function public.owner_income_target_seasonal_list()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_items jsonb;
begin
  if not public.is_erp_owner() then
    return jsonb_build_object('ok',false,'reason','OWNER_ONLY');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',id,
      'event_code',event_code,
      'event_name',event_name,
      'start_date',start_date,
      'end_date',end_date,
      'source_type',source_type,
      'notes',notes,
      'enabled',enabled,
      'created_at',created_at,
      'updated_at',updated_at
    ) order by start_date desc,id desc
  ),'[]'::jsonb)
  into v_items
  from public.karyawan_income_target_seasonal_calendar;

  return jsonb_build_object('ok',true,'items',v_items);
end;
$function$;

revoke all on function public.owner_income_target_seasonal_list() from public;
grant execute on function public.owner_income_target_seasonal_list() to authenticated,service_role;

create or replace function public.owner_income_target_seasonal_save(
  p_id bigint default null,
  p_event_name text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_notes text default null,
  p_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id bigint;
  v_name text := trim(coalesce(p_event_name,''));
begin
  if not public.is_erp_owner() then
    return jsonb_build_object('ok',false,'reason','OWNER_ONLY');
  end if;
  if v_name='' then return jsonb_build_object('ok',false,'reason','NAME_REQUIRED'); end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    return jsonb_build_object('ok',false,'reason','DATE_INVALID');
  end if;
  if (p_end_date-p_start_date)>120 then
    return jsonb_build_object('ok',false,'reason','RANGE_TOO_LONG');
  end if;

  if p_id is null then
    insert into public.karyawan_income_target_seasonal_calendar(
      event_code,event_name,start_date,end_date,source_type,notes,enabled
    ) values(
      'CUSTOM_'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),
      v_name,p_start_date,p_end_date,'OWNER',nullif(trim(coalesce(p_notes,'')),''),coalesce(p_enabled,true)
    )
    returning id into v_id;
  else
    update public.karyawan_income_target_seasonal_calendar
    set event_name=v_name,
        start_date=p_start_date,
        end_date=p_end_date,
        notes=nullif(trim(coalesce(p_notes,'')),''),
        enabled=coalesce(p_enabled,true),
        updated_at=now()
    where id=p_id
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok',false,'reason','NOT_FOUND'); end if;
  end if;

  return jsonb_build_object('ok',true,'id',v_id);
end;
$function$;

revoke all on function public.owner_income_target_seasonal_save(bigint,text,date,date,text,boolean) from public;
grant execute on function public.owner_income_target_seasonal_save(bigint,text,date,date,text,boolean) to authenticated,service_role;

create or replace function public.owner_income_target_seasonal_set_enabled(
  p_id bigint,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id bigint;
begin
  if not public.is_erp_owner() then
    return jsonb_build_object('ok',false,'reason','OWNER_ONLY');
  end if;
  update public.karyawan_income_target_seasonal_calendar
  set enabled=coalesce(p_enabled,false),updated_at=now()
  where id=p_id
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok',false,'reason','NOT_FOUND'); end if;
  return jsonb_build_object('ok',true,'id',v_id,'enabled',coalesce(p_enabled,false));
end;
$function$;

revoke all on function public.owner_income_target_seasonal_set_enabled(bigint,boolean) from public;
grant execute on function public.owner_income_target_seasonal_set_enabled(bigint,boolean) to authenticated,service_role;
