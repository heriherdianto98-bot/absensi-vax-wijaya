/* ERP VAX — read-only notification extensions. Never writes to source modules or tables. */
"use strict";
(function(){
  const install=()=>{
    const N=window.ERPGlobalNotifications;
    if(!N||!N.__stabilityPatchInstalledV5||N.__financeReadOnlyBellInstalled)return false;
    N.__financeReadOnlyBellInstalled=true;
    const originalRefresh=N.refresh;
    let parserPromise=null,extraLoading=false;
    const ensureParser=()=>{
      if(typeof CashOutWarning!=='undefined'&&typeof CashOutWarning.parseSegment==='function')return Promise.resolve(true);
      // Dashboard already loads the LOCKED warning parser from activity.js.
      if(/\/erp-dashboard\.html$/i.test(location.pathname))return Promise.resolve(false);
      if(parserPromise)return parserPromise;
      parserPromise=new Promise(resolve=>{
        const script=document.createElement('script');
        script.src='../js/modules/cashout-warning.js?v=20260906-1';
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
          .select('id,tanggal,amount,category,description')
          .eq('entry_type','MANUAL').eq('verification_status','BELUM_DIVERIFIKASI')
          .gte('tanggal',since).order('tanggal',{ascending:false}).limit(100);
        if(error)throw error;
        (data||[]).forEach(r=>N.add({key:`arus-kas-pending:${r.id}`,
          tone:'warning',icon:'⇄',module:'ARUS KAS',href:'./arus-kas.html',
          title:'Transaksi manual menunggu verifikasi Owner',
          detail:`${r.tanggal||'—'} • ${N.money(r.amount)} • ${r.description||r.category||'Transaksi manual'}`}));
      }catch(e){console.warn('[Finance notif] Arus Kas read',e)}
    };
    const loadKasbon=async(db)=>{
      if(N.role!=='owner')return;
      try{
        const {data,error}=await db.from('employee_cash_advances')
          .select('id,employee_name_snapshot,branch_name_snapshot,requested_amount,request_date')
          .eq('status','MENUNGGU OWNER').order('request_date',{ascending:false}).limit(40);
        if(error)throw error;
        (data||[]).forEach(r=>N.add({key:`kasbon-owner:${r.id}`,tone:'warning',icon:'⇧',
          module:'KASBON',href:'./finance.html?menu=kasbon',title:'Pengajuan Kasbon menunggu keputusan Owner',
          detail:`${r.employee_name_snapshot||'Karyawan'} • ${r.branch_name_snapshot||'—'} • ${N.money(r.requested_amount)}`}));
      }catch(e){console.warn('[Finance notif] Kasbon read',e)}
    };
    const loadPayrollMapping=async(db)=>{
      if(N.role!=='owner')return;
      try{
        const since=N.isoAddDays(N.jakartaToday(),-35);
        const {data,error}=await db.from('provider_sales_source')
          .select('id,provider_name_raw,cabang_id,period_end,mapping_status')
          .gte('period_end',since).order('period_end',{ascending:false}).limit(200);
        if(error)throw error;
        (data||[]).filter(r=>['AMBIGUOUS','UNMATCHED'].includes(String(r.mapping_status||'').toUpperCase()))
          .forEach(r=>N.add({key:`payroll-provider-mapping:${r.id}`,tone:'warning',icon:'▤',
            module:'PAYROLL',href:'./payroll-capster.html',title:'Mapping provider payroll perlu ditinjau',
            detail:`${r.provider_name_raw||'Provider'} • Cabang ID ${r.cabang_id||'—'} • ${r.period_end||'—'}`}));
      }catch(e){console.warn('[Finance notif] Payroll mapping read',e)}
    };
    const loadDailySyncFailures=async(db)=>{
      if(N.role!=='owner')return;
      try{
        const since=N.isoAddDays(N.jakartaToday(),-2);
        const {data,error}=await db.from('daily_recap_source')
          .select('id,tanggal,cabang_id,sync_status')
          .gte('tanggal',since).order('tanggal',{ascending:false}).limit(100);
        if(error)throw error;
        (data||[]).filter(r=>/^(ERROR|FAILED|FAIL|GAGAL)$/i.test(String(r.sync_status||'')))
          .forEach(r=>N.add({key:`daily-sync-failed:${r.id}`,tone:'urgent',icon:'!',
            module:'TABEL HARIAN',href:'./tabel-harian-cabang.html',
            title:'Sinkronisasi data harian gagal',detail:`${r.tanggal||'—'} • Cabang ID ${r.cabang_id||'—'}`}));
      }catch(e){console.warn('[Finance notif] Daily sync read',e)}
    };
    N.refresh=async function(){
      if(this.loading||extraLoading)return;
      extraLoading=true;
      try{
        await originalRefresh.call(this);
        if(!['owner','svp'].includes(this.role))return;
        const db=await this.waitDb();
        if(!db)return;
        if(await ensureParser()){
          try{await this.loadCashOutWarnings?.(db)}catch(e){console.warn('[Finance notif] Cash Out read',e)}
        }
        await Promise.allSettled([
          loadPendingArusKas(db),loadKasbon(db),loadPayrollMapping(db),loadDailySyncFailures(db)
        ]);
        this.render();
      }finally{extraLoading=false}
    };
    setTimeout(()=>N.refresh(),200);
    return true;
  };
  if(!install()){
    let tries=0;
    const t=setInterval(()=>{if(install()||++tries>60)clearInterval(t)},100);
  }
})();
