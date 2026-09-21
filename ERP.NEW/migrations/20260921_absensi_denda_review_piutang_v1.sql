-- VAX ERP | ADDITIVE denda review & piutang: no historical backfill.
-- New fines only: provisional fine never deducted from payroll before review.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.absensi') IS NULL OR to_regclass('public.arus_kas_v2_transactions') IS NULL
 OR to_regprocedure('public.is_erp_spv()') IS NULL OR to_regprocedure('public.is_erp_owner()') IS NULL
 THEN RAISE EXCEPTION 'Missing ERP dependencies'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.absensi_denda_review_v1 (
 absensi_id bigint PRIMARY KEY REFERENCES public.absensi(id) ON DELETE RESTRICT,
 karyawan_id bigint NOT NULL REFERENCES public.karyawan(id),
 tanggal date NOT NULL,
 nominal_awal bigint NOT NULL CHECK (nominal_awal > 0),
 nominal_final bigint CHECK (nominal_final >= 0 AND nominal_final <= nominal_awal),
 status text NOT NULL DEFAULT 'MENUNGGU_SPV' CHECK (status IN ('MENUNGGU_SPV','DITETAPKAN','DIBEBASKAN')),
 diputus_oleh uuid REFERENCES auth.users(id), diputus_pada timestamptz,
 catatan text, dibayar bigint NOT NULL DEFAULT 0 CHECK (dibayar >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='MENUNGGU_SPV' AND nominal_final IS NULL AND diputus_pada IS NULL)
    OR (status IN ('DITETAPKAN','DIBEBASKAN') AND nominal_final IS NOT NULL AND diputus_pada IS NOT NULL)),
 CHECK (dibayar <= COALESCE(nominal_final,0))
);
CREATE TABLE IF NOT EXISTS public.absensi_denda_pembayaran_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 absensi_id bigint NOT NULL REFERENCES public.absensi_denda_review_v1(absensi_id),
 nominal bigint NOT NULL CHECK (nominal > 0),
 metode text NOT NULL CHECK (metode IN ('TUNAI_SPV','POTONGAN_GAJI')),
 bukti text, actor_id uuid NOT NULL REFERENCES auth.users(id),
 diterima_pada timestamptz NOT NULL DEFAULT now(),
 payout_id uuid UNIQUE REFERENCES public.arus_kas_v2_transactions(id)
);
CREATE INDEX IF NOT EXISTS absensi_denda_review_tanggal_idx ON public.absensi_denda_review_v1(tanggal,status);
CREATE INDEX IF NOT EXISTS absensi_denda_pembayaran_absensi_idx ON public.absensi_denda_pembayaran_v1(absensi_id);
ALTER TABLE public.absensi_denda_review_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absensi_denda_pembayaran_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS denda_review_staff_read_v1 ON public.absensi_denda_review_v1;
CREATE POLICY denda_review_staff_read_v1 ON public.absensi_denda_review_v1 FOR SELECT TO authenticated USING (public.is_erp_spv() OR public.is_erp_owner());
DROP POLICY IF EXISTS denda_payment_staff_read_v1 ON public.absensi_denda_pembayaran_v1;
CREATE POLICY denda_payment_staff_read_v1 ON public.absensi_denda_pembayaran_v1 FOR SELECT TO authenticated USING (public.is_erp_spv() OR public.is_erp_owner());
REVOKE ALL ON public.absensi_denda_review_v1,public.absensi_denda_pembayaran_v1 FROM PUBLIC,anon;
GRANT SELECT ON public.absensi_denda_review_v1,public.absensi_denda_pembayaran_v1 TO authenticated;
-- On new late check-ins keep the computed amount in the review row; no unapproved payroll deductions.
CREATE OR REPLACE FUNCTION public.absensi_denda_capture_new_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_job text;
BEGIN
 IF NEW.denda IS NULL OR NEW.denda<=0 OR NEW.terlambat_menit IS NULL OR NEW.terlambat_menit<=0
 OR upper(coalesce(NEW.status,'')) IN ('LIBUR','IZIN','SAKIT') THEN RETURN NEW; END IF;
 SELECT lower(btrim(coalesce(k.jabatan,''))) INTO v_job FROM public.karyawan k WHERE k.id=NEW.karyawan_id;
 IF v_job NOT IN ('capster','kasir') OR EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.karyawan_id=NEW.karyawan_id AND lower(btrim(coalesce(p.role,''))) IN ('spv','svp')) THEN RETURN NEW; END IF;
 INSERT INTO public.absensi_denda_review_v1(absensi_id,karyawan_id,tanggal,nominal_awal)
 VALUES(NEW.id,NEW.karyawan_id,NEW.tanggal,NEW.denda) ON CONFLICT (absensi_id) DO NOTHING;
 UPDATE public.absensi SET denda=0,status_denda='Menunggu SPV' WHERE id=NEW.id;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_absensi_denda_capture_new_v1 ON public.absensi;
CREATE TRIGGER trg_absensi_denda_capture_new_v1 AFTER INSERT ON public.absensi
FOR EACH ROW EXECUTE FUNCTION public.absensi_denda_capture_new_v1();
-- All financial postings are server-only and share the source attendance ID.
CREATE OR REPLACE FUNCTION public.absensi_denda_putus_v1(p_absensi_id bigint,p_bebaskan boolean,p_catatan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_a public.absensi%ROWTYPE; v_k public.karyawan%ROWTYPE;
 v_r public.absensi_denda_review_v1%ROWTYPE; v_now timestamp; v_amount bigint; v_tx uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_erp_spv() THEN RAISE EXCEPTION 'Hanya SPV aktif yang dapat memutus denda'; END IF;
 v_now:=clock_timestamp() AT TIME ZONE 'Asia/Jakarta';
 SELECT * INTO v_a FROM public.absensi WHERE id=p_absensi_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Absensi tidak ditemukan'; END IF;
 IF v_a.tanggal <> v_now::date OR v_now::time >= time '18:00' THEN
 RAISE EXCEPTION 'Keputusan denda hanya sampai sebelum pukul 18.00 WIB pada hari absensi'; END IF;
 SELECT * INTO v_k FROM public.karyawan WHERE id=v_a.karyawan_id;
 IF lower(btrim(coalesce(v_k.jabatan,''))) NOT IN ('capster','kasir') OR EXISTS
 (SELECT 1 FROM public.profiles p WHERE p.karyawan_id=v_a.karyawan_id AND lower(btrim(coalesce(p.role,''))) IN ('spv','svp'))
 THEN RAISE EXCEPTION 'Denda SPV atau jabatan ini tidak boleh diputuskan'; END IF;
 IF coalesce(v_a.terlambat_menit,0)<=0 OR upper(coalesce(v_a.status,'')) IN ('LIBUR','IZIN','SAKIT')
 THEN RAISE EXCEPTION 'Tidak ada keterlambatan yang sah untuk dikenai denda'; END IF;
 IF length(btrim(coalesce(p_catatan,'')))<3 THEN RAISE EXCEPTION 'Catatan keputusan wajib minimal 3 karakter'; END IF;
 INSERT INTO public.absensi_denda_review_v1(absensi_id,karyawan_id,tanggal,nominal_awal)
 SELECT v_a.id,v_a.karyawan_id,v_a.tanggal,v_a.denda
 WHERE v_a.denda>0 ON CONFLICT(absensi_id) DO NOTHING;
 SELECT * INTO v_r FROM public.absensi_denda_review_v1 WHERE absensi_id=p_absensi_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Nominal awal denda tidak ditemukan'; END IF;
 IF v_r.status<>'MENUNGGU_SPV' THEN RAISE EXCEPTION 'Keputusan denda sudah final'; END IF;
 v_amount:=CASE WHEN p_bebaskan THEN 0 ELSE v_r.nominal_awal END;
 UPDATE public.absensi_denda_review_v1 SET nominal_final=v_amount,
 status=CASE WHEN v_amount=0 THEN 'DIBEBASKAN' ELSE 'DITETAPKAN' END,
 diputus_oleh=auth.uid(),diputus_pada=clock_timestamp(),catatan=btrim(p_catatan),updated_at=clock_timestamp()
 WHERE absensi_id=p_absensi_id;
 UPDATE public.absensi SET denda=CASE WHEN lower(btrim(v_k.jabatan))='kasir' THEN v_amount ELSE 0 END,
 status_denda=CASE WHEN v_amount=0 THEN 'Dibebaskan SPV' ELSE 'Final SPV' END
 WHERE id=p_absensi_id;
 IF v_amount>0 THEN
 INSERT INTO public.arus_kas_v2_transactions(tanggal,amount,from_wallet,to_wallet,entry_type,category,description,
 source_type,source_key,source_period_start,source_period_end,verification_status,created_by,updated_by,metadata)
 VALUES(v_a.tanggal,v_amount,'EXTERNAL','PIUTANG_DENDA','AUTO','DENDA_DITETAPKAN',
 'Piutang denda '||v_k.nama_karyawan||' · '||v_a.tanggal::text,'ABSENSI_DENDA_V1',
 'ACCRUAL:'||v_a.id,v_a.tanggal,v_a.tanggal,'BELUM_DIVERIFIKASI',auth.uid(),auth.uid(),
 jsonb_build_object('absensi_id',v_a.id,'employee_id',v_a.karyawan_id,'jenis',v_k.jabatan)) RETURNING id INTO v_tx;
 INSERT INTO public.arus_kas_v2_audit(transaction_id,action,actor_id,snapshot)
 SELECT id,'DENDA_REVIEW_FINAL',auth.uid(),to_jsonb(t) FROM public.arus_kas_v2_transactions t WHERE id=v_tx;
 END IF;
 RETURN jsonb_build_object('absensi_id',v_a.id,'nominal_final',v_amount,'status',CASE WHEN v_amount=0 THEN 'DIBEBASKAN' ELSE 'DITETAPKAN' END,'ledger_id',v_tx);
END; $$;
CREATE OR REPLACE FUNCTION public.absensi_denda_terima_capster_v1(p_absensi_id bigint,p_nominal bigint,p_bukti text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_r public.absensi_denda_review_v1%ROWTYPE; v_k public.karyawan%ROWTYPE;
 v_p public.absensi_denda_pembayaran_v1%ROWTYPE; v_tx uuid; v_left bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_erp_spv() OR public.is_erp_owner()) THEN RAISE EXCEPTION 'Hanya SPV/Owner aktif boleh mencatat penerimaan'; END IF;
 IF p_request_id IS NULL OR p_nominal IS NULL OR p_nominal<=0 OR length(btrim(coalesce(p_bukti,'')))<3 THEN
 RAISE EXCEPTION 'Nominal, bukti/catatan, dan ID permintaan wajib'; END IF;
 SELECT * INTO v_p FROM public.absensi_denda_pembayaran_v1 WHERE id=p_request_id;
 IF FOUND THEN
 IF v_p.absensi_id<>p_absensi_id OR v_p.nominal<>p_nominal OR v_p.metode<>'TUNAI_SPV' THEN RAISE EXCEPTION 'ID permintaan sudah dipakai untuk transaksi lain'; END IF;
 RETURN jsonb_build_object('status','SUDAH_TERCATAT','payment_id',v_p.id,'nominal',v_p.nominal);
 END IF;
 SELECT * INTO v_r FROM public.absensi_denda_review_v1 WHERE absensi_id=p_absensi_id FOR UPDATE;
 IF NOT FOUND OR v_r.status<>'DITETAPKAN' OR v_r.nominal_final<=0 THEN RAISE EXCEPTION 'Denda belum ditetapkan secara final'; END IF;
 SELECT * INTO v_k FROM public.karyawan WHERE id=v_r.karyawan_id;
 IF lower(btrim(coalesce(v_k.jabatan,'')))<>'capster' THEN RAISE EXCEPTION 'Potongan kasir diproses melalui payroll, bukan penerimaan harian'; END IF;
 v_left:=v_r.nominal_final-v_r.dibayar;
 IF p_nominal>v_left THEN RAISE EXCEPTION 'Nominal melebihi piutang denda tersisa'; END IF;
 INSERT INTO public.absensi_denda_pembayaran_v1(id,absensi_id,nominal,metode,bukti,actor_id)
 VALUES(p_request_id,p_absensi_id,p_nominal,'TUNAI_SPV',btrim(p_bukti),auth.uid()) RETURNING * INTO v_p;
 UPDATE public.absensi_denda_review_v1 SET dibayar=dibayar+p_nominal,updated_at=clock_timestamp() WHERE absensi_id=p_absensi_id;
 INSERT INTO public.arus_kas_v2_transactions(tanggal,amount,from_wallet,to_wallet,entry_type,category,description,
 source_type,source_key,source_period_start,source_period_end,verification_status,created_by,updated_by,proof_path,metadata)
 VALUES((clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date,p_nominal,'PIUTANG_DENDA','KAS_DENDA','AUTO','DENDA_DITERIMA',
 'Penerimaan denda capster '||v_k.nama_karyawan||' · Kas Denda','ABSENSI_DENDA_V1',
 'PAYMENT:'||v_p.id,v_r.tanggal,v_r.tanggal,'BELUM_DIVERIFIKASI',auth.uid(),auth.uid(),btrim(p_bukti),
 jsonb_build_object('absensi_id',v_r.absensi_id,'payment_id',v_p.id,'employee_id',v_k.id)) RETURNING id INTO v_tx;
 INSERT INTO public.arus_kas_v2_audit(transaction_id,action,actor_id,snapshot)
 SELECT id,'DENDA_CASH_RECEIPT',auth.uid(),to_jsonb(t) FROM public.arus_kas_v2_transactions t WHERE id=v_tx;
 RETURN jsonb_build_object('status','TERCATAT','payment_id',v_p.id,'ledger_id',v_tx,'nominal',p_nominal,'sisa',v_left-p_nominal);
END; $$;
REVOKE ALL ON FUNCTION public.absensi_denda_putus_v1(bigint,boolean,text), public.absensi_denda_terima_capster_v1(bigint,bigint,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.absensi_denda_putus_v1(bigint,boolean,text), public.absensi_denda_terima_capster_v1(bigint,bigint,text,uuid) TO authenticated;
COMMIT;
