-- VAX ERP Employee Income Target V2 — New Employee Baseline Guard
-- Additive wrapper around V1. LOCKed Owner/Payroll/Absensi engines are untouched.

create or replace function public.karyawan_income_target_self_v2(
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
  v_jabatan text;
  v_payload jsonb;
  v_month date := date_trunc('month',coalesce(p_month,(now() at time zone 'Asia/Jakarta')::date))::date;
  v_current_month date := date_trunc('month',(now() at time zone 'Asia/Jakarta')::date)::date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_join_date date;
  v_candidate date;
  v_candidate_end date;
  v_employment_days integer := 0;
  v_calc jsonb;
  v_calendar jsonb;
  v_seed_amount numeric := 0;
  v_anchor date;
  v_next date;
  v_prev date;
  v_prev_row public.karyawan_income_target_monthly%rowtype;
  v_row public.karyawan_income_target_monthly%rowtype;
  v_realization numeric := 0;
  v_complete boolean := true;
  v_reason text;
  v_pct numeric := 0;
  v_growth numeric := 0;
  v_seasonal boolean := false;
  v_seasonal_reason text;
  v_hist_count integer := 0;
  v_median numeric := null;
  v_target numeric := 0;
  v_end date;
begin
  v_employee_id := public.karyawan_session_id_from_token(p_token);
  if v_employee_id is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  select lower(trim(coalesce(k.jabatan,'')))
    into v_jabatan
  from public.karyawan k
  where k.id=v_employee_id and k.aktif is true
  limit 1;

  if v_jabatan is null then return jsonb_build_object('ok',false,'reason','KARYAWAN_INACTIVE'); end if;
  if v_jabatan<>'capster' then return jsonb_build_object('ok',false,'reason','CAPSTER_ONLY'); end if;

  -- Existing/legacy employees continue through the already-tested V1 path.
  v_payload := public.karyawan_income_target_self(p_token,v_month);
  if coalesce((v_payload->>'ok')::boolean,false) is true then
    return v_payload || jsonb_build_object('engine_version','V2');
  end if;

  if coalesce(v_payload->>'reason','') <> 'BASELINE_UNAVAILABLE' then
    return v_payload || jsonb_build_object('engine_version','V2');
  end if;

  -- Employment start: master identity first, then earliest operational evidence.
  select coalesce(
    (select ki.tanggal_bergabung
       from public.karyawan_identitas ki
      where ki.karyawan_id=v_employee_id
      limit 1),
    least(
      coalesce((select min(s.activity_date) from public.provider_sales_daily_source s where s.employee_id=v_employee_id),date '9999-12-31'),
      coalesce((select min(a.tanggal) from public.absensi a where a.karyawan_id=v_employee_id),date '9999-12-31')
    )
  )
  into v_join_date;

  if v_join_date=date '9999-12-31' then v_join_date:=null; end if;

  -- If a V2 seed already exists, continue from the latest known target month.
  select max(t.month_start) into v_anchor
  from public.karyawan_income_target_monthly t
  where t.employee_id=v_employee_id
    and t.month_start<=v_month;

  -- No target history yet: find the first completed, normal, representative month.
  if v_anchor is null then
    if v_join_date is null then
      return jsonb_build_object(
        'ok',false,
        'reason','NEW_EMPLOYEE_BASELINE_WAIT',
        'detail','JOIN_DATE_AND_ACTIVITY_UNAVAILABLE',
        'engine_version','V2'
      );
    end if;

    v_candidate := greatest(date_trunc('month',v_join_date)::date,date '2026-09-01');

    while v_candidate < v_month loop
      v_candidate_end := (v_candidate + interval '1 month - 1 day')::date;
      v_employment_days := greatest(0,(v_candidate_end - greatest(v_candidate,v_join_date) + 1));

      -- Guard 1: month must represent at least 20 active calendar days.
      if v_employment_days >= 20 then
        v_calendar := public.karyawan_income_target_calendar_guard(v_candidate);

        -- Guard 2: seasonal months never become a first baseline.
        if coalesce((v_calendar->>'seasonal')::boolean,false) is false then
          v_calc := public.karyawan_target_income_calc(v_employee_id,v_candidate,v_candidate_end);
          v_complete := coalesce((v_calc->>'data_complete')::boolean,false);
          v_seed_amount := coalesce((v_calc->>'amount')::numeric,0);

          -- Guard 3: Hak Dibayar data must be final/complete and positive.
          if v_complete and v_seed_amount>0 then
            v_anchor := (v_candidate + interval '1 month')::date;

            insert into public.karyawan_income_target_monthly(
              employee_id,month_start,target_amount,realization_amount,baseline_normal,
              achievement_pct,next_growth_pct,source_type,source_month,
              seasonal_flag,seasonal_reason,data_complete,status
            )
            values(
              v_employee_id,v_anchor,v_seed_amount,0,v_seed_amount,
              0,0,'NEW_EMPLOYEE_HAK_DIBAYAR_SEED',v_candidate,
              false,null,true,'OPEN'
            )
            on conflict(employee_id,month_start) do nothing;

            exit;
          end if;
        end if;
      end if;

      v_candidate := (v_candidate + interval '1 month')::date;
    end loop;
  end if;

  if v_anchor is null then
    return jsonb_build_object(
      'ok',false,
      'reason','NEW_EMPLOYEE_BASELINE_WAIT',
      'join_date',v_join_date,
      'minimum_active_days',20,
      'engine_version','V2'
    );
  end if;

  -- Continue forward from the latest existing target row, without requiring Sept legacy history.
  select max(t.month_start) into v_anchor
  from public.karyawan_income_target_monthly t
  where t.employee_id=v_employee_id
    and t.month_start<=v_month;

  v_next := (v_anchor + interval '1 month')::date;

  while v_next<=v_month loop
    v_prev := (v_next - interval '1 month')::date;

    select * into v_prev_row
    from public.karyawan_income_target_monthly
    where employee_id=v_employee_id and month_start=v_prev;

    if v_prev_row.id is null then exit; end if;

    if v_prev < v_current_month and v_prev_row.status<>'FINAL' then
      v_end := (v_prev + interval '1 month - 1 day')::date;
      v_calc := public.karyawan_target_income_calc(v_employee_id,v_prev,v_end);
      v_realization := coalesce((v_calc->>'amount')::numeric,0);
      v_complete := coalesce((v_calc->>'data_complete')::boolean,false);
      v_reason := nullif(v_calc->>'review_reason','');
      v_pct := case when v_prev_row.target_amount>0 then round(v_realization/v_prev_row.target_amount*100,2) else 0 end;

      v_calendar := public.karyawan_income_target_calendar_guard(v_prev);
      v_seasonal := coalesce((v_calendar->>'seasonal')::boolean,false);
      v_seasonal_reason := nullif(v_calendar->>'reason','');

      if not v_seasonal then
        select count(*),percentile_cont(0.5) within group(order by realization_amount)
          into v_hist_count,v_median
        from (
          select realization_amount
          from public.karyawan_income_target_monthly
          where employee_id=v_employee_id
            and month_start<v_prev
            and status='FINAL'
            and seasonal_flag=false
            and data_complete=true
            and realization_amount>0
          order by month_start desc
          limit 6
        ) h;

        if v_complete and v_hist_count>=3 and v_median>0 and v_realization>=v_median*1.25 then
          v_seasonal:=true;
          v_seasonal_reason:='AUTO_OUTLIER_25PCT_VS_NORMAL_MEDIAN';
        end if;
      end if;

      v_growth := case
        when not v_complete or v_seasonal or v_pct<100 then 0
        when v_pct<110 then 3
        when v_pct<120 then 4
        else 5
      end;

      update public.karyawan_income_target_monthly
      set realization_amount=v_realization,
          achievement_pct=v_pct,
          next_growth_pct=v_growth,
          seasonal_flag=v_seasonal,
          seasonal_reason=coalesce(v_seasonal_reason,v_reason),
          data_complete=v_complete,
          status='FINAL',
          finalized_at=now(),
          updated_at=now()
      where id=v_prev_row.id;

      select * into v_prev_row
      from public.karyawan_income_target_monthly
      where id=v_prev_row.id;
    end if;

    if v_prev_row.status='FINAL' then
      v_target := round(v_prev_row.target_amount*(1+v_prev_row.next_growth_pct/100.0));

      insert into public.karyawan_income_target_monthly(
        employee_id,month_start,target_amount,baseline_normal,source_type,source_month,status
      )
      values(
        v_employee_id,v_next,v_target,
        case when v_prev_row.seasonal_flag then v_prev_row.baseline_normal else greatest(v_prev_row.baseline_normal,v_prev_row.target_amount) end,
        'HAK_DIBAYAR_HARIAN_FINAL',v_prev,'OPEN'
      )
      on conflict(employee_id,month_start) do nothing;
    end if;

    v_next := (v_next + interval '1 month')::date;
  end loop;

  select * into v_row
  from public.karyawan_income_target_monthly
  where employee_id=v_employee_id and month_start=v_month;

  if v_row.id is null then
    return jsonb_build_object(
      'ok',false,
      'reason','NEW_EMPLOYEE_BASELINE_WAIT',
      'join_date',v_join_date,
      'minimum_active_days',20,
      'engine_version','V2'
    );
  end if;

  v_end := case when v_month=v_current_month then v_today else (v_month+interval '1 month - 1 day')::date end;
  v_calc := public.karyawan_target_income_calc(v_employee_id,v_month,v_end);
  v_realization := coalesce((v_calc->>'amount')::numeric,0);
  v_complete := coalesce((v_calc->>'data_complete')::boolean,false);
  v_reason := nullif(v_calc->>'review_reason','');
  v_pct := case when v_row.target_amount>0 then round(v_realization/v_row.target_amount*100,2) else 0 end;
  v_calendar := public.karyawan_income_target_calendar_guard(v_month);

  return jsonb_build_object(
    'ok',true,
    'engine_version','V2',
    'month_start',v_month,
    'target_amount',v_row.target_amount,
    'realization_amount',v_realization,
    'achievement_pct',v_pct,
    'remaining_amount',greatest(0,v_row.target_amount-v_realization),
    'reached',v_pct>=100,
    'source_type',v_row.source_type,
    'source_month',v_row.source_month,
    'seasonal_flag',coalesce((v_calendar->>'seasonal')::boolean,false) or v_row.seasonal_flag,
    'seasonal_reason',coalesce(nullif(v_calendar->>'reason',''),v_row.seasonal_reason),
    'seasonal_event',nullif(v_calendar->>'event_name',''),
    'data_complete',v_complete,
    'review_reason',v_reason,
    'status',v_row.status,
    'next_growth_pct',v_row.next_growth_pct
  );
end;
$function$;

revoke all on function public.karyawan_income_target_self_v2(text,date) from public;
grant execute on function public.karyawan_income_target_self_v2(text,date) to anon,authenticated,service_role;

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

  v_payload := public.karyawan_income_target_self_v2(p_token,p_month);
  if coalesce((v_payload->>'ok')::boolean,false) is not true then
    return v_payload;
  end if;

  select max(month_start) into v_last_success
  from public.karyawan_income_target_monthly
  where employee_id=v_employee_id
    and status='FINAL'
    and data_complete=true
    and seasonal_flag=false
    and achievement_pct>=100;

  select count(*)::integer into v_miss_streak
  from public.karyawan_income_target_monthly
  where employee_id=v_employee_id
    and status='FINAL'
    and data_complete=true
    and seasonal_flag=false
    and achievement_pct<100
    and (v_last_success is null or month_start>v_last_success);

  return v_payload || jsonb_build_object(
    'miss_streak',v_miss_streak,
    'evaluation_required',v_miss_streak>=3,
    'evaluation_message',case
      when v_miss_streak>=3 then v_miss_streak||' bulan normal berturut-turut belum mencapai target. Evaluasi diperlukan.'
      when v_miss_streak=2 then '2 bulan normal berturut-turut belum mencapai target.'
      when v_miss_streak=1 then 'Bulan normal terakhir belum mencapai target.'
      else null
    end
  );
end;
$function$;

revoke all on function public.karyawan_income_target_status_self(text,date) from public;
grant execute on function public.karyawan_income_target_status_self(text,date) to anon,authenticated,service_role;
