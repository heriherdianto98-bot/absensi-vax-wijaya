/* Monthly report UI copy, uses existing investor-share report; original investor module untouched.
 * VAX Investor diagram — locked Kalijati UI shared by individual branches.
 * Screen presentation only. Original report, calculation, presenter and print DOM remain unchanged.
 */
"use strict";
(() => {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const money = value => new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value || 0));
  const ico = (name) => {
    const paths = {
      coins:'<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v5c0 4 14 4 14 0V5M5 10v5c0 4 14 4 14 0v-5M5 15v4c0 4 14 4 14 0v-4"/>',
      box:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z M3 7l9 5 9-5M12 12v10"/>',
      chart:'<rect x="3" y="14" width="4" height="7" rx="1"/><rect x="10" y="9" width="4" height="12" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>',
      person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-2c0-7 16-7 16 0v2"/>',
      people:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-2c0-6 14-6 14 0v2M16 15c4 0 6 2 6 5"/>',
      home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>'
    };
    return `<svg class="vax-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.coins}</svg>`;
  };
  const node = (id, icon, label, value, extra="") => `<div id="vax-flow-${id}" class="vax-flow-node ${extra}"><span class="vax-icon-wrap">${ico(icon)}</span><span class="vax-flow-copy"><span class="vax-flow-label">${esc(label)}</span><strong>${esc(value)}</strong></span></div>`;
  let resizeObserver;
  let raf = 0;
  let lastRenderedReport = null;
  const branchSelect = () => document.getElementById("lbBranch");
  const selectedBranch = () => {
    const select = branchSelect();
    const id = String(select?.value ?? "").trim();
    const label = String(select?.selectedOptions?.[0]?.textContent ?? "").trim();
    if (!id || /^(all|semua)$/i.test(id) || /^semua cabang$/i.test(label)) return "";
    return id;
  };
  const monthMatches = report => {
    const selected = String(document.getElementById("lbMonth")?.value || "");
    const reportPeriod = String(report?.range?.start || report?.range?.end || "").slice(0,7);
    return !selected || !reportPeriod || selected === reportPeriod;
  };
  const matchesSelected = report => !!selectedBranch() && String(report?.branch?.id ?? "") === selectedBranch() && monthMatches(report) && !!report?.investor?.nama;
  const getReport = () => [window.LaporanBulananInvestorShareBridge?.lastReport].find(matchesSelected);
  function draw() {
    const stage = document.querySelector("#vax-investor-diagram .vax-flow-stage");
    const svg = stage?.querySelector(".vax-flow-connectors");
    if (!stage || !svg || !document.body.classList.contains("vax-investor-diagram-ready")) return;
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    const rect = key => stage.querySelector(`#vax-flow-${key}`)?.getBoundingClientRect();
    const point = (key, edge) => { const r = rect(key); return r && {x:r.left - bounds.left + r.width/2,y:(edge === "top" ? r.top : r.bottom) - bounds.top}; };
    const segments = [["profit","capital"],["capital","base"],["investor-share","investor-value"],["investor-value","rent"],["rent","investor-total"],["management-share","management-value"],["management-value","management-total"]];
    const lines = segments.map(([a,b]) => { const from=point(a,"bottom"),to=point(b,"top"); return from && to ? `<path d="M${from.x} ${from.y} L${to.x} ${to.y}" marker-end="url(#vax-diagram-arrow)"/>` : ""; });
    const from=point("base","bottom"), left=point("investor-share","top"), right=point("management-share","top");
    if (from && left && right) {
      const mid=Math.min(left.y - 13,from.y + Math.max(10,(left.y-from.y)/2));
      lines.push(`<path d="M${from.x} ${from.y} V${mid} H${left.x} V${left.y}" marker-end="url(#vax-diagram-arrow)"/>`);
      lines.push(`<path d="M${from.x} ${from.y} V${mid} H${right.x} V${right.y}" marker-end="url(#vax-diagram-arrow)"/>`);
    }
    svg.innerHTML='<defs><marker id="vax-diagram-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#58d8e9" stroke-width="1.5"/></marker></defs>' + lines.join("");
  }
  function scheduleDraw() { cancelAnimationFrame(raf); raf=requestAnimationFrame(draw); }
  function hide() {
    document.body.classList.remove("vax-investor-diagram-ready");
    document.getElementById("vax-investor-diagram")?.remove();
    resizeObserver?.disconnect(); resizeObserver=null;
    lastRenderedReport=null;
  }
  function render(report) {
    if (!matchesSelected(report)) { hide(); return; }
    const original=document.getElementById("lbInvestorLines");
    if (!original || !original.closest('[data-lb-view="investor"]')) return;
    const inv=report.investor;
    let host=document.getElementById("vax-investor-diagram");
    if (!host) { host=document.createElement("section"); host.id="vax-investor-diagram";host.setAttribute("aria-label","Diagram Pembagian Investor"); original.insertAdjacentElement("afterend",host); }
    host.innerHTML=`<div class="vax-diagram-heading"><div class="vax-diagram-heading-copy"><span class="vax-eyebrow">LAPORAN BULANAN · DIAGRAM PEMBAGIAN</span><h3>Pembagian Investor</h3><p>Rincian perhitungan hak investor dan manajemen dari laba usaha<br>berdasarkan data realisasi.</p></div><div class="vax-investor-name"><span class="vax-icon-wrap">${ico("person")}</span><span><small>Master Investor</small><strong>${esc(inv.nama)}</strong></span></div></div>
      <div class="vax-flow-stage"><svg class="vax-flow-connectors" aria-hidden="true"></svg>
        ${node("profit","coins","Laba Bersih",money(report.laba?.labaBersih),"vax-profit")}
        <div id="vax-flow-capital" class="vax-capital vax-flow-node"><span class="vax-icon-wrap">${ico("box")}</span><span class="vax-capital-text"><b>Modal Produk</b><small>(${esc(inv.modalProdukRate ?? 60)}% × Nett Produk)</small></span><span class="vax-minus">−</span><span class="vax-capital-values"><small>Nett Produk<br>${money(inv.nettProduk)}</small><strong>${money(inv.modalProduk)}</strong></span></div>
        ${node("base","chart","Laba Dasar Pembagian",money(inv.labaDasarPembagian),"vax-base")}
        <div class="vax-flow-branches"><div class="vax-flow-side vax-investor-side">
          ${node("investor-share","person","Porsi Investor",`${esc(inv.porsiInvestor ?? 0)}%`,"vax-share")}
          ${node("investor-value","coins","Nilai Investor",money(inv.nilaiInvestor))}
          ${node("rent","home","Sewa Dibayar",money(inv.sewaDibayar))}
          ${node("investor-total","coins","Total Hak Investor",money(inv.totalHakBulanIni),"vax-total")}
        </div><div class="vax-flow-side vax-management-side">
          ${node("management-share","people","Porsi Manajemen",`${esc(inv.porsiManajemen ?? 0)}%`,"vax-share")}
          ${node("management-value","coins","Nilai Manajemen",money(inv.nilaiManajemen))}
          ${node("management-total","coins","Total Hak Manajemen",money(inv.nilaiManajemen),"vax-total")}
        </div></div></div>`;
    lastRenderedReport=report;
    document.body.classList.add("vax-investor-diagram-ready");
    resizeObserver?.disconnect();
    if ("ResizeObserver" in window) { resizeObserver=new ResizeObserver(scheduleDraw); resizeObserver.observe(host); }
    scheduleDraw();
  }
  function sync() { const report=getReport(); if (!report) { hide();return; } render(report); }
  let originalParent=null, originalNext=null;
  function placeWide(){
    const card=document.querySelector('.lb-card[data-lb-view="investor"]');
    const grid=document.querySelector('body.laporan-bulanan-page .lb-grid');
    if(!card||!grid||!grid.parentElement)return;
    if(!originalParent){originalParent=card.parentElement;originalNext=card.nextSibling;}
    if(card.previousElementSibling!==grid)grid.insertAdjacentElement('afterend',card);
  }
  function restoreForPrint(){
    const card=document.querySelector('.lb-card[data-lb-view="investor"]');
    if(card&&originalParent){originalParent.insertBefore(card,originalNext?.parentNode===originalParent?originalNext:null);}
  }
  function boot() {
    placeWide();
    window.addEventListener("beforeprint",restoreForPrint);
    window.addEventListener("afterprint",()=>{placeWide();scheduleDraw();});
    document.addEventListener("laporan-bulanan:investor-share",event=>{ const r=event.detail; if (matchesSelected(r)) render(r); });
    document.addEventListener("laporan-investor:revised-report-applied",event=>{ const r=event.detail?.report; if (matchesSelected(r)) render(r); });
    branchSelect()?.addEventListener("change",()=>{ hide();requestAnimationFrame(sync); });
    document.getElementById("lbMonth")?.addEventListener("change",()=>{ hide();requestAnimationFrame(sync); });
    window.addEventListener("resize",scheduleDraw);
    window.addEventListener("beforeprint",()=>document.body.classList.remove("vax-investor-diagram-ready"));
    window.addEventListener("afterprint",()=>{ if (matchesSelected(lastRenderedReport)) document.body.classList.add("vax-investor-diagram-ready");scheduleDraw(); });
    sync();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded",boot,{once:true}) : boot();
})();
