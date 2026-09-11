/* ERP VAX — UI ONLY: Owner readable SVP invoice view.
   Additive presentation layer. Does not change invoice or cash engines.
*/
"use strict";
(() => {
  const STYLE_ID = "svpInvoiceReadableViewStyle";
  const CARD_ID = "svpInvoiceReadableView";

  const rp = (v) => new Intl.NumberFormat("id-ID", {
    style:"currency", currency:"IDR", maximumFractionDigits:0
  }).format(Number(v || 0));

  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  }[c]));

  const dateLabel = (v) => {
    if(!v) return "—";
    try{
      return new Intl.DateTimeFormat("id-ID", {
        day:"2-digit", month:"long", year:"numeric", timeZone:"Asia/Jakarta"
      }).format(new Date(`${v}T12:00:00+07:00`));
    }catch{return String(v)}
  };

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-dialog{
        width:min(900px,calc(100vw - 36px));max-height:88vh;overflow:auto;
        background:linear-gradient(180deg,#111b25 0%,#0c141c 100%);
        border:1px solid #2e789a;border-radius:18px;
        box-shadow:0 28px 90px rgba(0,0,0,.68),0 0 0 1px rgba(87,195,238,.08);
      }
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-dialog-head{
        position:sticky;top:0;z-index:3;padding:18px 22px;
        background:rgba(15,26,36,.96);backdrop-filter:blur(10px);
        border-bottom:1px solid #263a49;
      }
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-dialog-head h2{
        font-size:22px;letter-spacing:.01em;color:#d9f4ff;margin:0;
      }
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-form > *:not(.svp-owner-readable-view):not(.mt-invoice-form-actions){display:none!important}
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-form{display:block!important;padding:18px 20px 20px!important}
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-form-actions{
        display:flex!important;justify-content:flex-end;gap:10px;margin-top:16px!important;padding-top:14px;border-top:1px solid #263847;
      }
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-form-actions button[type="submit"],
      #mtInvoiceModal[data-owner-view-only="1"] #invAddItem,
      #mtInvoiceModal[data-owner-view-only="1"] [data-remove]{display:none!important}

      .svp-owner-readable-view{display:block!important;color:#eaf5fb}
      .svp-owner-readable-top{
        display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-bottom:14px;
      }
      .svp-owner-readable-title{
        padding:18px;border:1px solid #28485b;border-radius:14px;
        background:linear-gradient(135deg,rgba(27,72,94,.34),rgba(12,23,32,.72));
      }
      .svp-owner-readable-title small{display:block;color:#7fa7bd;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:7px}
      .svp-owner-readable-title strong{display:block;color:#fff;font-size:24px;line-height:1.15;margin-bottom:9px}
      .svp-owner-readable-title span{display:block;color:#9eb5c3;font-size:13px;line-height:1.45}
      .svp-owner-readable-total{
        display:flex;flex-direction:column;justify-content:center;align-items:flex-end;
        padding:18px;border:1px solid #725a18;border-radius:14px;
        background:linear-gradient(145deg,rgba(112,82,12,.34),rgba(28,22,9,.54));text-align:right;
      }
      .svp-owner-readable-total span{color:#d8bf6b;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      .svp-owner-readable-total strong{color:#ffd85b;font-size:30px;line-height:1.1;margin-top:6px}

      .svp-owner-readable-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .svp-owner-readable-meta div{
        min-height:78px;padding:12px 14px;border:1px solid #263a49;border-radius:12px;background:#0d171f;
      }
      .svp-owner-readable-meta span{display:block;color:#7f9aaa;font-size:10px;font-weight:900;letter-spacing:.11em;text-transform:uppercase;margin-bottom:7px}
      .svp-owner-readable-meta strong{display:block;color:#e9f5fb;font-size:14px;line-height:1.3;word-break:break-word}

      .svp-owner-readable-note{
        margin-bottom:14px;padding:13px 15px;border-left:3px solid #40b8e7;border-radius:10px;background:#0e1a23;
      }
      .svp-owner-readable-note span{display:block;color:#79a1b5;font-size:10px;font-weight:900;letter-spacing:.11em;text-transform:uppercase;margin-bottom:6px}
      .svp-owner-readable-note p{margin:0;color:#dceaf1;font-size:14px;line-height:1.5;white-space:pre-wrap}

      .svp-owner-readable-items{border:1px solid #263b4a;border-radius:14px;overflow:hidden;background:#0b141b}
      .svp-owner-readable-items-head{
        display:grid;grid-template-columns:minmax(0,1fr) 72px 150px 160px;gap:10px;
        padding:10px 14px;background:#14222d;border-bottom:1px solid #2b4050;
        color:#8eacbc;font-size:10px;font-weight:900;letter-spacing:.10em;text-transform:uppercase;
      }
      .svp-owner-readable-item{
        display:grid;grid-template-columns:minmax(0,1fr) 72px 150px 160px;gap:10px;align-items:center;
        padding:13px 14px;border-bottom:1px solid #1d2b35;
      }
      .svp-owner-readable-item:last-child{border-bottom:0}
      .svp-owner-readable-item .name{font-weight:800;color:#f0f7fb;font-size:14px}
      .svp-owner-readable-item .qty{color:#b7c8d2;text-align:center}
      .svp-owner-readable-item .price{color:#c6d4dc;text-align:right}
      .svp-owner-readable-item .amount{color:#ffd24b;text-align:right;font-weight:900;font-size:16px}
      .svp-owner-readable-empty{padding:18px;text-align:center;color:#8097a5}

      @media(max-width:760px){
        .svp-owner-readable-top{grid-template-columns:1fr}
        .svp-owner-readable-meta{grid-template-columns:1fr}
        .svp-owner-readable-items-head{display:none}
        .svp-owner-readable-item{grid-template-columns:1fr 1fr;gap:7px 12px}
        .svp-owner-readable-item .name{grid-column:1/-1}
        .svp-owner-readable-item .qty{text-align:left}
        .svp-owner-readable-item .amount{text-align:right}
        .svp-owner-readable-item .price{grid-column:1/-1;text-align:left;color:#91a6b3;font-size:12px}
      }
    `;
    document.head.appendChild(s);
  }

  function removeReadable(){ document.getElementById(CARD_ID)?.remove(); }

  function renderReadable(){
    const modal = document.getElementById("mtInvoiceModal");
    if(!modal || modal.dataset.ownerViewOnly !== "1") return;
    const form = document.getElementById("mtInvoiceForm");
    if(!form) return;
    ensureStyle();
    removeReadable();

    const inv = window.SvPInvoice;
    const row = inv?.current || null;
    if(!row) return;
    const items = Array.isArray(row.items) ? row.items : [];
    const total = Number(row.total || items.reduce((s,x)=>s+Number(x.amount||0),0));

    const card = document.createElement("section");
    card.id = CARD_ID;
    card.className = "svp-owner-readable-view";
    card.innerHTML = `
      <div class="svp-owner-readable-top">
        <div class="svp-owner-readable-title">
          <small>Invoice diajukan SVP</small>
          <strong>${esc(row.title || "INVOICE SVP")}</strong>
          <span>${esc(row.invoice_no || "—")}</span>
        </div>
        <div class="svp-owner-readable-total">
          <span>Total Pengajuan</span>
          <strong>${rp(total)}</strong>
        </div>
      </div>

      <div class="svp-owner-readable-meta">
        <div><span>Tanggal Invoice</span><strong>${esc(dateLabel(row.invoice_date))}</strong></div>
        <div><span>Jatuh Tempo</span><strong>${esc(dateLabel(row.due_date))}</strong></div>
        <div><span>Status</span><strong>${esc(String(row.status || "draft").toUpperCase())}</strong></div>
      </div>

      <div class="svp-owner-readable-note">
        <span>Catatan SVP</span>
        <p>${esc(row.notes || "Tidak ada catatan.")}</p>
      </div>

      <div class="svp-owner-readable-items">
        <div class="svp-owner-readable-items-head"><span>Daftar Tagihan</span><span style="text-align:center">Qty</span><span style="text-align:right">Harga</span><span style="text-align:right">Jumlah</span></div>
        ${items.length ? items.map(x => `
          <div class="svp-owner-readable-item">
            <div class="name">${esc(x.item_name || "—")}</div>
            <div class="qty">${esc(x.qty ?? 1)}</div>
            <div class="price">${rp(x.unit_price)}</div>
            <div class="amount">${rp(x.amount ?? (Number(x.qty||1)*Number(x.unit_price||0)))}</div>
          </div>`).join("") : '<div class="svp-owner-readable-empty">Tidak ada item invoice.</div>'}
      </div>`;

    const actions = form.querySelector(".mt-invoice-form-actions");
    form.insertBefore(card, actions || form.firstChild);
  }

  function watch(){
    ensureStyle();
    const modal = document.getElementById("mtInvoiceModal");
    if(!modal) return false;
    const obs = new MutationObserver(() => {
      if(modal.dataset.ownerViewOnly === "1") setTimeout(renderReadable,0);
      else removeReadable();
    });
    obs.observe(modal,{attributes:true,attributeFilter:["data-owner-view-only","hidden"],childList:true,subtree:true});
    document.addEventListener("click", e => {
      if(e.target.closest?.("[data-invoice-view]")) setTimeout(renderReadable,30);
      if(e.target.closest?.("[data-inv-close]")) setTimeout(removeReadable,0);
    },true);
    return true;
  }

  let tries=0;
  const t=setInterval(()=>{if(watch()||++tries>180)clearInterval(t)},100);
  window.addEventListener("load",()=>setTimeout(watch,700));
})();
