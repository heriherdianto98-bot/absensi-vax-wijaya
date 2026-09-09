-- ERP VAX — Arus Kas V2 AUTO sync from Setoran 3 Harian V1
-- OWNER PASS 2026-09-09
--
-- Tujuan:
-- 1) Ketika snapshot Setoran 3 Harian berubah, transaksi AUTO Arus Kas existing ikut diperbarui.
-- 2) Tidak membuat transaksi AUTO baru; creator/consumer canonical existing tetap menjadi sumber penciptaan row.
-- 3) Setoran yang sudah DONE/diterima Owner tidak dimutasi otomatis.
-- 4) Setiap perubahan AUTO existing dicatat ke arus_kas_v2_audit dengan action AUTO_SYNC_SETORAN.
-- 5) Tidak mengubah engine JS Arus Kas / DailyDataEngine / SetoranMoneyEngine yang sudah LOCK.

create or replace function public.erp_sync_arus_kas_v2_cash_from_setoran(p_setoran_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.setoran_3_harian%rowtype;
  t public.arus_kas_v2_transactions%rowtype;
  v_amount bigint;
  v_from text;
  v_to text;
  v_before jsonb;
  v_after jsonb;
begin
  select * into s
  from public.setoran_3_harian
  where id = p_setoran_id;

  if not found then
    return;
  end if;

  -- Setoran yang sudah benar-benar DONE/diterima Owner bersifat final.
  if exists (
    select 1 from public.setoran_3_harian_receipts r where r.setoran_id = s.id
  ) then
    return;
  end if;

  select * into t
  from public.arus_kas_v2_transactions
  where entry_type = 'AUTO'
    and source_type = 'SETORAN_3_HARIAN'
    and source_key = s.id::text || ':CASH'
  order by created_at desc
  limit 1;

  -- Bila AUTO Arus Kas belum pernah dibuat, consumer canonical existing tetap yang membuatnya.
  if not found then
    return;
  end if;

  v_amount := abs(round(coalesce(s.total_setoran, s.setoran_cash_actual, 0)))::bigint;

  if coalesce(s.total_setoran, s.setoran_cash_actual, 0) > 0 then
    v_from := 'EXTERNAL';
    v_to := 'KAS_BESAR';
  elsif coalesce(s.total_setoran, s.setoran_cash_actual, 0) < 0 then
    v_from := 'KAS_BESAR';
    v_to := 'EXTERNAL';
  else
    -- Nol tidak boleh melanggar CHECK amount > 0 dan tidak boleh memengaruhi saldo.
    -- Same-wallet membuat dampak saldo bersih nol sambil menjaga source_key/audit trail.
    v_amount := 1;
    v_from := 'KAS_BESAR';
    v_to := 'KAS_BESAR';
  end if;

  if t.amount = v_amount
     and t.from_wallet = v_from
     and t.to_wallet = v_to
     and t.source_period_start is not distinct from s.period_start
     and t.source_period_end is not distinct from s.period_end then
    return;
  end if;

  v_before := to_jsonb(t);

  update public.arus_kas_v2_transactions
  set amount = v_amount,
      from_wallet = v_from,
      to_wallet = v_to,
      source_period_start = s.period_start,
      source_period_end = s.period_end,
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'setoran_id', s.id,
        'bri_non_cash_actual', s.bri_non_cash_actual,
        'owner_verified', s.owner_verified,
        'auto_sync_from_setoran', true,
        'auto_sync_at', now()
      ),
      updated_at = now()
  where id = t.id
  returning * into t;

  v_after := to_jsonb(t);

  insert into public.arus_kas_v2_audit(transaction_id, action, actor_id, snapshot)
  values (
    t.id,
    'AUTO_SYNC_SETORAN',
    null,
    jsonb_build_object('before', v_before, 'after', v_after, 'setoran_id', s.id)
  );
end;
$$;

create or replace function public.erp_trigger_sync_arus_kas_v2_from_setoran()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.erp_sync_arus_kas_v2_cash_from_setoran(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sync_arus_kas_v2_from_setoran
on public.setoran_3_harian;

create trigger trg_sync_arus_kas_v2_from_setoran
after insert or update of setoran_cash_actual, total_setoran, period_start, period_end, owner_verified
on public.setoran_3_harian
for each row execute function public.erp_trigger_sync_arus_kas_v2_from_setoran();

-- Sinkronkan AUTO cash existing saat migration pertama kali dipasang.
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
    perform public.erp_sync_arus_kas_v2_cash_from_setoran(r.id);
  end loop;
end;
$$;
