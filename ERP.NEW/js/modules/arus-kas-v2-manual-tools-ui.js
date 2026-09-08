/*
=========================================================
VAX ERP — ARUS KAS V2 MANUAL TOOLS + QUICK SEARCH
Additive UI/runtime layer. Tidak mengubah engine LOCK.

Fungsi:
- Search cepat Buku Arus Kas berdasarkan teks/nominal/status/sumber/cabang.
- Transaksi MANUAL non-verified diberi kolom AKSI berisi icon Edit saja.
- Edit tetap memakai flow existing ArusKasV2.openInput(row).
- Saat edit MANUAL tampil Hapus + Simpan Perubahan.
- Tabel boleh horizontal scroll bila kolom tidak cukup.
- UI audit: saldo Kas Besar diperjelas, pembatas tanggal tegas, kolom tanggal freeze.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__manualToolsUiInstalled) return;
  flow.__manualToolsUiInstalled=true;

  let query="";
  let applying=false;
  let decorateQueued=false;

  const norm=v=>String(v??"").toLowerCase().replace(/\s+/g," ").trim();
  const digits=v=>String(v??"").replace(/\D/g,"");
  const rowById=id=>flow.ledger?.find(x=>String(x.id)===String(id))||null;

  function rowSearchText(tr){
    const row=rowById(tr.dataset.id)||{};
    return norm([
      tr.textContent,row.tanggal,row.branch_name,row.cabang_name,row.description,
      row.category,row.entry_type,row.source,row.verification_status,row.amount,
      flow.rupiah?.(row.amount)
    ].filter(Boolean).join(" "));
  }

  function applySearch(forceValue){
    if(applying) return;
    applying=true;
    try{
      const body=document.getElementById("ak2LedgerBody");
      const input=document.getElementById("ak2QuickSearch");
      if(!body) return;
      if(typeof forceValue==="string") query=forceValue;
      else if(input) query=input.value;

      const q=norm(query);
      const qDigits=digits(query);
      let visible=0;
      const rows=[...body.querySelectorAll("tr[data-id]")];

      rows.forEach(tr=>{
        const text=rowSearchText(tr);
        const hit=!q || text.includes(q) || (!!qDigits && digits(text).includes(qDigits));
        tr.hidden=!hit;
        tr.style.display=hit?"":"none";
        if(hit) visible++;
      });

      const count=document.getElementById("ak2SearchCount");
      if(count) count.textContent=q?`${visible} hasil dari ${rows.length}`:"";
      document.querySelector(".ak2-quick-search")?.classList.toggle("is-active",!!q);
    }finally{applying=false}
  }

  function installSearch(){
    const head=document.querySelector(".ak2-ledger-card .ak2-section-head");
    if(!head || document.getElementById("ak2QuickSearch")) return false;
    const right=head.querySelector(":scope > span");
    const wrap=document.createElement("div");
    wrap.className="ak2-quick-search-wrap";
    wrap.innerHTML=`
      <div class="ak2-quick-search">
        <button type="button" id="ak2QuickSearchBtn" class="ak2-quick-search-icon" title="Cari transaksi" aria-label="Cari transaksi">⌕</button>
        <input id="ak2QuickSearch" type="text" autocomplete="off" placeholder="Cari nominal / kata..." aria-label="Cari transaksi Arus Kas">
      </div>
      <small id="ak2SearchCount" class="ak2-search-count"></small>`;
    if(right) right.insertAdjacentElement("beforebegin",wrap); else head.appendChild(wrap);

    const input=wrap.querySelector("#ak2QuickSearch");
    const searchBtn=wrap.querySelector("#ak2QuickSearchBtn");

    input.addEventListener("input",()=>applySearch(input.value));
    input.addEventListener("keydown",e=>{
      if(e.key==="Enter"){
        e.preventDefault();
        applySearch(input.value);
      }
      if(e.key==="Escape"){
        input.value="";
        applySearch("");
      }
    });
    searchBtn.addEventListener("click",()=>{
      input.focus();
      applySearch(input.value);
    });
    return true;
  }

  function currentEditRow(){ return rowById(document.getElementById("ak2EditId")?.value); }

  function ensureDeleteButton(){
    const actions=document.querySelector("#ak2Modal .ak2-modal-actions");
    if(!actions) return null;
    let btn=document.getElementById("ak2DeleteManualBtn");
    if(btn) return btn;
    btn=document.createElement("button");
    btn.type="button"; btn.id="ak2DeleteManualBtn"; btn.className="ak2-btn ak2-btn-delete"; btn.textContent="Hapus";
    const save=document.getElementById("ak2SaveBtn");
    if(save) actions.insertBefore(btn,save); else actions.appendChild(btn);
    btn.addEventListener("click",deleteCurrentManual);
    return btn;
  }

  function syncManualActions(){
    const row=currentEditRow(),del=ensureDeleteButton(),save=document.getElementById("ak2SaveBtn"),modal=document.getElementById("ak2Modal");
    if(!del || !save) return;
    const editable=!!row && row.entry_type==="MANUAL" && row.verification_status!=="OWNER_VERIFIED";
    del.hidden=!editable;
    save.textContent=editable?"Simpan Perubahan":"Simpan";
    save.classList.toggle("is-edit-save",editable);
    modal?.classList.toggle("is-manual-edit",editable);
  }

  function ensureActionHeader(){
    const tr=document.querySelector(".ak2-ledger-card .ak2-table thead tr");
    if(!tr || tr.querySelector("th[data-ak2-action-head]")) return;
    const th=document.createElement("th");
    th.dataset.ak2ActionHead="1"; th.className="ak2-action-head"; th.textContent="AKSI"; tr.appendChild(th);
  }

  function decorateManualRows(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;
    ensureActionHeader();
    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id);
      const editable=!!row && row.entry_type==="MANUAL" && row.verification_status!=="OWNER_VERIFIED";
      let cell=tr.querySelector(":scope > .ak2-action-cell");
      if(!cell){ cell=document.createElement("td"); cell.className="ak2-action-cell"; tr.appendChild(cell); }
      let btn=cell.querySelector("[data-ak2-manual-edit]");
      if(!editable){ if(btn) btn.remove(); return; }
      if(btn && String(btn.dataset.ak2ManualEdit)===String(row.id)) return;
      cell.textContent="";
      btn=document.createElement("button");
      btn.type="button"; btn.className="ak2-ledger-edit-icon"; btn.dataset.ak2ManualEdit=row.id; btn.textContent="✎";
      btn.title="Edit transaksi manual"; btn.setAttribute("aria-label","Edit transaksi manual");
      cell.appendChild(btn);
    });
  }

  function decorateDateGroups(){
    const body=document.getElementById("ak2LedgerBody");
    if(!body) return;
    let previousDate="";
    body.querySelectorAll("tr[data-id]").forEach(tr=>{
      const row=rowById(tr.dataset.id)||{};
      const date=String(row.tanggal||"");
      tr.classList.toggle("ak2-date-start",!!date && date!==previousDate);
      if(date) previousDate=date;
    });
  }

  function scheduleDecorate(){
    if(decorateQueued) return;
    decorateQueued=true;
    requestAnimationFrame(()=>{
      decorateQueued=false;
      decorateManualRows();
      decorateDateGroups();
      applySearch();
    });
  }

  document.addEventListener("click",e=>{
    const btn=e.target.closest?.("[data-ak2-manual-edit]");
    if(!btn) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const row=rowById(btn.dataset.ak2ManualEdit);
    if(!row || row.entry_type!=="MANUAL" || row.verification_status==="OWNER_VERIFIED") return;
    flow.openInput?.(row);
  },true);

  async function deleteCurrentManual(){
    const row=currentEditRow();
    if(!row){flow.fail?.("Transaksi manual tidak ditemukan.");return}
    if(row.entry_type!=="MANUAL"){flow.fail?.("Transaksi AUTO tidak boleh dihapus manual.");return}
    if(row.verification_status==="OWNER_VERIFIED"){flow.fail?.("Transaksi OWNER VERIFIED tidak boleh dihapus.");return}
    try{
      flow.busy?.(true); flow.clearMessage?.();
      try{await flow.audit?.(row.id,"DELETE_MANUAL",{before:row,deleted_by:flow.user?.id||null})}catch(_e){}
      const {error}=await db.from(flow.TX_TABLE).delete().eq("id",row.id).eq("entry_type","MANUAL");
      if(error) throw error;
      flow.closeInput?.(); flow.ok?.("Transaksi manual berhasil dihapus.");
      if(typeof flow.fastReload==="function") await flow.fastReload({loadSetoran:false}); else await flow.reload?.();
      scheduleDecorate();
    }catch(e){flow.fail?.(e?.message||String(e))}
    finally{flow.busy?.(false)}
  }

  function installStyle(){
    if(document.getElementById("ak2ManualToolsUiStyle")) return;
    const s=document.createElement("style");
    s.id="ak2ManualToolsUiStyle";
    s.textContent=`
      body.page-arus-kas .ak2-ledger-card .ak2-section-head{gap:14px}
      body.page-arus-kas .ak2-quick-search-wrap{margin-left:auto;display:grid;grid-template-columns:minmax(280px,320px);grid-template-rows:auto auto;justify-items:stretch;align-items:center;gap:4px}
      body.page-arus-kas .ak2-quick-search{height:44px;min-width:0;width:100%;display:grid;grid-template-columns:38px 1fr;align-items:center;gap:8px;padding:0 10px;border:1px solid #3d536b;border-radius:11px;background:linear-gradient(180deg,#182331,#111923);box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 8px 20px rgba(0,0,0,.16)}
      body.page-arus-kas .ak2-quick-search:focus-within,body.page-arus-kas .ak2-quick-search.is-active{border-color:#d3a54b;box-shadow:0 0 0 2px rgba(211,165,75,.10),0 8px 22px rgba(0,0,0,.22)}
      body.page-arus-kas .ak2-quick-search-icon{width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:8px;background:rgba(211,165,75,.08);color:#e0b45a;font-size:22px;line-height:1;cursor:pointer}
      body.page-arus-kas .ak2-quick-search-icon:hover{background:rgba(211,165,75,.16);color:#ffe09a}
      body.page-arus-kas #ak2QuickSearch{width:100%;min-width:0;height:38px;border:0!important;outline:0!important;background:transparent!important;color:#f4f8fc;font:inherit;font-size:15px;font-weight:800;padding:0!important;box-shadow:none!important;border-radius:0!important}
      body.page-arus-kas #ak2QuickSearch::placeholder{color:#7f8c99;font-weight:700}
      body.page-arus-kas .ak2-search-count{display:block;min-height:16px;color:#d7b86a;font-size:12px;font-weight:800;line-height:16px;text-align:center;white-space:nowrap}

      body.page-arus-kas .ak2-ledger-card .ak2-table-wrap{overflow-x:auto!important;overflow-y:auto;-webkit-overflow-scrolling:touch}
      body.page-arus-kas .ak2-ledger-card .ak2-table{min-width:1420px;width:max-content;border-collapse:separate;border-spacing:0}
      body.page-arus-kas .ak2-ledger-card .ak2-table th,body.page-arus-kas .ak2-ledger-card .ak2-table td{white-space:normal}
      body.page-arus-kas .ak2-ledger-card .ak2-table th:nth-last-child(-n+3),body.page-arus-kas .ak2-ledger-card .ak2-table td:nth-last-child(-n+3){white-space:nowrap}

      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td:nth-child(7){font-size:18px!important;font-weight:950!important;color:#ffd36b!important;letter-spacing:.01em;text-shadow:0 0 10px rgba(255,196,74,.08)}
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr.ak2-date-start td{border-top:2px solid rgba(215,170,85,.62)!important;box-shadow:inset 0 1px 0 rgba(255,234,182,.06)}
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr.ak2-date-start td:first-child{color:#ffe39b!important;background:#17212b!important}
      body.page-arus-kas .ak2-ledger-card .ak2-table thead th:first-child{position:sticky;left:0;z-index:12;min-width:112px;background:#203247!important;box-shadow:3px 0 0 rgba(215,170,85,.34),8px 0 18px rgba(0,0,0,.22)}
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td:first-child{position:sticky;left:0;z-index:7;min-width:112px;background:#0f1922!important;color:#f5f7fa;font-size:15px;font-weight:900;box-shadow:3px 0 0 rgba(215,170,85,.20),8px 0 18px rgba(0,0,0,.16)}

      body.page-arus-kas .ak2-action-head,body.page-arus-kas .ak2-action-cell{width:66px;min-width:66px;max-width:66px;text-align:center!important;padding-left:8px!important;padding-right:8px!important;position:relative;z-index:3;pointer-events:auto!important}
      body.page-arus-kas .ak2-ledger-edit-icon{width:36px;height:36px;display:inline-grid!important;place-items:center;border-radius:10px;border:1px solid #9a752d;background:linear-gradient(180deg,#5b4318,#34260f);color:#ffe39b;font:inherit;font-size:18px;font-weight:900;line-height:1;cursor:pointer;position:relative;z-index:5;pointer-events:auto!important;touch-action:manipulation;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 5px 14px rgba(0,0,0,.16)}
      body.page-arus-kas .ak2-ledger-edit-icon:hover{filter:brightness(1.12);border-color:#d0a34b;box-shadow:0 0 0 2px rgba(208,163,75,.08),0 7px 18px rgba(0,0,0,.2)}

      body.page-arus-kas #ak2Modal.is-manual-edit .ak2-panel{border-color:rgba(215,170,85,.78);box-shadow:0 28px 80px rgba(0,0,0,.66),0 0 32px rgba(215,170,85,.10)}
      body.page-arus-kas #ak2Modal .ak2-btn-delete{background:linear-gradient(180deg,#6a2828,#3c1717);border-color:#a94a4a;color:#ffd0d0;box-shadow:0 8px 22px rgba(154,54,54,.18),inset 0 1px 0 rgba(255,255,255,.06)}
      body.page-arus-kas #ak2Modal .ak2-btn-delete:hover{filter:brightness(1.08)}
      body.page-arus-kas #ak2Modal #ak2SaveBtn.is-edit-save{min-width:150px}

      @media(max-width:900px){
        body.page-arus-kas .ak2-ledger-card .ak2-section-head{align-items:flex-start;flex-wrap:wrap}
        body.page-arus-kas .ak2-quick-search-wrap{order:3;width:100%;margin-left:0;grid-template-columns:1fr}
        body.page-arus-kas .ak2-ledger-card .ak2-table{min-width:1320px}
        body.page-arus-kas .ak2-action-head,body.page-arus-kas .ak2-action-cell{width:56px;min-width:56px;max-width:56px}
        body.page-arus-kas .ak2-ledger-edit-icon{width:32px;height:32px;font-size:16px}
      }
    `;
    document.head.appendChild(s);
  }

  const baseOpenInput=flow.openInput?.bind(flow);
  if(baseOpenInput){
    flow.openInput=function(){
      const r=baseOpenInput(...arguments);
      setTimeout(()=>{syncManualActions();window.ArusKasV2ModalDatepickerUI?.refresh?.()},0);
      return r;
    };
  }

  const baseCloseInput=flow.closeInput?.bind(flow);
  if(baseCloseInput){
    flow.closeInput=function(){ const r=baseCloseInput(...arguments); setTimeout(syncManualActions,0); return r; };
  }

  installStyle(); installSearch(); ensureDeleteButton(); syncManualActions(); decorateManualRows(); decorateDateGroups();
  const body=document.getElementById("ak2LedgerBody");
  if(body) new MutationObserver(()=>scheduleDecorate()).observe(body,{childList:true,subtree:false});
  if(!document.getElementById("ak2QuickSearch")){
    let tries=0; const t=setInterval(()=>{tries++;if(installSearch()||tries>=80)clearInterval(t)},50);
  }
})();