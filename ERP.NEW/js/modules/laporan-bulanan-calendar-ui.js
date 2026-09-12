/* VAX ERP — Laporan Bulanan themed month picker / UI only */
"use strict";

(() => {
  const MONTHS=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const pad=n=>String(n).padStart(2,"0");
  const $=id=>document.getElementById(id);
  let pickerYear=null;

  function parseValue(v){
    const [y,m]=String(v||"").split("-").map(Number);
    const now=new Date();
    return {year:y||now.getFullYear(),month:m||now.getMonth()+1};
  }

  function injectVisualOverrides(){
    if(document.getElementById("lbUniqueCardColorOverrides")) return;
    const style=document.createElement("style");
    style.id="lbUniqueCardColorOverrides";
    style.textContent=`
      /* UI ONLY — unique semantic colors for every Laporan Bulanan card */
      body.laporan-bulanan-page .lb-toolbar{
        position:relative;
        overflow:hidden;
        border-color:rgba(45,212,191,.32) !important;
        background:
          linear-gradient(180deg,rgba(45,212,191,.10),rgba(45,212,191,.025) 42%,rgba(242,194,48,.035)),
          linear-gradient(165deg,#172128 0%,#121920 58%,#0f141a 100%) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 8px 18px rgba(0,0,0,.22),0 0 18px rgba(45,212,191,.06) !important;
      }
      body.laporan-bulanan-page .lb-toolbar::before{
        content:"";
        position:absolute;
        left:14px;
        right:14px;
        top:0;
        height:1px;
        background:linear-gradient(90deg,transparent,#2dd4bf 30%,#f2c230 70%,transparent);
        box-shadow:0 0 12px rgba(45,212,191,.28);
        pointer-events:none;
      }
      body.laporan-bulanan-page .lb-toolbar .lb-field:first-child select{
        border-color:rgba(45,212,191,.26) !important;
        background:linear-gradient(180deg,rgba(45,212,191,.09),rgba(17,24,31,.95)) !important;
      }
      body.laporan-bulanan-page .lb-month-trigger{
        border-color:rgba(168,85,247,.30) !important;
        background:linear-gradient(180deg,rgba(168,85,247,.10),rgba(18,24,32,.96)) !important;
      }
      body.laporan-bulanan-page .lb-btn{
        border-color:rgba(242,194,48,.48) !important;
        background:linear-gradient(180deg,rgba(242,194,48,.19),rgba(242,194,48,.08)) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 14px rgba(242,194,48,.06);
      }

      /* KPI cards — all five intentionally different */
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(1){
        --lb-card-accent:#f2c230;--lb-card-glow:rgba(242,194,48,.42);
        background:linear-gradient(165deg,rgba(242,194,48,.22) 0%,rgba(46,38,14,.80) 32%,#10151b 100%) !important;
        border-color:rgba(242,194,48,.38) !important;
      }
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(2){
        --lb-card-accent:#38bdf8;--lb-card-glow:rgba(56,189,248,.35);
        background:linear-gradient(165deg,rgba(56,189,248,.20) 0%,rgba(12,36,49,.80) 32%,#10151b 100%) !important;
        border-color:rgba(56,189,248,.36) !important;
      }
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(3){
        --lb-card-accent:#ef4444;--lb-card-glow:rgba(239,68,68,.40);
        background:linear-gradient(165deg,rgba(239,68,68,.24) 0%,rgba(52,18,22,.88) 32%,#11151b 100%) !important;
        border-color:rgba(239,68,68,.46) !important;
      }
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(4){
        --lb-card-accent:#a78bfa;--lb-card-glow:rgba(167,139,250,.36);
        background:linear-gradient(165deg,rgba(167,139,250,.22) 0%,rgba(37,28,61,.82) 32%,#10151b 100%) !important;
        border-color:rgba(167,139,250,.38) !important;
      }
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(5){
        --lb-card-accent:#34d399;--lb-card-glow:rgba(52,211,153,.38);
        background:linear-gradient(165deg,rgba(52,211,153,.22) 0%,rgba(13,47,37,.82) 32%,#10151b 100%) !important;
        border-color:rgba(52,211,153,.38) !important;
      }

      /* Detail cards — every card uses a separate hue family */
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(1){
        --lb-card-accent:#f59e0b;--lb-card-glow:rgba(245,158,11,.30);
        background:linear-gradient(165deg,rgba(245,158,11,.18),rgba(47,31,11,.72) 30%,#10151b 100%) !important;
        border-color:rgba(245,158,11,.34) !important;
      }
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(2){
        --lb-card-accent:#06b6d4;--lb-card-glow:rgba(6,182,212,.28);
        background:linear-gradient(165deg,rgba(6,182,212,.18),rgba(8,38,47,.74) 30%,#10151b 100%) !important;
        border-color:rgba(6,182,212,.34) !important;
      }
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(3){
        --lb-card-accent:#dc2626;--lb-card-glow:rgba(220,38,38,.32);
        background:linear-gradient(165deg,rgba(220,38,38,.22),rgba(51,17,20,.82) 30%,#11151b 100%) !important;
        border-color:rgba(220,38,38,.44) !important;
      }
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(4){
        --lb-card-accent:#22c55e;--lb-card-glow:rgba(34,197,94,.28);
        background:linear-gradient(165deg,rgba(34,197,94,.18),rgba(13,43,25,.76) 30%,#10151b 100%) !important;
        border-color:rgba(34,197,94,.34) !important;
      }
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(5){
        --lb-card-accent:#d946ef;--lb-card-glow:rgba(217,70,239,.28);
        background:linear-gradient(165deg,rgba(217,70,239,.18),rgba(48,20,53,.75) 30%,#10151b 100%) !important;
        border-color:rgba(217,70,239,.34) !important;
      }
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(6){
        --lb-card-accent:#14b8a6;--lb-card-glow:rgba(20,184,166,.28);
        background:linear-gradient(165deg,rgba(20,184,166,.18),rgba(10,42,39,.76) 30%,#10151b 100%) !important;
        border-color:rgba(20,184,166,.34) !important;
      }
      body.laporan-bulanan-page .lb-review{
        --lb-card-accent:#fb923c;--lb-card-glow:rgba(251,146,60,.27);
        background:linear-gradient(165deg,rgba(251,146,60,.17),rgba(50,29,12,.76) 30%,#10151b 100%) !important;
        border-color:rgba(251,146,60,.34) !important;
      }
      body.laporan-bulanan-page .lb-mapping{
        --lb-card-accent:#6366f1;--lb-card-glow:rgba(99,102,241,.28);
        background:linear-gradient(165deg,rgba(99,102,241,.18),rgba(29,29,60,.78) 30%,#10151b 100%) !important;
        border-color:rgba(99,102,241,.35) !important;
      }

      /* category title tint so scanning is faster */
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(1) .lb-card-head h3{color:#fbbf24}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(2) .lb-card-head h3{color:#67e8f9}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(3) .lb-card-head h3{color:#f87171}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(4) .lb-card-head h3{color:#4ade80}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(5) .lb-card-head h3{color:#e879f9}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(6) .lb-card-head h3{color:#5eead4}
      body.laporan-bulanan-page .lb-review .lb-card-head h3{color:#fdba74}
      body.laporan-bulanan-page .lb-mapping .lb-card-head h3{color:#a5b4fc}
    `;
    document.head.appendChild(style);
  }

  function build(){
    injectVisualOverrides();
    const input=$("lbMonth");
    if(!input || document.getElementById("lbMonthTrigger")) return;
    const field=input.closest(".lb-field");
    if(!field) return;

    const trigger=document.createElement("button");
    trigger.type="button";
    trigger.id="lbMonthTrigger";
    trigger.className="lb-month-trigger";
    trigger.setAttribute("aria-haspopup","dialog");
    trigger.setAttribute("aria-expanded","false");
    trigger.innerHTML='<span id="lbMonthTriggerText">—</span><span class="lb-month-trigger-ico" aria-hidden="true">▣</span>';
    input.insertAdjacentElement("afterend",trigger);

    const pop=document.createElement("div");
    pop.id="lbMonthPopover";
    pop.className="lb-month-popover";
    pop.hidden=true;
    pop.setAttribute("role","dialog");
    pop.setAttribute("aria-label","Pilih bulan laporan");
    pop.innerHTML=`
      <div class="lb-month-popover-head">
        <div class="lb-month-popover-title"><small>Pilih periode</small><strong id="lbMonthPickerYear"></strong></div>
        <div class="lb-month-year-nav">
          <button type="button" id="lbMonthPrevYear" aria-label="Tahun sebelumnya">‹</button>
          <button type="button" id="lbMonthNextYear" aria-label="Tahun berikutnya">›</button>
        </div>
      </div>
      <div class="lb-month-grid" id="lbMonthGrid"></div>
      <div class="lb-month-popover-foot"><span>Periode laporan bulanan</span><button type="button" class="lb-month-today" id="lbMonthCurrent">Bulan ini</button></div>`;
    document.body.appendChild(pop);

    trigger.addEventListener("click",()=> pop.hidden ? open() : close());
    $("lbMonthPrevYear")?.addEventListener("click",()=>{pickerYear--; renderGrid();});
    $("lbMonthNextYear")?.addEventListener("click",()=>{pickerYear++; renderGrid();});
    $("lbMonthCurrent")?.addEventListener("click",()=>{
      const now=new Date();
      choose(now.getFullYear(),now.getMonth()+1);
    });
    document.addEventListener("pointerdown",e=>{
      if(pop.hidden) return;
      if(pop.contains(e.target)||trigger.contains(e.target)) return;
      close();
    });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape") close(); });
    input.addEventListener("change",syncTrigger);
    syncTrigger();
  }

  function syncTrigger(){
    const input=$("lbMonth"),text=$("lbMonthTriggerText");
    if(!input||!text) return;
    const {year,month}=parseValue(input.value);
    text.textContent=`${MONTHS[month-1]} ${year}`;
  }

  function position(){
    const trigger=$("lbMonthTrigger"),pop=$("lbMonthPopover");
    if(!trigger||!pop) return;
    const r=trigger.getBoundingClientRect();
    const gap=8;
    const width=Math.min(360,window.innerWidth-28);
    let left=Math.min(r.left,window.innerWidth-width-14);
    left=Math.max(14,left);
    let top=r.bottom+gap;
    const estH=250;
    if(top+estH>window.innerHeight-12) top=Math.max(12,r.top-estH-gap);
    pop.style.left=`${left}px`;
    pop.style.top=`${top}px`;
  }

  function open(){
    const input=$("lbMonth"),pop=$("lbMonthPopover"),trigger=$("lbMonthTrigger");
    if(!input||!pop||!trigger) return;
    const {year}=parseValue(input.value);
    pickerYear=year;
    renderGrid();
    pop.hidden=false;
    trigger.setAttribute("aria-expanded","true");
    position();
  }

  function close(){
    const pop=$("lbMonthPopover"),trigger=$("lbMonthTrigger");
    if(pop) pop.hidden=true;
    trigger?.setAttribute("aria-expanded","false");
  }

  function renderGrid(){
    const input=$("lbMonth"),grid=$("lbMonthGrid"),yearLabel=$("lbMonthPickerYear");
    if(!input||!grid||!yearLabel) return;
    const selected=parseValue(input.value);
    const now=new Date();
    yearLabel.textContent=String(pickerYear);
    grid.innerHTML=MONTHS.map((name,i)=>{
      const month=i+1;
      const selectedClass=selected.year===pickerYear&&selected.month===month?" is-selected":"";
      const currentClass=now.getFullYear()===pickerYear&&now.getMonth()+1===month?" is-current":"";
      return `<button type="button" class="lb-month-cell${selectedClass}${currentClass}" data-month="${month}">${name.slice(0,3)}</button>`;
    }).join("");
    grid.querySelectorAll(".lb-month-cell").forEach(btn=>btn.addEventListener("click",()=>choose(pickerYear,Number(btn.dataset.month))));
  }

  function choose(year,month){
    const input=$("lbMonth");
    if(!input) return;
    const next=`${year}-${pad(month)}`;
    if(input.value!==next){
      input.value=next;
      input.dispatchEvent(new Event("change",{bubbles:true}));
    }else syncTrigger();
    close();
  }

  window.addEventListener("resize",()=>{ if(!$("lbMonthPopover")?.hidden) position(); });
  window.addEventListener("scroll",()=>{ if(!$("lbMonthPopover")?.hidden) position(); },true);
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",build):build();
})();
