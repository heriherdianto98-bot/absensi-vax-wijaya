/* ERP VAX — UI ONLY: compact invoice history and always-visible search.
   No invoice status, database, notification, or finance engine changes.
*/
'use strict';
(() => {
  const LIMIT=3,STYLE_ID='invoiceHistorySearchUiStyle';
  let query='',draftText='',applying=false;
  const norm=v=>String(v??'').toLocaleLowerCase('id-ID').trim().replace(/\s+/g,' ');
  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');s.id=STYLE_ID;
    s.textContent=`
      #mtInvoiceCard .mt-invoice-history{position:relative}
      #mtInvoiceCard .mt-invoice-history-toggle{position:relative;padding-right:52px;min-height:54px;gap:10px}
      #mtInvoiceCard .mt-invoice-history-toggle>span{font-size:15px!important;font-weight:900!important;letter-spacing:.035em!important}
      #mtInvoiceCard .mt-invoice-history-toggle>b{display:inline-flex!important;align-items:center;justify-content:center;min-width:29px!important;height:27px!important;padding:0 8px!important;border-radius:999px!important;font-size:14px!important;font-weight:900!important;line-height:1!important}
      #mtInvoiceCard .mt-invoice-history-search-ui{position:absolute;right:46px;top:9px;display:flex;align-items:center;justify-content:flex-end;gap:6px;z-index:6}
      #mtInvoiceCard .mt-invoice-history-search-btn{width:34px;height:34px;border-radius:10px;border:1px solid #2f6178;background:linear-gradient(180deg,#153246,#0e2432);color:#72d8ff;display:grid;place-items:center;cursor:pointer;font-size:16px;font-weight:900}
      #mtInvoiceCard .mt-invoice-history-search-btn:hover{border-color:#58bce5}
      #mtInvoiceCard .mt-invoice-history-search-input{width:230px;opacity:1;pointer-events:auto;height:34px;padding:0 11px;border-radius:10px;border:1px solid #315d72;background:#0d1821;color:#e8f7ff;outline:none;font:700 11px/1.2 'Source Sans 3',sans-serif}
      #mtInvoiceCard .mt-invoice-history-search-input:focus{border-color:#d0a749;box-shadow:0 0 0 2px rgba(208,167,73,.19)}
      #mtInvoiceCard .mt-invoice-history-search-input::placeholder{color:#94aaba;font-weight:600}
      #mtInvoiceCard .mt-invoice-history-search-clear{display:none;width:28px;height:28px;border:0;background:transparent;color:#91a8b4;cursor:pointer;font-size:17px}
      #mtInvoiceCard .mt-invoice-history-search-ui.has-query .mt-invoice-history-search-clear{display:grid;place-items:center}
      #mtInvoiceCard .mt-invoice-history-list>.mt-invoice-row[hidden]{display:none!important}
      #mtInvoiceCard .mt-invoice-history-search-result{padding:9px 14px 12px;color:#a8c4d2;font-size:12px;text-align:center}
      @media(max-width:900px){#mtInvoiceCard .mt-invoice-history-toggle{padding-right:52px}#mtInvoiceCard .mt-invoice-history-search-ui{position:relative;top:auto;right:auto;padding:6px 12px;justify-content:flex-start;background:#0d1821;border-bottom:1px solid #243945}#mtInvoiceCard .mt-invoice-history-search-input{width:100%;min-width:0;flex:1}}
    `;document.head.appendChild(s);
  }
  function parts(){
    const history=document.querySelector('#mtInvoiceList .mt-invoice-history');
    const list=history?.querySelector('.mt-invoice-history-list');
    const rows=list?[...list.querySelectorAll(':scope > .mt-invoice-row')]:[];
    return {history,list,rows};
  }
  function ensureSearch(history){
    if(!history)return;
    let shell=history.querySelector(':scope > .mt-invoice-history-search-ui');
    if(shell)return shell;
    const toggle=history.querySelector('[data-history-toggle],.mt-invoice-history-toggle');
    if(!toggle)return;
    shell=document.createElement('div');shell.className='mt-invoice-history-search-ui is-open';
    shell.innerHTML='<button type="button" class="mt-invoice-history-search-btn" data-invoice-search-toggle title="Fokus pencarian riwayat invoice" aria-label="Fokus pencarian riwayat invoice">⌕</button><input type="search" class="mt-invoice-history-search-input" data-invoice-search-input placeholder="Ketik lalu Enter untuk mencari..." aria-label="Cari seluruh riwayat invoice, tekan Enter" autocomplete="off"><button type="button" class="mt-invoice-history-search-clear" data-invoice-search-clear title="Hapus pencarian" aria-label="Hapus pencarian">×</button>';
    toggle.insertAdjacentElement('afterend',shell);
    const input=shell.querySelector('[data-invoice-search-input]');
    input.value=draftText;shell.classList.toggle('has-query',!!draftText);
    shell.querySelector('[data-invoice-search-toggle]').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();input.focus()});
    input.addEventListener('click',e=>e.stopPropagation());
    input.addEventListener('input',()=>{draftText=input.value;shell.classList.toggle('has-query',!!draftText);if(!draftText){query='';apply()}});
    input.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();e.stopPropagation();draftText=input.value;query=norm(draftText);apply();history.querySelector('.mt-invoice-history-list')?.removeAttribute('hidden')});
    shell.querySelector('[data-invoice-search-clear]').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();draftText='';query='';input.value='';shell.classList.remove('has-query');apply();input.focus()});
    return shell;
  }
  function apply(){
    if(applying)return;
    applying=true;
    try{
      const {history,list,rows}=parts();if(!history||!list)return;
      ensureSearch(history);
      list.querySelector('[data-invoice-history-more]')?.remove();
      let matches=0;
      for(const row of rows){
        const match=!query||norm(row.textContent).includes(query);
        row.hidden=!match||matches>=LIMIT;
        if(match)matches++;
      }
      let message=history.querySelector(':scope > .mt-invoice-history-search-result');
      if(!message){message=document.createElement('div');message.className='mt-invoice-history-search-result';history.appendChild(message)}
      const text=query?(matches===0?'Tidak ada invoice yang cocok.':matches>LIMIT?`Menampilkan ${LIMIT} dari ${matches} hasil. Perjelas kata kunci untuk menemukan invoice lainnya.`:`${matches} invoice ditemukan.`):'';
      if(message.textContent!==text)message.textContent=text;
      message.hidden=!text;
    }finally{applying=false}
  }
  function install(){
    const root=document.getElementById('mtInvoiceList');if(!root)return false;
    ensureStyle();
    if(window.__invoiceHistorySearchUiInstalled){apply();return true}
    window.__invoiceHistorySearchUiInstalled=true;
    let queued=false;
    new MutationObserver(()=>{
      if(queued||applying)return;
      queued=true;requestAnimationFrame(()=>{queued=false;apply()});
    }).observe(root,{childList:true,subtree:true});
    apply();return true;
  }
  let tries=0;const timer=setInterval(()=>{if(install()||++tries>180)clearInterval(timer)},100);
  window.addEventListener('load',()=>{setTimeout(install,700);setTimeout(apply,1400)});
})();
