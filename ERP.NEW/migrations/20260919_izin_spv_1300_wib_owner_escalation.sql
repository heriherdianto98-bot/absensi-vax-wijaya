-- VAX WIJAYA: pengajuan karyawan yang belum ditindaklanjuti SVP
-- dialihkan ke antrean Owner pada 13.00 WIB, tanpa menetapkan keputusan.
-- Tambahan setelah 20260919_izin_spv_queue_owner_manual_takeover.sql.
-- DRAFT UNTUK STAGING: jangan jalankan di produksi sebelum uji end-to-end.
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.izin_resolve_submit_status(bigint)') IS NULL
    OR to_regprocedure('public.izin_write_audit(bigint,uuid,text,text,text,text,text)') IS NULL
    OR to_regclass('public.pengajuan_izin') IS NULL
    OR to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'ABORT: dependensi izin/cron belum lengkap';
  END IF;
  IF position('regardless of SVP' in coalesce(obj_description('public.izin_resolve_submit_status(bigint)'::regprocedure,'pg_proc'),'')) = 0 THEN
    RAISE EXCEPTION 'ABORT: migrasi routing SVP sebelumnya belum diterapkan';
  END IF;
END $$;

-- Pukul 13:00 WIB = 06:00 UTC (timezone pg_cron GMT).
-- Job mengulang setiap 5 menit selama jam 13:00-13:55 agar tahan kegagalan sementara.
-- Hanya pengajuan yang sudah dibuat sebelum batas 13.00 pada hari berjalan.
CREATE OR REPLACE FUNCTION public.izin_escalate_pending_spv_1300()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_local timestamp := v_now AT TIME ZONE 'Asia/Jakarta';
  v_cutoff timestamptz := ((v_now AT TIME ZONE 'Asia/Jakarta')::date + time '13:00') AT TIME ZONE 'Asia/Jakarta';
  v_id bigint;
  v_count integer := 0;
BEGIN
  IF v_local::time < time '13:00' THEN RETURN 0; END IF;
  FOR v_id IN
    SELECT id FROM public.pengajuan_izin
    WHERE status = 'MENUNGGU_SPV' AND created_at <= v_cutoff
      AND NOT public.izin_applicant_is_spv(karyawan_id)
    ORDER BY created_at, id FOR UPDATE SKIP LOCKED
  LOOP
    -- Tidak memutus pengajuan; Owner harus mengecek bukti dan memutus sendiri.
    UPDATE public.pengajuan_izin SET status = 'MENUNGGU_OWNER'
    WHERE id = v_id AND status = 'MENUNGGU_SPV';
    PERFORM public.izin_write_audit(
      v_id, NULL, 'system', 'AUTO_ESCALATE_1300_WIB',
      'SVP belum memutus hingga 13.00 WIB; dialihkan ke Owner.',
      'MENUNGGU_SPV', 'MENUNGGU_OWNER'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
-- Hanya scheduler/backend boleh memanggil fungsi escalasi; tidak dari browser.
REVOKE ALL ON FUNCTION public.izin_escalate_pending_spv_1300() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.izin_escalate_pending_spv_1300() IS
  '13.00 WIB: pindahkan hanya pengajuan MENUNGGU_SPV yang dibuat sebelum 13.00 ke MENUNGGU_OWNER; audit idempotent.';

-- pg_cron timezone GMT (telah diperiksa di proyek); 06:00 UTC = 13:00 WIB.
SELECT cron.schedule(
  'vax-izin-spv-1300-wib',
  '*/5 6 * * *',
  $job$SELECT public.izin_escalate_pending_spv_1300();$job$
);
COMMIT;
