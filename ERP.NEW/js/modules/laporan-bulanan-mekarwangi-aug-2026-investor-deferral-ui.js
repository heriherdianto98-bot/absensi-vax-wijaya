"use strict";

/* UI-only label patch for Mekarwangi Aug 2026 investor rent deferral. */
(() => {
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));

  function isTarget(report){
    return Number(report?.branch?.id||0)===10
      && String(report?.range?.start||"").slice(0,10)==="2026-08-01"
      && String(report?.range?.end||"").slice(0,10)==="2026-08-31"
      && report?.investor?.statusPembayaranSewa==="DITANGGUHKAN_KARENA_RUGI";
  }

  function patch(report){
    if(!isTarget(report)) return;
    const host=document.getElementById("lbInvestorLines");
    if(!host) return;

    const lines=[...host.querySelectorAll(".lb-line")];
    for(const line of lines){
      const span=line.querySelector("span");
      const strong=line.querySelector("strong");
      const label=String(span?.textContent||"").trim();
      if(label==="Sewa Dibayar"){
        span.textContent="Kewajiban Sewa Investor";
        if(strong) strong.textContent=money(report.investor.sewaKewajiban);
      }
    }

    const rights=[...host.querySelectorAll(".lb-investor-rights-card")];
    const investorCard=rights.find(card=>/Hak Investor/i.test(card.querySelector("span")?.textContent||""));
    if(investorCard){
      const strong=investorCard.querySelector("strong");
      const small=investorCard.querySelector("small");
      if(strong) strong.textContent=money(0);
      if(small) small.textContent="Tidak dibayar bulan ini · sewa ditangguhkan karena cabang rugi";
    }

    if(!host.querySelector("[data-vax-rent-deferral-note]")){
      const note=document.createElement("div");
      note.className="lb-line";
      note.setAttribute("data-vax-rent-deferral-note","1");
      note.innerHTML=`<span>Status Pembayaran Sewa</span><strong>DITANGGUHKAN · ${money(report.investor.sewaDitangguhkan)}</strong>`;
      const title=host.querySelector(".lb-investor-rights-title");
      host.insertBefore(note,title||null);
    }
  }

  document.addEventListener("laporan-bulanan:investor-share",e=>setTimeout(()=>patch(e.detail),0));
  setTimeout(()=>patch(window.LaporanBulananInvestorShareBridge?.lastReport),400);
})();
