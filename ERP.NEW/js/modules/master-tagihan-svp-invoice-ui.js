/* ERP VAX — Invoice SVP premium UI/workflow layer. Additive only. No locked engine mutation. */
"use strict";
(() => {
  const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const WEEK=['MIN','SEN','SEL','RAB','KAM','JUM','SAB'];
  const pad=n=>String(n).padStart(2,'0');
  const iso=(y,m,d)=>`${y}-${pad(m+1)}-${pad(d)}`;
  const parse=v=>{if(!v)return null;const [y,m,d]=String(v).split('-').map(Number);return y&&m&&d?new Date(y,m-1,d):null};
  const label=v=>{const d=parse(v);return d?`${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`:''};

  function installWorkflowStyle(){
    if(document.getElementById('mtInvoiceWorkflowStyle'))return;
    const s=document.createElement('style');s.id='mtInvoiceWorkflowStyle';
    s.textContent=`.mt-invoice-history{border-top:1px solid #263440;background:#0d151b}.mt-invoice-history-toggle{width:100%;appearance:none;border:0;background:linear-gradient(180deg,#14212b,#101a22);color:#b8c8d4;padding:11px 18px;display:flex;align-items:center;gap:9px;cursor:pointer;font:inherit;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.mt-invoice-history-toggle:hover{background:linear-gradient(180deg,#182a36,#12212a);color:#dcebf4}.mt-invoice-history-toggle b{min-width:24px;height:20px;padding:0 7px;border-radius:999px;background:#17394b;color:#9bdef8;display:inline-flex;align-items:center;justify-content:center}.mt-invoice-history-toggle i{margin-left:auto;font-style:normal;color:#6f8798}.mt-invoice-history-list[hidden]{display:none}.mt-invoice-history-row{background:#0d141a;opacity:.94}.mt-invoice-history-row:hover{background:#111c24}.mt-invoice-status.sent{background:#173548;color:#84d8ff}.mt-invoice-status.paid{background:#173a2b;color:#74e7a5}.mt-action-paid{border-color:#2d7651!important;color:#8ce7b1!important;background:#113222!important}.mt-action-paid:hover{background:#17452d!important;box-shadow:0 0 14px rgba(71,190,124,.14)}.mt-invoice-active-row{background:linear-gradient(90deg,rgba(39,117,149,.05),transparent 55%)};`;
    document.head.appendChild(s);
  }

  function relocateInvoiceCard(){
    const card=document.getElementById('mtInvoiceCard');
    const masterCard=document.querySelector('.mt-shell > .mt-card');
    if(!card||!masterCard)return false;
    if(card.nextElementSibling!==masterCard)masterCard.insertAdjacentElement('beforebegin',card);
    return true;
  }

  function enhanceDate(input){
    if(!input || input.dataset.premiumDate==='1')return;
    input.dataset.premiumDate='1';input.type='hidden';
    const wrap=document.createElement('div');wrap.className='mt-invoice-date-wrap';
    const trigger=document.createElement('button');trigger.type='button';trigger.className='mt-invoice-date-trigger';trigger.innerHTML='<span class="value placeholder">Pilih tanggal</span><span class="icon">▦</span>';
    const cal=document.createElement('div');cal.className='mt-invoice-calendar';cal.hidden=true;wrap.append(trigger,cal);input.insertAdjacentElement('afterend',wrap);
    let cursor=parse(input.value)||new Date();
    const sync=()=>{const val=trigger.querySelector('.value');val.textContent=input.value?label(input.value):'Pilih tanggal';val.classList.toggle('placeholder',!input.value)};
    const render=()=>{const y=cursor.getFullYear(),m=cursor.getMonth(),first=new Date(y,m,1),start=first.getDay(),days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate(),selected=parse(input.value),today=new Date();let cells='';for(let i=0;i<42;i++){let cy=y,cm=m,day=i-start+1,muted=false;if(day<1){cm=m-1;if(cm<0){cm=11;cy--}day=prevDays+day;muted=true}else if(day>days){day-=days;cm=m+1;if(cm>11){cm=0;cy++}muted=true}const value=iso(cy,cm,day),isSel=selected&&selected.getFullYear()===cy&&selected.getMonth()===cm&&selected.getDate()===day,isToday=today.getFullYear()===cy&&today.getMonth()===cm&&today.getDate()===day;cells+=`<button type="button" class="mt-invoice-cal-day${muted?' is-muted':''}${isSel?' is-selected':''}${isToday?' is-today':''}" data-date="${value}">${day}</button>`}cal.innerHTML=`<div class="mt-invoice-cal-head"><button type="button" class="mt-invoice-cal-nav" data-prev>‹</button><div class="mt-invoice-cal-title">${MONTHS[m]} ${y}</div><button type="button" class="mt-invoice-cal-nav" data-next>›</button></div><div class="mt-invoice-cal-week">${WEEK.map(x=>`<span>${x}</span>`).join('')}</div><div class="mt-invoice-cal-grid">${cells}</div>${input.id==='invDue'?'<button type="button" class="mt-invoice-cal-clear" data-clear>Tanpa jatuh tempo</button>':''}`};
    const close=()=>{cal.hidden=true;trigger.setAttribute('aria-expanded','false')};trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
    trigger.addEventListener('click',()=>{document.querySelectorAll('.mt-invoice-calendar').forEach(x=>{if(x!==cal)x.hidden=true});cursor=parse(input.value)||new Date();render();cal.hidden=!cal.hidden;trigger.setAttribute('aria-expanded',String(!cal.hidden))});
    cal.addEventListener('click',e=>{const prev=e.target.closest('[data-prev]'),next=e.target.closest('[data-next]'),day=e.target.closest('[data-date]'),clear=e.target.closest('[data-clear]');if(prev){cursor=new Date(cursor.getFullYear(),cursor.getMonth()-1,1);render();return}if(next){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);render();return}if(clear){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));sync();close();return}if(day){input.value=day.dataset.date;input.dispatchEvent(new Event('change',{bubbles:true}));sync();close()}});
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))close()});new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['value']});input.addEventListener('change',sync);sync();
  }

  function installWorkflow(){
    const inv=window.SvPInvoice;if(!inv||inv.__workflowV2)return false;inv.__workflowV2=true;inv.historyOpen=false;installWorkflowStyle();
    const originalOpen=inv.open.bind(inv);
    inv.open=async function(row=null){if(!row){const draft=(this.rows||[]).find(r=>String(r.status||'draft').toLowerCase()==='draft');if(draft)row=draft}return originalOpen(row)};
    inv.markPaid=async function(id,btn){if(!this.isOwner())return;if(!confirm('Tandai invoice ini sebagai SUDAH DIBAYAR?'))return;const old=btn?.textContent||'';if(btn){btn.disabled=true;btn.textContent='Menyimpan...'}try{const payload={status:'paid',paid_at:new Date().toISOString(),paid_by:this.user.id,updated_by:this.user.id,updated_at:new Date().toISOString()};const {error}=await db.from('svp_invoices').update(payload).eq('id',id).eq('status','sent');if(error)throw error;await this.reload()}catch(e){alert(`Gagal tandai dibayar: ${e?.message||e}`)}finally{if(btn){btn.disabled=false;btn.textContent=old}}};
    inv.render=function(){const el=document.getElementById('mtInvoiceList');if(!el)return;const rows=this.rows||[],draft=rows.find(r=>String(r.status||'draft').toLowerCase()==='draft')||null,history=rows.filter(r=>String(r.status||'draft').toLowerCase()!=='draft');const activeHtml=draft?`<div class="mt-invoice-row mt-invoice-active-row"><div><div class="mt-invoice-no">${this.esc(draft.invoice_no)}</div><small>${this.esc(draft.title||'INVOICE SVP')}</small></div><div>${this.esc(draft.invoice_date||'')}</div><div class="mt-invoice-total">${this.rp(draft.total)}</div><div><span class="mt-invoice-status draft">DRAFT</span></div><div class="mt-invoice-buttons">${this.isOwner()?`<button class="mt-action" data-inv-action="edit" data-id="${draft.id}">Edit</button><button class="mt-action" data-inv-action="send" data-id="${draft.id}">Send Email</button>`:''}<button class="mt-action" data-inv-action="print" data-id="${draft.id}">Print</button></div></div>`:'<div class="mt-invoice-empty">Tidak ada draft aktif. Klik <b>Buat Invoice SVP</b> untuk membuat invoice baru.</div>';const historyRows=history.map(r=>{const st=String(r.status||'sent').toLowerCase();return `<div class="mt-invoice-row mt-invoice-history-row"><div><div class="mt-invoice-no">${this.esc(r.invoice_no)}</div><small>${this.esc(r.title||'INVOICE SVP')}</small></div><div>${this.esc(r.invoice_date||'')}</div><div class="mt-invoice-total">${this.rp(r.total)}</div><div><span class="mt-invoice-status ${st==='paid'?'paid':'sent'}">${st==='paid'?'PAID':'SENT'}</span></div><div class="mt-invoice-buttons">${this.isOwner()&&st==='sent'?`<button class="mt-action mt-action-paid" data-paid-id="${r.id}">Tandai Dibayar</button>`:''}<button class="mt-action" data-inv-action="print" data-id="${r.id}">Print</button></div></div>`}).join('');el.innerHTML=`<div class="mt-invoice-active">${activeHtml}</div>${history.length?`<div class="mt-invoice-history"><button type="button" class="mt-invoice-history-toggle" data-history-toggle><span>Riwayat Invoice</span><b>${history.length}</b><i>${this.historyOpen?'▲':'▼'}</i></button><div class="mt-invoice-history-list" ${this.historyOpen?'':'hidden'}>${historyRows}</div></div>`:''}`};
    document.getElementById('mtInvoiceList')?.addEventListener('click',e=>{const paid=e.target.closest('[data-paid-id]');if(paid){e.preventDefault();e.stopPropagation();inv.markPaid(paid.dataset.paidId,paid);return}const toggle=e.target.closest('[data-history-toggle]');if(toggle){e.preventDefault();inv.historyOpen=!inv.historyOpen;inv.render()}});inv.render();return true;
  }

  function boot(){relocateInvoiceCard();const modal=document.getElementById('mtInvoiceModal');if(modal){enhanceDate(document.getElementById('invDate'));enhanceDate(document.getElementById('invDue'))}installWorkflow();relocateInvoiceCard();return !!modal&&!!window.SvPInvoice}
  let tries=0;const t=setInterval(()=>{if(boot()||++tries>40)clearInterval(t)},150);window.addEventListener('load',()=>setTimeout(boot,900));
})();
