-- Applied to Supabase on 2026-09-21. Do not rerun in local browser.
-- The employee portal uses a server-issued employee session token. An ERP admin profile
-- accidentally linked to the same karyawan_id must not prevent the real employee from
-- sending a late-arrival notice. Keep session, job, evidence, date and duplicate checks.
CREATE OR REPLACE FUNCTION public.absensi_izin_telat_submit_v2(p_session_token text,p_alasan text,p_bukti_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_kid bigint; v_job text; v_today date:=(clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date; v_path text:=btrim(coalesce(p_bukti_path,'')); v_result public.absensi_izin_telat_v1%ROWTYPE;
BEGIN
 v_kid:=public.karyawan_session_id_from_token(p_session_token);
 IF v_kid IS NULL THEN RAISE EXCEPTION 'SESSION_REQUIRED: Silakan login ulang sebagai karyawan'; END IF;
 SELECT lower(btrim(coalesce(jabatan,''))) INTO v_job FROM public.karyawan WHERE id=v_kid AND aktif IS TRUE;
 IF v_job IS NULL OR v_job NOT IN ('capster','kasir') THEN RAISE EXCEPTION 'Izin telat hanya tersedia bagi capster/kasir aktif'; END IF;
 IF char_length(btrim(coalesce(p_alasan,''))) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Alasan wajib 5–1000 karakter'; END IF;
 IF length(v_path)>400 OR v_path NOT LIKE (v_kid::text||'/telat/'||v_today::text||'/%') OR v_path !~ '\.(jpg|jpeg|png|webp)$' THEN RAISE EXCEPTION 'Foto wajib diunggah dari halaman karyawan pada tanggal hari ini'; END IF;
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
