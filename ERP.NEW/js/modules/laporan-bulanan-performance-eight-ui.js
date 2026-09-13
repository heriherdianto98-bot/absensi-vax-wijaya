"use strict";

/* Laporan Bulanan — Performance 8-card presenter. UI ONLY. */
(() => {
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const count=n=>Number(n||0).toLocaleString("id-ID");

  function renderExtras(){
    const host=document.getElementById("lbPerformance");
    const report=window.LaporanBulananPerformanceKpiBridge?.lastReport;
    if(!host||!report) return;
    const perf=report.performance||{};

    host.querySelectorAll("[data-lb-perf-extra]").forEach(node=>node.remove());

    const service=document.createElement("div");
    service.className="perf-service";
    service.dataset.lbPerfExtra="service";
    service.innerHTML=`<span>Service / Layanan</span><strong>${count(perf.services)}</strong>`;

    const ultimate=perf.ultimate||{};
    const ultimateCard=document.createElement("div");
    ultimateCard.className="perf-ultimate";
    ultimateCard.dataset.lbPerfExtra="ultimate";
    ultimateCard.title=`Target ${money(ultimate.target)} · ${count(ultimate.trx)} trx Ultimate`;
    ultimateCard.innerHTML=`<span>KPI Pencapaian Ultimate</span><strong>${money(ultimate.realisasi)}</strong>`;

    host.append(service,ultimateCard);
  }

  function boot(){
    const host=document.getElementById("lbPerformance");
    if(!host) return;

    document.addEventListener("laporan-bulanan:performance-kpi",()=>{
      setTimeout(renderExtras,0);
    });

    // Fallback satu kali setelah renderer utama selesai.
    setTimeout(renderExtras,250);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
