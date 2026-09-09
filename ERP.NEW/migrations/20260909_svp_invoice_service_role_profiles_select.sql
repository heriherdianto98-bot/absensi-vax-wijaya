-- ERP VAX — SVP Invoice Online Email
-- OWNER PASS / LOCK 2026-09-09
-- Purpose: allow the server-side invoice service (service_role) to verify
-- the authenticated Owner profile before sending an invoice email.
-- No data mutation, no RLS redesign, no engine/formula changes.

GRANT SELECT ON TABLE public.profiles TO service_role;
