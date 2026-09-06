/* ERP Assistant — merge approved incremental knowledge updates before boot. */
"use strict";

if(typeof window!=="undefined" && window.ErpAssistant){
  const baseLoad=window.ErpAssistant.loadKnowledge.bind(window.ErpAssistant);
  window.ErpAssistant.loadKnowledge=async function(){
    await baseLoad();
    try{
      const r=await fetch("../knowledge/erp-assistant-knowledge-updates.json",{cache:"no-store"});
      if(!r.ok)return;
      const patch=await r.json();

      this.knowledge=this.knowledge||{modules:[]};
      this.knowledge.modules=this.knowledge.modules||[];

      for(const add of (patch.module_additions||[])){
        if(!add?.id)continue;
        const exists=this.knowledge.modules.some(x=>x.id===add.id);
        if(!exists)this.knowledge.modules.push(add);
      }

      for(const u of (patch.module_updates||[])){
        const m=this.knowledge.modules.find(x=>x.id===u.id);
        if(!m)continue;
        if(Array.isArray(u.aliases_add))m.aliases=[...new Set([...(m.aliases||[]),...u.aliases_add])];
        if(u.fields_add&&typeof u.fields_add==="object")m.fields={...(m.fields||{}),...u.fields_add};
        if(Array.isArray(u.faq_add))m.faq=[...(m.faq||[]),...u.faq_add];
        if(Array.isArray(u.rules_add))m.rules=[...(m.rules||[]),...u.rules_add];
        if(Array.isArray(u.sources_add))m.sources=[...new Set([...(m.sources||[]),...u.sources_add])];
        if(u.status_set)m.status=u.status_set;
      }

      this.knowledge.lock_audit=patch.lock_audit||this.knowledge.lock_audit||null;
    }catch(err){
      console.warn("ERP Assistant incremental knowledge update skipped",err);
    }
  };
}
