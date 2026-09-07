/* ARUS KAS V2 — LEDGER DETAIL INDICATOR · UI ONLY
   Detail popup hanya untuk transaksi MANUAL.
   Transaksi AUTO tidak menampilkan icon detail dan tidak membuka popup.
   Tidak mengubah engine, formula, query, save logic, atau status transaksi.
*/
"use strict";

const ArusKasV2NettProductDetailUI={
  installStyle(){
    if(document.getElementById("ak2LedgerDetailIndicatorStyle"))return;
    const s=document.createElement("style");
    s.id="ak2LedgerDetailIndicatorStyle";
    s.textContent=`
      #ak2LedgerBody tr[data-id]{cursor:default}
      #ak2LedgerBody td.ak2-has-detail{white-space:nowrap}
      .ak2-ledger-detail-icon{
        display:inline-flex;align-items:center;justify-content:center;
        width:20px;height:20px;margin-left:7px;vertical-align:middle;
        border-radius:999px;font-size:12px;font-weight:900;line-height:1;
        cursor:pointer;transition:transform .18s ease,filter .18s ease,box-shadow .18s ease;
      }
      .ak2-ledger-detail-icon.is-manual-pending{
        border:1px solid rgba(224,86,76,.82);
        background:linear-gradient(180deg,#381918,#1c1010);
        color:#ff9b91;
        box-shadow:0 0 0 1px rgba(255,255,255,.02) inset,0 0 10px rgba(218,73,63,.22);
        animation:ak2ManualVerifyPulse 1.45s ease-in-out infinite;
      }
      .ak2-ledger-detail-icon.is-manual-verified{
        border:1px solid rgba(73,171,104,.78);
        background:linear-gradient(180deg,#17301f,#0f1c14);
        color:#8fe0aa;
        box-shadow:0 0 0 1px rgba(255,255,255,.02) inset,0 0 9px rgba(73,171,104,.16);
      }
      .ak2-ledger-detail-icon:hover{transform:translateY(-1px) scale(1.05);filter:brightness(1.12)}
      @keyframes ak2ManualVerifyPulse{
        0%,100%{box-shadow:0 0 7px rgba(218,73,63,.18)}
        50%{box-shadow:0 0 0 3px rgba(218,73,63,.10),0 0 18px rgba(218,73,63,.46)}
      }
      @media (prefers-reduced-motion: reduce){.ak2-ledger-detail-icon{animation:none!important}}
      @media print{.ak2-ledger-detail-icon{display:none!important}}
    `;
    document.head.appendChild(s);
  },

  rowData(id){
    return (window.ArusKasV2 && Array.isArray(window.ArusKasV2.ledger)
      ? window.ArusKasV2.ledger.find(x=>String(x.id)===String(id))
      : null) || null;
  },

  decorate(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body)return;
    body.querySelectorAll("tr[data-id]").forEach(row=>{
      const data=this.rowData(row.dataset.id);
      if(!data)return;
      const cells=row.querySelectorAll("td");
      if(cells.length<8)return;
      const effect=(window.ArusKasV2 && typeof window.ArusKasV2.kasEffect==="function")
        ? window.ArusKasV2.kasEffect(data)
        : 0;
      const amountCell=effect>0?row.querySelector("td.ak2-money-in"):effect<0?row.querySelector("td.ak2-money-out"):null;
      if(!amountCell)return;

      // AUTO: tidak ada popup/detail icon. Bersihkan sisa dekorasi lama bila ada.
      if(data.entry_type==="AUTO"){
        amountCell.classList.remove("ak2-has-detail");
        amountCell.querySelectorAll(".ak2-ledger-detail-icon,.ak2-row-detail-trigger").forEach(x=>x.remove());
        row.style.cursor="default";
        return;
      }

      // MANUAL saja yang memiliki icon detail.
      amountCell.classList.add("ak2-has-detail");
      const pending=data.verification_status!=="OWNER_VERIFIED";
      const desiredClass=pending?"is-manual-pending":"is-manual-verified";
      let btn=amountCell.querySelector(".ak2-ledger-detail-icon");

      if(!btn){
        btn=document.createElement("button");
        btn.type="button";
        btn.className="ak2-ledger-detail-icon";
        btn.textContent="ⓘ";
        btn.addEventListener("click",e=>{
          e.preventDefault();
          e.stopPropagation();
          if(window.ArusKasV2 && typeof window.ArusKasV2.openDetail==="function"){
            window.ArusKasV2.openDetail(row.dataset.id);
          }
        });
        amountCell.appendChild(btn);
      }

      btn.classList.remove("is-manual-pending","is-manual-verified");
      btn.classList.add(desiredClass);
      btn.title=pending?"Wajib Owner cek · klik detail":"Lihat detail transaksi manual";
      btn.setAttribute("aria-label",btn.title);
    });
  },

  init(){
    this.installStyle();
    const body=document.getElementById("ak2LedgerBody");
    if(!body)return;
    this.decorate();
    let scheduled=false;
    new MutationObserver(()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{scheduled=false;this.decorate()});
    }).observe(body,{childList:true,subtree:true});
  }
};

if(typeof window!=="undefined"){
  window.ArusKasV2NettProductDetailUI=ArusKasV2NettProductDetailUI;
  document.addEventListener("DOMContentLoaded",()=>ArusKasV2NettProductDetailUI.init(),{once:true});
}
