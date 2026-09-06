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
      for(const u of (patch.module_updates||[])){
        const m=(this.knowledge?.modules||[]).find(x=>x.id===u.id);
        if(!m)continue;
        if(Array.isArray(u.aliases_add))m.aliases=[...new Set([...(m.aliases||[]),...u.aliases_add])];
        if(u.fields_add&&typeof u.fields_add==="object")m.fields={...(m.fields||{}),...u.fields_add};
        if(Array.isArray(u.faq_add))m.faq=[...(m.faq||[]),...u.faq_add];
        if(Array.isArray(u.rules_add))m.rules=[...(m.rules||[]),...u.rules_add];
      }
    }catch(err){
      console.warn("ERP Assistant incremental knowledge update skipped",err);
    }
  };
}
