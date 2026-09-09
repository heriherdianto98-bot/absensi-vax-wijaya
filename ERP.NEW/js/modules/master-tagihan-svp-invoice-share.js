/* ERP VAX — SVP Invoice secure PDF share add-on. Additive only. */
"use strict";
(() => {
  const SHARE_API='https://erp.vaxwijaya.com';
  const SVP_WHATSAPP_PHONE='6287837102090';

  async function makeShareUrl(inv,row){
    const {data:s}=await db.auth.getSession();
    const token=s?.session?.access_token;
    if(!token)throw new Error('Sesi Owner tidak ditemukan');
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

  function install(){
    const inv=window.SvPInvoice;
    if(!inv||inv.__securePdfShareInstalled)return false;
    inv.__securePdfShareInstalled=true;
    inv.openWhatsapp=async function(row){
      if(!this.isOwner()||!row)return;
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
        const wa=`https://api.whatsapp.com/send?phone=${SVP_WHATSAPP_PHONE}&text=${encodeURIComponent(message)}`;
        if(popup)popup.location.replace(wa);else window.location.href=wa;
      }catch(e){
        if(popup)popup.close();
        alert(`Gagal membuat link PDF invoice: ${e?.message||e}`);
      }
    };
    return true;
  }

  let tries=0;
  const t=setInterval(()=>{if(install()||++tries>60)clearInterval(t)},100);
  window.addEventListener('load',()=>setTimeout(install,500));
})();
