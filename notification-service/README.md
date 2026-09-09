# ERP VAX Notification Service

Service terpisah untuk reminder email ERP VAX. Tahap pertama hanya membaca `master_tagihan` dari Supabase dan mengirim ringkasan H-3, H-2, H-1, dan hari H ke Owner + SVP.

## Prinsip safety
- READ ONLY terhadap data ERP.
- Tidak mengubah Arus Kas, Setoran 3 Harian, Cash Out, Minutes, formula, approval, atau engine LOCK.
- Secret tidak boleh masuk GitHub. Simpan `.env` hanya di VPS.

## Sender yang disiapkan
`notification@vaxwijaya.com`

## Google Workspace / Gmail
Akun `notification@vaxwijaya.com` harus dibuat di Google Workspace untuk domain `vaxwijaya.com`, lalu DNS/MX domain diarahkan sesuai nilai yang diberikan Google Workspace. Setelah mailbox aktif, aktifkan 2-Step Verification dan buat App Password bila kebijakan Workspace mengizinkan. App Password hanya disimpan di `.env` VPS.

## VPS setup
```bash
cd /path/to/ERP-VAX/notification-service
npm install
cp .env.example .env
nano .env
npm run test-email
npm run dry-run
npm run run
```

## Cron harian 08:00 WIB
Pastikan timezone VPS/cron sesuai atau gunakan `CRON_TZ=Asia/Jakarta`:
```cron
CRON_TZ=Asia/Jakarta
0 8 * * * cd /path/to/ERP-VAX/notification-service && /usr/bin/node master-tagihan-email.js >> /var/log/erp-vax-notification.log 2>&1
```

## Email format
- Header ERP VAX WIJAYA dark/gold.
- Reminder dikelompokkan berdasarkan kedekatan jatuh tempo.
- H-3/H-2 gold, H-1 oranye, hari H merah.
- Menampilkan kategori, cabang, tanggal jatuh tempo, nominal, total kewajiban, dan tombol menuju Master Tagihan.
- Satu email ringkasan per run, bukan satu email per tagihan.

## Environment penting
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_USER=notification@vaxwijaya.com`
- `SMTP_PASS`
- `MAIL_OWNER`
- `MAIL_SVP`
- `ERP_BASE_URL=https://erp-test.vaxwijaya.com`

## Belum dilakukan
Pembuatan akun Google Workspace dan perubahan MX/DNS Hostinger tidak dapat dilakukan dari source code repo; langkah tersebut membutuhkan akses admin domain/Google Workspace dan kemungkinan verifikasi/pembayaran.
