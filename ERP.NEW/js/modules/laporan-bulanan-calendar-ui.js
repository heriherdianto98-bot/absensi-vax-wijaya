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
      /* UI ONLY — premium investor palette: graphite base + semantic accents */
      body.laporan-bulanan-page .lb-toolbar{
        position:relative;
        overflow:hidden;
        border-color:rgba(242,194,48,.24) !important;
        background:
          linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.008)),
          linear-gradient(165deg,#171c23 0%,#12171e 58%,#0f141a 100%) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 8px 18px rgba(0,0,0,.22),0 0 14px rgba(242,194,48,.035) !important;
      }
      body.laporan-bulanan-page .lb-toolbar::before{
        content:"";
        position:absolute;
        left:14px;
        right:14px;
        top:0;
        height:1px;
        background:linear-gradient(90deg,transparent,#2dd4bf 30%,#f2c230 70%,transparent);
        opacity:.7;
        box-shadow:0 0 10px rgba(45,212,191,.16);
        pointer-events:none;
      }
      body.laporan-bulanan-page .lb-toolbar .lb-field:first-child .lb-branch-trigger,
      body.laporan-bulanan-page .lb-toolbar .lb-field:first-child select{
        border-color:rgba(45,212,191,.24) !important;
        background:linear-gradient(180deg,#1a2229 0%,#141a21 100%) !important;
      }
      body.laporan-bulanan-page .lb-month-trigger{
        border-color:rgba(167,139,250,.24) !important;
        background:linear-gradient(180deg,#1b2029 0%,#151a22 100%) !important;
      }
      body.laporan-bulanan-page .lb-btn{
        border-color:rgba(242,194,48,.42) !important;
        background:linear-gradient(180deg,rgba(242,194,48,.14),rgba(242,194,48,.055)) !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 0 12px rgba(242,194,48,.04);
      }

      /* Common premium graphite body. Differentiation comes from accent, top glow and typography. */
      body.laporan-bulanan-page .lb-kpi,
      body.laporan-bulanan-page .lb-card{
        background:
          linear-gradient(180deg,rgba(255,255,255,.034) 0%,rgba(255,255,255,.01) 20%,rgba(255,255,255,0) 46%),
          linear-gradient(165deg,#171c23 0%,#12171e 55%,#0f141a 100%) !important;
        border-color:color-mix(in srgb,var(--lb-card-accent,#d4af37) 20%,rgba(148,163,184,.22)) !important;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.05),
          inset 0 -1px 0 rgba(0,0,0,.28),
          0 8px 18px rgba(0,0,0,.23),
          0 0 12px color-mix(in srgb,var(--lb-card-accent,#d4af37) 5%,transparent) !important;
      }

      /* KPI accents */
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(1){--lb-card-accent:#f2c230;--lb-card-glow:rgba(242,194,48,.26)}
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(2){--lb-card-accent:#38bdf8;--lb-card-glow:rgba(56,189,248,.22)}
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(3){--lb-card-accent:#ef4444;--lb-card-glow:rgba(239,68,68,.28);border-color:rgba(239,68,68,.36) !important}
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(4){--lb-card-accent:#a78bfa;--lb-card-glow:rgba(167,139,250,.22)}
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(5){--lb-card-accent:#34d399;--lb-card-glow:rgba(52,211,153,.23)}

      /* Detail card accents — restrained but clearly distinct */
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(1){--lb-card-accent:#f59e0b;--lb-card-glow:rgba(245,158,11,.17)}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(2){--lb-card-accent:#06b6d4;--lb-card-glow:rgba(6,182,212,.16)}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(3){--lb-card-accent:#dc2626;--lb-card-glow:rgba(220,38,38,.20);border-color:rgba(220,38,38,.30) !important}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(4){--lb-card-accent:#22c55e;--lb-card-glow:rgba(34,197,94,.16)}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(5){--lb-card-accent:#c084fc;--lb-card-glow:rgba(192,132,252,.16)}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(6){--lb-card-accent:#14b8a6;--lb-card-glow:rgba(20,184,166,.16)}
      body.laporan-bulanan-page .lb-review{--lb-card-accent:#fb923c;--lb-card-glow:rgba(251,146,60,.15)}
      body.laporan-bulanan-page .lb-mapping{--lb-card-accent:#818cf8;--lb-card-glow:rgba(129,140,248,.15)}

      /* Header stays mostly neutral, only title carries the category accent */
      body.laporan-bulanan-page .lb-card-head{
        background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.006)) !important;
        border-bottom-color:rgba(148,163,184,.12) !important;
      }
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(1) .lb-card-head h3{color:#fbbf24}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(2) .lb-card-head h3{color:#67e8f9}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(3) .lb-card-head h3{color:#f87171}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(4) .lb-card-head h3{color:#4ade80}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(5) .lb-card-head h3{color:#d8b4fe}
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(6) .lb-card-head h3{color:#5eead4}
      body.laporan-bulanan-page .lb-review .lb-card-head h3{color:#fdba74}
      body.laporan-bulanan-page .lb-mapping .lb-card-head h3{color:#a5b4fc}

      /* Keep Operasional intentionally strongest like Cash Out */
      body.laporan-bulanan-page .lb-kpis .lb-kpi:nth-child(3)::before,
      body.laporan-bulanan-page .lb-grid .lb-card:nth-child(3)::before{opacity:.78}
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
