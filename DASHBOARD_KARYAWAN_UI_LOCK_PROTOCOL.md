# Dashboard Karyawan — UI LOCK Protocol

Status: active.

LOCK berarti komponen tidak boleh berubah secara langsung maupun terkena override tidak langsung dari CSS/JS lain tanpa izin eksplisit Owner.

## Aturan

1. Semua pekerjaan UI baru dimulai di branch terpisah.
2. Sebelum mengubah shared CSS/JS, cek `dashboard-karyawan-ui-locks.json`.
3. Dilarang memakai selector global/broad yang dapat mengenai komponen LOCK.
4. File dedicated LOCK diblok penuh.
5. Shared file dijaga berdasarkan selector/token komponen.
6. Sebelum masuk `main`, diff wajib diperiksa terhadap registry LOCK.
7. Komponen LOCK hanya boleh dibuka dengan izin eksplisit Owner dan commit harus memakai token `UI-UNLOCK=<component>`.
8. Setelah Owner PASS, kondisi final kembali menjadi baseline LOCK.

## Komponen yang saat ini dilindungi

- header
- profile
- sync_cards
- period_calendar
- target_anda
- performa_today
- performa_chart

Workflow GitHub menjalankan guard pada pull request dan push ke `main`. Perubahan tanpa unlock pada area terlindungi akan gagal.
