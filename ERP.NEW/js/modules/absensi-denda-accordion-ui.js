/* UI ONLY: one selectable fine-review view; preserve original nodes, handlers, and finance logic. */
(() => {
  'use strict';
  if (window.__vaxAbsensiFineAccordion) return;
  window.__vaxAbsensiFineAccordion = true;
  const $ = id => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = `
    /* The attendance toolbar's charcoal surface, gold accent and subtle travelling orbit. */
    @property --vax-fine-orbit { syntax:'<angle>'; inherits:false; initial-value:0deg; }
    @keyframes vax-fine-orbit { to { --vax-fine-orbit:360deg; } }
    #vaxDendaReview{position:relative;isolation:isolate;background:linear-gradient(145deg,#1c222a 0%,#171c23 52%,#11171e 100%)!important;border:1px solid rgba(218,175,55,.65)!important;box-shadow:0 8px 26px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.045)!important}
    #vaxDendaReview::before{content:'';position:absolute;inset:-1px;z-index:0;border-radius:inherit;padding:2px;pointer-events:none;background:conic-gradient(from var(--vax-fine-orbit),transparent 0deg,transparent 275deg,rgba(236,191,73,.12) 302deg,#f1cd61 335deg,rgba(249,219,128,.9) 348deg,transparent 360deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;animation:vax-fine-orbit 8s linear infinite}
    #vaxDendaReview>.vax-denda-heading,#vaxDendaReview>.vax-fine-accordion-content{position:relative;z-index:1}
    #vaxDendaReview .vax-denda-heading{gap:12px}
    #vaxDendaReview .vax-denda-heading h2{font-size:19px;letter-spacing:.01em}
    #vaxDendaReview .vax-fine-accordion-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    #vaxDendaReview .vax-fine-accordion-toggle{display:inline-flex;align-items:center;gap:8px;border:1px solid #796331;background:linear-gradient(135deg,#373123,#242a2b);color:#f6d781;border-radius:10px;padding:9px 13px;cursor:pointer;font:inherit;font-size:13px;font-weight:800;box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
    #vaxDendaReview .vax-fine-accordion-toggle:hover,#vaxDendaReview .vax-fine-accordion-toggle:focus-visible{border-color:#e0b956;outline-offset:2px}
    #vaxDendaReview .vax-fine-accordion-metrics{font-size:12px;color:#d3dbe3;line-height:1.35;margin:3px 0 0}
    #vaxDendaReview .vax-fine-accordion-content[hidden],#vaxDendaReview .vax-fine-view[hidden]{display:none!important}
    #vaxDendaReview .vax-fine-choice{--vax-fine-color:#e7bb53;--vax-fine-tint:rgba(231,187,83,.12);display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0 11px}
    #vaxDendaReview .vax-fine-choice[data-fine-view="decision"]{--vax-fine-color:#f3c962;--vax-fine-tint:rgba(243,201,98,.12)}
    #vaxDendaReview .vax-fine-choice[data-fine-view="late"]{--vax-fine-color:#69d7e8;--vax-fine-tint:rgba(105,215,232,.12)}
    #vaxDendaReview .vax-fine-choice[data-fine-view="history"]{--vax-fine-color:#bb9bff;--vax-fine-tint:rgba(187,155,255,.12)}
    #vaxDendaReview .vax-fine-choice[data-fine-view="receipt"]{--vax-fine-color:#76dfae;--vax-fine-tint:rgba(118,223,174,.12)}
    #vaxDendaReview .vax-fine-choice label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:#dfbd69}
    #vaxDendaReview .vax-fine-choice-marker{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:9px;border:1px solid var(--vax-fine-color);background:var(--vax-fine-tint);color:var(--vax-fine-color);font-size:17px;font-weight:900;box-shadow:0 0 12px var(--vax-fine-tint)}
    #vaxDendaReview .vax-fine-choice select{min-width:254px;max-width:100%;padding:10px 34px 10px 12px;background-color:#1b222b;color:var(--vax-fine-color);border:1px solid var(--vax-fine-color);border-radius:10px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 0 0 3px var(--vax-fine-tint),inset 0 1px 0 rgba(255,255,255,.045);color-scheme:dark}
    #vaxDendaReview .vax-fine-choice select:focus-visible{outline:2px solid var(--vax-fine-color);outline-offset:3px}
    #vaxDendaReview .vax-fine-choice select option{background:#1b222b;color:#f3f5f7}
    #vaxDendaReview .vax-fine-choice select option[value="decision"]{color:#f3c962;background:#30291c}
    #vaxDendaReview .vax-fine-choice select option[value="late"]{color:#69d7e8;background:#182c33}
    #vaxDendaReview .vax-fine-choice select option[value="history"]{color:#bb9bff;background:#292337}
    #vaxDendaReview .vax-fine-choice select option[value="receipt"]{color:#76dfae;background:#1a302b}
    #vaxDendaReview .vax-fine-view{border-top:1px solid #354251;padding-top:9px}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory{border-top:0!important;margin-top:0!important;padding-top:0!important}
    #vaxDendaReview .vax-denda-heading>div>small,#vaxDendaReview .vax-denda-heading>div>p{display:none!important}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox>div:first-child p,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory>p,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory .vax-denda-receipt-head p{display:none!important}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox h3,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory h3,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory h3{font-size:16px!important}
    @media(max-width:650px){#vaxDendaReview .vax-fine-accordion-top{width:100%}#vaxDendaReview .vax-fine-choice select{width:100%;min-width:0}#vaxDendaReview .vax-fine-choice-marker{width:28px;height:28px}}
    @media(prefers-reduced-motion:reduce){#vaxDendaReview::before{animation:none;background:linear-gradient(120deg,transparent,#b99748,transparent)}}
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
    const marker=document.createElement('span');marker.className='vax-fine-choice-marker';marker.setAttribute('aria-hidden','true');
    const select=document.createElement('select');select.id='vaxFineViewSelect';
    const definitions=[['decision','Perlu Diputuskan','vaxDendaRows'],['late','Izin Telat Masuk','vaxLateNoticeInbox'],['history','Riwayat Keputusan Denda','vaxFineDecisionHistory'],['receipt','Denda Sudah Diterima','vaxDendaReceiptHistory']];
    for(const [value,name] of definitions){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}
    const symbols={decision:'!',late:'◷',history:'≡',receipt:'✓'};
    const syncTheme=()=>{chooser.dataset.fineView=select.value;marker.textContent=symbols[select.value]||'•';};
    chooser.append(label,marker,select);body.append(chooser);
    const views=new Map();
    const decision=document.createElement('section');decision.className='vax-fine-view';decision.id='vaxFineViewDecision';decision.append(notice,rows);body.append(decision);views.set('decision',decision);
    const mountSections=()=>{for(const [key,,id] of definitions.slice(1)){
      if(views.has(key))continue;
      const node=$(id);if(!node)continue;
      const section=document.createElement('section');section.className='vax-fine-view';section.id='vaxFineView'+key;
      section.append(node);body.append(section);views.set(key,section);
    }showSelected();};
    const showSelected=()=>{syncTheme();for(const [key,node] of views)node.hidden=key!==select.value;};
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
