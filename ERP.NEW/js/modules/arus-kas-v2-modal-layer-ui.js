/* ARUS KAS V2 — MODAL LAYER UI ONLY
   Saat popup Input/Detail/Verifikasi terbuka, toolbar utama tidak ikut tampil di atas popup.
   Tidak mengubah engine, query, formula, transaksi, saldo, atau data flow.
*/
"use strict";

(function(){
  if(window.__ak2ModalLayerUiInstalled) return;
  window.__ak2ModalLayerUiInstalled=true;

  const BODY_CLASS="ak2-modal-open-ui";

  function modalOpen(){
    return ["ak2Modal","ak2DetailModal"].some(id=>{
      const el=document.getElementById(id);
      return !!el && !el.hidden;
    });
  }

  function sync(){
    document.body?.classList.toggle(BODY_CLASS,modalOpen());
  }

  function install(){
    if(!document.getElementById("ak2ModalLayerUiStyle")){
      const style=document.createElement("style");
      style.id="ak2ModalLayerUiStyle";
      style.textContent=`
        body.page-arus-kas.${BODY_CLASS} .ak2-toolbar{
          visibility:hidden!important;
          pointer-events:none!important;
        }
        body.page-arus-kas .ak2-modal{
          z-index:3000!important;
        }
        body.page-arus-kas .ak2-modal .ak2-backdrop{
          z-index:0!important;
        }
        body.page-arus-kas .ak2-modal .ak2-panel{
          position:relative;
          z-index:1!important;
        }
      `;
      document.head.appendChild(style);
    }

    ["ak2Modal","ak2DetailModal"].forEach(id=>{
      const el=document.getElementById(id);
      if(!el || el.dataset.ak2ModalLayerObserved==="1") return;
      el.dataset.ak2ModalLayerObserved="1";
      new MutationObserver(sync).observe(el,{attributes:true,attributeFilter:["hidden"]});
    });

    sync();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

  document.addEventListener("erp:finance-ready",()=>setTimeout(install,0));
})();
