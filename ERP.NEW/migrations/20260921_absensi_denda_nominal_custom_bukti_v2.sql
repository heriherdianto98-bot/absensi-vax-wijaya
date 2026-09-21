-- Applied to Supabase on 2026-09-21. Additive; do not rerun in local browser.
-- SPV may decide Rp0..original fine before 18:00 WIB with mandatory reason and photo.
ALTER TABLE public.absensi_denda_review_v1 ADD COLUMN IF NOT EXISTS bukti_path text;
CREATE OR REPLACE FUNCTION public.absensi_denda_putus_nominal_v2(p_absensi_id bigint,p_nominal bigint,p_catatan text,p_bukti_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_a public.absensi%ROWTYPE; v_k public.karyawan%ROWTYPE; v_r public.absensi_denda_review_v1%ROWTYPE; v_now timestamp; v_tx uuid; v_path text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_erp_spv() THEN RAISE EXCEPTION 'Hanya SPV aktif dapat memutus denda'; END IF;
 v_now:=clock_timestamp() AT TIME ZONE 'Asia/Jakarta';
 SELECT * INTO v_a FROM public.absensi WHERE id=p_absensi_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Absensi tidak ditemukan'; END IF;
 IF v_a.tanggal IS DISTINCT FROM v_now::date OR v_now::time>=time '18:00' THEN RAISE EXCEPTION 'Keputusan denda hanya sebelum 18.00 WIB di hari absensi'; END IF;
 SELECT * INTO v_k FROM public.karyawan WHERE id=v_a.karyawan_id;
 IF lower(btrim(coalesce(v_k.jabatan,''))) NOT IN ('capster','kasir') OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.karyawan_id=v_a.karyawan_id AND lower(btrim(coalesce(p.role,''))) IN ('spv','svp')) THEN RAISE EXCEPTION 'Jabatan tidak memenuhi syarat keputusan denda'; END IF;
 IF coalesce(v_a.terlambat_menit,0)<=0 OR upper(coalesce(v_a.status,'')) IN ('LIBUR','IZIN','SAKIT') THEN RAISE EXCEPTION 'Tidak ada keterlambatan yang sah'; END IF;
 IF length(btrim(coalesce(p_catatan,'')))<5 THEN RAISE EXCEPTION 'Alasan keputusan minimal 5 karakter'; END IF;
 v_path:=btrim(coalesce(p_bukti_path,''));
 IF length(v_path)>400 OR v_path NOT LIKE ('denda-review/'||auth.uid()::text||'/%') OR v_path !~ '\.(jpg|jpeg|png|webp)$' THEN RAISE EXCEPTION 'Bukti foto SPV wajib diunggah dari akun sendiri'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='izin-proofs' AND o.name=v_path) THEN RAISE EXCEPTION 'Foto bukti tidak ditemukan di penyimpanan'; END IF;
 INSERT INTO public.absensi_denda_review_v1(absensi_id,karyawan_id,tanggal,nominal_awal)
 SELECT v_a.id,v_a.karyawan_id,v_a.tanggal,v_a.denda WHERE v_a.denda>0 ON CONFLICT(absensi_id) DO NOTHING;
 SELECT * INTO v_r FROM public.absensi_denda_review_v1 WHERE absensi_id=p_absensi_id FOR UPDATE;
 IF NOT FOUND OR v_r.status<>'MENUNGGU_SPV' THEN RAISE EXCEPTION 'Denda tidak tersedia atau sudah diputus final'; END IF;
 IF p_nominal IS NULL OR p_nominal<0 OR p_nominal>v_r.nominal_awal THEN RAISE EXCEPTION 'Nominal final harus antara Rp0 dan denda awal'; END IF;
 UPDATE public.absensi_denda_review_v1 SET nominal_final=p_nominal,status=CASE WHEN p_nominal=0 THEN 'DIBEBASKAN' ELSE 'DITETAPKAN' END,diputus_oleh=auth.uid(),diputus_pada=clock_timestamp(),catatan=btrim(p_catatan),bukti_path=v_path,updated_at=clock_timestamp() WHERE absensi_id=p_absensi_id;
 UPDATE public.absensi SET denda=CASE WHEN lower(btrim(v_k.jabatan))='kasir' THEN p_nominal ELSE 0 END,status_denda=CASE WHEN p_nominal=0 THEN 'Dibebaskan SPV' ELSE 'Final SPV' END WHERE id=p_absensi_id;
 IF p_nominal>0 THEN
 INSERT INTO public.arus_kas_v2_transactions(tanggal,amount,from_wallet,to_wallet,entry_type,category,description,source_type,source_key,source_period_start,source_period_end,verification_status,created_by,updated_by,proof_path,metadata)
 VALUES(v_a.tanggal,p_nominal,'EXTERNAL','PIUTANG_DENDA','AUTO','DENDA_DITETAPKAN','Piutang denda '||v_k.nama_karyawan||' · '||v_a.tanggal::text,'ABSENSI_DENDA_V1','ACCRUAL:'||v_a.id,v_a.tanggal,v_a.tanggal,'BELUM_DIVERIFIKASI',auth.uid(),auth.uid(),v_path,jsonb_build_object('absensi_id',v_a.id,'employee_id',v_a.karyawan_id,'jenis',v_k.jabatan,'decision_evidence',v_path)) RETURNING id INTO v_tx;
 INSERT INTO public.arus_kas_v2_audit(transaction_id,action,actor_id,snapshot) SELECT id,'DENDA_REVIEW_CUSTOM_FINAL',auth.uid(),to_jsonb(t) FROM public.arus_kas_v2_transactions t WHERE id=v_tx;
 END IF;
 RETURN jsonb_build_object('absensi_id',v_a.id,'nominal_awal',v_r.nominal_awal,'nominal_final',p_nominal,'status',CASE WHEN p_nominal=0 THEN 'DIBEBASKAN' ELSE 'DITETAPKAN' END,'ledger_id',v_tx,'bukti_path',v_path);
END;$$;
REVOKE ALL ON FUNCTION public.absensi_denda_putus_nominal_v2(bigint,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.absensi_denda_putus_nominal_v2(bigint,bigint,text,text) TO authenticated;
