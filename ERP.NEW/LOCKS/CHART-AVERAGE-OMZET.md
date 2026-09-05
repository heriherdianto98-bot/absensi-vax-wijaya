# 🔒 LOCK — Grafik Rata-rata Omzet

Status: OWNER PASS + LOCK

Scope:
- Grafik utama dashboard tetap memakai data dari `DashboardEngine.chartData.aktif`.
- Rata-rata omzet dihitung read-only dari titik data grafik aktif.
- Formula: total seluruh nilai titik grafik / jumlah titik grafik.
- Nilai `0` tetap dihitung bila tanggal tersebut termasuk periode aktif grafik.
- Rata-rata mengikuti filter cabang aktif.
- Rata-rata mengikuti periode aktif.
- Posisi label rata-rata berada di tengah atas grafik.
- Tidak mengubah `DashboardEngine`, rumus KPI, source data, ranking, atau formula bisnis lain.

File implementasi:
- `ERP.NEW/js/modules/chart.js`

Visual yang di-LOCK:
- Label: `Rata-rata Omzet: Rp... / hari`
- Warna gold
- Posisi tengah atas grafik

Jangan diubah kecuali Owner membuka LOCK secara eksplisit.
