/*
=========================================================
VAX ERP — ARUS KAS V2 PERFORMANCE ORCHESTRATION
Additive performance/runtime layer only.

Tujuan:
- Buka Arus Kas memakai fast monthly read (tanpa resync AUTO berulang).
- Setelah Input Manual / verifikasi / koreksi, refresh hanya ledger + card yang perlu.
- Tombol REFRESH SEMUA menjalankan full reload + sync AUTO untuk periode aktif.
- Source of truth, formula, engine Setoran/DailyDataEngine, payload transaksi,
  wallet balance, dan workflow verifikasi tidak diubah.
=========================================================
*/
"use strict";

(function(){
  const flow = window.ArusKasV2;
  if(!flow || flow.__performanceUiInstalled) return;
  flow.__performanceUiInstalled = true;

  const baseReload = flow.reload.bind(flow);
  const baseSaveManual = flow.saveManual?.bind(flow);
  const baseVerifyRow = flow.verifyRow?.bind(flow);
  const baseRequestCorrection = flow.requestCorrection?.bind(flow);

  async function loadProfilesFast(){
    try{ await flow.loadProfileNames(); }catch(_e){}
  }

  flow.fastReload = async function(options={}){
    this.clearMessage?.();
    this.busy?.(true);
    try{
      const r = this.range();
      const needSetoran = options.loadSetoran !== false;

      if(needSetoran){
        await Promise.all([
          this.loadSetoran(r),
          this.loadLedger(r)
        ]);
      }else{
        await this.loadLedger(r);
      }

      await loadProfilesFast();
      this.renderAll();
      window.ArusKasV2HeaderPeriodUI?.sync?.();
    }catch(e){
      this.fail?.(e?.message || String(e));
      throw e;
    }finally{
      this.busy?.(false);
    }
  };

  flow.fullReload = async function(){
    return baseReload();
  };

  /*
   * Default reload dari init / perubahan periode dibuat ringan.
   * Sync AUTO penuh tetap tersedia lewat tombol Refresh Semua.
   */
  flow.reload = async function(){
    return this.fastReload({loadSetoran:true});
  };

  async function withFastReload(fn,args){
    if(typeof fn !== "function") return;
    const normalReload = flow.reload;
    flow.reload = function(){ return flow.fastReload({loadSetoran:false}); };
    try{
      return await fn(...args);
    }finally{
      flow.reload = normalReload;
    }
  }

  if(baseSaveManual){
    flow.saveManual = function(){
      return withFastReload(baseSaveManual,Array.from(arguments));
    };
  }

  if(baseVerifyRow){
    flow.verifyRow = function(){
      return withFastReload(baseVerifyRow,Array.from(arguments));
    };
  }

  if(baseRequestCorrection){
    flow.requestCorrection = function(){
      return withFastReload(baseRequestCorrection,Array.from(arguments));
    };
  }

  function installRefreshButton(){
    const toolbar = document.querySelector(".ak2-toolbar");
    if(!toolbar || document.getElementById("ak2RefreshAll")) return false;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "ak2RefreshAll";
    btn.className = "ak2-btn ak2-btn-primary";
    btn.innerHTML = "↻ Refresh Semua";
    btn.title = "Reload semua data Arus Kas dan sinkronisasi AUTO untuk periode aktif";
    btn.addEventListener("click", async () => {
      try{
        flow.busy?.(true);
        flow.clearMessage?.();
        await flow.fullReload();
        flow.ok?.("Semua data periode aktif sudah direfresh.");
        window.ArusKasV2HeaderPeriodUI?.sync?.();
      }catch(e){
        flow.fail?.(e?.message || String(e));
      }finally{
        flow.busy?.(false);
      }
    });

    const print = document.getElementById("ak2Print");
    if(print?.nextSibling) toolbar.insertBefore(btn,print.nextSibling);
    else toolbar.appendChild(btn);
    return true;
  }

  function installStyle(){
    if(document.getElementById("ak2PerformanceUiStyle")) return;
    const style=document.createElement("style");
    style.id="ak2PerformanceUiStyle";
    style.textContent=`
      body.page-arus-kas #ak2RefreshAll{
        position:relative;
        top:-8px;
        min-width:154px;
        border-color:rgba(72,141,198,.72);
        background:linear-gradient(180deg,rgba(31,82,122,.95),rgba(21,57,86,.95));
        color:#eaf6ff;
        font-weight:800;
      }
      body.page-arus-kas #ak2RefreshAll:hover{filter:brightness(1.08)}

      /* UI ONLY — compact ledger rows agar pemeriksaan bulanan lebih padat. */
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody td{
        padding-top:8px !important;
        padding-bottom:8px !important;
        line-height:1.2 !important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr{
        height:48px !important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-source,
      body.page-arus-kas .ak2-ledger-card .ak2-status{
        min-height:30px !important;
        padding-top:5px !important;
        padding-bottom:5px !important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-ledger-edit-icon{
        width:32px !important;
        height:32px !important;
        font-size:16px !important;
      }

      /* UI ONLY — hilangkan pembatas gold antar tanggal; kembali ke divider netral. */
      body.page-arus-kas .ak2-ledger-card .ak2-table tbody#ak2LedgerBody tr.ak2-date-start > td{
        border-top:1px solid rgba(61,83,107,.42) !important;
        box-shadow:none !important;
      }

      /* UI ONLY — perjelas badge SUMBER dan STATUS pada Buku Arus Kas. */
      body.page-arus-kas .ak2-ledger-card .ak2-source,
      body.page-arus-kas .ak2-ledger-card .ak2-status{
        display:inline-flex !important;
        align-items:center;
        justify-content:center;
        min-height:34px;
        padding:7px 13px !important;
        border-radius:999px;
        font-size:12px !important;
        line-height:1;
        font-weight:900 !important;
        letter-spacing:.045em;
        white-space:nowrap;
        border:1px solid transparent;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 5px 14px rgba(0,0,0,.16);
      }

      body.page-arus-kas .ak2-ledger-card .ak2-source{
        min-width:64px;
        background:linear-gradient(180deg,#2b333d,#20262d) !important;
        border-color:#44505d;
        color:#e6edf4 !important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-source.is-auto{
        background:linear-gradient(180deg,#214d35,#173524) !important;
        border-color:#3f7d58;
        color:#b8f1cb !important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-source.is-owner{
        background:linear-gradient(180deg,#5a431a,#34260f) !important;
        border-color:#9d7631;
        color:#ffe39b !important;
      }

      body.page-arus-kas .ak2-ledger-card .ak2-status{
        min-width:128px;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-status.is-pending{
        background:linear-gradient(180deg,#5a4516,#34280f) !important;
        border-color:#98752c;
        color:#ffe08b !important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-status.is-verified{
        background:linear-gradient(180deg,#24523a,#173525) !important;
        border-color:#43805c;
        color:#b9f2cd !important;
      }
      body.page-arus-kas .ak2-ledger-card .ak2-status.is-correction{
        background:linear-gradient(180deg,#5a2828,#351919) !important;
        border-color:#8a4444;
        color:#ffc0c0 !important;
      }

      @media(max-width:900px){
        body.page-arus-kas #ak2RefreshAll{min-width:132px}
        body.page-arus-kas .ak2-ledger-card .ak2-source,
        body.page-arus-kas .ak2-ledger-card .ak2-status{
          min-height:31px;
          padding:6px 10px !important;
          font-size:11px !important;
        }
        body.page-arus-kas .ak2-ledger-card .ak2-status{min-width:116px}
        body.page-arus-kas .ak2-ledger-card .ak2-table tbody td{
          padding-top:7px !important;
          padding-bottom:7px !important;
        }
        body.page-arus-kas .ak2-ledger-card .ak2-table tbody tr{
          height:44px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function loadManualTools(){
    if(document.querySelector('script[data-ak2-manual-tools-ui]')) return;
    const s=document.createElement("script");
    s.src="../js/modules/arus-kas-v2-manual-tools-ui.js";
    s.async=false;
    s.dataset.ak2ManualToolsUi="1";
    document.body.appendChild(s);
  }

  function loadLedgerOrderUi(){
    if(document.querySelector('script[data-ak2-ledger-order-ui]')) return;
    const s=document.createElement("script");
    s.src="../js/modules/arus-kas-v2-ledger-order-ui.js";
    s.async=false;
    s.dataset.ak2LedgerOrderUi="1";
    document.body.appendChild(s);
  }

  function loadWalletTransferUi(){
    if(document.querySelector('script[data-ak2-wallet-transfer-ui]')) return;
    const s=document.createElement("script");
    s.src="../js/modules/arus-kas-v2-wallet-transfer-ui.js";
    s.async=false;
    s.dataset.ak2WalletTransferUi="1";
    document.body.appendChild(s);
  }

  installStyle();
  if(!installRefreshButton()){
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(installRefreshButton() || tries>=80) clearInterval(timer);
    },50);
  }
  loadManualTools();
  loadLedgerOrderUi();
  loadWalletTransferUi();
})();