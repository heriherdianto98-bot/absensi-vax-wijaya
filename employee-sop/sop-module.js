(() => {
  "use strict";
  const DATA = window.VAX_SOP_DATA;
  if (!DATA) return;
  const isLocal = ["127.0.0.1","localhost"].includes(location.hostname);
  const $ = (s,root=document) => root.querySelector(s);
  const employeeId = () => Number(window.KaryawanSession?.resolveKaryawanId?.() || localStorage.getItem("karyawan_id") || 0);
  const token = () => String(window.KaryawanSession?.getToken?.() || localStorage.getItem("employee_session_token") || "");
  const roleRaw = () => String(localStorage.getItem("jabatan") || "").trim();
  const roleKey = () => /kasir/i.test(roleRaw()) ? "cashier" : /capster|barber|tukang/i.test(roleRaw()) ? "capster" : "general";
  const todayWib = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const localKey = (suffix) => `vax_sop_test2_${DATA.code}_${DATA.revision}_${employeeId()}_${suffix}`;
  let cardStatus = null;

  function roleLabel(){
    return roleKey()==="cashier" ? "Kasir" : roleKey()==="capster" ? "Capster" : (roleRaw() || "Karyawan");
  }
  function sopSections(){
    const key=roleKey();
    return key==="cashier" ? DATA.cashier.sections : key==="capster" ? DATA.capster.sections : [];
  }
  function dailyQuestions(){
    const key=roleKey();
    return DATA.daily[key] || [];
  }
  function mountCard(){
    if(document.getElementById("vaxSopCard")) return;
    const body=$(".dash-body"); if(!body) return;
    const card=document.createElement("section");
    card.id="vaxSopCard"; card.tabIndex=0; card.setAttribute("role","button");
    card.setAttribute("aria-label","Buka SOP Karyawan");
    card.innerHTML=`<div class="sop-card-head"><span class="sop-card-icon"><i class="fa-solid fa-clipboard-check"></i></span><div class="sop-card-copy"><h3>SOP Karyawan</h3><p>HRD-001 · Rev.00</p></div><span class="sop-card-status">Memuat…</span></div>`;
    const firstSection=body.firstElementChild;
    firstSection ? body.insertBefore(card,firstSection) : body.append(card);
    cardStatus=$(".sop-card-status",card);
    card.addEventListener("click",()=>openSop(false));
    card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openSop(false);}});
  }
  function modalShell(title,subtitle,mandatory=false){
    const old=document.getElementById("vaxSopOverlay"); if(old) old.remove();
    const overlay=document.createElement("div"); overlay.id="vaxSopOverlay"; overlay.className="vax-sop-overlay";
    overlay.innerHTML=`<section class="vax-sop-modal" role="dialog" aria-modal="true"><header class="vax-sop-head"><div><strong>${title}</strong><small>${subtitle}</small></div>${mandatory?"":'<button class="vax-sop-close" type="button" aria-label="Tutup">×</button>'}</header><div class="vax-sop-body"></div><footer class="vax-sop-actions"></footer></section>`;
    document.body.append(overlay); document.body.classList.add("vax-sop-lock");
    const close=()=>{overlay.remove();document.body.classList.remove("vax-sop-lock");};
    $(".vax-sop-close",overlay)?.addEventListener("click",close);
    return {overlay,body:$(".vax-sop-body",overlay),actions:$(".vax-sop-actions",overlay),close};
  }
  function sopHtml(){
    const sections=sopSections().map(s=>`<section class="vax-sop-section"><h4>${s.title}</h4><ul>${s.items.map(x=>`<li>${x}</li>`).join("")}</ul></section>`).join("");
    return `<div class="vax-sop-meta"><span>${DATA.code}</span><span>Revisi ${DATA.revision}</span><span>${roleLabel()}</span></div>${isLocal?'<div class="vax-sop-local-note">MODE LOKAL · belum menulis data ke Supabase produksi.</div>':""}${sections}<section class="vax-sop-general"><h4>Standar Pelayanan · Semua Karyawan</h4><ul>${DATA.general.map(x=>`<li>${x}</li>`).join("")}</ul></section>`;
  }
  function openSop(mandatory){
    const m=modalShell(mandatory?"Persetujuan SOP VAX WIJAYA":"SOP Karyawan",`${DATA.code} · Rev.${DATA.revision} · ${roleLabel()}`,mandatory);
    m.body.innerHTML=sopHtml();
    if(!mandatory){m.actions.innerHTML='<button class="vax-sop-primary" type="button">Tutup</button>';$(".vax-sop-primary",m.actions).onclick=m.close;return;}
    m.actions.innerHTML=`<label class="vax-sop-checkline"><input id="vaxSopAcceptCheck" type="checkbox"><span>Saya telah membaca, memahami, dan menyetujui untuk mematuhi SOP VAX WIJAYA.</span></label><button id="vaxSopAcceptBtn" class="vax-sop-primary" type="button" disabled>SETUJU & LANJUTKAN</button>`;
    const check=$("#vaxSopAcceptCheck",m.actions),btn=$("#vaxSopAcceptBtn",m.actions);
    check.onchange=()=>btn.disabled=!check.checked;
    btn.onclick=async()=>{btn.disabled=true;btn.textContent="Menyimpan…";try{await acceptSop();m.close();setStatus("SOP disetujui");await maybeDaily();}catch(e){btn.disabled=false;btn.textContent="SETUJU & LANJUTKAN";alert(e.message||"Gagal menyimpan persetujuan.");}};
  }
  function setStatus(text){if(cardStatus) cardStatus.textContent=text;}
  async function hasAccepted(){
    if(isLocal) return localStorage.getItem(localKey("accepted"))==="1";
    const {data,error}=await db.rpc("employee_sop_status_self",{p_token:token(),p_sop_code:DATA.code,p_revision:DATA.revision});
    if(error) throw error; return data?.accepted===true;
  }
  async function acceptSop(){
    if(isLocal){localStorage.setItem(localKey("accepted"),"1");localStorage.setItem(localKey("accepted_at"),new Date().toISOString());return;}
    const {data,error}=await db.rpc("employee_sop_accept_self",{p_token:token(),p_sop_code:DATA.code,p_revision:DATA.revision});
    if(error||data?.ok!==true) throw error||new Error(data?.reason||"Persetujuan gagal.");
  }
  async function attendedToday(){
    if(new URLSearchParams(location.search).get("sopDailyPreview")==="1" && isLocal) return true;
    const id=employeeId(); if(!id||typeof db==="undefined") return false;
    const {data,error}=await db.from("absensi").select("id,jam_masuk,jam_pulang").eq("karyawan_id",id).eq("tanggal",todayWib()).maybeSingle();
    return !error && !!data?.jam_masuk;
  }
  async function dailyDone(){
    const date=todayWib();
    if(isLocal) return localStorage.getItem(localKey("daily_"+date))==="1";
    const {data,error}=await db.rpc("employee_sop_daily_status_self",{p_token:token(),p_work_date:date,p_phase:"OPENING",p_sop_code:DATA.code,p_revision:DATA.revision});
    if(error) throw error; return data?.completed===true;
  }
  async function submitDaily(answers){
    const date=todayWib();
    if(isLocal){localStorage.setItem(localKey("daily_"+date),"1");localStorage.setItem(localKey("daily_answers_"+date),JSON.stringify({answers,completed_at:new Date().toISOString()}));return;}
    const {data,error}=await db.rpc("employee_sop_daily_submit_self",{p_token:token(),p_work_date:date,p_phase:"OPENING",p_sop_code:DATA.code,p_revision:DATA.revision,p_answers:answers,p_declaration:DATA.declarationCheck});
    if(error||data?.ok!==true) throw error||new Error(data?.reason||"Checklist gagal disimpan.");
  }
  async function maybeDaily(){
    const questions=dailyQuestions(); if(!questions.length){setStatus("SOP tersedia");return;}
    if(!(await attendedToday())){setStatus("Checklist setelah Absen Masuk");return;}
    if(await dailyDone()){setStatus("Checklist hari ini selesai");return;}
    openDaily(questions);
  }
  function openDaily(questions){
    const m=modalShell("Checklist SOP Hari Ini",`${roleLabel()} · ${todayWib()} · wajib setelah Absen Masuk`,true);
    m.body.innerHTML=`${isLocal?'<div class="vax-sop-local-note">MODE LOKAL · hasil checklist hanya disimpan di browser lokal.</div>':""}<div class="vax-sop-daily-list">${questions.map((q,i)=>`<label class="vax-sop-daily-item ${i===0?"is-active":"is-pending"}"><input type="checkbox" data-sop-q="${i}"><span>${q}</span></label>`).join("")}</div><div class="vax-sop-warning"><strong>Pernyataan Kepatuhan SOP</strong><br>${DATA.declaration}</div>`;
    m.actions.innerHTML=`<label class="vax-sop-checkline"><input id="vaxSopTruth" type="checkbox"><span>${DATA.declarationCheck}</span></label><button id="vaxSopDailyBtn" class="vax-sop-primary" type="button" disabled>SETUJUI & MULAI KERJA</button>`;
    const items=[...m.body.querySelectorAll(".vax-sop-daily-item")],boxes=[...m.body.querySelectorAll("[data-sop-q]")],truth=$("#vaxSopTruth",m.actions),btn=$("#vaxSopDailyBtn",m.actions);
    const revealNext=(index)=>{const next=items[index+1];if(!next)return;next.classList.remove("is-pending");next.classList.add("is-active");requestAnimationFrame(()=>next.scrollIntoView({behavior:"smooth",block:"nearest"}));};
    const sync=()=>btn.disabled=!(boxes.every(x=>x.checked)&&truth.checked);
    boxes.forEach((box,index)=>{box.addEventListener("change",()=>{if(box.checked){items[index]?.classList.remove("is-active");items[index]?.classList.add("is-done");revealNext(index);}else{items[index]?.classList.remove("is-done");items[index]?.classList.add("is-active");items.slice(index+1).forEach((item,j)=>{item.classList.remove("is-active","is-done");item.classList.add("is-pending");boxes[index+1+j].checked=false;});}sync();});items[index]?.addEventListener("click",(e)=>{if(!items[index]?.classList.contains("is-active")||box.checked)return;if(e.target===box)return;e.preventDefault();box.checked=true;box.dispatchEvent(new Event("change",{bubbles:true}));});});truth.addEventListener("change",sync);
    btn.onclick=async()=>{btn.disabled=true;btn.textContent="Menyimpan…";try{await submitDaily(boxes.map((x,i)=>({index:i,question:questions[i],checked:x.checked})));m.close();setStatus("Checklist hari ini selesai");}catch(e){btn.disabled=false;btn.textContent="SETUJUI & MULAI KERJA";alert(e.message||"Checklist gagal disimpan.");}};
  }
  async function boot(){
    mountCard();
    try{
      if(!(await hasAccepted())){setStatus("Persetujuan wajib");openSop(true);return;}
      setStatus("SOP disetujui");await maybeDaily();
    }catch(e){console.error("[VAX SOP]",e);setStatus("SOP belum tersambung");}
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>setTimeout(boot,250),{once:true});
  else setTimeout(boot,250);
})();