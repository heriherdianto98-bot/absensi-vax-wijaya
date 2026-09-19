-- VAX WIJAYA | Izin: antrean karyawan tetap SVP, Owner mengambil alih secara eksplisit.
-- ADDITIVE; jangan jalankan di database produksi sebelum review dan uji staging.
-- Tidak mengubah migrasi lama yang LOCK, data historis, atau keputusan SVP final.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.pengajuan_izin') IS NULL
     OR to_regprocedure('public.izin_applicant_is_spv(bigint)') IS NULL
     OR to_regprocedure('public.review_pengajuan_izin_owner(bigint,text,text)') IS NULL
     OR to_regprocedure('public.izin_write_audit(bigint,uuid,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'ABORT: dependensi pengajuan izin tidak lengkap';
  END IF;
END $$;

-- SVP yang mengajukan sendiri tetap meminta keputusan Owner.
-- Pengajuan karyawan lain selalu masuk antrean SVP, termasuk saat SVP libur/offline.
CREATE OR REPLACE FUNCTION public.izin_resolve_submit_status(p_karyawan_id bigint)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.izin_applicant_is_spv(p_karyawan_id) THEN
    RETURN 'MENUNGGU_OWNER';
  END IF;
  RETURN 'MENUNGGU_SPV';
END;
$$;
COMMENT ON FUNCTION public.izin_resolve_submit_status(bigint) IS
  'SVP applicant -> MENUNGGU_OWNER; other employees -> MENUNGGU_SPV regardless of SVP online/active. Owner takeover is explicit.';

-- Owner takeover HANYA untuk pengajuan karyawan yang masih menunggu SVP.
-- Satu transaksi: alihkan antrean, catat audit, lalu panggil review Owner yang ada.
-- Kegagalan salah satu langkah membatalkan semuanya (tidak meninggalkan status antara).
CREATE OR REPLACE FUNCTION public.review_pengajuan_izin_owner_takeover(
  p_pengajuan_id bigint, p_action text, p_catatan text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.pengajuan_izin%ROWTYPE;
  v_action text := upper(trim(coalesce(p_action, '')));
  v_note text := trim(coalesce(p_catatan, ''));
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_erp_owner() THEN
    RAISE EXCEPTION 'OWNER_ONLY: hanya Owner dapat mengambil alih pengajuan';
  END IF;
  IF v_action NOT IN ('APPROVE', 'REJECT', 'TOLAK') THEN
    RAISE EXCEPTION 'Aksi takeover tidak valid';
  END IF;
  IF char_length(v_note) < 3 THEN
    RAISE EXCEPTION 'Catatan keputusan wajib minimal 3 karakter';
  END IF;
  SELECT * INTO v_row FROM public.pengajuan_izin
  WHERE id = p_pengajuan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengajuan tidak ditemukan'; END IF;
  IF upper(trim(v_row.status)) <> 'MENUNGGU_SPV' THEN
    RAISE EXCEPTION 'Pengajuan bukan antrean SVP; keputusan final tidak boleh diambil alih';
  END IF;
  IF public.izin_applicant_is_spv(v_row.karyawan_id) THEN
    RAISE EXCEPTION 'Pengajuan SVP harus menggunakan jalur Owner biasa';
  END IF;
  UPDATE public.pengajuan_izin SET status = 'MENUNGGU_OWNER'
  WHERE id = p_pengajuan_id AND status = 'MENUNGGU_SPV';
  PERFORM public.izin_write_audit(
    p_pengajuan_id, auth.uid(), 'owner', 'TAKEOVER', v_note,
    'MENUNGGU_SPV', 'MENUNGGU_OWNER'
  );
  v_result := public.review_pengajuan_izin_owner(
    p_pengajuan_id, v_action, v_note
  );
  RETURN v_result || jsonb_build_object('takeover', true);
END;
$$;

REVOKE ALL ON FUNCTION public.review_pengajuan_izin_owner_takeover(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_pengajuan_izin_owner_takeover(bigint,text,text) TO authenticated;
COMMIT;
