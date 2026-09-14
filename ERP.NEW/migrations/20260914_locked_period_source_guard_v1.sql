-- ERP VAX — Locked Period Source Guard V1
-- Additive safety only. Does NOT modify DailyDataEngine, DashboardEngine,
-- PayrollUnifiedEngine, LaporanBulananEngine, Minutes formulas, or snapshot rows.
--
-- Purpose:
-- Once a calendar month has a LOCKED erp_period_snapshot, the live historical
-- source rows used by Tabel Harian / Payroll may no longer drift if Minutes is
-- later revised or a historical backfill is run.

create or replace function public.erp_guard_locked_period_source()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_date_col text := nullif(tg_argv[0], '');
  v_old_date date;
  v_new_date date;
  v_locked boolean := false;
begin
  if v_date_col is null then
    raise exception 'ERP_LOCK_GUARD_DATE_COLUMN_REQUIRED';
  end if;

  if tg_op in ('UPDATE','DELETE') then
    begin
      v_old_date := nullif(to_jsonb(old)->>v_date_col, '')::date;
    exception when others then
      raise exception 'ERP_LOCK_GUARD_INVALID_OLD_DATE %.%', tg_table_name, v_date_col;
    end;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    begin
      v_new_date := nullif(to_jsonb(new)->>v_date_col, '')::date;
    exception when others then
      raise exception 'ERP_LOCK_GUARD_INVALID_NEW_DATE %.%', tg_table_name, v_date_col;
    end;
  end if;

  select exists(
    select 1
    from public.erp_period_snapshots s
    where s.status = 'LOCKED'
      and (
        (v_old_date is not null and v_old_date between s.period_start and s.period_end)
        or
        (v_new_date is not null and v_new_date between s.period_start and s.period_end)
      )
  ) into v_locked;

  if v_locked then
    raise exception 'ERP historical period is LOCKED; %.% cannot be changed for date %',
      tg_table_name, v_date_col, coalesce(v_new_date, v_old_date)
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

-- Core daily source used directly by DashboardEngine / Tabel Harian.
drop trigger if exists trg_guard_locked_daily_recap_source on public.daily_recap_source;
create trigger trg_guard_locked_daily_recap_source
before insert or update or delete on public.daily_recap_source
for each row execute function public.erp_guard_locked_period_source('tanggal');

-- Sources used by historical payroll/share/product presenters.
drop trigger if exists trg_guard_locked_provider_sales_daily_source on public.provider_sales_daily_source;
create trigger trg_guard_locked_provider_sales_daily_source
before insert or update or delete on public.provider_sales_daily_source
for each row execute function public.erp_guard_locked_period_source('activity_date');

drop trigger if exists trg_guard_locked_product_sales_source on public.product_sales_source;
create trigger trg_guard_locked_product_sales_source
before insert or update or delete on public.product_sales_source
for each row execute function public.erp_guard_locked_period_source('period_start');

drop trigger if exists trg_guard_locked_product_sales_daily_source on public.product_sales_daily_source;
create trigger trg_guard_locked_product_sales_daily_source
before insert or update or delete on public.product_sales_daily_source
for each row execute function public.erp_guard_locked_period_source('activity_date');

comment on function public.erp_guard_locked_period_source() is
'ERP VAX additive historical guard: blocks mutation of selected live source rows whose date falls inside a LOCKED ERP period snapshot.';
