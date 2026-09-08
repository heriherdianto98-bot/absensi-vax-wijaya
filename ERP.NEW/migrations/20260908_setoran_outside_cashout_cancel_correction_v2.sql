-- VAX ERP — Setoran 3 Harian Outside Cashout Correction V2
-- Additive correction workflow only. Allows SVP to cancel a disputed outside-Cashout cost
-- by resubmitting nominal 0 with reason + NEW proof. Does not alter canonical money engines/formulas.

create or replace function public.vax_request_outside_cashout_correction(
  p_setoran_id uuid,
  p_note text
)
returns public.setoran_3_harian
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(coalesce(public.vax_setoran_actor_role(), ''));
  v_row public.setoran_3_harian%rowtype;
begin
  if v_role <> 'owner' then
    raise exception 'Koreksi biaya di luar Cashout hanya dapat diminta Owner.';
  end if;
  if nullif(btrim(coalesce(p_note,'')), '') is null then
    raise exception 'Catatan koreksi Owner wajib diisi.';
  end if;

  select * into v_row from public.setoran_3_harian where id = p_setoran_id for update;
  if not found then raise exception 'Data setoran tidak ditemukan.'; end if;

  -- Permintaan pertama tetap hanya untuk baris yang punya biaya.
  -- Setelah SVP membatalkan biaya menjadi 0 dan mengirim ulang, Owner masih boleh minta koreksi lagi.
  if coalesce(v_row.outside_cashout_cost,0) <= 0
     and coalesce(v_row.outside_correction_status,'NONE') <> 'RESUBMITTED' then
    raise exception 'Cabang ini tidak memiliki biaya di luar Cashout.';
  end if;
  if coalesce(v_row.taken_status,'BELUM DIAMBIL') <> 'SUDAH DIAMBIL' then
    raise exception 'Setoran harus berstatus Sudah Diambil terlebih dahulu.';
  end if;
  if coalesce(v_row.owner_verified,false) then
    raise exception 'Setoran yang sudah Owner Verified tidak dapat dikirim untuk koreksi.';
  end if;

  update public.setoran_3_harian
  set outside_correction_status='REQUESTED',
      outside_correction_note=btrim(p_note),
      outside_correction_requested_at=now(),
      outside_correction_requested_by=auth.uid(),
      outside_correction_resubmitted_at=null,
      outside_correction_resubmitted_by=null,
      updated_by=auth.uid(),
      updated_at=now()
  where id=p_setoran_id
  returning * into v_row;

  return v_row;
end
$$;

create or replace function public.vax_resubmit_outside_cashout_correction(
  p_setoran_id uuid
)
returns public.setoran_3_harian
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(coalesce(public.vax_setoran_actor_role(), ''));
  v_row public.setoran_3_harian%rowtype;
  v_has_fresh_proof boolean := false;
begin
  if v_role <> 'svp' then
    raise exception 'Kirim ulang koreksi biaya hanya dapat dilakukan SVP.';
  end if;

  select * into v_row from public.setoran_3_harian where id = p_setoran_id for update;
  if not found then raise exception 'Data setoran tidak ditemukan.'; end if;
  if coalesce(v_row.outside_correction_status,'NONE') <> 'REQUESTED' then
    raise exception 'Tidak ada permintaan koreksi biaya yang aktif.';
  end if;
  if coalesce(v_row.outside_cashout_cost,0) < 0 then
    raise exception 'Nominal biaya di luar Cashout tidak valid.';
  end if;
  if nullif(btrim(coalesce(v_row.outside_cashout_note, v_row.non_cash_note, v_row.spv_note, '')), '') is null then
    raise exception 'Keterangan biaya di luar Cashout wajib diisi.';
  end if;

  -- Koreksi selalu wajib memakai foto OUTSIDE_CASHOUT BARU setelah permintaan Owner.
  select exists(
    select 1 from public.setoran_3_harian_proofs p
    where p.setoran_id=v_row.id
      and upper(coalesce(p.proof_kind,''))='OUTSIDE_CASHOUT'
      and p.uploaded_at > coalesce(v_row.outside_correction_requested_at, '-infinity'::timestamptz)
  ) into v_has_fresh_proof;
  if not v_has_fresh_proof then
    raise exception 'Foto bukti terbaru biaya di luar Cashout wajib dilampirkan sebelum Kirim Ulang.';
  end if;

  update public.setoran_3_harian
  set outside_correction_status='RESUBMITTED',
      outside_correction_resubmitted_at=now(),
      outside_correction_resubmitted_by=auth.uid(),
      updated_by=auth.uid(),
      updated_at=now()
  where id=p_setoran_id
  returning * into v_row;

  return v_row;
end
$$;

revoke all on function public.vax_request_outside_cashout_correction(uuid,text) from public;
revoke all on function public.vax_request_outside_cashout_correction(uuid,text) from anon;
revoke all on function public.vax_resubmit_outside_cashout_correction(uuid) from public;
revoke all on function public.vax_resubmit_outside_cashout_correction(uuid) from anon;
grant execute on function public.vax_request_outside_cashout_correction(uuid,text) to authenticated;
grant execute on function public.vax_resubmit_outside_cashout_correction(uuid) to authenticated;
