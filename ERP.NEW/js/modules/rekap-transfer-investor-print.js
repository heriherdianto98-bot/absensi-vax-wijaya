(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let period='';
const periodLabel=()=>period;
  function printCss(){return `
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A4 portrait;margin:8mm 8mm 8mm}
    html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#171717;background:#fff;font-size:8.2pt}
    .page-frame{width:100%;border-collapse:collapse;table-layout:fixed}.page-frame>thead{display:table-header-group}.page-frame>tfoot{display:table-footer-group}
    .page-frame>thead>tr>td,.page-frame>tfoot>tr>td,.page-frame>tbody>tr>td{padding:0;border:0;vertical-align:top}.head-space{height:24mm}.foot-space{height:18mm}
    .master-head{height:20mm;background:#fff}.master-head-inner{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;height:15mm}.brand{display:flex;align-items:center;gap:4mm}.logo{width:14mm;height:14mm;object-fit:contain}.brand-copy h1{margin:0;font-size:14pt;font-weight:800;letter-spacing:.035em;line-height:1.05}.brand-copy .report-name{margin-top:1.2mm;font-size:7.2pt;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.brand-copy .system{margin-top:.8mm;font-size:6.6pt;color:#666}.head-right{text-align:right;padding-top:.6mm}.head-right .doc{font-size:6.6pt;color:#666;letter-spacing:.08em;text-transform:uppercase}.head-right strong{display:block;margin-top:1mm;font-size:7.3pt;letter-spacing:.08em}.gold-rule{height:1mm;background:#d4af37;margin-top:2.5mm}
    .master-foot{height:10mm;border-top:1px solid #b8b8b8;background:#fff;padding-top:2mm;display:flex;justify-content:space-between;align-items:flex-start;color:#666;font-size:6.2pt}.master-foot strong{color:#111}.foot-center{text-align:center;flex:1}.foot-right{text-align:right}
    .content{padding:0}.report-title{margin:0 0 3mm}.report-title h1{font-size:15pt;margin:0}.report-title p{margin:.8mm 0 0;color:#666;font-size:7.2pt}.warn{margin:0 0 3mm;padding:2mm 3mm;border:1px solid #d6a92d;background:#fff8dd;font-weight:700}
    .grand{border:1px solid #b4b4b4;padding:3mm;margin-bottom:4mm;break-inside:avoid}.grand h2{margin:0 0 2mm;font-size:11pt}.grand-grid,.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1.5mm}.grand-grid div,.kpis div{border:1px solid #d2d2d2;padding:1.8mm}.grand-grid span,.kpis span{display:block;color:#666;font-size:6.3pt;text-transform:uppercase}.grand-grid strong,.kpis strong{display:block;margin-top:.6mm;font-size:8.3pt}
    .branch-report{margin-bottom:5mm;page-break-after:always}.branch-report:last-child{page-break-after:auto}.branch-title{border-bottom:1.1mm solid #d4af37;padding:0 0 2mm;margin-bottom:2mm;display:flex;justify-content:space-between;align-items:flex-end}.branch-title h2{margin:0;font-size:13pt}.branch-title span{display:block;margin-top:.7mm;color:#666;font-size:6.5pt;font-weight:700}.branch-title>strong{font-size:12pt}.kpis{grid-template-columns:repeat(5,1fr);margin-bottom:3mm}
    h3{font-size:9.3pt;margin:3.5mm 0 1.5mm;padding-bottom:1mm;border-bottom:1px solid #cfcfcf}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.line{display:flex;justify-content:space-between;gap:4mm;padding:1.1mm 0;border-bottom:1px dotted #ddd}.line span{color:#555}.line strong{text-align:right}.line.total{font-weight:800;border-top:1px solid #aaa;border-bottom:0;margin-top:.7mm;padding-top:1.4mm}.summary-strip,.recon{margin-top:1.5mm;border:1px solid #ddd;padding:1.5mm 2.5mm}.summary-strip .line,.recon .line{padding:.8mm 0}
    .data-table{width:100%;border-collapse:collapse;table-layout:fixed}.data-table thead{display:table-header-group}.data-table th,.data-table td{border:1px solid #d7d7d7;padding:1.15mm 1.2mm;vertical-align:top;font-size:6.6pt}.data-table th{background:#f3f3f3;font-size:6.1pt;text-transform:uppercase}.data-table .num{text-align:right;white-space:nowrap}.data-table tr{break-inside:avoid;page-break-inside:avoid}.data-table small{display:block;color:#777;font-size:5.8pt;margin-top:.4mm}.cashout th:nth-child(1){width:16mm}.cashout th:nth-child(3){width:39mm}.cashout th:nth-child(4),.cashout th:nth-child(5){width:29mm}.empty{text-align:center;color:#777;padding:4mm!important}
    .note{padding:2mm;border:1px solid #ddd;background:#fafafa;color:#555;min-height:10mm}.ready{padding:2mm 3mm;border:1px solid #8fbea4;background:#f0faf4;font-weight:700}.issues>div{border:1px solid #deb1b1;background:#fff7f7;padding:1.5mm 2mm;margin-bottom:1mm}.issues strong{display:block;color:#a22;font-size:6.5pt}.issues span{display:block;margin-top:.4mm;color:#555}
    @media print{.master-foot{position:fixed;left:0;right:0;bottom:0;z-index:5}}
    @media screen{body{padding:16px;background:#eee}.page-frame{background:#fff;max-width:210mm;margin:auto;box-shadow:0 8px 28px rgba(0,0,0,.12)}.page-frame>thead,.page-frame>tfoot{display:table-row-group}.head-space,.foot-space{height:auto}.master-head{height:auto;padding:16px 20px 0}.master-foot{height:auto;margin:0 20px;padding:10px 0 16px}.content{padding:0 20px 20px}}
  `;}

  function masterHeader(){
    const logo="../assets/logo-vax-wijaya.png";
    return `<header class="master-head"><div class="master-head-inner"><div class="brand"><img class="logo" src="${logo}" onerror="this.style.display='none'" alt="VAX"><div class="brand-copy"><h1>ERP VAX WIJAYA</h1><div class="report-name">LAPORAN BULANAN</div><div class="system">Enterprise Management System</div></div></div><div class="head-right"><div class="doc">DOKUMEN KEUANGAN</div><strong>INTERNAL</strong></div></div><div class="gold-rule"></div></header>`;
  }

  function masterFooter(branchLabel,printedAt){
    return `<footer class="master-foot"><div><strong>ERP VAX WIJAYA</strong><br>Laporan Bulanan</div><div class="foot-center">${esc(periodLabel())} · ${esc(branchLabel)}</div><div class="foot-right">Dicetak ${esc(printedAt)} WIB<br>Dokumen Internal</div></footer>`;
  }


window.RekapTransferInvestorPrint={build(data){
period=data.period;
const printedAt=new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const base=new URL('../',location.href).href;
return '<!doctype html><html lang="id"><head><meta charset="utf-8"><base href="'+base+'pages/"><title>'+esc('Rekap Transfer '+data.name+' '+data.period)+'</title><style>'+printCss()+'.rt-table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:5mm}.rt-table th,.rt-table td{border-bottom:1px solid #ddd;padding:2.8mm 1.4mm;font-size:8pt;vertical-align:top}.rt-table th{background:#ebede8;text-align:left}.rt-table .num{text-align:right;white-space:nowrap}.rt-table small{display:block;font-size:6.4pt;color:#666;margin-top:1mm}.rt-table .badge{font-size:6pt;font-weight:bold}.rt-table .pending{color:#8a5800}.rt-table tfoot{background:#edf2ed;font-weight:bold}.rt-table tr{break-inside:avoid}.rt-table th:first-child{width:25%}.rt-table th:last-child{width:21%}.rt-table th:nth-child(2),.rt-table th:nth-child(3),.rt-table th:nth-child(4){width:18%}.rt-note{font-size:7pt;color:#666;line-height:1.5;margin-top:4mm}h2{font-size:16pt;margin:3mm 0} .rt-grand{font-size:16pt;padding:4mm 0;border-bottom:1mm solid #d4af37;margin-bottom:4mm}</style></head><body><table class="page-frame"><thead><tr><td><div class="head-space">'+masterHeader()+'</div></td></tr></thead><tfoot><tr><td><div class="foot-space">'+masterFooter(data.name,printedAt)+'</div></td></tr></tfoot><tbody><tr><td><main class="content"><section class="report-title"><h1>Rekap Transfer Investor</h1><p>'+esc(data.period)+'</p></section><h2>'+esc(data.name)+'</h2><div class="rt-grand">Total Transfer: <strong>'+esc(data.total)+'</strong></div>'+(data.pending?'<div class="warn">BELUM FINAL — terdapat cabang yang belum final; nominal mengikuti laporan bulanan investor.</div>':'')+data.table+'<p class="rt-note">Total merupakan penjumlahan Total Hak Investor per cabang. Sewa dibayar sudah termasuk sesuai laporan bulanan. Status BELUM FINAL mengikuti laporan sumber.</p></main></td></tr></tbody></table></body></html>';
},open(data){
const w=window.open('','_blank');if(!w)throw new Error('Izinkan popup untuk cetak/PDF.');
w.document.open();w.document.write(this.build(data));w.document.close();
Promise.all([...w.document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))).then(()=>{w.focus();w.print()});
}};
})();
