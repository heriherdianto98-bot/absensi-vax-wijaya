-- VAX WIJAYA / ABSENSI: pengecualian denda SPV.
-- ADDITIVE: tidak mengganti fungsi absensi LOCK, tidak mengubah data historis.
-- Untuk absensi baru saja; jangan menganggap ini mengimplementasikan review denda / takeover.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.absensi') IS NULL OR to_regclass('public.karyawan') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'ABORT: tabel absensi/karyawan/profiles belum tersedia';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.absensi_exempt_spv_fine_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.karyawan k
    WHERE k.id = NEW.karyawan_id
      AND (
        lower(btrim(coalesce(k.jabatan, ''))) IN ('supervisor', 'spv', 'svp')
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.karyawan_id = k.id
            AND lower(btrim(coalesce(p.role, ''))) IN ('spv', 'svp')
        )
      )
  ) THEN
    NEW.denda := 0;
    NEW.status_denda := 'Dikecualikan';
    -- terlambat_menit dan jam_masuk sengaja tidak diubah: tetap akurat untuk audit.
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_absensi_exempt_spv_fine_insert ON public.absensi;
CREATE TRIGGER trg_absensi_exempt_spv_fine_insert
BEFORE INSERT ON public.absensi
FOR EACH ROW EXECUTE FUNCTION public.absensi_exempt_spv_fine_on_insert();

COMMENT ON FUNCTION public.absensi_exempt_spv_fine_on_insert() IS
  'SPV/Supervisor dikecualikan dari denda pada INSERT absensi baru; menit keterlambatan tetap dicatat. Tidak mengubah histori.';
COMMIT;
