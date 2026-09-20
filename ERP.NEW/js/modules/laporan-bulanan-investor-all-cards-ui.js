"use strict";
/* Screen-only all-branch investor presentation; preserves every original data node. */
(() => {
  const host = () => document.getElementById("lbInvestorLines");
  const all = () => document.getElementById("lbBranch")?.value === "all";
  let observer, scheduled = false, printing = false, original = [];
  const label = node => node?.querySelector(":scope > span")?.textContent?.trim() || "";
  const branchStart = (nodes, index) => nodes[index]?.matches(".lb-line.total") && label(nodes[index+1]) === "Porsi Investor";
  function restore() {
    const h = host();
    if (!h || !h.classList.contains("lb-investor-all-cards-ready")) return;
    observer?.disconnect();
    h.replaceChildren(...original);
    h.classList.remove("lb-investor-all-cards-ready");
    observer?.observe(h, {childList:true});
  }
  function compose() {
    const h = host();
    if (!h || !all() || printing) { restore(); return; }
    if (h.classList.contains("lb-investor-all-cards-ready")) { if (h.querySelector(".lb-investor-all-grid")) return; h.classList.remove("lb-investor-all-cards-ready"); original=[]; }
    const nodes = [...h.children];
    const first = nodes.findIndex((_,i) => branchStart(nodes,i));
    if (first < 0) return;
    const frag = document.createDocumentFragment();
    const intro = document.createElement("div"); intro.className = "lb-investor-all-overview";
    nodes.slice(0,first).forEach(n=>intro.appendChild(n)); frag.appendChild(intro);
    const grid = document.createElement("div"); grid.className = "lb-investor-all-grid";
    let i=first;
    while (i<nodes.length && branchStart(nodes,i)) {
      const panel=document.createElement("section"); panel.className="lb-investor-branch-panel";
      const heading=document.createElement("div"); heading.className="lb-investor-branch-heading";
      heading.appendChild(nodes[i++]); panel.appendChild(heading);
      const sides=document.createElement("div"); sides.className="lb-investor-branch-sides";
      const investor=document.createElement("div"); investor.className="lb-investor-branch-side is-investor";
      const management=document.createElement("div"); management.className="lb-investor-branch-side is-management";
      [investor,investor,management,management].forEach(side=>{if(i<nodes.length)side.appendChild(nodes[i++]);});
      sides.append(investor,management);panel.appendChild(sides);
      const rent=document.createElement("div");rent.className="lb-investor-branch-rent";
      while(i<nodes.length && /^Sewa (Dibayar|Ditangguhkan)/.test(label(nodes[i])))rent.appendChild(nodes[i++]);
      if(rent.childElementCount)panel.appendChild(rent);
      grid.appendChild(panel);
    }
    frag.appendChild(grid);
    const footer=document.createElement("div");footer.className="lb-investor-all-footer";
    nodes.slice(i).forEach(n=>footer.appendChild(n));frag.appendChild(footer);
    observer?.disconnect(); original=nodes;
    h.replaceChildren(frag);h.classList.add("lb-investor-all-cards-ready");
    observer?.observe(h,{childList:true});
  }
  function queue() {
    if (scheduled || printing) return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;compose();});
  }
  function boot() {
    const h=host();if(!h)return;
    observer=new MutationObserver(queue);
    observer.observe(h,{childList:true});
    document.getElementById("lbBranch")?.addEventListener("change",()=>{
      if(!all()) {restore();original=[];}
      else queue();
    });
    window.addEventListener("beforeprint",()=>{printing=true;restore();});
    window.addEventListener("afterprint",()=>{printing=false;queue();});
    queue();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
