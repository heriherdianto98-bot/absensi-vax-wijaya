-- =========================================================
-- VAX ERP — Dashboard Kasir self-read consumer
-- Additive read-only RPC. Tidak membuka RLS source Owner.
-- Source canonical:
-- - Target/omzet: target_bulanan + daily_recap_source
-- - KPI Ultimate: kpi_ultimate_monthly_target + kpi_ultimate_sales_source
-- - Product branch: product_sales_daily_source (sama dengan Tabel Harian)
-- - Product share kasir: product_sales_source
-- - Kasbon: employee_cash_advances
-- employee/cabang hanya dari session token existing.
-- =========================================================

CREATE OR REPLACE FUNCTION public.karyawan_kasir_dashboard_self(
  p_token text,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id bigint;
  v_cabang_id bigint;
  v_jabatan text;
  v_month_start date;
  v_year integer;
  v_month integer;

  v_omzet_target numeric := 0;
  v_omzet_real numeric := 0;
  v_ultimate_target numeric := 0;
  v_ultimate_real numeric := 0;
  v_ultimate_count integer := 0;
  v_ultimate_today_total numeric := 0;
  v_ultimate_today_detail jsonb := '[]'::jsonb;

  v_customer_today numeric := 0;
  v_transaction_today numeric := 0;
  v_services_today numeric := 0;

  v_product_today numeric := 0;
  v_product_month numeric := 0;
  v_product_detail jsonb := '[]'::jsonb;
  v_product_share_today numeric := 0;
  v_employee_product_detail jsonb := '[]'::jsonb;

  v_kasbon_month numeric := 0;
  v_last_sync timestamptz;
BEGIN
  v_employee_id := public.karyawan_session_id_from_token(p_token);

  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'SESSION_INVALID');
  END IF;

  SELECT k.cabang_id, lower(trim(coalesce(k.jabatan,'')))
    INTO v_cabang_id, v_jabatan
  FROM public.karyawan k
  WHERE k.id = v_employee_id
    AND k.aktif IS TRUE;

  IF v_cabang_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EMPLOYEE_BRANCH_UNAVAILABLE');
  END IF;

  IF v_jabatan <> 'kasir' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ROLE_NOT_CASHIER');
  END IF;

  v_month_start := date_trunc('month', p_date)::date;
  v_year := extract(year from p_date)::integer;
  v_month := extract(month from p_date)::integer;

  SELECT coalesce(sum(t.target),0)
    INTO v_omzet_target
  FROM public.target_bulanan t
  WHERE t.cabang_id = v_cabang_id
    AND t.tahun = v_year
    AND t.bulan = v_month;

  SELECT
    coalesce(sum(coalesce(r.service,0) + coalesce(r.produk,0)),0),
    coalesce(max(r.customer_minutes) filter (where r.tanggal = p_date),0),
    coalesce(max(r.transaction_minutes) filter (where r.tanggal = p_date),0),
    coalesce(max(r.services_minutes) filter (where r.tanggal = p_date),0),
    max(r.synced_at)
  INTO v_omzet_real, v_customer_today, v_transaction_today, v_services_today, v_last_sync
  FROM public.daily_recap_source r
  WHERE r.cabang_id = v_cabang_id
    AND r.tanggal BETWEEN v_month_start AND p_date;

  SELECT coalesce(max(t.target_amount),0)
    INTO v_ultimate_target
  FROM public.kpi_ultimate_monthly_target t
  WHERE t.cabang_id = v_cabang_id
    AND t.year = v_year
    AND t.month = v_month
    AND t.active IS TRUE;

  SELECT
    coalesce(sum(s.price_with_discount),0),
    count(*)::integer
  INTO v_ultimate_real, v_ultimate_count
  FROM public.kpi_ultimate_sales_source s
  WHERE s.cabang_id = v_cabang_id
    AND s.activity_date BETWEEN v_month_start AND p_date
    AND (
      lower(s.service_package) ~ '(^|[^a-z])(max|relax|reguler|regular|plus)([^a-z]|$)'
      OR lower(s.service_package) ~ 'enakin[[:space:]]+kepala'
    );

  SELECT coalesce(sum(s.price_with_discount),0)
    INTO v_ultimate_today_total
  FROM public.kpi_ultimate_sales_source s
  WHERE s.cabang_id = v_cabang_id
    AND s.activity_date = p_date
    AND (
      lower(s.service_package) ~ '(^|[^a-z])(max|relax|reguler|regular|plus)([^a-z]|$)'
      OR lower(s.service_package) ~ 'enakin[[:space:]]+kepala'
    );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'package_name', x.service_package,
        'qty', x.qty,
        'total', x.total
      )
      ORDER BY x.total DESC, x.service_package
    ),
    '[]'::jsonb
  )
  INTO v_ultimate_today_detail
  FROM (
    SELECT
      s.service_package,
      count(*)::integer AS qty,
      coalesce(sum(s.price_with_discount),0)::numeric AS total
    FROM public.kpi_ultimate_sales_source s
    WHERE s.cabang_id = v_cabang_id
      AND s.activity_date = p_date
      AND (
        lower(s.service_package) ~ '(^|[^a-z])(max|relax|reguler|regular|plus)([^a-z]|$)'
        OR lower(s.service_package) ~ 'enakin[[:space:]]+kepala'
      )
    GROUP BY s.service_package
  ) x;

  SELECT
    coalesce(sum(case when d.activity_date = p_date then coalesce(d.product_price,0) else 0 end),0),
    coalesce(sum(coalesce(d.product_price,0)),0),
    greatest(v_last_sync, max(d.synced_at))
  INTO v_product_today, v_product_month, v_last_sync
  FROM public.product_sales_daily_source d
  WHERE d.cabang_id = v_cabang_id
    AND d.activity_date BETWEEN v_month_start AND p_date;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_name', x.product_name,
        'qty', x.qty,
        'total', x.total
      )
      ORDER BY x.total DESC, x.product_name
    ),
    '[]'::jsonb
  )
  INTO v_product_detail
  FROM (
    SELECT
      d.product_name,
      coalesce(sum(coalesce(d.qty_sold,1)),0)::numeric AS qty,
      coalesce(sum(coalesce(d.product_price,0)),0)::numeric AS total
    FROM public.product_sales_daily_source d
    WHERE d.cabang_id = v_cabang_id
      AND d.activity_date = p_date
    GROUP BY d.product_name
  ) x;

  SELECT
    coalesce(sum(coalesce(p.revenue_share,0)),0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_name', p.product_name,
          'qty', p.qty,
          'revenue_share', p.revenue_share
        )
        ORDER BY p.revenue_share DESC, p.product_name
      ),
      '[]'::jsonb
    )
  INTO v_product_share_today, v_employee_product_detail
  FROM public.product_sales_source p
  WHERE p.cabang_id = v_cabang_id
    AND p.employee_id = v_employee_id
    AND p.mapping_status = 'MATCHED'
    AND p.period_start = p_date
    AND p.period_end = p_date;

  SELECT coalesce(sum(coalesce(a.approved_amount,a.requested_amount,0)),0)
    INTO v_kasbon_month
  FROM public.employee_cash_advances a
  WHERE a.employee_id = v_employee_id
    AND coalesce(a.disbursement_date,a.request_date) BETWEEN v_month_start AND
      (v_month_start + interval '1 month - 1 day')::date
    AND upper(coalesce(a.status,'')) NOT IN ('REJECTED','CANCELLED','CANCELED');

  RETURN jsonb_build_object(
    'ok', true,
    'source', 'ERP_CANONICAL_SELF_READ',
    'employee_id', v_employee_id,
    'cabang_id', v_cabang_id,
    'activity_date', p_date,
    'month_start', v_month_start,
    'omzet_target', v_omzet_target,
    'omzet_real', v_omzet_real,
    'ultimate_target', v_ultimate_target,
    'ultimate_real', v_ultimate_real,
    'ultimate_count', v_ultimate_count,
    'ultimate_today_total', v_ultimate_today_total,
    'ultimate_today_detail', coalesce(v_ultimate_today_detail,'[]'::jsonb),
    'customer_today', v_customer_today,
    'transaction_today', v_transaction_today,
    'services_today', v_services_today,
    'product_today', v_product_today,
    'product_month', v_product_month,
    'product_detail', coalesce(v_product_detail,'[]'::jsonb),
    'product_share_today', v_product_share_today,
    'employee_product_detail', coalesce(v_employee_product_detail,'[]'::jsonb),
    'kasbon_month', v_kasbon_month,
    'last_sync', v_last_sync
  );
END;
$$;

COMMENT ON FUNCTION public.karyawan_kasir_dashboard_self(text,date) IS
  'Read-only Dashboard Kasir consumer. Employee/cabang resolved from employee session token. Reads canonical ERP source without granting employee direct table SELECT.';

REVOKE ALL ON FUNCTION public.karyawan_kasir_dashboard_self(text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.karyawan_kasir_dashboard_self(text,date) TO anon, authenticated;