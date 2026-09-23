-- Employee-only Barber Ranking.
-- Read-only projection of Provider Sales ranking; does not modify Owner Dashboard/Barber engines.
-- Exposes only rank, barber name, branch and total service. Income/share remain private.

create or replace function public.karyawan_barber_ranking_self(
  p_token text,
  p_scope text default 'CABANG',
  p_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_employee_id bigint;
  v_cabang_id bigint;
  v_jabatan text;
  v_scope text := upper(trim(coalesce(p_scope, 'CABANG')));
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_items jsonb := '[]'::jsonb;
  v_self_rank integer;
  v_self_total numeric := 0;
begin
  v_employee_id := public.karyawan_session_id_from_token(p_token);

  if v_employee_id is null then
    return jsonb_build_object('ok', false, 'reason', 'SESSION_INVALID');
  end if;

  select k.cabang_id, lower(trim(coalesce(k.jabatan, '')))
    into v_cabang_id, v_jabatan
    from public.karyawan k
   where k.id = v_employee_id
     and k.aktif is true
   limit 1;

  if v_cabang_id is null then
    return jsonb_build_object('ok', false, 'reason', 'EMPLOYEE_BRANCH_UNAVAILABLE');
  end if;

  if v_jabatan <> 'capster' then
    return jsonb_build_object('ok', false, 'reason', 'CAPSTER_ONLY');
  end if;

  if v_scope not in ('CABANG','GLOBAL') then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_SCOPE');
  end if;

  if v_date > v_today then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_DATE');
  end if;

  with normalized as (
    select
      case
        when s.employee_id is not null then 'e:' || s.employee_id::text
        else 'p:' || s.cabang_id::text || ':' || upper(trim(coalesce(s.provider_name_normalized, s.provider_name_raw, '')))
      end as identity_key,
      s.employee_id,
      coalesce(nullif(trim(s.provider_name_raw), ''), nullif(trim(s.provider_name_normalized), ''), '—') as barber_name,
      s.cabang_id,
      c.nama_cabang,
      coalesce(s.total_service, 0)::numeric as total_service,
      coalesce(s.total_income, 0)::numeric as total_income
    from public.provider_sales_daily_source s
    join public.cabang c
      on c.id = s.cabang_id
     and c.aktif is true
    where s.activity_date = v_date
      and (v_scope = 'GLOBAL' or s.cabang_id = v_cabang_id)
  ),
  aggregated as (
    select
      identity_key,
      employee_id,
      max(barber_name) as barber_name,
      cabang_id,
      max(nama_cabang) as nama_cabang,
      sum(total_service) as total_service,
      sum(total_income) as total_income
    from normalized
    group by identity_key, employee_id, cabang_id
    having sum(total_service) > 0
  ),
  ranked as (
    select
      a.*,
      row_number() over (
        order by a.total_service desc, a.total_income desc, a.barber_name asc
      )::integer as rank_company,
      row_number() over (
        partition by a.cabang_id
        order by a.total_service desc, a.total_income desc, a.barber_name asc
      )::integer as rank_branch
    from aggregated a
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank', case when v_scope = 'GLOBAL' then r.rank_company else r.rank_branch end,
          'rank_company', r.rank_company,
          'rank_branch', r.rank_branch,
          'name', r.barber_name,
          'cabang_id', r.cabang_id,
          'cabang_name', r.nama_cabang,
          'total_service', r.total_service,
          'is_self', r.employee_id = v_employee_id
        )
        order by case when v_scope = 'GLOBAL' then r.rank_company else r.rank_branch end
      ),
      '[]'::jsonb
    ),
    max(case when r.employee_id = v_employee_id
      then case when v_scope = 'GLOBAL' then r.rank_company else r.rank_branch end end),
    coalesce(max(case when r.employee_id = v_employee_id then r.total_service end), 0)
  into v_items, v_self_rank, v_self_total
  from ranked r;

  return jsonb_build_object(
    'ok', true,
    'scope', v_scope,
    'activity_date', v_date,
    'employee_id', v_employee_id,
    'employee_cabang_id', v_cabang_id,
    'self_rank', v_self_rank,
    'self_total_service', v_self_total,
    'items', v_items
  );
end;
$function$;

revoke all on function public.karyawan_barber_ranking_self(text,text,date) from public;
grant execute on function public.karyawan_barber_ranking_self(text,text,date) to anon, authenticated, service_role;
