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
    return (flow.branches||[]).map(b=>{const m=flow.model(b.id),s=m.saved||{};return {
      name:flow.canonicalName(b.nama_cabang),cash:m.s.cashReference,non:m.s.nonCash,nett:m.nettProduk,bri:m.bri,diff:m.diff,outside:m.outside,actual:m.actual,
      note:s.non_cash_note||s.outside_cashout_note||s.spv_note||"—",
      taken:m.taken?"SUDAH DIAMBIL":"BELUM DIAMBIL",
      verified:s.owner_verified===true
    };});
  }
  async function cashOutSnapshot(flow,p){
    const ids=(flow.branches||[]).map(b=>Number(b.id)).filter(Number.isFinite);
    if(!ids.length) return {total:0,transactions:0,branches:[]};
    const {data,error}=await db.from("daily_recap_source")
      .select("tanggal,cash_out,keterangan_cash_out,cabang_id")
      .in("cabang_id",ids)
      .gte("tanggal",p.start)
      .lte("tanggal",p.end)
      .order("tanggal",{ascending:true});
    if(error) throw error;

    const names=new Map();
    (flow.branches||[]).forEach(b=>names.set(Number(b.id),flow.canonicalName?flow.canonicalName(b.nama_cabang):String(b.nama_cabang||b.id)));
    const grouped=new Map();
    ids.forEach(id=>grouped.set(id,{id,name:names.get(id)||String(id),total:0,details:[]}));

    (data||[]).forEach(day=>{
      const id=Number(day.cabang_id);
      if(!grouped.has(id)) grouped.set(id,{id,name:names.get(id)||String(id),total:0,details:[]});
      const branch=grouped.get(id);
      const dayTotal=flow.money(day.cash_out);
      branch.total+=dayTotal;
      let expanded={rows:[]};
      if(typeof CashOutDetail!=="undefined"&&typeof CashOutDetail.expandDetailRows==="function"){
        expanded=CashOutDetail.expandDetailRows([{
          tanggal:String(day.tanggal||"").slice(0,10),
          cash_out:dayTotal,
          keterangan_cash_out:day.keterangan_cash_out||"",
          cabang_id:id
        }])||{rows:[]};
      }
      (Array.isArray(expanded.rows)?expanded.rows:[]).forEach(r=>branch.details.push({...r,cabang_id:id}));
    });

    const branches=Array.from(grouped.values()).sort((a,b)=>{
      const ai=(flow.order||[]).indexOf(a.name),bi=(flow.order||[]).indexOf(b.name);
      return (ai<0?999:ai)-(bi<0?999:bi);
    });
    return {
      total:branches.reduce((sum,b)=>sum+flow.money(b.total),0),
      transactions:branches.reduce((sum,b)=>sum+b.details.filter(r=>r.nominal!=null&&flow.money(r.nominal)!==0).length,0),
      branches
    };
  }
  function cashOutPrintHtml(flow,snapshot){
    const active=(snapshot.branches||[]).filter(b=>Math.abs(flow.money(b.total))>.5||(b.details||[]).some(r=>r.nominal!=null||String(r.keterangan||"").trim()));
    const branchBlocks=active.map(branch=>{
      const details=(branch.details||[]).filter(r=>r.nominal!=null||String(r.keterangan||"").trim());
      const rows=details.length?details.map(r=>`<tr><td>${esc(fmtDate(r.tanggal))}</td><td class="num cashout-amount">${r.nominal==null?"—":rupiah(flow.money(r.nominal))}</td><td>${esc(r.keterangan||"—")}</td><td>${esc(String(r.kasir||"").trim()||"—")}</td></tr>`).join(""):`<tr><td colspan="4" class="cashout-empty">Tidak ada rincian transaksi terurai pada periode ini.</td></tr>`;
      const count=details.filter(r=>r.nominal!=null&&flow.money(r.nominal)!==0).length;
      return `<section class="cashout-branch"><div class="cashout-branch-head"><div><span>CABANG</span><strong>${esc(branch.name)}</strong></div><div><span>JUMLAH TRANSAKSI</span><strong>${count}</strong></div><div><span>SUBTOTAL CASH OUT</span><strong>${rupiah(branch.total)}</strong></div></div><table class="cashout-table"><thead><tr><th>Tanggal</th><th>Nominal</th><th>Keterangan Cash Out</th><th>Kasir / User</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join("");
    return `<section class="cashout-section"><div class="cashout-section-title"><div><span>RINCIAN CASH OUT</span><h3>Cash Out Per Cabang & Per Tanggal</h3><p>Read only · sumber sama dengan card Cash Out Setoran 3 Harian.</p></div><div class="cashout-grand"><span>GRAND TOTAL</span><strong>${rupiah(snapshot.total)}</strong><small>${active.length} cabang · ${snapshot.transactions} transaksi</small></div></div>${branchBlocks||'<div class="cashout-none">Tidak ada Cash Out pada periode aktif.</div>'}</section>`;
  }
  function css(){return `
    :root{--ink:#1a1a1a;--muted:#6b6520;--line:#d9d3c1;--gold:#c9a227;--gold-line:#d4af37;--soft:#fafaf8;--head:#111;--red:#b91c1c;--green:#0f766e;--blue:#4968c9;--purple:#8b5bb8;--teal:#0f8a7b;--orange:#c2410c;}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A4 landscape;margin:10mm 11mm 16mm 11mm}
    html,body{margin:0;background:#fff;color:var(--ink);font-family:Arial,"Segoe UI",sans-serif;font-size:9pt;line-height:1.35}
    .sheet{width:100%;max-width:275mm;margin:0 auto}.head{display:flex;justify-content:space-between;align-items:center;gap:12px}.brand{display:flex;align-items:center;gap:10px}.brand img{width:48px;height:48px;object-fit:contain}.brand h1{margin:0;font-size:13pt;letter-spacing:.04em}.brand .doc{font-size:9pt;font-weight:700;letter-spacing:.08em}.brand .sys{font-size:7pt;color:var(--muted);letter-spacing:.1em}.right{text-align:right}.right .mark{font-size:7pt;font-weight:800;letter-spacing:.12em}.right .mark em{display:block;color:var(--gold);font-style:normal}.rule{height:2px;margin:7px 0 9px;background:linear-gradient(90deg,var(--gold-line),#e7d7a4 55%,transparent)}
    .title{margin-bottom:8px}.title h2{margin:0;font-size:14pt}.title p{margin:3px 0 0;color:var(--muted);font-size:8pt}.meta{display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:2px 18px;padding:7px 9px;margin-bottom:8px;border:1px solid var(--line);border-left:3px solid var(--gold-line);background:#fbfaf6}.meta span{display:block;font-size:6.5pt;font-weight:800;letter-spacing:.09em;color:var(--muted);text-transform:uppercase}.meta strong{font-size:9pt}
    .summary{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}
    .sum{position:relative;min-height:52px;border:1px solid #cfc8b5;border-left:4px solid var(--gold-line);border-radius:7px;padding:7px 9px;background:linear-gradient(180deg,#ffffff 0%,#f7f8fa 100%);box-shadow:0 2px 7px rgba(0,0,0,.10)}
    .sum span{display:block;font-size:6.2pt;color:#5f5a4b;font-weight:800;letter-spacing:.06em;text-transform:uppercase;line-height:1.15}.sum strong{display:block;margin-top:4px;font-size:10.9pt;line-height:1.1;color:#111}
    .sum.main{border-left-color:var(--gold-line);background:linear-gradient(180deg,#fffdf6 0%,#f8f2df 100%)}.sum.main strong{color:#9a7610}
    .sum.cashout{border-left-color:var(--orange);background:linear-gradient(180deg,#fffaf6 0%,#fff1e8 100%)}.sum.cashout strong{color:var(--orange)}
    .sum.blue{border-left-color:var(--blue)}.sum.blue strong{color:#3e57ad}.sum.product{border-left-color:var(--teal)}.sum.product strong{color:#0f766e}.sum.purple{border-left-color:var(--purple)}.sum.purple strong{color:#7a4ca6}.sum.red{border-left-color:var(--red);background:linear-gradient(180deg,#fffafa 0%,#fbefef 100%)}.sum.red strong{color:var(--red)}.sum.green{border-left-color:var(--green);background:linear-gradient(180deg,#f8fffc 0%,#edf8f3 100%)}.sum.green strong{color:var(--green)}
    table{width:100%;border-collapse:collapse;border:1px solid var(--line)}thead{display:table-header-group}th{background:var(--head)!important;color:#fff!important;padding:6px 4px;border-right:1px solid #2a2a2a;border-bottom:2px solid var(--gold-line);font-size:6.1pt;text-transform:uppercase;letter-spacing:.03em}td{padding:6px 4px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:7.1pt;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even) td{background:#fafaf8!important}.num{text-align:right;white-space:nowrap;font-weight:700}.diff-neg{color:var(--red)}.taken{font-weight:800;color:var(--green)}.verify{text-align:center;font-weight:800}.verify .ok{display:inline-block;color:var(--green);border:1px solid rgba(15,118,110,.35);border-radius:999px;padding:2px 5px;background:#eef9f6}.verify .wait{display:inline-block;color:#8a7a37;border:1px solid #d7c98c;border-radius:999px;padding:2px 5px;background:#fffaf0}.note{white-space:normal}.cabang{font-weight:800}
    .main-table{table-layout:fixed}.main-table th:nth-child(1){width:11%}.main-table th:nth-child(2){width:9%}.main-table th:nth-child(3){width:8%}.main-table th:nth-child(4){width:7%}.main-table th:nth-child(5){width:8%}.main-table th:nth-child(6){width:8%}.main-table th:nth-child(7){width:8%}.main-table th:nth-child(8){width:8%}.main-table th:nth-child(9){width:13%}.main-table th:nth-child(10){width:10%}.main-table th:nth-child(11){width:10%}
    .cashout-section{margin-top:14px;padding-top:10px;border-top:2px solid var(--gold-line)}.cashout-section-title{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}.cashout-section-title>div:first-child>span{display:block;color:var(--orange);font-size:7pt;font-weight:900;letter-spacing:.13em}.cashout-section-title h3{margin:2px 0 1px;font-size:14pt}.cashout-section-title p{margin:0;color:#666;font-size:7pt}.cashout-grand{text-align:right;padding:7px 10px;border:1px solid #e3c9b8;border-left:4px solid var(--orange);border-radius:6px;background:#fff8f3;min-width:180px}.cashout-grand span,.cashout-branch-head span{display:block;font-size:6.2pt;font-weight:900;letter-spacing:.08em;color:#7d6556}.cashout-grand strong{display:block;color:var(--orange);font-size:13pt}.cashout-grand small{font-size:6.5pt;color:#666}.cashout-branch{margin:0 0 11px;break-inside:auto;page-break-inside:auto}.cashout-branch-head{display:grid;grid-template-columns:1.5fr .65fr .9fr;gap:12px;align-items:end;padding:7px 9px;border:1px solid #d8d2c4;border-left:4px solid var(--orange);background:#faf8f3;break-inside:avoid;page-break-inside:avoid}.cashout-branch-head>div:nth-child(2),.cashout-branch-head>div:nth-child(3){text-align:right}.cashout-branch-head strong{font-size:9pt}.cashout-branch-head>div:nth-child(3) strong{color:var(--orange);font-size:10pt}.cashout-table{table-layout:fixed;border-top:0}.cashout-table th:nth-child(1){width:16%}.cashout-table th:nth-child(2){width:18%;text-align:right}.cashout-table th:nth-child(3){width:46%;text-align:left}.cashout-table th:nth-child(4){width:20%;text-align:left}.cashout-table td:nth-child(2){text-align:right}.cashout-amount{color:var(--red);font-weight:800}.cashout-empty,.cashout-none{text-align:center;color:#777;font-style:italic;padding:12px}.cashout-none{border:1px solid var(--line);background:#fafafa}
    .foot{display:flex;justify-content:space-between;gap:16px;margin-top:9px;padding-top:7px;border-top:1px solid var(--line);font-size:7pt;color:#666}.no-print{margin:12px 0}.no-print button{border:1px solid var(--gold);background:#f7f1de;color:#111;font-weight:800;padding:8px 13px;border-radius:6px;cursor:pointer}
    @media print{.no-print{display:none!important}.summary,.cashout-section-title,.cashout-branch-head{break-inside:avoid!important;page-break-inside:avoid!important}.sum{box-shadow:0 1.5px 5px rgba(0,0,0,.14)!important}}
  `;}
  async function printSetoran(preopenedWindow){
    const flow=window.SetoranDirectFlow;
    if(!flow||!flow.dataset){alert("Data Setoran 3 Harian belum siap.");if(preopenedWindow&&!preopenedWindow.closed)preopenedWindow.close();return;}
    const w=preopenedWindow||window.open("","_blank");
    if(!w){alert("Popup print diblokir browser.");return;}
    try{w.document.open();w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Menyiapkan Print...</title></head><body style="font-family:Arial,sans-serif;padding:32px">Menyiapkan laporan Setoran 3 Harian...</body></html>');w.document.close();}catch(_e){}
    const p=flow.period();
    const t=totals(flow);
    const rows=currentRows(flow);
    const [cashOut,logo]=await Promise.all([
      cashOutSnapshot(flow,p),
      dataUrl(["../assets/brand/erp-vax-wijaya.png","../assets/logo/erp-vax-wijaya.png"])
    ]);
    const now=new Date(); const stamp=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(now)+" WIB";
    const body=rows.map(r=>`<tr><td class="cabang">${esc(r.name)}</td><td class="num">${rupiah(r.cash)}</td><td class="num">${rupiah(r.non)}</td><td class="num">${rupiah(r.nett)}</td><td class="num">${r.bri==null?"—":rupiah(r.bri)}</td><td class="num ${Number(r.diff||0)<0?'diff-neg':''}">${r.diff==null?"—":rupiah(r.diff)}</td><td class="num">${rupiah(r.outside)}</td><td class="num">${rupiah(r.actual)}</td><td class="note">${esc(r.note)}</td><td class="${r.taken==='SUDAH DIAMBIL'?'taken':''}">${esc(r.taken)}</td><td class="verify">${r.verified?'<span class="ok">✓ VERIFIED</span>':'<span class="wait">□ BELUM</span>'}</td></tr>`).join("");
    const takenCount=rows.filter(r=>r.taken==='SUDAH DIAMBIL').length;
    const verifiedCount=rows.filter(r=>r.verified).length;
    const cashOutDetail=cashOutPrintHtml(flow,cashOut);
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Setoran 3 Harian</title><style>${css()}</style></head><body><div class="sheet"><div class="head"><div class="brand">${logo?`<img src="${logo}">`:''}<div><h1>ERP VAX WIJAYA</h1><div class="doc">LAPORAN SETORAN 3 HARIAN</div><div class="sys">ENTERPRISE RESOURCE PLANNING</div></div></div><div class="right"><div class="mark">DOKUMEN INTERNAL<em>FINANCE / OPERASIONAL</em></div></div></div><div class="rule"></div><div class="title"><h2>Setoran 3 Harian — Semua Cabang</h2><p>Ringkasan cash, Cash Out, non tunai, nett produk, rekonsiliasi BRI Merchant, biaya luar Cashout, status pengambilan, dan verifikasi Owner.</p></div><div class="meta"><div><span>Periode</span><strong>${fmtDate(p.start)} — ${fmtDate(p.end)}</strong></div><div><span>Durasi</span><strong>${p.days} hari</strong></div><div><span>Status</span><strong>${takenCount}/${rows.length} Sudah Diambil · ${verifiedCount}/${rows.length} Owner Verified</strong></div></div><div class="summary"><div class="sum main"><span>Total Cash Harus Diambil</span><strong>${rupiah(t.cash)}</strong></div><div class="sum cashout"><span>Total Cash Out</span><strong>${rupiah(cashOut.total)}</strong></div><div class="sum blue"><span>Total Non Tunai Minutes</span><strong>${rupiah(t.non)}</strong></div><div class="sum product"><span>Total Nett Produk</span><strong>${rupiah(t.nett)}</strong></div><div class="sum purple"><span>Total BRI Merchant</span><strong>${rupiah(t.bri)}</strong></div><div class="sum red"><span>Total Selisih Non Tunai</span><strong>${rupiah(t.diff)}</strong></div><div class="sum green"><span>Total Cash Aktual</span><strong>${rupiah(t.actual)}</strong></div></div><table class="main-table"><thead><tr><th>Cabang</th><th>Cash Harus Diambil</th><th>Non Tunai Minutes</th><th>Nett Produk</th><th>BRI Merchant</th><th>Selisih Non Tunai</th><th>Biaya di luar Cashout</th><th>Cash Aktual</th><th>Keterangan</th><th>Sudah Diambil</th><th>Verif Owner</th></tr></thead><tbody>${body}</tbody></table>${cashOutDetail}<div class="foot"><span>Sumber canonical Setoran: DailyDataEngine + data verifikasi. Cash Out: daily_recap_source + CashOutDetail (read only).</span><span>Dicetak ${esc(stamp)}</span></div><div class="no-print"><button onclick="window.print()">PRINT / SIMPAN PDF</button></div></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`;
    if(w.closed)return; w.document.open();w.document.write(html);w.document.close();
  }
  function mount(){
    const apply=document.getElementById("s3v2Apply"); if(!apply||document.getElementById("s3v2Print"))return;
    const btn=document.createElement("button");btn.type="button";btn.id="s3v2Print";btn.textContent="PRINT";btn.style.cssText="height:34px;border-radius:9px;padding:0 16px;border:1px solid rgba(216,165,59,.45);background:#111d29;color:#fff;font-weight:800;cursor:pointer";
    btn.addEventListener("click",()=>{const w=window.open("","_blank");if(!w){alert("Popup print diblokir browser.");return;}printSetoran(w).catch((err)=>{console.error("Setoran3HarianPrint:",err);try{if(!w.closed)w.close();}catch(_e){}alert(err?.message||"Gagal menyiapkan print Setoran 3 Harian.");});});
    apply.insertAdjacentElement("afterend",btn);
  }
  document.addEventListener("DOMContentLoaded",mount);document.addEventListener("erp:components-ready",mount);
  window.Setoran3HarianPrint={print:printSetoran,mount};
})();
