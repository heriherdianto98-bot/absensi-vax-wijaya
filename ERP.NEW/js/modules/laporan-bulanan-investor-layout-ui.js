"use strict";
/* Investor Revised screen layout only. Retain the same data nodes and their event listeners. */
(() => {
  if (!document.body.classList.contains("laporan-bulanan-investor-page")) return;
  const views = ["income", "salary", "expense", "result", "investor", "performance"];
  let originalCards, mapping, mappingParent, mappingNext, grid;
  let columns = null;
  function place() {
    if (!grid || columns || !window.matchMedia("screen").matches) return;
    const left = document.createElement("div"), right = document.createElement("div");
    left.className = "lb-monthly-column lb-monthly-column-left";
    right.className = "lb-monthly-column lb-monthly-column-right";
    views.forEach((view, index) => {
      const card = originalCards.find(node => node.dataset.lbView === view);
      if (card) (index < 4 ? left : right).appendChild(card);
    });
    right.appendChild(mapping);
    grid.append(left, right);
    columns = [left, right];
  }
  function restore() {
    if (!columns) return;
    grid.replaceChildren(...originalCards);
    if (mappingParent) mappingParent.insertBefore(mapping, mappingNext?.parentNode === mappingParent ? mappingNext : null);
    columns = null;
  }
  function boot() {
    grid = document.querySelector(".laporan-bulanan-investor-page .lb-grid");
    mapping = document.querySelector(".laporan-bulanan-investor-page .lb-mapping");
    if (!grid || !mapping) return;
    originalCards = [...grid.children];
    mappingParent = mapping.parentNode; mappingNext = mapping.nextSibling;
    place();
    window.addEventListener("beforeprint", restore);
    window.addEventListener("afterprint", place);
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, {once:true}) : boot();
})();
