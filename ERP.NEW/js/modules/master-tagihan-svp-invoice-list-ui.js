/* ERP VAX — UI ONLY: tidy SVP invoice list + readable view action.
   Presentation layer only. Does not change invoice, approval, or Arus Kas engines.
*/
"use strict";
(() => {
  const STYLE_ID = "svpInvoiceListUiStyle";
  const ROLE_CLASS = "svp-invoice-account-ui";

  const roleOf = inv => String(inv?.role || "").toLowerCase();
  const isSvp = inv => ["svp","spv"].includes(roleOf(inv));
  const senderRole = row => String(row?.sender_role || "").toLowerCase();
  const isOwnerInvoice = row => !["svp","spv"].includes(senderRole(row));

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement("style");
    s.id=STYLE_ID;
    s.textContent=`
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-list{padding:0 12px 12px}
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-row{
        grid-template-columns:minmax(260px,1.55fr) 132px 138px 92px minmax(300px,auto)!important;
        gap:14px!important;align-items:center!important;
        min-height:70px;padding:12px 14px!important;margin-top:8px;
        border:1px solid #273642!important;border-radius:12px;
        background:linear-gradient(180deg,#111a22 0%,#0d151c 100%);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.025);
      }
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-row:first-child{margin-top:10px}
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-row:hover{
        border-color:#365b6d!important;background:linear-gradient(180deg,#14212a 0%,#0f1820 100%);
      }
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-row>div:first-child{min-width:0}
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-no{
        font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      }
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-row small{
        display:block;margin-top:5px;color:#9aacb9;font-size:10.5px;line-height:1.25;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      }
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-total{font-size:13px;text-align:right;white-space:nowrap}
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-status{justify-self:center;white-space:nowrap}
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-buttons,
      body.${ROLE_CLASS} #mtInvoiceCard .svp-return-actions{
        display:flex!important;align-items:center;justify-content:flex-end!important;gap:6px!important;
        flex-wrap:nowrap!important;min-width:0;
      }
      body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-buttons .mt-action,
      body.${ROLE_CLASS} #mtInvoiceCard .svp-return-actions .mt-action{
        min-height:36px!important;padding:7px 10px!important;border-radius:9px!important;font-size:11px!important;
      }
      body.${ROLE_CLASS} #mtInvoiceCard .mt-action-svp-view{
        border:1px solid #3988aa;background:linear-gradient(180deg,#17445a,#103447 58%,#0b2736);
        color:#eaf9ff;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:6px;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 4px 10px rgba(20,104,143,.18);
        cursor:pointer;white-space:nowrap;transition:.15s ease;
      }
      body.${ROLE_CLASS} #mtInvoiceCard .mt-action-svp-view:hover{transform:translateY(-1px);border-color:#69c6ef;box-shadow:0 7px 15px rgba(35,144,191,.24)}
      body.${ROLE_CLASS} #mtInvoiceCard .mt-action-svp-view .svp-view-icon{
        width:21px;height:21px;border-radius:7px;display:inline-grid;place-items:center;
        background:linear-gradient(145deg,#dff8ff,#70d5ff 55%,#2aa6d8);color:#06384e;font-size:12px;font-weight:1000;
        border:1px solid #9ce6ff;box-shadow:inset 0 1px 1px rgba(255,255,255,.9),0 2px 6px rgba(60,185,234,.28);
      }
      #mtInvoiceModal[data-svp-view-only="1"] .mt-invoice-dialog{
        width:min(900px,calc(100vw - 36px));max-height:88vh;overflow:auto;
        background:linear-gradient(180deg,#111b25,#0c141c);border:1px solid #2e789a;border-radius:18px;
        box-shadow:0 28px 90px rgba(0,0,0,.68),0 0 0 1px rgba(87,195,238,.08);
      }
      #mtInvoiceModal[data-svp-view-only="1"] .mt-invoice-dialog-head{background:rgba(15,26,36,.97);border-bottom-color:#263a49}
      #mtInvoiceModal[data-svp-view-only="1"] .mt-invoice-dialog-head h2{color:#d9f4ff}
      #mtInvoiceModal[data-svp-view-only="1"] input:disabled,
      #mtInvoiceModal[data-svp-view-only="1"] textarea:disabled{
        opacity:1!important;color:#e7f7ff!important;-webkit-text-fill-color:#e7f7ff!important;background:#0d151d!important;border-color:#263b49!important;cursor:default!important;
      }
      #mtInvoiceModal[data-svp-view-only="1"] #invAddItem,
      #mtInvoiceModal[data-svp-view-only="1"] [data-remove],
      #mtInvoiceModal[data-svp-view-only="1"] .mt-invoice-form-actions button[type="submit"]{display:none!important}
      @media(max-width:1180px){
        body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-row{grid-template-columns:minmax(220px,1.35fr) 110px 120px 86px minmax(250px,auto)!important}
      }
      @media(max-width:900px){
        body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-row{grid-template-columns:1fr 1fr!important;gap:9px!important}
        body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-buttons,body.${ROLE_CLASS} #mtInvoiceCard .svp-return-actions{grid-column:1/-1;justify-content:flex-start!important;flex-wrap:wrap!important}
        body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-status{justify-self:start}
        body.${ROLE_CLASS} #mtInvoiceCard .mt-invoice-total{text-align:left}
      }
    `;
    document.head.appendChild(s);
  }

  function rowId(rowEl){
    const any=rowEl.querySelector("[data-id]");
    return any?.getAttribute("data-id") || rowEl.querySelector("[data-owner-invoice-acc]")?.getAttribute("data-owner-invoice-acc") || "";
  }

  function restoreView(){
    const modal=document.getElementById("mtInvoiceModal");
    if(!modal || modal.dataset.svpViewOnly!=="1") return;
    delete modal.dataset.svpViewOnly;
    modal.querySelectorAll("#invNo,#invDate,#invDue,#invTitle,#invNotes,#invItems input").forEach(el=>{el.disabled=false});
  }

  async function viewInvoice(row){
    const inv=window.SvPInvoice;
    if(!inv || !row) return;
    await inv.open(row);
    const modal=document.getElementById("mtInvoiceModal");
    if(!modal) return;
    modal.dataset.svpViewOnly="1";
    const title=document.getElementById("mtInvoiceTitle");
    if(title) title.textContent=isOwnerInvoice(row)?"Lihat Invoice Owner":"Lihat Invoice SVP";
    modal.querySelectorAll("#invNo,#invDate,#invDue,#invTitle,#invNotes,#invItems input").forEach(el=>{el.disabled=true});
  }

  function decorate(){
    const inv=window.SvPInvoice;
    if(!inv || !isSvp(inv)) return;
    document.body.classList.add(ROLE_CLASS);
    ensureStyle();
    const list=document.getElementById("mtInvoiceList");
    if(!list) return;
    const rows=Array.isArray(inv.rows)?inv.rows:[];

    list.querySelectorAll(".mt-invoice-row").forEach(rowEl=>{
      const id=rowId(rowEl);
      if(!id) return;
      const row=rows.find(x=>String(x.id)===String(id));
      if(!row) return;
      rowEl.dataset.svpInvoiceUi="1";

      const actions=rowEl.querySelector(".mt-invoice-buttons,.svp-return-actions");
      if(!actions || actions.querySelector(`[data-svp-invoice-view="${id}"]`)) return;
      const b=document.createElement("button");
      b.type="button";
      b.className="mt-action mt-action-svp-view";
      b.dataset.svpInvoiceView=id;
      b.title="Lihat detail invoice";
      b.innerHTML='<span class="svp-view-icon" aria-hidden="true">◉</span><span>Lihat</span>';
      actions.prepend(b);
    });
  }

  function install(){
    const inv=window.SvPInvoice;
    if(!inv || !inv.role) return false;
    if(!isSvp(inv)) return true;
    if(window.__svpInvoiceListUiInstalled) return true;
    window.__svpInvoiceListUiInstalled=true;
    ensureStyle();
    document.body.classList.add(ROLE_CLASS);

    document.addEventListener("click",e=>{
      const view=e.target.closest?.("[data-svp-invoice-view]");
      if(view){
        e.preventDefault();e.stopPropagation();
        const row=(window.SvPInvoice?.rows||[]).find(x=>String(x.id)===String(view.dataset.svpInvoiceView));
        if(row) viewInvoice(row);
        return;
      }
      if(e.target.closest?.("[data-inv-close]")) restoreView();
    },true);

    const list=document.getElementById("mtInvoiceList");
    if(list) new MutationObserver(()=>decorate()).observe(list,{childList:true,subtree:true});
    decorate();
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{if(install()||++tries>180)clearInterval(timer)},100);
  window.addEventListener("load",()=>{setTimeout(install,650);setTimeout(install,1400)});
})();
