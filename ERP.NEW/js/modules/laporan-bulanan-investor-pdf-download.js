(function(){
  'use strict';

  const PAGE='.laporan-bulanan-investor-page';
  const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  let installed=false;
  let busy=false;
  let ownedButton=null;
  let buttonObserver=null;

  const qs=id=>document.getElementById(id);

  function activePeriod(){
    const raw=String(qs('lbMonth')?.value||'');
    const match=raw.match(/^(\d{4})-(\d{2})$/);
    if(!match)return {raw,label:raw,monthName:raw,year:''};
    const year=match[1];
    const monthName=MONTHS[Number(match[2])-1]||match[2];
    return {raw,label:`${monthName} ${year}`,monthName,year};
  }

  function normalizePhone(value){
    let digits=String(value||'').replace(/\D/g,'');
    if(digits.startsWith('0'))digits=`62${digits.slice(1)}`;
    return digits;
  }

  function normalizeBranch(value){
    return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()
      .replace(/^vax wijaya /,'').replace(/^vax wijiaya /,'').replace(/^vax /,'')
      .replace(/rawa badak/g,'rawabadak').replace(/spbu pagaden/g,'pagaden').replace(/\bsoklat\b/g,'barsel').trim();
  }

  function periodEnd(month){
    if(!/^\d{4}-\d{2}$/.test(String(month||'')))return '';
    const [year,mon]=month.split('-').map(Number);
    const last=new Date(Date.UTC(year,mon,0)).getUTCDate();
    return `${year}-${String(mon).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  }

  function parseMasterPayload(raw){
    let data=raw;
    if(typeof data==='string'){
      try{data=JSON.parse(data);}catch(_e){}
    }
    if(Array.isArray(data)&&data.length===1&&data[0]&&typeof data[0]==='object')data=data[0];
    if(data&&data.payload)data=data.payload;
    return Array.isArray(data?.investor)?data.investor:[];
  }

  async function resolveTarget(){
    const branch=qs('lbBranch')?.selectedOptions?.[0]?.textContent?.trim()||'';
    const month=String(qs('lbMonth')?.value||'');
    const date=periodEnd(month);
    if(!branch||branch==='Semua Cabang'||!date||typeof db==='undefined'||typeof db.rpc!=='function')return null;
    const {data,error}=await db.rpc('erp_master_finance_get');
    if(error)throw error;
    const want=normalizeBranch(branch);
    const rows=parseMasterPayload(data)
      .filter(row=>{
        if(normalizeBranch(row?.branch_name)!==want)return false;
        const from=String(row?.effective_from||'0000-00-00').slice(0,10);
        const to=String(row?.effective_to||'9999-12-31').slice(0,10);
        return from<=date&&to>=date;
      })
      .sort((a,b)=>String(b?.effective_from||'0000-00-00').localeCompare(String(a?.effective_from||'0000-00-00')));
    const row=rows[0]||null;
    if(!row)return null;
    const phone=normalizePhone(row.phone_number);
    if(!phone)return null;
    return {phone,name:String(row.investor_name||'Investor').trim(),branch:String(row.branch_name||branch).trim()};
  }

  function applyOwnedState(button){
    if(!button||button!==ownedButton)return;
    button.style.setProperty('background','#25D366','important');
    button.style.setProperty('border-color','#25D366','important');
    button.style.setProperty('color','#fff','important');
    button.style.setProperty('filter','none','important');
    button.style.setProperty('opacity','1','important');
    if(!busy){
      button.disabled=false;
      button.removeAttribute('disabled');
      button.setAttribute('aria-disabled','false');
      button.title='Buka WhatsApp Investor';
    }
  }

  function protectButton(button){
    buttonObserver?.disconnect();
    buttonObserver=new MutationObserver(()=>{
      if(!busy&&button===ownedButton&&(button.disabled||button.hasAttribute('disabled'))){
        queueMicrotask(()=>applyOwnedState(button));
      }
    });
    buttonObserver.observe(button,{attributes:true,attributeFilter:['disabled','class','style','title','aria-disabled']});
  }

  function install(){
    if(installed||!document.querySelector(PAGE))return false;
    const old=qs('lbInvestorWhatsapp');
    if(!old)return false;

    const button=old.cloneNode(true);
    old.replaceWith(button);
    ownedButton=button;
    installed=true;
    applyOwnedState(button);
    protectButton(button);

    button.addEventListener('click',async()=>{
      if(busy)return;
      busy=true;
      button.disabled=true;
      button.setAttribute('aria-disabled','true');
      button.title='Membuka WhatsApp Investor...';
      try{
        const target=await resolveTarget();
        if(!target)throw new Error('Nomor WhatsApp Investor belum tersedia untuk cabang/periode ini.');
        const period=activePeriod();
        const message=`Laporan Investor ${target.branch} periode ${period.label}`;
        window.location.assign(`https://wa.me/${target.phone}?text=${encodeURIComponent(message)}`);
      }catch(err){
        console.error('[Investor WhatsApp]',err);
        window.alert(err?.message||'Gagal membuka WhatsApp Investor.');
      }finally{
        busy=false;
        applyOwnedState(button);
      }
    });

    ['lbBranch','lbMonth'].forEach(id=>qs(id)?.addEventListener('change',()=>setTimeout(()=>applyOwnedState(button),0)));
    return true;
  }

  function boot(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(install()||tries>=100)clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
