-- Already applied to Supabase on 2026-09-21. Do not rerun against live DB or local browser.
-- Separate IZIN TELAT MASUK from full-day IZIN, LIBUR, SAKIT. No existing attendance/finance engine changes.
CREATE TABLE IF NOT EXISTS public.absensi_izin_telat_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 karyawan_id bigint NOT NULL REFERENCES public.karyawan(id),
 tanggal date NOT NULL,
 alasan text NOT NULL CHECK (char_length(btrim(alasan)) BETWEEN 5 AND 1000),
 bukti_path text NOT NULL CHECK (char_length(btrim(bukti_path)) BETWEEN 5 AND 400),
 created_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(karyawan_id,tanggal)
);
ALTER TABLE public.absensi_izin_telat_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS absensi_izin_telat_read_v1 ON public.absensi_izin_telat_v1;
CREATE POLICY absensi_izin_telat_read_v1 ON public.absensi_izin_telat_v1 FOR SELECT TO authenticated USING (
 public.is_erp_spv() OR public.is_erp_owner() OR (created_by=auth.uid() AND EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.aktif IS TRUE AND p.karyawan_id=absensi_izin_telat_v1.karyawan_id
 ))
);
REVOKE ALL ON public.absensi_izin_telat_v1 FROM anon,PUBLIC;
GRANT SELECT ON public.absensi_izin_telat_v1 TO authenticated;
-- Employee portal uses server-issued karyawan_session_token, not a Supabase auth.uid().
CREATE OR REPLACE FUNCTION public.absensi_izin_telat_submit_v2(p_session_token text,p_alasan text,p_bukti_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_kid bigint; v_job text; v_today date:=(clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date; v_path text:=btrim(coalesce(p_bukti_path,'')); v_result public.absensi_izin_telat_v1%ROWTYPE;
BEGIN
 v_kid:=public.karyawan_session_id_from_token(p_session_token);
 IF v_kid IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED: Silakan login ulang sebagai karyawan'; END IF;
 SELECT lower(btrim(coalesce(jabatan,''))) INTO v_job FROM public.karyawan WHERE id=v_kid AND aktif IS TRUE;
 IF v_job NOT IN ('capster','kasir') OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.karyawan_id=v_kid AND lower(btrim(coalesce(p.role,''))) IN ('owner','spv','svp')) THEN RAISE EXCEPTION 'Izin telat hanya tersedia bagi capster/kasir aktif'; END IF;
 IF char_length(btrim(coalesce(p_alasan,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Alasan wajib 5–1000 karakter'; END IF;
 IF char_length(v_path)>400 OR v_path NOT LIKE (v_kid::text||'/telat/'||v_today::text||'/%') OR v_path !~ '\.(jpg|jpeg|png|webp)$' THEN RAISE EXCEPTION 'Foto wajib diunggah dari halaman karyawan pada tanggal hari ini'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='izin-proofs' AND o.name=v_path) THEN RAISE EXCEPTION 'Foto bukti tidak ditemukan'; END IF;
 IF EXISTS(SELECT 1 FROM public.absensi a JOIN public.absensi_denda_review_v1 r ON r.absensi_id=a.id WHERE a.karyawan_id=v_kid AND a.tanggal=v_today AND r.status<>'MENUNGGU_SPV') THEN RAISE EXCEPTION 'Keputusan denda hari ini sudah final'; END IF;
 INSERT INTO public.absensi_izin_telat_v1(karyawan_id,tanggal,alasan,bukti_path,created_by)
 VALUES(v_kid,v_today,btrim(p_alasan),v_path,NULL) ON CONFLICT(karyawan_id,tanggal) DO NOTHING RETURNING * INTO v_result;
 IF NOT FOUND THEN RAISE EXCEPTION 'Izin telat hari ini sudah dikirim, tidak boleh ditimpa'; END IF;
 UPDATE public.karyawan_web_session SET last_seen_at=now() WHERE token_hash=public.vax_token_hash(p_session_token);
 RETURN jsonb_build_object('status','TERKIRIM','tanggal',v_today,'karyawan_id',v_kid);
END;$$;
REVOKE ALL ON FUNCTION public.absensi_izin_telat_submit_v2(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.absensi_izin_telat_submit_v2(text,text,text) TO anon,authenticated;
-- The old RPC takes a supervisor-uploaded path; remove its right to execute from client roles.
REVOKE EXECUTE ON FUNCTION public.absensi_denda_putus_nominal_v2(bigint,bigint,text,text) FROM authenticated;
CREATE OR REPLACE FUNCTION public.absensi_denda_putus_nominal_v3(p_absensi_id bigint,p_nominal bigint,p_catatan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_a public.absensi%ROWTYPE; v_k public.karyawan%ROWTYPE; v_r public.absensi_denda_review_v1%ROWTYPE; v_now timestamp; v_tx uuid; v_path text; v_reason text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_erp_spv() THEN RAISE EXCEPTION 'Hanya SPV aktif dapat memutus denda'; END IF;
 v_now:=clock_timestamp() AT TIME ZONE 'Asia/Jakarta';
 SELECT * INTO v_a FROM public.absensi WHERE id=p_absensi_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Absensi tidak ditemukan'; END IF;
 IF v_a.tanggal IS DISTINCT FROM v_now::date OR v_now::time>=time '18:00' THEN RAISE EXCEPTION 'Keputusan denda hanya sebelum 18.00 WIB di hari absensi'; END IF;
 SELECT * INTO v_k FROM public.karyawan WHERE id=v_a.karyawan_id;
 IF lower(btrim(coalesce(v_k.jabatan,''))) NOT IN ('capster','kasir') OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.karyawan_id=v_a.karyawan_id AND lower(btrim(coalesce(p.role,''))) IN ('spv','svp')) THEN RAISE EXCEPTION 'Jabatan tidak memenuhi syarat keputusan denda'; END IF;
 IF coalesce(v_a.terlambat_menit,0)<=0 OR upper(coalesce(v_a.status,'')) IN ('LIBUR','IZIN','SAKIT') THEN RAISE EXCEPTION 'Tidak ada keterlambatan yang sah'; END IF;
 v_reason:=btrim(coalesce(p_catatan,''));
 IF char_length(v_reason)<5 OR char_length(v_reason)>1000 THEN RAISE EXCEPTION 'Alasan keputusan wajib 5–1000 karakter'; END IF;
 SELECT t.bukti_path INTO v_path FROM public.absensi_izin_telat_v1 t JOIN storage.objects o ON o.bucket_id='izin-proofs' AND o.name=t.bukti_path
 WHERE t.karyawan_id=v_a.karyawan_id AND t.tanggal=v_a.tanggal;
 INSERT INTO public.absensi_denda_review_v1(absensi_id,karyawan_id,tanggal,nominal_awal)
 SELECT v_a.id,v_a.karyawan_id,v_a.tanggal,v_a.denda WHERE v_a.denda>0 ON CONFLICT(absensi_id) DO NOTHING;
 SELECT * INTO v_r FROM public.absensi_denda_review_v1 WHERE absensi_id=p_absensi_id FOR UPDATE;
 IF NOT FOUND OR v_r.status<>'MENUNGGU_SPV' THEN RAISE EXCEPTION 'Denda tidak tersedia atau sudah diputus final'; END IF;
 IF p_nominal IS NULL OR p_nominal<0 OR p_nominal>v_r.nominal_awal THEN RAISE EXCEPTION 'Nominal final harus antara Rp0 dan denda awal'; END IF;
 UPDATE public.absensi_denda_review_v1 SET nominal_final=p_nominal,status=CASE WHEN p_nominal=0 THEN 'DIBEBASKAN' ELSE 'DITETAPKAN' END,diputus_oleh=auth.uid(),diputus_pada=clock_timestamp(),catatan=v_reason,bukti_path=v_path,updated_at=clock_timestamp() WHERE absensi_id=p_absensi_id;
 UPDATE public.absensi SET denda=CASE WHEN lower(btrim(v_k.jabatan))='kasir' THEN p_nominal ELSE 0 END,status_denda=CASE WHEN p_nominal=0 THEN 'Dibebaskan SPV' ELSE 'Final SPV' END WHERE id=p_absensi_id;
 IF p_nominal>0 THEN
  INSERT INTO public.arus_kas_v2_transactions(tanggal,amount,from_wallet,to_wallet,entry_type,category,description,source_type,source_key,source_period_start,source_period_end,verification_status,created_by,updated_by,proof_path,metadata)
  VALUES(v_a.tanggal,p_nominal,'EXTERNAL','PIUTANG_DENDA','AUTO','DENDA_DITETAPKAN','Piutang denda '||v_k.nama_karyawan||' · '||v_a.tanggal::text,'ABSENSI_DENDA_V1','ACCRUAL:'||v_a.id,v_a.tanggal,v_a.tanggal,'BELUM_DIVERIFIKASI',auth.uid(),auth.uid(),v_path,jsonb_build_object('absensi_id',v_a.id,'employee_id',v_a.karyawan_id,'jenis',v_k.jabatan,'employee_late_evidence',v_path)) RETURNING id INTO v_tx;
  INSERT INTO public.arus_kas_v2_audit(transaction_id,action,actor_id,snapshot) SELECT id,'DENDA_REVIEW_EMPLOYEE_EVIDENCE',auth.uid(),to_jsonb(t) FROM public.arus_kas_v2_transactions t WHERE id=v_tx;
 END IF;
 RETURN jsonb_build_object('absensi_id',v_a.id,'nominal_awal',v_r.nominal_awal,'nominal_final',p_nominal,'status',CASE WHEN p_nominal=0 THEN 'DIBEBASKAN' ELSE 'DITETAPKAN' END,'ledger_id',v_tx,'bukti_path',v_path);
END;$$;
REVOKE ALL ON FUNCTION public.absensi_denda_putus_nominal_v3(bigint,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.absensi_denda_putus_nominal_v3(bigint,bigint,text) TO authenticated;
