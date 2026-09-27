# Owner & SVP Identity Mapping — Checkpoint 28 Sep 2026

Status: **APPLIED IN SUPABASE + SAVED AS REPO CHECKPOINT**

Project Supabase:
- `absensi-vax-wijaya`
- Project ref: `cmtuufwzjshixivykbjf`

## Kondisi final

### Owner
- Profile nama: `Heri Herdianto`
- Role: `owner`
- Mapping canonical: `profiles.karyawan_id = 53`
- Record karyawan:
  - `id = 53`
  - `nama_karyawan = Heri Herdianto`
  - `jabatan = Owner`
  - `aktif = false`
  - foto tersedia
- Owner tidak lagi menumpang pada record `karyawan_id = 1`.

### Agung Permana
- Tetap memakai `karyawan_id = 1`.
- Record Agung tidak diubah sebagai bagian dari perbaikan mapping Owner.

### SVP
- Profile nama: `Speedrangga`
- Role: `svp`
- Mapping canonical: `profiles.karyawan_id = 39`
- Record karyawan:
  - `id = 39`
  - `nama_karyawan = Rangga`
  - `jabatan = Supervisor`
- SVP tidak lagi menumpang pada `karyawan_id = 2` / Angga.

## Perbaikan database yang ikut dilakukan
- Sequence `public."Karyawan_id_seq"` disinkronkan ke `max(public.karyawan.id)` sebelum membuat record Owner baru.
- Tujuan: mencegah duplicate primary key saat insert record karyawan berikutnya.

## Batas perubahan
- Tidak mengubah engine ERP.
- Tidak mengubah logic Absensi.
- Tidak mengubah logic Payroll.
- Tidak mengubah modul UI yang sudah LOCK.
- Perubahan hanya pada mapping identitas `public.profiles.karyawan_id`, record identitas Owner di `public.karyawan`, dan sinkronisasi sequence ID.

## Aturan lanjutan
- Jangan kembalikan Owner ke `karyawan_id = 1`.
- Jangan kembalikan SVP Speedrangga ke `karyawan_id = 2`.
- Untuk UI/profile, baca foto dan identitas melalui mapping profile → karyawan yang sudah benar.
