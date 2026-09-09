# HARD LOCK — SETORAN CLOSING EMAIL

Status: OWNER PASS / HARD LOCK

Verified on:
- 2026-09-10 WIB

Verified behavior:
- Closing Harian dikirim otomatis ke email Owner melalui VPS `notification-service` dan SMTP/Brevo existing.
- Runtime script: `notification-service/setoran-closing-email.js`.
- Scheduler VPS: `erp-vax-setoran-closing-email.timer`.
- Service VPS: `erp-vax-setoran-closing-email.service`.
- Jadwal final: setiap hari pukul 23.00 WIB (`Asia/Jakarta`).
- Systemd timer telah diverifikasi `active (waiting)` dan next trigger ekuivalen 23.00 WIB.
- Laporan bersifat READ ONLY terhadap source data ERP/Supabase.
- PDF Closing Harian memuat ringkasan 10 cabang dan rincian Cash Out yang sama dengan source existing.
- PDF tidak boleh menghasilkan halaman kosong tambahan.
- Recipient Owner tetap mengikuti `MAIL_OWNER` pada environment VPS; secret tidak boleh masuk repository.
- Existing duplicate-send guard pada script harus dipertahankan.

Locked behavior:
- Jangan ubah jadwal 23.00 WIB tanpa explicit Owner unlock.
- Jangan ubah source/formula Setoran, Cash Out, BRI Merchant, DailyDataEngine, SetoranMoneyEngine, Minutes sync, atau modul finance LOCK saat mengerjakan email closing.
- Jangan menggabungkan service ini ke Master Tagihan atau service invoice yang sudah HARD LOCK.
- Jangan mengubah recipient, SMTP route, PDF data basis, atau duplicate-send guard tanpa explicit Owner unlock.
- Perbaikan presentasi PDF hanya boleh dilakukan bila tidak mengubah angka, source, formula, atau scheduler behavior.

Locked canonical file:
- `notification-service/setoran-closing-email.js`

Runtime deployment reference (VPS):
- `/opt/erp-vax-notification/setoran-closing-email.js`
- `/etc/systemd/system/erp-vax-setoran-closing-email.service`
- `/etc/systemd/system/erp-vax-setoran-closing-email.timer`

Security:
- Jangan commit `.env`, SMTP credentials, Supabase service-role key, WhatsApp access token, atau secret lain.
