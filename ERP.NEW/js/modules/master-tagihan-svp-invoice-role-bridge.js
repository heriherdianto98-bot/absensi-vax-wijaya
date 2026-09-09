/* ERP VAX — additive SVP -> Owner invoice role bridge. Owner flow remains untouched. */
"use strict";
(() => {
  const SEND_OWNER_API='https://erp.vaxwijaya.com/api/svp-invoice/send-owner';
  const roleOf=inv=>String(inv?.role||'').toLowerCase();
  const isSvp=inv=>['svp','spv'].includes(roleOf(inv));

  function ensureSvpActionStyles(){
    if(document.getElementById('svpInvoiceActionPolish'))return;
    const s=document.createElement('style');
    s.id='svpInvoiceActionPolish';
    s.textContent=`
      .svp-return-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:nowrap}
      .svp-return-actions .mt-action{min-height:40px;padding:8px 13px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;line-height:1;white-space:nowrap;font-weight:900;letter-spacing:.01em;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease,background .16s ease}
      .svp-return-actions .svp-action-icon{width:23px;height:23px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 23px;border-radius:8px;font-size:14px;line-height:1;font-weight:900;box-shadow:inset 0 1px 0 rgba(255,255,255,.58),inset 0 -2px 4px rgba(0,0,0,.2),0 3px 7px rgba(0,0,0,.32);text-shadow:0 1px 1px rgba(0,0,0,.35)}
      .svp-return-actions .mt-action-email{border-color:#2d8fc7;background:linear-gradient(180deg,#164b6b 0%,#103752 52%,#0b293d 100%);color:#f4fbff;box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 5px 13px rgba(0,94,148,.22)}
      .svp-return-actions .mt-action-email .svp-action-icon{color:#05263a;background:linear-gradient(145deg,#bff1ff 0%,#57c9ff 48%,#209bd8 100%);border:1px solid #8addff;box-shadow:inset 0 1px 1px rgba(255,255,255,.8),inset 0 -3px 5px rgba(0,80,130,.2),0 3px 8px rgba(22,164,226,.38),0 0 0 1px rgba(25,129,183,.25)}
      .svp-return-actions .mt-action-email:hover{transform:translateY(-1px);border-color:#64c9ff;background:linear-gradient(180deg,#1d6087,#124766 55%,#0d334a);box-shadow:0 8px 18px rgba(0,125,188,.32),0 0 0 2px rgba(69,184,239,.1)}
      .svp-return-actions .mt-action-print{border-color:#a47a20;background:linear-gradient(180deg,#4b3a15 0%,#35280e 54%,#261d0b 100%);color:#fff2c7;box-shadow:inset 0 1px 0 rgba(255,239,176,.12),0 5px 13px rgba(92,62,4,.25)}
      .svp-return-actions .mt-action-print .svp-action-icon{color:#3a2600;background:linear-gradient(145deg,#fff0a6 0%,#f0c94e 48%,#c39017 100%);border:1px solid #f7dd73;box-shadow:inset 0 1px 1px rgba(255,255,255,.78),inset 0 -3px 5px rgba(119,78,0,.22),0 3px 8px rgba(211,160,30,.38),0 0 0 1px rgba(160,111,10,.28)}
      .svp-return-actions .mt-action-print:hover{transform:translateY(-1px);border-color:#e2b73f;background:linear-gradient(180deg,#624b1a,#49360f 55%,#312309);box-shadow:0 8px 18px rgba(157,111,14,.3),0 0 0 2px rgba(226,183,63,.1)}
      .svp-return-actions .mt-action-wa{min-height:40px!important;padding:8px 13px!important;gap:8px!important;border-color:#2bdd73!important;background:linear-gradient(180deg,#168f49 0%,#0f7339 54%,#0b562c 100%)!important;color:#f5fff8!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 5px 13px rgba(10,114,55,.28)!important}
      .svp-return-actions .mt-action-wa::before{width:23px!important;height:23px!important;flex-basis:23px!important;background-size:17px 17px!important;border:1px solid #cbffdd!important;background-color:#f2fff6!important;box-shadow:inset 0 1px 1px rgba(255,255,255,.9),inset 0 -3px 5px rgba(0,122,55,.12),0 3px 8px rgba(27,206,93,.4),0 0 0 1px rgba(34,197,94,.24)!important}
      .svp-return-actions .mt-action-wa:hover{transform:translateY(-1px)!important;border-color:#65f39a!important;background:linear-gradient(180deg,#1baa58,#128746 55%,#0d6534)!important;box-shadow:0 8px 18px rgba(22,161,77,.34),0 0 0 2px rgba(55,226,116,.1)!important}
      .svp-return-actions .mt-action:active{transform:translateY(0)}
      @media(max-width:900px){.svp-return-actions{flex-wrap:wrap}.svp-return-actions .mt-action{min-height:38px}}
    `;
    document.head.appendChild(s);
  }

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

  function emailButton(id,label='Send Email'){
    return `<button class="mt-action mt-action-email" data-inv-action="send" data-id="${id}"><span class="svp-action-icon" aria-hidden="true">✉</span><span>${label}</span></button>`;
  }
  function printButton(id){
    return `<button class="mt-action mt-action-print" data-inv-action="print" data-id="${id}"><span class="svp-action-icon" aria-hidden="true">▣</span><span>Print</span></button>`;
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
    ensureSvpActionStyles();
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
      btn.disabled=true;const old=btn.innerHTML;btn.textContent='Sending...';
      try{
        const {data:s}=await db.auth.getSession();const token=s?.session?.access_token;if(!token)throw new Error('Sesi tidak ditemukan');
        const res=await fetch(SEND_OWNER_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({invoice_id:id})});
        const out=await res.json().catch(()=>({}));if(!res.ok)throw new Error(out.error||`HTTP ${res.status}`);
        alert(`Invoice terkirim ke email Owner: ${out.to||''}`);await this.reload();
      }catch(e){alert(`Gagal kirim invoice: ${e?.message||e}`)}finally{btn.disabled=false;btn.innerHTML=old}
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
      const activeHtml=draft?`<div class="mt-invoice-row mt-invoice-active-row"><div><div class="mt-invoice-no">${this.esc(draft.invoice_no)}</div><small>SVP → OWNER • ${this.esc(draft.title||'INVOICE SVP')}</small></div><div>${this.esc(draft.invoice_date||'')}</div><div class="mt-invoice-total">${this.rp(draft.total)}</div><div><span class="mt-invoice-status draft">DRAFT</span></div><div class="mt-invoice-buttons svp-return-actions"><button class="mt-action" data-inv-action="edit" data-id="${draft.id}">Edit</button>${emailButton(draft.id)}<button class="mt-action mt-action-wa" data-wa-id="${draft.id}">WhatsApp</button>${printButton(draft.id)}</div></div>`:'<div class="mt-invoice-empty">Tidak ada draft SVP aktif. Klik <b>Buat Invoice Owner</b> untuk membuat invoice baru.</div>';
      const historyRows=history.map(r=>{const st=String(r.status||'draft').toLowerCase(),own=mine(r),direction=own?'SVP → OWNER':'OWNER → SVP';return `<div class="mt-invoice-row mt-invoice-history-row"><div><div class="mt-invoice-no">${this.esc(r.invoice_no)}</div><small>${direction} • ${this.esc(r.title||'INVOICE SVP')}</small></div><div>${this.esc(r.invoice_date||'')}</div><div class="mt-invoice-total">${this.rp(r.total)}</div><div><span class="mt-invoice-status ${st==='paid'?'paid':st==='draft'?'draft':'sent'}">${st.toUpperCase()}</span></div><div class="mt-invoice-buttons svp-return-actions">${own&&st==='draft'?`<button class="mt-action" data-inv-action="edit" data-id="${r.id}">Edit</button>${emailButton(r.id)}`:own&&st==='sent'?emailButton(r.id,'Kirim Ulang Email'):''}${own?`<button class="mt-action mt-action-wa" data-wa-id="${r.id}">WhatsApp</button>`:''}${printButton(r.id)}</div></div>`}).join('');
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