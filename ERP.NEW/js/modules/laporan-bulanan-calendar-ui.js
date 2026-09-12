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

  function build(){
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
