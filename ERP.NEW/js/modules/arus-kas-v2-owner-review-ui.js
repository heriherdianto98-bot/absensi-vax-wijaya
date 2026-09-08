/*
=========================================================
VAX ERP — ARUS KAS V2 OWNER REVIEW ENTRY UI
UI/runtime additive only. Tidak mengubah engine, data, formula, query,
wallet balance, source of truth, atau workflow verifikasi existing.

Tujuan:
- Di akun Owner, badge BELUM DIVERIFIKASI menjadi target klik yang jelas.
- Klik badge membuka detail transaksi existing, lalu Owner memakai tombol
  Verifikasi / Minta Koreksi yang sudah ada di ArusKasV2.
- Tidak berlaku untuk history hapus; alur hapus tetap ditangani layer soft-delete.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__ownerReviewUiInstalled) return;
  flow.__ownerReviewUiInstalled=true;

  let queued=false;
  const isOwner=()=>String(flow.role||"").toLowerCase()==="owner";
  const rowById=id=>flow.ledger?.find(x=>String(x.id)===String(id))||null;
  const isDeleteInactive=row=>typeof flow.isDeleteInactive==="function" && flow.isDeleteInactive(row);

  function statusCell(tr){
    const hasCabang=!!tr.querySelector(":scope > td.ak2-cabang-col");
    const o=hasCabang?1:0;
    return tr.children[7+o]||null;
  }

  function decorate(){
    if(!isOwner()) return;
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;

    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id);
      if(!row || isDeleteInactive(row)) return;
      if(String(row.verification_status||"")!=="BELUM_DIVERIFIKASI") return;

      const cell=statusCell(tr);
      const badge=cell?.querySelector(".ak2-status.is-pending");
      if(!badge) return;
      badge.dataset.ak2OwnerReview=row.id;
      badge.setAttribute("role","button");
      badge.setAttribute("tabindex","0");
      badge.title="Klik untuk review transaksi";
      badge.classList.add("ak2-owner-review-action");
    });
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      decorate();
      setTimeout(decorate,0);
    });
  }

  function openReview(id){
    if(!isOwner())return;
    const row=rowById(id);
    if(!row || isDeleteInactive(row) || String(row.verification_status||"")!=="BELUM_DIVERIFIKASI")return;
    flow.openDetail?.(row.id);
  }

  document.addEventListener("click",e=>{
    const el=e.target.closest?.("[data-ak2-owner-review]");
    if(!el)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openReview(el.dataset.ak2OwnerReview);
  },true);

  document.addEventListener("keydown",e=>{
    const el=e.target.closest?.("[data-ak2-owner-review]");
    if(!el || !["Enter"," "].includes(e.key))return;
    e.preventDefault();
    openReview(el.dataset.ak2OwnerReview);
  },true);

  function installStyle(){
    if(document.getElementById("ak2OwnerReviewUiStyle"))return;
    const s=document.createElement("style");
    s.id="ak2OwnerReviewUiStyle";
    s.textContent=`
      body.page-arus-kas .ak2-owner-review-action{
        cursor:pointer!important;
        pointer-events:auto!important;
        position:relative;
        z-index:25;
        user-select:none;
      }
      body.page-arus-kas .ak2-owner-review-action:hover{
        filter:brightness(1.13);
        box-shadow:0 0 0 2px rgba(216,174,77,.14),0 5px 14px rgba(0,0,0,.16)!important;
      }
      body.page-arus-kas .ak2-owner-review-action:focus-visible{
        outline:2px solid #d8ae4d;
        outline-offset:2px;
      }
    `;
    document.head.appendChild(s);
  }

  installStyle();
  const body=document.getElementById("ak2LedgerBody");
  if(body)new MutationObserver(()=>schedule()).observe(body,{childList:true,subtree:false});
  document.addEventListener("erp:finance-ready",schedule);
  schedule();
})();
