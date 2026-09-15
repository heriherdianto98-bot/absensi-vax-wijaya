(function(){
  'use strict';

  const PAGE='.laporan-bulanan-investor-page';
  let target=null;
  let currentButton=null;

  const qs=id=>document.getElementById(id);
  const normalizeBranch=value=>String(value||'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/^vax wijaya /,'')
    .replace(/^vax wijiaya /,'')
    .replace(/^vax /,'')
    .replace(/rawa badak/g,'rawabadak')
    .replace(/spbu pagaden/g,'pagaden')
    .replace(/\bsoklat\b/g,'barsel')
    .trim();

  const normalizePhone=value=>{
    let digits=String(value||'').replace(/\D/g,'');
    if(digits.startsWith('0'))digits=`62${digits.slice(1)}`;
    return digits;
  };

  const periodEnd=month=>{
    if(!/^\d{4}-\d{2}$/.test(String(month||'')))return '';
    const [year,mon]=month.split('-').map(Number);
    const last=new Date(Date.UTC(year,mon,0)).getUTCDate();
    return `${year}-${String(mon).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  };

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
    const month=qs('lbMonth')?.value||'';
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
    return {
      phone,
      name:String(row.investor_name||'Investor').trim(),
      branch:String(row.branch_name||branch).trim()
    };
  }

  function applyWhatsAppVisual(button){
    button.style.setProperty('background','#25D366','important');
    button.style.setProperty('border-color','#25D366','important');
    button.style.setProperty('color','#fff','important');
    button.style.setProperty('filter','none','important');
    button.style.setProperty('opacity','1','important');
    button.style.setProperty('box-shadow','0 0 14px rgba(37,211,102,.28)','important');
  }

  function replaceButton(){
    const old=qs('lbInvestorWhatsapp');
    if(!old)return null;
    if(old===currentButton)return old;

    const button=old.cloneNode(true);
    old.replaceWith(button);
    currentButton=button;
    applyWhatsAppVisual(button);

    button.addEventListener('click',async()=>{
      try{
        const resolved=target||await resolveTarget();
        if(!resolved)throw new Error('Nomor WhatsApp Investor belum tersedia di Master Investor untuk cabang/periode ini.');
        window.open(`https://wa.me/${resolved.phone}`,'_blank','noopener');
      }catch(err){
        window.alert(err?.message||'Gagal membuka WhatsApp Investor.');
      }
    });
    return button;
  }

  async function sync(){
    const button=replaceButton();
    if(!button)return false;
    target=null;
    button.disabled=true;
    applyWhatsAppVisual(button);
    button.title='Membaca nomor Investor dari Master Investor...';
    try{
      target=await resolveTarget();
      if(!target){
        button.title='Nomor WhatsApp Investor belum tersedia untuk cabang/periode ini';
        return true;
      }
      button.disabled=false;
      applyWhatsAppVisual(button);
      button.title=`WhatsApp ${target.name} · +${target.phone}`;
    }catch(err){
      console.warn('[Investor WhatsApp Fix]',err?.message||err);
      button.title='Gagal membaca nomor WhatsApp Investor';
    }
    return true;
  }

  function boot(){
    if(!document.querySelector(PAGE))return;
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(qs('lbInvestorWhatsapp')){
        clearInterval(timer);
        void sync();
        qs('lbBranch')?.addEventListener('change',()=>setTimeout(()=>void sync(),0));
        qs('lbMonth')?.addEventListener('change',()=>setTimeout(()=>void sync(),0));
      }else if(tries>=80){
        clearInterval(timer);
      }
    },100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
