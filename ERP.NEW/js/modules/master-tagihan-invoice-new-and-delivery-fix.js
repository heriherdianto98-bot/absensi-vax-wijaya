/* ERP VAX — targeted SVP -> Owner invoice behavior fix. No finance/Cash Out changes. */
"use strict";
(() => {
  const isSvp=inv=>['svp','spv'].includes(String(inv?.role||'').toLowerCase());
  const isMine=(inv,row)=>isSvp(row?.sender_role)&&String(row?.created_by||'')===String(inv?.user?.id||'');
  const draft=row=>String(row?.status||'draft').toLowerCase()==='draft';
  const API='https://erp.vaxwijaya.com/api/svp-invoice/send-owner';
  let busy=false;

  async function confirmSent(inv,row,channel){
    if(!isSvp(inv)||!isMine(inv,row)||!draft(row))return false;
    const {data:updated,error}=await db.from('svp_invoices')
      .update({status:'sent',updated_by:inv.user.id,updated_at:new Date().toISOString()})
      .eq('id',row.id).eq('created_by',inv.user.id).in('sender_role',['svp','spv'])
      .eq('status','draft').select('id,status');
    if(error)throw error;
    if(!updated?.length){
      const {data:current,error:readError}=await db.from('svp_invoices').select('status').eq('id',row.id).maybeSingle();
      if(readError)throw readError;
      if(current?.status!=='sent'&&current?.status!=='paid')throw new Error('Status invoice belum berubah. Periksa izin database.');
    }
    await inv.reload();
    return true;
  }

  function install(){
    const inv=window.SvPInvoice;
    if(!isSvp(inv)||!inv?.user?.id||!inv.__workflowV2||!inv.__svpOwnerReturnInstalled||!inv.__securePdfShareInstalled)return false;
    if(inv.__newAndDeliveryFixInstalled)return true;
    inv.__newAndDeliveryFixInstalled=true;

    /* The legacy UI automatically selects the first draft when open(null) is called.
       Hide drafts only during an explicit NEW action; never delete or overwrite them. */
    const previousOpen=inv.open;
    inv.open=async function(row=null){
      if(row)return previousOpen.call(this,row);
      const rows=this.rows;
      this.rows=(Array.isArray(rows)?rows:[]).filter(r=>!draft(r));
      try{return await previousOpen.call(this,null)}
      finally{this.rows=rows}
    };

    /* Email: only mark SENT after the delivery API confirms success.
       If status persistence fails, explicitly warn; never claim success. */
    inv.send=async function(id,button){
      if(!isSvp(this)||busy)return;
      const row=(this.rows||[]).find(r=>String(r.id)===String(id));
      if(!row||!isMine(this,row)||!draft(row))return;
      busy=true;
      const old=button?.innerHTML;
      if(button){button.disabled=true;button.textContent='Mengirim...'}
      try{
        const {data:session,error:authError}=await db.auth.getSession();
        if(authError)throw authError;
        const token=session?.session?.access_token;
        if(!token)throw new Error('Sesi pengguna tidak ditemukan');
        const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({invoice_id:id})});
        const out=await res.json().catch(()=>({}));
        if(!res.ok)throw new Error(out.error||`HTTP ${res.status}`);
        await confirmSent(this,row,'email');
        alert('Email invoice berhasil diproses dan status tersimpan sebagai SENT.');
      }catch(error){
        alert(`Pengiriman email atau penyimpanan status gagal: ${error?.message||error}. Periksa email dan status sebelum mengirim ulang.`);
      }finally{
        busy=false;
        if(button){button.disabled=false;button.innerHTML=old}
      }
    };

    /* WhatsApp is an external app. Opening it or generating a PDF link does not
       prove delivery. The sender must explicitly confirm AFTER pressing Send there. */
    const list=document.getElementById('mtInvoiceList');
    if(list){
      const decorate=()=>{
        list.querySelectorAll('.mt-invoice-row').forEach(el=>{
          const id=el.querySelector('[data-wa-id]')?.dataset.waId;
          if(!id||el.querySelector('[data-confirm-wa-id]'))return;
          const row=(inv.rows||[]).find(r=>String(r.id)===String(id));
          if(!row||!isMine(inv,row)||!draft(row))return;
          const actions=el.querySelector('.mt-invoice-buttons,.svp-return-actions');
          if(!actions)return;
          const button=document.createElement('button');
          button.type='button';button.className='mt-action mt-confirm-wa-sent';
          button.dataset.confirmWaId=id;
          button.textContent='Konfirmasi WA terkirim';
          button.title='Klik hanya setelah pesan benar-benar dikirim dari WhatsApp';
          button.style.cssText='min-height:38px;padding:6px 10px;border-color:#97742c;background:#302711;color:#ffe5a1;white-space:normal;line-height:1.2';
          actions.appendChild(button);
        });
      };
      list.addEventListener('click',async event=>{
        const btn=event.target.closest('[data-confirm-wa-id]');
        if(!btn||busy)return;
        event.preventDefault();event.stopPropagation();
        const row=(inv.rows||[]).find(r=>String(r.id)===String(btn.dataset.confirmWaId));
        if(!row||!isMine(inv,row)||!draft(row))return;
        if(!confirm(`Pesan WhatsApp untuk ${row.invoice_no||'invoice ini'} sudah benar-benar Anda kirim?\nPilih OK hanya setelah menekan Kirim di WhatsApp.`))return;
        busy=true;btn.disabled=true;
        try{await confirmSent(inv,row,'whatsapp')}
        catch(error){alert(`Gagal menyimpan status SENT: ${error?.message||error}`);btn.disabled=false}
        finally{busy=false}
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
