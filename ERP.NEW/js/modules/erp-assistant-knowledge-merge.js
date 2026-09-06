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
      const modules=this.knowledge?.modules||[];

      for(const u of (patch.module_updates||[])){
        const m=modules.find(x=>x.id===u.id);
        if(!m)continue;

        if(u.status_set)m.status=u.status_set;
        if(Array.isArray(u.aliases_add))m.aliases=[...new Set([...(m.aliases||[]),...u.aliases_add])];
        if(u.fields_add&&typeof u.fields_add==="object")m.fields={...(m.fields||{}),...u.fields_add};
        if(Array.isArray(u.faq_add))m.faq=[...(m.faq||[]),...u.faq_add];
        if(Array.isArray(u.rules_add))m.rules=[...(m.rules||[]),...u.rules_add];
        if(Array.isArray(u.sources_add))m.sources=[...new Set([...(m.sources||[]),...u.sources_add])];
      }

      for(const add of (patch.module_additions||[])){
        if(!add?.id)continue;
        const existing=modules.find(x=>x.id===add.id);
        if(existing){
          Object.assign(existing,add);
        }else{
          modules.push(add);
        }
      }

      /* Keep broad parent Dashboard aliases from stealing exact child-module questions. */
      const dashboard=modules.find(x=>x.id==="DASHBOARD_OWNER");
      if(dashboard&&Array.isArray(dashboard.aliases)){
        const childExact=new Set([
          "cash out warning",
          "rata rata omzet",
          "grafik rata rata omzet",
          "transaction source summary",
          "ai insight"
        ]);
        dashboard.aliases=dashboard.aliases.filter(a=>!childExact.has(this.norm(a)));
      }

    }catch(err){
      console.warn("ERP Assistant incremental knowledge update skipped",err);
    }
  };
}
