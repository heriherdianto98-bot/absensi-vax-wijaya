/* ERP VAX — ERP Assistant V2
   Contextual AI chat backed by Supabase Edge Function.
   READ ONLY: knowledge explanation only, no ERP writes/actions.
*/
"use strict";

const ErpAssistant={
  knowledge:null,
  contextModule:null,
  refs:{},
  history:[],
  busy:false,

  async loadKnowledge(){
    try{
      const r=await fetch("../knowledge/erp-assistant-knowledge.json",{cache:"no-store"});
      if(r.ok)this.knowledge=await r.json();
    }catch(_e){ this.knowledge=null; }
  },

  detectContext(){
    let path="";
    try{path=new URL(document.referrer||location.href,location.href).pathname.toLowerCase()}catch(_e){path=location.pathname.toLowerCase()}
    const map=[
      ["arus-kas","ARUS_KAS_V2"],
      ["setoran-3-harian","SETORAN_3_HARIAN"],
      ["tabel-harian","TABEL_HARIAN"],
      ["cash-out","CASH_OUT"],
      ["payroll","PAYROLL"],
      ["erp-dashboard","DASHBOARD_OWNER"],
      ["login","LOGIN_OWNER"]
    ];
    const hit=map.find(([p])=>path.includes(p));
    this.contextModule=hit?this.knowledge?.modules?.find(m=>m.id===hit[1])||{id:hit[1],name:hit[1]}:null;
    const badge=document.getElementById("eaContext");
    if(badge)badge.textContent=this.contextModule?`Konteks: ${this.contextModule.name}`:"Konteks: Semua modul LOCK";
  },

  escape(v){const d=document.createElement("div");d.textContent=String(v);return d.innerHTML},

  renderText(v){
    const safe=this.escape(v);
    return safe
      .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
      .replace(/`([^`]+)`/g,"<code>$1</code>")
      .replace(/\n/g,"<br>");
  },

  addBubble(side,html,extraClass=""){
    const log=this.refs.log;if(!log)return null;
    const wrap=document.createElement("div");
    wrap.className=`ea-msg ${side}${extraClass?` ${extraClass}`:""}`;
    wrap.innerHTML=`<div class="ea-avatar">${side==="assistant"?"✦":"O"}</div><div class="ea-bubble">${html}</div>`;
    log.appendChild(wrap);
    log.scrollTop=log.scrollHeight;
    return wrap;
  },

  setBusy(on){
    this.busy=!!on;
    if(this.refs.input)this.refs.input.disabled=this.busy;
    if(this.refs.send){
      this.refs.send.disabled=this.busy;
      this.refs.send.textContent=this.busy?"Berpikir…":"Kirim";
    }
  },

  async callAI(message){
    if(typeof db==="undefined"||!db?.functions?.invoke){
      throw new Error("Koneksi AI Supabase belum tersedia.");
    }

    const context={
      module:this.contextModule?.name||this.contextModule?.id||null,
      page:document.referrer||location.pathname
    };

    const {data,error}=await db.functions.invoke("erp-assistant-chat",{
      body:{
        message,
        history:this.history.slice(-10),
        context
      }
    });

    if(error){
      const detail=error?.context?.body?.error||error?.message||"ERP Assistant AI gagal merespons.";
      throw new Error(detail);
    }
    if(!data?.answer)throw new Error(data?.error||"AI tidak menghasilkan jawaban.");
    return data;
  },

  async ask(raw){
    const q=String(raw||"").trim();
    if(!q||this.busy)return;

    this.addBubble("user",`<p>${this.escape(q)}</p>`);
    if(this.refs.input)this.refs.input.value="";
    this.setBusy(true);

    const thinking=this.addBubble("assistant",`<p class="ea-thinking-text">Sedang memahami pertanyaan Pak…</p>`,"is-thinking");

    try{
      const data=await this.callAI(q);
      thinking?.remove();
      this.addBubble("assistant",`<p>${this.renderText(data.answer)}</p><div class="ea-source"><span>ERP Knowledge AI</span><b>${this.escape(data.mode||"AI CONTEXTUAL")}</b></div>`);
      this.history.push({role:"user",content:q},{role:"assistant",content:String(data.answer)});
      if(this.history.length>20)this.history=this.history.slice(-20);
    }catch(err){
      thinking?.remove();
      const msg=String(err?.message||err||"ERP Assistant gagal merespons.");
      this.addBubble("assistant",`<p><strong>ERP Assistant belum bisa menjawab.</strong><br>${this.escape(msg)}</p>`);
    }finally{
      this.setBusy(false);
      this.refs.input?.focus();
    }
  },

  bind(){
    this.refs={
      log:document.getElementById("eaChat"),
      input:document.getElementById("eaInput"),
      send:document.getElementById("eaSend")
    };
    this.refs.send?.addEventListener("click",()=>this.ask(this.refs.input.value));
    this.refs.input?.addEventListener("keydown",e=>{
      if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();this.ask(this.refs.input.value)}
    });
    document.querySelectorAll("[data-ea-question]").forEach(b=>b.addEventListener("click",()=>this.ask(b.dataset.eaQuestion)));
  },

  async init(){
    await this.loadKnowledge();
    this.detectContext();
    this.bind();
    this.addBubble("assistant",`<p>Halo Pak. Saya <strong>ERP Assistant</strong>. Sekarang saya memakai AI percakapan dengan Knowledge Base ERP resmi, jadi pertanyaan lanjutan dan bahasa bebas akan saya pahami dari konteks chat.</p><p>Saya tetap <strong>READ ONLY</strong> dan tidak mengubah data ERP.</p>`);
    this.refs.input?.focus();
  }
};

window.ErpAssistant=ErpAssistant;
