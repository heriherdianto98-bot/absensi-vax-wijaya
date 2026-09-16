/* ERP VAX — scoped SVP -> Owner invoice delivery UI. No finance/Cash Out changes. */
'use strict';
(() => {
  const isSvp=inv=>['svp','spv'].includes(String(inv?.role||'').toLowerCase());
  const isMine=(inv,row)=>['svp','spv'].includes(String(row?.sender_role||'').toLowerCase())&&String(row?.created_by||'')===String(inv?.user?.id||'');
  const isDraft=row=>String(row?.status||'draft').toLowerCase()==='draft';
  const SEND_API='https://erp.vaxwijaya.com/api/svp-invoice/send-owner';
  let busy=false;
  let pendingWa=null;

  async function statusOf(id){
    const {data,error}=await db.from('svp_invoices').select('status').eq('id',id).maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('Invoice tidak ditemukan');
    return String(data.status||'').toLowerCase();
  }
  async function confirmSent(inv,row){
    if(!isSvp(inv)||!isMine(inv,row))throw new Error('Akses invoice ditolak');
    const current=await statusOf(row.id);
    if(['sent','completed','paid'].includes(current)){await inv.reload();return true;}
    if(current!=='draft')throw new Error('Status invoice tidak sesuai');
    const {data,error}=await db.from('svp_invoices')
      .update({status:'sent',sent_at:new Date().toISOString(),updated_by:inv.user.id,updated_at:new Date().toISOString()})
      .eq('id',row.id).eq('created_by',inv.user.id).in('sender_role',['svp','spv'])
      .eq('status','draft').select('id,status');
    if(error)throw error;
    if(!data?.length && !['sent','completed','paid'].includes(await statusOf(row.id)))
      throw new Error('Database belum mencatat invoice sebagai terkirim');
    await inv.reload();
    return true;
  }

  function install(){
    const inv=window.SvPInvoice;
    if(!isSvp(inv)||!inv?.user?.id||!inv.__workflowV2||!inv.__svpOwnerReturnInstalled||!inv.__securePdfShareInstalled)return false;
    if(inv.__newAndDeliveryFixInstalled)return true;
    inv.__newAndDeliveryFixInstalled=true;

    // Explicit New opens a blank form; previously saved drafts remain available via Edit.
    const originalOpen=inv.open;
    inv.open=async function(row=null){
      if(row)return originalOpen.call(this,row);
      const rows=this.rows;
      this.rows=(Array.isArray(rows)?rows:[]).filter(r=>!isDraft(r));
      try{return await originalOpen.call(this,null)}finally{this.rows=rows;}
    };

    // Preserve the formerly working email endpoint; a successful API response must
    // be followed by persisted SENT status. Never claim success on a failed response.
    inv.send=async function(id,button){
      if(busy)return;
      const row=(this.rows||[]).find(r=>String(r.id)===String(id));
      if(!row||!isMine(this,row)||!isDraft(row))return;
      busy=true;
      const old=button?.innerHTML;
      if(button){button.disabled=true;button.textContent='Mengirim...';}
      let apiAccepted=false;
      try{
        const {data:session,error:authError}=await db.auth.getSession();
        if(authError)throw authError;
        const token=session?.session?.access_token;
        if(!token)throw new Error('Sesi login tidak ditemukan');
        const response=await fetch(SEND_API,{
          method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
          body:JSON.stringify({invoice_id:id})
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.ok===false||result.error)throw new Error(result.error||`HTTP ${response.status}`);
        apiAccepted=true;
        await confirmSent(this,row);
        alert('Email diproses oleh layanan pengiriman; status invoice tersimpan sebagai TERKIRIM.');
      }catch(error){
        alert(apiAccepted
          ? `Layanan email merespons berhasil, tetapi status ERP belum tersimpan: ${error?.message||error}. Periksa status sebelum mencoba lagi.`
          : `Gagal mengirim email: ${error?.message||error}. Status invoice tidak diubah.`);
      }finally{
        busy=false;
        if(button){button.disabled=false;button.innerHTML=old;}
      }
    };

    // WhatsApp provides no trustworthy delivery callback. Prompt only AFTER the user
    // comes back from WhatsApp; an opened tab or a generated PDF is not delivery proof.
    const originalWhatsapp=inv.openWhatsapp;
    inv.openWhatsapp=async function(row){
      if(!row||!isMine(this,row)||!isDraft(row))return originalWhatsapp.call(this,row);
      if(busy)return;
      pendingWa={id:String(row.id),invoiceNo:row.invoice_no,openedAt:Date.now(),inv:this};
      try{await originalWhatsapp.call(this,row)}catch(error){pendingWa=null;throw error;}
    };
    async function finishWa(id){
      if(busy)return;
      const row=(inv.rows||[]).find(r=>String(r.id)===String(id));
      if(!row||!isMine(inv,row)||!isDraft(row))return;
      if(!confirm(`Apakah pesan WhatsApp invoice ${row.invoice_no} sudah Anda tekan KIRIM di WhatsApp?\n\nOK = sudah dikirim; Batal = tetap Draft.`))return;
      busy=true;
      try{await confirmSent(inv,row)}
      catch(error){alert(`Status WhatsApp belum tersimpan: ${error?.message||error}`);}
      finally{busy=false;}
    }
    let lastPrompt=0;
    window.addEventListener('focus',()=>{
      const p=pendingWa;
      if(!p||Date.now()-p.openedAt<1400||Date.now()-lastPrompt<1000)return;
      pendingWa=null;lastPrompt=Date.now();
      finishWa(p.id).catch(error=>alert(`Konfirmasi WhatsApp gagal: ${error?.message||error}`));
    });

    // Also expose an explicit confirmation on drafts, in case the browser does not
    // fire a focus event (or the user returns without switching browser windows).
    const list=document.getElementById('mtInvoiceList');
    if(list){
      const decorate=()=>{
        list.querySelectorAll('.mt-invoice-row').forEach(el=>{
          const id=el.querySelector('[data-wa-id]')?.getAttribute('data-wa-id');
          if(!id||el.querySelector('[data-confirm-wa-id]'))return;
          const row=(inv.rows||[]).find(r=>String(r.id)===String(id));
          if(!row||!isMine(inv,row)||!isDraft(row))return;
          const actions=el.querySelector('.mt-invoice-buttons,.svp-return-actions');
          if(!actions)return;
          const button=document.createElement('button');
          button.type='button';button.className='mt-action mt-confirm-wa-sent';
          button.dataset.confirmWaId=id;button.textContent='Konfirmasi WA';
          button.title='Konfirmasi hanya sesudah menekan Kirim di WhatsApp';
          button.style.cssText='min-height:38px;padding:6px 10px;border-color:#97742c;background:#302711;color:#ffe5a1;white-space:nowrap';
          actions.appendChild(button);
        });
      };
      list.addEventListener('click',event=>{
        const button=event.target.closest('[data-confirm-wa-id]');
        if(!button)return;
        event.preventDefault();event.stopPropagation();
        pendingWa=null;
        finishWa(button.dataset.confirmWaId).catch(error=>alert(`Konfirmasi WhatsApp gagal: ${error?.message||error}`));
      },true);
      new MutationObserver(decorate).observe(list,{childList:true,subtree:true});
      decorate();
    }
    return true;
  }
  let attempts=0;
  const timer=setInterval(()=>{if(install()||++attempts>200)clearInterval(timer)},100);
  window.addEventListener('load',()=>setTimeout(install,600));
})();
