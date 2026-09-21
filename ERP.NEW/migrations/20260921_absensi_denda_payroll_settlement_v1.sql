-- Additive payroll fine settlement: payout and fine posting are one database transaction.
-- Does not change LOCK payroll calculation / payout RPC.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.absensi_denda_review_v1') IS NULL
 OR to_regprocedure('public.erp_payroll_cashier_payout_v1(bigint,date,bigint)') IS NULL
 THEN RAISE EXCEPTION 'Fine review or cashier payout not installed'; END IF;
END $$;
-- One monthly payout may settle several separate days of cashier fines.
ALTER TABLE public.absensi_denda_pembayaran_v1 DROP CONSTRAINT IF EXISTS absensi_denda_pembayaran_v1_payout_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS absensi_denda_pembayaran_payout_item_unique_v1
ON public.absensi_denda_pembayaran_v1(absensi_id,payout_id) WHERE payout_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.absensi_denda_post_cashier_payroll_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_emp bigint; v_start date; v_end date; v_kind text;
 v_review public.absensi_denda_review_v1%ROWTYPE; v_due bigint; v_tx uuid;
BEGIN
 IF NEW.source_type IS DISTINCT FROM 'PAYROLL_CASHIER_PAYOUT_V1' THEN RETURN NEW; END IF;
 -- Require exactly the canonical Owner payroll payout event, not a manual transaction.
 IF auth.uid() IS NULL OR NOT public.is_erp_owner() OR NEW.entry_type<>'AUTO'
 OR NEW.from_wallet<>'KAS_BESAR' OR NEW.to_wallet<>'EXTERNAL'
 OR NEW.verification_status<>'OWNER_VERIFIED' OR NEW.verified_by IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'DENDA_PAYROLL: payout tidak terverifikasi oleh Owner'; END IF;
 IF coalesce(NEW.metadata->>'employee_id','') !~ '^[0-9]+$'
 OR coalesce(NEW.metadata->>'payroll_period','') !~ '^\d{4}-\d{2}-\d{2}$'
 THEN RAISE EXCEPTION 'DENDA_PAYROLL: metadata payout tidak valid'; END IF;
 v_emp:=(NEW.metadata->>'employee_id')::bigint;
 v_start:=(NEW.metadata->>'payroll_period')::date;
 v_end:=(v_start+interval '1 month - 1 day')::date;
 IF NEW.source_key IS DISTINCT FROM ('CASHIER:'||v_emp||':'||to_char(v_start,'YYYY-MM'))
 OR NEW.source_period_start IS DISTINCT FROM v_start OR NEW.source_period_end IS DISTINCT FROM v_end
 THEN RAISE EXCEPTION 'DENDA_PAYROLL: periode atau sumber gaji tidak cocok'; END IF;
 SELECT lower(btrim(coalesce(jabatan,''))) INTO v_kind FROM public.karyawan WHERE id=v_emp;
 IF v_kind<>'kasir' THEN RETURN NEW; END IF;
 FOR v_review IN
  SELECT r.* FROM public.absensi_denda_review_v1 r
  WHERE r.karyawan_id=v_emp AND r.tanggal BETWEEN v_start AND v_end
   AND r.status='DITETAPKAN' AND r.nominal_final>r.dibayar
  ORDER BY r.tanggal,r.absensi_id FOR UPDATE
 LOOP
  v_due:=v_review.nominal_final-v_review.dibayar;
  -- PIUTANG_DENDA settlement and retained salary allocation: do not manufacture cash.
  INSERT INTO public.arus_kas_v2_transactions(tanggal,amount,from_wallet,to_wallet,entry_type,category,description,
   source_type,source_key,source_period_start,source_period_end,verification_status,created_by,updated_by,verified_by,verified_at,metadata)
  VALUES(NEW.tanggal,v_due,'PIUTANG_DENDA','EXTERNAL','AUTO','DENDA_POTONG_GAJI',
   'Pelunasan piutang denda dari payroll kasir '||v_emp,'ABSENSI_DENDA_V1',
   'PAYROLL_RECEIVABLE:'||v_review.absensi_id,v_start,v_end,'OWNER_VERIFIED',auth.uid(),auth.uid(),auth.uid(),clock_timestamp(),
   jsonb_build_object('absensi_id',v_review.absensi_id,'employee_id',v_emp,'payout_id',NEW.id)) RETURNING id INTO v_tx;
  INSERT INTO public.arus_kas_v2_audit(transaction_id,action,actor_id,snapshot)
   SELECT id,'DENDA_PAYROLL_RECEIVABLE_SETTLEMENT',auth.uid(),to_jsonb(t) FROM public.arus_kas_v2_transactions t WHERE id=v_tx;
  INSERT INTO public.arus_kas_v2_transactions(tanggal,amount,from_wallet,to_wallet,entry_type,category,description,
   source_type,source_key,source_period_start,source_period_end,verification_status,created_by,updated_by,verified_by,verified_at,metadata)
  VALUES(NEW.tanggal,v_due,'KAS_BESAR','KAS_DENDA','AUTO','DENDA_ALOKASI_GAJI',
   'Alokasi potongan gaji kasir ke Kas Denda '||v_emp,'ABSENSI_DENDA_V1',
   'PAYROLL_ALLOCATION:'||v_review.absensi_id,v_start,v_end,'OWNER_VERIFIED',auth.uid(),auth.uid(),auth.uid(),clock_timestamp(),
   jsonb_build_object('absensi_id',v_review.absensi_id,'employee_id',v_emp,'payout_id',NEW.id)) RETURNING id INTO v_tx;
  INSERT INTO public.arus_kas_v2_audit(transaction_id,action,actor_id,snapshot)
   SELECT id,'DENDA_PAYROLL_CASH_ALLOCATION',auth.uid(),to_jsonb(t) FROM public.arus_kas_v2_transactions t WHERE id=v_tx;
  INSERT INTO public.absensi_denda_pembayaran_v1(absensi_id,nominal,metode,bukti,actor_id,payout_id)
   VALUES(v_review.absensi_id,v_due,'POTONGAN_GAJI','Payout kasir '||NEW.id,auth.uid(),NEW.id);
  UPDATE public.absensi_denda_review_v1 SET dibayar=dibayar+v_due,updated_at=clock_timestamp()
   WHERE absensi_id=v_review.absensi_id;
 END LOOP;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_absensi_denda_cashier_payroll_v1 ON public.arus_kas_v2_transactions;
CREATE TRIGGER trg_absensi_denda_cashier_payroll_v1 AFTER INSERT ON public.arus_kas_v2_transactions
FOR EACH ROW EXECUTE FUNCTION public.absensi_denda_post_cashier_payroll_v1();
REVOKE ALL ON FUNCTION public.absensi_denda_post_cashier_payroll_v1() FROM PUBLIC,anon,authenticated;
COMMIT;