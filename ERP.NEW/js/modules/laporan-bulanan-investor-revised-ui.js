(function(){
  'use strict';

  const state={status:'idle',lastFetchedAt:null,dataset:null,error:null,source:null,snapshot:null};
  let navObserver=null;
  let waTarget=null;

  function qs(id){return document.getElementById(id);}
  function branchLabel(){return qs('lbBranch')?.selectedOptions?.[0]?.textContent?.trim()||'Cabang';}
  function monthLabel(){return qs('lbMonth')?.value||'';}
  function cacheKey(){return `erp-vax:investor-revised:${branchLabel()}:${monthLabel()}`;}
  function apiBase(){
    if(window.INVESTOR_MINUTES_READONLY_API)return String(window.INVESTOR_MINUTES_READONLY_API).replace(/\/$/,'');
    const local=['127.0.0.1','localhost'].includes(location.hostname);
    return local?'http://127.0.0.1:8788':`${location.origin}/api/investor-revised`;
  }

  function normalizeBranch(value){
    return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()
      .replace(/^vax wijaya /,'').replace(/^vax wijiaya /,'').replace(/^vax /,'')
      .replace(/rawa badak/g,'rawabadak').replace(/spbu pagaden/g,'pagaden').replace(/\bsoklat\b/g,'barsel').trim();
  }

  function normalizePhone(value){
    let digits=String(value||'').replace(/\D/g,'');
    if(digits.startsWith('0'))digits=`62${digits.slice(1)}`;
    return digits;
  }

  function periodEnd(month){
    if(!/^\d{4}-\d{2}$/.test(String(month||'')))return '';
    const [year,mon]=month.split('-').map(Number);
    const last=new Date(Date.UTC(year,mon,0)).getUTCDate();
    return `${year}-${String(mon).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  }

  async function resolveInvestorWhatsapp(){
    const branch=branchLabel();
    const month=monthLabel();
    const date=periodEnd(month);
    if(!branch||branch==='Semua Cabang'||!date||!window.db?.from)return null;
    const {data,error}=await window.db.from('master_investor')
      .select('branch_name,investor_name,phone_number,effective_from,effective_to,status');
    if(error)throw error;
    const want=normalizeBranch(branch);
    const rows=(data||[]).filter(row=>{
      if(normalizeBranch(row?.branch_name)!==want)return false;
      const from=String(row?.effective_from||'0000-00-00').slice(0,10);
      const to=String(row?.effective_to||'9999-12-31').slice(0,10);
      return from<=date&&to>=date;
    }).sort((a,b)=>String(b?.effective_from||'0000-00-00').localeCompare(String(a?.effective_from||'0000-00-00')));
    const row=rows[0]||null;
    if(!row)return null;
    const phone=normalizePhone(row.phone_number);
    return phone?{phone,name:String(row.investor_name||'Investor').trim(),branch:String(row.branch_name||branch).trim()}:null;
  }

  function ensureWhatsappStyle(){
    if(document.getElementById('investor-wa-toolbar-style'))return;
    const style=document.createElement('style');
    style.id='investor-wa-toolbar-style';
    style.textContent=`
      .laporan-bulanan-investor-page .lb-btn.lb-btn-wa{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;background:linear-gradient(180deg,#24c76a,#15924a)!important;border-color:#43db83!important;color:#fff!important;font-weight:900!important;box-shadow:0 0 14px rgba(36,199,106,.16)!important}
      .laporan-bulanan-investor-page .lb-btn.lb-btn-wa:hover{background:linear-gradient(180deg,#2bd875,#18a153)!important;border-color:#63e69a!important}
      .laporan-bulanan-investor-page .lb-btn.lb-btn-wa svg{width:17px;height:17px;display:block;fill:currentColor}
      .laporan-bulanan-investor-page .lb-btn.lb-btn-wa[disabled]{filter:grayscale(.35);opacity:.48!important}
    `;
    document.head.appendChild(style);
  }

  function ensureWhatsappButton(){
    let button=qs('lbInvestorWhatsapp');
    if(button)return button;
    const actions=document.querySelector('.laporan-bulanan-investor-page .lb-toolbar .lb-actions');
    if(!actions)return null;
    ensureWhatsappStyle();
    button=document.createElement('button');
    button.type='button';
    button.id='lbInvestorWhatsapp';
    button.className='lb-btn lb-btn-wa';
    button.disabled=true;
    button.title='WhatsApp Investor';
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l5.3-1.4A9.5 9.5 0 1 0 12 2Zm0 17.2c-1.4 0-2.8-.4-4-1.1l-.3-.2-3.1.8.8-3-.2-.3A7.7 7.7 0 1 1 12 19.2Zm4.3-5.7c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-1.3-.7-2.3-1.5-3.1-2.7-.2-.3.2-.5.6-1 .1-.1.1-.3 0-.4l-.7-1.6c-.1-.3-.3-.3-.5-.3h-.4c-.2 0-.4.1-.6.3-.6.6-.9 1.3-.9 2.1 0 2.1 1.5 4.1 1.8 4.4.2.3 3 4.6 7.4 6.3 1 .4 1.8.6 2.5.7 1 .1 2-.1 2.7-.6.8-.5 1.3-1.3 1.4-2 .1-.2.1-.4 0-.5-.1-.1-.2-.2-.4-.3Z"/></svg><span>WhatsApp Investor</span>';
    actions.appendChild(button);
    button.addEventListener('click',async()=>{
      const popup=window.open('about:blank','_blank');
      try{
        const target=waTarget||await resolveInvestorWhatsapp();
        if(!target)throw new Error('Nomor WhatsApp Investor belum tersedia di Master Investor untuk cabang/periode ini.');
        const url=`https://wa.me/${target.phone}`;
        if(popup)popup.location.href=url;
        else window.location.href=url;
      }catch(err){
        try{popup?.close();}catch(_e){}
        window.alert(err?.message||'Gagal membuka WhatsApp Investor.');
      }
    });
    return button;
  }

  async function syncWhatsappButton(){
    const button=ensureWhatsappButton();
    if(!button)return;
    waTarget=null;
    button.disabled=true;
    button.title='Membaca nomor Investor dari Master Investor...';
    try{
      const target=await resolveInvestorWhatsapp();
      waTarget=target;
      if(!target){
        button.title='Nomor WhatsApp Investor belum tersedia untuk cabang/periode ini';
        return;
      }
      button.disabled=false;
      button.title=`WhatsApp ${target.name} · +${target.phone}`;
    }catch(err){
      console.warn('[Investor WhatsApp]',err?.message||err);
      button.title='Gagal membaca nomor WhatsApp Investor';
    }
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
    void syncWhatsappButton();
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
    ensureWhatsappButton();
    qs('lbFetchMinutes')?.addEventListener('click',onFetchClick);
    qs('lbBranch')?.addEventListener('change',()=>void restoreSnapshot());
    qs('lbMonth')?.addEventListener('change',()=>void restoreSnapshot());
    await syncWhatsappButton();
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