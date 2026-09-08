/* ARUS KAS V2 — MODAL DATEPICKER UI ONLY
   Custom themed calendar for modal date fields.
   Does not change Arus Kas engine, save logic, formulas, queries, or data flow.
*/
"use strict";

const ArusKasV2ModalDatepickerUI={
  active:null,
  view:null,

  pad(v){return String(v).padStart(2,"0")},
  iso(d){return `${d.getFullYear()}-${this.pad(d.getMonth()+1)}-${this.pad(d.getDate())}`},
  parse(v){const [y,m,d]=String(v||"").split("-").map(Number);return y&&m&&d?new Date(y,m-1,d):new Date()},
  fmt(v){if(!v)return"Pilih tanggal";return new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric"}).format(this.parse(v))},
  monthLabel(d){return new Intl.DateTimeFormat("id-ID",{month:"long",year:"numeric"}).format(d)},

  installStyle(){
    if(document.getElementById("ak2ModalDateUiStyle"))return;
    const s=document.createElement("style");
    s.id="ak2ModalDateUiStyle";
    s.textContent=`
      #ak2Modal label.ak2-date-ui{position:relative}
      #ak2Modal label.ak2-date-ui>input[type="date"]{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;left:0!important;bottom:0!important}
      .ak2-date-trigger{width:100%;min-height:56px;display:flex;align-items:center;gap:12px;padding:0 15px;border-radius:11px;border:1px solid #8b692b;background:linear-gradient(180deg,#1b2632,#151d26);color:#fff1c5;font:inherit;font-weight:900;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 0 0 1px rgba(215,170,85,.03);transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
      .ak2-date-trigger:hover,.ak2-date-trigger.is-open{border-color:#d7aa55;background:linear-gradient(180deg,#202b36,#171e26);box-shadow:0 0 0 2px rgba(200,155,67,.10),0 8px 22px rgba(0,0,0,.22)}
      .ak2-date-trigger .ak2-date-icon{color:#e0b254;font-size:18px;flex:0 0 auto}
      .ak2-date-trigger .ak2-date-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:21px!important;line-height:1.1;font-weight:900;letter-spacing:.01em;text-transform:none;color:#fff1c5}
      .ak2-date-trigger .ak2-date-caret{margin-left:auto;color:#d7aa55;font-size:14px;flex:0 0 auto}
      .ak2-date-pop{position:absolute;left:0;top:calc(100% + 7px);z-index:2605;width:310px;padding:12px;border-radius:15px;border:1px solid #765a27;background:radial-gradient(circle at 15% 0%,rgba(211,165,78,.10),transparent 34%),linear-gradient(180deg,#151d26,#0d1319);box-shadow:0 22px 55px rgba(0,0,0,.60),0 0 24px rgba(205,159,70,.09),inset 0 1px 0 rgba(255,255,255,.035)}
      .ak2-date-pop[hidden]{display:none!important}
      .ak2-date-pop-head{display:grid;grid-template-columns:36px 1fr 36px;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid rgba(213,170,84,.20)}
      .ak2-date-pop-head strong{text-align:center;color:#f6f3eb;font-size:14px;text-transform:capitalize}
      .ak2-date-nav{width:34px;height:34px;border:1px solid #3d4854;border-radius:9px;background:#111820;color:#f0c66d;font-size:21px;cursor:pointer}
      .ak2-date-nav:hover{border-color:#b98934;background:#201a10;box-shadow:0 0 12px rgba(207,160,67,.14)}
      .ak2-date-week,.ak2-date-days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
      .ak2-date-week{padding:10px 1px 5px}.ak2-date-week span{text-align:center;color:#7f8a95;font-size:9px;font-weight:900;text-transform:uppercase}
      .ak2-date-day{height:32px;border:0;border-radius:8px;background:transparent;color:#e8edf2;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
      .ak2-date-day:hover{background:#202b35;color:#fff;box-shadow:inset 0 0 0 1px rgba(214,171,83,.18)}
      .ak2-date-day.is-muted{color:#46515c}.ak2-date-day.is-today{box-shadow:inset 0 0 0 1px rgba(83,157,211,.48);color:#bfe6ff}
      .ak2-date-day.is-selected{background:linear-gradient(180deg,#e4b653,#9d6f20);color:#101216;box-shadow:0 0 16px rgba(221,173,75,.28)}
      .ak2-date-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:9px;padding-top:9px;border-top:1px solid rgba(213,170,84,.20)}
      .ak2-date-foot small{color:#8d98a3;font-size:10px}.ak2-date-foot strong{display:block;color:#f1cf83;font-size:11px;margin-top:1px}
      .ak2-date-today{border:1px solid #66512b;border-radius:8px;background:#211a0f;color:#f2ce7a;padding:6px 9px;font:inherit;font-size:11px;font-weight:900;cursor:pointer}
      .ak2-date-today:hover{border-color:#c7973f;background:#2a2010}
      @media(max-width:760px){
        .ak2-date-trigger{min-height:52px;padding:0 13px}
        .ak2-date-trigger .ak2-date-text{font-size:19px!important}
        .ak2-date-pop{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(330px,calc(100vw - 28px))}
      }
    `;
    document.head.appendChild(s);
  },

  enhance(input){
    if(!input||input.dataset.ak2DateUi==="1")return;
    const label=input.closest("label");if(!label)return;
    input.dataset.ak2DateUi="1";label.classList.add("ak2-date-ui");
    const trigger=document.createElement("button");
    trigger.type="button";trigger.className="ak2-date-trigger";
    trigger.innerHTML=`<span class="ak2-date-icon">▦</span><span class="ak2-date-text">${this.fmt(input.value)}</span><span class="ak2-date-caret">⌄</span>`;
    input.insertAdjacentElement("afterend",trigger);
    trigger.addEventListener("click",e=>{e.stopPropagation();this.open(input,trigger)});
    input.addEventListener("change",()=>this.syncTrigger(input));
  },

  syncTrigger(input){
    const trigger=input?.nextElementSibling;
    const text=trigger?.querySelector?.(".ak2-date-text");
    if(text)text.textContent=this.fmt(input.value);
  },

  ensurePopover(){
    let pop=document.getElementById("ak2ModalDatePopover");
    if(pop)return pop;
    pop=document.createElement("div");pop.id="ak2ModalDatePopover";pop.className="ak2-date-pop";pop.hidden=true;
    pop.innerHTML=`
      <div class="ak2-date-pop-head"><button type="button" class="ak2-date-nav" data-move="-1">‹</button><strong id="ak2ModalDateMonth">—</strong><button type="button" class="ak2-date-nav" data-move="1">›</button></div>
      <div class="ak2-date-week"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div>
      <div class="ak2-date-days" id="ak2ModalDateDays"></div>
      <div class="ak2-date-foot"><div><small>Tanggal dipilih</small><strong id="ak2ModalDateValue">—</strong></div><button type="button" class="ak2-date-today" id="ak2ModalDateToday">Hari ini</button></div>`;
    pop.addEventListener("click",e=>e.stopPropagation());
    pop.querySelectorAll("[data-move]").forEach(b=>b.addEventListener("click",()=>{this.view.setMonth(this.view.getMonth()+Number(b.dataset.move));this.render()}));
    pop.querySelector("#ak2ModalDateToday").addEventListener("click",()=>this.select(this.iso(new Date())));
    document.body.appendChild(pop);return pop;
  },

  open(input,trigger){
    const pop=this.ensurePopover();
    this.active={input,trigger};
    const base=this.parse(input.value||this.iso(new Date()));this.view=new Date(base.getFullYear(),base.getMonth(),1);
    document.querySelectorAll(".ak2-date-trigger.is-open").forEach(x=>x.classList.remove("is-open"));trigger.classList.add("is-open");
    const r=trigger.getBoundingClientRect();
    pop.style.position="fixed";pop.style.left=`${Math.min(r.left,window.innerWidth-325)}px`;pop.style.top=`${Math.min(r.bottom+7,window.innerHeight-365)}px`;pop.hidden=false;
    this.render();
  },

  close(){const pop=document.getElementById("ak2ModalDatePopover");if(pop)pop.hidden=true;document.querySelectorAll(".ak2-date-trigger.is-open").forEach(x=>x.classList.remove("is-open"));this.active=null},

  render(){
    if(!this.active||!this.view)return;
    const pop=this.ensurePopover(),title=pop.querySelector("#ak2ModalDateMonth"),days=pop.querySelector("#ak2ModalDateDays"),value=pop.querySelector("#ak2ModalDateValue");
    title.textContent=this.monthLabel(this.view);value.textContent=this.fmt(this.active.input.value);
    const y=this.view.getFullYear(),m=this.view.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7,count=new Date(y,m+1,0).getDate(),prevCount=new Date(y,m,0).getDate(),today=this.iso(new Date()),selected=this.active.input.value;
    const html=[];
    for(let i=0;i<42;i++){
      let d,muted=false;
      if(i<offset){d=new Date(y,m-1,prevCount-offset+i+1);muted=true}else if(i>=offset+count){d=new Date(y,m+1,i-offset-count+1);muted=true}else d=new Date(y,m,i-offset+1);
      const iso=this.iso(d);
      html.push(`<button type="button" class="ak2-date-day${muted?' is-muted':''}${iso===today?' is-today':''}${iso===selected?' is-selected':''}" data-date="${iso}">${d.getDate()}</button>`);
    }
    days.innerHTML=html.join("");days.querySelectorAll("[data-date]").forEach(b=>b.addEventListener("click",()=>this.select(b.dataset.date)));
  },

  select(iso){
    if(!this.active)return;
    const input=this.active.input;input.value=iso;input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));this.syncTrigger(input);this.close();
  },

  refresh(){["ak2Tanggal","ak2SourceStart","ak2SourceEnd"].forEach(id=>{const el=document.getElementById(id);if(el){this.enhance(el);this.syncTrigger(el)}})},

  init(){
    this.installStyle();this.refresh();
    document.getElementById("ak2Input")?.addEventListener("click",()=>setTimeout(()=>this.refresh(),0));
    document.addEventListener("click",()=>this.close());
    document.addEventListener("keydown",e=>{if(e.key==="Escape")this.close()});
    new MutationObserver(()=>this.refresh()).observe(document.getElementById("ak2Modal")||document.body,{attributes:true,subtree:true,attributeFilter:["hidden"]});
  }
};

function loadArusKasDetailUi(){
  if(!document.querySelector('link[data-ak2-detail-theme]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="../styles/arus-kas-v2-detail-ui.css";
    link.dataset.ak2DetailTheme="1";
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-ak2-ledger-detail-ui]')){
    const script=document.createElement("script");
    script.src="../js/modules/arus-kas-v2-nett-product-detail-ui.js";
    script.dataset.ak2LedgerDetailUi="1";
    document.body.appendChild(script);
  }
}

if(typeof window!=="undefined"){
  window.ArusKasV2ModalDatepickerUI=ArusKasV2ModalDatepickerUI;
  document.addEventListener("DOMContentLoaded",()=>{
    ArusKasV2ModalDatepickerUI.init();
    loadArusKasDetailUi();
  },{once:true});
}
