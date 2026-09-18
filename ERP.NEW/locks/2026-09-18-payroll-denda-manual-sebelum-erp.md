# OWNER PASS + LOCK — Payroll Denda Manual Sebelum ERP

Tanggal persetujuan Owner: 18 September 2026 (WIB).
Repo canonical: `heriherdianto98-bot/ERP-VAX`, branch `main`.

## Keputusan Owner

Owner telah menguji input, penyimpanan, koreksi/edit, dan tampilan Denda Manual Sebelum ERP pada Payroll dan menyatakan **PASS + LOCK**.

- Nominal yang diinput adalah total denda dari catatan manual sebelum ERP yang **belum tercatat di Absensi ERP**, per karyawan dan bulan payroll.
- Total Denda Payroll = Denda Absensi ERP + Denda Manual Sebelum ERP; denda manual mengurangi Gaji Bersih satu kali, tanpa mengubah `absensi.denda`.
- Denda manual disimpan terpisah di `public.payroll_pre_erp_manual_fines` dengan nominal, catatan sumber/periode, dan metadata pembuat/pembaruan; akses tulis hanya Owner sebagaimana RLS yang diterapkan.
- Card KPI Denda tetap ringkas dengan tinggi semula; rincian dan input berada di panel khusus **Denda Manual Sebelum ERP** yang dapat di-collapse.
- Setelah tersimpan, input menjadi mode baca; tombol **Edit Denda** mengaktifkan koreksi, **Batal** memulihkan nilai tersimpan, dan **Simpan Denda** menyimpan perubahan.
- Jalur snapshot dan koreksi historis yang sudah LOCK tidak boleh dimodifikasi oleh fitur ini. Bonus KPI kasir Ultimate yang sebelumnya LOCK juga tetap utuh.

## Baseline yang disetujui

- `ERP.NEW/js/modules/payroll-pre-erp-manual-fine-bridge.js`
- Integrasi script pada `ERP.NEW/pages/payroll-capster.html`, hanya untuk fitur denda manual ini.
- `ERP.NEW/migrations/20260918_payroll_pre_erp_manual_fines.sql` dan tabel yang sudah diterapkan di Supabase.
- Commit implementasi/perbaikan dan UI: `d22058a074ba00e011fb0c612cb0a8cf44ce853c`, `155d2b835f188988fc2c2c6f7dd617238d96f335`, `b869403ed2aebe0a6d2470e82f3e7a3419f36ff4`, `d7bd092d27eace1832d5e70077af379835853a23`, `c335d7b440e61a6283847daf9c541d09af8cbd3b`, `591d9ed8e2964abe3a566726e3f605c68f544c8f`, `69fbb1aea9091a58ffc22924dd30f2e8b486d249`, `36d5e8edb4745ecb4a75d9a90be2febafe9845ec`.

**Jangan ubah modul/aturan yang telah PASS + LOCK tanpa izin unlock eksplisit dari Owner.** Commit LOCK ini hanya menambahkan dokumentasi keputusan; tidak mengubah kode, rumus, atau data gaji.
