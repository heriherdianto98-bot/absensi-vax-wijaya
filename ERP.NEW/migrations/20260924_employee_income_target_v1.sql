-- VAX ERP Employee Income Target V1
-- Isolated from LOCKed Owner/Payroll/Attendance engines.
-- September 2026 seed = frozen August 2026 Pendapatan Bersih.
-- Following months = prior target + deterministic growth, with seasonality guard.

create table if not exists public.karyawan_income_target_monthly (
  id bigserial primary key,
  employee_id bigint not null references public.karyawan(id) on delete restrict,
  month_start date not null,
  target_amount numeric(18,2) not null check (target_amount >= 0),
  realization_amount numeric(18,2) not null default 0 check (realization_amount >= 0),
  baseline_normal numeric(18,2) not null default 0 check (baseline_normal >= 0),
  achievement_pct numeric(9,2) not null default 0,
  next_growth_pct numeric(6,2) not null default 0,
  source_type text not null,
  source_month date,
  seasonal_flag boolean not null default false,
  seasonal_reason text,
  data_complete boolean not null default true,
  status text not null default 'OPEN' check (status in ('OPEN','FINAL')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, month_start)
);

alter table public.karyawan_income_target_monthly enable row level security;
revoke all on table public.karyawan_income_target_monthly from anon, authenticated;

create or replace function public.karyawan_target_income_calc(
  p_employee_id bigint,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_provider numeric := 0;
  v_product numeric := 0;
  v_fine numeric := 0;
  v_bad_provider bigint := 0;
  v_bad_product bigint := 0;
  v_bad_fine bigint := 0;
  v_multiday_product bigint := 0;
  v_monthly_advance bigint := 0;
begin
  if p_employee_id is null or p_from is null or p_to is null or p_to < p_from then
    return jsonb_build_object('ok',false,'reason','INVALID_ARGUMENT');
  end if;

  select
    coalesce(sum(coalesce(s.provider_share,0)),0),
    count(*) filter(where s.mapping_status is distinct from 'MATCHED' or s.provider_share is null)
  into v_provider,v_bad_provider
  from public.provider_sales_daily_source s
  where s.employee_id=p_employee_id
    and s.activity_date between p_from and p_to;

  select
    coalesce(sum(coalesce(s.revenue_share,0)),0),
    count(*) filter(where s.mapping_status is distinct from 'MATCHED' or s.revenue_share is null)
  into v_product,v_bad_product
  from public.product_sales_source s
  where s.employee_id=p_employee_id
    and s.period_start=s.period_end
    and s.period_start between p_from and p_to;

  select count(*) into v_multiday_product
  from public.product_sales_source s
  where s.employee_id=p_employee_id
    and s.period_start<=p_to and s.period_end>=p_from
    and s.period_start<>s.period_end;

  with dates_with_raw_fine as (
    select a.tanggal, coalesce(sum(coalesce(a.denda,0)),0) raw_fine
    from public.absensi a
    where a.karyawan_id=p_employee_id
      and a.tanggal between p_from and p_to
    group by a.tanggal
  ),
  review_per_day as (
    select r.tanggal,
           count(*) cnt,
           max(r.nominal_final) nominal_final,
           max(r.dibayar) dibayar,
           max(r.status) status
    from public.absensi_denda_review_v1 r
    where r.karyawan_id=p_employee_id
      and r.tanggal between p_from and p_to
    group by r.tanggal
  ),
  decision as (
    select d.tanggal,d.raw_fine,
           coalesce(r.cnt,0) cnt,r.nominal_final,r.dibayar,r.status,
           case
             when coalesce(r.cnt,0)=1
              and r.status in ('DITETAPKAN','DIBEBASKAN')
              and r.nominal_final is not null
              and r.dibayar is not null
              and r.nominal_final>=0 and r.dibayar>=0 and r.dibayar<=r.nominal_final
             then r.nominal_final
             when coalesce(r.cnt,0)=0 and d.raw_fine=0 then 0
             else null
           end final_fine
    from dates_with_raw_fine d
    left join review_per_day r using(tanggal)
  )
  select coalesce(sum(coalesce(final_fine,0)),0),
         count(*) filter(where final_fine is null)
  into v_fine,v_bad_fine
  from decision;

  select count(*) into v_monthly_advance
  from public.employee_cash_advances a
  where a.employee_id=p_employee_id
    and a.disbursement_date<=p_to
    and coalesce(a.payment_method,'BULANAN')='BULANAN'
    and a.status in ('DICAIRKAN','AKTIF','LUNAS')
    and (coalesce(a.current_outstanding,0)>0 or a.disbursement_date>=p_from);

  return jsonb_build_object(
    'ok',true,
    'amount', greatest(0,v_provider+v_product-v_fine),
    'provider_share',v_provider,
    'product_share',v_product,
    'final_fine',v_fine,
    'data_complete',(v_bad_provider=0 and v_bad_product=0 and v_bad_fine=0 and v_multiday_product=0 and v_monthly_advance=0),
    'review_reason',case
      when v_bad_provider>0 then 'PROVIDER_UNVERIFIED'
      when v_bad_product>0 or v_multiday_product>0 then 'PRODUCT_UNVERIFIED'
      when v_bad_fine>0 then 'FINE_NOT_FINAL'
      when v_monthly_advance>0 then 'KASBON_MONTHLY_REVIEW'
      else null
    end
  );
end;
$function$;

revoke all on function public.karyawan_target_income_calc(bigint,date,date) from public;

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

  -- Seed September 2026 from LOCKED August ERP snapshot.
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

  -- Build missing months sequentially. A new target is frozen when first generated.
  v_loop := v_seed_month + interval '1 month';
  while v_loop<=v_month loop
    if not exists(select 1 from public.karyawan_income_target_monthly where employee_id=v_employee_id and month_start=v_loop) then
      v_prev := (v_loop - interval '1 month')::date;
      select * into v_prev_row
      from public.karyawan_income_target_monthly
      where employee_id=v_employee_id and month_start=v_prev;

      if v_prev_row.id is null then exit; end if;

      -- Previous month can only form a new target after it has ended.
      if v_prev < v_current_month and v_prev_row.status<>'FINAL' then
        v_end := (v_prev + interval '1 month - 1 day')::date;
        v_calc := public.karyawan_target_income_calc(v_employee_id,v_prev,v_end);
        v_realization := coalesce((v_calc->>'amount')::numeric,0);
        v_complete := coalesce((v_calc->>'data_complete')::boolean,false);
        v_reason := nullif(v_calc->>'review_reason','');
        v_pct := case when v_prev_row.target_amount>0 then round(v_realization/v_prev_row.target_amount*100,2) else 0 end;

        -- Automatic seasonal/outlier guard only after at least 3 prior normal FINAL months.
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

        v_seasonal := false;
        v_seasonal_reason := null;
        if v_complete and v_hist_count>=3 and v_median>0 and v_realization>=v_median*1.25 then
          v_seasonal := true;
          v_seasonal_reason := 'AUTO_OUTLIER_25PCT_VS_NORMAL_MEDIAN';
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

  -- Live progress: month-to-date, using the same verified daily entitlement ingredients.
  v_end := case when v_month=v_current_month then v_today else (v_month+interval '1 month - 1 day')::date end;
  v_calc := public.karyawan_target_income_calc(v_employee_id,v_month,v_end);
  v_realization := coalesce((v_calc->>'amount')::numeric,0);
  v_complete := coalesce((v_calc->>'data_complete')::boolean,false);
  v_reason := nullif(v_calc->>'review_reason','');
  v_pct := case when v_row.target_amount>0 then round(v_realization/v_row.target_amount*100,2) else 0 end;

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
    'seasonal_flag',v_row.seasonal_flag,
    'seasonal_reason',v_row.seasonal_reason,
    'data_complete',v_complete,
    'review_reason',v_reason,
    'status',v_row.status,
    'next_growth_pct',v_row.next_growth_pct
  );
end;
$function$;

revoke all on function public.karyawan_income_target_self(text,date) from public;
grant execute on function public.karyawan_income_target_self(text,date) to anon,authenticated,service_role;
