-- ERP VAX — Setoran 3 Harian canonical auto recalculation V1
-- OWNER PASS 2026-09-09
--
-- Tujuan:
-- 1) Snapshot Setoran 3 Harian otomatis mengikuti daily_recap_source dan BRI Merchant Daily.
-- 2) Setoran yang sudah DONE/diterima Owner tidak dimutasi otomatis.
-- 3) Tidak mengubah DailyDataEngine / SetoranMoneyEngine / engine JS yang sudah LOCK.
--
-- Rule canonical:
-- cash_reference = SUM(nett_revenue + product_cost - non_cash)
-- diff = 0 bila BRI <= 0; selain itu BRI - non_cash
-- cash_actual = cash_reference - diff - outside_cashout_cost

create or replace function public.erp_recalc_setoran_3_harian_row(p_setoran_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.setoran_3_harian%rowtype;
  v_cash_payment numeric := 0;
  v_non_cash numeric := 0;
  v_cash_out numeric := 0;
  v_cash_reference numeric := 0;
  v_bri numeric := 0;
  v_diff numeric := 0;
  v_actual numeric := 0;
  v_token text;
begin
  select * into v_row
  from public.setoran_3_harian
  where id = p_setoran_id;

  if not found then
    return;
  end if;

  -- Final: transaksi yang sudah benar-benar diterima Owner tidak boleh berubah otomatis.
  if exists (
    select 1
    from public.setoran_3_harian_receipts r
    where r.setoran_id = p_setoran_id
  ) then
    return;
  end if;

  select
    coalesce(sum(coalesce(d.cash_payment,0)),0),
    coalesce(sum(coalesce(d.non_cash,0)),0),
    coalesce(sum(coalesce(d.cash_out,0)),0),
    coalesce(sum(coalesce(d.nett_revenue,0) + coalesce(d.product_cost,0) - coalesce(d.non_cash,0)),0)
  into v_cash_payment, v_non_cash, v_cash_out, v_cash_reference
  from public.daily_recap_source d
  where d.cabang_id = v_row.cabang_id
    and d.tanggal between v_row.period_start and v_row.period_end;

  select coalesce(sum(coalesce(b.bri_non_cash_actual,0)),0)
  into v_bri
  from public.bri_merchant_daily b
  where b.cabang_id = v_row.cabang_id
    and b.tanggal between v_row.period_start and v_row.period_end;

  v_diff := case
    when v_bri <= 0 then 0
    else v_bri - v_non_cash
  end;

  v_actual := v_cash_reference
              - v_diff
              - coalesce(v_row.outside_cashout_cost,0);

  if v_row.minutes_cash is not distinct from v_cash_payment
     and v_row.minutes_non_cash is not distinct from v_non_cash
     and v_row.minutes_cash_out is not distinct from v_cash_out
     and v_row.bri_non_cash_actual is not distinct from v_bri
     and v_row.non_cash_difference is not distinct from v_diff
     and v_row.setoran_cash_actual is not distinct from v_actual
     and v_row.total_setoran is not distinct from v_actual then
    return;
  end if;

  -- Re-use bypass internal server yang sudah ada. Token tidak pernah diekspos ke client.
  select secret into v_token
  from public.erp_internal_job_secrets
  where job_name = 'setoran_proof_monthly_cleanup';

  if coalesce(v_token,'') = '' then
    raise exception 'Internal maintenance token tidak tersedia';
  end if;

  perform set_config('app.setoran_proof_cleanup_token', v_token, true);

  update public.setoran_3_harian
  set minutes_cash = v_cash_payment,
      minutes_non_cash = v_non_cash,
      minutes_cash_out = v_cash_out,
      bri_non_cash_actual = v_bri,
      non_cash_difference = v_diff,
      setoran_cash_actual = v_actual,
      total_setoran = v_actual,
      updated_at = now()
  where id = p_setoran_id;

  perform set_config('app.setoran_proof_cleanup_token', '', true);
exception
  when others then
    perform set_config('app.setoran_proof_cleanup_token', '', true);
    raise;
end;
$$;

create or replace function public.erp_trigger_recalc_setoran_from_bri_daily()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op in ('UPDATE','DELETE') then
    for r in
      select s.id
      from public.setoran_3_harian s
      where s.cabang_id = old.cabang_id
        and old.tanggal between s.period_start and s.period_end
    loop
      perform public.erp_recalc_setoran_3_harian_row(r.id);
    end loop;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    for r in
      select s.id
      from public.setoran_3_harian s
      where s.cabang_id = new.cabang_id
        and new.tanggal between s.period_start and s.period_end
    loop
      perform public.erp_recalc_setoran_3_harian_row(r.id);
    end loop;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.erp_trigger_recalc_setoran_from_daily_recap_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op in ('UPDATE','DELETE') then
    for r in
      select s.id
      from public.setoran_3_harian s
      where s.cabang_id = old.cabang_id
        and old.tanggal between s.period_start and s.period_end
    loop
      perform public.erp_recalc_setoran_3_harian_row(r.id);
    end loop;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    for r in
      select s.id
      from public.setoran_3_harian s
      where s.cabang_id = new.cabang_id
        and new.tanggal between s.period_start and s.period_end
    loop
      perform public.erp_recalc_setoran_3_harian_row(r.id);
    end loop;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_setoran_auto_recalc_from_bri_daily
on public.bri_merchant_daily;

create trigger trg_setoran_auto_recalc_from_bri_daily
after insert or update or delete on public.bri_merchant_daily
for each row execute function public.erp_trigger_recalc_setoran_from_bri_daily();

drop trigger if exists trg_setoran_auto_recalc_from_daily_recap_source
on public.daily_recap_source;

create trigger trg_setoran_auto_recalc_from_daily_recap_source
after insert or update or delete on public.daily_recap_source
for each row execute function public.erp_trigger_recalc_setoran_from_daily_recap_source();

-- Sinkronkan snapshot existing yang belum final saat migration dipasang.
do $$
declare
  r record;
begin
  for r in
    select s.id
    from public.setoran_3_harian s
    where not exists (
      select 1
      from public.setoran_3_harian_receipts rec
      where rec.setoran_id = s.id
    )
  loop
    perform public.erp_recalc_setoran_3_harian_row(r.id);
  end loop;
end;
$$;
