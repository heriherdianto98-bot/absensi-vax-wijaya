/* ARUS KAS V2 — CUSTOM PERIOD PICKER · UI ONLY
   Tidak mengubah engine / formula / data flow Arus Kas V2.
   Menggunakan #ak2Start dan #ak2End existing sebagai state canonical.
*/
"use strict";

const ArusKasV2PeriodUI = {
  viewDate:null,
  draftStart:null,
  draftEnd:null,
  mode:"CUSTOM",

  pad(v){return String(v).padStart(2,"0")},
  iso(d){return `${d.getFullYear()}-${this.pad(d.getMonth()+1)}-${this.pad(d.getDate())}`},
  parse(iso){const [y,m,d]=String(iso||"").split("-").map(Number);return y&&m&&d?new Date(y,m-1,d):new Date()},
  fmt(iso){if(!iso)return"—";return new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric"}).format(this.parse(iso))},
  monthLabel(d){return new Intl.DateTimeFormat("id-ID",{month:"long",year:"numeric"}).format(d)},
  monthNames:["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"],

  installStyle(){
    if(document.getElementById("ak2PeriodUiStyle"))return;
    const style=document.createElement("style");
    style.id="ak2PeriodUiStyle";
    style.textContent=`
      .ak2-native-date-hidden{display:none!important}
      body.page-arus-kas .ak2-toolbar{position:relative!important;z-index:2600!important;overflow:visible!important}
      body.page-arus-kas .ak2-toolbar .ak2-filter-group:first-child{position:relative!important;z-index:2610!important;min-width:330px;overflow:visible!important}
      body.page-arus-kas .ak2-ledger-card,
      body.page-arus-kas .ak2-table-wrap,
      body.page-arus-kas .ak2-table,
      body.page-arus-kas .ak2-table thead{position:relative;z-index:auto!important}
      .ak2-period-trigger{width:100%;min-width:270px;display:flex;align-items:center;gap:10px;border:1px solid #465361;background:linear-gradient(180deg,#17202a,#10161d);color:#f7f9fb;border-radius:10px;padding:10px 12px;font:inherit;font-weight:800;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
      .ak2-period-trigger:hover,.ak2-period-trigger.is-open{border-color:#c69a43;box-shadow:0 0 0 2px rgba(198,154,67,.10),0 8px 24px rgba(0,0,0,.22)}
      .ak2-period-icon{color:#e2b555;font-size:16px}.ak2-period-caret{margin-left:auto;color:#d7aa55}
      body.page-arus-kas .ak2-period-popover{position:absolute;left:0;top:calc(100% + 10px);z-index:9999!important;width:408px;padding:16px;background:linear-gradient(180deg,#151c24,#0f141a);border:1px solid #6b542b;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,255,255,.04);overflow:hidden}
      .ak2-period-popover[hidden]{display:none!important}
      .ak2-period-mode{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:11px;padding:4px;background:#0d1319;border:1px solid rgba(210,164,74,.18);border-radius:10px}
      .ak2-period-mode-btn{height:34px;border:0;border-radius:7px;background:transparent;color:#8e99a5;font:inherit;font-size:12px;font-weight:900;cursor:pointer}
      .ak2-period-mode-btn.is-active{background:linear-gradient(180deg,#5a431a,#34260f);color:#ffe09a;box-shadow:inset 0 0 0 1px #8e6828}
      .ak2-period-month-panel{display:grid;grid-template-columns:1fr 92px auto;gap:7px;align-items:center;margin-bottom:11px}
      .ak2-period-month-panel[hidden]{display:none!important}
      .ak2-period-select{height:38px;min-width:0;border:1px solid #3b4855;border-radius:9px;background:#111820;color:#f1f4f7;padding:0 9px;font:inherit;font-size:12px;font-weight:850;outline:none}
      .ak2-period-select:focus{border-color:#b98a35;box-shadow:0 0 0 2px rgba(185,138,53,.10)}
      .ak2-period-apply-month{height:38px;border:1px solid #8c692b;border-radius:9px;background:linear-gradient(180deg,#5a431a,#34260f);color:#ffe09a;padding:0 12px;font:inherit;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap}
      .ak2-period-custom-panel[hidden]{display:none!important}
      .ak2-period-pop-head{display:grid;grid-template-columns:38px 1fr 38px;gap:10px;align-items:center;padding-bottom:11px;border-bottom:1px solid rgba(210,164,74,.22)}
      .ak2-period-pop-head>div{text-align:center}.ak2-period-pop-head strong{display:block;font-size:16px;text-transform:capitalize}.ak2-period-pop-head small{display:block;margin-top:2px;color:#8f98a3;font-size:11px}
      .ak2-period-nav{width:36px;height:36px;border-radius:10px;border:1px solid #39434e;background:#111820;color:#e9c06b;font-size:24px;cursor:pointer}
      .ak2-period-nav:hover{border-color:#b98a35;background:#1c1a13}
      .ak2-period-week,.ak2-period-days{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
      .ak2-period-week{padding:12px 2px 7px}.ak2-period-week span{text-align:center;color:#9ba3ad;font-size:10px;font-weight:900;text-transform:uppercase}
      .ak2-period-days{position:relative;z-index:1}
      .ak2-period-day{height:38px;border:0;border-radius:9px;background:transparent;color:#e9edf1;font-weight:800;cursor:pointer;position:relative;z-index:1}
      .ak2-period-day:hover{background:#202832;color:#fff}.ak2-period-day.is-muted{color:#515b66}.ak2-period-day.is-range{background:rgba(210,164,74,.15);color:#ffe2a0;border-radius:5px}
      .ak2-period-day.is-start,.ak2-period-day.is-end{background:linear-gradient(180deg,#e0b04f,#9b6d1f);color:#111;box-shadow:0 0 18px rgba(218,170,74,.28)}
      .ak2-period-foot{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:10px;padding-top:11px;border-top:1px solid rgba(210,164,74,.22)}
      .ak2-period-foot>div{display:flex;flex-direction:column;min-width:0}.ak2-period-foot span{font-size:9px;color:#8e97a2;text-transform:uppercase;font-weight:900;letter-spacing:.08em}.ak2-period-foot strong{margin-top:2px;font-size:11px;color:#f2d28b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:245px}
      .ak2-period-today{border:1px solid #62502b;background:#221b0f;color:#f2ce7b;border-radius:9px;padding:7px 10px;font-weight:800;cursor:pointer}
      #ak2Reload[hidden]{display:none!important}
      @media(max-width:760px){.ak2-toolbar .ak2-filter-group:first-child{min-width:100%;width:100%}.ak2-period-trigger{min-width:0}.ak2-period-popover{position:fixed!important;left:12px!important;right:12px!important;top:150px!important;width:auto!important;max-width:420px;margin:auto}.ak2-period-month-panel{grid-template-columns:1fr 86px}.ak2-period-apply-month{grid-column:1/-1}}
      @media print{.ak2-period-popover{display:none!important}.ak2-period-trigger{border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;color:#111!important}.ak2-period-icon,.ak2-period-caret{display:none!important}}
    `;
    document.head.appendChild(style);
  },

  init(){
    this.installStyle();
    const start=document.getElementById("ak2Start"),end=document.getElementById("ak2End"),reload=document.getElementById("ak2Reload");
    const group=start?.closest(".ak2-filter-group");
    if(!start||!end||!group||group.dataset.ak2PeriodUi==="1")return;
    group.dataset.ak2PeriodUi="1";

    start.classList.add("ak2-native-date-hidden");
    end.classList.add("ak2-native-date-hidden");
    const dash=[...group.children].find(el=>el.tagName==="SPAN");
    if(dash)dash.classList.add("ak2-native-date-hidden");
    if(reload)reload.hidden=true;

    const trigger=document.createElement("button");
    trigger.type="button";
    trigger.id="ak2PeriodTrigger";
    trigger.className="ak2-period-trigger";
    trigger.innerHTML='<span class="ak2-period-icon">▦</span><span id="ak2PeriodText">—</span><span class="ak2-period-caret">⌄</span>';
    group.appendChild(trigger);

    const pop=document.createElement("div");
    pop.id="ak2PeriodPopover";
    pop.className="ak2-period-popover";
    pop.hidden=true;
    pop.innerHTML=`
      <div class="ak2-period-mode" role="tablist" aria-label="Mode periode">
        <button type="button" class="ak2-period-mode-btn" data-ak2-period-mode="MONTH">Pilih Bulan</button>
        <button type="button" class="ak2-period-mode-btn is-active" data-ak2-period-mode="CUSTOM">Custom Tanggal</button>
      </div>
      <div class="ak2-period-month-panel" id="ak2PeriodMonthPanel" hidden>
        <select class="ak2-period-select" id="ak2PeriodMonthSelect" aria-label="Pilih bulan"></select>
        <select class="ak2-period-select" id="ak2PeriodYearSelect" aria-label="Pilih tahun"></select>
        <button type="button" class="ak2-period-apply-month" id="ak2PeriodApplyMonth">Tampilkan Bulan</button>
      </div>
      <div class="ak2-period-custom-panel" id="ak2PeriodCustomPanel">
        <div class="ak2-period-pop-head">
          <button type="button" class="ak2-period-nav" data-ak2-month="-1">‹</button>
          <div><strong id="ak2PeriodMonth">—</strong><small>Pilih tanggal awal lalu tanggal akhir</small></div>
          <button type="button" class="ak2-period-nav" data-ak2-month="1">›</button>
        </div>
        <div class="ak2-period-week"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div>
        <div class="ak2-period-days" id="ak2PeriodDays"></div>
      </div>
      <div class="ak2-period-foot">
        <div><span>Periode</span><strong id="ak2PeriodDraft">—</strong></div>
        <button type="button" class="ak2-period-today" id="ak2PeriodToday">Hari ini</button>
      </div>`;
    group.appendChild(pop);

    trigger.addEventListener("click",(e)=>{e.stopPropagation();this.toggle()});
    pop.addEventListener("click",e=>e.stopPropagation());
    pop.querySelectorAll("[data-ak2-month]").forEach(btn=>btn.addEventListener("click",()=>{this.viewDate.setMonth(this.viewDate.getMonth()+Number(btn.dataset.ak2Month));this.render()}));
    pop.querySelectorAll("[data-ak2-period-mode]").forEach(btn=>btn.addEventListener("click",()=>this.setMode(btn.dataset.ak2PeriodMode)));
    pop.querySelector("#ak2PeriodToday")?.addEventListener("click",()=>{const t=new Date();this.viewDate=new Date(t.getFullYear(),t.getMonth(),1);this.draftStart=this.iso(t);this.draftEnd=this.iso(t);this.apply()});
    pop.querySelector("#ak2PeriodApplyMonth")?.addEventListener("click",()=>this.applySelectedMonth());
    pop.querySelector("#ak2PeriodMonthSelect")?.addEventListener("change",()=>this.syncMonthViewFromSelect());
    pop.querySelector("#ak2PeriodYearSelect")?.addEventListener("change",()=>this.syncMonthViewFromSelect());
    document.addEventListener("click",()=>this.close());
    document.addEventListener("keydown",e=>{if(e.key==="Escape")this.close()});

    this.populateMonthYear();
    this.syncFromInputs();
  },

  populateMonthYear(){
    const month=document.getElementById("ak2PeriodMonthSelect"),year=document.getElementById("ak2PeriodYearSelect");
    if(month&&!month.options.length){
      month.innerHTML=this.monthNames.map((name,i)=>`<option value="${i}">${name}</option>`).join("");
    }
    if(year&&!year.options.length){
      const now=new Date().getFullYear();
      const years=[];
      for(let y=now-5;y<=now+2;y++)years.push(`<option value="${y}">${y}</option>`);
      year.innerHTML=years.join("");
    }
  },

  setMode(mode){
    this.mode=mode==="MONTH"?"MONTH":"CUSTOM";
    document.querySelectorAll("[data-ak2-period-mode]").forEach(btn=>btn.classList.toggle("is-active",btn.dataset.ak2PeriodMode===this.mode));
    const monthPanel=document.getElementById("ak2PeriodMonthPanel"),customPanel=document.getElementById("ak2PeriodCustomPanel");
    if(monthPanel)monthPanel.hidden=this.mode!=="MONTH";
    if(customPanel)customPanel.hidden=this.mode!=="CUSTOM";
    if(this.mode==="MONTH")this.syncMonthSelectFromView();
    else this.render();
  },

  syncMonthSelectFromView(){
    this.populateMonthYear();
    const month=document.getElementById("ak2PeriodMonthSelect"),year=document.getElementById("ak2PeriodYearSelect");
    const d=this.viewDate||new Date();
    if(month)month.value=String(d.getMonth());
    if(year){
      const y=String(d.getFullYear());
      if(![...year.options].some(o=>o.value===y))year.add(new Option(y,y));
      year.value=y;
    }
    const draft=document.getElementById("ak2PeriodDraft");
    if(draft)draft.textContent=`${this.monthNames[d.getMonth()]} ${d.getFullYear()}`;
  },

  syncMonthViewFromSelect(){
    const month=Number(document.getElementById("ak2PeriodMonthSelect")?.value),year=Number(document.getElementById("ak2PeriodYearSelect")?.value);
    if(Number.isFinite(month)&&year)this.viewDate=new Date(year,month,1);
    this.syncMonthSelectFromView();
  },

  applySelectedMonth(){
    const month=Number(document.getElementById("ak2PeriodMonthSelect")?.value),year=Number(document.getElementById("ak2PeriodYearSelect")?.value);
    if(!Number.isFinite(month)||!year)return;
    this.viewDate=new Date(year,month,1);
    this.draftStart=this.iso(new Date(year,month,1));
    this.draftEnd=this.iso(new Date(year,month+1,0));
    this.apply();
  },

  syncFromInputs(){
    const start=document.getElementById("ak2Start")?.value,end=document.getElementById("ak2End")?.value;
    this.draftStart=start||null;this.draftEnd=end||null;
    const base=this.parse(start||end||new Date().toISOString().slice(0,10));
    this.viewDate=new Date(base.getFullYear(),base.getMonth(),1);
    this.populateMonthYear();
    this.syncMonthSelectFromView();
    this.updateText();
  },

  toggle(){
    const pop=document.getElementById("ak2PeriodPopover");if(!pop)return;
    if(pop.hidden){this.syncFromInputs();pop.hidden=false;this.setMode(this.mode);document.getElementById("ak2PeriodTrigger")?.classList.add("is-open")}
    else this.close();
  },
  close(){const pop=document.getElementById("ak2PeriodPopover");if(pop)pop.hidden=true;document.getElementById("ak2PeriodTrigger")?.classList.remove("is-open")},

  render(){
    if(this.mode!=="CUSTOM")return;
    const label=document.getElementById("ak2PeriodMonth"),days=document.getElementById("ak2PeriodDays"),draft=document.getElementById("ak2PeriodDraft");
    if(!label||!days)return;
    label.textContent=this.monthLabel(this.viewDate);
    const y=this.viewDate.getFullYear(),m=this.viewDate.getMonth();
    const first=new Date(y,m,1);const offset=(first.getDay()+6)%7;const count=new Date(y,m+1,0).getDate();
    const prevCount=new Date(y,m,0).getDate();
    const cells=[];
    for(let i=0;i<42;i++){
      let d,muted=false;
      if(i<offset){d=new Date(y,m-1,prevCount-offset+i+1);muted=true}
      else if(i>=offset+count){d=new Date(y,m+1,i-offset-count+1);muted=true}
      else d=new Date(y,m,i-offset+1);
      const iso=this.iso(d);const selectedStart=iso===this.draftStart,selectedEnd=iso===this.draftEnd;
      const inRange=this.draftStart&&this.draftEnd&&iso>this.draftStart&&iso<this.draftEnd;
      cells.push(`<button type="button" class="ak2-period-day${muted?' is-muted':''}${inRange?' is-range':''}${selectedStart?' is-start':''}${selectedEnd?' is-end':''}" data-date="${iso}">${d.getDate()}</button>`);
    }
    days.innerHTML=cells.join("");
    days.querySelectorAll("[data-date]").forEach(btn=>btn.addEventListener("click",()=>this.pick(btn.dataset.date)));
    if(draft)draft.textContent=this.draftStart?(this.draftEnd?`${this.fmt(this.draftStart)} — ${this.fmt(this.draftEnd)}`:`${this.fmt(this.draftStart)} — pilih akhir`):"Pilih tanggal awal";
  },

  pick(iso){
    if(!this.draftStart||this.draftEnd){this.draftStart=iso;this.draftEnd=null;this.render();return}
    if(iso<this.draftStart){this.draftEnd=this.draftStart;this.draftStart=iso}else this.draftEnd=iso;
    this.apply();
  },

  async apply(){
    if(!this.draftStart||!this.draftEnd)return;
    const start=document.getElementById("ak2Start"),end=document.getElementById("ak2End");
    if(!start||!end)return;
    start.value=this.draftStart;end.value=this.draftEnd;
    this.updateText();this.close();
    start.dispatchEvent(new Event("change",{bubbles:true}));end.dispatchEvent(new Event("change",{bubbles:true}));
    if(typeof ArusKasV2!=="undefined"&&typeof ArusKasV2.reload==="function")await ArusKasV2.reload();
  },

  updateText(){
    const start=document.getElementById("ak2Start")?.value,end=document.getElementById("ak2End")?.value,text=document.getElementById("ak2PeriodText");
    if(text)text.textContent=start&&end?`${this.fmt(start)} — ${this.fmt(end)}`:"Pilih periode";
  },

  autoInit(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const start=document.getElementById("ak2Start"),end=document.getElementById("ak2End");
      if(start?.value&&end?.value){clearInterval(timer);this.init()}
      else if(tries>80)clearInterval(timer);
    },100);
  }
};

if(typeof window!=="undefined"){
  window.ArusKasV2PeriodUI=ArusKasV2PeriodUI;
  document.addEventListener("erp:finance-ready",()=>ArusKasV2PeriodUI.autoInit());
}
