/* ERP VAX — ERP Assistant Context Engine V2
   Frontend-only, READ ONLY, typo tolerant, context + history aware.
   Answers are composed from approved ERP knowledge; no API/LLM/server dependency.
*/
"use strict";

const ErpAssistant={
  knowledge:null,
  contextModule:null,
  refs:{},
  history:[],
  state:{lastModuleId:null,lastFocus:null,lastIntent:null},

  async loadKnowledge(){
    const r=await fetch("../knowledge/erp-assistant-knowledge.json",{cache:"no-store"});
    if(!r.ok)throw new Error("Knowledge Base ERP tidak dapat dibaca");
    this.knowledge=await r.json();
  },

  norm(v){
    return String(v||"")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\brp\.?\s*/g,"rp ")
      .replace(/[^a-z0-9\s]/g," ")
      .replace(/\s+/g," ").trim();
  },

  expand(v){
    let s=` ${this.norm(v)} `;
    const map={
      " yg ":" yang "," sy ":" saya "," sya ":" saya "," km ":" kamu "," kmu ":" kamu ",
      " gmn ":" bagaimana "," gimna ":" bagaimana "," mksd ":" maksud "," mkst ":" maksud ",
      " d ":" di "," blm ":" belum "," udh ":" sudah "," trs ":" terus "," krn ":" karena ",
      " sv p ":" svp "," qris ":" qris "," qriss ":" qris "," storan ":" setoran ",
      " setorann ":" setoran "," dnda ":" denda "," dendaa ":" denda "," ksa ":" kas ",
      " bku ":" buku "," aruskas ":" arus kas "," verif ":" verifikasi "," verifkasi ":" verifikasi "
    };
    for(const [a,b] of Object.entries(map))s=s.split(a).join(b);
    return s.replace(/\s+/g," ").trim();
  },

  tokens(v){
    const stop=new Set(["apa","apakah","itu","ini","yang","dan","di","ke","dari","untuk","saya","mau","bagaimana","maksud","maksudnya","arti","jelasin","jelaskan","kenapa","kok","kalau","terus","jadi","tolong","dong","ya","nya","yg"]);
    return this.expand(v).split(" ").filter(x=>x.length>1&&!stop.has(x));
  },

  editDistance(a,b){
    a=String(a||"");b=String(b||"");
    const m=a.length,n=b.length;
    if(!m)return n;if(!n)return m;
    const prev=Array.from({length:n+1},(_,i)=>i),cur=new Array(n+1);
    for(let i=1;i<=m;i++){
      cur[0]=i;
      for(let j=1;j<=n;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      for(let j=0;j<=n;j++)prev[j]=cur[j];
    }
    return prev[n];
  },

  sim(a,b){
    a=this.norm(a);b=this.norm(b);
    if(!a||!b)return 0;
    if(a===b)return 1;
    const max=Math.max(a.length,b.length);
    return max?1-(this.editDistance(a,b)/max):0;
  },

  tokenMatch(a,b){
    a=this.norm(a);b=this.norm(b);
    if(!a||!b)return false;
    if(a===b)return true;
    if(a.length>=5&&b.length>=5&&this.sim(a,b)>=0.72)return true;
    if(a.length>=4&&b.length>=4&&this.sim(a,b)>=0.78)return true;
    return false;
  },

  phraseScore(query,phrase){
    const q=this.expand(query),p=this.expand(phrase);
    if(!p)return 0;
    if(q.includes(p))return 18+Math.min(12,p.length/3);
    const qt=this.tokens(q),pt=this.tokens(p);
    if(!pt.length)return 0;
    let hit=0;
    for(const x of pt)if(qt.some(y=>this.tokenMatch(x,y)))hit++;
    const ratio=hit/pt.length;
    return ratio>=0.75?8+ratio*10:ratio>=0.5?4+ratio*5:0;
  },

  detectContext(){
    let path="";
    try{path=new URL(document.referrer||location.href,location.href).pathname.toLowerCase()}catch(_e){path=location.pathname.toLowerCase()}
    const map=[
      ["arus-kas","ARUS_KAS_V2"],["setoran-3-harian","SETORAN_3_HARIAN"],["tabel-harian","TABEL_HARIAN"],
      ["cash-out","CASH_OUT"],["payroll","PAYROLL"],["erp-dashboard","DASHBOARD_OWNER"],["login","LOGIN_OWNER"]
    ];
    const hit=map.find(([p])=>path.includes(p));
    this.contextModule=hit?this.getModule(hit[1]):null;
    const badge=document.getElementById("eaContext");
    if(badge)badge.textContent=this.contextModule?`Konteks: ${this.contextModule.name}`:"Konteks: Semua modul LOCK";
  },

  getModule(id){return (this.knowledge?.modules||[]).find(m=>m.id===id)||null},

  moduleScore(m,query){
    let s=this.phraseScore(query,m.name)*2;
    for(const a of (m.aliases||[]))s=Math.max(s,this.phraseScore(query,a)*1.8);
    for(const k of Object.keys(m.fields||{}))s=Math.max(s,this.phraseScore(query,k.replace(/_/g," "))*1.6);
    const qTokens=this.tokens(query);
    const hay=this.tokens([m.purpose,...(m.rules||[]),...(m.sources||[]),...Object.values(m.fields||{})].join(" "));
    for(const t of qTokens)if(hay.some(h=>this.tokenMatch(t,h)))s+=1.25;
    return s;
  },

  resolveModule(query){
    const mods=this.knowledge?.modules||[];
    const ranked=mods.map(m=>({m,s:this.moduleScore(m,query)})).sort((a,b)=>b.s-a.s);
    const best=ranked[0];
    const expanded=this.expand(query);
    const followup=/^(kalau|kalo|terus|trs|yang|yg|nah|lalu|jadi|dan|trus)\b/.test(expanded)||this.tokens(query).length<=3;

    if(best&&best.s>=14)return best.m;
    if(followup&&this.state.lastModuleId)return this.getModule(this.state.lastModuleId);
    if(best&&best.s>=7)return best.m;
    if(this.contextModule&&best?.s<7)return this.contextModule;
    if(this.state.lastModuleId)return this.getModule(this.state.lastModuleId);
    return null;
  },

  detectIntent(query){
    const q=this.expand(query);
    if(/(asal|sumber|dari mana|berasal)/.test(q))return "source";
    if(/(beda|perbedaan|dibanding)/.test(q))return "compare";
    if(/(siapa|verifikasi|verify|koreksi)/.test(q))return "verify";
    if(/(kenapa|mengapa|kok|selisih)/.test(q))return "why";
    if(/(cara|bagaimana|gimana|proses|alur)/.test(q))return "how";
    if(/(isi|isinya|apa saja|apa aja)/.test(q))return "contents";
    if(/(arti|maksud|apa itu|apa yang dimaksud|definisi)/.test(q))return "definition";
    return "general";
  },

  entryScore(query,label,text=""){
    const q=this.expand(query);
    let s=this.phraseScore(q,label)*2;
    const qt=this.tokens(q),ht=this.tokens(`${label} ${text}`);
    for(const t of qt)if(ht.some(h=>this.tokenMatch(t,h)))s+=2;
    return s;
  },

  bestField(m,query){
    const arr=Object.entries(m?.fields||{}).map(([k,v])=>({k,v,s:this.entryScore(query,k.replace(/_/g," "),v)})).sort((a,b)=>b.s-a.s);
    return arr[0]&&arr[0].s>=8?arr[0]:null;
  },

  bestFaq(m,query){
    const arr=(m?.faq||[]).map(f=>({f,s:this.entryScore(query,f.q,f.a)})).sort((a,b)=>b.s-a.s);
    return arr[0]&&arr[0].s>=10?arr[0]:null;
  },

  bestRules(m,query,limit=3){
    return (m?.rules||[]).map(r=>({r,s:this.entryScore(query,r,r)})).sort((a,b)=>b.s-a.s).filter(x=>x.s>=3).slice(0,limit);
  },

  humanLabel(k){return String(k).replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())},

  moneyHighlight(v){return String(v||"").replace(/(Rp\s?[\d\.]+)/g,'<strong class="ea-money">$1</strong>')},

  compose(query){
    const m=this.resolveModule(query);
    if(!m)return {unknown:true,html:`<p>${this.knowledge?.policy?.unknown_answer||"Knowledge ERP belum cukup untuk menjawab pertanyaan ini."}</p>`};

    const intent=this.detectIntent(query);
    const field=this.bestField(m,query);
    const faq=this.bestFaq(m,query);
    const rules=this.bestRules(m,query,4);
    let html="";
    let focus=null;

    if(field){
      focus=field.k;
      const label=this.humanLabel(field.k);
      if(intent==="definition"||intent==="general"||intent==="why"){
        html+=`<p><strong>${label}</strong> di ${m.name} adalah ${this.moneyHighlight(field.v.charAt(0).toLowerCase()+field.v.slice(1))}</p>`;
      }else{
        html+=`<p><strong>${label}</strong>: ${this.moneyHighlight(field.v)}</p>`;
      }
      if(rules.length)html+=`<div class="ea-rule-box"><strong>Yang perlu diketahui</strong>${rules.slice(0,2).map(x=>`<p>• ${this.moneyHighlight(x.r)}</p>`).join("")}</div>`;
    }else if(faq&&intent!=="contents"){
      html+=`<p>${this.moneyHighlight(faq.f.a)}</p>`;
      focus=faq.f.q;
    }else if(intent==="source"){
      html+=`<p>${m.name} menggunakan sumber resmi berikut:</p><div class="ea-rule-box">${(m.sources||[]).map(x=>`<p>• ${this.escape(x)}</p>`).join("")||"<p>Sumber rinci belum terdokumentasi di knowledge.</p>"}</div>`;
    }else if(intent==="contents"){
      const fields=Object.keys(m.fields||{}).slice(0,6);
      html+=`<p>Di <strong>${m.name}</strong>, fungsi utamanya ${this.escape(m.purpose.charAt(0).toLowerCase()+m.purpose.slice(1))}</p>`;
      if(fields.length)html+=`<div class="ea-rule-box"><strong>Bagian/istilah utama yang tercatat</strong><p>${fields.map(k=>this.humanLabel(k)).join(" • ")}</p></div>`;
      if((m.rules||[]).length)html+=`<div class="ea-rule-box"><strong>Alur penting</strong>${m.rules.slice(0,3).map(r=>`<p>• ${this.moneyHighlight(r)}</p>`).join("")}</div>`;
    }else if(intent==="verify"){
      const vr=(m.rules||[]).filter(r=>/(verif|owner|koreksi|manual|auto)/i.test(r)).slice(0,4);
      html+=`<p>Untuk <strong>${m.name}</strong>, aturan verifikasinya:</p><div class="ea-rule-box">${(vr.length?vr:m.rules||[]).slice(0,4).map(r=>`<p>• ${this.moneyHighlight(r)}</p>`).join("")}</div>`;
    }else if(intent==="how"||intent==="why"){
      html+=`<p>${this.escape(m.purpose)}</p>`;
      if(rules.length)html+=`<div class="ea-rule-box"><strong>Alurnya</strong>${rules.map(x=>`<p>• ${this.moneyHighlight(x.r)}</p>`).join("")}</div>`;
      else if((m.rules||[]).length)html+=`<div class="ea-rule-box">${m.rules.slice(0,3).map(r=>`<p>• ${this.moneyHighlight(r)}</p>`).join("")}</div>`;
    }else{
      html+=`<p>${this.escape(m.purpose)}</p>`;
      if(rules.length)html+=`<div class="ea-rule-box"><strong>Rule terkait</strong>${rules.slice(0,3).map(x=>`<p>• ${this.moneyHighlight(x.r)}</p>`).join("")}</div>`;
      else if((m.sources||[]).length)html+=`<div class="ea-rule-box"><strong>Sumber</strong><p>${m.sources.map(this.escape.bind(this)).join(" → ")}</p></div>`;
    }

    html+=`<div class="ea-source"><span>${this.escape(m.name)}</span><b>${this.escape(String(m.status||"LOCK").replaceAll("_"," "))}</b></div>`;
    this.state={lastModuleId:m.id,lastFocus:focus,lastIntent:intent};
    return {unknown:false,module:m,html};
  },

  escape(v){const d=document.createElement("div");d.textContent=String(v??"");return d.innerHTML},

  addBubble(side,html){
    const log=this.refs.log;if(!log)return;
    const wrap=document.createElement("div");
    wrap.className=`ea-msg ${side}`;
    wrap.innerHTML=`<div class="ea-avatar">${side==="assistant"?"✦":"O"}</div><div class="ea-bubble">${html}</div>`;
    log.appendChild(wrap);
    log.scrollTop=log.scrollHeight;
  },

  ask(raw){
    const q=String(raw||"").trim();if(!q)return;
    this.addBubble("user",`<p>${this.escape(q)}</p>`);
    if(this.refs.input)this.refs.input.value="";
    const a=this.compose(q);
    this.addBubble("assistant",a.html);
    this.history.push({role:"user",content:q},{role:"assistant",content:a.module?.name||"unknown"});
    if(this.history.length>16)this.history=this.history.slice(-16);
    this.refs.input?.focus();
  },

  bind(){
    this.refs={log:document.getElementById("eaChat"),input:document.getElementById("eaInput"),send:document.getElementById("eaSend")};
    this.refs.send?.addEventListener("click",()=>this.ask(this.refs.input.value));
    this.refs.input?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();this.ask(this.refs.input.value)}});
    document.querySelectorAll("[data-ea-question]").forEach(b=>b.addEventListener("click",()=>this.ask(b.dataset.eaQuestion)));
  },

  async init(){
    try{
      await this.loadKnowledge();
      this.detectContext();
      this.bind();
      this.addBubble("assistant",`<p>Halo Pak. Saya <strong>ERP Assistant</strong>. Saya menjawab dari Knowledge Base ERP resmi dengan Context Engine V2.</p><p>Saya memahami typo ringan, singkatan, konteks halaman, dan pertanyaan lanjutan. Tetap <strong>READ ONLY</strong>.</p>`);
      this.refs.input?.focus();
    }catch(err){
      console.error(err);
      document.getElementById("eaError")?.removeAttribute("hidden");
    }
  }
};

window.ErpAssistant=ErpAssistant;
