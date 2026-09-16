/*
=========================================================
VAX ERP — OWNER MANUAL UNVERIFY UI
Additive UI/runtime layer. Tidak mengubah engine Arus Kas.

Aturan:
- Hanya akun OWNER.
- Hanya transaksi entry_type MANUAL.
- Hanya transaksi manual yang dibuat oleh Owner aktif itu sendiri.
- AUTO dan transaksi manual SVP tidak disentuh.
- Klik badge OWNER VERIFIED -> BELUM DIVERIFIKASI.
- Setelah itu flow edit existing otomatis bisa dipakai lagi.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__ownerManualUnverifyUiInstalled) return;
  flow.__ownerManualUnverifyUiInstalled=true;

  let decorateQueued=false;
  const rowById=id=>flow.ledger?.find(x=>String(x.id)===String(id))||null;

  function canUnlock(row){
    return !!row
      && flow.isOwner?.()
      && row.entry_type==="MANUAL"
      && row.verification_status==="OWNER_VERIFIED"
      && String(row.created_by||"")===String(flow.user?.id||"");
  }

  function decorate(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;
    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id);
      const badge=tr.querySelector(".ak2-status.is-verified");
      if(!badge) return;
      if(canUnlock(row)){
        badge.dataset.ak2OwnerManualUnverify=row.id;
        badge.classList.add("is-owner-unlockable");
        badge.setAttribute("role","button");
        badge.setAttribute("tabindex","0");
        badge.setAttribute("title","Klik untuk ubah menjadi Belum Diverifikasi agar bisa diedit");
        badge.setAttribute("aria-label","Ubah transaksi manual Owner menjadi Belum Diverifikasi");
      }else{
        delete badge.dataset.ak2OwnerManualUnverify;
        badge.classList.remove("is-owner-unlockable");
        badge.removeAttribute("role");
        badge.removeAttribute("tabindex");
        badge.removeAttribute("title");
        badge.removeAttribute("aria-label");
      }
    });
  }

  function scheduleDecorate(){
    if(decorateQueued) return;
    decorateQueued=true;
    requestAnimationFrame(()=>{
      decorateQueued=false;
      decorate();
    });
  }

  async function unlock(id){
    const row=rowById(id);
    if(!canUnlock(row)){
      flow.fail?.("Hanya transaksi manual milik Owner yang sudah verified yang bisa dibuka kembali.");
      return;
    }

    const ok=window.confirm("Ubah OWNER VERIFIED menjadi BELUM DIVERIFIKASI agar transaksi ini bisa diedit ulang?");
    if(!ok) return;

    try{
      flow.busy?.(true);
      flow.clearMessage?.();
      const now=new Date().toISOString();
      const payload={
        verification_status:"BELUM_DIVERIFIKASI",
        verified_by:null,
        verified_at:null,
        correction_note:null,
        updated_by:flow.user.id,
        updated_at:now
      };
      const {data,error}=await db.from(flow.TX_TABLE)
        .update(payload)
        .eq("id",row.id)
        .eq("entry_type","MANUAL")
        .eq("created_by",flow.user.id)
        .eq("verification_status","OWNER_VERIFIED")
        .select("*")
        .single();
      if(error) throw error;

      try{
        await flow.audit?.(row.id,"OWNER_UNVERIFY_MANUAL",{before:row,after:data});
      }catch(_e){}

      flow.ok?.("Transaksi manual dibuka kembali · status Belum Diverifikasi.");
      if(typeof flow.fastReload==="function") await flow.fastReload({loadSetoran:false});
      else await flow.reload?.();
      scheduleDecorate();
    }catch(e){
      flow.fail?.(e?.message||String(e));
    }finally{
      flow.busy?.(false);
    }
  }

  document.addEventListener("click",e=>{
    const badge=e.target.closest?.("[data-ak2-owner-manual-unverify]");
    if(!badge) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    unlock(badge.dataset.ak2OwnerManualUnverify);
  },true);

  document.addEventListener("keydown",e=>{
    const badge=e.target.closest?.("[data-ak2-owner-manual-unverify]");
    if(!badge || !["Enter"," "].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    unlock(badge.dataset.ak2OwnerManualUnverify);
  },true);

  if(!document.getElementById("ak2OwnerManualUnverifyStyle")){
    const style=document.createElement("style");
    style.id="ak2OwnerManualUnverifyStyle";
    style.textContent=`
      body.page-arus-kas .ak2-status.is-verified.is-owner-unlockable{
        cursor:pointer;
        user-select:none;
        transition:filter .15s ease,box-shadow .15s ease,transform .15s ease;
      }
      body.page-arus-kas .ak2-status.is-verified.is-owner-unlockable:hover,
      body.page-arus-kas .ak2-status.is-verified.is-owner-unlockable:focus-visible{
        filter:brightness(1.14);
        box-shadow:0 0 0 2px rgba(255,211,107,.18),0 0 14px rgba(72,207,141,.16);
        outline:none;
      }
      body.page-arus-kas .ak2-status.is-verified.is-owner-unlockable:active{transform:translateY(1px)}
    `;
    document.head.appendChild(style);
  }

  decorate();
  const body=document.getElementById("ak2LedgerBody");
  if(body) new MutationObserver(scheduleDecorate).observe(body,{childList:true,subtree:false});

  const baseRenderLedger=flow.renderLedger?.bind(flow);
  if(baseRenderLedger){
    flow.renderLedger=function(){
      const result=baseRenderLedger(...arguments);
      scheduleDecorate();
      return result;
    };
  }
})();
