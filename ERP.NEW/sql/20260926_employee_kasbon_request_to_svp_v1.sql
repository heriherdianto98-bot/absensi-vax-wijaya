-- ERP VAX WIJAYA
-- Employee Kasbon intake: Karyawan -> SVP -> existing Kasbon SVP -> Owner
-- Applied to production Supabase on 2026-09-26.
-- Existing employee_cash_advances state machine is intentionally not altered.

create table if not exists public.employee_cash_advance_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id bigint not null references public.karyawan(id),
  employee_name_snapshot text not null,
  position_snapshot text not null default '',
  branch_id bigint not null references public.cabang(id),
  branch_name_snapshot text not null,
  request_date date not null default (timezone('Asia/Jakarta', now()))::date,
  requested_amount numeric not null check (requested_amount > 0),
  reason text not null check (char_length(trim(reason)) >= 3),
  request_description text null,
  status text not null default 'MENUNGGU_SVP'
    check (status in ('MENUNGGU_SVP','DITOLAK_SVP','DITERUSKAN_OWNER','DIBATALKAN_KARYAWAN')),
  svp_note text null,
  svp_actor uuid null references auth.users(id),
  svp_action_at timestamptz null,
  converted_kasbon_id uuid null references public.employee_cash_advances(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employee_cash_advance_requests enable row level security;

drop policy if exists ecar_spv_owner_select on public.employee_cash_advance_requests;
create policy ecar_spv_owner_select
on public.employee_cash_advance_requests
for select to authenticated
using (
  public.is_erp_owner()
  or (public.is_erp_spv() and public.erp_is_cabang_operasional(branch_id))
);

drop policy if exists ecar_spv_owner_update on public.employee_cash_advance_requests;
create policy ecar_spv_owner_update
on public.employee_cash_advance_requests
for update to authenticated
using (
  public.is_erp_owner()
  or (public.is_erp_spv() and public.erp_is_cabang_operasional(branch_id))
)
with check (
  public.is_erp_owner()
  or (public.is_erp_spv() and public.erp_is_cabang_operasional(branch_id))
);

create or replace function public.employee_cash_advance_request_submit(
  p_session_token text,
  p_requested_amount numeric,
  p_reason text,
  p_request_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_kid bigint;
  v_emp record;
  v_branch record;
  v_id uuid;
  v_reason text := trim(coalesce(p_reason,''));
  v_desc text := nullif(trim(coalesce(p_request_description,'')),'');
begin
  v_kid := public.karyawan_session_id_from_token(p_session_token);
  if v_kid is null then
    raise exception 'SESSION_REQUIRED: login Karyawan sudah kedaluwarsa. Silakan login ulang.';
  end if;
  if p_requested_amount is null or p_requested_amount <= 0 then
    raise exception 'NOMINAL_INVALID: nominal kasbon harus lebih dari 0.';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'ALASAN_WAJIB: alasan/kebutuhan minimal 3 karakter.';
  end if;

  select k.id,k.nama_karyawan,coalesce(k.jabatan,'') as jabatan,k.cabang_id,k.aktif
    into v_emp
  from public.karyawan k
  where k.id=v_kid and k.aktif is true;

  if v_emp.id is null then
    raise exception 'KARYAWAN_INVALID: karyawan tidak aktif / tidak ditemukan.';
  end if;
  if v_emp.cabang_id is null then
    raise exception 'CABANG_WAJIB: cabang master karyawan belum tersedia.';
  end if;

  select c.id,c.nama_cabang into v_branch
  from public.cabang c
  where c.id=v_emp.cabang_id
    and public.erp_is_cabang_operasional(c.id);

  if v_branch.id is null then
    raise exception 'CABANG_INVALID: pengajuan kasbon hanya dari cabang operasional.';
  end if;

  insert into public.employee_cash_advance_requests(
    employee_id,employee_name_snapshot,position_snapshot,
    branch_id,branch_name_snapshot,requested_amount,reason,request_description,status
  ) values (
    v_emp.id,v_emp.nama_karyawan,v_emp.jabatan,
    v_branch.id,v_branch.nama_cabang,p_requested_amount,v_reason,v_desc,'MENUNGGU_SVP'
  )
  returning id into v_id;

  update public.karyawan_web_session
     set last_seen_at=now()
   where token_hash=public.vax_token_hash(p_session_token);

  return jsonb_build_object(
    'ok',true,'id',v_id,'status','MENUNGGU_SVP',
    'employee_id',v_emp.id,'branch_id',v_branch.id,
    'request_date',(timezone('Asia/Jakarta',now()))::date
  );
end;
$$;

create or replace function public.employee_cash_advance_request_list(p_session_token text)
returns table(
  id uuid, request_date date, requested_amount numeric, reason text,
  request_description text, status text, svp_note text,
  converted_kasbon_id uuid, created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare v_kid bigint;
begin
  v_kid := public.karyawan_session_id_from_token(p_session_token);
  if v_kid is null then
    raise exception 'SESSION_REQUIRED: login Karyawan sudah kedaluwarsa. Silakan login ulang.';
  end if;

  return query
  select r.id,r.request_date,r.requested_amount,r.reason,r.request_description,
         r.status,r.svp_note,r.converted_kasbon_id,r.created_at
  from public.employee_cash_advance_requests r
  where r.employee_id=v_kid
  order by r.created_at desc
  limit 24;
end;
$$;

create or replace function public.employee_cash_advance_request_cancel(
  p_session_token text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_kid bigint;
  v_count int;
begin
  v_kid := public.karyawan_session_id_from_token(p_session_token);
  if v_kid is null then
    raise exception 'SESSION_REQUIRED: login Karyawan sudah kedaluwarsa. Silakan login ulang.';
  end if;

  update public.employee_cash_advance_requests
     set status='DIBATALKAN_KARYAWAN',updated_at=now()
   where id=p_request_id
     and employee_id=v_kid
     and status='MENUNGGU_SVP';
  get diagnostics v_count = row_count;

  if v_count=0 then
    raise exception 'REQUEST_NOT_CANCELLABLE: pengajuan tidak ditemukan atau sudah diproses SVP.';
  end if;

  return jsonb_build_object('ok',true,'id',p_request_id,'status','DIBATALKAN_KARYAWAN');
end;
$$;

create or replace function public.erp_employee_cash_advance_request_review(
  p_request_id uuid,
  p_action text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_req public.employee_cash_advance_requests%rowtype;
  v_action text := upper(trim(coalesce(p_action,'')));
  v_note text := trim(coalesce(p_note,''));
  v_kasbon_id uuid;
begin
  if not (public.is_erp_owner() or public.is_erp_spv()) then
    raise exception 'ACCESS_DENIED: hanya Owner/SPV.';
  end if;

  select * into v_req
  from public.employee_cash_advance_requests
  where id=p_request_id
  for update;

  if v_req.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'MENUNGGU_SVP' then raise exception 'REQUEST_ALREADY_PROCESSED'; end if;

  if public.is_erp_spv() and not public.is_erp_owner()
     and not public.erp_is_cabang_operasional(v_req.branch_id) then
    raise exception 'BRANCH_SCOPE_DENIED';
  end if;

  if v_action='REJECT' then
    if char_length(v_note) < 3 then
      raise exception 'CATATAN_WAJIB: alasan penolakan minimal 3 karakter.';
    end if;
    update public.employee_cash_advance_requests
       set status='DITOLAK_SVP',svp_note=v_note,svp_actor=auth.uid(),
           svp_action_at=now(),updated_at=now()
     where id=v_req.id;
    return jsonb_build_object('ok',true,'id',v_req.id,'status','DITOLAK_SVP');

  elsif v_action='FORWARD' then
    if char_length(v_note) < 3 then
      raise exception 'CATATAN_WAJIB: catatan SVP minimal 3 karakter.';
    end if;

    insert into public.employee_cash_advances(
      employee_id,employee_name_snapshot,position_snapshot,
      branch_id,branch_name_snapshot,request_date,requested_amount,
      reason,request_description,spv_note,spv_recommendation,status
    ) values (
      v_req.employee_id,v_req.employee_name_snapshot,v_req.position_snapshot,
      v_req.branch_id,v_req.branch_name_snapshot,v_req.request_date,v_req.requested_amount,
      v_req.reason,v_req.request_description,v_note,'SETUJUI','MENUNGGU OWNER'
    )
    returning id into v_kasbon_id;

    update public.employee_cash_advance_requests
       set status='DITERUSKAN_OWNER',svp_note=v_note,svp_actor=auth.uid(),
           svp_action_at=now(),converted_kasbon_id=v_kasbon_id,updated_at=now()
     where id=v_req.id;

    return jsonb_build_object(
      'ok',true,'id',v_req.id,'status','DITERUSKAN_OWNER','kasbon_id',v_kasbon_id
    );
  else
    raise exception 'ACTION_INVALID: gunakan FORWARD atau REJECT.';
  end if;
end;
$$;

revoke all on public.employee_cash_advance_requests from anon;
grant select,update on public.employee_cash_advance_requests to authenticated;

revoke all on function public.employee_cash_advance_request_submit(text,numeric,text,text) from public;
revoke all on function public.employee_cash_advance_request_list(text) from public;
revoke all on function public.employee_cash_advance_request_cancel(text,uuid) from public;
grant execute on function public.employee_cash_advance_request_submit(text,numeric,text,text) to anon,authenticated;
grant execute on function public.employee_cash_advance_request_list(text) to anon,authenticated;
grant execute on function public.employee_cash_advance_request_cancel(text,uuid) to anon,authenticated;

revoke all on function public.erp_employee_cash_advance_request_review(uuid,text,text) from public,anon;
grant execute on function public.erp_employee_cash_advance_request_review(uuid,text,text) to authenticated;
