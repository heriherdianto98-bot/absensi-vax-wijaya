-- Employee Income Target Seasonal Calendar Guard V1
-- Additive only. Does not modify locked Owner/Payroll/Absensi engines.

create table if not exists public.karyawan_income_target_seasonal_calendar (
  id bigserial primary key,
  event_code text not null,
  event_name text not null,
  start_date date not null,
  end_date date not null,
  source_type text not null default 'SYSTEM',
  notes text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique(event_code,start_date,end_date)
);

alter table public.karyawan_income_target_seasonal_calendar enable row level security;
revoke all on table public.karyawan_income_target_seasonal_calendar from anon,authenticated;

-- Broad pre-Eid windows. These are guard windows, not official holiday declarations.
-- One/two-day differences in official Eid determination remain safely inside the window.
insert into public.karyawan_income_target_seasonal_calendar
(event_code,event_name,start_date,end_date,source_type,notes)
values
('IDUL_FITRI','Ramadan / Idul Fitri','2027-02-20','2027-03-16','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2028-02-09','2028-03-05','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2029-01-29','2029-02-22','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2030-01-18','2030-02-11','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2031-01-07','2031-01-31','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2031-12-27','2032-01-20','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2032-12-15','2033-01-09','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2033-12-05','2033-12-29','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2034-11-24','2034-12-18','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.'),
('IDUL_FITRI','Ramadan / Idul Fitri','2035-11-13','2035-12-07','SYSTEM_ESTIMATE','Seasonality guard window; not an official holiday declaration.')
on conflict(event_code,start_date,end_date) do nothing;

create or replace function public.karyawan_income_target_calendar_guard(
  p_month date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  with bounds as (
    select date_trunc('month',p_month)::date month_start,
           (date_trunc('month',p_month)+interval '1 month - 1 day')::date month_end
  ),
  hit as (
    select c.event_code,c.event_name,c.start_date,c.end_date,c.source_type
    from public.karyawan_income_target_seasonal_calendar c,bounds b
    where c.enabled=true
      and c.start_date<=b.month_end
      and c.end_date>=b.month_start
    order by c.start_date
    limit 1
  )
  select case when exists(select 1 from hit)
    then jsonb_build_object(
      'seasonal',true,
      'reason','CALENDAR_'||(select event_code from hit),
      'event_name',(select event_name from hit),
      'start_date',(select start_date from hit),
      'end_date',(select end_date from hit),
      'source_type',(select source_type from hit)
    )
    else jsonb_build_object('seasonal',false)
  end;
$function$;

revoke all on function public.karyawan_income_target_calendar_guard(date) from public;

create or replace function public.karyawan_income_target_self(
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
  v_month date := date_trunc('month',coalesce(p_month,(now() at time zone 'Asia/Jakarta')::date))::date;
  v_current_month date := date_trunc('month',(now() at time zone 'Asia/Jakarta')::date)::date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_seed_month constant date := date '2026-09-01';
  v_seed_snapshot uuid;
  v_seed numeric := 0;
  v_loop date;
  v_prev date;
  v_prev_row public.karyawan_income_target_monthly%rowtype;
  v_row public.karyawan_income_target_monthly%rowtype;
  v_calc jsonb;
  v_calendar jsonb;
  v_realization numeric := 0;
  v_complete boolean := true;
  v_reason text;
  v_pct numeric := 0;
  v_growth numeric := 0;
  v_seasonal boolean := false;
  v_seasonal_reason text;
  v_hist_count int := 0;
  v_median numeric := null;
  v_target numeric := 0;
  v_end date;
begin
  v_employee_id := public.karyawan_session_id_from_token(p_token);
  if v_employee_id is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  select lower(trim(coalesce(k.jabatan,''))) into v_jabatan
  from public.karyawan k
  where k.id=v_employee_id and k.aktif is true
  limit 1;

  if v_jabatan is null then return jsonb_build_object('ok',false,'reason','KARYAWAN_INACTIVE'); end if;
  if v_jabatan<>'capster' then return jsonb_build_object('ok',false,'reason','CAPSTER_ONLY'); end if;
  if v_month<v_seed_month or v_month>v_current_month then
    return jsonb_build_object('ok',false,'reason','MONTH_UNAVAILABLE');
  end if;

  if not exists(select 1 from public.karyawan_income_target_monthly where employee_id=v_employee_id and month_start=v_seed_month) then
    select s.id into v_seed_snapshot
    from public.erp_period_snapshots s
    where s.period_start=date '2026-08-01'
      and s.period_end=date '2026-08-31'
      and s.status='LOCKED'
    order by s.captured_at desc
    limit 1;

    if v_seed_snapshot is not null then
      with prov as (
        select coalesce(sum(coalesce((r.row_data->>'provider_share')::numeric,0)),0) amount
        from public.erp_period_snapshot_rows r
        where r.snapshot_id=v_seed_snapshot
          and r.source_table='provider_sales_daily_source'
          and nullif(r.row_data->>'employee_id','')::bigint=v_employee_id
      ), fine as (
        select coalesce(sum(coalesce((r.row_data->>'denda')::numeric,0)),0) amount
        from public.erp_period_snapshot_rows r
        where r.snapshot_id=v_seed_snapshot
          and r.source_table='absensi'
          and nullif(r.row_data->>'karyawan_id','')::bigint=v_employee_id
      )
      select greatest(0,coalesce(prov.amount,0)-coalesce(fine.amount,0))
      into v_seed
      from prov cross join fine;
    end if;

    if coalesce(v_seed,0)>0 then
      insert into public.karyawan_income_target_monthly(
        employee_id,month_start,target_amount,baseline_normal,source_type,source_month,status
      ) values(
        v_employee_id,v_seed_month,v_seed,v_seed,'LEGACY_NET_INCOME_SEED',date '2026-08-01','OPEN'
      ) on conflict(employee_id,month_start) do nothing;
    end if;
  end if;

  v_loop := (v_seed_month + interval '1 month')::date;
  while v_loop<=v_month loop
    if not exists(select 1 from public.karyawan_income_target_monthly where employee_id=v_employee_id and month_start=v_loop) then
      v_prev := (v_loop - interval '1 month')::date;
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
          select count(*), percentile_cont(0.5) within group(order by realization_amount)
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
            v_seasonal := true;
            v_seasonal_reason := 'AUTO_OUTLIER_25PCT_VS_NORMAL_MEDIAN';
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
        v_target := round(v_prev_row.target_amount * (1 + v_prev_row.next_growth_pct/100.0));
        insert into public.karyawan_income_target_monthly(
          employee_id,month_start,target_amount,baseline_normal,source_type,source_month,status
        ) values(
          v_employee_id,v_loop,v_target,
          case when v_prev_row.seasonal_flag then v_prev_row.baseline_normal else greatest(v_prev_row.baseline_normal,v_prev_row.target_amount) end,
          'HAK_DIBAYAR_HARIAN_FINAL',v_prev,'OPEN'
        ) on conflict(employee_id,month_start) do nothing;
      end if;
    end if;
    v_loop := (v_loop + interval '1 month')::date;
  end loop;

  select * into v_row
  from public.karyawan_income_target_monthly
  where employee_id=v_employee_id and month_start=v_month;

  if v_row.id is null then
    return jsonb_build_object('ok',false,'reason','BASELINE_UNAVAILABLE');
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

revoke all on function public.karyawan_income_target_self(text,date) from public;
grant execute on function public.karyawan_income_target_self(text,date) to anon,authenticated,service_role;
