-- Absensi: employee writes use a server-validated RPC, never direct table writes.
-- Production migrations applied 2026-09-19; this file records the canonical schema.
CREATE OR REPLACE FUNCTION public.karyawan_absen_secure(p_token text,p_action text,p_lat double precision,p_lon double precision,p_accuracy double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_kid bigint; v_k public.karyawan%ROWTYPE; v_c public.cabang%ROWTYPE; v_cfg public.pengaturan_absensi%ROWTYPE; v_a public.absensi%ROWTYPE; v_day date; v_clock time; v_action text; v_distance double precision; v_minutes integer; v_rate integer; v_max integer; v_fine integer; v_limit double precision;
BEGIN
 v_kid := public.karyawan_session_id_from_token(p_token);
 IF v_kid IS NULL THEN RAISE EXCEPTION 'SESSION_INVALID: login ulang diperlukan'; END IF;
 SELECT * INTO v_k FROM public.karyawan WHERE id=v_kid AND aktif IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'KARYAWAN_INACTIVE'; END IF;
 v_action:=upper(trim(coalesce(p_action,'')));
 IF v_action NOT IN ('MASUK','PULANG') THEN RAISE EXCEPTION 'ACTION_INVALID'; END IF;
 IF p_lat IS NULL OR p_lon IS NULL OR p_accuracy IS NULL OR p_lat::text IN ('NaN','Infinity','-Infinity') OR p_lon::text IN ('NaN','Infinity','-Infinity') OR p_accuracy::text IN ('NaN','Infinity','-Infinity') OR p_lat NOT BETWEEN -90 AND 90 OR p_lon NOT BETWEEN -180 AND 180 OR p_accuracy<=0 OR p_accuracy>100 THEN RAISE EXCEPTION 'GPS_INVALID'; END IF;
 v_day := (now() AT TIME ZONE 'Asia/Jakarta')::date;
 v_clock := (now() AT TIME ZONE 'Asia/Jakarta')::time(0);
 SELECT c.* INTO v_c FROM public.cabang c WHERE c.aktif IS TRUE AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL AND c.radius_meter>0 AND lower(coalesce(c.nama_cabang,'')) NOT LIKE '%floating%' ORDER BY (pow(radians(c.latitude-p_lat),2)+pow(radians(c.longitude-p_lon)*cos(radians(p_lat)),2)) ASC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'CABANG_NOT_FOUND'; END IF;
 v_distance := 2*6371000*asin(least(1.0,sqrt(pow(sin(radians(v_c.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(v_c.latitude))*pow(sin(radians(v_c.longitude-p_lon)/2),2))));
 v_limit := least(v_c.radius_meter::double precision,100.0);
 IF v_distance>v_limit THEN RAISE EXCEPTION 'OUTSIDE_GEOFENCE: jarak % meter',round(v_distance); END IF;
 IF public.check_cabang_tutup(v_c.id,v_day)->>'tutup'='true' THEN RAISE EXCEPTION 'CABANG_CLOSED'; END IF;
 IF EXISTS (SELECT 1 FROM public.jadwal_libur j WHERE j.karyawan_id=v_kid AND j.tanggal=v_day AND upper(trim(coalesce(j.status,''))) IN ('LIBUR','IZIN','SAKIT')) THEN RAISE EXCEPTION 'JADWAL_LIBUR_AKTIF'; END IF;
 IF v_action='MASUK' THEN
  SELECT * INTO v_cfg FROM public.pengaturan_absensi WHERE aktif IS TRUE ORDER BY id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'PENGATURAN_ABSENSI_TIDAK_AKTIF'; END IF;
  v_minutes:=greatest(0,floor(extract(epoch from (v_clock-v_cfg.jam_masuk))/60)::integer-coalesce(v_cfg.toleransi_menit,15));
  v_rate:=coalesce(nullif(v_cfg.tarif_denda,0),1000);
  v_max:=coalesce(v_cfg.max_denda,0);
  v_fine:=CASE WHEN v_max>0 THEN least(v_minutes*v_rate,v_max) ELSE v_minutes*v_rate END;
  INSERT INTO public.absensi (karyawan_id,cabang_id,cabang_asal_id,tanggal,jam_masuk,status,status_absensi,terlambat_menit,tarif_denda,denda,latitude_masuk,longitude_masuk)
  VALUES (v_kid,v_c.id,v_k.cabang_id,v_day,v_clock,CASE WHEN v_minutes>0 THEN 'Terlambat' ELSE 'Hadir' END,'H',v_minutes,v_rate,v_fine,p_lat,p_lon)
  ON CONFLICT (karyawan_id,tanggal) DO NOTHING RETURNING * INTO v_a;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'ABSEN_MASUK_SUDAH_TERCATAT'; END IF;
 ELSE
  UPDATE public.absensi SET jam_pulang=v_clock WHERE karyawan_id=v_kid AND tanggal=v_day AND jam_masuk IS NOT NULL AND jam_pulang IS NULL RETURNING * INTO v_a;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'ABSEN_PULANG_TIDAK_TERSEDIA'; END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'action',v_action,'id',v_a.id,'karyawan_id',v_a.karyawan_id,'cabang_id',v_a.cabang_id,'nama_cabang',v_c.nama_cabang,'tanggal',v_a.tanggal,'jam_masuk',v_a.jam_masuk,'jam_pulang',v_a.jam_pulang,'status',v_a.status,'terlambat_menit',v_a.terlambat_menit,'denda',v_a.denda);
END;$fn$;
REVOKE ALL ON FUNCTION public.karyawan_absen_secure(text,text,double precision,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.karyawan_absen_secure(text,text,double precision,double precision,double precision) TO anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.absensi FROM anon;
REVOKE DELETE,TRUNCATE ON public.absensi FROM authenticated;
DROP POLICY IF EXISTS absensi_insert ON public.absensi;
DROP POLICY IF EXISTS absensi_insert_public ON public.absensi;
DROP POLICY IF EXISTS absensi_update ON public.absensi;
CREATE POLICY absensi_erp_staff_insert ON public.absensi FOR INSERT TO authenticated WITH CHECK (public.is_erp_owner() OR public.is_erp_spv());
CREATE POLICY absensi_erp_staff_update ON public.absensi FOR UPDATE TO authenticated USING (public.is_erp_owner() OR public.is_erp_spv()) WITH CHECK (public.is_erp_owner() OR public.is_erp_spv());
REVOKE ALL ON FUNCTION public.izin_apply_jadwal_final(bigint,date,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.izin_apply_pengajuan_jadwal(public.pengajuan_izin,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.izin_apply_review_row(bigint,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.izin_write_audit(bigint,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
