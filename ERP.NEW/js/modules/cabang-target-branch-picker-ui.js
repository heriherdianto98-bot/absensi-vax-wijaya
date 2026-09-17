/* Master Cabang / target popup: branch navigator only. No data filtering or save changes. */
"use strict";
(() => {
  const modal = document.getElementById("modalTargetBulanan");
  const periodRow = modal?.querySelector(".target-periode-row");
  const list = document.getElementById("targetListWrapper");
  if (!modal || !periodRow || !list || document.getElementById("targetCabangNav")) return;

  const style = document.createElement("style");
  style.textContent = `
    #modalTargetBulanan .target-periode-row{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr) minmax(125px,.56fr);align-items:end;gap:14px}
    #modalTargetBulanan .target-periode-row>.form-group{min-width:0}
    #modalTargetBulanan #targetCabangNav{height:49px;width:100%;min-width:0;border:1px solid #536276;border-radius:11px;padding:0 13px;background:#202b39;color:#fff;font:900 17px inherit;box-shadow:inset 0 2px 5px rgba(0,0,0,.22)}
    #modalTargetBulanan #targetCabangNav:focus-visible{outline:2px solid rgba(213,164,29,.55);outline-offset:1px}
    #modalTargetBulanan .target-row.target-nav-current{outline:2px solid rgba(213,164,29,.85);outline-offset:-2px;background:rgba(213,164,29,.09)}
    @media(max-width:640px){#modalTargetBulanan .target-periode-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}#modalTargetBulanan .target-cabang-nav-field{grid-column:1/-1}#modalTargetBulanan #targetCabangNav{height:45px;font-size:15px}}
  `;
  document.head.appendChild(style);

  const field = document.createElement("div");
  field.className = "form-group target-cabang-nav-field";
  const label = document.createElement("label");
  label.htmlFor = "targetCabangNav";
  label.textContent = "Cabang";
  const select = document.createElement("select");
  select.id = "targetCabangNav";
  select.setAttribute("aria-label", "Navigasi cabang pada daftar target");
  select.appendChild(new Option("Semua Cabang", ""));
  field.append(label, select);
  periodRow.prepend(field);

  function rows(){ return [...list.querySelectorAll(".target-row")]; }
  function syncOptions(){
    const current = select.value;
    const entries = rows().map(row => {
      const input = row.querySelector(".input-target-cabang");
      const name = row.querySelector(".target-nama strong")?.textContent?.trim();
      const code = row.querySelector(".target-nama small")?.textContent?.trim();
      return input?.dataset.cabangId && name ? { id: input.dataset.cabangId, title: code && code !== "-" ? `${code} — ${name}` : name } : null;
    }).filter(Boolean);
    select.replaceChildren(new Option("Semua Cabang", ""), ...entries.map(entry => new Option(entry.title, entry.id)));
    select.value = entries.some(entry => entry.id === current) ? current : "";
    if(!entries.some(entry => entry.id === current)) rows().forEach(row => row.classList.remove("target-nav-current"));
  }
  function navigate(){
    const target = rows().find(row => row.querySelector(".input-target-cabang")?.dataset.cabangId === select.value);
    rows().forEach(row => row.classList.toggle("target-nav-current", row === target));
    if(target) list.scrollTop = Math.max(0, target.offsetTop - list.offsetTop - 9);
    else list.scrollTop = 0;
  }
  select.addEventListener("change", navigate);
  const observer = new MutationObserver(records => {
    if(records.some(record => record.type === "childList" && [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.classList?.contains("target-row") || node.querySelector?.(".target-row"))))) syncOptions();
  });
  observer.observe(list, {childList:true});
  syncOptions();
})();
