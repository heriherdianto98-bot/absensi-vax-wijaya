-- Evaluation streak fix: count only complete, non-seasonal finalized months.
create or replace function public.karyawan_income_target_status_self(
  p_token text,
  p_month date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_employee_id bigint;
  v_payload jsonb;
  v_last_success date;
  v_miss_streak integer := 0;
begin
  v_employee_id := public.karyawan_session_id_from_token(p_token);
  if v_employee_id is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  v_payload := public.karyawan_income_target_self(p_token,p_month);
  if coalesce((v_payload->>'ok')::boolean,false) is not true then
    return v_payload;
  end if;

  select max(month_start) into v_last_success
  from public.karyawan_income_target_monthly
  where employee_id=v_employee_id
    and status='FINAL'
    and data_complete=true
    and seasonal_flag=false
    and achievement_pct>=100;

  select count(*)::integer into v_miss_streak
  from public.karyawan_income_target_monthly
  where employee_id=v_employee_id
    and status='FINAL'
    and data_complete=true
    and seasonal_flag=false
    and achievement_pct<100
    and (v_last_success is null or month_start>v_last_success);

  return v_payload || jsonb_build_object(
    'miss_streak',v_miss_streak,
    'evaluation_required',v_miss_streak>=3,
    'evaluation_message',case
      when v_miss_streak>=3 then v_miss_streak||' bulan normal berturut-turut belum mencapai target. Evaluasi diperlukan.'
      when v_miss_streak=2 then '2 bulan normal berturut-turut belum mencapai target.'
      when v_miss_streak=1 then 'Bulan normal terakhir belum mencapai target.'
      else null
    end
  );
end;
$function$;

revoke all on function public.karyawan_income_target_status_self(text,date) from public;
grant execute on function public.karyawan_income_target_status_self(text,date) to anon,authenticated,service_role;
