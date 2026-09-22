/* UI ONLY: one selectable fine-review view; preserve original nodes, handlers, and finance logic. */
(() => {
  'use strict';
  if (window.__vaxAbsensiFineAccordion) return;
  window.__vaxAbsensiFineAccordion = true;
  const $ = id => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = `
    #vaxDendaReview{background:linear-gradient(145deg,#141b23,#0d131a 75%)}
    #vaxDendaReview .vax-fine-accordion-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    #vaxDendaReview .vax-fine-accordion-toggle{display:inline-flex;align-items:center;gap:8px;border:1px solid #665333;background:#272b2a;color:#f5d17d;border-radius:9px;padding:8px 12px;cursor:pointer;font:inherit;font-size:13px;font-weight:800}
    #vaxDendaReview .vax-fine-accordion-toggle:hover,#vaxDendaReview .vax-fine-accordion-toggle:focus-visible{border-color:#e0b956;outline-offset:2px}
    #vaxDendaReview .vax-fine-accordion-metrics{font-size:13px;color:#cdd6df;line-height:1.35;margin:3px 0 0}
    #vaxDendaReview .vax-fine-accordion-content[hidden],#vaxDendaReview .vax-fine-view[hidden]{display:none!important}
    #vaxDendaReview .vax-fine-choice{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0}
    #vaxDendaReview .vax-fine-choice label{font-size:12px;font-weight:800;color:#eac36f}
    #vaxDendaReview .vax-fine-choice select{min-width:250px;max-width:100%;padding:10px 34px 10px 12px;background:#17212a;color:#f5f5f5;border:1px solid #796136;border-radius:9px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
    #vaxDendaReview .vax-fine-choice select:focus-visible{outline:2px solid #d9ac40;outline-offset:2px}
    #vaxDendaReview .vax-fine-view{border-top:1px solid #354251;padding-top:9px}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory{border-top:0!important;margin-top:0!important;padding-top:0!important}
    #vaxDendaReview .vax-denda-heading>div>small,#vaxDendaReview .vax-denda-heading>div>p{display:none!important}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox>div:first-child p,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory>p,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory .vax-denda-receipt-head p{display:none!important}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox h3,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory h3,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory h3{font-size:16px!important}
    @media(max-width:650px){#vaxDendaReview .vax-fine-accordion-top{width:100%}#vaxDendaReview .vax-fine-choice select{width:100%;min-width:0}}
  `;
  document.head.appendChild(css);
  const format = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const remaining = text => [...String(text || '').matchAll(/Piutang tersisa\s*Rp\s*([\d.,]+)/gi)].reduce((s,m)=>s+(Number(m[1].replace(/\D/g,''))||0),0);
  function start(panel){
    if(panel.dataset.vaxFineAccordion === '2')return;
    const heading=panel.querySelector('.vax-denda-heading'),notice=$('vaxDendaNotice'),rows=$('vaxDendaRows');
    if(!heading||!notice||!rows)return;
    panel.dataset.vaxFineAccordion='2';
    const title=heading.querySelector('h2');if(title)title.textContent='Denda Keterlambatan';
    const metrics=document.createElement('p');metrics.className='vax-fine-accordion-metrics';
    title?.insertAdjacentElement('afterend',metrics);
    const updateMetrics=()=>{const count=(notice.textContent.match(/\d+\s+menunggu keputusan/)||['0 menunggu keputusan'])[0].replace('menunggu keputusan','perlu keputusan');metrics.textContent=`${count} · ${format(remaining(rows.textContent))} belum dibayar`;};
    new MutationObserver(updateMetrics).observe(notice,{childList:true,characterData:true,subtree:true});
    new MutationObserver(updateMetrics).observe(rows,{childList:true,characterData:true,subtree:true});
    updateMetrics();
    const body=document.createElement('div');body.id='vaxFineAccordionBody';body.className='vax-fine-accordion-content';body.hidden=true;
    heading.insertAdjacentElement('afterend',body);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='vax-fine-accordion-toggle';toggle.setAttribute('aria-controls',body.id);toggle.setAttribute('aria-expanded','false');toggle.textContent='Lihat rincian ▾';
    toggle.addEventListener('click',()=>{const opened=body.hidden;body.hidden=!opened;toggle.setAttribute('aria-expanded',String(opened));toggle.textContent=opened?'Tutup rincian ▴':'Lihat rincian ▾';});
    const top=document.createElement('div');top.className='vax-fine-accordion-top';top.append(toggle);
    const refresh=$('vaxDendaRefresh');refresh?refresh.before(top):heading.append(top);
    const chooser=document.createElement('div');chooser.className='vax-fine-choice';
    const label=document.createElement('label');label.htmlFor='vaxFineViewSelect';label.textContent='Tampilkan';
    const select=document.createElement('select');select.id='vaxFineViewSelect';
    const definitions=[['decision','Perlu Diputuskan','vaxDendaRows'],['late','Izin Telat Masuk','vaxLateNoticeInbox'],['history','Riwayat Keputusan Denda','vaxFineDecisionHistory'],['receipt','Denda Sudah Diterima','vaxDendaReceiptHistory']];
    for(const [value,name] of definitions){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}
    chooser.append(label,select);body.append(chooser);
    const views=new Map();
    const decision=document.createElement('section');decision.className='vax-fine-view';decision.id='vaxFineViewDecision';decision.append(notice,rows);body.append(decision);views.set('decision',decision);
    const mountSections=()=>{for(const [key,,id] of definitions.slice(1)){
      if(views.has(key))continue;
      const node=$(id);if(!node)continue;
      const section=document.createElement('section');section.className='vax-fine-view';section.id='vaxFineView'+key;
      section.append(node);body.append(section);views.set(key,section);
    }showSelected();};
    const showSelected=()=>{for(const [key,node] of views)node.hidden=key!==select.value;};
    select.addEventListener('change',showSelected);
    mountSections();
    // Other existing UI modules insert their own sections asynchronously; only move their presentation nodes.
    new MutationObserver(mountSections).observe(panel,{childList:true});
  }
  function boot(){const existing=$('vaxDendaReview');if(existing){start(existing);return;}
    const observer=new MutationObserver(()=>{const panel=$('vaxDendaReview');if(panel){observer.disconnect();start(panel);}});
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
