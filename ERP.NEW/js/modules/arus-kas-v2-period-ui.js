/* ARUS KAS V2 — CUSTOM PERIOD PICKER · UI ONLY
   Tidak mengubah engine / formula / data flow Arus Kas V2.
   Menggunakan #ak2Start dan #ak2End existing sebagai state canonical.
*/
"use strict";

const ArusKasV2PeriodUI = {
  viewDate:null,
  draftStart:null,
  draftEnd:null,

  pad(v){return String(v).padStart(2,"0")},
  iso(d){return `${d.getFullYear()}-${this.pad(d.getMonth()+1)}-${this.pad(d.getDate())}`},
  parse(iso){const [y,m,d]=String(iso||"").split("-").map(Number);return y&&m&&d?new Date(y,m-1,d):new Date()},
  fmt(iso){if(!iso)return"—";return new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric"}).format(this.parse(iso))},
  monthLabel(d){return new Intl.DateTimeFormat("id-ID",{month:"long",year:"numeric"}).format(d)},

  init(){
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
      <div class="ak2-period-pop-head">
        <button type="button" class="ak2-period-nav" data-ak2-month="-1">‹</button>
        <div><strong id="ak2PeriodMonth">—</strong><small>Pilih tanggal awal lalu tanggal akhir</small></div>
        <button type="button" class="ak2-period-nav" data-ak2-month="1">›</button>
      </div>
      <div class="ak2-period-week"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div>
      <div class="ak2-period-days" id="ak2PeriodDays"></div>
      <div class="ak2-period-foot">
        <div><span>Periode</span><strong id="ak2PeriodDraft">—</strong></div>
        <button type="button" class="ak2-period-today" id="ak2PeriodToday">Hari ini</button>
      </div>`;
    group.appendChild(pop);

    trigger.addEventListener("click",(e)=>{e.stopPropagation();this.toggle()});
    pop.addEventListener("click",e=>e.stopPropagation());
    pop.querySelectorAll("[data-ak2-month]").forEach(btn=>btn.addEventListener("click",()=>{this.viewDate.setMonth(this.viewDate.getMonth()+Number(btn.dataset.ak2Month));this.render()}));
    pop.querySelector("#ak2PeriodToday")?.addEventListener("click",()=>{const t=new Date();this.viewDate=new Date(t.getFullYear(),t.getMonth(),1);this.draftStart=this.iso(t);this.draftEnd=this.iso(t);this.apply()});
    document.addEventListener("click",()=>this.close());
    document.addEventListener("keydown",e=>{if(e.key==="Escape")this.close()});

    this.syncFromInputs();
  },

  syncFromInputs(){
    const start=document.getElementById("ak2Start")?.value,end=document.getElementById("ak2End")?.value;
    this.draftStart=start||null;this.draftEnd=end||null;
    const base=this.parse(start||end||new Date().toISOString().slice(0,10));
    this.viewDate=new Date(base.getFullYear(),base.getMonth(),1);
    this.updateText();
  },

  toggle(){
    const pop=document.getElementById("ak2PeriodPopover");if(!pop)return;
    if(pop.hidden){this.syncFromInputs();pop.hidden=false;this.render();document.getElementById("ak2PeriodTrigger")?.classList.add("is-open")}
    else this.close();
  },
  close(){const pop=document.getElementById("ak2PeriodPopover");if(pop)pop.hidden=true;document.getElementById("ak2PeriodTrigger")?.classList.remove("is-open")},

  render(){
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
  }
};

if(typeof window!=="undefined")window.ArusKasV2PeriodUI=ArusKasV2PeriodUI;
