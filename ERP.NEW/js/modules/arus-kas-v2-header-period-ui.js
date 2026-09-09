/* ARUS KAS V2 — HEADER PERIOD SYNC UI ONLY
   Sinkronkan chip PERIODE AKTIF di header global dengan periode Arus Kas.
   Juga memasang runtime guard agar ArusKasV2.init() tidak berjalan ganda.
   Tidak mengubah engine, query, formula, transaksi, saldo, atau data flow.
*/
"use strict";

(function(){
  /* Runtime guard UI-layer: cegah bind ganda dari DOMContentLoaded + erp:finance-ready. */
  const flow=window.ArusKasV2;
  if(flow && typeof flow.init==="function" && !flow.__uiInitGuardInstalled){
    flow.__uiInitGuardInstalled=true;
    const baseInit=flow.init;
    let initPromise=null;
    flow.init=function(){
      if(initPromise) return initPromise;
      const ctx=this,args=arguments;
      initPromise=Promise.resolve()
        .then(()=>baseInit.apply(ctx,args))
        .catch(err=>{initPromise=null;throw err;});
      return initPromise;
    };
  }

  /* Muat additive mutation-view module. Tidak memblokir engine dan tidak query sendiri. */
  if(!document.querySelector('script[data-ak2-ledger-mutation-ui]')){
    const s=document.createElement("script");
    s.src="../js/modules/arus-kas-v2-ledger-mutation-ui.js";
    s.async=false;
    s.dataset.ak2LedgerMutationUi="1";
    document.head.appendChild(s);
  }

  /* UI only: urutkan ledger newest-first termasuk transaksi terakhir pada tanggal yang sama. */
  if(!document.querySelector('script[data-ak2-ledger-latest-first-ui]')){
    const l=document.createElement("script");
    l.src="../js/modules/arus-kas-v2-ledger-latest-first-ui.js";
    l.async=false;
    l.dataset.ak2LedgerLatestFirstUi="1";
    document.head.appendChild(l);
  }

  /* Muat additive performance orchestration + tombol Refresh Semua. */
  if(!document.querySelector('script[data-ak2-performance-ui]')){
    const p=document.createElement("script");
    p.src="../js/modules/arus-kas-v2-performance-ui.js";
    p.async=false;
    p.dataset.ak2PerformanceUi="1";
    document.head.appendChild(p);
  }

  /* UI only: samakan dropdown bulan/tahun dengan tema dark-gold ERP. */
  if(!document.querySelector('script[data-ak2-period-theme-ui]')){
    const t=document.createElement("script");
    t.src="../js/modules/arus-kas-v2-period-theme-ui.js";
    t.async=false;
    t.dataset.ak2PeriodThemeUi="1";
    document.head.appendChild(t);
  }

  /* UI only: orbit halus berulang di garis bawah header Buku Arus Kas. */
  if(!document.querySelector('script[data-ak2-ledger-header-orbit-ui]')){
    const o=document.createElement("script");
    o.src="../js/modules/arus-kas-v2-ledger-header-orbit-ui.js";
    o.async=false;
    o.dataset.ak2LedgerHeaderOrbitUi="1";
    document.head.appendChild(o);
  }

  /* UI only: pulihkan pembatas horizontal pada kolom Cabang. */
  if(!document.querySelector('script[data-ak2-cabang-divider-ui]')){
    const d=document.createElement("script");
    d.src="../js/modules/arus-kas-v2-cabang-divider-ui.js";
    d.async=false;
    d.dataset.ak2CabangDividerUi="1";
    document.head.appendChild(d);
  }

  /* UI only: klik 5 card saldo membuka popup mutasi read-only per wallet. */
  if(!document.querySelector('script[data-ak2-wallet-mutation-ui]')){
    const m=document.createElement("script");
    m.src="../js/modules/arus-kas-v2-wallet-mutation-ui.js";
    m.async=false;
    m.dataset.ak2WalletMutationUi="1";
    document.head.appendChild(m);
  }

  /* UI only: klik 3 card Rekonsiliasi QRIS / GoPay membuka popup mutasi read-only. */
  if(!document.querySelector('script[data-ak2-qris-mutation-ui]')){
    const q=document.createElement("script");
    q.src="../js/modules/arus-kas-v2-qris-mutation-ui.js";
    q.async=false;
    q.dataset.ak2QrisMutationUi="1";
    document.head.appendChild(q);
  }

  /* UI only: safety cue modal input manual — Pemasukan biru, Pengeluaran merah. */
  if(!document.querySelector('script[data-ak2-manual-type-theme-ui]')){
    const c=document.createElement("script");
    c.src="../js/modules/arus-kas-v2-manual-type-theme-ui.js";
    c.async=false;
    c.dataset.ak2ManualTypeThemeUi="1";
    document.head.appendChild(c);
  }

  /* UI only: toolbar utama tidak boleh menimpa popup Detail / Verifikasi / Input. */
  if(!document.querySelector('script[data-ak2-modal-layer-ui]')){
    const ml=document.createElement("script");
    ml.src="../js/modules/arus-kas-v2-modal-layer-ui.js";
    ml.async=false;
    ml.dataset.ak2ModalLayerUi="1";
    document.head.appendChild(ml);
  }

  function fmt(iso){
    if(!iso) return "—";
    const [y,m,d]=String(iso).slice(0,10).split("-").map(Number);
    if(!y||!m||!d) return "—";
    return new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(y,m-1,d));
  }

  function getPeriodText(){
    const start=document.getElementById("ak2Start")?.value;
    const end=document.getElementById("ak2End")?.value;
    if(!start||!end) return "—";
    return start===end ? fmt(start) : `${fmt(start)} — ${fmt(end)}`;
  }

  function sync(){
    const target=document.getElementById("erpHeaderPeriode");
    if(!target) return false;
    target.textContent=getPeriodText();
    return true;
  }

  function bindInputs(){
    ["ak2Start","ak2End"].forEach(id=>{
      const el=document.getElementById(id);
      if(!el||el.dataset.ak2HeaderPeriodBound==="1") return;
      el.dataset.ak2HeaderPeriodBound="1";
      el.addEventListener("change",()=>setTimeout(sync,0));
      el.addEventListener("input",()=>setTimeout(sync,0));
    });
  }

  function installRefreshReminder(){
    const legacy=document.querySelector(".ak2-head #ak2RefreshReminder");
    if(legacy) legacy.remove();

    if(!document.getElementById("ak2RefreshReminderStyle")){
      const style=document.createElement("style");
      style.id="ak2RefreshReminderStyle";
      style.textContent=`
        body.page-arus-kas .ak2-ledger-card .ak2-section-head{
          gap:12px;
          flex-wrap:wrap;
        }
        body.page-arus-kas .ak2-refresh-reminder{
          min-height:44px;
          display:inline-flex;
          align-items:center;
          gap:9px;
          padding:0 14px;
          margin-left:auto;
          border:1px solid rgba(215,170,85,.56);
          border-radius:11px;
          background:linear-gradient(180deg,rgba(67,49,18,.78),rgba(30,23,11,.92));
          color:#f1cf7b;
          font-size:12px;
          font-weight:900;
          letter-spacing:.01em;
          white-space:nowrap;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 0 0 1px rgba(215,170,85,.04),0 8px 20px rgba(0,0,0,.18);
          animation:ak2RefreshBoxPulse 1.25s ease-in-out infinite;
        }
        body.page-arus-kas .ak2-refresh-reminder-icon{
          width:23px;
          height:23px;
          flex:0 0 23px;
          display:grid;
          place-items:center;
          border-radius:50%;
          border:1px solid rgba(255,208,105,.78);
          background:rgba(230,177,72,.13);
          color:#ffd66f;
          font-size:14px;
          font-weight:950;
          line-height:1;
          box-shadow:0 0 11px rgba(225,175,73,.16);
        }
        body.page-arus-kas .ak2-refresh-reminder + .ak2-quick-search-wrap{
          margin-left:0!important;
        }
        @keyframes ak2RefreshBoxPulse{
          0%,100%{border-color:rgba(215,170,85,.36);box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 0 0 1px rgba(215,170,85,.03),0 7px 18px rgba(0,0,0,.16);opacity:.78}
          50%{border-color:rgba(245,196,91,.92);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 16px rgba(223,174,72,.22),0 9px 22px rgba(0,0,0,.22);opacity:1}
        }
        @media(max-width:1050px){
          body.page-arus-kas .ak2-refresh-reminder{min-height:40px;padding:0 11px;font-size:11px;gap:7px}
          body.page-arus-kas .ak2-refresh-reminder-icon{width:21px;height:21px;flex-basis:21px;font-size:13px}
        }
        @media(max-width:820px){
          body.page-arus-kas .ak2-refresh-reminder{order:2;margin-left:0;width:100%;justify-content:center}
          body.page-arus-kas .ak2-quick-search-wrap{order:3;width:100%!important;grid-template-columns:minmax(0,1fr)!important}
        }
        @media(prefers-reduced-motion:reduce){body.page-arus-kas .ak2-refresh-reminder{animation:none}}
      `;
      document.head.appendChild(style);
    }

    const head=document.querySelector(".ak2-ledger-card .ak2-section-head");
    const search=document.querySelector(".ak2-ledger-card .ak2-section-head .ak2-quick-search-wrap");
    if(!head||!search) return false;

    let reminder=document.getElementById("ak2RefreshReminder");
    if(!reminder){
      reminder=document.createElement("div");
      reminder.id="ak2RefreshReminder";
      reminder.className="ak2-refresh-reminder";
      reminder.setAttribute("role","note");
      reminder.innerHTML='<span class="ak2-refresh-reminder-icon" aria-hidden="true">!</span><span>Untuk update data mohon refresh</span>';
    }

    if(reminder.nextElementSibling!==search) head.insertBefore(reminder,search);
    return true;
  }

  function startSync(){
    bindInputs();
    sync();
    installRefreshReminder();
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      bindInputs();
      installRefreshReminder();
      if(sync() && document.getElementById("ak2Start")?.value && document.getElementById("ak2End")?.value){
        if(tries>=20) clearInterval(timer);
      }
      if(tries>=80) clearInterval(timer);
    },100);
  }

  document.addEventListener("erp:finance-ready",()=>{
    setTimeout(startSync,0);
    setTimeout(sync,250);
    setTimeout(sync,700);
    setTimeout(sync,1400);
  });

  document.addEventListener("DOMContentLoaded",()=>{
    setTimeout(startSync,0);
  });

  window.ArusKasV2HeaderPeriodUI={sync};
})();
