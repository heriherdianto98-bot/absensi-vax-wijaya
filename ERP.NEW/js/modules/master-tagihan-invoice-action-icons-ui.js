/* ERP VAX — UI ONLY: compact WhatsApp and Email invoice actions to icon-only buttons.
   Presentation layer only. No invoice workflow, approval, share, or Arus Kas logic changes.
*/
"use strict";
(() => {
  const STYLE_ID = "invoiceActionIconsUiStyle";
  const ICON_CLASS = "mt-action-icon-only";

  const WA_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12.04 2a9.84 9.84 0 0 0-8.43 14.92L2.05 22l5.22-1.52A9.95 9.95 0 1 0 12.04 2Zm0 17.94a8 8 0 0 1-4.08-1.11l-.29-.17-3.1.9.93-3.02-.19-.31a7.92 7.92 0 1 1 6.73 3.71Zm4.38-5.94c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.19-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.09 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"/>
    </svg>`;
  const MAIL_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m22 7-10 6L2 7"/>
    </svg>`;

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement("style");
    s.id=STYLE_ID;
    s.textContent=`
      #mtInvoiceCard .${ICON_CLASS}{
        width:40px!important;min-width:40px!important;max-width:40px!important;height:38px!important;min-height:38px!important;
        padding:0!important;border-radius:10px!important;display:inline-grid!important;place-items:center!important;gap:0!important;
        font-size:0!important;line-height:1!important;overflow:hidden!important;
      }
      #mtInvoiceCard .${ICON_CLASS} svg{width:21px;height:21px;display:block;pointer-events:none}
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-wa{
        color:#f5fff9!important;background:linear-gradient(180deg,#1aaa59,#0e7d40)!important;
        border-color:#2eea79!important;box-shadow:0 5px 14px rgba(18,142,71,.28),inset 0 1px 0 rgba(255,255,255,.16)!important;
      }
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-wa:hover{background:linear-gradient(180deg,#22c766,#119448)!important;box-shadow:0 8px 19px rgba(18,160,77,.34)!important}
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-mail{
        color:#dff7ff!important;background:linear-gradient(180deg,#19769e,#105473)!important;
        border:1px solid #43bce9!important;box-shadow:0 5px 14px rgba(27,126,169,.25),inset 0 1px 0 rgba(255,255,255,.14)!important;
      }
      #mtInvoiceCard .${ICON_CLASS}.mt-icon-mail:hover{background:linear-gradient(180deg,#238eb9,#146889)!important;box-shadow:0 8px 19px rgba(35,145,193,.32)!important}
      #mtInvoiceCard .${ICON_CLASS}.mt-action-wa::before{display:none!important;content:none!important}
    `;
    document.head.appendChild(s);
  }

  function compactButton(btn, kind){
    if(!btn || btn.dataset.iconOnlyReady === "1") return;
    const label = (btn.getAttribute("aria-label") || btn.title || btn.textContent || "").trim();
    btn.dataset.iconOnlyReady = "1";
    btn.classList.add(ICON_CLASS, kind === "wa" ? "mt-icon-wa" : "mt-icon-mail");
    const title = kind === "wa" ? "Kirim via WhatsApp" : (label || "Kirim via Email");
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = kind === "wa" ? WA_SVG : MAIL_SVG;
  }

  function decorate(root=document){
    ensureStyle();
    root.querySelectorAll?.("#mtInvoiceCard .mt-invoice-buttons button, #mtInvoiceCard .svp-return-actions button").forEach(btn => {
      if(btn.dataset.iconOnlyReady === "1") return;
      const text = String(btn.textContent || "").toLowerCase();
      const cls = String(btn.className || "").toLowerCase();
      if(cls.includes("mt-action-wa") || text.includes("whatsapp")) compactButton(btn,"wa");
      else if(text.includes("email") || cls.includes("email") || btn.dataset.invoiceEmail || btn.dataset.email) compactButton(btn,"mail");
    });
  }

  function install(){
    const card=document.getElementById("mtInvoiceCard");
    if(!card) return false;
    ensureStyle();
    decorate(card);
    if(!window.__invoiceActionIconsUiObserver){
      window.__invoiceActionIconsUiObserver = new MutationObserver(() => decorate(card));
      window.__invoiceActionIconsUiObserver.observe(card,{childList:true,subtree:true});
    }
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{if(install()||++tries>180)clearInterval(timer)},100);
  window.addEventListener("load",()=>{setTimeout(install,700);setTimeout(install,1500)});
})();
