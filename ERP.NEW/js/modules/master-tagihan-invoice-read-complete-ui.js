/* ERP VAX internal invoice lifecycle. Presentation + existing restricted invoice RPCs only.
 * No Cash Out, Arus Kas, payroll, payment, or database changes.
 */
'use strict';
(() => {
  const VIEW='../svp-invoice-internal.html';
  const roleOf=inv=>String(inv?.role||'').toLowerCase()==='spv'?'svp':String(inv?.role||'').toLowerCase();
  const sender=row=>['svp','spv'].includes(String(row?.sender_role||'').toLowerCase())?'svp':'owner';
  const isRecipient=(inv,row)=>roleOf(inv)!==sender(row)&&String(row.created_by)!==String(inv.user?.id);
  const dated=v=>v?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(v)):'—';
  const codeStyle=()=>{
    if(document.getElementById('mtInternalInvoiceStyle'))return;
    const style=document.createElement('style');style.id='mtInternalInvoiceStyle';
    style.textContent=`
      #mtInvoiceList .mt-internal-active{padding:12px;border-bottom:1px solid #273843}
      #mtInvoiceList .mt-internal-active>strong{display:block;color:#e9f5fc;font-size:12px;letter-spacing:.05em;margin:0 0 8px}
      #mtInvoiceList .mt-internal-empty{padding:12px;color:#92a9b8;font-size:12px}
      #mtInvoiceList .mt-internal-drafts{background:#0e171e;border-top:1px solid #273843}
      #mtInvoiceList .mt-internal-drafts summary{display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:12px 18px;color:#bad0dd;font-size:12px;font-weight:800}
      #mtInvoiceList .mt-internal-drafts summary::after{content:'⌄';color:#f0c454}
      #mtInvoiceList .mt-internal-drafts[open] summary::after{content:'⌃'}
      #mtInvoiceList .mt-internal-drafts .mt-invoice-row{margin:6px 12px 12px}
      @keyframes mtUnsentDraftAlert{0%,100%{background:#431a22;box-shadow:inset 0 0 0 1px rgba(255,89,99,.32),0 0 0 rgba(255,36,58,0)}50%{background:#c52032;box-shadow:inset 0 0 0 2px #ff8991,0 0 24px 5px rgba(255,47,68,.78)}}
      #mtInvoiceList .mt-internal-drafts.has-unsent summary{color:#fff!important;animation:mtUnsentDraftAlert 1.1s ease-in-out infinite!important}
      #mtInvoiceList .mt-internal-drafts.has-unsent summary::after{color:#fff}
      @media(prefers-reduced-motion:reduce){#mtInvoiceList .mt-internal-drafts.has-unsent summary{animation:none!important;background:#a72332!important;box-shadow:inset 0 0 0 2px #ff8991!important}}
      #mtInvoiceList .mt-internal-receipt{display:block;font-size:11px;color:#81a8bc;margin-top:4px;white-space:normal}
      #mtInvoiceList .mt-internal-receipt.done{color:#8be6b1}
      #mtInvoiceList .mt-internal-view{border-color:#347d9b!important;color:#adebff!important}
      #mtInvoiceList .mt-internal-view:hover{background:#16435a!important}
      #mtInvoiceList .mt-invoice-row .mt-ui-mail-added{display:none!important}
      #mtInvoiceList .mt-internal-history-row{opacity:.94}
      #mtInvoiceList .mt-internal-active .mt-invoice-row{margin:7px 0}
      #mtInvoiceList .mt-internal-active .mt-invoice-buttons{gap:8px!important}
      #mtInvoiceList .mt-internal-delivered{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:31px;height:31px;border-radius:9px;border:1px solid #286c49;background:#153b2a;color:#5ee39b;font-size:20px;font-weight:900;line-height:1;cursor:default}
      #mtInvoiceList .mt-internal-delivered:focus-visible{outline:2px solid #5ee39b;outline-offset:2px}
    `;document.head.appendChild(style);
  };
  // Extend the existing read-only bell on this page; never modify its shared engine.
  function installDraftNotification(){
    const notif=window.ERPGlobalNotifications;
    if(!notif||typeof notif.loadInvoices!=='function')return false;
    if(notif.__mtUnsentDraftNoticeInstalled)return true;
    const previous=notif.loadInvoices;
    notif.loadInvoices=async function(db){
      await previous.call(this,db);
      if(this.role!=='svp'||!this.user?.id)return;
      try{
        const {count,error}=await db.from('svp_invoices').select('id',{count:'exact',head:true})
          .eq('created_by',this.user.id).in('sender_role',['svp','spv']).eq('status','draft');
        if(error)throw error;
        if(count>0)this.add({key:'svp-own-unsent-invoices',tone:'urgent',icon:'▤',module:'INVOICE',
          href:'./master-tagihan.html?focus=invoice&draft=1',
          title:`${count} invoice belum terkirim`,detail:'Draft invoice SVP → Owner • buka untuk kirim via WhatsApp atau email'});
      }catch(error){console.warn('[Invoice] Gagal memuat notifikasi draft',error)}
    };
    notif.__mtUnsentDraftNoticeInstalled=true;
    return true;
  }
  function install(){
    const inv=window.SvPInvoice;
    if(!inv||!inv.__workflowV2||!inv.__svpOwnerReturnInstalled||!['owner','svp'].includes(roleOf(inv))||!inv.user)return false;
    if(inv.__readCompleteInstalled)return true;
    inv.__readCompleteInstalled=true;codeStyle();
    let lastDraftCount=-1;
    const render=function(){
      const root=document.getElementById('mtInvoiceList');if(!root)return;
      const rows=this.rows||[],me=String(this.user?.id||'');
      const mine=row=>sender(row)===roleOf(this)&&String(row.created_by)===me;
      const draft=rows.filter(r=>String(r.status||'').toLowerCase()==='draft'&&mine(r));
      // 'sent' is a delivery state, not a completed/paid state. Group it in history for a compact page.
      const archived=rows.filter(r=>['sent','completed','paid'].includes(String(r.status||'').toLowerCase())&&(mine(r)||isRecipient(this,r)));
      const rowHtml=(r,archive=false)=>{
        const st=String(r.status||'draft').toLowerCase();
        const dir=sender(r)==='owner'?'OWNER → SVP':'SVP → OWNER';
        const done=st==='completed';
        const receipt=done?`Selesai ${dated(r.completed_at)}`:st==='sent'?'Terkirim · menunggu penyelesaian':'';
        const url=`${VIEW}?id=${encodeURIComponent(r.id)}`;
        const view=`<a class="mt-action mt-internal-view" href="${url}" target="_blank" rel="noopener noreferrer" title="Buka detail invoice">Lihat</a>`;
        const draftActions=mine(r)&&st==='draft'?`<button class="mt-action" data-inv-action="edit" data-id="${r.id}">Edit</button><button class="mt-action" data-inv-action="send" data-id="${r.id}">Kirim Email</button>`:'';
        const delivery=st==='sent'?'<span class="mt-internal-delivered" role="img" aria-label="Terkirim" title="Terkirim">✓</span>':'';
        const wa=mine(r)?`<button class="mt-action mt-action-wa" data-wa-id="${r.id}">WhatsApp</button>`:'';
        return `<div class="mt-invoice-row ${archive?'mt-internal-history-row':''}"><div><div class="mt-invoice-no">${this.esc(r.invoice_no)}</div><small>${dir} · ${this.esc(r.title||'INVOICE')}</small></div><div>${this.esc(r.invoice_date||'')}</div><div class="mt-invoice-total">${this.rp(r.total)}</div><div class="mt-internal-status-cell">${receipt?`<small class="mt-internal-receipt ${done?'done':''}">${this.esc(receipt)}</small>`:''}</div><div class="mt-invoice-buttons">${draftActions}${delivery}${view}${wa}<button class="mt-action" data-inv-action="print" data-id="${r.id}">Print</button></div></div>`;
      };
      root.innerHTML=`<details class="mt-internal-drafts ${draft.length?'has-unsent':''}"><summary>Draft invoice · belum dikirim (${draft.length})</summary>${draft.length?draft.map(r=>rowHtml(r)).join(''):'<div class="mt-internal-empty">Tidak ada draft.</div>'}</details><div class="mt-invoice-history"><button type="button" class="mt-invoice-history-toggle" data-history-toggle><span>Riwayat Invoice</span><b>${archived.length}</b><i>${this.historyOpen?'▲':'▼'}</i></button><div class="mt-invoice-history-list" ${this.historyOpen?'':'hidden'}>${archived.map(r=>rowHtml(r,true)).join('')||'<div class="mt-internal-empty">Belum ada invoice terkirim.</div>'}</div></div>`;
      if(new URLSearchParams(location.search).get('draft')==='1'){
        const panel=root.querySelector('.mt-internal-drafts');
        if(panel){panel.open=true;setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'center'}),100)}
      }
      if(installDraftNotification()&&lastDraftCount!==draft.length){
        lastDraftCount=draft.length;
        setTimeout(()=>window.ERPGlobalNotifications?.refresh?.(),450);
      }
    };
    inv.render=render;
    inv.render();
    let lastFocus=0;
    window.addEventListener('focus',()=>{
      if(Date.now()-lastFocus<600)return;lastFocus=Date.now();
      if(document.visibilityState==='visible')inv.reload().catch(e=>console.warn('[Invoice internal] Gagal refresh',e));
    });
    return true;
  }
  let attempts=0;const timer=setInterval(()=>{if(install()||++attempts>180)clearInterval(timer)},100);
  window.addEventListener('load',()=>setTimeout(install,700));
})();
