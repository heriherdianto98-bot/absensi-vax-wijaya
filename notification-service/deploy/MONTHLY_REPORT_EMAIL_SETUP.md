# Laporan Bulanan → Email SVP (deploy terpisah)

Fitur ini **belum aktif** hanya dengan git pull. Verifikasi VPS, Chromium, dan Nginx terlebih dahulu. Jangan mengubah `setoran-closing-email.js`, cron 23.00 WIB, ataupun service invoice existing.

1. Audit read-only lokasi notification service yang aktif (contoh repo menggunakan `/opt/erp-vax-notification`) dan cek `.env` SMTP yang sudah dipakai email closing. Jangan cetak isi `.env`/secret.
2. Pastikan binary Chromium ada di VPS; set `MONTHLY_PDF_CHROMIUM_PATH` pada `.env` jika bukan `/usr/bin/chromium`. Paket `playwright-core` hanya menjadi controller, tidak mengunduh Chromium.
3. Pasang **file baru saja**: `monthly-report-email-api.js`, dependency `playwright-core`, dan unit `deploy/erp-vax-monthly-report-email.service` ke direktori notification aktif. Jangan overwrite file service lama atau menjalankan deploy massal.
4. Verifikasi izin baca source dan `.env` melalui systemd, karena service baru berjalan sebagai `www-data`; jalankan `systemctl daemon-reload`, lalu enable/start **service baru saja**. Cek `curl -fsS http://127.0.0.1:8795/health`.
5. Tambahkan **hanya** dua location pada `deploy/nginx-monthly-report-email.conf` ke server block ERP aktif. Backup dahulu, jalankan `nginx -t`, baru reload bila PASS. Pastikan tidak menimpa route lama.
6. Uji API tanpa pengiriman: `GET /api/monthly-report/health`, akses tanpa token harus 403, serta owner-only. Pengiriman PDF riil ke SVP hanya boleh diuji setelah Owner memberi persetujuan untuk email uji.

Endpoint: `POST /api/monthly-report/email-svp`. Tujuan dibatasi tetap ke `speedrangga59@gmail.com` di backend; data PDF dibuat dari markup A4 yang sama dengan tombol PDF. Browser server dilarang menjalankan JS dan mengambil resource jaringan dari dokumen. SMTP memakai konfigurasi notifikasi existing; cron closing tetap terpisah.

Jika Chromium tidak bisa dijalankan sebagai non-root dengan konfigurasi VPS, **jangan** ubah user/service existing atau mematikan proteksi sistem. Laporkan hasil audit dan tentukan pemasangan browser yang aman terlebih dahulu.
