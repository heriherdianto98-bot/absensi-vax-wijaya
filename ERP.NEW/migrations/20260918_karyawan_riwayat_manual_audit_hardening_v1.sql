-- Audit inserts require trigger definer privileges; forbid direct client audit forging.
alter function public.karyawan_riwayat_manual_guard() security definer;
revoke insert,update,delete on public.karyawan_riwayat_manual_audit from anon,authenticated;
revoke usage on sequence public.karyawan_riwayat_manual_audit_id_seq from anon,authenticated;
revoke execute on function public.karyawan_riwayat_manual_guard() from public,anon,authenticated;
