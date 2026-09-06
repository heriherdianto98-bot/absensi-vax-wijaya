/* ERP VAX — ERP Assistant Screen Help
   Lightweight screen-context help. No OCR, no external AI, no server dependency.
*/
"use strict";

const ErpAssistantScreenHelp={
  KEY:"erpAssistantScreenHelpContextV1",
  defs:null,
  context:null,

  async loadDefs(){
    if(this.defs)return this.defs;
    try{
      const r=await fetch("../knowledge/erp-assistant-screen-help.json",{cache:"no-store"});
      if(!r.ok)throw new Error("screen help knowledge unavailable");
      this.defs=await r.json();
    }catch(err){
      console.warn("ERP Assistant screen help knowledge skipped",err);
      this.defs={screens:[]};
    }
    return this.defs;
  },

  readContext(){
    try{this.context=JSON.parse(sessionStorage.getItem(this.KEY)||"null")}catch(_e){this.context=null}
    return this.context;
  },

  saveContext(ctx){
    this.context={...ctx,captured_at:new Date().toISOString()};
    sessionStorage.setItem(this.KEY,JSON.stringify(this.context));
  },

  getScreen(){
    const id=this.context?.screen_id;
    return (this.defs?.screens||[]).find(x=>x.id===id)||null;
  },

  valueLabel(id){
    const el=document.getElementById(id);
    if(!el)return "";
    if(el.tagName==="SELECT")return el.options?.[el.selectedIndex]?.textContent?.trim()||el.value||"";
    return el.value||"";
  },

  captureArusKasManual(){
    this.saveContext({
      screen_id:"ARUS_KAS_MANUAL_INPUT",
      module_id:"ARUS_KAS_V2",
      source_path:location.pathname,
      values:{
        tanggal:this.valueLabel("ak2Tanggal"),
        jenis:this.valueLabel("ak2Jenis"),
        kategori:this.valueLabel("ak2Kategori"),
        wallet:this.valueLabel("ak2Wallet"),
        nominal:this.valueLabel("ak2Nominal"),
        keterangan:this.valueLabel("ak2Keterangan"),
        periode_sumber_awal:this.valueLabel("ak2SourceStart"),
        periode_sumber_akhir:this.valueLabel("ak2SourceEnd")
      }
    });
  },

  bindSourcePage(){
    if(!document.body.classList.contains("page-arus-kas"))return;
    const actions=document.querySelector("#ak2Modal .ak2-modal-actions");
    if(!actions||document.getElementById("ak2ScreenHelpBtn"))return;
    const btn=document.createElement("button");
    btn.type="button";
    btn.id="ak2ScreenHelpBtn";
    btn.className="ak2-btn ak2-btn-primary";
    btn.textContent="? Cara Isi";
    btn.title="Buka ERP Assistant untuk bantuan layar ini";
    btn.addEventListener("click",()=>{
      this.captureArusKasManual();
      location.href="./erp-assistant.html?screenHelp=1";
    });
    actions.prepend(btn);
  },

  escape(v){
    const d=document.createElement("div");
    d.textContent=String(v??"");
    return d.innerHTML;
  },

  fieldMatch(screen,query){
    const q=(window.ErpAssistant?.expand?.(query)||String(query||"").toLowerCase());
    let best=null,bestScore=0;
    for(const f of (screen?.fields||[])){
      const phrases=[f.label,...(f.aliases||[])];
      let score=0;
      for(const p of phrases){
        const s=window.ErpAssistant?.phraseScore?.(q,p)||0;
        score=Math.max(score,s);
      }
      if(score>bestScore){best=f;bestScore=score}
    }
    return bestScore>=8?best:null;
  },

  genericHelp(screen){
    const vals=this.context?.values||{};
    const current=[
      ["Tanggal",vals.tanggal],["Jenis",vals.jenis],["Kategori",vals.kategori],["Wallet",vals.wallet],["Nominal",vals.nominal]
    ].filter(x=>x[1]).map(x=>`<span><strong>${this.escape(x[0])}:</strong> ${this.escape(x[1])}</span>`).join(" • ");
    return `<p>Saya mengenali layar ini sebagai <strong>${this.escape(screen.title)}</strong>. Ini cara mengisinya:</p>
      <div class="ea-rule-box"><strong>Langkah pengisian</strong>${(screen.steps||[]).map((x,i)=>`<p><strong>${i+1}.</strong> ${this.escape(x)}</p>`).join("")}</div>
      ${current?`<div class="ea-rule-box"><strong>Yang sedang terpilih di layar</strong><p>${current}</p></div>`:""}
      ${(screen.notes||[]).length?`<div class="ea-rule-box"><strong>Catatan penting</strong>${screen.notes.map(x=>`<p>• ${this.escape(x)}</p>`).join("")}</div>`:""}
      <div class="ea-source"><span>Screen Help · ${this.escape(screen.title)}</span><b>READ ONLY</b></div>`;
  },

  answer(query){
    const screen=this.getScreen();
    if(!screen)return null;
    const q=window.ErpAssistant?.expand?.(query)||String(query||"").toLowerCase();
    const field=this.fieldMatch(screen,q);
    if(field){
      return `<p><strong>${this.escape(field.label)}</strong>: ${this.escape(field.help)}</p>
        <div class="ea-source"><span>${this.escape(screen.title)}</span><b>SCREEN HELP</b></div>`;
    }
    if(/(cara|isi|isinya|gimana|bagaimana|step|langkah|form|layar|screen|ini apa|cara pakai)/.test(q))return this.genericHelp(screen);
    return null;
  },

  wireAssistant(){
    if(!window.ErpAssistant)return;

    /* Screen Help hanya boleh aktif bila halaman dibuka khusus lewat ?screenHelp=1.
       Context lama di sessionStorage tidak boleh bocor ke Global Help Desk atau chat biasa. */
    let isScreenHelp=false;
    try{isScreenHelp=new URLSearchParams(location.search).get("screenHelp")==="1"}catch(_e){}
    if(!isScreenHelp){
      this.context=null;
      return;
    }

    this.readContext();
    if(!this.context?.screen_id)return;

    const baseInit=window.ErpAssistant.init.bind(window.ErpAssistant);
    window.ErpAssistant.init=async()=>{
      await this.loadDefs();
      const screen=this.getScreen();
      if(screen){
        const baseCompose=window.ErpAssistant.compose.bind(window.ErpAssistant);
        window.ErpAssistant.compose=(query)=>{
          const html=this.answer(query);
          if(html){
            const module=window.ErpAssistant.getModule?.(screen.module_id)||null;
            if(module)window.ErpAssistant.state={lastModuleId:module.id,lastFocus:"screen_help",lastIntent:"screen_help"};
            return {unknown:false,module,html};
          }
          return baseCompose(query);
        };
      }

      await baseInit();
      if(!screen)return;
      const badge=document.getElementById("eaContext");
      if(badge)badge.textContent=`Bantuan layar: ${screen.title}`;
      window.ErpAssistant.addBubble("assistant",this.genericHelp(screen));
      if(window.ErpAssistant.refs?.input)window.ErpAssistant.refs.input.placeholder=`Tanya tentang ${screen.title}, misalnya: kategori ini pilih apa?`;
    };
  },

  init(){
    if(document.body.classList.contains("page-erp-assistant"))this.wireAssistant();
    else this.bindSourcePage();
  }
};

window.ErpAssistantScreenHelp=ErpAssistantScreenHelp;
ErpAssistantScreenHelp.init();
