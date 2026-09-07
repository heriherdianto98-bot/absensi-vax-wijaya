/*
=========================================================
VAX ERP — ARUS KAS V2 / QRIS COLLAPSE UI
UI / presentation only.

Tujuan:
- Panel Rekonsiliasi QRIS / GoPay default tertutup agar Buku Arus Kas clean.
- Isi panel hanya ditampilkan saat Owner menekan tombol Tampilkan.
- Tidak mengubah data, query, perhitungan, engine, atau transaksi.
=========================================================
*/
"use strict";

(function(){
  const STYLE_ID = "ak2QrisCollapseUiStyle";

  function installStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.page-arus-kas .ak2-qris-card{
        overflow:hidden;
      }
      body.page-arus-kas .ak2-qris-card .ak2-section-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
      }
      body.page-arus-kas .ak2-qris-toggle{
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
      body.page-arus-kas .ak2-qris-toggle:hover{
        border-color:rgba(234,188,87,.8);
        background:linear-gradient(180deg,rgba(62,47,21,.96),rgba(24,29,35,.98));
      }
      body.page-arus-kas .ak2-qris-toggle-icon{
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
      body.page-arus-kas .ak2-qris-card.is-ui-expanded .ak2-qris-toggle-icon{
        transform:rotate(180deg);
      }
      body.page-arus-kas .ak2-qris-ui-body{
        display:none;
      }
      body.page-arus-kas .ak2-qris-card.is-ui-expanded .ak2-qris-ui-body{
        display:block;
      }
      @media(max-width:700px){
        body.page-arus-kas .ak2-qris-card .ak2-section-head{align-items:flex-start}
        body.page-arus-kas .ak2-qris-toggle{padding:7px 10px;font-size:12px}
      }
      @media print{
        body.page-arus-kas .ak2-qris-toggle{display:none!important}
        body.page-arus-kas .ak2-qris-ui-body{display:block!important}
      }
    `;
    document.head.appendChild(style);
  }

  function install(){
    const card = document.querySelector(".ak2-qris-card");
    if(!card || card.dataset.ak2QrisCollapseUi === "1") return false;
    card.dataset.ak2QrisCollapseUi = "1";

    const head = card.querySelector(":scope > .ak2-section-head");
    if(!head) return false;

    const body = document.createElement("div");
    body.className = "ak2-qris-ui-body";

    [...card.children].forEach(child => {
      if(child !== head) body.appendChild(child);
    });
    card.appendChild(body);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ak2-qris-toggle";
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = '<span class="ak2-qris-toggle-icon">⌄</span><span class="ak2-qris-toggle-label">Tampilkan</span>';
    head.appendChild(button);

    const sync = () => {
      const expanded = card.classList.contains("is-ui-expanded");
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
      const label = button.querySelector(".ak2-qris-toggle-label");
      if(label) label.textContent = expanded ? "Sembunyikan" : "Tampilkan";
    };

    button.addEventListener("click", () => {
      card.classList.toggle("is-ui-expanded");
      sync();
    });

    card.classList.remove("is-ui-expanded");
    sync();
    return true;
  }

  installStyle();
  if(!install()){
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if(install() || attempts >= 80) clearInterval(timer);
    }, 50);
  }
})();
