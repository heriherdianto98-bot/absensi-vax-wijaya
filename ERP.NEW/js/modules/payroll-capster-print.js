/* VAX ERP — Unified Payroll Print Presenter
   Header/footer mengikuti pola MASTER PRINT Tabel Harian Semua Cabang.
   Output: A4 portrait untuk Print / Save as PDF.
   UI only: Owner and Supervisor signatures are print presentation assets.
*/
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const text=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim();
  const nowWib=()=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'long',timeStyle:'short'}).format(new Date());

  function snapshot(){
    const month=text(document.getElementById('payrollPeriodLabel'))||'—';
    const employeeSelect=document.getElementById('payrollEmployee');
    const employeeLabel=employeeSelect?.selectedOptions?.[0]?.textContent||'Semua Karyawan Cabang';
    const branchLabel=document.getElementById('payrollBranch')?.selectedOptions?.[0]?.textContent||'—';
    const cards=[...document.querySelectorAll('.payroll-employee-card')].map(card=>({
      name:text(card.querySelector('.payroll-person h3')),
      info:text(card.querySelector('.payroll-person p')),
      rows:[...card.querySelectorAll('.payroll-table tbody tr')].map(tr=>[...tr.cells].map(td=>text(td))),
      sums:[...card.querySelectorAll('.payroll-sum')].map(x=>({label:text(x.querySelector('span')),value:text(x.querySelector('strong'))}))
    }));
    return {month,employeeLabel,branchLabel,cards};
  }

  function css(){return `
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A4 portrait;margin:8mm 8mm 8mm}
    html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#171717;background:#fff;font-size:8.5pt}
    .page-frame{width:100%;border-collapse:collapse;table-layout:fixed}
    .page-frame>thead{display:table-header-group}.page-frame>tfoot{display:table-footer-group}
    .page-frame>thead>tr>td,.page-frame>tfoot>tr>td,.page-frame>tbody>tr>td{padding:0;border:0;vertical-align:top}
    .head-space{height:24mm}.foot-space{height:40mm}
    .master-head{height:20mm;background:#fff}.master-head-inner{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;height:15mm}
    .brand{display:flex;align-items:center;gap:4mm}.logo{width:14mm;height:14mm;object-fit:contain}.brand-copy h1{margin:0;font-size:14pt;font-weight:800;letter-spacing:.035em;line-height:1.05}
    .brand-copy .report-name{margin-top:1.2mm;font-size:7.2pt;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.brand-copy .system{margin-top:.8mm;font-size:6.6pt;color:#666}
    .head-right{text-align:right;padding-top:.6mm}.head-right .doc{font-size:6.6pt;color:#666;letter-spacing:.08em;text-transform:uppercase}.head-right strong{display:block;margin-top:1mm;font-size:7.3pt;letter-spacing:.08em}
    .gold-rule{height:1mm;background:#d4af37;margin-top:2.5mm}
    .master-foot{height:10mm;border-top:1px solid #b8b8b8;background:#fff;padding-top:2mm;display:flex;justify-content:space-between;align-items:flex-start;color:#666;font-size:6.2pt}.master-foot strong{color:#111}.foot-center{text-align:center;flex:1}.foot-right{text-align:right}
    .content{padding:0}.report-title{margin:0 0 2.5mm}.report-title h2{font-size:14pt;margin:0}.report-title p{margin:.7mm 0 0;color:#666;font-size:7.4pt}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 10mm;border:1px solid #d5d5d5;padding:2.2mm 4mm;margin-bottom:3mm}.meta .item{display:flex;justify-content:space-between;gap:5mm}.meta .lbl{color:#666}.meta .val{font-weight:700;text-align:right}
    .employee{border:1px solid #aaa;margin-bottom:2.5mm;break-inside:avoid-page;page-break-inside:avoid}.emp-head{display:flex;justify-content:space-between;gap:5mm;padding:2.2mm 4mm;border-bottom:1px solid #aaa;background:#f5f5f5}.emp-head h3{margin:0;font-size:11pt}.emp-head p{margin:.7mm 0 0;font-size:7pt;color:#666}.net{text-align:right}.net span{display:block;font-size:7pt;color:#666;text-transform:uppercase}.net strong{font-size:12pt}
    .tbl{width:100%;border-collapse:collapse}.tbl thead{display:table-header-group}.tbl th,.tbl td{border-bottom:1px solid #ddd;padding:1.15mm 1.35mm;font-size:6.9pt}.tbl th{background:#fafafa;text-transform:uppercase;font-size:6.2pt;text-align:left;white-space:nowrap}.tbl .num{text-align:right;white-space:nowrap}.tbl tr{break-inside:avoid;page-break-inside:avoid}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1.5mm;padding:2mm}.sum{border:1px solid #c7d0da;border-top-width:1.4mm;padding:1.55mm;background:#f7fafc;border-radius:1.2mm}.sum span{display:block;color:#53616f;font-size:6.2pt;font-weight:800;text-transform:uppercase;letter-spacing:.03em}.sum strong{display:block;margin-top:.7mm;font-size:8.6pt;color:#172233}
    .sum:nth-child(1){border-top-color:#42b8e8;background:#eef9fd}.sum:nth-child(1) span{color:#177ba3}.sum:nth-child(2){border-top-color:#e45b62;background:#fff2f3}.sum:nth-child(2) span,.sum:nth-child(2) strong{color:#b63c45}.sum:nth-child(3){border-top-color:#e6a23c;background:#fff8ea}.sum:nth-child(3) span{color:#a86a08}.sum:nth-child(4){border-top-color:#36b37e;background:#effaf5}.sum:nth-child(4) span{color:#167953}.sum:nth-child(5){border-top-color:#8c77d9;background:#f5f2ff}.sum:nth-child(5) span{color:#6652ad}.sum:nth-child(6){border-top-color:#43c5cf;background:#eefbfd}.sum:nth-child(6) span{color:#187f87}.sum:nth-child(7){border-top-color:#d4af37;background:#fff9e6}.sum:nth-child(7) span,.sum:nth-child(7) strong{color:#8c6b00}
    .empty{text-align:center;padding:8mm;color:#777}
    .sign{margin-top:2.5mm;display:grid;grid-template-columns:1fr 1fr;gap:20mm;align-items:end;break-inside:avoid;page-break-inside:avoid}.sign .box{text-align:center;min-height:25mm}
    .supervisor-sign .who,.owner-sign .who{font-size:7.5pt;font-weight:700;color:#172233}.supervisor-sign .auth-role,.owner-sign .auth-role{margin-top:.5mm;font-size:6.5pt;font-weight:800;letter-spacing:.12em;color:#697481;text-transform:uppercase}
    .supervisor-sign .stage,.owner-sign .stage{height:14mm;width:100%;margin:.3mm auto .7mm;display:flex;align-items:center;justify-content:center;overflow:visible}.supervisor-sign .ttd img{display:block;width:42mm;height:16mm;object-fit:contain;object-position:center}.owner-sign .ttd img{max-width:38mm;max-height:13.5mm;object-fit:contain}
    .supervisor-sign .name,.owner-sign .name{font-size:8.5pt;font-weight:800;color:#172233}.supervisor-sign .supervisor-line,.owner-sign .owner-line{height:1px;background:#333;width:40mm;margin:.7mm auto .7mm}.supervisor-sign .job,.owner-sign .job{font-size:6.5pt;font-weight:900;letter-spacing:.16em;color:#697481}
    @media print{.sign{position:fixed;left:0;right:0;bottom:11mm;z-index:4;margin-top:0}.master-foot{position:fixed;left:0;right:0;bottom:0;z-index:5}}
    @media screen{body{padding:16px;background:#f3f1ea}.page-frame{background:#fff;max-width:210mm;margin:auto;box-shadow:0 8px 28px rgba(0,0,0,.12)}.page-frame>thead,.page-frame>tfoot{display:table-row-group}.head-space,.foot-space{height:auto}.master-head{height:auto;padding:16px 20px 0}.master-foot{height:auto;margin:0 20px;padding:10px 0 16px}.content{padding:0 20px 20px}}
  `;}

  function cardHtml(c){
    const rows=c.rows.length?c.rows.map(r=>`<tr><td>${esc(r[0]||'')}</td><td>${esc(r[1]||'')}</td><td class="num">${esc(r[2]||'')}</td><td class="num">${esc(r[3]||'')}</td><td class="num">${esc(r[4]||'')}</td><td class="num">${esc(r[5]||'')}</td><td class="num">${esc(r[6]||'')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">Tidak ada aktivitas.</td></tr>';
    const sums=c.sums.map(s=>`<div class="sum"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join('');
    const net=c.sums.find(s=>/gaji bersih/i.test(s.label))?.value||'—';
    return `<section class="employee"><div class="emp-head"><div><h3>${esc(c.name)}</h3><p>${esc(c.info)}</p></div><div class="net"><span>Gaji Bersih</span><strong>${esc(net)}</strong></div></div><table class="tbl"><thead><tr><th>Tanggal</th><th>Cabang Kerja</th><th class="num">Service</th><th class="num">Gaji Pokok</th><th class="num">Denda</th><th class="num">Kasbon</th><th class="num">Bonus Produk</th></tr></thead><tbody>${rows}</tbody></table><div class="summary">${sums}</div></section>`;
  }

  function open(mode='print'){
    const snap=snapshot();if(!snap.cards.length){alert('Tidak ada data payroll untuk dicetak.');return;}
    const w=window.open('','_blank');if(!w){alert('Popup print diblokir browser.');return;}
    const logo='../assets/logo-vax-wijaya.png';
    const ownerSignatureUrl=new URL('../assets/owner-signature.png',window.location.href).href;
    const supervisorSignatureUrl=new URL('../assets/supervisor-signature-rangga.svg',window.location.href).href;
    const printedAt=nowWib();
    const header=`<header class="master-head"><div class="master-head-inner"><div class="brand"><img class="logo" src="${logo}" onerror="this.style.display='none'" alt="VAX"><div class="brand-copy"><h1>ERP VAX WIJAYA</h1><div class="report-name">PAYROLL KARYAWAN</div><div class="system">Enterprise Management System</div></div></div><div class="head-right"><div class="doc">DOKUMEN OPERASIONAL</div><strong>INTERNAL</strong></div></div><div class="gold-rule"></div></header>`;
    const footer=`<footer class="master-foot"><div><strong>ERP VAX WIJAYA</strong><br>Payroll Karyawan</div><div class="foot-center">${esc(snap.month)} · ${esc(snap.branchLabel)}</div><div class="foot-right">Dicetak ${esc(printedAt)} WIB<br>Dokumen Internal</div></footer>`;
    const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Payroll Karyawan ${esc(snap.month)}</title><style>${css()}</style></head><body>
      <table class="page-frame"><thead><tr><td><div class="head-space">${header}</div></td></tr></thead><tfoot><tr><td><div class="foot-space">${footer}</div></td></tr></tfoot><tbody><tr><td><main class="content">
        <section class="report-title"><h2>MASTER GAJI KARYAWAN</h2><p>Gaji Pokok − Denda − Kasbon + Bonus Insentif + Bonus KPI + Bonus Produk</p></section>
        <section class="meta"><div class="item"><span class="lbl">Periode</span><span class="val">${esc(snap.month)}</span></div><div class="item"><span class="lbl">Cabang</span><span class="val">${esc(snap.branchLabel)}</span></div><div class="item"><span class="lbl">Karyawan</span><span class="val">${esc(snap.employeeLabel)}</span></div><div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${esc(printedAt)} WIB</span></div></section>
        ${snap.cards.map(cardHtml).join('')}
        <section class="sign"><div class="box supervisor-sign"><div class="who">Disetujui / Mengetahui,</div><div class="auth-role">Otorisasi Supervisor</div><div class="stage"><div class="ttd"><img src="${supervisorSignatureUrl}" alt="Tanda tangan Supervisor" onerror="this.style.display='none'"></div></div><div class="name">Rangga Putra Pratama</div><div class="supervisor-line"></div><div class="job">SUPERVISOR</div></div><div class="box owner-sign"><div class="who">Disetujui / Mengetahui,</div><div class="auth-role">Otorisasi Owner</div><div class="stage"><div class="ttd"><img src="${ownerSignatureUrl}" alt="Tanda tangan Owner" onerror="this.style.display='none'"></div></div><div class="name">Heri Herdianto</div><div class="owner-line"></div><div class="job">OWNER</div></div></section>
      </main></td></tr></tbody></table>
      <script>window.addEventListener('load',async()=>{await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.addEventListener('load',resolve,{once:true});i.addEventListener('error',resolve,{once:true});})));setTimeout(()=>window.print(),120);});<\/script></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }
  window.PayrollCapsterPrint={open};
})();
