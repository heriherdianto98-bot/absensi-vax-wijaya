-- Gaji Saya self-service source adapter.
-- Purpose: expose only the signed-in employee's canonical Payroll source rows.
-- Calculation remains exclusively in ERP.NEW/js/modules/payroll-unified-engine.js.
-- This RPC is READ ONLY and must not become a second payroll engine.

create or replace function public.karyawan_gaji_capster_self(
  p_token text,
  p_from date,
  p_to date
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_kid bigint;
  v_emp record;
  v_period_month date;
  v_cabang jsonb;
  v_provider jsonb;
  v_product jsonb;
  v_absensi jsonb;
  v_kasbon jsonb;
  v_salary jsonb;
  v_adjustments jsonb;
begin
  v_kid := public.karyawan_session_id_from_token(p_token);
  if v_kid is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    return jsonb_build_object('ok',false,'reason','PERIODE_INVALID');
  end if;

  if (p_to - p_from) > 366 then
    return jsonb_build_object('ok',false,'reason','PERIODE_TERLALU_PANJANG');
  end if;

  select k.id,k.nama_karyawan,k.jabatan,k.cabang_id,k.aktif,c.nama_cabang
  into v_emp
  from public.karyawan k
  left join public.cabang c on c.id=k.cabang_id
  where k.id=v_kid and k.aktif is distinct from false
  limit 1;

  if v_emp.id is null then
    return jsonb_build_object('ok',false,'reason','KARYAWAN_INACTIVE');
  end if;

  if lower(trim(coalesce(v_emp.jabatan,''))) not like '%capster%' then
    return jsonb_build_object('ok',false,'reason','ROLE_NOT_CAPSTER');
  end if;

  v_period_month := date_trunc('month',p_from)::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'nama_cabang',c.nama_cabang
  ) order by c.id),'[]'::jsonb)
  into v_cabang
  from public.cabang c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'activity_date',r.activity_date,
    'cabang_id',r.cabang_id,
    'cabang_minutes_name',r.cabang_minutes_name,
    'provider_name_raw',r.provider_name_raw,
    'provider_name_normalized',r.provider_name_normalized,
    'provider_minutes_id',r.provider_minutes_id,
    'employee_id',r.employee_id,
    'mapping_status',r.mapping_status,
    'total_service',r.total_service,
    'provider_share',r.provider_share
  ) order by r.activity_date,r.id),'[]'::jsonb)
  into v_provider
  from public.provider_sales_daily_source r
  where r.employee_id=v_kid
    and r.activity_date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'period_start',r.period_start,
    'period_end',r.period_end,
    'cabang_id',r.cabang_id,
    'cabang_minutes_name',r.cabang_minutes_name,
    'product_name',r.product_name,
    'provider_name_raw',r.provider_name_raw,
    'employee_id',r.employee_id,
    'mapping_status',r.mapping_status,
    'qty',r.qty,
    'revenue_share',r.revenue_share
  ) order by r.period_start,r.id),'[]'::jsonb)
  into v_product
  from public.product_sales_source r
  where r.employee_id=v_kid
    and r.period_start between p_from and p_to
    and r.period_start=r.period_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'karyawan_id',a.karyawan_id,
    'cabang_id',a.cabang_id,
    'cabang_asal_id',a.cabang_asal_id,
    'tanggal',a.tanggal,
    'status',a.status,
    'terlambat_menit',a.terlambat_menit,
    'denda',a.denda,
    'status_denda',a.status_denda
  ) order by a.tanggal,a.id),'[]'::jsonb)
  into v_absensi
  from public.absensi a
  where a.karyawan_id=v_kid
    and a.tanggal between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',k.id,
    'employee_id',k.employee_id,
    'branch_id',k.branch_id,
    'employee_name_snapshot',k.employee_name_snapshot,
    'position_snapshot',k.position_snapshot,
    'request_date',k.request_date,
    'approved_amount',k.approved_amount,
    'disbursement_date',k.disbursement_date,
    'status',k.status,
    'current_outstanding',k.current_outstanding,
    'total_paid',k.total_paid
  ) order by k.request_date,k.id),'[]'::jsonb)
  into v_kasbon
  from public.employee_cash_advances k
  where k.employee_id=v_kid
    and upper(coalesce(k.status,''))='AKTIF'
    and coalesce(k.current_outstanding,0)>0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'employee_id',s.employee_id,
    'pay_basis',s.pay_basis,
    'amount',s.amount,
    'effective_from',s.effective_from,
    'effective_to',s.effective_to,
    'active',s.active
  ) order by s.effective_from,s.id),'[]'::jsonb)
  into v_salary
  from public.payroll_salary_master s
  where s.employee_id=v_kid
    and s.active is distinct from false
    and s.effective_from <= p_to
    and (s.effective_to is null or s.effective_to >= p_from);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,
    'employee_id',m.employee_id,
    'period_month',m.period_month,
    'bonus_insentif',m.bonus_insentif,
    'bonus_kpi',m.bonus_kpi,
    'note',m.note
  ) order by m.id),'[]'::jsonb)
  into v_adjustments
  from public.payroll_manual_adjustments m
  where m.employee_id=v_kid
    and m.period_month=v_period_month;

  return jsonb_build_object(
    'ok',true,
    'source','PAYROLL_UNIFIED_CONSUMER_SOURCE',
    'employee',jsonb_build_object(
      'id',v_emp.id,
      'nama_karyawan',v_emp.nama_karyawan,
      'jabatan',v_emp.jabatan,
      'cabang_id',v_emp.cabang_id,
      'aktif',v_emp.aktif,
      'nama_cabang',v_emp.nama_cabang
    ),
    'periode',jsonb_build_object('dari',p_from,'sampai',p_to),
    'data',jsonb_build_object(
      'cabang',v_cabang,
      'provider_sales_daily_source',v_provider,
      'product_sales_source',v_product,
      'absensi',v_absensi,
      'employee_cash_advances',v_kasbon,
      'payroll_salary_master',v_salary,
      'payroll_manual_adjustments',v_adjustments
    )
  );
end;
$function$;
