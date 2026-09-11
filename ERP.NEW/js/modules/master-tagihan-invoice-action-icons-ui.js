/* ERP VAX — UI ONLY: compact invoice action icons + visual ACC states.
   Presentation layer only. No invoice workflow, approval, share, or Arus Kas logic changes.
*/
"use strict";
(() => {
  const STYLE_ID = "invoiceActionIconsUiStyle";
  const ICON_CLASS = "mt-action-icon-only";

  const WA_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2a9.84 9.84 0 0 0-8.43 14.92L2.05 22l5.22-1.52A9.95 9.95 0 1 0 12.04 2Zm0 17.94a8 8 0 0 1-4.08-1.11l-.29-.17-3.1.9.93-3.02-.19-.31a7.92 7.92 0 1 1 6.73 3.71Zm4.38-5.94c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.19-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.09 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"/></svg>`;
  const MAIL_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m22 7-10 6L2 7"/></svg>`;
  const CHECK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.2 4.2L19.5 6.8"/></svg>`;
  const VIEW_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement("style");
    s.id=STYLE_ID;
    s.textContent=`
      #mtInvoiceCard .mt-invoice-buttons,#mtInvoiceCard .svp-return-actions{gap:12px!important;align-items:center!important}
      #mtInvoiceCard .${ICON_CLASS}{width:38px!important;min-width:38px!important;max-width:38px!important;height:38px!important;min-height:38px!important;padding:0!important;border-radius:10px!important;display:inline-grid!important;place-items:center!important;font-size:0!important;line-height:1!important;overflow:hidden!important;flex:0 0 38px!important}
      #mtInvoiceCard .${ICON_CLASS} svg{width:20px;height:20px;display:block;pointer-events:none}
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-view{color:#8de7ff!important;background:rgba(47,173,219,.08)!important;border:1px solid rgba(87,203,243,.40)!important;box-shadow:none!important}
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-view:hover{color:#d5f6ff!important;background:rgba(47,173,219,.16)!important;border-color:#75d8fa!important}
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-wa{color:#38e77b!important;background:transparent!important;border:1px solid rgba(56,231,123,.28)!important;box-shadow:none!important}
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-wa:hover{color:#65f39a!important;background:rgba(37,211,102,.06)!important;border-color:rgba(101,243,154,.55)!important;box-shadow:0 0 14px rgba(37,211,102,.12)!important}
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-mail{color:#73d7ff!important;background:rgba(38,150,199,.08)!important;border:1px solid rgba(67,188,233,.42)!important;box-shadow:none!important}
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-mail:hover{color:#b9ecff!important;background:rgba(38,150,199,.15)!important;border-color:#62c8ef!important}
      #mtInvoiceCard .${ICON_CLASS}.mt-action-wa::before{display:none!important;content:none!important}
      #mtInvoiceCard .mt-acc-pending{color:#ffd8d8!important;background:linear-gradient(180deg,#6d2028,#45141a)!important;border:1px solid #e85562!important;box-shadow:0 5px 13px rgba(132,27,38,.26)!important}
      #mtInvoiceCard .mt-acc-pending:hover{background:linear-gradient(180deg,#852932,#571820)!important;border-color:#ff7a86!important}
      #mtInvoiceCard .mt-acc-done{width:38px!important;min-width:38px!important;height:38px!important;padding:0!important;border-radius:10px!important;display:inline-grid!important;place-items:center!important;color:#9dffc3!important;background:rgba(29,153,82,.14)!important;border:1px solid rgba(75,222,132,.48)!important;box-shadow:none!important;cursor:default!important;pointer-events:none!important}
      #mtInvoiceCard .mt-acc-done svg{width:20px;height:20px;display:block}
      #mtInvoiceCard .mt-action-svp-view,#mtInvoiceCard .mt-icon-view{order:10}
      #mtInvoiceCard .mt-icon-mail{order:20}
      #mtInvoiceCard .mt-icon-wa{order:30}
      #mtInvoiceCard .mt-acc-pending,#mtInvoiceCard .mt-acc-done{order:40}
      #mtInvoiceCard [data-inv-action="print"],#mtInvoiceCard .mt-action-print{order:50}
    `;
    document.head.appendChild(s);
  }

  function compactButton(btn, kind){
    if(!btn) return;
    const expected=kind;
    if(btn.dataset.iconOnlyReady===expected) return;
    const label=(btn.getAttribute("aria-label")||btn.title||btn.textContent||"").trim();
    btn.dataset.iconOnlyReady=expected;
    btn.classList.add(ICON_CLASS,kind==="wa"?"mt-icon-wa":kind==="view"?"mt-icon-view":"mt-icon-mail");
    const title=kind==="wa"?"Kirim via WhatsApp":kind==="view"?"Lihat Invoice":(label||"Kirim via Email");
    btn.title=title;btn.setAttribute("aria-label",title);
    btn.innerHTML=kind==="wa"?WA_SVG:kind==="view"?VIEW_SVG:MAIL_SVG;
  }

  function rowId(row){
    return row.querySelector("[data-id]")?.getAttribute("data-id") || row.querySelector("[data-owner-invoice-acc]")?.getAttribute("data-owner-invoice-acc") || "";
  }

  function rowData(id){
    return (window.SvPInvoice?.rows||[]).find(x=>String(x.id)===String(id))||null;
  }

  function isEmailButton(btn){
    const text=String(btn.textContent||"").toLowerCase();
    const cls=String(btn.className||"").toLowerCase();
    const aria=String(btn.getAttribute("aria-label")||btn.title||"").toLowerCase();
    return text.includes("email")||cls.includes("email")||aria.includes("email")||btn.dataset.invoiceEmail||btn.dataset.email||btn.dataset.iconOnlyReady==="mail";
  }

  function isViewButton(btn){
    const text=String(btn.textContent||"").trim().toLowerCase();
    const cls=String(btn.className||"").toLowerCase();
    const aria=String(btn.getAttribute("aria-label")||btn.title||"").toLowerCase();
    return cls.includes("mt-action-svp-view")||text==="lihat"||text.includes("lihat invoice")||aria.includes("lihat invoice")||btn.dataset.iconOnlyReady==="view";
  }

  function dedupeEmails(actions){
    const mails=[...actions.querySelectorAll("button")].filter(isEmailButton);
    if(mails.length<=1)return mails[0]||null;
    const preferred=mails.find(b=>!b.classList.contains("mt-ui-mail-added"))||mails[0];
    mails.forEach(b=>{if(b!==preferred)b.remove()});
    return preferred;
  }

  function ensureEmail(row,actions,id){
    const existing=dedupeEmails(actions);
    if(existing){compactButton(existing,"mail");return}
    if(!id)return;
    const b=document.createElement("button");
    b.type="button";b.className="mt-action mt-action-email mt-ui-mail-added";
    b.dataset.invAction="send";b.dataset.id=id;b.dataset.email="1";
    b.title="Kirim via Email";b.setAttribute("aria-label","Kirim via Email");b.innerHTML=MAIL_SVG;
    actions.appendChild(b);compactButton(b,"mail");
  }

  function markDirection(row){
    const text=String(row.textContent||"").toUpperCase().replace(/\s+/g," ");
    row.classList.remove("mt-invoice-owner-to-svp","mt-invoice-svp-to-owner");
    if(text.includes("OWNER → SVP")||text.includes("OWNER -> SVP"))row.classList.add("mt-invoice-owner-to-svp");
    else if(text.includes("SVP → OWNER")||text.includes("SVP -> OWNER"))row.classList.add("mt-invoice-svp-to-owner");
  }

  function decorateAcc(row,actions,id){
    const data=rowData(id);const status=String(data?.status||"").toLowerCase();
    const done=["paid","approved","acc","accepted"].includes(status);
    const acc=[...actions.querySelectorAll("button")].find(btn=>String(btn.textContent||"").trim().toLowerCase()==="acc"||btn.hasAttribute("data-owner-invoice-acc"));
    if(done){
      acc?.remove();
      if(!actions.querySelector(".mt-acc-done")){
        const ok=document.createElement("span");ok.className="mt-acc-done";ok.title="Sudah ACC";ok.setAttribute("aria-label","Sudah ACC");ok.innerHTML=CHECK_SVG;actions.appendChild(ok);
      }
    }else if(acc){acc.classList.add("mt-acc-pending");acc.title="Menunggu ACC"}
  }

  function decorate(root=document){
    ensureStyle();
    root.querySelectorAll?.("#mtInvoiceCard .mt-invoice-row").forEach(row=>{
      markDirection(row);
      const actions=row.querySelector(".mt-invoice-buttons,.svp-return-actions");if(!actions)return;
      const id=rowId(row);
      dedupeEmails(actions);
      actions.querySelectorAll("button").forEach(btn=>{
        const text=String(btn.textContent||"").toLowerCase(),cls=String(btn.className||"").toLowerCase();
        if(isViewButton(btn))compactButton(btn,"view");
        else if(cls.includes("mt-action-wa")||text.includes("whatsapp"))compactButton(btn,"wa");
        else if(isEmailButton(btn))compactButton(btn,"mail");
      });
      ensureEmail(row,actions,id);
      decorateAcc(row,actions,id);
    });
  }

  function install(){
    const card=document.getElementById("mtInvoiceCard");if(!card)return false;
    ensureStyle();decorate(card);
    if(!window.__invoiceActionIconsUiObserver){
      let queued=false;
      window.__invoiceActionIconsUiObserver=new MutationObserver(()=>{
        if(queued)return;queued=true;
        requestAnimationFrame(()=>{queued=false;decorate(card)});
      });
      window.__invoiceActionIconsUiObserver.observe(card,{childList:true,subtree:true});
    }
    return true;
  }

  let tries=0;const timer=setInterval(()=>{if(install()||++tries>180)clearInterval(timer)},100);
  window.addEventListener("load",()=>{setTimeout(install,700);setTimeout(install,1500)});
})();
