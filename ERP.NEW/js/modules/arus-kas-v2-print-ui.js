/* ERP VAX — Arus Kas V2 Print / PDF UI
   Presentation-only. Mengikuti master print Setoran 3 Harian:
   A4 landscape, header ERP VAX WIJAYA, garis emas, footer dokumen.
   Mencetak Buku Arus Kas + 5 card Ringkasan Saldo + Rekonsiliasi QRIS/GOPAY.
   Tidak mengubah engine, query, saldo, transaksi, formula, atau data flow.
*/
"use strict";
(function(){
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

  async function dataUrl(paths){
    for(const rel of paths){
      try{
        const r=await fetch(rel,{cache:"force-cache"});
        if(!r.ok) continue;
        const b=await r.blob();
        if(!b||b.size<100) continue;
        const u=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result||""));fr.onerror=no;fr.readAsDataURL(b)});
        if(u) return u;
      }catch(_e){}
    }
    return "";
  }

  function css(){return `
    :root{--ink:#151515;--muted:#6a6454;--line:#d3ccb8;--gold:#c9a227;--gold-line:#d4af37;--soft:#fafaf8;--head:#111;--red:#b42318;--green:#0f766e;--blue:#3d6ca8;--purple:#7d4aa3;--amber:#9b6f11;--teal:#0f766e;}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A4 landscape;margin:8mm 9mm 13mm 9mm}
    html,body{margin:0;background:#fff;color:var(--ink);font-family:Arial,"Segoe UI",sans-serif;font-size:10pt;line-height:1.38}
    .sheet{width:100%;max-width:279mm;margin:0 auto}
    .head{display:flex;justify-content:space-between;align-items:center;gap:14px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:54px;height:54px;object-fit:contain}
    .brand h1{margin:0;font-size:15pt;letter-spacing:.04em}.brand .doc{font-size:10pt;font-weight:800;letter-spacing:.08em}.brand .sys{font-size:7.5pt;color:var(--muted);letter-spacing:.1em}
    .right{text-align:right}.right .mark{font-size:7.5pt;font-weight:800;letter-spacing:.12em}.right .mark em{display:block;color:var(--gold);font-style:normal}
    .rule{height:2px;margin:8px 0 10px;background:linear-gradient(90deg,var(--gold-line),#e7d7a4 58%,transparent)}
    .title{margin-bottom:9px}.title h2{margin:0;font-size:16pt}.title p{margin:3px 0 0;color:#665f50;font-size:9pt}
    .meta{display:grid;grid-template-columns:1.3fr .8fr .8fr;gap:2px 20px;padding:8px 10px;margin-bottom:10px;border:1px solid var(--line);border-left:4px solid var(--gold-line);background:#fbfaf6}
    .meta span{display:block;font-size:7pt;font-weight:800;letter-spacing:.09em;color:#746d52;text-transform:uppercase}.meta strong{font-size:10pt}

    .section-title{margin:12px 0 7px;font-size:12pt;font-weight:900;letter-spacing:.04em;color:#171717;break-after:avoid;page-break-after:avoid}
    .section-sub{margin:-3px 0 8px;color:#6a6454;font-size:8pt}

    table{width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid var(--line)}
    thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
    th{background:var(--head)!important;color:#fff!important;padding:7px 6px;border-right:1px solid #333;border-bottom:2px solid var(--gold-line);font-size:7.2pt;text-transform:uppercase;letter-spacing:.035em;text-align:left;line-height:1.2}
    td{padding:7px 6px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:8.5pt;vertical-align:top;overflow-wrap:anywhere;color:#181818!important;background:#fff!important;line-height:1.28}
    tbody tr:nth-child(even) td{background:#fafaf8!important}
    td:nth-child(1){font-weight:700;white-space:nowrap}td:nth-child(2){font-weight:900}td:nth-child(3),td:nth-child(5),td:nth-child(7){font-weight:800;white-space:nowrap}
    td:nth-child(3){color:#0f766e!important}td:nth-child(5){color:#b42318!important}td:nth-child(7){color:#8a6810!important}
    td:nth-child(8),td:nth-child(9){text-align:center;white-space:nowrap}
    th:nth-child(1){width:8%}th:nth-child(2){width:9%}th:nth-child(3){width:9%}th:nth-child(4){width:17%}th:nth-child(5){width:9%}th:nth-child(6){width:17%}th:nth-child(7){width:10%}th:nth-child(8){width:8%}th:nth-child(9){width:13%}

    .ak2-source,.ak2-status{display:inline-block!important;padding:3px 7px!important;border-radius:999px!important;border:1px solid #c7c7c7!important;background:#f5f5f5!important;color:#222!important;font-size:6.7pt!important;font-weight:800!important;box-shadow:none!important;text-shadow:none!important}
    .ak2-status.is-verified{border-color:#9fc9b9!important;background:#eef8f4!important;color:#0f6b52!important}
    .ak2-cabang-badge{color:#171717!important;background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important;font-size:8.5pt!important;font-weight:900!important}
    .ak2-cabang-repeat,.ak2-tanggal-repeat{color:#8b8b8b!important}
    button,.ak2-row-detail-trigger{display:none!important}

    .ak2-cards{display:grid!important;grid-template-columns:repeat(5,1fr)!important;gap:8px!important;margin:8px 0 12px!important;break-inside:avoid!important;page-break-inside:avoid!important}
    .ak2-card{min-height:66px!important;padding:10px 11px!important;border:1px solid #cfc7b5!important;border-left:4px solid var(--gold-line)!important;border-radius:8px!important;background:linear-gradient(180deg,#fff,#f7f8fa)!important;color:#161616!important;box-shadow:none!important}
    .ak2-card span{display:block!important;font-size:7pt!important;font-weight:900!important;letter-spacing:.06em!important;text-transform:uppercase!important;color:#5d574a!important}
    .ak2-card strong{display:block!important;margin-top:5px!important;font-size:13pt!important;line-height:1.1!important;color:#171717!important}
    .ak2-card small{display:block!important;margin-top:5px!important;font-size:7.5pt!important;color:#6b665b!important}
    .ak2-card.is-main{border-left-color:var(--blue)!important}.ak2-card.is-product{border-left-color:var(--purple)!important}.ak2-card.is-fine{border-left-color:var(--gold-line)!important}.ak2-card.is-receivable{border-left-color:#4e8aba!important}

    .ak2-qris-card{display:block!important;margin-top:10px!important;border:1px solid #cfc7d9!important;border-left:4px solid #8b5bb8!important;border-radius:8px!important;overflow:hidden!important;background:#fff!important;color:#171717!important;break-inside:auto!important;page-break-inside:auto!important}
    .ak2-qris-card .ak2-section-head{display:flex!important;justify-content:space-between!important;align-items:center!important;padding:10px 12px!important;background:#f5f0fa!important;border-bottom:1px solid #d9cfe3!important}
    .ak2-qris-card .ak2-section-head strong{font-size:11pt!important;color:#2a2033!important}.ak2-qris-card .ak2-section-head small{display:block!important;margin-top:2px!important;font-size:7.5pt!important;color:#6d6374!important}
    .ak2-qris-summary{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:8px!important;padding:10px 12px!important;break-inside:avoid!important;page-break-inside:avoid!important}
    .ak2-qris-summary>div{padding:9px 10px!important;border:1px solid #d4cfda!important;border-radius:7px!important;background:#fafafa!important}
    .ak2-qris-summary span{display:block!important;font-size:7pt!important;font-weight:900!important;text-transform:uppercase!important;color:#625b68!important}.ak2-qris-summary strong{display:block!important;margin-top:4px!important;font-size:12pt!important;color:#171717!important}
    .ak2-qris-card .ak2-table-wrap{display:block!important;overflow:visible!important}.ak2-qris-card table{margin:0!important}.ak2-qris-card th{font-size:7pt!important}.ak2-qris-card td{font-size:8.4pt!important}
    .ak2-qris-card th:nth-child(n),.ak2-qris-card td:nth-child(n){width:auto!important;text-align:left!important;white-space:normal!important}

    .foot{display:flex;justify-content:space-between;gap:16px;margin-top:10px;padding-top:7px;border-top:1px solid var(--line);font-size:7.5pt;color:#666}
    .no-print{margin:12px 0}.no-print button{display:inline-block!important;border:1px solid var(--gold);background:#f7f1de;color:#111;font-weight:800;padding:8px 13px;border-radius:6px;cursor:pointer}
    @media print{.no-print{display:none!important}.ak2-cards{break-inside:avoid!important}.ak2-qris-summary{break-inside:avoid!important}}
  `;}

  function periodText(){
    const shown=document.getElementById("ak2PeriodText")?.textContent?.trim();
    if(shown&&shown!=="—"&&shown!=="Pilih periode") return shown;
    const start=document.getElementById("ak2Start")?.value||"—";
    const end=document.getElementById("ak2End")?.value||"—";
    return `${start} — ${end}`;
  }

  function statusText(){
    const sel=document.getElementById("ak2StatusFilter");
    return sel?.selectedOptions?.[0]?.textContent?.trim()||"Semua";
  }

  function cleanClone(selector){
    const src=document.querySelector(selector);
    if(!src) return null;
    const clone=src.cloneNode(true);
    clone.querySelectorAll("button,.ak2-row-detail-trigger,[data-ak2-close],[data-ak2-detail-close]").forEach(x=>x.remove());
    clone.querySelectorAll("[title]").forEach(x=>x.removeAttribute("title"));
    clone.removeAttribute("hidden");
    clone.querySelectorAll("[hidden]").forEach(x=>x.removeAttribute("hidden"));
    return clone;
  }

  function cleanTableClone(){return cleanClone(".ak2-ledger-card .ak2-table");}

  async function printArusKas(preopenedWindow){
    const table=cleanTableClone();
    if(!table){alert("Buku Arus Kas belum siap.");if(preopenedWindow&&!preopenedWindow.closed)preopenedWindow.close();return;}
    const cards=cleanClone(".ak2-cards");
    const qris=cleanClone(".ak2-qris-card");
    const w=preopenedWindow||window.open("","_blank");
    if(!w){alert("Popup print diblokir browser.");return;}
    try{w.document.open();w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Menyiapkan Print...</title></head><body style="font-family:Arial,sans-serif;padding:32px">Menyiapkan laporan Arus Kas...</body></html>');w.document.close();}catch(_e){}

    const logo=await dataUrl(["../assets/brand/erp-vax-wijaya.png","../assets/logo/erp-vax-wijaya.png"]);
    const stamp=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date())+" WIB";
    const owner=document.getElementById("ak2User")?.textContent?.trim()||"Owner";
    const count=document.getElementById("ak2RowCount")?.textContent?.trim()||"—";
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Arus Kas V2</title><style>${css()}</style></head><body>
      <div class="sheet">
        <div class="head">
          <div class="brand">${logo?`<img src="${logo}">`:''}<div><h1>ERP VAX WIJAYA</h1><div class="doc">LAPORAN ARUS KAS</div><div class="sys">ENTERPRISE RESOURCE PLANNING</div></div></div>
          <div class="right"><div class="mark">DOKUMEN INTERNAL<em>FINANCE / OWNER</em></div></div>
        </div>
        <div class="rule"></div>
        <div class="title"><h2>Buku Arus Kas</h2><p>Saldo berjalan dan mutasi pemasukan/pengeluaran sesuai ledger Arus Kas V2.</p></div>
        <div class="meta">
          <div><span>Periode</span><strong>${esc(periodText())}</strong></div>
          <div><span>Status</span><strong>${esc(statusText())}</strong></div>
          <div><span>Transaksi</span><strong>${esc(count)}</strong></div>
        </div>
        ${table.outerHTML}
        ${cards?`<div class="section-title">Ringkasan Saldo</div><div class="section-sub">Kas Besar, Dana Produk, Kas Denda, Piutang Setoran, dan Piutang Denda.</div>${cards.outerHTML}`:""}
        ${qris?`<div class="section-title">Rekonsiliasi QRIS / GoPay</div>${qris.outerHTML}`:""}
        <div class="foot"><span>ERP VAX WIJAYA · Arus Kas V2 · Owner verified</span><span>Dicetak ${esc(stamp)} · ${esc(owner)}</span></div>
        <div class="no-print"><button onclick="window.print()">PRINT / SIMPAN PDF</button></div>
      </div>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script>
    </body></html>`;
    if(w.closed)return;
    w.document.open();w.document.write(html);w.document.close();
  }

  function mount(){
    const btn=document.getElementById("ak2Print");
    if(!btn||btn.dataset.ak2PrintUi==="1") return;
    btn.dataset.ak2PrintUi="1";
    btn.onclick=null;
    btn.addEventListener("click",function(e){
      e.preventDefault();e.stopImmediatePropagation();
      const w=window.open("","_blank");
      if(!w){alert("Popup print diblokir browser.");return;}
      printArusKas(w).catch(err=>{console.error("ArusKasV2PrintUI:",err);try{if(!w.closed)w.close();}catch(_e){}alert(err?.message||"Gagal menyiapkan print Arus Kas.");});
    },true);
  }

  document.addEventListener("DOMContentLoaded",mount);
  document.addEventListener("erp:finance-ready",()=>setTimeout(mount,0));
  setTimeout(mount,300);
  window.ArusKasV2PrintUI={print:printArusKas,mount};
})();
