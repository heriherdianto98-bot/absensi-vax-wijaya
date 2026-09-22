/* VAX employee presentation only: show a compact service preview and a details modal.
   Reads the existing rendered #todayService list; no RPC, KPI or sync changes. */
(() => {
  'use strict';
  const list = document.getElementById('todayService');
  const card = list?.closest('.kpi-service');
  if (!list || !card || document.getElementById('employeeServiceDetailModal')) return;

  const style = document.createElement('style');
  style.id = 'employee-service-detail-style';
  style.textContent = `
    #kpiCapster .kpi-service .service-detail-list{max-height:none!important;overflow:visible!important;scrollbar-width:none!important}
    #kpiCapster .kpi-service .service-detail-list::-webkit-scrollbar{display:none!important}
    #kpiCapster .kpi-service.has-service-overflow .service-detail-item:nth-child(n+3){display:none!important}
    #kpiCapster .kpi-service .employee-service-open{display:block;width:100%;margin:10px 0 0;padding:9px 12px;border:1px solid #80683e;border-radius:10px;background:#302c23;color:#f3d48b;font:inherit;font-size:12px;font-weight:700;cursor:pointer;text-align:center}
    #kpiCapster .kpi-service .employee-service-open[hidden]{display:none!important}
    #kpiCapster .kpi-service .employee-service-open:focus-visible,.employee-service-close:focus-visible{outline:2px solid #f4d68a;outline-offset:3px}
    .employee-service-modal[hidden]{display:none!important}
    .employee-service-modal{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.76);box-sizing:border-box}
    .employee-service-dialog{width:min(100%,430px);max-height:min(78dvh,650px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #76613b;border-radius:18px;background:linear-gradient(150deg,#282720,#151817);box-shadow:0 22px 70px #000b;color:#f4f0e7}
    .employee-service-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 17px 13px;border-bottom:1px solid #554b37}
    .employee-service-modal-head h2{margin:0;font-size:17px;color:#f4d58e}
    .employee-service-close{display:grid;place-items:center;width:34px;height:34px;flex:0 0 34px;border:1px solid #6c5b39;border-radius:10px;background:#302d25;color:#f4d58e;font-size:22px;cursor:pointer}
    .employee-service-modal-list{min-height:0;overflow-y:auto;padding:8px 17px 17px;scrollbar-width:thin;scrollbar-color:#806b44 #1b1c1a}
    .employee-service-modal-list .service-detail-item{display:flex!important;align-items:baseline!important;gap:9px!important;padding:11px 0!important;border-bottom:1px solid #ffffff14!important;font-size:13px!important;line-height:1.45!important;white-space:normal!important}
    .employee-service-modal-list .service-name{flex:0 1 auto;min-width:0;color:#f1ebe0;overflow-wrap:anywhere;white-space:normal!important}
    .employee-service-modal-list .service-dots{flex:1 1 auto;min-width:8px;border-bottom:1px dotted #73664b;transform:translateY(-3px)}
    .employee-service-modal-list .service-qty{flex:0 0 auto;color:#f1d18b;font-weight:750;white-space:nowrap}
    body.employee-service-modal-open{overflow:hidden}
  `;
  document.head.appendChild(style);

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'employee-service-open';
  openButton.textContent = 'Lihat rincian service';
  openButton.hidden = true;
  openButton.setAttribute('aria-haspopup', 'dialog');
  card.appendChild(openButton);

  const modal = document.createElement('div');
  modal.id = 'employeeServiceDetailModal';
  modal.className = 'employee-service-modal';
  modal.hidden = true;
  modal.innerHTML = '<section class="employee-service-dialog" role="dialog" aria-modal="true" aria-labelledby="employeeServiceModalTitle"><header class="employee-service-modal-head"><h2 id="employeeServiceModalTitle">Rincian Service</h2><button type="button" class="employee-service-close" aria-label="Tutup rincian service">×</button></header><div class="employee-service-modal-list"></div></section>';
  document.body.appendChild(modal);
  const detailList = modal.querySelector('.employee-service-modal-list');
  const closeButton = modal.querySelector('.employee-service-close');
  let previousFocus = null;

  function syncPreview() {
    const count = list.querySelectorAll('.service-detail-item').length;
    const hasMore = count > 2;
    card.classList.toggle('has-service-overflow', hasMore);
    openButton.hidden = !hasMore;
    if (!modal.hidden) fillDetails();
  }
  function fillDetails() {
    detailList.replaceChildren(...Array.from(list.querySelectorAll('.service-detail-item'), row => row.cloneNode(true)));
  }
  function close() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('employee-service-modal-open');
    previousFocus?.focus?.();
  }
  openButton.addEventListener('click', () => {
    fillDetails();
    if (!detailList.children.length) return;
    previousFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('employee-service-modal-open');
    closeButton.focus();
  });
  closeButton.addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      // Only the close button is focusable in this read-only dialog.
      event.preventDefault(); closeButton.focus();
    }
  });
  new MutationObserver(syncPreview).observe(list, { childList: true, subtree: true, characterData: true });
  syncPreview();
})();
