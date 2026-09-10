-- ERP VAX — Master Karyawan contact fields
-- Existing rows remain compatible; UI requires these fields for new employees.

alter table public.karyawan
  add column if not exists no_hp_wa text,
  add column if not exists alamat_ktp text;

comment on column public.karyawan.no_hp_wa is
  'Nomor HP/WhatsApp karyawan untuk master data ERP.';

comment on column public.karyawan.alamat_ktp is
  'Alamat karyawan sesuai KTP untuk master data ERP.';
