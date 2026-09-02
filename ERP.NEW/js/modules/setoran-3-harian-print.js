/* ERP VAX — Setoran 3 Harian Print
   Presentation-only. Mengikuti master print Cash Out/Arus Kas: hitam-putih, garis emas, A4, tanpa mengubah data/rumus. */
"use strict";
(function(){
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function rupiah(v){return "Rp"+Number(v||0).toLocaleString("id-ID");}
  function fmtDate(iso){
    const p=String(iso||"").slice(0,10).split("-").map(Number);
    if(p.length!==3||!p[0]) return String(iso||"—");
    return new Date(Date.UTC(p[0],p[1]-1,p[2],12)).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
  }
  async function dataUrl(paths){
    for(const rel of paths){try{const r=await fetch(rel,{cache:"force-cache"});if(!r.ok)continue;const b=await r.blob();if(!b||b.size<100)continue;const u=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result||""));fr.onerror=no;fr.readAsDataURL(b)});if(u)return u;}catch(_){}}
    return "";
  }
  function totals(flow){
    let cash=0,non=0,nett=0,bri=0,diff=0,actual=0;
    for(const b of flow.branches||[]){const m=flow.model(b.id);cash+=flow.money(m.s.cashReference);non+=flow.money(m.s.nonCash);nett+=flow.money(m.nettProduk);bri+=flow.money(m.bri);diff+=flow.money(m.diff);actual+=flow.money(m.actual);}
    return {cash,non,nett,bri,diff,actual};
  }
  function currentRows(flow){
    return (flow.branches||[]).map(b=>{const m=flow.model(b.id),s=m.saved||{};return {name:flow.canonicalName(b.nama_cabang),cash:m.s.cashReference,non:m.s.nonCash,nett:m.nettProduk,bri:m.bri,diff:m.diff,outside:m.outside,actual:m.actual,note:s.non_cash_note||s.outside_cashout_note||s.spv_note||"—",taken:m.taken?"SUDAH DIAMBIL":"BELUM DIAMBIL"};});
  }
  function css(){return `
    :root{--ink:#1a1a1a;--muted:#6b6520;--line:#e5e0d0;--gold:#c9a227;--gold-line:#d4af37;--soft:#fafaf8;--head:#111;--red:#b91c1c;--green:#0f766e;}
    *{box-sizing:border-box} @page{size:A4 landscape;margin:10mm 11mm 16mm 11mm}
    html,body{margin:0;background:#fff;color:var(--ink);font-family:Arial,"Segoe UI",sans-serif;font-size:9pt;line-height:1.35}
    .sheet{width:100%;max-width:275mm;margin:0 auto}.head{display:flex;justify-content:space-between;align-items:center;gap:12px}.brand{display:flex;align-items:center;gap:10px}.brand img{width:48px;height:48px;object-fit:contain}.brand h1{margin:0;font-size:13pt;letter-spacing:.04em}.brand .doc{font-size:9pt;font-weight:700;letter-spacing:.08em}.brand .sys{font-size:7pt;color:var(--muted);letter-spacing:.1em}.right{text-align:right}.right .mark{font-size:7pt;font-weight:800;letter-spacing:.12em}.right .mark em{display:block;color:var(--gold);font-style:normal}.rule{height:2px;margin:7px 0 9px;background:linear-gradient(90deg,var(--gold-line),#e7d7a4 55%,transparent)}
    .title{margin-bottom:8px}.title h2{margin:0;font-size:14pt}.title p{margin:3px 0 0;color:var(--muted);font-size:8pt}.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 18px;padding:7px 9px;margin-bottom:8px;border:1px solid var(--line);border-left:3px solid var(--gold-line);background:var(--soft)}.meta span{display:block;font-size:6.5pt;font-weight:800;letter-spacing:.09em;color:var(--muted);text-transform:uppercase}.meta strong{font-size:9pt}
    .summary{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:8px}.sum{border:1px solid var(--line);border-top:2px solid var(--gold-line);padding:6px 8px;background:#fff}.sum span{display:block;font-size:6.2pt;color:var(--muted);font-weight:800;letter-spacing:.07em;text-transform:uppercase}.sum strong{display:block;margin-top:2px;font-size:10.5pt}.sum.main{background:#fcfaf3}.sum.red{border-top-color:var(--red)}.sum.red strong{color:var(--red)}.sum.green{border-top-color:var(--green)}.sum.green strong{color:var(--green)}
    table{width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid var(--line)}thead{display:table-header-group}th{background:var(--head);color:#fff;padding:6px 4px;border-right:1px solid #2a2a2a;border-bottom:2px solid var(--gold-line);font-size:6.3pt;text-transform:uppercase;letter-spacing:.03em}td{padding:6px 5px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:7.3pt;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even) td{background:#fafaf8}.num{text-align:right;white-space:nowrap;font-weight:700}.diff-neg{color:var(--red)}.taken{font-weight:800;color:var(--green)}.note{white-space:normal}.cabang{font-weight:800}.foot{display:flex;justify-content:space-between;gap:16px;margin-top:9px;padding-top:7px;border-top:1px solid var(--line);font-size:7pt;color:#666}.no-print{margin:12px 0}.no-print button{border:1px solid var(--gold);background:#f7f1de;color:#111;font-weight:800;padding:8px 13px;border-radius:6px;cursor:pointer}@media print{.no-print{display:none!important}}
    th:nth-child(1){width:12%}th:nth-child(2){width:10%}th:nth-child(3){width:9%}th:nth-child(4){width:8%}th:nth-child(5){width:9%}th:nth-child(6){width:9%}th:nth-child(7){width:9%}th:nth-child(8){width:9%}th:nth-child(9){width:15%}th:nth-child(10){width:10%}
  `;}
  async function printSetoran(preopenedWindow){
    const flow=window.SetoranDirectFlow;
    if(!flow||!flow.dataset){alert("Data Setoran 3 Harian belum siap.");if(preopenedWindow&&!preopenedWindow.closed)preopenedWindow.close();return;}

    /* PENTING: window print dibuka sinkron saat user klik agar Edge/Chrome tidak menganggapnya popup async. */
    const w=preopenedWindow||window.open("","_blank");
    if(!w){alert("Popup print diblokir browser.");return;}
    try{
      w.document.open();
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Menyiapkan Print...</title></head><body style="font-family:Arial,sans-serif;padding:32px">Menyiapkan laporan Setoran 3 Harian...</body></html>');
      w.document.close();
    }catch(_e){}

    const p=flow.period(); const t=totals(flow); const rows=currentRows(flow); const logo=await dataUrl(["../assets/brand/erp-vax-wijaya.png","../assets/logo/erp-vax-wijaya.png"]);
    const now=new Date(); const stamp=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(now)+" WIB";
    const body=rows.map(r=>`<tr><td class="cabang">${esc(r.name)}</td><td class="num">${rupiah(r.cash)}</td><td class="num">${rupiah(r.non)}</td><td class="num">${rupiah(r.nett)}</td><td class="num">${r.bri==null?"—":rupiah(r.bri)}</td><td class="num ${Number(r.diff||0)<0?'diff-neg':''}">${r.diff==null?"—":rupiah(r.diff)}</td><td class="num">${rupiah(r.outside)}</td><td class="num">${rupiah(r.actual)}</td><td class="note">${esc(r.note)}</td><td class="${r.taken==='SUDAH DIAMBIL'?'taken':''}">${esc(r.taken)}</td></tr>`).join("");
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Setoran 3 Harian</title><style>${css()}</style></head><body><div class="sheet"><div class="head"><div class="brand">${logo?`<img src="${logo}">`:''}<div><h1>ERP VAX WIJAYA</h1><div class="doc">LAPORAN SETORAN 3 HARIAN</div><div class="sys">ENTERPRISE RESOURCE PLANNING</div></div></div><div class="right"><div class="mark">DOKUMEN INTERNAL<em>FINANCE / OPERASIONAL</em></div></div></div><div class="rule"></div><div class="title"><h2>Setoran 3 Harian — Semua Cabang</h2><p>Ringkasan cash, non tunai, nett produk, rekonsiliasi BRI Merchant, biaya luar Cashout, dan status pengambilan.</p></div><div class="meta"><div><span>Periode</span><strong>${fmtDate(p.start)} — ${fmtDate(p.end)}</strong></div><div><span>Durasi</span><strong>${p.days} hari</strong></div><div><span>Status</span><strong>${rows.filter(r=>r.taken==='SUDAH DIAMBIL').length}/${rows.length} Sudah Diambil</strong></div></div><div class="summary"><div class="sum main"><span>Total Cash Harus Diambil</span><strong>${rupiah(t.cash)}</strong></div><div class="sum"><span>Total Non Tunai Minutes</span><strong>${rupiah(t.non)}</strong></div><div class="sum"><span>Total Nett Produk</span><strong>${rupiah(t.nett)}</strong></div><div class="sum"><span>Total BRI Merchant</span><strong>${rupiah(t.bri)}</strong></div><div class="sum red"><span>Total Selisih Non Tunai</span><strong>${rupiah(t.diff)}</strong></div><div class="sum green"><span>Total Cash Aktual</span><strong>${rupiah(t.actual)}</strong></div></div><table><thead><tr><th>Cabang</th><th>Cash Harus Diambil</th><th>Non Tunai Minutes</th><th>Nett Produk</th><th>BRI Merchant</th><th>Selisih Non Tunai</th><th>Biaya di luar Cashout</th><th>Cash Aktual</th><th>Keterangan</th><th>Status</th></tr></thead><tbody>${body}</tbody></table><div class="foot"><span>Sumber canonical: DailyDataEngine + data verifikasi Setoran 3 Harian.</span><span>Dicetak ${esc(stamp)}</span></div><div class="no-print"><button onclick="window.print()">PRINT / SIMPAN PDF</button></div></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`;

    if(w.closed)return;
    w.document.open();w.document.write(html);w.document.close();
  }
  function mount(){
    const apply=document.getElementById("s3v2Apply"); if(!apply||document.getElementById("s3v2Print"))return;
    const btn=document.createElement("button");btn.type="button";btn.id="s3v2Print";btn.textContent="PRINT";btn.style.cssText="height:34px;border-radius:9px;padding:0 16px;border:1px solid rgba(216,165,59,.45);background:#111d29;color:#fff;font-weight:800;cursor:pointer";
    btn.addEventListener("click",()=>{
      const w=window.open("","_blank");
      if(!w){alert("Popup print diblokir browser.");return;}
      printSetoran(w).catch((err)=>{console.error("Setoran3HarianPrint:",err);try{if(!w.closed)w.close();}catch(_e){}alert(err?.message||"Gagal menyiapkan print Setoran 3 Harian.");});
    });
    apply.insertAdjacentElement("afterend",btn);
  }
  document.addEventListener("DOMContentLoaded",mount);document.addEventListener("erp:components-ready",mount);
  window.Setoran3HarianPrint={print:printSetoran,mount};
})();
