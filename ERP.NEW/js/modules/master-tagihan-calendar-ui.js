/* ERP VAX — Master Tagihan custom due-day calendar popup
   UI only. Nilai canonical tetap jatuh_tempo_hari 1..31 pada #mtDueDay.
*/
"use strict";
(function(){
  const MONTH_LABEL="Tanggal setiap bulan";

  function el(id){return document.getElementById(id)}
  function selectedDay(){
    const n=Number(el("mtDueDay")?.value||0);
    return n>=1&&n<=31?n:0;
  }
  function syncTrigger(){
    const btn=el("mtDueDayTrigger"); if(!btn)return;
    const day=selectedDay();
    const text=btn.querySelector("[data-mt-calendar-value]");
    if(text)text.textContent=day?`Tanggal ${day}`:"Pilih tanggal jatuh tempo";
    btn.classList.toggle("has-value",!!day);
  }
  function renderDays(){
    const grid=el("mtCalendarGrid"); if(!grid)return;
    const selected=selectedDay();
    grid.innerHTML=Array.from({length:31},(_,i)=>{
      const d=i+1;
      return `<button type="button" class="mt-calendar-day${d===selected?" is-selected":""}" data-mt-calendar-day="${d}" aria-label="Tanggal ${d}" aria-pressed="${d===selected}">${d}</button>`;
    }).join("");
  }
  function open(){
    const pop=el("mtCalendarPopup"); if(!pop)return;
    renderDays();
    pop.hidden=false;
    requestAnimationFrame(()=>pop.classList.add("is-open"));
    el("mtDueDayTrigger")?.setAttribute("aria-expanded","true");
  }
  function close(){
    const pop=el("mtCalendarPopup"); if(!pop)return;
    pop.classList.remove("is-open");
    el("mtDueDayTrigger")?.setAttribute("aria-expanded","false");
    setTimeout(()=>{if(!pop.classList.contains("is-open"))pop.hidden=true},140);
  }
  function choose(day){
    const input=el("mtDueDay"); if(!input)return;
    input.value=String(day);
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    syncTrigger();
    close();
  }
  function bind(){
    const trigger=el("mtDueDayTrigger"),pop=el("mtCalendarPopup");
    if(!trigger||!pop)return;
    const label=el("mtCalendarLabel"); if(label)label.textContent=MONTH_LABEL;
    trigger.addEventListener("click",()=>pop.hidden?open():close());
    pop.querySelector("[data-mt-calendar-close]")?.addEventListener("click",close);
    pop.addEventListener("click",e=>{
      const dayBtn=e.target.closest("[data-mt-calendar-day]");
      if(dayBtn)choose(Number(dayBtn.dataset.mtCalendarDay));
    });
    document.addEventListener("pointerdown",e=>{
      if(pop.hidden)return;
      if(pop.contains(e.target)||trigger.contains(e.target))return;
      close();
    });
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!pop.hidden)close()});

    // MasterTagihan.open() mengisi #mtDueDay; observer ringan memastikan label ikut sinkron.
    const input=el("mtDueDay");
    input?.addEventListener("change",syncTrigger);
    const modal=el("mtModal");
    if(modal){
      new MutationObserver(()=>{if(!modal.hidden)setTimeout(syncTrigger,0);else close()})
        .observe(modal,{attributes:true,attributeFilter:["hidden"]});
    }
    syncTrigger();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
})();
