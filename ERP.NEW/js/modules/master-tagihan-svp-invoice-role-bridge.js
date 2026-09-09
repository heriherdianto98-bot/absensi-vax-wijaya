/* ERP VAX — additive SVP -> Owner invoice role bridge. Owner flow remains untouched. */
"use strict";
(() => {
  const SEND_OWNER_API='https://erp.vaxwijaya.com/api/svp-invoice/send-owner';
  const roleOf=inv=>String(inv?.role||'').toLowerCase();
  const isSvp=inv=>['svp','spv'].includes(roleOf(inv));

  function ensureSaveButton(inv){
    if(!isSvp(inv))return;
    const actions=document.querySelector('#mtInvoiceForm .mt-invoice-form-actions');
    if(!actions||actions.querySelector('[data-svp-save]'))return;
    const b=document.createElement('button');
    b.type='submit';
    b.className='mt-btn mt-btn-primary';
    b.dataset.svpSave='1';
    b.textContent='Simpan Invoice';
    actions.appendChild(b);
  }

  function applySvpLabels(inv){
    if(!isSvp(inv))return;
    const head=document.querySelector('#mtInvoiceCard .mt-invoice-head strong');
    if(head)head.textContent='INVOICE OWNER ↔ SVP';
    const topBtn=document.querySelector('.mt-invoice-top-btn');
    if(topBtn)topBtn.innerHTML='<span aria-hidden="true">▤</span> Buat Invoice Owner';
    const modalTitle=document.getElementById('mtInvoiceTitle');
    if(modalTitle && !document.getElementById('mtInvoiceModal')?.hidden)modalTitle.textContent='Buat Invoice Owner';
    ensureSaveButton(inv);
  }

  function install(){
    const inv=window.SvPInvoice;
    if(!inv||!inv.__workflowV2)return false;

    /* Wait until SvPInvoice.init() has actually resolved the authenticated role. */
    const role=roleOf(inv);
    if(!role)return false;

    if(inv.__svpOwnerReturnInstalled)return true;

    /* Owner flow is already HARD LOCKED. Do not override anything for Owner. */
    if(role==='owner'){
      inv.__svpOwnerReturnInstalled=true;
      return true;
    }
    if(!isSvp(inv)){
      inv.__svpOwnerReturnInstalled=true;
      return true;
    }

    inv.__svpOwnerReturnInstalled=true;
    inv.canManage=function(){return this.isOwner()||['svp','spv'].includes(roleOf(this))};

    applySvpLabels(inv);

    const originalOpen=inv.open.bind(inv);
    inv.open=async function(row=null){
      const out=await originalOpen(row);
      if(isSvp(this)){
        const title=document.getElementById('mtInvoiceTitle');
        if(title)title.textContent=row?'Edit Invoice Owner':'Buat Invoice Owner';
        ensureSaveButton(this);
      }
      return out;
    };

    inv.save=async function(){
      if(!isSvp(this))return;
      const msg=document.getElementById('invMsg'),items=this.collectItems();
      if(!items.length){msg.className='mt-invoice-msg mt-invoice-span2 err';msg.textContent='Minimal satu item invoice.';return}
      msg.className='mt-invoice-msg mt-invoice-span2';msg.textContent='Menyimpan...';
      const id=document.getElementById('invId').value;
      const payload={
        invoice_no:document.getElementById('invNo').value.trim(),
        invoice_date:document.getElementById('invDate').value,
        due_date:document.getElementById('invDue').value||null,
        title:document.getElementById('invTitle').value.trim(),
        notes:document.getElementById('invNotes').value.trim()||null,
        total:items.reduce((s,x)=>s+x.amount,0),
        sender_role:'svp',
        updated_by:this.user.id,
        updated_at:new Date().toISOString()
      };
      let invoiceId=id;
      try{
        if(id){
          const {error}=await db.from('svp_invoices').update(payload).eq('id',id).eq('created_by',this.user.id);if(error)throw error;
          const {error:de}=await db.from('svp_invoice_items').delete().eq('invoice_id',id);if(de)throw de;
        }else{
          payload.created_by=this.user.id;
          const {data,error}=await db.from('svp_invoices').insert(payload).select('id').single();if(error)throw error;invoiceId=data.id;
        }
        const {error:ie}=await db.from('svp_invoice_items').insert(items.map(x=>({...x,invoice_id:invoiceId})));if(ie)throw ie;
        msg.textContent='Invoice tersimpan.';await this.reload();setTimeout(()=>this.close(),350);
      }catch(e){msg.className='mt-invoice-msg mt-invoice-span2 err';msg.textContent=e?.message||String(e)}
    };

    inv.send=async function(id,btn){
      if(!isSvp(this))return;
      btn.disabled=true;const old=btn.textContent;btn.textContent='Sending...';
      try{
        const {data:s}=await db.auth.getSession();const token=s?.session?.access_token;if(!token)throw new Error('Sesi tidak ditemukan');
        const res=await fetch(SEND_OWNER_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({invoice_id:id})});
        const out=await res.json().catch(()=>({}));if(!res.ok)throw new Error(out.error||`HTTP ${res.status}`);
        alert(`Invoice terkirim ke email Owner: ${out.to||''}`);await this.reload();
      }catch(e){alert(`Gagal kirim invoice: ${e?.message||e}`)}finally{btn.disabled=false;btn.textContent=old}
    };

    const originalPreview=inv.preview.bind(inv);
    inv.preview=async function(){
      if(!isSvp(this))return originalPreview();
      const realOpen=window.open;let opened=null;
      window.open=(...a)=>{opened=realOpen(...a);return opened};
      try{await originalPreview()}finally{window.open=realOpen}
      const adapt=()=>{
        try{
          if(!opened||opened.closed)return;
          const d=opened.document;
          d.querySelector('.sign')?.remove();
          const vals=d.querySelectorAll('.meta .value');if(vals[1])vals[1].textContent='OWNER VAX WIJAYA';
          const note=d.querySelector('.note b');if(note)note.textContent='Catatan SVP:';
          const foot=d.querySelector('.foot');if(foot)foot.innerHTML=foot.innerHTML.replace('INVOICE OWNER → SVP','INVOICE SVP → OWNER');
        }catch{}
      };
      adapt();setTimeout(adapt,0);setTimeout(adapt,120);
    };

    inv.render=function(){
      const el=document.getElementById('mtInvoiceList');if(!el)return;
      const rows=this.rows||[];
      const mine=r=>['svp','spv'].includes(String(r.sender_role||'').toLowerCase())&&String(r.created_by||'')===String(this.user?.id||'');
      const draft=rows.find(r=>mine(r)&&String(r.status||'draft').toLowerCase()==='draft')||null;
      const history=rows.filter(r=>!draft||String(r.id)!==String(draft.id));
      const activeHtml=draft?`<div class="mt-invoice-row mt-invoice-active-row"><div><div class="mt-invoice-no">${this.esc(draft.invoice_no)}</div><small>SVP → OWNER • ${this.esc(draft.title||'INVOICE SVP')}</small></div><div>${this.esc(draft.invoice_date||'')}</div><div class="mt-invoice-total">${this.rp(draft.total)}</div><div><span class="mt-invoice-status draft">DRAFT</span></div><div class="mt-invoice-buttons"><button class="mt-action" data-inv-action="edit" data-id="${draft.id}">Edit</button><button class="mt-action" data-inv-action="send" data-id="${draft.id}">Send Email</button><button class="mt-action mt-action-wa" data-wa-id="${draft.id}">WhatsApp</button><button class="mt-action" data-inv-action="print" data-id="${draft.id}">Print</button></div></div>`:'<div class="mt-invoice-empty">Tidak ada draft SVP aktif. Klik <b>Buat Invoice Owner</b> untuk membuat invoice baru.</div>';
      const historyRows=history.map(r=>{const st=String(r.status||'draft').toLowerCase(),own=mine(r),direction=own?'SVP → OWNER':'OWNER → SVP';return `<div class="mt-invoice-row mt-invoice-history-row"><div><div class="mt-invoice-no">${this.esc(r.invoice_no)}</div><small>${direction} • ${this.esc(r.title||'INVOICE SVP')}</small></div><div>${this.esc(r.invoice_date||'')}</div><div class="mt-invoice-total">${this.rp(r.total)}</div><div><span class="mt-invoice-status ${st==='paid'?'paid':st==='draft'?'draft':'sent'}">${st.toUpperCase()}</span></div><div class="mt-invoice-buttons">${own&&st==='draft'?`<button class="mt-action" data-inv-action="edit" data-id="${r.id}">Edit</button><button class="mt-action" data-inv-action="send" data-id="${r.id}">Send Email</button>`:own&&st==='sent'?`<button class="mt-action" data-inv-action="send" data-id="${r.id}">Kirim Ulang Email</button>`:''}${own?`<button class="mt-action mt-action-wa" data-wa-id="${r.id}">WhatsApp</button>`:''}<button class="mt-action" data-inv-action="print" data-id="${r.id}">Print</button></div></div>`}).join('');
      el.innerHTML=`<div class="mt-invoice-active">${activeHtml}</div>${history.length?`<div class="mt-invoice-history"><button type="button" class="mt-invoice-history-toggle" data-history-toggle><span>Riwayat Invoice</span><b>${history.length}</b><i>${this.historyOpen?'▲':'▼'}</i></button><div class="mt-invoice-history-list" ${this.historyOpen?'':'hidden'}>${historyRows}</div></div>`:''}`;
    };

    inv.render();
    applySvpLabels(inv);
    return true;
  }

  let tries=0;
  const t=setInterval(()=>{if(install()||++tries>180)clearInterval(t)},100);
  window.addEventListener('load',()=>{setTimeout(install,900);setTimeout(install,1700);setTimeout(install,3000)});
})();
