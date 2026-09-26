-- Employee Kasbon: expose canonical Kasbon status to employee + unread disbursement notification.
-- Applied to production Supabase on 2026-09-26.
-- Existing disbursement and Arus Kas engines are not changed.

create table if not exists public.employee_kasbon_notification_reads (
  employee_id bigint not null references public.karyawan(id) on delete cascade,
  request_id uuid not null references public.employee_cash_advance_requests(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(employee_id,request_id)
);

alter table public.employee_kasbon_notification_reads enable row level security;
revoke all on public.employee_kasbon_notification_reads from anon, authenticated;

drop function if exists public.employee_cash_advance_request_list(text);
create function public.employee_cash_advance_request_list(p_session_token text)
returns table(
  id uuid,
  request_date date,
  requested_amount numeric,
  reason text,
  request_description text,
  status text,
  svp_note text,
  converted_kasbon_id uuid,
  created_at timestamptz,
  kasbon_status text,
  approved_amount numeric,
  disbursement_date date,
  owner_note text,
  current_outstanding numeric,
  total_paid numeric
)
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare v_kid bigint;
begin
  v_kid := public.karyawan_session_id_from_token(p_token);
  if v_kid is null then
    raise exception 'SESSION_REQUIRED: login Karyawan sudah kedaluwarsa. Silakan login ulang.';
  end if;

  return query
  select
    r.id,r.request_date,r.requested_amount,r.reason,r.request_description,
    r.status,r.svp_note,r.converted_kasbon_id,r.created_at,
    e.status,e.approved_amount,e.disbursement_date,e.owner_note,
    e.current_outstanding,e.total_paid
  from public.employee_cash_advance_requests r
  left join public.employee_cash_advances e on e.id=r.converted_kasbon_id
  where r.employee_id=v_kid
  order by r.created_at desc
  limit 24;
end;
$$;

revoke all on function public.employee_cash_advance_request_list(text) from public;
grant execute on function public.employee_cash_advance_request_list(text) to anon,authenticated;

create or replace function public.employee_kasbon_notifications_self(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare v_kid bigint; v_items jsonb;
begin
  v_kid := public.karyawan_session_id_from_token(p_token);
  if v_kid is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_items
  from (
    select
      r.id request_id,
      'KASBON'::text jenis,
      'Kasbon sudah dicairkan'::text judul,
      (
        'Kasbon ' ||
        to_char(coalesce(e.approved_amount,e.requested_amount,0),'FM999G999G999G990') ||
        ' telah dicairkan dan statusnya aktif.'
      )::text ringkasan,
      coalesce(
        (e.disbursement_date::timestamp at time zone 'Asia/Jakarta'),
        e.updated_at,
        r.updated_at
      ) created_at
    from public.employee_cash_advance_requests r
    join public.employee_cash_advances e on e.id=r.converted_kasbon_id
    left join public.employee_kasbon_notification_reads b
      on b.employee_id=v_kid and b.request_id=r.id
    where r.employee_id=v_kid
      and e.status in ('DICAIRKAN','AKTIF')
      and e.disbursement_date is not null
      and b.request_id is null
      and coalesce(e.disbursement_date,e.request_date) >=
          ((timezone('Asia/Jakarta',now()))::date - 30)
  ) x;

  return jsonb_build_object('ok',true,'items',v_items);
end;
$$;

create or replace function public.employee_kasbon_notification_read(
  p_token text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare v_kid bigint;
begin
  v_kid := public.karyawan_session_id_from_token(p_token);
  if v_kid is null then
    return jsonb_build_object('ok',false,'reason','SESSION_INVALID');
  end if;

  if not exists(
    select 1
    from public.employee_cash_advance_requests r
    join public.employee_cash_advances e on e.id=r.converted_kasbon_id
    where r.id=p_request_id
      and r.employee_id=v_kid
      and e.status in ('DICAIRKAN','AKTIF')
      and e.disbursement_date is not null
  ) then
    return jsonb_build_object('ok',false,'reason','NOT_FOUND');
  end if;

  insert into public.employee_kasbon_notification_reads(employee_id,request_id,read_at)
  values(v_kid,p_request_id,now())
  on conflict(employee_id,request_id)
  do update set read_at=excluded.read_at;

  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.employee_kasbon_notifications_self(text) from public;
revoke all on function public.employee_kasbon_notification_read(text,uuid) from public;
grant execute on function public.employee_kasbon_notifications_self(text) to anon,authenticated;
grant execute on function public.employee_kasbon_notification_read(text,uuid) to anon,authenticated;
