/* ERP VAX — notification extensions; no finance, payroll, investor or Cash Out engine writes. */
"use strict";
(function(){
  const install=()=>{
    const N=window.ERPGlobalNotifications;
    if(!N||!N.__stabilityPatchInstalledV5||N.__financeReadOnlyBellInstalled)return false;
    N.__financeReadOnlyBellInstalled=true;
    const originalRefresh=N.refresh;
    let parserPromise=null,extraLoading=false;
    const parserReady=()=>typeof CashOutWarning!=='undefined'&&typeof CashOutWarning.parseSegment==='function';
    const ensureParser=()=>{
      if(parserReady())return Promise.resolve(true);
      if(parserPromise)return parserPromise;
      if(/\/erp-dashboard\.html$/i.test(location.pathname)){
        // activity.js owns the existing dashboard parser: wait, never inject it twice.
        parserPromise=new Promise(resolve=>{
          const s=document.getElementById('cashoutWarningScript');
          if(!s){resolve(false);return}
          let settled=false;
          const finish=()=>{if(!settled){settled=true;resolve(parserReady())}};
          s.addEventListener('load',finish,{once:true});
          s.addEventListener('error',finish,{once:true});
          setTimeout(finish,2500);
        });
        return parserPromise;
      }
      parserPromise=new Promise(resolve=>{
        const s=document.createElement('script');
        s.src='../js/modules/cashout-warning.js?v=20260906-1';
        s.dataset.erpCashoutNotifParser='1';
        s.onload=()=>resolve(parserReady());
        s.onerror=()=>{console.warn('[Finance notif] Cash Out parser unavailable');resolve(false)};
        document.head.appendChild(s);
      });
      return parserPromise;
    };
    const loadPendingArusKas=async(db)=>{
      if(N.role!=='owner')return;
      try{
        const since=N.isoAddDays(N.jakartaToday(),-30);
        const {data,error}=await db.from('arus_kas_v2_transactions')
          .select('id,tanggal,amount,category,description,metadata')
          .eq('entry_type','MANUAL').eq('verification_status','BELUM_DIVERIFIKASI')
          .gte('tanggal',since).order('tanggal',{ascending:false}).limit(100);
        if(error)throw error;
        (data||[]).filter(r=>String(r.metadata?.delete_status||'').toUpperCase()!=='OWNER_VERIFIED')
          .forEach(r=>N.add({key:`arus-kas-pending:${r.id}`,
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
          module:'KASBON',href:`./finance.html?menu=cash-in&focus=owner-kasbon&kasbon=${encodeURIComponent(r.id)}`,title:'Pengajuan Kasbon menunggu keputusan Owner',
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
          .forEach(r=>{
            const detail=`${r.provider_name_raw||'Provider'} • Cabang ID ${r.cabang_id||'—'} • ${r.period_end||'—'}`;
            N.add({key:`payroll-provider-mapping:${r.id}`,tone:'warning',icon:'▤',module:'PAYROLL',
              href:'./payroll-capster.html',title:'Mapping provider payroll perlu ditinjau',detail});
            N.add({key:`bulanan-provider-mapping:${r.id}`,tone:'warning',icon:'▥',module:'LAPORAN BULANAN',
              href:'./laporan-bulanan.html',title:'Mapping provider laporan bulanan perlu ditinjau',detail});
          });
      }catch(e){console.warn('[Finance notif] Provider mapping read',e)}
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
    const loadInvestorSnapshots=async(db)=>{
      if(N.role!=='owner')return;
      try{
        const {data,error}=await db.from('investor_revised_snapshots')
          .select('id,branch_id,period_month,revision_no,status,created_at,locked_at')
          .eq('status','READY').is('locked_at',null)
          .order('created_at',{ascending:false}).limit(100);
        if(error)throw error;
        (data||[]).forEach(r=>N.add({key:`investor-snapshot-ready:${r.id}`,tone:'info',icon:'▥',
          module:'BULANAN INVESTOR',href:'./laporan-bulanan-investor.html',
          title:'Snapshot investor tersedia untuk ditinjau',
          detail:`Cabang ID ${r.branch_id||'—'} • Periode ${r.period_month||'—'} • Revisi ${r.revision_no||1}`}));
      }catch(e){console.warn('[Finance notif] Investor snapshot read',e)}
    };
    // Read existing canonical discrepancy only: no arithmetic or status mutation.
    const loadBriSetoranDifferences=async(db)=>{
      if(N.role!=='owner')return;
      try{
        const {data,error}=await db.from('setoran_3_harian')
          .select('id,cabang_id,period_start,period_end,minutes_non_cash,bri_non_cash_actual,non_cash_difference,owner_verified')
          .not('bri_non_cash_actual','is',null).not('non_cash_difference','is',null)
          .not('owner_verified','is',true)
          .neq('non_cash_difference',0).order('period_end',{ascending:false}).limit(200);
        if(error)throw error;
        if(!data?.length)return;
        const {data:branches,error:branchError}=await db.from('cabang').select('id,nama_cabang');
        if(branchError)throw branchError;
        const names=new Map((branches||[]).map(b=>[String(b.id),b.nama_cabang]));
        data.forEach(r=>{
          const difference=Number(r.non_cash_difference);
          if(r.owner_verified===true||!Number.isFinite(difference)||difference===0)return;
          const branch=names.get(String(r.cabang_id))||`Cabang ID ${r.cabang_id}`;
          N.add({key:`setoran-bri-difference:${r.id}`,tone:'urgent',icon:'!',
            module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',
            title:`Selisih BRI • ${branch}`,
            detail:`${r.period_start} — ${r.period_end} • Selisih ${N.money(difference)} • Minutes ${N.money(r.minutes_non_cash)} • BRI ${N.money(r.bri_non_cash_actual)}`});
        });
      }catch(e){console.warn('[Finance notif] Setoran BRI difference read',e)}
    };
    // Notification acknowledgement is browser-local and scoped to authenticated Owner/SVP; source data stays unchanged.
    const reviewStorageKey=()=>['owner','svp'].includes(N.role)&&N.user?.id?`vax-cashout-bell-reviewed-v1:${N.user.id}`:null;
    const readReviewed=()=>{
      const key=reviewStorageKey();if(!key)return {};
      try{const v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
      catch(e){console.warn('[Finance notif] Cannot read review state',e);return {}}
    };
    const canReview=item=>item?.module==='CASH OUT'&&['owner','svp'].includes(N.role)||item?.module==='BULANAN INVESTOR'&&N.role==='owner';
    const originalAdd=N.add;
    N.add=function(item){
      if(canReview(item)&&item.key&&Object.prototype.hasOwnProperty.call(readReviewed(),item.key))return;
      return originalAdd.call(this,item);
    };
    const originalRender=N.render;
    N.render=function(){
      const result=originalRender.call(this);
      if(!['owner','svp'].includes(this.role)||!reviewStorageKey()||!this.list)return result;
      const rows=[...this.list.querySelectorAll(':scope > a.erp-global-notif-item')];
      this.items.slice(0,rows.length).forEach((item,index)=>{
        if(!canReview(item)||!item._key)return;
        const button=document.createElement('button');button.type='button';
        button.textContent='✓ Tandai sudah ditinjau';
        button.setAttribute('aria-label',`Tandai sudah ditinjau: ${item.title}`);
        button.style.cssText='display:block;width:100%;margin:0 0 8px;padding:7px 10px;border:1px solid rgba(40,210,110,.75);border-radius:8px;background:#103722;color:#b9ffd4;cursor:pointer;text-align:left;font:inherit;font-size:11px;font-weight:700;box-shadow:0 0 9px rgba(35,220,110,.25)';
        if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)button.animate([{opacity:1,boxShadow:'0 0 6px rgba(35,220,110,.2)'},{opacity:.68,boxShadow:'0 0 17px rgba(35,220,110,.75)'},{opacity:1,boxShadow:'0 0 6px rgba(35,220,110,.2)'}],{duration:1700,iterations:Infinity,easing:'ease-in-out'});
        rows[index].insertAdjacentElement('afterend',button);
        button.addEventListener('click',()=>{
          try{
            const key=reviewStorageKey();if(!key)return;
            const reviewed=readReviewed(),now=Date.now();
            Object.keys(reviewed).forEach(k=>{if(!Number.isFinite(Number(reviewed[k]))||(k.startsWith('cashout:')&&now-Number(reviewed[k])>15*86400000))delete reviewed[k]});
            reviewed[item._key]=now;
            localStorage.setItem(key,JSON.stringify(reviewed));
            this.items=this.items.filter(x=>x._key!==item._key);
            this.render();
          }catch(e){console.warn('[Finance notif] Cannot save review state',e);button.textContent='Gagal menyimpan, coba lagi';}
        });
      });
      return result;
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
          loadPendingArusKas(db),loadKasbon(db),loadPayrollMapping(db),
          loadDailySyncFailures(db),loadInvestorSnapshots(db),loadBriSetoranDifferences(db)
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