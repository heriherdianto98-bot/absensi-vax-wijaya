-- VAX ERP — Setoran 3 Harian: biaya di luar Cashout
-- Additive only; canonical money formulas remain unchanged.
alter table public.setoran_3_harian
  add column if not exists outside_cashout_cost numeric null,
  add column if not exists outside_cashout_note text null;
