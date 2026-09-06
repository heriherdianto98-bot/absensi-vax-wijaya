/* ERP VAX — ERP Assistant V1
   READ ONLY helper. Answers only from approved ERP knowledge JSON.
   No database writes, no verification actions, no engine mutation.
*/
"use strict";

const ErpAssistant={
  knowledge:null,
  contextModule:null,
  refs:{},

  norm(v){
    return String(v||"")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9\s]/g," ")
      .replace(/\s+/g," ").trim();
  },

  tokens(v){
    const stop=new Set(["apa","apakah","itu","ini","yang","dan","di","ke","dari","untuk","saya","sy","mau","gimana","bagaimana","maksud","maksudnya","arti","jelasin","jelaskan","kenapa","kok","kalo","kalau","trs","terus","jadi","yg","mkst","mksd"]);
    return this.norm(v).split(" ").filter(x=>x.length>1&&!stop.has(x));
  },

  moneyHighlight(text){
    return String(text||"").replace(/(Rp\s?[\d\.]+)/g,'<strong class="ea-money">$1</strong>');
  },

  async loadKnowledge(){
    const r=await fetch("../knowledge/erp-assistant-knowledge.json",{cache:"no-store"});
    if(!r.ok)throw new Error("Knowledge Base ERP tidak dapat dibaca");
    this.knowledge=await r.json();
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
    this.contextModule=hit?this.knowledge?.modules?.find(m=>m.id===hit[1])||null:null;
    const badge=document.getElementById("eaContext");
    if(badge)badge.textContent=this.contextModule?`Konteks: ${this.contextModule.name}`:"Konteks: Semua modul LOCK";
  },

  explicitModule(query){
    const q=this.norm(query);
    const modules=this.knowledge?.modules||[];
    let best=null;
    for(const m of modules){
      const names=[m.name,...(m.aliases||[])].map(x=>this.norm(x)).filter(Boolean);
      for(const n of names){
        if(n.length<4)continue;
        if(q.includes(n)){
          const score=n.length + (this.norm(m.name)===n?50:0);
          if(!best||score>best.score)best={m,score};
        }
      }
    }
    return best?.m||null;
  },

  intentModule(query){
    const q=this.norm(query);
    const byId=id=>(this.knowledge?.modules||[]).find(m=>m.id===id)||null;
    const rules=[
      [/(kas denda|piutang denda|kas besar|dana produk|uang rekening|masuk kas|selisih qris|qris transfer|gopay transfer)/,"ARUS_KAS_V2"],
      [/(cash harus diambil|belum diambil|sudah diambil|verif owner|setoran 3 harian)/,"SETORAN_3_HARIAN"],
      [/(cash bersih|tabel harian|daily recap)/,"TABEL_HARIAN"],
      [/(gaji bersih|gaji pokok|bonus kpi|bonus produk|payroll|master gaji)/,"PAYROLL"],
      [/(cash out|detail cash out)/,"CASH_OUT"]
    ];
    for(const [re,id] of rules)if(re.test(q))return byId(id);
    return null;
  },

  scoreModule(module,query){
    const q=this.norm(query),qt=this.tokens(query);
    let score=0;
    const name=this.norm(module.name);
    const aliases=(module.aliases||[]).map(x=>this.norm(x));
    if(q.includes(name)||name.includes(q))score+=28;
    aliases.forEach(a=>{if(a.length>=4&&q.includes(a))score+=18;});
    const hay=this.norm([
      module.name,module.purpose,...(module.aliases||[]),...(module.rules||[]),
      ...Object.keys(module.fields||{}),...Object.values(module.fields||{}),
      ...(module.faq||[]).flatMap(x=>[x.q,x.a])
    ].join(" "));
    qt.forEach(t=>{if(hay.includes(t))score+=2;});
    if(score>0&&this.contextModule?.id===module.id)score+=5;
    return score;
  },

  bestModule(query){
    const explicit=this.explicitModule(query);
    if(explicit)return {m:explicit,s:100};
    const intent=this.intentModule(query);
    if(intent)return {m:intent,s:90};
    const scored=(this.knowledge?.modules||[]).map(m=>({m,s:this.scoreModule(m,query)})).sort((a,b)=>b.s-a.s);
    return scored[0]&&scored[0].s>=4?scored[0]:null;
  },

  bestFaq(module,query){
    const q=this.norm(query),qt=this.tokens(query);
    let best=null;
    (module.faq||[]).forEach(f=>{
      const fq=this.norm(f.q),h=this.norm(`${f.q} ${f.a}`);
      let s=q.includes(fq)||fq.includes(q)?30:0;
      qt.forEach(t=>{if(h.includes(t))s+=3;});
      if(!best||s>best.s)best={f,s};
    });
    return best&&best.s>=6?best:null;
  },

  matchingFields(module,query){
    const q=this.norm(query),qt=this.tokens(query);
    return Object.entries(module.fields||{}).map(([k,v])=>{
      const label=this.norm(k.replace(/_/g," "));
      const h=this.norm(`${label} ${v}`);
      let s=0;
      if(q.includes(label)||label.includes(q))s+=30;
      const labelTokens=this.tokens(label);
      const overlap=labelTokens.filter(t=>qt.includes(t)).length;
      if(labelTokens.length&&overlap===labelTokens.length)s+=18;
      else s+=overlap*5;
      qt.forEach(t=>{if(h.includes(t))s+=1;});
      return {k,v,s};
    }).filter(x=>x.s>=5).sort((a,b)=>b.s-a.s).slice(0,3);
  },

  matchingRules(module,query){
    const qt=this.tokens(query);
    return (module.rules||[]).map(r=>{
      const h=this.norm(r);let s=0;
      qt.forEach(t=>{if(h.includes(t))s+=2;});
      return {r,s};
    }).filter(x=>x.s>=2).sort((a,b)=>b.s-a.s).slice(0,4);
  },

  fieldLabel(k){return String(k).replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())},

  answer(query){
    const hit=this.bestModule(query);
    if(!hit)return {unknown:true,html:`<p>${this.knowledge?.policy?.unknown_answer||"Knowledge ERP belum cukup untuk menjawab pertanyaan ini."}</p>`};
    const m=hit.m;
    const faq=this.bestFaq(m,query);
    const fields=this.matchingFields(m,query);
    const rules=this.matchingRules(m,query);
    let body="";

    if(faq){
      body+=`<p>${this.moneyHighlight(faq.f.a)}</p>`;
    }else if(fields.length){
      body+=fields.map(x=>`<div class="ea-answer-item"><span>${this.fieldLabel(x.k)}</span><p>${this.moneyHighlight(x.v)}</p></div>`).join("");
      if(rules.length)body+=`<div class="ea-rule-box"><strong>Rule terkait</strong>${rules.slice(0,2).map(x=>`<p>• ${this.moneyHighlight(x.r)}</p>`).join("")}</div>`;
    }else if(rules.length){
      body+=`<p>${m.purpose}</p><div class="ea-rule-box"><strong>Rule resmi</strong>${rules.map(x=>`<p>• ${this.moneyHighlight(x.r)}</p>`).join("")}</div>`;
    }else{
      body+=`<p>${m.purpose}</p>`;
      if((m.sources||[]).length)body+=`<div class="ea-rule-box"><strong>Sumber</strong><p>${m.sources.join(" → ")}</p></div>`;
    }

    body+=`<div class="ea-source"><span>${m.name}</span><b>${m.status.replaceAll("_"," ")}</b></div>`;
    return {unknown:false,module:m,html:body};
  },

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
    this.refs.input.value="";
    const a=this.answer(q);
    this.addBubble("assistant",a.html);
  },

  escape(v){const d=document.createElement("div");d.textContent=String(v);return d.innerHTML},

  bind(){
    this.refs={
      log:document.getElementById("eaChat"),
      input:document.getElementById("eaInput"),
      send:document.getElementById("eaSend")
    };
    this.refs.send?.addEventListener("click",()=>this.ask(this.refs.input.value));
    this.refs.input?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();this.ask(this.refs.input.value)}});
    document.querySelectorAll("[data-ea-question]").forEach(b=>b.addEventListener("click",()=>this.ask(b.dataset.eaQuestion)));
  },

  async init(){
    try{
      await this.loadKnowledge();
      this.detectContext();
      this.bind();
      this.addBubble("assistant",`<p>Halo Pak. Saya <strong>ERP Assistant</strong>. Saya menjawab dari Knowledge Base modul ERP yang sudah Owner PASS/LOCK.</p><p>Tanyakan fungsi, arti angka/kolom, alur data, atau cara kerja modul.</p>`);
    }catch(err){
      console.error(err);
      document.getElementById("eaError")?.removeAttribute("hidden");
    }
  }
};

window.ErpAssistant=ErpAssistant;
