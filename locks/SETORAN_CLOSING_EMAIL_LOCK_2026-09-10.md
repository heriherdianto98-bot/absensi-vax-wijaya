# ERP VAX — HARD LOCK ADDENDUM

## SETORAN CLOSING EMAIL

Status: OWNER PASS / HARD LOCK

Verified on:
- 2026-09-10 WIB

Canonical implementation:
- `notification-service/setoran-closing-email.js`

Verified capabilities:
- Mengirim laporan Closing Harian ke email Owner menggunakan notification-service VPS dan SMTP/Brevo existing.
- Recipient Owner menggunakan `MAIL_OWNER` existing; tidak mengubah email login ERP.
- Source data dibaca READ ONLY dari sumber canonical ERP/Supabase.
- Cash Harus Diambil mengikuti basis Setoran yang sudah LOCK.
- BRI Merchant mengikuti `bri_merchant_daily` canonical.
- Cash Out total mengikuti `daily_recap_source.cash_out`.
- Rincian Cash Out meliputi cabang, tanggal, nominal, keterangan, dan kasir/user dengan parser yang mengikuti modul Cash Out existing.
- PDF harian memuat ringkasan seluruh cabang dan rincian Cash Out lengkap.
- PDF final tidak membawa halaman kosong tambahan; footer pagination yang memicu blank pages sudah dihapus.
- Test email untuk tanggal 2026-09-09 berhasil terkirim ke Owner dengan 10 cabang dan data dinyatakan sesuai oleh Owner.

Locked behavior:
- Jangan mengubah rumus/source ownership Setoran, Cash Out, BRI Merchant, DailyDataEngine, SetoranMoneyEngine, Minutes sync, atau Arus Kas dari service ini.
- Service ini harus tetap READ ONLY terhadap source operasional.
- Jangan mengubah recipient Owner, SMTP routing, struktur data laporan, atau format PDF final tanpa explicit Owner unlock.
- Jangan menambahkan kembali footer/pagination yang menghasilkan halaman kosong.
- Perubahan scheduler 23.00 WIB belum termasuk dalam LOCK ini sampai scheduler selesai diuji dan Owner PASS.
- Rekap otomatis 3 harian belum dianggap PASS/LOCK hanya karena engine pendukungnya sudah tersedia; wajib diuji terpisah sebelum di-LOCK.

Security:
- Jangan commit `.env`, SMTP password, Supabase service-role key, token, atau secret lain.
- Runtime VPS tetap `/opt/erp-vax-notification`; canonical source tetap repository ini.

Unlock rule:
- File/behavior di atas hanya boleh diubah setelah Owner secara eksplisit membuka LOCK untuk task terkait.
