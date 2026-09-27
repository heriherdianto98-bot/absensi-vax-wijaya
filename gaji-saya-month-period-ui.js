/* Gaji Saya — monthly period selector adapter
   3 recent month cards + "Lainnya" popup.
   Reuses existing payroll RPC by mapping selected calendar month to p_from/p_to.
   No new payroll engine/calculation logic. */
(() => {
  "use strict";

  const MONTHS=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

  const pad=(n)=>String(n).padStart(2,"0");
  const daysInMonth=(year,month)=>new Date(year,month,0).getDate();
  const isoDay=(year,month,day)=>`${year}-${pad(month)}-${pad(day)}`;

  function todayJakarta(){
    const parts=new Intl.DateTimeFormat("en-CA",{
      timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(new Date());
    const get=(type)=>parts.find((p)=>p.type===type)?.value||"";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function shiftMonth(year,month,delta){
    const d=new Date(year,month-1+delta,1);
    return {year:d.getFullYear(),month:d.getMonth()+1};
  }

  function monthLabel(year,month){
    return `${MONTHS[month-1]} ${year}`;
  }

  function bind(){
    const button=document.getElementById("gajiMonthButton");
    const popup=document.getElementById("gajiMonthPopup");
    const grid=document.getElementById("gajiMonthGrid");
    const yearLabel=document.getElementById("gajiMonthYearLabel");
    const prev=document.getElementById("gajiMonthYearPrev");
    const next=document.getElementById("gajiMonthYearNext");
    const dari=document.getElementById("periodeDari");
    const sampai=document.getElementById("periodeSampai");
    const quickCards=[...document.querySelectorAll("[data-gaji-quick-index]")];
    if(!button||!popup||!grid||!yearLabel||!prev||!next||!dari||!sampai||quickCards.length<3||button.dataset.bound==="1") return;

    button.dataset.bound="1";

    const now=todayJakarta();
    const currentYear=Number(now.slice(0,4));
    const currentMonth=Number(now.slice(5,7));
    let viewYear=currentYear;
    let activeYear=currentYear;
    let activeMonth=currentMonth;

    function applyMonth(year,month,notify=true){
      activeYear=year;
      activeMonth=month;
      dari.value=isoDay(year,month,1);
      sampai.value=isoDay(year,month,daysInMonth(year,month));
      updateQuickActive();

      if(notify){
        document.dispatchEvent(new CustomEvent("gaji:month-change",{
          detail:{year,month,dari:dari.value,sampai:sampai.value}
        }));
      }
    }

    function updateQuickActive(){
      quickCards.forEach((card,index)=>{
        const target=shiftMonth(currentYear,currentMonth,-index);
        card.classList.toggle("is-active",target.year===activeYear&&target.month===activeMonth);
      });
      button.classList.toggle("is-active",!quickCards.some((card)=>card.classList.contains("is-active")));
    }

    function renderQuickCards(){
      quickCards.forEach((card,index)=>{
        const target=shiftMonth(currentYear,currentMonth,-index);
        const title=card.querySelector("span");
        if(title) title.textContent=monthLabel(target.year,target.month);
        card.dataset.year=String(target.year);
        card.dataset.month=String(target.month);
        card.addEventListener("click",()=>{
          applyMonth(target.year,target.month,true);
          popup.hidden=true;
          button.setAttribute("aria-expanded","false");
        });
      });
      updateQuickActive();
    }

    function renderGrid(){
      yearLabel.textContent=String(viewYear);
      grid.replaceChildren();
      MONTHS.forEach((name,index)=>{
        const month=index+1;
        const item=document.createElement("button");
        item.type="button";
        item.className="employee-summary-month-item";
        item.textContent=name.slice(0,3);
        item.dataset.month=String(month);
        item.classList.toggle("is-active",viewYear===activeYear&&month===activeMonth);
        item.classList.toggle("is-current",viewYear===currentYear&&month===currentMonth);
        item.addEventListener("click",()=>{
          applyMonth(viewYear,month,true);
          popup.hidden=true;
          button.setAttribute("aria-expanded","false");
          renderGrid();
        });
        grid.appendChild(item);
      });
    }

    button.addEventListener("click",(e)=>{
      e.stopPropagation();
      popup.hidden=!popup.hidden;
      button.setAttribute("aria-expanded",String(!popup.hidden));
      if(!popup.hidden){
        viewYear=activeYear;
        renderGrid();
      }
    });

    popup.addEventListener("click",(e)=>e.stopPropagation());
    prev.addEventListener("click",()=>{viewYear-=1;renderGrid();});
    next.addEventListener("click",()=>{viewYear+=1;renderGrid();});

    document.addEventListener("click",()=>{
      popup.hidden=true;
      button.setAttribute("aria-expanded","false");
    });

    renderQuickCards();
    applyMonth(activeYear,activeMonth,false);
    renderGrid();
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",bind,{once:true});
  }else{
    bind();
  }
})();