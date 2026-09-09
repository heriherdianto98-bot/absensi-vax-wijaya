/* ERP VAX — ERP Assistant Screen Help
   Lightweight screen-context help. No OCR, no external AI, no server dependency.
*/
"use strict";

const ErpAssistantScreenHelp={
  KEY:"erpAssistantScreenHelpContextV1",
  GLOBAL_HELP_KEY:"erpAssistantGlobalHelpContextV1",
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
        wallet_sumber:this.valueLabel("ak2SourceWallet"),
        wallet_tujuan:this.valueLabel("ak2TargetWallet"),
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
        const phrase=String(p||"").toLowerCase().trim();
        if(!phrase)continue;
        if(phrase.length<=3){
          const re=new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\$&")}(?=\\s|$)`);
          if(!re.test(q))continue;
        }
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
      ["Tanggal",vals.tanggal],["Jenis",vals.jenis],["Kategori",vals.kategori],["Wallet",vals.wallet],
      ["Wallet Sumber",vals.wallet_sumber],["Wallet Tujuan",vals.wallet_tujuan],["Nominal",vals.nominal]
    ].filter(x=>x[1]).map(x=>`<span><strong>${this.escape(x[0])}:</strong> ${this.escape(x[1])}</span>`).join(" • ");
    return `<p>Saya mengenali layar ini sebagai <strong>${this.escape(screen.title)}</strong>. Ini cara mengisinya:</p>
      <div class="ea-rule-box"><strong>Langkah pengisian</strong>${(screen.steps||[]).map((x,i)=>`<p><strong>${i+1}.</strong> ${this.escape(x)}</p>`).join("")}</div>
      ${current?`<div class="ea-rule-box"><strong>Yang sedang terpilih di layar</strong><p>${current}</p></div>`:""}
      ${(screen.notes||[]).length?`<div class="ea-rule-box"><strong>Catatan penting</strong>${screen.notes.map(x=>`<p>• ${this.escape(x)}</p>`).join("")}</div>`:""}
      <div class="ea-source"><span>Screen Help · ${this.escape(screen.title)}</span><b>READ ONLY</b></div>`;
  },

  transferInternalHelp(){
    return `<p><strong>Transfer Internal</strong> dipakai ketika uang hanya berpindah antar-wallet ERP dan tidak keluar dari sistem.</p>
      <div class="ea-rule-box"><strong>Langkah transfer internal</strong>
        <p><strong>1.</strong> Buka <strong>Arus Kas → + Input Manual</strong>.</p>
        <p><strong>2.</strong> Pilih <strong>Kategori: Transfer Internal</strong>.</p>
        <p><strong>3.</strong> Pada <strong>Wallet Sumber</strong>, pilih wallet tempat uang berasal.</p>
        <p><strong>4.</strong> Pada <strong>Wallet Tujuan</strong>, pilih wallet penerima uang.</p>
        <p><strong>5.</strong> Isi <strong>Nominal</strong> sesuai uang yang benar-benar dipindahkan.</p>
        <p><strong>6.</strong> Isi <strong>Keterangan</strong> supaya perpindahan mudah diaudit.</p>
        <p><strong>7.</strong> Periksa lagi sumber, tujuan, dan nominal lalu klik <strong>Simpan</strong>.</p>
      </div>
      <div class="ea-rule-box"><strong>Contoh: Kas Denda → Kas Besar</strong>
        <p>Wallet Sumber: <strong>Kas Denda</strong></p>
        <p>Wallet Tujuan: <strong>Kas Besar</strong></p>
        <p>Dampak: Kas Denda berkurang dan Kas Besar bertambah dengan nominal yang sama. Total uang ERP tetap.</p>
      </div>
      <div class="ea-rule-box"><strong>Bedakan dengan transaksi biasa</strong>
        <p>External → Wallet = <strong>Pemasukan</strong>.</p>
        <p>Wallet → External = <strong>Pengeluaran</strong>.</p>
        <p>Wallet A → Wallet B = <strong>Transfer Internal</strong>.</p>
      </div>
      <div class="ea-source"><span>Arus Kas V2</span><b>HELP DESK · TRANSFER INTERNAL</b></div>`;
  },

  answer(query){
    const screen=this.getScreen();
    if(!screen)return null;
    const q=window.ErpAssistant?.expand?.(query)||String(query||"").toLowerCase();
    if(/transfer\s+internal|internal\s+transfer/.test(q))return this.transferInternalHelp();
    const field=this.fieldMatch(screen,q);
    if(field){
      return `<p><strong>${this.escape(field.label)}</strong>: ${this.escape(field.help)}</p>
        <div class="ea-source"><span>${this.escape(screen.title)}</span><b>SCREEN HELP</b></div>`;
    }
    if(/(cara|isi|isinya|gimana|bagaimana|step|langkah|form|layar|screen|ini apa|cara pakai)/.test(q))return this.genericHelp(screen);
    return null;
  },

  wireHelpDeskTransferInternal(){
    let isHelpDesk=false;
    try{isHelpDesk=new URLSearchParams(location.search).get("helpDesk")==="1"}catch(_e){}
    if(!isHelpDesk||!window.ErpAssistant)return false;

    let ctx=null;
    try{ctx=JSON.parse(sessionStorage.getItem(this.GLOBAL_HELP_KEY)||"null")}catch(_e){}
    if(ctx?.module_id!=="ARUS_KAS_V2")return false;

    const baseCompose=window.ErpAssistant.compose.bind(window.ErpAssistant);
    window.ErpAssistant.compose=(query)=>{
      const q=window.ErpAssistant?.expand?.(query)||String(query||"").toLowerCase();
      if(/transfer\s+internal|internal\s+transfer/.test(q)){
        const module=window.ErpAssistant.getModule?.("ARUS_KAS_V2")||null;
        window.ErpAssistant.state={lastModuleId:"ARUS_KAS_V2",lastFocus:"transfer_internal",lastIntent:"how"};
        return {unknown:false,module,html:this.transferInternalHelp()};
      }
      return baseCompose(query);
    };
    return true;
  },

  wireAssistant(){
    if(!window.ErpAssistant)return;

    /* Help Desk Arus Kas punya prioritas khusus untuk intent Transfer Internal.
       Ini dipasang setelah semantic/context resolver agar pertanyaan langkah tidak dialihkan ke QRIS. */
    this.wireHelpDeskTransferInternal();

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
