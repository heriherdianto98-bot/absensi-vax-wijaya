# LOCK KASBON — OWNER PASS

Tanggal: 2026-09-11
Project: ERP VAX / VAX WIJAYA

Status: 🔒 LOCK

Keputusan Owner:
- Modul Kasbon dinyatakan LOCK.
- Jangan ubah UI, logic, flow approval, pencairan, metode pembayaran, Floating access, outstanding, pembayaran, atau integrasi Kasbon tanpa izin eksplisit Owner.
- Jangan sentuh engine/formula Arus Kas yang sudah LOCK.
- Perubahan lanjutan wajib mengikuti: ONE TASK AT A TIME → test → OWNER PASS → LOCK.

Baseline fungsi yang sudah teruji:
- SVP dapat membuat pengajuan Kasbon.
- Owner dapat approve / kembalikan / tolak.
- Owner dapat mengubah nominal final sebelum approve.
- Floating dapat mengajukan Kasbon melalui cabang operasional.
- Floating mengikuti metode BULANAN.
- Setelah CAIRKAN & AKTIFKAN, Kasbon menjadi AKTIF dan outstanding terisi.
- Pencairan Kasbon otomatis tercatat sebagai Arus Kas OUT dari KAS_BESAR tanpa mengubah engine Arus Kas.

OWNER PASS — KASBON BULANAN ↔ PAYROLL — 2026-09-11:
- Kasbon BULANAN tetap menjadi potongan payroll pada periode terkait walaupun status Kasbon sudah LUNAS.
- Formula Payroll core tetap LOCK dan tidak diubah: Gaji Bersih = Gaji Pokok - Denda - Kasbon + Bonus Insentif + Bonus KPI + Bonus Produk.
- Kasbon BULANAN tidak mengubah angka Gaji Pokok; nominal Kasbon tampil sebagai komponen potongan tersendiri dan mengurangi Gaji Bersih.
- Kasbon BULANAN yang LUNAS tetap tercatat pada payroll bulan pencairan / periode terkait.
- Jika ada history pembayaran PAYROLL, payroll memakai history tersebut sebagai sumber historis potongan.
- Jika belum ada history PAYROLL dan outstanding masih > 0, payroll memakai current_outstanding.
- Jika status sudah LUNAS, outstanding 0, dan belum ada history PAYROLL, fallback memakai approved_amount hanya pada bulan pencairan agar potongan tidak hilang dan tidak terbawa ke bulan berikutnya.
- Kasbon HARIAN tidak masuk potongan payroll; pembayaran HARIAN tetap melalui alur SVP/Owner.
- Pelunasan Kasbon BULANAN via payroll tidak membuat Arus Kas masuk kembali ke KAS_BESAR; pencairan awal tetap mengurangi KAS_BESAR.
- Test Owner PASS: Naufal / Kasir / Vax wijaya soklat / Sep 2026 — Gaji Pokok Rp333.330, Kasbon Rp100.000, Bonus Produk Rp5.000, Gaji Bersih Rp238.330 tetap benar walaupun Kasbon berstatus LUNAS.

Baseline file terkait LOCK:
- ERP.NEW/js/modules/payroll-kasbon-monthly-bridge.js — Payroll Kasbon Monthly Bridge V3.
- ERP.NEW/pages/payroll-capster.html — cache key bridge V3.
- ERP.NEW/migrations/20260911_kasbon_monthly_no_arus_kas_v2.sql — PAYROLL/BULANAN tidak posting cash-in ke KAS_BESAR.

Larangan:
- Jangan mengubah engine Arus Kas yang sudah LOCK.
- Jangan mengubah formula Payroll core untuk task Kasbon tanpa izin Owner.
- Jangan membuat eksperimen UI Kasbon di Arus Kas tanpa izin Owner.
- Jangan melakukan dual-write atau perubahan formula saldo.
- Jangan mengubah rule Kasbon BULANAN ↔ Payroll yang sudah OWNER PASS tanpa izin eksplisit Owner.
