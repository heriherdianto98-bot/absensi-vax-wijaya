/*
=========================================================
VAX ERP — ARUS KAS V2 / SUMMARY CARDS COLLAPSE UI
UI / presentation only.

Tujuan:
- 5 card ringkasan saldo default tertutup agar Buku Arus Kas lebih clean.
- Card hanya tampil saat Owner menekan tombol Tampilkan.
- Menjaga card tetap berada di body collapse walau renderLedger UI lain memindahkannya.
- Memberi jarak visual dari Buku Arus Kas.
- Tidak mengubah data, saldo, query, engine, transaksi, atau formula.
=========================================================
*/
"use strict";

(function(){
  const STYLE_ID = "ak2SummaryCollapseUiStyle";

  function installStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.page-arus-kas .ak2-summary-collapse-wrap{
        border:1px solid rgba(79,102,126,.52);
        border-radius:14px;
        overflow:hidden;
        background:linear-gradient(180deg,rgba(13,19,25,.97),rgba(9,14,20,.98));
        box-shadow:0 8px 24px rgba(0,0,0,.22);
        margin:18px 0 14px;
      }
      body.page-arus-kas .ak2-summary-collapse-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        min-height:58px;
        padding:12px 16px;
      }
      body.page-arus-kas .ak2-summary-collapse-copy{
        display:flex;
        flex-direction:column;
        gap:2px;
      }
      body.page-arus-kas .ak2-summary-collapse-copy strong{
        color:#eef4fb;
        font-size:16px;
        font-weight:900;
        letter-spacing:.03em;
      }
      body.page-arus-kas .ak2-summary-collapse-copy small{
        color:#8fa1b4;
        font-size:12px;
        font-weight:600;
      }
      body.page-arus-kas .ak2-summary-toggle{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        min-height:38px;
        padding:8px 14px;
        border:1px solid rgba(190,145,68,.48);
        border-radius:10px;
        background:linear-gradient(180deg,rgba(47,38,20,.92),rgba(20,25,31,.96));
        color:#f2cf74;
        font:800 13px/1.1 "Source Sans 3",sans-serif;
        letter-spacing:.02em;
        cursor:pointer;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 6px 16px rgba(0,0,0,.2);
      }
      body.page-arus-kas .ak2-summary-toggle:hover{
        border-color:rgba(234,188,87,.8);
        background:linear-gradient(180deg,rgba(62,47,21,.96),rgba(24,29,35,.98));
      }
      body.page-arus-kas .ak2-summary-toggle-icon{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:20px;
        height:20px;
        border-radius:50%;
        border:1px solid rgba(242,207,116,.34);
        font-size:11px;
        transition:transform .2s ease;
      }
      body.page-arus-kas .ak2-summary-collapse-wrap.is-ui-expanded .ak2-summary-toggle-icon{
        transform:rotate(180deg);
      }
      body.page-arus-kas .ak2-summary-collapse-body{
        display:none !important;
      }
      body.page-arus-kas .ak2-summary-collapse-wrap.is-ui-expanded .ak2-summary-collapse-body{
        display:block !important;
      }
      body.page-arus-kas .ak2-summary-collapse-body > .ak2-cards{
        margin:0;
      }
      @media(max-width:700px){
        body.page-arus-kas .ak2-summary-collapse-head{align-items:flex-start}
        body.page-arus-kas .ak2-summary-toggle{padding:7px 10px;font-size:12px}
      }
      @media print{
        body.page-arus-kas .ak2-summary-collapse-head{display:none!important}
        body.page-arus-kas .ak2-summary-collapse-body{display:block!important}
        body.page-arus-kas .ak2-summary-collapse-wrap{border:0!important;box-shadow:none!important;background:transparent!important;margin:0!important}
      }
    `;
    document.head.appendChild(style);
  }

  function install(){
    const cards = document.querySelector(".ak2-cards");
    const qris = document.querySelector(".ak2-qris-card");
    if(!cards || !qris) return false;

    let wrap = document.querySelector(".ak2-summary-collapse-wrap");
    let body = wrap?.querySelector(".ak2-summary-collapse-body");
    let button = wrap?.querySelector(".ak2-summary-toggle");

    if(!wrap){
      wrap = document.createElement("section");
      wrap.className = "ak2-summary-collapse-wrap";
      wrap.dataset.ak2SummaryCollapseUi = "1";

      const head = document.createElement("div");
      head.className = "ak2-summary-collapse-head";
      head.innerHTML = `
        <div class="ak2-summary-collapse-copy">
          <strong>RINGKASAN SALDO</strong>
          <small>Kas Besar, Dana Produk, Kas Denda, Piutang Setoran, dan Piutang Denda</small>
        </div>
      `;

      button = document.createElement("button");
      button.type = "button";
      button.className = "ak2-summary-toggle";
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = '<span class="ak2-summary-toggle-icon">⌄</span><span class="ak2-summary-toggle-label">Tampilkan</span>';
      head.appendChild(button);

      body = document.createElement("div");
      body.className = "ak2-summary-collapse-body";

      qris.parentNode.insertBefore(wrap, qris);
      wrap.appendChild(head);
      wrap.appendChild(body);
    }

    const keepCardsInside = () => {
      const currentCards = document.querySelector(".ak2-cards");
      if(currentCards && body && currentCards.parentNode !== body){
        body.appendChild(currentCards);
      }
    };

    keepCardsInside();

    const sync = () => {
      const expanded = wrap.classList.contains("is-ui-expanded");
      button?.setAttribute("aria-expanded", expanded ? "true" : "false");
      const label = button?.querySelector(".ak2-summary-toggle-label");
      if(label) label.textContent = expanded ? "Sembunyikan" : "Tampilkan";
    };

    if(button && button.dataset.ak2SummaryBound !== "1"){
      button.dataset.ak2SummaryBound = "1";
      button.addEventListener("click", function(){
        wrap.classList.toggle("is-ui-expanded");
        sync();
      });
    }

    wrap.classList.remove("is-ui-expanded");
    sync();

    if(wrap.dataset.ak2SummaryGuard !== "1"){
      wrap.dataset.ak2SummaryGuard = "1";
      const parent = qris.parentNode;
      const observer = new MutationObserver(() => {
        keepCardsInside();
      });
      observer.observe(parent, {childList:true, subtree:false});

      document.addEventListener("erp:finance-ready", () => {
        setTimeout(keepCardsInside, 0);
        setTimeout(keepCardsInside, 150);
      });
    }

    return true;
  }

  installStyle();
  if(!install()){
    let attempts = 0;
    const timer = setInterval(function(){
      attempts += 1;
      if(install() || attempts >= 100) clearInterval(timer);
    }, 50);
  }
})();
