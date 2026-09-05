# 🔒 LOCK — Cash Out Warning

Status: OWNER PASS + LOCK

Scope locked:
- Global Cash Out Warning Card on ERP Dashboard
- Threshold: individual Cash Out > Rp205.000
- Applies to all operational branches
- Uses individual Cash Out items from daily_recap_source.keterangan_cash_out, not total daily cash_out
- Displays Cabang, Nominal, Keterangan, Kasir/User, and Tanggal
- Default compact view with “Lihat semua warning” / “Ringkas kembali”
- Warning table header background and final approved UI
- Read-only monitoring only; no transaction blocking and no formula/engine changes

Locked implementation files:
- ERP.NEW/js/modules/cashout-warning.js
- ERP.NEW/styles/cashout-warning.css
- ERP.NEW/js/modules/activity.js (mount/bootstrap only)

Owner rule: do not modify this locked scope unless Owner explicitly reopens the LOCK.
