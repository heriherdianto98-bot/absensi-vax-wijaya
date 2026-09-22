/* UI ONLY: attendance fine accordion. ASCII-only source prevents PowerShell encoding corruption. */
(() => {
  'use strict';
  if (window.__vaxAbsensiFineAccordion) return;
  window.__vaxAbsensiFineAccordion = true;
  const $ = id => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = `
    @property --vax-fine-orbit { syntax:'<angle>'; inherits:false; initial-value:0deg; }
    @keyframes vax-fine-orbit { to { --vax-fine-orbit:360deg; } }
    #vaxDendaReview{--vax-fine-color:#e8be5f;--vax-fine-tint:rgba(232,190,95,.12);--vax-fine-glow:rgba(232,190,95,.19);position:relative;isolation:isolate;background:linear-gradient(155deg,#212830 0%,#171d25 42%,#10161e 100%)!important;border:1px solid rgba(218,175,55,.65)!important;box-shadow:inset 1px 1px 0 rgba(255,255,255,.09),inset -2px -3px 8px rgba(0,0,0,.28),0 5px 0 #090d13,0 13px 26px rgba(0,0,0,.45)!important}
    #vaxDendaReview[data-fine-view="decision"]{--vax-fine-color:#f3c962;--vax-fine-tint:rgba(243,201,98,.12);--vax-fine-glow:rgba(243,201,98,.24)}
    #vaxDendaReview[data-fine-view="late"]{--vax-fine-color:#69d7e8;--vax-fine-tint:rgba(105,215,232,.13);--vax-fine-glow:rgba(105,215,232,.24)}
    #vaxDendaReview[data-fine-view="history"]{--vax-fine-color:#bb9bff;--vax-fine-tint:rgba(187,155,255,.13);--vax-fine-glow:rgba(187,155,255,.24)}
    #vaxDendaReview[data-fine-view="receipt"]{--vax-fine-color:#76dfae;--vax-fine-tint:rgba(118,223,174,.13);--vax-fine-glow:rgba(118,223,174,.24)}
    #vaxDendaReview::before{content:'';position:absolute;inset:-1px;z-index:0;border-radius:inherit;padding:2px;pointer-events:none;background:conic-gradient(from var(--vax-fine-orbit),transparent 0deg,transparent 275deg,rgba(236,191,73,.12) 302deg,#f1cd61 335deg,rgba(249,219,128,.9) 348deg,transparent 360deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;animation:vax-fine-orbit 8s linear infinite}
    #vaxDendaReview>.vax-denda-heading,#vaxDendaReview>.vax-fine-accordion-content{position:relative;z-index:1}
    #vaxDendaReview .vax-denda-heading{gap:12px}
    #vaxDendaReview .vax-denda-heading h2{font-size:19px;letter-spacing:.01em}
    #vaxDendaReview .vax-fine-accordion-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    #vaxDendaReview .vax-fine-accordion-toggle{display:inline-flex;align-items:center;gap:8px;border:1px solid #796331;background:linear-gradient(150deg,#413829,#252a30);color:#f6d781;border-radius:10px;padding:9px 13px;cursor:pointer;font:inherit;font-size:13px;font-weight:800;box-shadow:inset 1px 1px 0 rgba(255,255,255,.13),inset -1px -2px 4px rgba(0,0,0,.36),0 3px 0 #0a0d11,0 7px 13px rgba(0,0,0,.25)}
    #vaxDendaReview .vax-fine-accordion-toggle:hover,#vaxDendaReview .vax-fine-accordion-toggle:focus-visible{border-color:#e0b956;outline-offset:2px}
    #vaxDendaReview .vax-fine-accordion-metrics{font-size:12px;color:#d3dbe3;line-height:1.35;margin:3px 0 0}
    #vaxDendaReview .vax-fine-accordion-content[hidden],#vaxDendaReview .vax-fine-view[hidden]{display:none!important}
    #vaxDendaReview .vax-fine-choice{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0 13px}
    #vaxDendaReview .vax-fine-choice label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:#dfbd69}
    #vaxDendaReview .vax-fine-choice-marker{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:9px;border:1px solid #947940;background:linear-gradient(150deg,#49402e,#252a30);color:#f0cf7a;font-size:18px;font-weight:900;box-shadow:inset 1px 1px 0 rgba(255,255,255,.25),inset -2px -3px 5px rgba(0,0,0,.38),0 3px 0 #090c10,0 0 12px var(--vax-fine-glow);text-shadow:0 1px 0 rgba(255,255,255,.25),0 2px 2px #070b10,0 0 9px var(--vax-fine-glow)}
    #vaxDendaReview[data-fine-view="decision"] .vax-fine-choice-marker{color:#f3c962;border-color:#b79032;background:linear-gradient(145deg,#705a29,#30271b)}
    #vaxDendaReview[data-fine-view="late"] .vax-fine-choice-marker{color:#69d7e8;border-color:#3b98ad;background:linear-gradient(145deg,#27576a,#162a38)}
    #vaxDendaReview[data-fine-view="history"] .vax-fine-choice-marker{color:#bb9bff;border-color:#8e6ac7;background:linear-gradient(145deg,#50406d,#231c36)}
    #vaxDendaReview[data-fine-view="receipt"] .vax-fine-choice-marker{color:#76dfae;border-color:#3c9f73;background:linear-gradient(145deg,#295c45,#172f28)}
    #vaxDendaReview .vax-fine-choice select{min-width:254px;max-width:100%;padding:10px 34px 10px 12px;background:#202832!important;color:#f1f2f4!important;border:1px solid #927b4d!important;border-radius:10px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;box-shadow:inset 1px 1px 0 rgba(255,255,255,.09),inset -2px -3px 6px rgba(0,0,0,.3),0 3px 0 #090c11,0 7px 13px rgba(0,0,0,.27);color-scheme:dark}
    #vaxDendaReview .vax-fine-choice select:focus-visible{outline:2px solid #dab957;outline-offset:3px}
    #vaxDendaReview .vax-fine-choice select option,#vaxDendaReview .vax-fine-choice select option[value]{background:#202832!important;color:#f1f2f4!important}
    #vaxDendaReview .vax-fine-view{position:relative;isolation:isolate;overflow:hidden;border:1px solid var(--vax-fine-color)!important;border-radius:14px;padding:14px 15px 15px;margin-top:5px;background:linear-gradient(145deg,var(--vax-fine-tint) 0%,#1b242d 29%,#111922 100%)!important;box-shadow:inset 1px 1px 0 rgba(255,255,255,.14),inset -3px -4px 9px rgba(0,0,0,.35),0 4px 0 #080d13,0 12px 25px rgba(0,0,0,.4),0 0 18px var(--vax-fine-glow)!important}
    #vaxDendaReview .vax-fine-view::before{content:'';position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,transparent,var(--vax-fine-color),transparent);opacity:.9;pointer-events:none}
    #vaxDendaReview .vax-fine-view h3,#vaxDendaReview .vax-fine-view>h3{color:var(--vax-fine-color)!important;text-shadow:0 0 13px var(--vax-fine-glow)}
    #vaxDendaReview .vax-fine-view .vax-denda-row,#vaxDendaReview .vax-fine-view #vaxLateNoticeList article,#vaxDendaReview .vax-fine-view .vax-fine-history-row,#vaxDendaReview .vax-fine-view #vaxDendaReceiptList article{border:1px solid color-mix(in srgb,var(--vax-fine-color) 48%,#303e4c)!important;border-radius:11px;background:linear-gradient(145deg,#26313d,#19232d 72%,#151d26)!important;box-shadow:inset 1px 1px 0 rgba(255,255,255,.11),inset -2px -3px 5px rgba(0,0,0,.3),0 3px 0 #0a0e14,0 7px 14px rgba(0,0,0,.3)!important}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory{border-top:0!important;margin-top:0!important;padding-top:0!important}
    #vaxDendaReview .vax-denda-heading>div>small,#vaxDendaReview .vax-denda-heading>div>p{display:none!important}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox>div:first-child p,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory>p,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory .vax-denda-receipt-head p{display:none!important}
    #vaxDendaReview .vax-fine-view #vaxLateNoticeInbox h3,#vaxDendaReview .vax-fine-view #vaxFineDecisionHistory h3,#vaxDendaReview .vax-fine-view #vaxDendaReceiptHistory h3{font-size:16px!important}
    #vaxDendaReview .vax-fine-view button{box-shadow:inset 1px 1px 0 rgba(255,255,255,.1),0 3px 0 #0c1016,0 6px 12px rgba(0,0,0,.24)}
    @media(max-width:650px){#vaxDendaReview .vax-fine-accordion-top{width:100%}#vaxDendaReview .vax-fine-choice select{width:100%;min-width:0}#vaxDendaReview .vax-fine-choice-marker{width:32px;height:32px}#vaxDendaReview .vax-fine-view{padding:11px}}
    @media(prefers-reduced-motion:reduce){#vaxDendaReview::before{animation:none;background:linear-gradient(120deg,transparent,#b99748,transparent)}}
  `;
  document.head.appendChild(css);
  const format = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const remaining = text => [...String(text || '').matchAll(/Piutang tersisa\s*Rp\s*([\d.,]+)/gi)].reduce((s,m)=>s+(Number(m[1].replace(/\D/g,''))||0),0);
  function start(panel){
    if(panel.dataset.vaxFineAccordion === '2') return;
    const heading=panel.querySelector('.vax-denda-heading'),notice=$('vaxDendaNotice'),rows=$('vaxDendaRows');
    if(!heading||!notice||!rows)return;
    panel.dataset.vaxFineAccordion='2';
    const title=heading.querySelector('h2');if(title)title.textContent='Denda Keterlambatan';
    const metrics=document.createElement('p');metrics.className='vax-fine-accordion-metrics';
    title?.insertAdjacentElement('afterend',metrics);
    const updateMetrics=()=>{const count=(notice.textContent.match(/\d+\s+menunggu keputusan/)||['0 menunggu keputusan'])[0].replace('menunggu keputusan','perlu keputusan');metrics.textContent=`${count} \u00b7 ${format(remaining(rows.textContent))} belum dibayar`;};
    new MutationObserver(updateMetrics).observe(notice,{childList:true,characterData:true,subtree:true});
    new MutationObserver(updateMetrics).observe(rows,{childList:true,characterData:true,subtree:true});
    updateMetrics();
    const body=document.createElement('div');body.id='vaxFineAccordionBody';body.className='vax-fine-accordion-content';body.hidden=true;
    heading.insertAdjacentElement('afterend',body);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='vax-fine-accordion-toggle';toggle.setAttribute('aria-controls',body.id);toggle.setAttribute('aria-expanded','false');toggle.textContent='Lihat rincian \u25be';
    toggle.addEventListener('click',()=>{const opened=body.hidden;body.hidden=!opened;toggle.setAttribute('aria-expanded',String(opened));toggle.textContent=opened?'Tutup rincian \u25b4':'Lihat rincian \u25be';});
    const top=document.createElement('div');top.className='vax-fine-accordion-top';top.append(toggle);
    const refresh=$('vaxDendaRefresh');refresh?refresh.before(top):heading.append(top);
    const chooser=document.createElement('div');chooser.className='vax-fine-choice';
    const label=document.createElement('label');label.htmlFor='vaxFineViewSelect';label.textContent='Tampilkan';
    const marker=document.createElement('span');marker.className='vax-fine-choice-marker';marker.setAttribute('aria-hidden','true');
    const select=document.createElement('select');select.id='vaxFineViewSelect';
    const definitions=[['decision','Perlu Diputuskan','vaxDendaRows'],['late','Izin Telat Masuk','vaxLateNoticeInbox'],['history','Riwayat Keputusan Denda','vaxFineDecisionHistory'],['receipt','Denda Sudah Diterima','vaxDendaReceiptHistory']];
    for(const [value,name] of definitions){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}
    const symbols={decision:'!',late:'\u25f7',history:'\u2261',receipt:'\u2713'};
    const syncTheme=()=>{panel.dataset.fineView=select.value;marker.textContent=symbols[select.value]||'!';};
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
    new MutationObserver(mountSections).observe(panel,{childList:true});
  }
  function boot(){const existing=$('vaxDendaReview');if(existing){start(existing);return;}
    const observer=new MutationObserver(()=>{const panel=$('vaxDendaReview');if(panel){observer.disconnect();start(panel);}});
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
