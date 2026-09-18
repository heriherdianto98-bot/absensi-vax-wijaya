-- Additive scope: only the NEW cashier payout RPC's Arus Kas description/metadata.
-- The existing BARBER category already maps to Pengeluaran Barber.
-- Do not touch locked Payroll calculation, Arus Kas ledger or historical transactions.
DO $migration$
DECLARE
  v_definition text;
  v_before text := $before$'Pembayaran gaji kasir '||v_employee.nama_karyawan||' periode '||to_char(v_period,'YYYY-MM')$before$;
  v_after text := $after$'Pembayaran gaji kasir '||v_employee.nama_karyawan||' - '||coalesce((select c.nama_cabang from public.cabang c where c.id=v_employee.cabang_id),'Cabang tidak ditemukan')||' (Cabang ID '||v_employee.cabang_id::text||') periode '||to_char(v_period,'YYYY-MM')$after$;
  v_meta_before text := $meta$'employee_name',v_employee.nama_karyawan,'payroll_period'$meta$;
  v_meta_after text := $meta$'employee_name',v_employee.nama_karyawan,'branch_id',v_employee.cabang_id,'payroll_period'$meta$;
BEGIN
  SELECT pg_get_functiondef('public.erp_payroll_cashier_payout_v1(bigint,date,bigint)'::regprocedure) INTO v_definition;
  IF v_definition IS NULL OR position(v_before in v_definition)=0 OR position(v_meta_before in v_definition)=0 THEN
    RAISE EXCEPTION 'Cashier payout RPC no longer matches audited version. No changes applied.';
  END IF;
  v_definition := replace(v_definition,v_before,v_after);
  v_definition := replace(v_definition,v_meta_before,v_meta_after);
  EXECUTE v_definition;
END;
$migration$;
