# 🔒 LOCK — Absensi Karyawan UI

Tanggal LOCK: 27 September 2026  
Status: **OWNER PASS + LOCK**

## Scope yang dikunci
Tampilan halaman `absensi.html` pada akun Karyawan, termasuk kondisi terakhir yang sudah disetujui Owner:

- Card GPS: posisi teks `Lokasi Anda` + alamat kembali ke posisi canonical/locked.
- Ikon GPS: statis, 3D, tanpa ring/ripple animation.
- Ringkasan 6 card: tampilan compact 3D yang sudah PASS.
- Kalender: tombol di kanan judul `Absensi`, popup bulan Jan–Des + navigasi tahun.
- Bottom navigation: canonical employee bottom nav.
- Scroll/performance UI: override di `absensi-scroll-performance-ui.css`.

## Aturan LOCK
**JANGAN mengubah, menghapus, memindahkan, merestyle, refactor, atau override scope di atas tanpa izin eksplisit Owner (Heri Herdianto).**

Jika task berikutnya berpotensi menyentuh scope LOCK:
1. STOP.
2. Audit read-only.
3. Laporkan dampaknya ke Owner.
4. Tunggu izin eksplisit sebelum perubahan.

## File terkait
- `absensi.html`
- `absensi-main-theme-ui.css`
- `absensi-location-detail-ui.css`
- `absensi-scroll-performance-ui.css`
- `absensi-employee-month-summary-consumer.css`
- `absensi-employee-month-summary-consumer.js`
- `employee-bottomnav-canonical-ui.css`

Catatan: engine Absensi, GPS/geofence, radius, Absen Masuk/Pulang, dan modul Owner tetap dianggap LOCK dan tidak boleh disentuh tanpa izin Owner.


## PASS tambahan — 27 Sep 2026
Owner menyatakan **PASS** untuk tampilan terakhir card profil Absensi setelah kompatibilitas canonical diterapkan.

Kondisi final yang ikut LOCK:
- ukuran nama karyawan pada modul Absensi menggunakan override compact yang sudah disetujui;
- animasi mengetik tetap aktif;
- struktur/card profil canonical tidak boleh diubah tanpa izin Owner;
- file kompatibilitas Absensi: `absensi-profile-canonical-compat-ui.css`;
- versi cache aktif di `absensi.html`: `absensi-profile-canonical-compat-ui.css?v=20260927-2`.

Aturan tetap: **jangan sentuh scope ini tanpa izin eksplisit Owner.**
