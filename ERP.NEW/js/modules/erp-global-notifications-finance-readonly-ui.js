/* ERP VAX — notification-only read paths. No changes to finance or Cash Out engines. */
"use strict";
(function(){
  const install=()=>{
    const N=window.ERPGlobalNotifications;
    if(!N||!N.__stabilityPatchInstalledV5||N.__financeReadOnlyBellInstalled)return false;
    N.__financeReadOnlyBellInstalled=true;
    const originalRefresh=N.refresh;
    let parserPromise=null;
    const ensureParser=()=>{
      if(typeof CashOutWarning!=='undefined'&&typeof CashOutWarning.parseSegment==='function')return Promise.resolve(true);
      // The dashboard loads this existing, LOCKED parser itself. Do not load it twice.
      if(/\/erp-dashboard\.html$/i.test(location.pathname))return Promise.resolve(false);
      if(parserPromise)return parserPromise;
      parserPromise=new Promise(resolve=>{
        const script=document.createElement('script');
        script.src='../js/modules/cashout-warning.js?v=20260919-notif';
        script.dataset.erpCashoutNotifParser='1';
        script.onload=()=>resolve(typeof CashOutWarning!=='undefined'&&typeof CashOutWarning.parseSegment==='function');
        script.onerror=()=>{console.warn('[Finance notif] Cash Out parser unavailable');resolve(false)};
        document.head.appendChild(script);
      });
      return parserPromise;
    };
    const loadPendingArusKas=async(db)=>{
      if(N.role!=='owner')return;
      try{
        const since=N.isoAddDays(N.jakartaToday(),-30);
        const {data,error}=await db.from('arus_kas_v2_transactions')
          .select('id,tanggal,amount,category,description,verification_status,entry_type')
          .eq('entry_type','MANUAL').gte('tanggal',since)
          .order('tanggal',{ascending:false}).limit(100);
        if(error)throw error;
        (data||[]).forEach(r=>{
          const status=String(r.verification_status||'').toUpperCase();
          if(status.includes('VERIFIED')||/HAPUS|DELETE|CANCEL|REJECT|VOID/.test(status))return;
          N.add({key:`arus-kas-pending:${r.id}`,tone:'warning',icon:'⇄',module:'ARUS KAS',
            href:'./arus-kas.html',title:'Transaksi manual perlu verifikasi Owner',
            detail:`${r.tanggal||'—'} • ${N.money(r.amount)} • ${r.description||r.category||'Transaksi manual'}`});
        });
      }catch(e){console.warn('[Finance notif] Arus Kas read',e)}
    };
    N.refresh=async function(){
      if(this.loading)return;
      await originalRefresh.call(this);
      if(this.loading||!['owner','svp'].includes(this.role))return;
      const db=await this.waitDb();
      if(!db)return;
      if(await ensureParser()){
        try{await this.loadCashOutWarnings?.(db)}catch(e){console.warn('[Finance notif] Cash Out read',e)}
      }
      await loadPendingArusKas(db);
      this.render();
    };
    // The original bootstrap can refresh before this extension has installed.
    setTimeout(()=>N.refresh(),200);
    return true;
  };
  if(!install()){
    let tries=0;
    const t=setInterval(()=>{if(install()||++tries>60)clearInterval(t)},100);
  }
})();
