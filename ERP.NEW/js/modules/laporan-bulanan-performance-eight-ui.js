"use strict";

/* Laporan Bulanan — Performance 8-card presenter. UI ONLY. */
(() => {
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const count=n=>Number(n||0).toLocaleString("id-ID");
  const pct=n=>`${Number(n||0).toLocaleString("id-ID",{minimumFractionDigits:1,maximumFractionDigits:1})}%`;

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
    ultimateCard.title=`Realisasi ${money(ultimate.realisasi)} dari target ${money(ultimate.target)} · ${count(ultimate.trx)} trx Ultimate`;
    ultimateCard.innerHTML=`<span>KPI Pencapaian Ultimate</span><strong>${pct(ultimate.progress)}</strong>`;

    host.append(service,ultimateCard);
  }

  function boot(){
    const host=document.getElementById("lbPerformance");
    if(!host) return;
    const observer=new MutationObserver(()=>renderExtras());
    observer.observe(host,{childList:true});
    document.addEventListener("laporan-bulanan:performance-kpi",()=>setTimeout(renderExtras,0));
    renderExtras();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
