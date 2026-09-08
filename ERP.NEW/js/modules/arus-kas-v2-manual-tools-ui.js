/*
=========================================================
VAX ERP — ARUS KAS V2 MANUAL TOOLS + QUICK SEARCH
Additive UI/runtime layer. Tidak mengubah engine LOCK.

Fungsi:
- Search cepat Buku Arus Kas berdasarkan teks/nominal/status/sumber/cabang.
- Transaksi MANUAL non-verified diberi tombol Edit yang terlihat langsung di ledger.
- Edit tetap memakai flow existing ArusKasV2.openInput(row).
- Saat edit MANUAL (belum OWNER VERIFIED), tampil tombol Hapus + Simpan Perubahan.
- Hapus hanya MANUAL non-verified; AUTO dan OWNER VERIFIED tidak disentuh.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__manualToolsUiInstalled) return;
  flow.__manualToolsUiInstalled=true;

  let query="";
  let applying=false;

  function norm(v){
    return String(v??"").toLowerCase().replace(/\s+/g," ").trim();
  }

  function digits(v){
    return String(v??"").replace(/\D/g,"");
  }

  function applySearch(){
    if(applying) return;
    applying=true;
    try{
      const body=document.getElementById("ak2LedgerBody");
      if(!body) return;
      const q=norm(query), qDigits=digits(query);
      let visible=0;
      body.querySelectorAll("tr[data-id]").forEach(tr=>{
        const text=norm(tr.textContent);
        const textDigits=digits(tr.textContent);
        const hit=!q || text.includes(q) || (!!qDigits && textDigits.includes(qDigits));
        tr.hidden=!hit;
        if(hit) visible+=1;
      });
      const count=document.getElementById("ak2SearchCount");
      if(count) count.textContent=q ? `${visible} hasil` : "";
    }finally{
      applying=false;
    }
  }

  function installSearch(){
    const head=document.querySelector(".ak2-ledger-card .ak2-section-head");
    if(!head || document.getElementById("ak2QuickSearch")) return false;

    const right=head.querySelector(":scope > span");
    const wrap=document.createElement("div");
    wrap.className="ak2-quick-search-wrap";
    wrap.innerHTML=`
      <div class="ak2-quick-search">
        <span class="ak2-quick-search-icon" aria-hidden="true">⌕</span>
        <input id="ak2QuickSearch" type="search" autocomplete="off" placeholder="Cari nominal / kata..." aria-label="Cari transaksi Arus Kas">
        <button type="button" id="ak2QuickSearchClear" title="Bersihkan pencarian" aria-label="Bersihkan pencarian">×</button>
      </div>
      <small id="ak2SearchCount" class="ak2-search-count"></small>`;

    if(right){
      right.insertAdjacentElement("beforebegin",wrap);
    }else{
      head.appendChild(wrap);
    }

    const input=wrap.querySelector("#ak2QuickSearch");
    const clear=wrap.querySelector("#ak2QuickSearchClear");
    input.addEventListener("input",()=>{query=input.value;applySearch();});
    clear.addEventListener("click",()=>{input.value="";query="";applySearch();input.focus();});
    return true;
  }

  function currentEditRow(){
    const id=document.getElementById("ak2EditId")?.value;
    if(!id) return null;
    return flow.ledger?.find(x=>String(x.id)===String(id))||null;
  }

  function ensureDeleteButton(){
    const actions=document.querySelector("#ak2Modal .ak2-modal-actions");
    if(!actions) return null;
    let btn=document.getElementById("ak2DeleteManualBtn");
    if(!btn){
      btn=document.createElement("button");
      btn.type="button";
      btn.id="ak2DeleteManualBtn";
      btn.className="ak2-btn ak2-btn-delete";
      btn.textContent="Hapus";
      const save=document.getElementById("ak2SaveBtn");
      if(save) actions.insertBefore(btn,save);
      else actions.appendChild(btn);
      btn.addEventListener("click",deleteCurrentManual);
    }
    return btn;
  }

  function syncManualActions(){
    const row=currentEditRow();
    const del=ensureDeleteButton();
    const save=document.getElementById("ak2SaveBtn");
    if(!del || !save) return;

    const editable=!!row && row.entry_type==="MANUAL" && row.verification_status!=="OWNER_VERIFIED";
    del.hidden=!editable;
    save.textContent=editable ? "Simpan Perubahan" : "Simpan";
    save.classList.toggle("is-edit-save",editable);
  }

  function decorateManualRows(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;

    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      if(tr.querySelector("[data-ak2-manual-edit]")) return;
      const row=flow.ledger?.find(x=>String(x.id)===String(tr.dataset.id));
      if(!row || row.entry_type!=="MANUAL" || row.verification_status==="OWNER_VERIFIED") return;

      const statusCell=tr.lastElementChild;
      if(!statusCell) return;
      statusCell.classList.add("ak2-manual-status-cell");

      const btn=document.createElement("button");
      btn.type="button";
      btn.className="ak2-ledger-edit-btn";
      btn.dataset.ak2ManualEdit=row.id;
      btn.innerHTML="✎ <span>Edit</span>";
      btn.title="Edit transaksi manual";
      btn.addEventListener("click",e=>{
        e.preventDefault();
        e.stopPropagation();
        flow.openInput?.(row);
      });
      statusCell.appendChild(btn);
    });
  }

  async function deleteCurrentManual(){
    const row=currentEditRow();
    if(!row){ flow.fail?.("Transaksi manual tidak ditemukan."); return; }
    if(row.entry_type!=="MANUAL"){ flow.fail?.("Transaksi AUTO tidak boleh dihapus manual."); return; }
    if(row.verification_status==="OWNER_VERIFIED"){ flow.fail?.("Transaksi OWNER VERIFIED tidak boleh dihapus."); return; }

    const label=`${flow.fmtDate?.(row.tanggal)||row.tanggal} · ${flow.rupiah?.(row.amount)||row.amount} · ${row.description||flow.categoryName?.(row.category)||"Transaksi manual"}`;
    if(!window.confirm(`Hapus transaksi manual ini?\n\n${label}\n\nTindakan ini tidak dapat dibatalkan.`)) return;

    try{
      flow.busy?.(true);
      flow.clearMessage?.();
      try{
        await flow.audit?.(row.id,"DELETE_MANUAL",{before:row,deleted_by:flow.user?.id||null});
      }catch(_auditErr){}

      const {error}=await db.from(flow.TX_TABLE).delete().eq("id",row.id).eq("entry_type","MANUAL");
      if(error) throw error;

      flow.closeInput?.();
      flow.ok?.("Transaksi manual berhasil dihapus.");
      if(typeof flow.fastReload==="function") await flow.fastReload({loadSetoran:false});
      else await flow.reload?.();
      decorateManualRows();
      applySearch();
    }catch(e){
      flow.fail?.(e?.message||String(e));
    }finally{
      flow.busy?.(false);
    }
  }

  function installStyle(){
    if(document.getElementById("ak2ManualToolsUiStyle")) return;
    const s=document.createElement("style");
    s.id="ak2ManualToolsUiStyle";
    s.textContent=`
      body.page-arus-kas .ak2-ledger-card .ak2-section-head{gap:14px}
      body.page-arus-kas .ak2-quick-search-wrap{margin-left:auto;display:flex;align-items:center;gap:8px}
      body.page-arus-kas .ak2-quick-search{height:42px;min-width:300px;display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid #3d536b;border-radius:11px;background:linear-gradient(180deg,#182331,#111923);box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 8px 20px rgba(0,0,0,.16)}
      body.page-arus-kas .ak2-quick-search:focus-within{border-color:#d3a54b;box-shadow:0 0 0 2px rgba(211,165,75,.10),0 8px 22px rgba(0,0,0,.22)}
      body.page-arus-kas .ak2-quick-search-icon{color:#e0b45a;font-size:22px;line-height:1;transform:rotate(-18deg)}
      body.page-arus-kas #ak2QuickSearch{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#f4f8fc;font:inherit;font-size:14px;font-weight:800}
      body.page-arus-kas #ak2QuickSearch::placeholder{color:#7f8c99;font-weight:700}
      body.page-arus-kas #ak2QuickSearchClear{width:26px;height:26px;border:0;border-radius:7px;background:transparent;color:#82909e;font-size:20px;cursor:pointer}
      body.page-arus-kas #ak2QuickSearchClear:hover{background:#252f3a;color:#fff0c8}
      body.page-arus-kas .ak2-search-count{color:#91a5b9;font-weight:800;white-space:nowrap}

      body.page-arus-kas .ak2-manual-status-cell{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      body.page-arus-kas .ak2-ledger-edit-btn{min-height:34px;padding:7px 12px;border-radius:9px;border:1px solid #9a752d;background:linear-gradient(180deg,#5b4318,#34260f);color:#ffe39b;font:inherit;font-size:12px;font-weight:900;letter-spacing:.03em;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 5px 14px rgba(0,0,0,.16)}
      body.page-arus-kas .ak2-ledger-edit-btn:hover{filter:brightness(1.1);border-color:#d0a34b;box-shadow:0 0 0 2px rgba(208,163,75,.08),0 7px 18px rgba(0,0,0,.2)}
      body.page-arus-kas .ak2-ledger-edit-btn span{margin-left:3px}

      body.page-arus-kas #ak2Modal .ak2-btn-delete{background:linear-gradient(180deg,#6a2828,#3c1717);border-color:#a94a4a;color:#ffd0d0;box-shadow:0 8px 22px rgba(154,54,54,.18),inset 0 1px 0 rgba(255,255,255,.06)}
      body.page-arus-kas #ak2Modal .ak2-btn-delete:hover{filter:brightness(1.08);box-shadow:0 10px 28px rgba(154,54,54,.25)}
      body.page-arus-kas #ak2Modal #ak2SaveBtn.is-edit-save{min-width:150px}

      @media(max-width:900px){
        body.page-arus-kas .ak2-ledger-card .ak2-section-head{align-items:flex-start;flex-wrap:wrap}
        body.page-arus-kas .ak2-quick-search-wrap{order:3;width:100%;margin-left:0}
        body.page-arus-kas .ak2-quick-search{min-width:0;flex:1}
        body.page-arus-kas .ak2-ledger-edit-btn{min-height:31px;padding:6px 9px;font-size:11px}
      }
    `;
    document.head.appendChild(s);
  }

  const baseOpenInput=flow.openInput?.bind(flow);
  if(baseOpenInput){
    flow.openInput=function(){
      const r=baseOpenInput(...arguments);
      setTimeout(()=>{syncManualActions();window.ArusKasV2ModalDatepickerUI?.refresh?.();},0);
      return r;
    };
  }

  const baseCloseInput=flow.closeInput?.bind(flow);
  if(baseCloseInput){
    flow.closeInput=function(){
      const r=baseCloseInput(...arguments);
      setTimeout(syncManualActions,0);
      return r;
    };
  }

  installStyle();
  installSearch();
  ensureDeleteButton();
  syncManualActions();
  decorateManualRows();

  const body=document.getElementById("ak2LedgerBody");
  if(body){
    new MutationObserver(()=>{
      decorateManualRows();
      applySearch();
    }).observe(body,{childList:true,subtree:true});
  }

  if(!document.getElementById("ak2QuickSearch")){
    let tries=0;
    const t=setInterval(()=>{tries+=1;if(installSearch()||tries>=80)clearInterval(t)},50);
  }
})();