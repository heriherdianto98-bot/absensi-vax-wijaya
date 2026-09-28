/*
=========================================================
VAX ERP — ARUS KAS V2 SOFT DELETE / OWNER VERIFY
Additive runtime/UI layer. Core ArusKasV2 / engine Setoran tidak diubah.

Alur:
- Hanya SVP dapat mengajukan hapus transaksi MANUAL non-verified.
- Pending delete langsung dikeluarkan dari perhitungan saldo tetapi row tetap di history.
- Owner mendapat tombol ! merah LANGSUNG di kolom STATUS agar selalu terlihat/clickable.
- Owner klik ! -> konfirmasi -> status hapus resmi OWNER VERIFIED.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__softDeleteUiInstalled) return;
  flow.__softDeleteUiInstalled=true;

  const DELETE_PENDING="PENDING_OWNER";
  const DELETE_VERIFIED="OWNER_VERIFIED";
  const baseWalletBalance=flow.walletBalance?.bind(flow);
  const baseKasEffect=flow.kasEffect?.bind(flow);
  const baseVerifyRow=flow.verifyRow?.bind(flow);
  const baseOpenInput=flow.openInput?.bind(flow);
  let decorateQueued=false;

  const rowById=id=>flow.ledger?.find(x=>String(x.id)===String(id))||null;
  const deleteStatus=row=>String(row?.metadata?.delete_status||"");
  const isDeleteInactive=row=>[DELETE_PENDING,DELETE_VERIFIED].includes(deleteStatus(row));
  const isSvp=()=>String(flow.role||"").toLowerCase()==="svp";
  const isOwner=()=>String(flow.role||"").toLowerCase()==="owner";

  flow.deleteStatus=deleteStatus;
  flow.isDeleteInactive=isDeleteInactive;
  flow.originalKasEffect=row=>baseKasEffect?baseKasEffect(row):0;

  flow.walletBalance=function(wallet){
    if(!Array.isArray(this.ledger)) return baseWalletBalance?baseWalletBalance(wallet):0;
    return this.ledger.reduce((t,row)=>{
      if(isDeleteInactive(row)) return t;
      const amount=this.money?.(row.amount)??Number(row.amount||0);
      return t+(row.to_wallet===wallet?amount:0)-(row.from_wallet===wallet?amount:0);
    },0);
  };

  flow.kasEffect=function(row){
    if(isDeleteInactive(row)) return 0;
    return baseKasEffect?baseKasEffect(row):0;
  };

  function currentEditRow(){
    const id=document.getElementById("ak2EditId")?.value;
    return id?rowById(id):null;
  }

  function syncModalDeleteButton(){
    const row=currentEditRow();
    const btn=document.getElementById("ak2DeleteManualBtn");
    if(!btn) return;
    const allowed=isSvp() && !!row && row.entry_type==="MANUAL" && row.verification_status!=="OWNER_VERIFIED" && !isDeleteInactive(row);
    btn.hidden=!allowed;
    btn.title=allowed?"Ajukan hapus transaksi ke Owner":"";
  }

  async function requestDelete(row){
    if(!row) throw new Error("Transaksi manual tidak ditemukan.");
    if(!isSvp()) throw new Error("Pengajuan hapus transaksi hanya untuk akun SVP.");
    if(row.entry_type!=="MANUAL") throw new Error("Transaksi AUTO tidak boleh dihapus manual.");
    if(row.verification_status==="OWNER_VERIFIED") throw new Error("Transaksi OWNER VERIFIED tidak boleh diajukan hapus.");
    if(isDeleteInactive(row)) throw new Error("Transaksi ini sudah dalam proses / history hapus.");

    const label=`${flow.fmtDate?.(row.tanggal)||row.tanggal} · ${flow.rupiah?.(row.amount)||row.amount} · ${row.description||flow.categoryName?.(row.category)||"Transaksi manual"}`;
    if(!window.confirm(`Hapus transaksi manual ini?\n\n${label}\n\nTransaksi akan dinonaktifkan dari saldo dan menunggu verifikasi Owner.`)) return false;

    const now=new Date().toISOString();
    const metadata={...(row.metadata||{}),delete_status:DELETE_PENDING,delete_requested_by:flow.user?.id||null,delete_requested_at:now,delete_verified_by:null,delete_verified_at:null};
    const {data,error}=await db.from(flow.TX_TABLE)
      .update({metadata,updated_by:flow.user?.id||null,updated_at:now})
      .eq("id",row.id).eq("entry_type","MANUAL").select("*").single();
    if(error) throw error;
    await flow.audit?.(row.id,"DELETE_REQUEST",{before:row,after:data});
    return data;
  }

  async function verifyDelete(row){
    if(!row) throw new Error("Transaksi tidak ditemukan.");
    if(!isOwner()) throw new Error("Verifikasi hapus hanya untuk Owner.");
    if(deleteStatus(row)!==DELETE_PENDING) throw new Error("Transaksi ini tidak sedang menunggu verifikasi hapus.");

    const label=`${flow.fmtDate?.(row.tanggal)||row.tanggal} · ${flow.rupiah?.(row.amount)||row.amount} · ${row.description||flow.categoryName?.(row.category)||"Transaksi manual"}`;
    if(!window.confirm(`Verifikasi hapus transaksi ini?\n\n${label}\n\nSetelah OK, status hapus menjadi resmi dan tetap tersimpan di history Buku Arus Kas.`)) return false;

    const now=new Date().toISOString();
    const metadata={...(row.metadata||{}),delete_status:DELETE_VERIFIED,delete_verified_by:flow.user?.id||null,delete_verified_at:now};
    const {data,error}=await db.from(flow.TX_TABLE)
      .update({
        metadata,
        verification_status:"OWNER_VERIFIED",
        verified_by:flow.user?.id||null,
        verified_at:now,
        correction_note:null,
        updated_by:flow.user?.id||null,
        updated_at:now
      })
      .eq("id",row.id).select("*").single();
    if(error) throw error;
    await flow.audit?.(row.id,"DELETE_OWNER_VERIFY",{before:row,after:data});
    return data;
  }

  async function handleDeleteButton(){
    const row=currentEditRow();
    try{
      flow.busy?.(true);flow.clearMessage?.();
      const saved=await requestDelete(row);
      if(!saved) return;
      flow.closeInput?.();
      flow.ok?.("Pengajuan hapus tersimpan · menunggu verifikasi Owner.");
      if(typeof flow.fastReload==="function") await flow.fastReload({loadSetoran:false}); else await flow.reload?.();
      scheduleDecorate();
    }catch(e){flow.fail?.(e?.message||String(e))}
    finally{flow.busy?.(false)}
  }

  async function handleOwnerVerify(id){
    const row=rowById(id);
    try{
      flow.busy?.(true);flow.clearMessage?.();
      const saved=await verifyDelete(row);
      if(!saved) return;
      flow.ok?.("Hapus transaksi sudah diverifikasi Owner dan tersimpan di history.");
      if(typeof flow.fastReload==="function") await flow.fastReload({loadSetoran:false}); else await flow.reload?.();
      scheduleDecorate();
    }catch(e){flow.fail?.(e?.message||String(e))}
    finally{flow.busy?.(false)}
  }

  document.addEventListener("click",e=>{
    const del=e.target.closest?.("#ak2DeleteManualBtn");
    if(del){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      handleDeleteButton();return;
    }
    const verify=e.target.closest?.("[data-ak2-delete-verify]");
    if(verify){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      if(isOwner()) handleOwnerVerify(verify.dataset.ak2DeleteVerify);
    }
  },true);

  if(baseVerifyRow){
    flow.verifyRow=function(id){
      const row=rowById(id);
      if(row && deleteStatus(row)===DELETE_PENDING) return handleOwnerVerify(id);
      return baseVerifyRow(id);
    };
  }

  if(baseOpenInput){
    flow.openInput=function(row=null){
      if(row && isDeleteInactive(row)){
        flow.fail?.("Transaksi ini sudah menjadi history hapus dan tidak dapat diedit.");
        return;
      }
      const r=baseOpenInput(row);
      setTimeout(syncModalDeleteButton,0);
      return r;
    };
  }

  function findLedgerCells(tr){
    const hasCabang=!!tr.querySelector(":scope > td.ak2-cabang-col");
    const o=hasCabang?1:0;
    return {masuk:tr.children[1+o],ketMasuk:tr.children[2+o],keluar:tr.children[3+o],ketKeluar:tr.children[4+o],saldo:tr.children[5+o],status:tr.children[7+o]};
  }

  function setDeletedHistoryCell(cell,text,className){
    if(!cell) return;
    cell.textContent="";
    const span=document.createElement("span");
    span.className=className;
    span.textContent=text;
    cell.appendChild(span);
  }

  function restoreHistoryMutation(tr,row){
    if(!isDeleteInactive(row)) return;
    const c=findLedgerCells(tr);
    const amount=flow.money?.(row.amount)??Number(row.amount||0);
    const effect=baseKasEffect?baseKasEffect(row):0;
    const desc=row.description||flow.categoryName?.(row.category)||"Transaksi manual";
    const money=flow.rupiah?.(amount)||String(amount);
    let direction=effect>0?"IN":effect<0?"OUT":"";
    if(!direction){
      if(row.from_wallet==="EXTERNAL"&&row.to_wallet!=="EXTERNAL") direction="IN";
      else if(row.to_wallet==="EXTERNAL"&&row.from_wallet!=="EXTERNAL") direction="OUT";
      else direction="IN";
    }
    if(direction==="IN"){
      setDeletedHistoryCell(c.masuk,money,"ak2-deleted-history-text ak2-deleted-amount");
      setDeletedHistoryCell(c.ketMasuk,desc,"ak2-deleted-history-text ak2-deleted-desc");
      if(c.keluar)c.keluar.textContent="—";
      if(c.ketKeluar)c.ketKeluar.textContent="—";
    }else{
      setDeletedHistoryCell(c.keluar,money,"ak2-deleted-history-text ak2-deleted-amount");
      setDeletedHistoryCell(c.ketKeluar,desc,"ak2-deleted-history-text ak2-deleted-desc");
      if(c.masuk)c.masuk.textContent="—";
      if(c.ketMasuk)c.ketMasuk.textContent="—";
    }
  }

  function syncOwnerActionVisibility(){
    document.body.classList.toggle("ak2-owner-no-action",isOwner());
  }

  function decorateRows(){
    syncOwnerActionVisibility();
    const body=document.getElementById("ak2LedgerBody");
    if(!body)return;
    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id);if(!row)return;
      const state=deleteStatus(row),pending=state===DELETE_PENDING,verified=state===DELETE_VERIFIED;
      tr.classList.toggle("ak2-delete-pending",pending);
      tr.classList.toggle("ak2-delete-verified",verified);
      if(!(pending||verified))return;

      restoreHistoryMutation(tr,row);
      const c=findLedgerCells(tr);
      if(c.status){
        if(pending){
          c.status.innerHTML=isOwner()
            ? `<button type="button" class="ak2-status ak2-delete-status is-delete-pending ak2-delete-owner-action" data-ak2-delete-verify="${row.id}" title="Klik untuk verifikasi hapus"><span class="ak2-delete-alert">!</span> HAPUS · MENUNGGU OWNER</button>`
            : '<span class="ak2-status ak2-delete-status is-delete-pending"><span class="ak2-delete-alert">!</span> HAPUS · MENUNGGU OWNER</span>';
        }else{
          c.status.innerHTML='<span class="ak2-status ak2-delete-status is-delete-verified"><span class="ak2-delete-check">✓</span> HAPUS · OWNER VERIFIED</span>';
        }
      }

      const action=tr.querySelector(":scope > .ak2-action-cell");
      if(action){
        action.textContent="";
        if(!isOwner()){
          if(verified){
            const done=document.createElement("span");done.className="ak2-delete-state-icon is-verified";done.textContent="✓";done.title="Hapus sudah diverifikasi Owner";action.appendChild(done);
          }
        }
      }
    });
    syncModalDeleteButton();
  }

  function scheduleDecorate(){
    if(decorateQueued)return;
    decorateQueued=true;
    requestAnimationFrame(()=>{decorateQueued=false;decorateRows();setTimeout(decorateRows,0)});
  }

  function installStyle(){
    if(document.getElementById("ak2SoftDeleteUiStyle"))return;
    const s=document.createElement("style");s.id="ak2SoftDeleteUiStyle";
    s.textContent=`
      body.page-arus-kas #ak2LedgerBody tr.ak2-delete-pending>td{background-color:rgba(109,28,28,.08)!important}
      body.page-arus-kas #ak2LedgerBody tr.ak2-delete-verified>td{background-color:rgba(52,63,72,.10)!important}

      /* UI ONLY — history hapus: nominal + keterangan dicoret merah tebal. */
      body.page-arus-kas .ak2-deleted-history-text{
        display:inline-block;
        text-decoration-line:line-through!important;
        text-decoration-color:#ff4545!important;
        text-decoration-thickness:3px!important;
        text-decoration-skip-ink:none!important;
        opacity:.84;
      }
      body.page-arus-kas .ak2-deleted-desc{color:#d9b7b7!important}

      body.page-arus-kas .ak2-delete-state-icon{width:30px;height:30px;display:inline-grid;place-items:center;border-radius:50%;font-weight:950;font-size:17px;line-height:1}
      body.page-arus-kas button.ak2-delete-state-icon{cursor:pointer}
      body.page-arus-kas .ak2-delete-state-icon.is-pending,.ak2-delete-alert{border:1px solid #b94c4c;background:#611f1f;color:#ffd1d1}
      body.page-arus-kas .ak2-delete-state-icon.is-verified{border:1px solid #3f7d58;background:#173524;color:#b8f1cb}
      body.page-arus-kas .ak2-delete-status{min-width:186px!important;font-size:11px!important;gap:7px!important}
      body.page-arus-kas .ak2-delete-status.is-delete-pending{background:linear-gradient(180deg,#612727,#381818)!important;border-color:#9a4444!important;color:#ffc5c5!important}
      body.page-arus-kas .ak2-delete-status.is-delete-verified{background:linear-gradient(180deg,#34414c,#222b32)!important;border-color:#566875!important;color:#d7e1e8!important}
      body.page-arus-kas .ak2-delete-owner-action{cursor:pointer!important;pointer-events:auto!important;position:relative;z-index:30}
      body.page-arus-kas .ak2-delete-owner-action:hover{filter:brightness(1.16);box-shadow:0 0 0 2px rgba(185,76,76,.14)!important}
      body.page-arus-kas .ak2-delete-alert{width:20px;height:20px;display:inline-grid;place-items:center;border-radius:50%;font-weight:950;line-height:1}
      body.page-arus-kas .ak2-delete-check{font-size:15px;font-weight:950;color:#b8f1cb}

      /* UI ONLY — akun Owner tidak membutuhkan kolom/tombol AKSI. */
      body.page-arus-kas.ak2-owner-no-action .ak2-action-head,
      body.page-arus-kas.ak2-owner-no-action .ak2-action-cell{
        display:none!important;
      }
    `;document.head.appendChild(s);
  }

  installStyle();
  syncOwnerActionVisibility();
  const body=document.getElementById("ak2LedgerBody");
  if(body)new MutationObserver(()=>scheduleDecorate()).observe(body,{childList:true,subtree:false});
  document.addEventListener("change",e=>{if(e.target?.id==="ak2Kategori")setTimeout(syncModalDeleteButton,0)});
  scheduleDecorate();
})();
