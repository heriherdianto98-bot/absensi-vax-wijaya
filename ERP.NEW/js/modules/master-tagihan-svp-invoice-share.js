/* ERP VAX — SVP Invoice secure PDF share add-on. Additive only. */
"use strict";
(() => {
  const SELF_SRC=document.currentScript?.src||'';
  const SHARE_API='https://erp.vaxwijaya.com';
  const SVP_WHATSAPP_PHONE='6287837102090';
  const OWNER_WHATSAPP_PHONE='6287857666656';
  const canShare=inv=>['owner','svp','spv'].includes(String(inv?.role||'').toLowerCase());

  async function makeShareUrl(inv,row){
    const {data:s}=await db.auth.getSession();
    const token=s?.session?.access_token;
    if(!token)throw new Error('Sesi pengguna tidak ditemukan');
    const res=await fetch(`${SHARE_API}/api/svp-invoice/share`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body:JSON.stringify({invoice_id:row.id})
    });
    const out=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(out.error||`HTTP ${res.status}`);
    if(!out.url)throw new Error('Link PDF invoice tidak diterima');
    return out.url;
  }

  async function secureOpenWhatsapp(row){
    if(!canShare(this)||!row)return;
    const role=String(this.role||'').toLowerCase();
    const phone=role==='owner'?SVP_WHATSAPP_PHONE:OWNER_WHATSAPP_PHONE;
    const popup=window.open('about:blank','_blank');
    try{
      const shareUrl=await makeShareUrl(this,row);
      const message=[
        'INVOICE VAX WIJAYA',
        '',
        `No. Invoice: ${row.invoice_no||'-'}`,
        `Total: ${this.rp(row.total)}`,
        '',
        'Detail invoice:',
        shareUrl,
        '',
        'Mohon ditinjau dan ditindaklanjuti.'
      ].join('\n');
      const wa=`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
      if(popup)popup.location.replace(wa);else window.location.href=wa;
    }catch(e){
      if(popup)popup.close();
      alert(`Gagal membuat link PDF invoice: ${e?.message||e}`);
    }
  }

  secureOpenWhatsapp.__erpSecurePdfShare=true;

  function installFinal(){
    const inv=window.SvPInvoice;
    if(!inv||!inv.__workflowV2)return false;
    if(inv.openWhatsapp?.__erpSecurePdfShare===true)return true;
    inv.openWhatsapp=secureOpenWhatsapp;
    inv.__securePdfShareInstalled=true;
    return true;
  }

  function loadRoleBridge(){
    if(document.querySelector('script[data-svp-invoice-role-bridge]'))return;
    const src=SELF_SRC
      ? SELF_SRC.replace(/master-tagihan-svp-invoice-share\.js(?:\?.*)?$/,'master-tagihan-svp-invoice-role-bridge.js?v=20260910-1')
      : '../js/modules/master-tagihan-svp-invoice-role-bridge.js?v=20260910-1';
    const s=document.createElement('script');
    s.src=src;s.async=true;s.dataset.svpInvoiceRoleBridge='1';
    document.head.appendChild(s);
  }

  /* Load the targeted SVP new-invoice / delivery fix without changing locked core modules. */
  function loadInvoiceBehaviorFix(){
    if(document.querySelector('script[data-svp-invoice-behavior-fix]'))return;
    const src=SELF_SRC
      ? SELF_SRC.replace(/master-tagihan-svp-invoice-share\.js(?:\?.*)?$/,'master-tagihan-invoice-new-and-delivery-fix.js?v=20260917-1')
      : '../js/modules/master-tagihan-invoice-new-and-delivery-fix.js?v=20260917-1';
    const s=document.createElement('script');
    s.src=src;s.async=true;s.dataset.svpInvoiceBehaviorFix='1';
    document.head.appendChild(s);
  }

  let tries=0;
  const t=setInterval(()=>{
    if(installFinal())clearInterval(t);
    else if(++tries>100)clearInterval(t);
  },100);

  loadRoleBridge();
  loadInvoiceBehaviorFix();
  window.addEventListener('load',()=>{
    setTimeout(installFinal,700);
    setTimeout(installFinal,1500);
    setTimeout(loadRoleBridge,500);
    setTimeout(loadInvoiceBehaviorFix,500);
  });
})();
