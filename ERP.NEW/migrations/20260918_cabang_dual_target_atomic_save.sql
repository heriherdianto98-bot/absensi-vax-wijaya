-- Master Cabang dual targets: isolated Owner-only RPC. Does not alter locked KPI or daily engines.
-- Applied to Supabase as owner_atomic_monthly_omzet_ultimate_target_save and
-- owner_atomic_monthly_target_nonwriting_button_test.
CREATE OR REPLACE FUNCTION public.save_cabang_monthly_targets_atomic(p_year integer, p_month integer, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
DECLARE
  v_item jsonb;
  v_id bigint;
  v_omzet bigint;
  v_ultimate numeric;
  v_ids bigint[] := ARRAY[]::bigint[];
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.aktif IS TRUE AND lower(btrim(p.role)) = 'owner'
  ) THEN
    RAISE EXCEPTION 'Hanya Owner aktif yang dapat menyimpan dua target.' USING ERRCODE = '42501';
  END IF;
  IF p_year NOT BETWEEN 2020 AND 2100 OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Periode target tidak valid.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Pilih 1 sampai 10 cabang yang sudah diatur.' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR jsonb_typeof(v_item->'cabang_id') <> 'number'
       OR jsonb_typeof(v_item->'omzet_target') <> 'number'
       OR jsonb_typeof(v_item->'ultimate_target') <> 'number' THEN
      RAISE EXCEPTION 'Cabang dan kedua nominal wajib diisi sebagai angka; nilai kosong tidak disimpan.' USING ERRCODE = '22023';
    END IF;
    IF (v_item->>'cabang_id')::numeric <> trunc((v_item->>'cabang_id')::numeric)
       OR (v_item->>'omzet_target')::numeric <> trunc((v_item->>'omzet_target')::numeric)
       OR (v_item->>'ultimate_target')::numeric <> trunc((v_item->>'ultimate_target')::numeric) THEN
      RAISE EXCEPTION 'ID cabang dan nominal target harus bilangan bulat.' USING ERRCODE = '22023';
    END IF;
    v_id := (v_item->>'cabang_id')::bigint;
    v_omzet := (v_item->>'omzet_target')::bigint;
    v_ultimate := (v_item->>'ultimate_target')::numeric;
    IF v_id <= 0 OR v_omzet <= 0 OR v_ultimate <= 0 THEN
      RAISE EXCEPTION 'Cabang dan kedua target harus lebih dari nol; draft kosong tidak disimpan.' USING ERRCODE = '22023';
    END IF;
    IF v_id = ANY(v_ids) THEN
      RAISE EXCEPTION 'Cabang duplikat dalam draft.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.cabang c WHERE c.id = v_id AND c.aktif IS TRUE
        AND nullif(btrim(coalesce(c.nama_minutes, '')), '') IS NOT NULL
        AND lower(coalesce(c.nama_cabang, '')) NOT LIKE '%floating%'
    ) THEN
      RAISE EXCEPTION 'Cabang % bukan cabang operasional aktif.', v_id USING ERRCODE = '22023';
    END IF;
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  -- Both upserts occur within one PostgreSQL function call / transaction.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_id := (v_item->>'cabang_id')::bigint;
    v_omzet := (v_item->>'omzet_target')::bigint;
    v_ultimate := (v_item->>'ultimate_target')::numeric;
    INSERT INTO public.target_bulanan (cabang_id, bulan, tahun, target)
    VALUES (v_id, p_month, p_year, v_omzet)
    ON CONFLICT (cabang_id, bulan, tahun) DO UPDATE
      SET target = EXCLUDED.target, updated_at = now();
    INSERT INTO public.kpi_ultimate_monthly_target (year, month, cabang_id, target_amount, active, updated_at)
    VALUES (p_year, p_month, v_id, v_ultimate, true, now())
    ON CONFLICT (year, month, cabang_id) DO UPDATE
      SET target_amount = EXCLUDED.target_amount, active = true, updated_at = now();
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'saved_branches', v_count, 'year', p_year, 'month', p_month);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_cabang_monthly_targets_atomic(integer,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_cabang_monthly_targets_atomic(integer,integer,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_cabang_monthly_targets_atomic(integer,integer,jsonb) TO authenticated;

-- A real write/read-back test inside a PL/pgSQL exception subtransaction:
-- deliberate exception rolls back both writes before returning to the button.
CREATE OR REPLACE FUNCTION public.test_cabang_monthly_targets_atomic()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $function$
DECLARE
  v_cabang_id bigint;
  v_before_omzet bigint;
  v_before_ultimate numeric;
  v_result jsonb;
BEGIN
  SELECT c.id INTO v_cabang_id FROM public.cabang c
  WHERE c.aktif IS TRUE
    AND nullif(btrim(coalesce(c.nama_minutes, '')), '') IS NOT NULL
    AND lower(coalesce(c.nama_cabang, '')) NOT LIKE '%floating%'
  ORDER BY c.id LIMIT 1;
  IF v_cabang_id IS NULL THEN RAISE EXCEPTION 'Cabang operasional uji tidak tersedia.'; END IF;
  SELECT target INTO v_before_omzet FROM public.target_bulanan
   WHERE cabang_id=v_cabang_id AND bulan=11 AND tahun=2098;
  SELECT target_amount INTO v_before_ultimate FROM public.kpi_ultimate_monthly_target
   WHERE cabang_id=v_cabang_id AND month=11 AND year=2098;
  BEGIN
    v_result := public.save_cabang_monthly_targets_atomic(2098, 11,
      jsonb_build_array(jsonb_build_object('cabang_id', v_cabang_id,
        'omzet_target', 12345000, 'ultimate_target', 3456000)));
    IF (SELECT target FROM public.target_bulanan WHERE cabang_id=v_cabang_id AND bulan=11 AND tahun=2098) IS DISTINCT FROM 12345000
       OR (SELECT target_amount FROM public.kpi_ultimate_monthly_target WHERE cabang_id=v_cabang_id AND month=11 AND year=2098) IS DISTINCT FROM 3456000 THEN
      RAISE EXCEPTION 'Uji simpan: nilai verifikasi tidak cocok.';
    END IF;
    RAISE EXCEPTION 'VAX_TARGET_TEST_ROLLBACK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'VAX_TARGET_TEST_ROLLBACK' THEN RAISE; END IF;
  END;
  IF (SELECT target FROM public.target_bulanan WHERE cabang_id=v_cabang_id AND bulan=11 AND tahun=2098) IS DISTINCT FROM v_before_omzet
     OR (SELECT target_amount FROM public.kpi_ultimate_monthly_target WHERE cabang_id=v_cabang_id AND month=11 AND year=2098) IS DISTINCT FROM v_before_ultimate THEN
    RAISE EXCEPTION 'Uji rollback: data awal berubah.';
  END IF;
  RETURN jsonb_build_object('ok',true,'atomic_write_test',true,'rollback_verified',true,'data_changed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.test_cabang_monthly_targets_atomic() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_cabang_monthly_targets_atomic() FROM anon;
GRANT EXECUTE ON FUNCTION public.test_cabang_monthly_targets_atomic() TO authenticated;
