-- Additive security gate: final SPV decisions now require mandatory photo and reason via absensi_denda_putus_nominal_v2.
-- Keep the legacy function for audit/backward reference, but deny client invocation.
REVOKE EXECUTE ON FUNCTION public.absensi_denda_putus_v1(bigint,boolean,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.absensi_denda_putus_v1(bigint,boolean,text) FROM PUBLIC;
