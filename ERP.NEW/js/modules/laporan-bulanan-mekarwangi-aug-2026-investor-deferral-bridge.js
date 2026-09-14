"use strict";

/*
VAX ERP — Mekarwangi Aug 2026 Investor Rent Deferral Bridge
CONSUMER-ONLY / HISTORICAL PERIOD RULE.

Scope:
- Cabang Mekarwangi (id 10)
- 2026-08-01 s.d. 2026-08-31 only

Owner rule:
- Beban sewa tetap masuk P&L.
- Karena laba dasar pembagian <= 0, tidak ada bagi hasil investor/manajemen.
- Sewa investor bulanan tidak dianggap kas dibayar pada bulan rugi.
- Nilai sewa tetap dicatat sebagai hak/kewajiban tertunda.
- Tidak mengubah master sewa, Arus Kas, Cash Out, Payroll, atau engine LOCK.
*/
(() => {
  if(typeof window==="undefined" || window.__VAX_MEKARWANGI_AUG2026_INVESTOR_DEFERRAL__) return;
  window.__VAX_MEKARWANGI_AUG2026_INVESTOR_DEFERRAL__=true;

  const api=window.LaporanBulananConsumer;
  if(!api || typeof api.loadMonth!=="function" || api.loadMonth.__mekarwangiAug2026InvestorDeferral) return;

  const baseLoad=api.loadMonth.bind(api);
  const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0;};

  function isTarget(report){
    return Number(report?.branch?.id||0)===10
      && String(report?.range?.start||"").slice(0,10)==="2026-08-01"
      && String(report?.range?.end||"").slice(0,10)==="2026-08-31";
  }

  const wrapped=async function(args={}){
    const report=await baseLoad(args);
    if(!isTarget(report) || !report?.investor) return report;

    const rent=num(report.investor.sewaDibayar);
    const base=num(report.investor.labaDasarPembagian);
    const shouldDefer=base<=0;

    report.investor.sewaKewajiban=rent;
    report.investor.sewaDibayarAktual=shouldDefer?0:rent;
    report.investor.sewaDitangguhkan=shouldDefer?rent:0;
    report.investor.statusPembayaranSewa=shouldDefer?"DITANGGUHKAN_KARENA_RUGI":"DIBAYAR";

    if(shouldDefer){
      report.investor.nilaiInvestor=0;
      report.investor.nilaiManajemen=0;
      report.investor.bagiHasil=0;
      report.investor.totalHakBulanIni=0;
    }

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.mekarwangiAug2026InvestorDeferral={
      applied:true,
      period:"2026-08",
      branchId:10,
      labaDasarPembagian:base,
      bebanSewaTetapDiPnl:true,
      sewaKewajiban:rent,
      sewaDibayarAktual:report.investor.sewaDibayarAktual,
      sewaDitangguhkan:report.investor.sewaDitangguhkan,
      status:report.investor.statusPembayaranSewa
    };

    return report;
  };

  Object.defineProperty(wrapped,"__mekarwangiAug2026InvestorDeferral",{value:true});
  api.loadMonth=wrapped;
})();
