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
      @media(max-width:900px){body.page-arus-kas #ak2RefreshAll{min-width:132px}}
    `;
    document.head.appendChild(style);
  }

  installStyle();
  if(!installRefreshButton()){
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(installRefreshButton() || tries>=80) clearInterval(timer);
    },50);
  }
})();