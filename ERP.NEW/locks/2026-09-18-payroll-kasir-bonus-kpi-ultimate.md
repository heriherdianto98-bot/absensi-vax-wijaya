# OWNER PASS + LOCK — Payroll Kasir Bonus KPI Ultimate

Tanggal persetujuan Owner: 18 September 2026 (WIB).
Repo canonical: `heriherdianto98-bot/ERP-VAX`, branch `main`.

## Keputusan Owner

Owner menyatakan telah menguji seluruh alur dan memberikan **PASS + LOCK** untuk Bonus KPI otomatis kasir berdasarkan pencapaian Target Ultimate bulanan cabang.

- Berlaku untuk karyawan dengan jabatan Kasir pada cabang dan bulan payroll yang dipilih.
- Target berasal dari `kpi_ultimate_monthly_target`; realisasi dari sumber KPI Ultimate yang sudah berlaku (`kpi_ultimate_sales_source`, lima paket canonical).
- Saat target Ultimate tercapai, Bonus KPI efektif Rp150.000 **menggantikan**, bukan ditambahkan ke, Bonus KPI manual.
- Bonus KPI manual yang pernah tersimpan tidak dihapus atau ditimpa; ketika belum tercapai, jalur manual tetap berlaku.
- Angka efektif konsisten pada card Bonus KPI, Gaji Bersih, dan Print/PDF.
- Snapshot payroll historis dan koreksi historis yang sudah LOCK tidak boleh diubah oleh bonus otomatis.

## Baseline kode yang disetujui

- `ERP.NEW/js/modules/payroll-cashier-ultimate-bonus-bridge.js`
- Integrasi script di `ERP.NEW/pages/payroll-capster.html`
- Commit implementasi: `4041b8b6c6b71d3090fc418ac1550948a1f432d9`, `18fc00e09adf2a1ffdb68859302f80249472c9fc`, `105c53fd36b3305fbeb9a25a71085a22944057e7`, `1eeff6da21c5fe44f3dda8dbaca3c94cbfcf6eac`.

**Jangan ubah modul/aturan ini tanpa izin unlock eksplisit dari Owner.** Catatan LOCK ini hanya dokumentasi keputusan Owner; tidak mengubah engine payroll, KPI Ultimate, database, atau data gaji.
