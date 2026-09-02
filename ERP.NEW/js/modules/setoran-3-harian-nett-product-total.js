/* VAX ERP — Setoran 3 Harian Nett Produk summary card */
"use strict";

(function(){
  if(typeof SetoranDirectFlow === "undefined") return;

  function ensureUi(){
    if(!document.querySelector('link[data-s3-nett-product-style]')){
      const link=document.createElement("link");
      link.rel="stylesheet";
      link.href="../styles/setoran-3-harian-nett-product-card.css";
      link.dataset.s3NettProductStyle="1";
      document.head.appendChild(link);
    }

    const totals=document.querySelector(".s3sheet-totals");
    if(totals && !document.getElementById("s3totNettProduct")){
      const card=document.createElement("div");
      card.className="s3sheet-total is-product";
      card.innerHTML='<span>Total Nett Produk</span><strong id="s3totNettProduct">Rp0</strong>';
      const bri=document.getElementById("s3totBri")?.closest(".s3sheet-total");
      if(bri) totals.insertBefore(card,bri);
      else totals.appendChild(card);
    }
  }

  const originalInit=SetoranDirectFlow.init.bind(SetoranDirectFlow);
  SetoranDirectFlow.init=async function(){
    ensureUi();
    return originalInit();
  };

  SetoranDirectFlow.renderTotals = function(useDraft=false){
    ensureUi();
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
