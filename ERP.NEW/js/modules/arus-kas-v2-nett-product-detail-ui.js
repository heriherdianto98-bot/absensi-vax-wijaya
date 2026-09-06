/* ARUS KAS V2 — NETT PRODUCT DETAIL AFFORDANCE · UI ONLY
   Menambahkan indikator detail/verifikasi pada row Nett Produk tanpa mengubah engine/logic Arus Kas.
*/
"use strict";

const ArusKasV2NettProductDetailUI={
  installStyle(){
    if(document.getElementById("ak2NettProductDetailStyle"))return;
    const s=document.createElement("style");
    s.id="ak2NettProductDetailStyle";
    s.textContent=`
      #ak2LedgerBody tr[data-id]{cursor:pointer}
      #ak2LedgerBody tr.ak2-nett-product-row{position:relative}
      #ak2LedgerBody tr.ak2-nett-product-row td:nth-child(4){white-space:nowrap}
      .ak2-nett-product-detail{
        display:inline-flex;align-items:center;justify-content:center;
        width:20px;height:20px;margin-left:7px;vertical-align:middle;
        border-radius:999px;border:1px solid rgba(216,170,80,.72);
        background:linear-gradient(180deg,#2a2112,#171109);
        color:#f2cb73;font-size:11px;font-weight:900;line-height:1;
        box-shadow:0 0 0 1px rgba(255,255,255,.02) inset,0 0 10px rgba(216,170,80,.16);
        cursor:pointer;transition:.18s ease;
      }
      .ak2-nett-product-detail:hover{
        transform:translateY(-1px) scale(1.04);
        border-color:#f0c565;color:#fff0bd;
        box-shadow:0 0 0 2px rgba(216,170,80,.10),0 0 16px rgba(216,170,80,.26);
      }
      .ak2-nett-product-row.ak2-needs-verify .ak2-nett-product-detail{
        animation:ak2NettProductVerifyPulse 1.7s ease-in-out infinite;
      }
      @keyframes ak2NettProductVerifyPulse{
        0%,100%{box-shadow:0 0 8px rgba(216,170,80,.14)}
        50%{box-shadow:0 0 0 3px rgba(216,170,80,.08),0 0 18px rgba(216,170,80,.34)}
      }
      @media (prefers-reduced-motion: reduce){.ak2-nett-product-detail{animation:none!important}}
      @media print{.ak2-nett-product-detail{display:none!important}}
    `;
    document.head.appendChild(s);
  },

  decorate(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body)return;
    body.querySelectorAll("tr[data-id]").forEach(row=>{
      const cells=row.querySelectorAll("td");
      if(cells.length<8)return;
      const desc=(cells[4]?.textContent||"").toLowerCase();
      const status=(cells[7]?.textContent||"").toUpperCase();
      const isNett=desc.includes("nett produk");
      if(!isNett)return;
      row.classList.add("ak2-nett-product-row");
      if(status.includes("BELUM DIVERIFIKASI"))row.classList.add("ak2-needs-verify");
      const amountCell=cells[3];
      if(!amountCell||amountCell.querySelector(".ak2-nett-product-detail"))return;
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="ak2-nett-product-detail";
      btn.textContent="i";
      btn.title=status.includes("BELUM DIVERIFIKASI")?"Klik untuk detail & verifikasi Nett Produk":"Klik untuk detail Nett Produk";
      btn.setAttribute("aria-label",btn.title);
      btn.addEventListener("click",e=>{
        e.preventDefault();
        e.stopPropagation();
        row.dispatchEvent(new MouseEvent("click",{bubbles:true}));
      });
      amountCell.appendChild(btn);
    });
  },

  init(){
    this.installStyle();
    const body=document.getElementById("ak2LedgerBody");
    if(!body)return;
    this.decorate();
    new MutationObserver(()=>this.decorate()).observe(body,{childList:true,subtree:true});
  }
};

if(typeof window!=="undefined"){
  window.ArusKasV2NettProductDetailUI=ArusKasV2NettProductDetailUI;
  document.addEventListener("DOMContentLoaded",()=>ArusKasV2NettProductDetailUI.init(),{once:true});
}
