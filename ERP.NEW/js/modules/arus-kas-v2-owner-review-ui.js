/*
=========================================================
VAX ERP — ARUS KAS V2 OWNER REVIEW ENTRY UI
UI/runtime additive only. Tidak mengubah engine, data, formula, query,
wallet balance, source of truth, atau workflow verifikasi existing.

Tujuan:
- Di akun Owner, badge BELUM DIVERIFIKASI menjadi target klik yang jelas.
- Klik badge membuka detail transaksi existing, lalu Owner memakai tombol
  Verifikasi / Minta Koreksi yang sudah ada di ArusKasV2.
- Di akun SVP, transaksi OWNER VERIFIED diberi ikon ceklis hijau.
- Di kolom AKSI akun SVP, transaksi OWNER VERIFIED menampilkan ikon ceklis
  hijau non-clickable agar kolom tidak kosong.
- Header TANGGAL tetap sticky saat scroll vertikal, tetapi isi kolom tanggal
  tetap tidak freeze horizontal.
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
  const isSvp=()=>String(flow.role||"").toLowerCase()==="svp";
  const rowById=id=>flow.ledger?.find(x=>String(x.id)===String(id))||null;
  const isDeleteInactive=row=>typeof flow.isDeleteInactive==="function" && flow.isDeleteInactive(row);

  function statusCell(tr){
    const hasCabang=!!tr.querySelector(":scope > td.ak2-cabang-col");
    const o=hasCabang?1:0;
    return tr.children[7+o]||null;
  }

  function ensureSvpVerifiedAction(tr,row){
    if(!isSvp() || String(row?.verification_status||"")!=="OWNER_VERIFIED") return;
    let cell=tr.querySelector(":scope > .ak2-action-cell");
    if(!cell){
      cell=document.createElement("td");
      cell.className="ak2-action-cell";
      tr.appendChild(cell);
    }
    if(cell.querySelector(".ak2-svp-action-verified")) return;
    const icon=document.createElement("span");
    icon.className="ak2-svp-action-verified";
    icon.textContent="✓";
    icon.title="Sudah diverifikasi Owner";
    icon.setAttribute("aria-label","Sudah diverifikasi Owner");
    cell.appendChild(icon);
  }

  function decorate(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;

    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id);
      if(!row || isDeleteInactive(row)) return;
      const state=String(row.verification_status||"");
      const cell=statusCell(tr);
      if(!cell) return;

      if(isOwner() && state==="BELUM_DIVERIFIKASI"){
        const badge=cell.querySelector(".ak2-status.is-pending");
        if(badge){
          badge.dataset.ak2OwnerReview=row.id;
          badge.setAttribute("role","button");
          badge.setAttribute("tabindex","0");
          badge.title="Klik untuk review transaksi";
          badge.classList.add("ak2-owner-review-action");
        }
      }

      if(isSvp() && state==="OWNER_VERIFIED"){
        const badge=cell.querySelector(".ak2-status.is-verified");
        if(badge){
          badge.classList.add("ak2-svp-verified-check");
          badge.title="Sudah diverifikasi Owner";
        }
        ensureSvpVerifiedAction(tr,row);
      }
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

      /* UI ONLY — ceklis hijau jelas di akun SVP untuk OWNER VERIFIED. */
      body.page-arus-kas .ak2-status.ak2-svp-verified-check::before{
        content:"✓";
        display:inline-grid;
        place-items:center;
        width:17px;
        height:17px;
        margin-right:6px;
        border-radius:50%;
        border:1px solid rgba(116,238,157,.55);
        background:rgba(36,111,67,.42);
        color:#8ff0ad;
        font-size:12px;
        font-weight:950;
        line-height:1;
        flex:0 0 17px;
      }

      /* UI ONLY — icon status final di kolom AKSI SVP, non-clickable. */
      body.page-arus-kas .ak2-svp-action-verified{
        width:28px;
        height:28px;
        display:inline-grid;
        place-items:center;
        border-radius:50%;
        border:1px solid #3f7d58;
        background:linear-gradient(180deg,#214d35,#173524);
        color:#b8f1cb;
        font-size:16px;
        font-weight:950;
        line-height:1;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 4px 10px rgba(0,0,0,.14);
        pointer-events:none;
        user-select:none;
      }

      /* UI ONLY — hanya JUDUL TANGGAL yang sticky saat scroll vertikal.
         Isi kolom tanggal tetap normal/tidak freeze horizontal. */
      body.page-arus-kas .ak2-ledger-card .ak2-table thead th:first-child{
        position:sticky!important;
        left:auto!important;
        z-index:24!important;
        box-shadow:none!important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td:first-child{
        position:static!important;
        left:auto!important;
        z-index:auto!important;
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
