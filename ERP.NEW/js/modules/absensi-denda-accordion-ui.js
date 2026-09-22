/* UI ONLY: collapsible Absensi fine review; preserves existing buttons, data loaders, and accounting. */
(() => {
  'use strict';
  if (window.__vaxAbsensiFineAccordion) return;
  window.__vaxAbsensiFineAccordion = true;
  const $ = id => document.getElementById(id);
  const style = document.createElement('style');
  style.textContent = `
    #vaxDendaReview .vax-fine-accordion-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    #vaxDendaReview .vax-fine-accordion-toggle{display:flex;align-items:center;gap:9px;min-width:0;border:1px solid #655334;background:#252a2a;color:#f7d486;border-radius:9px;padding:8px 12px;cursor:pointer;font:inherit;font-size:13px;font-weight:800;line-height:1.25;text-align:left}
    #vaxDendaReview .vax-fine-accordion-toggle:hover,#vaxDendaReview .vax-fine-accordion-toggle:focus-visible{border-color:#e0b956;outline-offset:2px}
    #vaxDendaReview .vax-fine-accordion-toggle .vax-fine-arrow{display:inline-block;transition:transform .2s ease}
    #vaxDendaReview .vax-fine-accordion-toggle[aria-expanded="true"] .vax-fine-arrow{transform:rotate(180deg)}
    #vaxDendaReview .vax-fine-accordion-metrics{font-size:12px;color:#d2dce5;line-height:1.4;margin:4px 0 0}
    #vaxDendaReview .vax-fine-accordion-content[hidden],#vaxDendaReview .vax-fine-section-content[hidden]{display:none!important}
    #vaxDendaReview .vax-fine-section{border-top:1px solid #37414d;margin-top:9px;padding-top:8px}
    #vaxDendaReview .vax-fine-section-head{display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap}
    #vaxDendaReview .vax-fine-section-head .vax-fine-accordion-toggle{flex:1;background:#17212a;color:#f0d183;border-color:#405060;font-size:14px}
    #vaxDendaReview .vax-fine-section-content{padding-top:7px}
    #vaxDendaReview .vax-fine-section .vax-fine-decision-history,#vaxDendaReview .vax-fine-section #vaxLateNoticeInbox,#vaxDendaReview .vax-fine-section #vaxDendaReceiptHistory{border-top:0!important;margin-top:0!important;padding-top:0!important}
    #vaxDendaReview .vax-fine-section h3{margin:0!important;font-size:15px!important}
    #vaxDendaReview .vax-fine-section-head > h3{display:none!important}
    @media(max-width:650px){#vaxDendaReview .vax-fine-accordion-top{width:100%}#vaxDendaReview .vax-fine-accordion-toggle{padding:7px 9px}#vaxDendaReview .vax-fine-accordion-metrics{font-size:11px}}
    @media(prefers-reduced-motion:reduce){#vaxDendaReview .vax-fine-arrow{transition:none!important}}
  `;
  document.head.appendChild(style);
  const amounts = text => [...String(text || '').matchAll(/Piutang tersisa\s*Rp\s*([\d.,]+)/gi)].reduce((sum, match) => sum + (Number(match[1].replace(/\D/g, '')) || 0), 0);
  const money = value => 'Rp ' + Number(value || 0).toLocaleString('id-ID');
  const makeToggle = (label, content, expanded) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'vax-fine-accordion-toggle';
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-controls', content.id);
    const name = document.createElement('span'); name.textContent = label;
    const arrow = document.createElement('span'); arrow.className = 'vax-fine-arrow';
    arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '⌄';
    button.append(name, arrow);
    content.hidden = !expanded;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open)); content.hidden = !open;
    });
    return button;
  };
  function start(panel) {
    if (panel.dataset.vaxFineAccordion === '1') return;
    const heading = panel.querySelector('.vax-denda-heading');
    const notice = $('vaxDendaNotice'), rows = $('vaxDendaRows');
    if (!heading || !notice || !rows) return;
    panel.dataset.vaxFineAccordion = '1';
    const body = document.createElement('div');
    body.id = 'vaxFineAccordionBody';body.className = 'vax-fine-accordion-content';
    heading.insertAdjacentElement('afterend', body);
    const top = document.createElement('div');top.className = 'vax-fine-accordion-top';
    const metrics = document.createElement('p');metrics.className='vax-fine-accordion-metrics';
    const title = heading.querySelector('h2');
    if (title) {
      const updateTitle = () => {metrics.textContent = `${(notice.textContent.match(/\d+\s+menunggu keputusan/) || ['0 menunggu keputusan'])[0]} · Piutang tersisa ${money(amounts(rows.textContent))}`;};
      const watch = new MutationObserver(updateTitle);
      watch.observe(notice,{childList:true,characterData:true,subtree:true});
      watch.observe(rows,{childList:true,characterData:true,subtree:true});
      updateTitle();
      title.insertAdjacentElement('afterend',metrics);
    }
    const toggle = makeToggle('Buka rincian denda',body,false);
    toggle.addEventListener('click',()=>{toggle.firstElementChild.textContent=body.hidden?'Buka rincian denda':'Tutup rincian denda';});
    top.append(toggle);
    const refresh = $('vaxDendaRefresh');
    if (refresh) refresh.before(top); else heading.append(top);
    const decision = document.createElement('section');decision.className='vax-fine-section';decision.id='vaxFineSectionDecision';
    const decisionHead = document.createElement('div');decisionHead.className='vax-fine-section-head';
    const decisionContent = document.createElement('div');decisionContent.className='vax-fine-section-content';decisionContent.id='vaxFineSectionDecisionContent';
    decisionHead.append(makeToggle('Keputusan Denda',decisionContent,true));
    decisionContent.append(notice,rows);decision.append(decisionHead,decisionContent);body.append(decision);
    const sections = [
      ['vaxLateNoticeInbox','Pengajuan Izin Telat Masuk','vaxFineSectionLate'],
      ['vaxFineDecisionHistory','Riwayat Keputusan SPV · Pemeriksaan Owner','vaxFineSectionHistory'],
      ['vaxDendaReceiptHistory','Riwayat Penerimaan Denda','vaxFineSectionReceipt']
    ];
    const addSection = ([id,label,sectionId]) => {
      const existing = $(id);if (!existing || $(sectionId)) return;
      const wrap = document.createElement('section');wrap.className='vax-fine-section';wrap.id=sectionId;
      const head = document.createElement('div');head.className='vax-fine-section-head';
      const content = document.createElement('div');content.className='vax-fine-section-content';content.id=sectionId+'Content';
      head.append(makeToggle(label,content,false));content.append(existing);wrap.append(head,content);body.append(wrap);
    };
    sections.forEach(addSection);
    // Other presentation modules mount their sections asynchronously. Move only these known UI nodes.
    const observer = new MutationObserver(() => {sections.forEach(addSection);});
    observer.observe(panel,{childList:true});
  }
  const boot = () => {
    const panel = $('vaxDendaReview');if(panel){start(panel);return;}
    const observer = new MutationObserver(() => {const found=$('vaxDendaReview');if(found){observer.disconnect();start(found);}});
    observer.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
