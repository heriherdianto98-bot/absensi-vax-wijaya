create or replace function public.erp_read_locked_payroll_snapshot_v3(
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  begin
    v_result := public.erp_read_locked_payroll_snapshot_v2(p_period_start,p_period_end);
    return v_result;
  exception when others then
    if position('LOCKED_SNAPSHOT_NOT_FOUND' in coalesce(sqlerrm,'')) > 0 then
      return jsonb_build_object(
        'status','NOT_FOUND',
        'source','LIVE',
        'historical_locked',false,
        'period_start',p_period_start,
        'period_end',p_period_end
      );
    end if;
    raise;
  end;
end;
$function$;

revoke all on function public.erp_read_locked_payroll_snapshot_v3(date,date) from public;
grant execute on function public.erp_read_locked_payroll_snapshot_v3(date,date) to authenticated;
grant execute on function public.erp_read_locked_payroll_snapshot_v3(date,date) to service_role;
