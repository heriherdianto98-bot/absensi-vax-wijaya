"use strict";
/* Soklat screen-only investor card. Original report DOM stays intact for Print/PDF. */
(() => {
  const host = () => document.getElementById("lbInvestorLines");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = value => new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value || 0));
  const active = report => report?.investor?.managementOnly === true && String(document.getElementById("lbBranch")?.value ?? "") === String(report?.branch?.id ?? "") && String(document.getElementById("lbMonth")?.value ?? "") === String(report?.range?.start ?? "").slice(0,7);
  function hide() { document.body.classList.remove("lb-soklat-management-ready"); document.getElementById("lbSoklatManagementView")?.remove(); }
  function render(report) {
    if (!active(report) || !host()) { hide(); return; }
    let view=document.getElementById("lbSoklatManagementView");
    if (!view) { view=document.createElement("section"); view.id="lbSoklatManagementView"; view.setAttribute("aria-label","Pembagian hasil Soklat"); host().insertAdjacentElement("afterend",view); }
    view.innerHTML=`<div class="lb-soklat-heading"><span class="lb-soklat-branch">${esc(report.branch.name)}</span><strong>Hak Manajemen · Tanpa Investor</strong><small>Laba bersih seluruhnya menjadi hak manajemen</small></div>
      <div class="lb-soklat-sides"><div class="lb-soklat-side is-investor"><span>Porsi Investor</span><strong>0%</strong><span>Hak Investor</span><strong>${money(0)}</strong></div>
      <div class="lb-soklat-side is-management"><span>Porsi Manajemen</span><strong>100%</strong><span>Hak Manajemen</span><strong>${money(report.investor.nilaiManajemen)}</strong></div></div>
      <div class="lb-soklat-total"><span>Total Hak Manajemen (Laba Bersih)</span><strong>${money(report.investor.nilaiManajemen)}</strong></div>`;
    document.body.classList.add("lb-soklat-management-ready");
  }
  function sync() { render(window.LaporanBulananInvestorShareBridge?.lastReport); }
  function boot() {
    document.addEventListener("laporan-bulanan:investor-share", event => render(event.detail));
    document.getElementById("lbBranch")?.addEventListener("change", () => { hide(); requestAnimationFrame(sync); });
    document.getElementById("lbMonth")?.addEventListener("change", () => { hide(); requestAnimationFrame(sync); });
    window.addEventListener("afterprint",sync);
    sync();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded",boot,{once:true}) : boot();
})();