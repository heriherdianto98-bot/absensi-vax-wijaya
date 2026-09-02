/* VAX ERP — Setoran 3 Harian Nett Produk summary card */
"use strict";

(function(){
  if(typeof SetoranDirectFlow === "undefined") return;

  SetoranDirectFlow.renderTotals = function(useDraft=false){
    let cash=0, non=0, nettProduct=0, bri=0, diff=0, actual=0;

    for(const b of this.branches){
      const m=this.model(b.id);
      cash+=this.money(m.s.cashReference);
      non+=this.money(m.s.nonCash);
      nettProduct+=this.money(m.nettProduk);

      if(useDraft){
        const tr=document.querySelector(`tr[data-cabang-id="${b.id}"]`);
        if(tr){
          const d=this.draftFromRow(tr);
          bri+=this.money(d.bri);
          diff+=this.money(d.diff);
          actual+=this.money(d.actual);
          continue;
        }
      }

      bri+=this.money(m.bri);
      diff+=this.money(m.diff);
      actual+=this.money(m.actual);
    }

    const set=(id,value)=>{
      const el=document.getElementById(id);
      if(el) el.textContent=this.rupiah(value);
    };

    set("s3totCashRef",cash);
    set("s3totNonCash",non);
    set("s3totNettProduct",nettProduct);
    set("s3totBri",bri);
    set("s3totDiff",diff);
    set("s3totActual",actual);
  };
})();
