-- Owner Capster Target Monitor V1
-- Read-only monitor. Does not mutate target snapshots or locked engines.

create or replace function public.owner_capster_target_monitor(
  p_month date default null,
  p_cabang_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_month date := date_trunc('month',coalesce(p_month,(now() at time zone 'Asia/Jakarta')::date))::date;
  v_current_month date := date_trunc('month',(now() at time zone 'Asia/Jakarta')::date)::date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_end date;
  v_seed_snapshot uuid;
  v_items jsonb := '[]'::jsonb;
  v_branches jsonb := '[]'::jsonb;
begin
  if not public.is_erp_owner() then
    return jsonb_build_object('ok',false,'reason','OWNER_ONLY');
  end if;

  if v_month > v_current_month then
    return jsonb_build_object('ok',false,'reason','FUTURE_MONTH_NOT_ALLOWED');
  end if;

  v_end := case
    when v_month=v_current_month then v_today
    else (v_month+interval '1 month - 1 day')::date
  end;

  select s.id into v_seed_snapshot
  from public.erp_period_snapshots s
  where s.period_start=date '2026-08-01'
    and s.period_end=date '2026-08-31'
    and s.status='LOCKED'
  order by s.captured_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'name',c.nama_cabang
  ) order by c.nama_cabang),'[]'::jsonb)
  into v_branches
  from public.cabang c
  where c.aktif is true;

  with capsters as (
    select k.id employee_id,k.nama_karyawan,k.cabang_id,c.nama_cabang,
           ki.tanggal_bergabung
    from public.karyawan k
    join public.cabang c on c.id=k.cabang_id
    left join public.karyawan_identitas ki on ki.karyawan_id=k.id
    where k.aktif is true
      and lower(trim(coalesce(k.jabatan,'')))='capster'
      and (p_cabang_id is null or k.cabang_id=p_cabang_id)
  ),
  legacy_seed as (
    select x.employee_id,greatest(0,x.share-coalesce(y.denda,0)) amount
    from (
      select (r.row_data->>'employee_id')::bigint employee_id,
             coalesce(sum(coalesce((r.row_data->>'provider_share')::numeric,0)),0) share
      from public.erp_period_snapshot_rows r
      where r.snapshot_id=v_seed_snapshot
        and r.source_table='provider_sales_daily_source'
        and nullif(r.row_data->>'employee_id','') is not null
      group by 1
    ) x
    left join (
      select (r.row_data->>'karyawan_id')::bigint employee_id,
             coalesce(sum(coalesce((r.row_data->>'denda')::numeric,0)),0) denda
      from public.erp_period_snapshot_rows r
      where r.snapshot_id=v_seed_snapshot
        and r.source_table='absensi'
        and nullif(r.row_data->>'karyawan_id','') is not null
      group by 1
    ) y on y.employee_id=x.employee_id
  ),
  base as (
    select cp.*,
           t.target_amount stored_target,
           t.source_type stored_source,
           t.source_month,
           t.status target_status,
           t.seasonal_flag stored_seasonal,
           t.seasonal_reason stored_seasonal_reason,
           t.data_complete stored_data_complete,
           case
             when t.target_amount is not null then t.target_amount
             when v_month=date '2026-09-01' and coalesce(ls.amount,0)>0 then ls.amount
             else null
           end target_amount,
           case
             when t.target_amount is not null then t.source_type
             when v_month=date '2026-09-01' and coalesce(ls.amount,0)>0 then 'LEGACY_NET_INCOME_SEED_PREVIEW'
             else null
           end source_type
    from capsters cp
    left join public.karyawan_income_target_monthly t
      on t.employee_id=cp.employee_id and t.month_start=v_month
    left join legacy_seed ls on ls.employee_id=cp.employee_id
  ),
  calc as (
    select b.*,
           public.karyawan_target_income_calc(b.employee_id,v_month,v_end) income_calc,
           public.karyawan_income_target_calendar_guard(v_month) calendar_guard,
           (
             select count(*)::integer
             from public.karyawan_income_target_monthly h
             where h.employee_id=b.employee_id
               and h.status='FINAL'
               and h.data_complete=true
               and h.seasonal_flag=false
               and h.achievement_pct<100
               and h.month_start > coalesce((
                 select max(s.month_start)
                 from public.karyawan_income_target_monthly s
                 where s.employee_id=b.employee_id
                   and s.status='FINAL'
                   and s.data_complete=true
                   and s.seasonal_flag=false
                   and s.achievement_pct>=100
               ),date '1900-01-01')
           ) miss_streak
    from base b
  ),
  shaped as (
    select *,
      coalesce((income_calc->>'amount')::numeric,0) realization_amount,
      coalesce((income_calc->>'data_complete')::boolean,false) live_data_complete,
      nullif(income_calc->>'review_reason','') review_reason,
      coalesce((calendar_guard->>'seasonal')::boolean,false) calendar_seasonal,
      nullif(calendar_guard->>'event_name','') seasonal_event
    from calc
  ),
  final as (
    select *,
      case when target_amount is not null and target_amount>0
        then round(realization_amount/target_amount*100,2)
        else null end achievement_pct,
      case when target_amount is not null
        then greatest(0,target_amount-realization_amount)
        else null end remaining_amount
    from shaped
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'employee_id',employee_id,
    'name',nama_karyawan,
    'cabang_id',cabang_id,
    'cabang_name',nama_cabang,
    'join_date',tanggal_bergabung,
    'target_amount',target_amount,
    'realization_amount',realization_amount,
    'achievement_pct',achievement_pct,
    'remaining_amount',remaining_amount,
    'source_type',source_type,
    'source_month',source_month,
    'data_complete',live_data_complete,
    'review_reason',review_reason,
    'seasonal_flag',calendar_seasonal or coalesce(stored_seasonal,false),
    'seasonal_event',seasonal_event,
    'miss_streak',miss_streak,
    'evaluation_required',miss_streak>=3,
    'status',case
      when target_amount is null then 'MENUNGGU_BASELINE'
      when not live_data_complete then 'DATA_REVIEW'
      when miss_streak>=3 then 'EVALUASI'
      when achievement_pct>=100 then 'FINISH'
      else 'BERJALAN'
    end
  ) order by
    case when target_amount is null then 1 else 0 end,
    achievement_pct desc nulls last,
    nama_karyawan),'[]'::jsonb)
  into v_items
  from final;

  return jsonb_build_object(
    'ok',true,
    'month_start',v_month,
    'as_of',v_end,
    'cabang_id',p_cabang_id,
    'branches',v_branches,
    'items',v_items
  );
end;
$function$;

revoke all on function public.owner_capster_target_monitor(date,bigint) from public;
grant execute on function public.owner_capster_target_monitor(date,bigint) to authenticated,service_role;
