-- VAX ERP — Arus Kas V2 authenticated grants
-- Additive permission fix only. Keeps existing RLS owner/SVP policies intact.

grant select, insert, update on table public.arus_kas_v2_transactions to authenticated;
grant select, insert on table public.arus_kas_v2_audit to authenticated;
grant usage, select on sequence public.arus_kas_v2_audit_id_seq to authenticated;
