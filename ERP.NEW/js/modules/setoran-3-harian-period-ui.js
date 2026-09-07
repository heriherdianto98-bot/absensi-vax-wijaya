/* VAX ERP — Setoran 3 Harian V2 popup period calendar (UI only) */
(function(){
  "use strict";
  const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  let viewY=null, viewM=null, pickStart=null, pickEnd=null;
  const $=id=>document.getElementById(id);
  const isoToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const fmt=iso=>{if(!iso)return"—";const[y,m,d]=iso.split("-").map(Number);return new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d,12)));};
  const diffDays=(a,b)=>Math.round((new Date(`${b}T12:00:00+07:00`)-new Date(`${a}T12:00:00+07:00`))/86400000)+1;
  function syncGlobalHeaderPeriod(){
    const s=$("s3v2Start")?.value;
    const e=$("s3v2End")?.value;
    const header=$("erpHeaderPeriode");
    if(!s||!e||!header)return;
    header.textContent=`${fmt(s)} — ${fmt(e)}`;
  }
  function seed(){const s=$("s3v2Start")?.value||isoToday();const e=$("s3v2End")?.value||s;pickStart=s;pickEnd=e;viewY=Number(s.slice(0,4));viewM=Number(s.slice(5,7))-1;}
  function open(){seed();const m=$("s3periodModal");if(!m)return;m.hidden=false;m.setAttribute("aria-hidden","false");document.body.classList.add("s3period-open");render();sync();}
  function close(){const m=$("s3periodModal");if(!m)return;m.hidden=true;m.setAttribute("aria-hidden","true");document.body.classList.remove("s3period-open");}
  function shift(n){const d=new Date(Date.UTC(viewY,viewM+n,1));viewY=d.getUTCFullYear();viewM=d.getUTCMonth();render();}
  function clickDay(iso){
    if(!pickStart || (pickStart&&pickEnd)){pickStart=iso;pickEnd=null;}
    else if(iso<pickStart){pickEnd=pickStart;pickStart=iso;}
    else pickEnd=iso;
    if(pickStart&&pickEnd&&diffDays(pickStart,pickEnd)>3){pickStart=iso;pickEnd=null;}
    render();sync();
  }
  function render(){const grid=$("s3periodDays"),label=$("s3periodMonth");if(!grid||viewY==null)return;if(label)label.textContent=`${MONTHS[viewM]} ${viewY}`;const first=new Date(Date.UTC(viewY,viewM,1));const monday=(first.getUTCDay()+6)%7;const total=new Date(Date.UTC(viewY,viewM+1,0)).getUTCDate();const today=isoToday();let html="";for(let i=0;i<monday;i++)html+='<span class="s3period-day is-empty"></span>';for(let d=1;d<=total;d++){const iso=`${viewY}-${String(viewM+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;const c=["s3period-day"];if(iso===today)c.push("is-today");if(iso===pickStart)c.push("is-start");if(iso===pickEnd)c.push("is-end");if(pickStart&&pickEnd&&iso>pickStart&&iso<pickEnd)c.push("is-range");html+=`<button type="button" class="${c.join(" ")}" data-s3period-day="${iso}">${d}</button>`;}grid.innerHTML=html;}
  function sync(){const p=$("s3periodPreview"),use=$("s3periodUse");const valid=Boolean(pickStart&&pickEnd&&pickEnd>=pickStart&&diffDays(pickStart,pickEnd)<=3);if(p)p.textContent=pickStart?(pickEnd?`${fmt(pickStart)} — ${fmt(pickEnd)} · ${diffDays(pickStart,pickEnd)} hari`:`${fmt(pickStart)} — pilih tanggal akhir`):"Pilih tanggal mulai";if(use)use.disabled=!valid;}
  function apply(){if(!pickStart||!pickEnd||diffDays(pickStart,pickEnd)>3)return;const s=$("s3v2Start"),e=$("s3v2End");if(s)s.value=pickStart;if(e)e.value=pickEnd;const lbl=$("s3v2PeriodLabel");if(lbl)lbl.textContent=`${fmt(pickStart)} — ${fmt(pickEnd)}`;syncGlobalHeaderPeriod();close();$("s3v2Apply")?.click();}
  document.addEventListener("DOMContentLoaded",()=>{setTimeout(()=>{const s=$("s3v2Start")?.value,e=$("s3v2End")?.value;if(s&&e){const lbl=$("s3v2PeriodLabel");if(lbl)lbl.textContent=`${fmt(s)} — ${fmt(e)}`;syncGlobalHeaderPeriod();}},0);});
  document.addEventListener("erp:components-ready",()=>setTimeout(syncGlobalHeaderPeriod,0));
  document.addEventListener("click",e=>{if(e.target.closest("#s3v2PeriodOpen")){open();return;}if(e.target.closest("[data-s3period-close]")){close();return;}if(e.target.closest("#s3periodPrev")){shift(-1);return;}if(e.target.closest("#s3periodNext")){shift(1);return;}const day=e.target.closest("[data-s3period-day]");if(day){clickDay(day.getAttribute("data-s3period-day"));return;}if(e.target.closest("#s3periodUse")){apply();}});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")close();});
})();
