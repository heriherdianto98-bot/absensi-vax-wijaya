# 🔒 LOCK — Master Sewa & Investor

Status: **OWNER PASS + LOCK**
Tanggal lock: 2026-09-12

## Scope yang dikunci
- `ERP.NEW/pages/master-sewa-investor.html`
- `ERP.NEW/js/modules/master-sewa-investor.js`
- `ERP.NEW/js/modules/master-sewa-investor-calendar-ui.js`
- `ERP.NEW/styles/master-sewa-investor.css`
- `ERP.NEW/styles/master-sewa-investor-kasbon-ui.css`
- `ERP.NEW/styles/master-sewa-investor-table-header-ui.css`
- `ERP.NEW/styles/master-sewa-investor-editor-ui.css`
- `ERP.NEW/styles/master-sewa-investor-calendar-ui.css`
- struktur dan RPC Master Sewa / Master Investor yang sudah dipakai modul ini

## Keputusan final
- Master Biaya Sewa dan Master Investor editable dari UI.
- Perubahan memakai tanggal efektif dan menyimpan histori lama.
- Master Sewa aktif: 10 cabang.
- Master Investor aktif: 9 cabang.
- BARSEL hanya ada di Master Sewa, tidak ada di Master Investor.
- Popup tanggal memakai custom calendar.
- Master Investor histori lama memakai status `NONAKTIF`, record baru `AKTIF`.
- Header memakai global header ERP.
- UI mengikuti visual dark premium ERP VAX.

## Data final yang sudah diverifikasi setelah test
- AR Hakim sewa aktif kembali **Rp1.250.000** mulai 2026-09-12.
- AR Hakim investor aktif kembali **60%** mulai 2026-09-12.

## Aturan LOCK
Jangan ubah file, RPC, schema, formula, histori, atau UI pada scope ini tanpa izin eksplisit Owner.
Perubahan modul lain tidak boleh merusak source of truth Master Sewa & Investor ini.
