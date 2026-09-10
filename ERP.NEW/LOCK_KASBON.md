# LOCK KASBON — OWNER PASS

Tanggal: 2026-09-10
Project: ERP VAX / VAX WIJAYA

Status: 🔒 LOCK

Keputusan Owner:
- Modul Kasbon dinyatakan LOCK.
- Jangan ubah UI, logic, flow approval, pencairan, metode pembayaran, Floating access, outstanding, pembayaran, atau integrasi Kasbon tanpa izin eksplisit Owner.
- Jangan sentuh Arus Kas untuk task Kasbon.
- Arus Kas tetap pada kondisi sebelum eksperimen kolom Kasbon.
- Perubahan lanjutan wajib mengikuti: ONE TASK AT A TIME → test → OWNER PASS → LOCK.

Baseline fungsi yang sudah teruji:
- SVP dapat membuat pengajuan Kasbon.
- Owner dapat approve / kembalikan / tolak.
- Owner dapat mengubah nominal final sebelum approve.
- Floating dapat mengajukan Kasbon melalui cabang operasional.
- Floating mengikuti metode BULANAN.
- Setelah CAIRKAN & AKTIFKAN, Kasbon menjadi AKTIF dan outstanding terisi.
- Pencairan Kasbon yang sudah berjalan tampil di Arus Kas existing tanpa mengubah engine Arus Kas.

Larangan:
- Jangan mengubah engine Arus Kas yang sudah LOCK.
- Jangan membuat eksperimen UI Kasbon di Arus Kas tanpa izin Owner.
- Jangan melakukan dual-write atau perubahan formula saldo.
