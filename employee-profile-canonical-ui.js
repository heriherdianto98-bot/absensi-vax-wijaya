/* ERP VAX — canonical Employee Profile presentation helper
   Source of truth: approved Absensi profile date presentation.
   UI only; no employee/payroll/attendance writes. */
(() => {
  "use strict";

  function isoWib(){
    const parts=new Intl.DateTimeFormat("en-US",{
      timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(new Date());
    const part=(type)=>parts.find(item=>item.type===type)?.value||"";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  function renderDate(profile){
    if(!profile || profile.querySelector(".profile-meta-date")) return;
    const dateMeta=document.createElement("div");
    dateMeta.className="profile-meta-date";
    dateMeta.setAttribute("aria-label","Tanggal hari ini");

    const render=()=>{
      const iso=isoWib();
      const date=new Date(`${iso}T12:00:00Z`);
      const hari=new Intl.DateTimeFormat("id-ID",{timeZone:"UTC",weekday:"long"}).format(date);
      const bulan=new Intl.DateTimeFormat("id-ID",{timeZone:"UTC",month:"short",year:"numeric"}).format(date);
      dateMeta.innerHTML=`<small>${hari}</small><strong>${Number(iso.slice(8))}</strong><span>${bulan}</span>`;
    };

    const branch=profile.querySelector(".profile-branch");
    if(branch) profile.insertBefore(dateMeta,branch);
    else profile.appendChild(dateMeta);
    render();
    window.setInterval(render,60000);
  }


  function bindNameTypewriter(profile){
    const nameEl=profile?.querySelector(".profile-copy h1");
    if(!nameEl || nameEl.dataset.canonicalTypingBound==="1") return;
    nameEl.dataset.canonicalTypingBound="1";

    let timer=0;
    let internalWrite=false;
    let lastTyped="";

    const isPlaceholder=(value)=>{
      const text=String(value||"").trim();
      return !text || /^(loading\.\.\.|loading|memuat\.\.\.|memuat|—|-)$/i.test(text);
    };

    const typeName=(value)=>{
      const full=String(value||"").replace(/\s+/g," ").trim();
      if(isPlaceholder(full) || full===lastTyped) return;

      window.clearTimeout(timer);
      internalWrite=true;
      nameEl.classList.add("employee-name-typing");
      nameEl.textContent="";
      internalWrite=false;

      let index=0;
      const step=()=>{
        index+=1;
        internalWrite=true;
        nameEl.textContent=full.slice(0,index);
        internalWrite=false;

        if(index<full.length){
          timer=window.setTimeout(step,58);
        }else{
          lastTyped=full;
          timer=window.setTimeout(()=>{
            nameEl.classList.remove("employee-name-typing");
          },420);
        }
      };
      timer=window.setTimeout(step,90);
    };

    const observer=new MutationObserver(()=>{
      if(internalWrite) return;
      const current=String(nameEl.textContent||"").trim();
      if(!isPlaceholder(current) && current!==lastTyped){
        typeName(current);
      }
    });

    observer.observe(nameEl,{childList:true,characterData:true,subtree:true});

    const initial=String(nameEl.textContent||"").trim();
    if(!isPlaceholder(initial)) typeName(initial);
  }

  function init(){
    document.querySelectorAll(".app .employee-profile-canonical").forEach((profile)=>{
      renderDate(profile);
      bindNameTypewriter(profile);
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init,{once:true});
  }else{
    init();
  }
})();