"use strict";
/* Screen-only Investor Revised layout. Reuse original report cards/IDs without touching data or handlers. */
(() => {
  if (!document.body.classList.contains("laporan-bulanan-investor-page")) return;
  const views = ["income", "salary", "expense", "result", "investor", "performance"];
  let originalCards, mapping, mappingParent, mappingNext, mappingAria, grid, columns;
  function place() {
    if (!grid || columns || !window.matchMedia("screen").matches) return;
    const left = document.createElement("div"), right = document.createElement("div");
    left.className = "lb-monthly-column lb-monthly-column-left";
    right.className = "lb-monthly-column lb-monthly-column-right";
    const card = view => originalCards.find(node => node.dataset.lbView === view);
    for (const view of views.slice(0, 4)) {
      const target = card(view);
      if (target) (view === "income" || view === "salary" ? left : right).appendChild(target);
    }
    right.appendChild(mapping);
    mapping.setAttribute("aria-hidden", "false");
    grid.append(left, right);
    const investor = card("investor"), performance = card("performance");
    if (investor) grid.insertAdjacentElement("afterend", investor);
    if (performance) (investor || grid).insertAdjacentElement("afterend", performance);
    columns = [left, right];
  }
  function restore() {
    if (!columns) return;
    grid.replaceChildren(...originalCards);
    if (mappingParent) mappingParent.insertBefore(mapping, mappingNext?.parentNode === mappingParent ? mappingNext : null);
    if (mappingAria === null) mapping.removeAttribute("aria-hidden");
    else mapping.setAttribute("aria-hidden", mappingAria);
    columns = null;
  }
  function boot() {
    grid = document.querySelector(".laporan-bulanan-investor-page .lb-grid");
    mapping = document.querySelector(".laporan-bulanan-investor-page .lb-mapping");
    if (!grid || !mapping) return;
    originalCards = [...grid.children];
    mappingParent = mapping.parentNode;
    mappingNext = mapping.nextSibling;
    mappingAria = mapping.getAttribute("aria-hidden");
    place();
    window.addEventListener("beforeprint", restore);
    window.addEventListener("afterprint", place);
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, {once:true}) : boot();
})();
