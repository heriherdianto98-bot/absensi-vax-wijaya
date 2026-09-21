-- Additive safety correction: never zero historical/manual backdated fines.
BEGIN;
CREATE OR REPLACE FUNCTION public.absensi_denda_capture_new_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_job text;
BEGIN
 IF NEW.tanggal IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date THEN RETURN NEW; END IF;
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
COMMENT ON FUNCTION public.absensi_denda_capture_new_v1() IS 'New same-day capster/kasir fines only; historical manual absensi never altered.';
COMMIT;