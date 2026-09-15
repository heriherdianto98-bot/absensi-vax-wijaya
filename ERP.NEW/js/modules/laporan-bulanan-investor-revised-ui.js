(function(){
  'use strict';

  const state={status:'idle',lastFetchedAt:null,dataset:null,error:null,source:null,snapshot:null};
  let navObserver=null;

  function qs(id){return document.getElementById(id);}
  function branchLabel(){return qs('lbBranch')?.selectedOptions?.[0]?.textContent?.trim()||'Cabang';}
  function monthLabel(){return qs('lbMonth')?.value||'';}
  function cacheKey(){return `erp-vax:investor-revised:${branchLabel()}:${monthLabel()}`;}
  function apiBase(){
    if(window.INVESTOR_MINUTES_READONLY_API)return String(window.INVESTOR_MINUTES_READONLY_API).replace(/\/$/,'');
    const local=['127.0.0.1','localhost'].includes(location.hostname);
    return local?'http://127.0.0.1:8788':`${location.origin}/api/investor-revised`;
  }

  function activateInvestorSidebar(){
    const investor=document.querySelector('.sidebar [data-erp-nav="laporan-bulanan-investor"]');
    const original=document.querySelector('.sidebar [data-erp-nav="laporan-bulanan"]');
    const parent=document.querySelector('.sidebar [data-erp-nav="laporan"]');
    if(!investor||!parent)return false;
    original?.classList.remove('active');
    investor.classList.add('active');
    parent.classList.add('is-active-parent');
    parent.setAttribute('aria-expanded','true');
    const submenu=document.getElementById('sidebarLaporanSub');
    if(submenu)submenu.hidden=false;
    if(typeof setLaporanMenuOpen==='function')setLaporanMenuOpen(true);
    return true;
  }

  function ensureInvestorSidebarActive(){
    if(activateInvestorSidebar())return;
    if(navObserver)return;
    navObserver=new MutationObserver(function(){
      if(activateInvestorSidebar()){
        navObserver.disconnect();
        navObserver=null;
      }
    });
    navObserver.observe(document.documentElement,{childList:true,subtree:true});
  }

  async function enforceOwnerOnly(){
    if(typeof OwnerAuth==='undefined'){
      window.location.replace('login.html');
      return false;
    }
    const result=await OwnerAuth.validateOwnerSession?.();
    if(!result?.ok){
      if(result?.profile&&OwnerAuth.isSpvRole?.(result.profile.role)){
        window.location.replace('erp-dashboard.html');
        return false;
      }
      try{await db?.auth?.signOut?.({scope:'local'});}catch(_e){}
      window.location.replace('login.html');
      return false;
    }
    OwnerAuth.session=result.session;
    OwnerAuth.profile=result.profile;
    OwnerAuth.ready=true;
    OwnerAuth.persistLocalAuth?.(result.profile);
    OwnerAuth.syncHeader?.();
    OwnerAuth.applyAccessControl?.();
    return true;
  }

  function pick(obj,paths){
    for(const p of paths){
      const value=p.split('.').reduce((acc,k)=>acc?.[k],obj);
      if(value!==undefined&&value!==null)return value;
    }
    return null;
  }

  function formatMoney(v){
    const n=Number(v||0);
    return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number.isFinite(n)?n:0);
  }

  function summaryText(payload){
    const raw=payload?.data||payload||{};
    const cashOut=pick(raw,['dailyRecap.cashOut','minutes.dailyRecap.cashOut','minutesLive.dailyRecap.cashOut','daily.cashOut']);
    const providerShare=pick(raw,['provider.providerShare','minutes.provider.providerShare','minutesLive.provider.providerShare']);
    const productSales=pick(raw,['product.sales','minutes.product.sales','minutesLive.product.sales']);
    const bits=[];
    if(cashOut!==null)bits.push(`Cash Out ${formatMoney(cashOut)}`);
    if(providerShare!==null)bits.push(`Provider ${formatMoney(providerShare)}`);
    if(productSales!==null)bits.push(`Produk ${formatMoney(productSales)}`);
    return bits.join(' · ');
  }

  function render(){
    const strip=qs('lbInvestorSourceStrip');
    const meta=qs('lbInvestorSourceMeta');
    const badge=qs('lbInvestorSourceBadge');
    const button=qs('lbFetchMinutes');
    if(!strip||!meta||!badge||!button)return;
    strip.classList.remove('is-ready','is-loading');
    button.classList.toggle('is-loading',state.status==='loading');
    button.setAttribute('aria-busy',state.status==='loading'?'true':'false');
    if(state.status==='loading'){
      strip.classList.add('is-loading');
      meta.textContent=`Membaca Minutes LIVE · ${branchLabel()} · ${monthLabel()} · READ ONLY`;
      badge.textContent='MENGAMBIL...';
      button.disabled=true;
      return;
    }
    if(state.status==='ready'){
      strip.classList.add('is-ready');
      const summary=summaryText(state.dataset);
      const permanent=state.source==='SNAPSHOT_DB';
      const revision=state.snapshot?.revision_no?` · Rev ${state.snapshot.revision_no}`:'';
      meta.textContent=`Minutes Revised terbaca · ${branchLabel()} · ${monthLabel()}${summary?` · ${summary}`:''}${revision} · ${state.lastFetchedAt||''}`;
      badge.textContent=permanent?'REVISED READY · SNAPSHOT':'REVISED READY';
      button.disabled=false;
      return;
    }
    if(state.status==='error'){
      meta.textContent=`Gagal membaca Minutes · ${state.error||'Unknown error'}`;
      badge.textContent='GAGAL';
      button.disabled=false;
      return;
    }
    meta.textContent=`Belum ada dataset Investor Revised untuk ${branchLabel()} · ${monthLabel()}`;
    badge.textContent='BELUM DIAMBIL';
    button.disabled=false;
  }

  function saveCache(payload){
    try{sessionStorage.setItem(cacheKey(),JSON.stringify({payload,fetchedAt:new Date().toISOString()}));}catch(_e){}
  }

  function emitReady(payload){
    document.dispatchEvent(new CustomEvent('laporan-investor:minutes-revised-ready',{detail:payload}));
  }

  function datasetRoot(payload){return payload?.data||payload||{};}
  function periodMonthIndex(period){
    const m=Number(String(period||'').slice(5,7));
    return Number.isInteger(m)&&m>=1&&m<=12?m-1:-1;
  }
  function snapshotMonthOmzet(snapshot){
    const idx=periodMonthIndex(snapshot?.period_month);
    if(idx<0)return null;
    const root=datasetRoot(snapshot?.payload);
    const trend=root?.yearTrend;
    const fromMonth=Number(trend?.months?.[idx]?.omzet);
    if(Number.isFinite(fromMonth))return fromMonth;
    if(Number(trend?.activeMonth)===idx+1){
      const current=Number(trend?.current);
      if(Number.isFinite(current))return current;
    }
    return null;
  }

  async function applySnapshotFirstYearTrend(payload){
    const root=datasetRoot(payload);
    const trend=root?.yearTrend;
    const selected=monthLabel();
    if(!trend||!/^\d{4}-\d{2}$/.test(selected))return payload;
    const year=Number(selected.slice(0,4));
    const activeMonth=Number(selected.slice(5,7));
    try{
      const response=await fetch(`${apiBase()}/investor/snapshots-year`,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({branch:branchLabel(),year})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result?.ok!==true)throw new Error(result?.error||`HTTP ${response.status}`);

      const months=Array.from({length:12},(_,i)=>({
        ...(trend?.months?.[i]||{}),
        month:i+1,
        omzet:Number(trend?.months?.[i]?.omzet||0),
        source:'MINUTES_LIVE_REVISED'
      }));
      const snapshotMonths=[];
      for(const snap of result.snapshots||[]){
        const idx=periodMonthIndex(snap?.period_month);
        const omzet=snapshotMonthOmzet(snap);
        if(idx<0||omzet===null)continue;
        months[idx]={...months[idx],omzet,source:'SNAPSHOT_REVISED',revision:Number(snap.revision_no||0)};
        snapshotMonths.push(idx+1);
      }
      const current=Number(months[activeMonth-1]?.omzet||0);
      const previous=activeMonth>1?Number(months[activeMonth-2]?.omzet||0):0;
      const growthPct=previous>0?((current-previous)/previous)*100:null;
      root.yearTrend={
        ...trend,
        year,
        activeMonth,
        months,
        current,
        previous,
        growthPct,
        sourcePolicy:'SNAPSHOT_FIRST_REVISED',
        snapshotMonths
      };
    }catch(err){
      console.warn('[Investor Revised] Year snapshot-first fallback ke Minutes LIVE dataset:',err?.message||err);
    }
    return payload;
  }

  async function applyReady(payload,{source='SESSION',fetchedAt=null,snapshot=null}={}){
    state.status='ready';
    state.dataset=payload;
    state.source=source;
    state.snapshot=snapshot;
    state.error=null;
    state.lastFetchedAt=new Date(fetchedAt||Date.now()).toLocaleString('id-ID');
    window.InvestorRevisedMinutesData=payload;
    render();
    await applySnapshotFirstYearTrend(payload);
    state.dataset=payload;
    window.InvestorRevisedMinutesData=payload;
    window.setTimeout(()=>emitReady(payload),0);
    return payload;
  }

  async function loadPermanentSnapshot(){
    const branch=branchLabel();
    const month=monthLabel();
    if(!branch||branch==='Semua Cabang'||!/^\d{4}-\d{2}$/.test(month))return false;
    try{
      const response=await fetch(`${apiBase()}/investor/snapshot-latest`,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({branch,month})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result?.ok!==true)throw new Error(result?.error||`HTTP ${response.status}`);
      if(!result?.found||!result?.snapshot?.payload)return false;
      const snap=result.snapshot;
      await applyReady(snap.payload,{source:'SNAPSHOT_DB',fetchedAt:snap.source_fetched_at||snap.created_at,snapshot:snap});
      saveCache(snap.payload);
      return true;
    }catch(_e){
      return false;
    }
  }

  async function loadSessionCache(){
    try{
      const raw=sessionStorage.getItem(cacheKey());
      if(!raw)return false;
      const saved=JSON.parse(raw);
      if(!saved?.payload)return false;
      await applyReady(saved.payload,{source:'SESSION',fetchedAt:saved.fetchedAt});
      return true;
    }catch(_e){return false;}
  }

  async function restoreSnapshot(){
    state.status='idle';state.dataset=null;state.lastFetchedAt=null;state.error=null;state.source=null;state.snapshot=null;
    render();
    if(await loadPermanentSnapshot())return;
    if(await loadSessionCache())return;
    render();
  }

  async function onFetchClick(){
    const branch=branchLabel();
    const month=monthLabel();
    if(!branch||branch==='Semua Cabang'){
      state.status='error';state.error='Pilih 1 cabang. Ambil Data Minutes berjalan per cabang.';render();return;
    }
    if(!/^\d{4}-\d{2}$/.test(month)){
      state.status='error';state.error='Periode belum valid.';render();return;
    }
    state.status='loading';state.error=null;render();
    try{
      const response=await fetch(`${apiBase()}/investor/monthly-readonly`,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({branch,month})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload?.ok!==true)throw new Error(payload?.error||`HTTP ${response.status}`);
      if(payload?.mode!=='READ_ONLY'||payload?.mainSyncTouched!==false)throw new Error('Safety guard READ ONLY Minutes tidak terkonfirmasi.');
      if(payload?.snapshotStored!==true)throw new Error('Dataset Minutes terbaca tetapi snapshot permanen belum tersimpan.');
      const snap={id:payload.snapshotId,revision_no:payload.snapshotRevision,status:payload.snapshotStatus,source_fetched_at:payload.finishedAt};
      await applyReady(payload,{source:'SNAPSHOT_DB',fetchedAt:payload.finishedAt,snapshot:snap});
      saveCache(payload);
    }catch(err){
      state.status='error';
      state.error=err?.message||String(err);
      state.source=null;
    }
    render();
  }

  async function init(){
    const allowed=await enforceOwnerOnly();
    if(!allowed)return;
    ensureInvestorSidebarActive();
    qs('lbFetchMinutes')?.addEventListener('click',onFetchClick);
    qs('lbBranch')?.addEventListener('change',()=>void restoreSnapshot());
    qs('lbMonth')?.addEventListener('change',()=>void restoreSnapshot());
    await restoreSnapshot();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else void init();

  window.LaporanInvestorRevisedUI={
    markReady:function(payload={}){
      void applyReady(payload,{source:'SESSION',fetchedAt:payload.lastFetchedAt||new Date().toISOString()});
    },
    getDataset:function(){return state.dataset;},
    getSnapshot:function(){return state.snapshot;},
    reloadSnapshot:function(){return restoreSnapshot();},
    reset:function(){state.status='idle';state.lastFetchedAt=null;state.dataset=null;state.error=null;state.source=null;state.snapshot=null;render();}
  };
})();