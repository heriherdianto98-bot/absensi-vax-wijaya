/* ARUS KAS V2 — MANUAL INPUT TYPE THEME UI ONLY
   Visual safety cue: Pemasukan = biru, Pengeluaran = merah.
   Tidak mengubah engine, save logic, validation, formula, query, wallet, atau data.
*/
"use strict";

(function(){
  if(window.__ak2ManualTypeThemeUiInstalled) return;
  window.__ak2ManualTypeThemeUiInstalled=true;

  function installStyle(){
    if(document.getElementById("ak2ManualTypeThemeUiStyle")) return;
    const s=document.createElement("style");
    s.id="ak2ManualTypeThemeUiStyle";
    s.textContent=`
      body.page-arus-kas #ak2Modal .ak2-panel{
        transition:border-color .2s ease,box-shadow .2s ease,background .2s ease;
      }
      body.page-arus-kas #ak2Modal .ak2-modal-head{
        transition:background .2s ease,border-color .2s ease,box-shadow .2s ease;
      }

      /* PEMASUKAN = BIRU */
      body.page-arus-kas #ak2Modal.ak2-type-in .ak2-panel{
        border-color:rgba(57,155,235,.88)!important;
        background:
          radial-gradient(circle at 10% 0%,rgba(38,142,226,.13),transparent 34%),
          linear-gradient(180deg,#111b25 0%,#0d151d 100%)!important;
        box-shadow:0 28px 80px rgba(0,0,0,.66),0 0 34px rgba(49,151,232,.16)!important;
      }
      body.page-arus-kas #ak2Modal.ak2-type-in .ak2-modal-head{
        background:linear-gradient(90deg,rgba(27,104,166,.22),rgba(15,28,39,.25))!important;
        border-bottom-color:rgba(76,170,239,.34)!important;
        box-shadow:inset 4px 0 0 #4aabef;
      }
      body.page-arus-kas #ak2Modal.ak2-type-in .ak2-eyebrow,
      body.page-arus-kas #ak2Modal.ak2-type-in #ak2ModalTitle{color:#d8efff!important}
      body.page-arus-kas #ak2Modal.ak2-type-in #ak2Jenis{
        border-color:rgba(66,162,232,.72)!important;
        box-shadow:0 0 0 2px rgba(54,153,226,.08)!important;
      }
      body.page-arus-kas #ak2Modal.ak2-type-in #ak2SaveBtn{
        background:linear-gradient(180deg,#1779b8,#0f527e)!important;
        border-color:#3fa9ec!important;
        color:#eff9ff!important;
        box-shadow:0 8px 22px rgba(30,139,211,.22),inset 0 1px 0 rgba(255,255,255,.10)!important;
      }

      /* PENGELUARAN = MERAH */
      body.page-arus-kas #ak2Modal.ak2-type-out .ak2-panel{
        border-color:rgba(224,73,73,.90)!important;
        background:
          radial-gradient(circle at 10% 0%,rgba(207,54,54,.14),transparent 34%),
          linear-gradient(180deg,#201416 0%,#111317 100%)!important;
        box-shadow:0 28px 80px rgba(0,0,0,.68),0 0 36px rgba(211,60,60,.17)!important;
      }
      body.page-arus-kas #ak2Modal.ak2-type-out .ak2-modal-head{
        background:linear-gradient(90deg,rgba(151,35,35,.25),rgba(35,19,21,.28))!important;
        border-bottom-color:rgba(232,91,91,.34)!important;
        box-shadow:inset 4px 0 0 #df5050;
      }
      body.page-arus-kas #ak2Modal.ak2-type-out .ak2-eyebrow,
      body.page-arus-kas #ak2Modal.ak2-type-out #ak2ModalTitle{color:#ffe4e4!important}
      body.page-arus-kas #ak2Modal.ak2-type-out #ak2Jenis{
        border-color:rgba(224,73,73,.78)!important;
        box-shadow:0 0 0 2px rgba(224,73,73,.08)!important;
      }
      body.page-arus-kas #ak2Modal.ak2-type-out #ak2SaveBtn{
        background:linear-gradient(180deg,#9b3131,#651f1f)!important;
        border-color:#d65757!important;
        color:#fff1f1!important;
        box-shadow:0 8px 22px rgba(177,44,44,.24),inset 0 1px 0 rgba(255,255,255,.09)!important;
      }

      /* badge visual kecil agar jenis transaksi langsung terbaca */
      body.page-arus-kas #ak2Modal .ak2-type-visual-badge{
        display:inline-flex;align-items:center;gap:7px;margin-top:7px;padding:5px 10px;border-radius:999px;
        font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;line-height:1;
      }
      body.page-arus-kas #ak2Modal.ak2-type-in .ak2-type-visual-badge{
        color:#ccecff;background:rgba(38,141,213,.18);border:1px solid rgba(76,174,239,.42)
      }
      body.page-arus-kas #ak2Modal.ak2-type-out .ak2-type-visual-badge{
        color:#ffd7d7;background:rgba(193,53,53,.18);border:1px solid rgba(227,86,86,.44)
      }
    `;
    document.head.appendChild(s);
  }

  function ensureBadge(){
    const head=document.querySelector("#ak2Modal .ak2-modal-head > div");
    if(!head) return null;
    let badge=head.querySelector(".ak2-type-visual-badge");
    if(!badge){
      badge=document.createElement("span");
      badge.className="ak2-type-visual-badge";
      head.appendChild(badge);
    }
    return badge;
  }

  function sync(){
    const modal=document.getElementById("ak2Modal");
    const jenis=document.getElementById("ak2Jenis");
    if(!modal||!jenis) return;
    const isOut=String(jenis.value).toUpperCase()==="OUT";
    modal.classList.toggle("ak2-type-out",isOut);
    modal.classList.toggle("ak2-type-in",!isOut);
    const badge=ensureBadge();
    if(badge){
      badge.textContent=isOut?"● PENGELUARAN":"● PEMASUKAN";
      badge.setAttribute("aria-label",isOut?"Mode Pengeluaran":"Mode Pemasukan");
    }
  }

  function bind(){
    installStyle();
    const jenis=document.getElementById("ak2Jenis");
    const modal=document.getElementById("ak2Modal");
    if(jenis && jenis.dataset.ak2TypeThemeBound!=="1"){
      jenis.dataset.ak2TypeThemeBound="1";
      jenis.addEventListener("change",sync);
      jenis.addEventListener("input",sync);
    }
    sync();
    if(modal && modal.dataset.ak2TypeThemeObserved!=="1"){
      modal.dataset.ak2TypeThemeObserved="1";
      new MutationObserver(()=>sync()).observe(modal,{attributes:true,attributeFilter:["hidden"]});
    }
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
  document.addEventListener("erp:finance-ready",()=>setTimeout(bind,0));
})();
