"use strict";
/* Screen-only composition: original performance nodes and report handlers stay intact. */
(() => {
  let card, kpis, investor, grid, strip, originalCardParent, originalCardNext;
  let originalKpiParent, originalKpiNext;
  const originalInsert = (node, parent, next) => {
    if (node && parent) parent.insertBefore(node, next?.parentNode === parent ? next : null);
  };
  function place() {
    if (!card || !kpis || !investor || !grid || !grid.parentElement) return;
    if (!strip) {
      strip = document.createElement("section");
      strip.className = "lb-performance-kpi-strip";
      strip.setAttribute("aria-label", "KPI Performa Cabang");
    }
    // Put the performance KPI strip before the finance detail grid on screen.
    grid.insertAdjacentElement("beforebegin", strip);
    strip.appendChild(kpis);
    investor.insertAdjacentElement("afterend", card);
    document.body.classList.add("lb-performance-layout-ready");
  }
  function restoreForPrint() {
    document.body.classList.remove("lb-performance-layout-ready");
    originalInsert(kpis, originalKpiParent, originalKpiNext);
    originalInsert(card, originalCardParent, originalCardNext);
    strip?.remove();
  }
  function boot() {
    grid = document.querySelector("body.laporan-bulanan-page .lb-grid");
    card = document.querySelector('.lb-card[data-lb-view="performance"]');
    investor = document.querySelector('.lb-card[data-lb-view="investor"]');
    kpis = document.getElementById("lbPerformance");
    if (!grid || !card || !investor || !kpis || !card.contains(kpis)) return;
    originalCardParent = card.parentNode;
    originalCardNext = card.nextSibling;
    originalKpiParent = kpis.parentNode;
    originalKpiNext = kpis.nextSibling;
    place();
    window.addEventListener("beforeprint", restoreForPrint);
    window.addEventListener("afterprint", place);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once:true});
  } else boot();
})();
