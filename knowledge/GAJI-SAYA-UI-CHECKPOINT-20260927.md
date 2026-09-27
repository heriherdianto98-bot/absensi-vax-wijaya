# Gaji Saya — UI Checkpoint 27 Sep 2026

Status: **COMMIT + PUSH CHECKPOINT**

Scope perubahan Gaji Saya yang sudah tersimpan di branch ini:
- Header mengikuti canonical Employee Dashboard.
- Header memuat notifikasi/lonceng dan Inbox.
- Bottom navigation memakai canonical employee bottom nav.
- Tampilan utama Gaji Saya memakai tema Employee Portal putih–teal.
- Halaman dapat di-scroll dengan header sticky/freeze.
- Card profil memakai `employee-profile-canonical-ui.css` + `employee-profile-canonical-ui.js`.
- Data card profil tetap read-only dari session karyawan/master cabang.
- Logic payroll, periode, perhitungan gaji, slip gaji, dan engine terkait tidak diubah.

File utama terkait:
- `gaji-saya.html`
- `gaji-saya-main-theme-ui.css`
- `gaji-saya-canonical-header.css`
- `gaji-saya-profile-ui.js`
- `employee-profile-canonical-ui.css`
- `employee-profile-canonical-ui.js`
- `employee-bottomnav-canonical-ui.css`

Catatan: perubahan ini adalah checkpoint untuk melanjutkan penyempurnaan UI Gaji Saya tanpa kehilangan kondisi saat ini.


## Checkpoint istirahat — 27 Sep 2026
Status terakhir sebelum jeda:
- Gaji Saya sudah memakai header canonical Employee Dashboard.
- Bottom nav sudah canonical.
- Card profil sudah memakai canonical Employee Profile shared.
- Tema utama Gaji Saya sudah putih–teal dan scrollable dengan header freeze.
- Pemilihan periode sudah diubah menjadi berbasis bulan.
- UI terbaru Pilih Bulan:
  - 3 card bulan terbaru: bulan sekarang, 1 bulan lalu, 2 bulan lalu;
  - card ke-4: **Lainnya**;
  - popup bulan lengkap Jan–Des hanya muncul saat **Lainnya** diklik;
  - perbandingan memakai **Bulan Dipilih** vs **Bulan Sebelumnya**.
- Logic payroll utama tetap memakai RPC existing `karyawan_gaji_capster_self`; tidak dibuat engine payroll baru.
- Absensi profile card terakhir sudah PASS + LOCK; jangan disentuh tanpa izin Owner.

Commit UI Pilih Bulan terbaru saat checkpoint:
- `124cea3cb6816f8db319c2dccf524ffc9a52f836`

Branch kerja:
- `feature/employee-profile-canonical-20260927`

Lanjut berikutnya dari checkpoint ini.
