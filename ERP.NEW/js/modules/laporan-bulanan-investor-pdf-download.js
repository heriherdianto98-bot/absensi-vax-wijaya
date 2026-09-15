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

  function cleanPart(value){
    return String(value||'')
      .trim()
      .replace(/^VAX\s+WIJAYA\s+/i,'')
      .replace(/[^a-zA-Z0-9]+/g,'-')
      .replace(/^-+|-+$/g,'')||'Cabang';
  }

  function fileName(){
    const branch=qs('lbBranch')?.selectedOptions?.[0]?.textContent?.trim()||'Cabang';
    const period=activePeriod();
    return `Laporan-Investor-${cleanPart(branch)}-${cleanPart(period.monthName)}-${period.year}.pdf`.replace(/--+/g,'-');
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

  function loadHtml2Pdf(){
    if(window.html2pdf)return Promise.resolve(window.html2pdf);
    const existing=document.querySelector('script[data-vax-html2pdf="1"]');
    if(existing){
      return new Promise((resolve,reject)=>{
        existing.addEventListener('load',()=>resolve(window.html2pdf),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Library PDF gagal dimuat.')),{once:true});
      });
    }
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.async=true;
      s.dataset.vaxHtml2pdf='1';
      s.onload=()=>window.html2pdf?resolve(window.html2pdf):reject(new Error('Library PDF tidak tersedia.'));
      s.onerror=()=>reject(new Error('Library PDF gagal dimuat. Periksa koneksi internet.'));
      document.head.appendChild(s);
    });
  }

  async function captureFinalPrintHtml(){
    const api=window.LaporanBulananPrintUI;
    if(!api||typeof api.open!=='function')throw new Error('Presenter PDF Laporan Investor belum siap.');
    let captured='';
    const fakeWindow={
      document:{open(){},close(){},write(html){captured=String(html||'');}},
      closed:false,
      close(){this.closed=true;},
      focus(){},
      print(){}
    };
    const nativeOpen=window.open;
    window.open=()=>fakeWindow;
    try{await api.open('pdf');}
    finally{window.open=nativeOpen;}
    if(!captured)throw new Error('HTML final laporan gagal diambil dari presenter PDF.');
    return captured;
  }

  function sanitizePrintHtml(html){
    let source=String(html||'');
    source=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    source=source.replace(/<head([^>]*)>/i,`<head$1><base href="${location.href}">`);
    source=source.replace(/<\/head>/i,`<style>
      html,body{margin:0!important;padding:0!important;background:#fff!important;width:210mm!important;max-width:210mm!important}
      body{font-family:Arial,Helvetica,sans-serif!important}
      .page-frame{width:210mm!important;max-width:210mm!important;margin:0!important;box-shadow:none!important;background:#fff!important}
      .page-frame>thead{display:table-header-group!important}.page-frame>tfoot{display:table-footer-group!important}
      .head-space{height:24mm!important}.foot-space{height:18mm!important}
      .master-head{height:20mm!important;padding:0!important}.master-foot{height:10mm!important;margin:0!important}
      .content{padding:0!important}
    </style></head>`);
    return source;
  }

  function waitForFrame(frame){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Render PDF terlalu lama.')),15000);
      frame.addEventListener('load',()=>{clearTimeout(timer);resolve();},{once:true});
    });
  }

  async function waitForAssets(doc){
    try{await doc.fonts?.ready;}catch(_e){}
    await Promise.all([...doc.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
      img.addEventListener('load',resolve,{once:true});
      img.addEventListener('error',resolve,{once:true});
    })));
  }

  async function downloadRealPdf(html,filename){
    const html2pdf=await loadHtml2Pdf();
    const frame=document.createElement('iframe');
    frame.setAttribute('aria-hidden','true');
    Object.assign(frame.style,{position:'fixed',left:'-12000px',top:'0',width:'794px',height:'1123px',border:'0',background:'#fff'});
    document.body.appendChild(frame);
    try{
      const loaded=waitForFrame(frame);
      frame.srcdoc=sanitizePrintHtml(html);
      await loaded;
      const doc=frame.contentDocument;
      if(!doc?.body)throw new Error('Dokumen PDF gagal dirender.');
      await waitForAssets(doc);
      await html2pdf().set({
        margin:0,
        filename,
        image:{type:'jpeg',quality:0.98},
        html2canvas:{scale:1.35,useCORS:true,logging:false,backgroundColor:'#ffffff',windowWidth:794},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
        pagebreak:{mode:['css','legacy']}
      }).from(doc.body).save();
    }finally{frame.remove();}
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
      button.title='Download PDF laporan lalu buka WhatsApp Investor';
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
      button.title='Menyiapkan file PDF laporan...';
      try{
        const target=await resolveTarget();
        if(!target)throw new Error('Nomor WhatsApp Investor belum tersedia untuk cabang/periode ini.');
        const html=await captureFinalPrintHtml();
        await downloadRealPdf(html,fileName());
        const period=activePeriod();
        const message=`Laporan Investor ${target.branch} periode ${period.label}`;
        window.location.assign(`https://wa.me/${target.phone}?text=${encodeURIComponent(message)}`);
      }catch(err){
        console.error('[Investor PDF Download]',err);
        window.alert(err?.message||'Gagal membuat PDF Laporan Investor.');
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
