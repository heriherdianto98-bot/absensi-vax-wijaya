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
    const logo=new URL("../assets/brand/erp-vax-wijaya.png",location.href).href;
    return `<header class="master-head"><div class="master-head-inner"><div class="brand"><img class="logo" src="${logo}" onerror="this.style.display='none'" alt="VAX"><div class="brand-copy"><h1>ERP VAX WIJAYA</h1><div class="report-name">LAPORAN BULANAN</div><div class="system">Enterprise Management System</div></div></div><div class="head-right"><div class="doc">DOKUMEN KEUANGAN</div><strong>INTERNAL</strong></div></div><div class="gold-rule"></div></header>`;
  }

  function masterFooter(branchLabel,printedAt){
    return `<footer class="master-foot"><div><strong>ERP VAX WIJAYA</strong><br>Laporan Bulanan</div><div class="foot-center">${esc(periodLabel())} · ${esc(branchLabel)}</div><div class="foot-right">Dicetak ${esc(printedAt)} WIB<br>Dokumen Internal</div></footer>`;
  }



function terbilang(value){
 const n=Number(value);
 if(!Number.isSafeInteger(n))throw new Error('Nominal terbilang tidak valid.');
 const words=['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];
 function say(v){
  if(v<12)return words[v];
  if(v<20)return say(v-10)+' belas';
  if(v<100)return say(Math.floor(v/10))+' puluh '+say(v%10);
  if(v<200)return 'seratus '+say(v-100);
  if(v<1000)return say(Math.floor(v/100))+' ratus '+say(v%100);
  if(v<2000)return 'seribu '+say(v-1000);
  if(v<1000000)return say(Math.floor(v/1000))+' ribu '+say(v%1000);
  if(v<1000000000)return say(Math.floor(v/1000000))+' juta '+say(v%1000000);
  if(v<1000000000000)return say(Math.floor(v/1000000000))+' miliar '+say(v%1000000000);
  return say(Math.floor(v/1000000000000))+' triliun '+say(v%1000000000000);
 }
 const text=(n<0?'minus ':'')+(n===0?'nol':say(Math.abs(n)).trim().replace(/\s+/g,' '))+' rupiah';
 return text.charAt(0).toUpperCase()+text.slice(1);
}
window.RekapTransferInvestorPrint={terbilang,build(data){
period=data.period;
const printedAt=new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const amount=data.amount??Number(String(data.total).replace(/[^0-9-]/g,''));
const words=terbilang(amount);
const css=printCss()+`
.rt-report-top{display:flex;justify-content:space-between;gap:7mm;align-items:flex-start;margin:2mm 0 7mm}
.rt-report-title h1{font-size:17pt;line-height:1.2;margin:0 0 5mm;font-weight:800}
.rt-investor-label,.rt-period-label,.rt-amount-label{font-size:6.7pt;letter-spacing:.1em;color:#6c7480;text-transform:uppercase;font-weight:700}
.rt-report-title h2{font-size:13pt;margin:1.5mm 0 0;max-width:115mm}
.rt-report-period{text-align:right;min-width:55mm}.rt-report-period strong{display:block;font-size:18pt;line-height:1.2;margin-top:2mm;color:#242b35}
.rt-amount{padding:5mm 5mm 4mm;border:1px solid #d9d3c2;border-left:1.2mm solid #bd963b;background:#fbfaf5;margin-bottom:6mm;break-inside:avoid}
.rt-amount strong{display:block;font-size:25pt;line-height:1.15;margin:2.5mm 0;color:#18212b}.rt-terbilang{font-size:9pt;line-height:1.5;color:#505866;font-style:italic;max-width:165mm}
.rt-table{width:100%;border-collapse:collapse;table-layout:fixed}
.rt-table th,.rt-table td{border-bottom:1px solid #ddd;padding:3mm 1.5mm;font-size:8pt;vertical-align:top}
.rt-table th{background:#f0f1ed;text-align:left;font-size:7pt;color:#3b424b}
.rt-table .num{text-align:right;white-space:nowrap}.rt-table small{display:block;font-size:6.5pt;color:#666;line-height:1.5;margin-top:1mm}
.rt-table .badge{font-size:6.3pt;font-weight:700}.rt-table .pending{color:#8a5800}.rt-table tfoot{background:#edf2ed;font-weight:bold}
.rt-table tr{break-inside:avoid}.rt-table th:first-child{width:25%}.rt-table th:last-child{width:21%}.rt-table th:nth-child(2),.rt-table th:nth-child(3),.rt-table th:nth-child(4){width:18%}
.warn{font-size:8pt;line-height:1.5}.master-head .logo{width:15mm;height:15mm}.rt-table-wrap{overflow:visible}.master-head .brand{flex-shrink:0}.master-head .brand-copy h1{white-space:nowrap}.master-head .logo{flex-shrink:0}
`;
return '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>'+esc('Rekap Transfer '+data.name+' '+data.period)+'</title><style>'+css+'</style></head><body><table class="page-frame"><thead><tr><td><div class="head-space">'+masterHeader()+'</div></td></tr></thead><tfoot><tr><td><div class="foot-space">'+masterFooter(data.name,printedAt)+'</div></td></tr></tfoot><tbody><tr><td><main class="content"><section class="rt-report-top"><div class="rt-report-title"><h1>Rekap Transfer Investor</h1><div class="rt-investor-label">Investor</div><h2>'+esc(data.name)+'</h2></div><div class="rt-report-period"><span class="rt-period-label">Periode laporan</span><strong>'+esc(data.period)+'</strong></div></section><section class="rt-amount"><div class="rt-amount-label">Total transfer investor</div><strong>'+esc(data.total)+'</strong><div class="rt-terbilang">'+esc(words)+'</div></section>'+(data.pending?'<div class="warn">BELUM FINAL</div>':'')+data.table+'</main></td></tr></tbody></table></body></html>';
},open(data){
 const w=window.open('','_blank');if(!w)throw new Error('Izinkan popup untuk cetak/PDF.');
 w.document.open();w.document.write(this.build(data));w.document.close();
 Promise.all([...w.document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.onload=resolve;i.onerror=resolve}))).then(()=>{w.focus();w.print()});
}};
})();
