-- ERP VAX — Monthly Period Freeze fallback scheduler V1
-- Additive safety net only; primary VPS schedule remains tanggal 1 01:00 WIB.
-- This fallback runs hourly at minute 05 but executes freeze ONLY when WIB is
-- tanggal 1, jam 01. If VPS already froze at 01:00, erp_freeze_period returns
-- ALREADY_LOCKED and no duplicate snapshot is created.
-- Does not modify any ERP engine or source formula.

create or replace function public.erp_monthly_freeze_fallback()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_now_wib timestamp := timezone('Asia/Jakarta', now());
  v_period_start date;
  v_period_end date;
begin
  if extract(day from v_now_wib)::int <> 1
     or extract(hour from v_now_wib)::int <> 1 then
    return jsonb_build_object(
      'status','SKIP_OUTSIDE_WINDOW',
      'now_wib',to_char(v_now_wib,'YYYY-MM-DD HH24:MI:SS')
    );
  end if;

  v_period_end := (date_trunc('month', v_now_wib)::date - 1);
  v_period_start := date_trunc('month', v_period_end)::date;

  return public.erp_freeze_period(
    v_period_start,
    v_period_end,
    null,
    'ERP VAX AUTO FALLBACK — ' || to_char(v_period_start,'YYYY-MM')
  );
end;
$function$;

-- Idempotent scheduler install.
do $block$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='erp-monthly-period-freeze-fallback-wib'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'erp-monthly-period-freeze-fallback-wib',
    '5 * * * *',
    $cmd$select public.erp_monthly_freeze_fallback();$cmd$
  );
end;
$block$;

comment on function public.erp_monthly_freeze_fallback() is
'Fallback monthly freeze: effective only tanggal 1 jam 01 WIB; VPS 01:00 remains primary and this 01:05 path is safe/idempotent.';
