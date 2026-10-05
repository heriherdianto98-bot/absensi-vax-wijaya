/* VAX ERP — Unified Payroll Print Presenter
   Header/footer mengikuti pola MASTER PRINT Tabel Harian Semua Cabang.
   Output: A4 portrait untuk Print / Save as PDF.
   UI only: Owner and Supervisor signatures are print presentation assets.
*/
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const text=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim();
  const nowWib=()=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'long',timeStyle:'short'}).format(new Date());
  const rupiah=n=>'Rp '+new Intl.NumberFormat('id-ID').format(Math.round(Number(n)||0));
  const parseRupiah=v=>Number(String(v||'').replace(/[^0-9-]/g,''))||0;

  function snapshot(){
    const month=text(document.getElementById('payrollPeriodLabel'))||'—';
    const employeeSelect=document.getElementById('payrollEmployee');
    const branchSelect=document.getElementById('payrollBranch');
    const employeeLabel=employeeSelect?.selectedOptions?.[0]?.textContent||'Semua Karyawan Cabang';
    const branchLabel=branchSelect?.selectedOptions?.[0]?.textContent||'—';
    const branchId=String(branchSelect?.value||'').trim();
    const cards=[...document.querySelectorAll('.payroll-employee-card')].map(card=>{
      const employeeId=Number(card.dataset.employeeId);
      const manualFine=Math.max(0,Number(window.__preErpFineRows?.get?.(employeeId)?.amount||0));
      const sums=[...card.querySelectorAll('.payroll-sum')].map(x=>({label:text(x.querySelector('span')),value:text(x.querySelector('strong'))}));
      if(manualFine>0){
        const fine=sums.find(s=>/^denda$/i.test(s.label));
        if(fine) fine.value=rupiah(parseRupiah(fine.value)+manualFine);
      }
      return {
        employeeId:String(card.dataset.employeeId||'').trim(),
        name:text(card.querySelector('.payroll-person h3')),
        info:text(card.querySelector('.payroll-person p')),
        rows:[...card.querySelectorAll('.payroll-table tbody tr')].map(tr=>[...tr.cells].map(td=>text(td))),
        sums,
        payoutNet:card.dataset.vaxPayoutNet?Number(card.dataset.vaxPayoutNet):null,
        displayNet:text(card.querySelector('.payroll-sum.is-net strong'))
      };
    });
    return {month,employeeLabel,branchLabel,branchId,cards};
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
    .brand{display:flex;align-items:center;gap:4mm}.logo{width:14mm;height:14mm;object-fit:contain}.brand-copy h1{margin:0;font-size:15pt;font-weight:800;letter-spacing:.035em;line-height:1.05}
    .brand-copy .report-name{margin-top:1.2mm;font-size:7.2pt;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.brand-copy .system{margin-top:.8mm;font-size:6.6pt;color:#666}
    .head-right{text-align:right;padding-top:.6mm}.head-right .doc{font-size:6.6pt;color:#666;letter-spacing:.08em;text-transform:uppercase}.head-right strong{display:block;margin-top:1mm;font-size:7.3pt;letter-spacing:.08em}
    .gold-rule{height:1mm;background:#d4af37;margin-top:2.5mm}
    .master-foot{height:10mm;border-top:1px solid #b8b8b8;background:#fff;padding-top:2mm;display:flex;justify-content:space-between;align-items:flex-start;color:#666;font-size:6.2pt}.master-foot strong{color:#111}.foot-center{text-align:center;flex:1}.foot-right{text-align:right}
    .content{padding:0}.report-title{margin:0 0 2.5mm}.report-title h2{font-size:14pt;margin:0}.report-title p{margin:.7mm 0 0;color:#666;font-size:7.4pt}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 10mm;border:1px solid #d5d5d5;padding:2.2mm 4mm;margin-bottom:3mm}.meta .item{display:flex;justify-content:space-between;gap:5mm}.meta .lbl{color:#666}.meta .val{font-weight:700;text-align:right}
    .employee{border:1px solid #9fa4aa;margin-bottom:2.5mm;break-inside:avoid-page;page-break-inside:avoid}.emp-head{display:flex;justify-content:space-between;gap:5mm;padding:2.5mm 4mm;border-bottom:1px solid #9fa4aa;background:#e9ebee}.emp-head h3{margin:0;font-size:11.5pt}.emp-head p{margin:.8mm 0 0;font-size:7.3pt;color:#555}.id-badge{display:inline-block;margin-left:2mm;padding:.45mm 1.5mm;border:1px solid #b8bdc3;border-radius:2mm;background:#f7f8f9;color:#545b63;font-size:6.2pt;font-weight:700;vertical-align:middle}.net{text-align:right}.net span{display:block;font-size:7.2pt;color:#626971;text-transform:uppercase;font-weight:700}.net strong{font-size:12.5pt}
    .tbl{width:100%;border-collapse:collapse}.tbl thead{display:table-header-group}.tbl th,.tbl td{border-bottom:1px solid #d2d5d8;padding:1.15mm 1.35mm;font-size:7.1pt}.tbl th{background:#e5e7ea;text-transform:uppercase;font-size:6.5pt;font-weight:800;text-align:left;white-space:nowrap;border-bottom:1.2px solid #969ca3}.tbl .num{text-align:right;white-space:nowrap}.tbl tr{break-inside:avoid;page-break-inside:avoid}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1.5mm;padding:2mm}.sum{border:1px solid #c4c8cc;border-top:1.2px solid #9da3a9;padding:1.55mm;background:#eef0f2;border-radius:1.2mm}.sum span{display:block;color:#5f666d;font-size:6.2pt;font-weight:800;text-transform:uppercase;letter-spacing:.03em}.sum strong{display:block;margin-top:.7mm;font-size:8.6pt;color:#1d2329}
    .sum:nth-child(n){border-top-color:#9da3a9;background:#eef0f2}.sum:nth-child(n) span,.sum:nth-child(n) strong{color:#1d2329}.sum:nth-child(n) span{color:#5f666d}.payout-note{font-size:6.8pt;padding:0 2mm 1mm;color:#3b4550}
    .empty{text-align:center;padding:8mm;color:#777}
    .sign{margin-top:2.5mm;display:grid;grid-template-columns:1fr 1fr;gap:20mm;align-items:end;break-inside:avoid;page-break-inside:avoid}.sign .box{text-align:center;min-height:25mm}
    .supervisor-sign .who,.owner-sign .who{font-size:7.5pt;font-weight:700;color:#172233}.supervisor-sign .auth-role,.owner-sign .auth-role{margin-top:.5mm;font-size:6.5pt;font-weight:800;letter-spacing:.12em;color:#697481;text-transform:uppercase}
    .supervisor-sign .stage,.owner-sign .stage{height:14mm;width:100%;margin:.3mm auto .7mm;display:flex;align-items:center;justify-content:center;overflow:visible}.supervisor-sign .ttd img{display:block;width:30mm;height:11mm;object-fit:contain;object-position:center}.owner-sign .ttd img{max-width:38mm;max-height:13.5mm;object-fit:contain}
    .supervisor-sign .name,.owner-sign .name{font-size:8.5pt;font-weight:800;color:#172233}.supervisor-sign .supervisor-line,.owner-sign .owner-line{height:1px;background:#333;width:40mm;margin:.7mm auto .7mm}.supervisor-sign .job,.owner-sign .job{font-size:6.5pt;font-weight:900;letter-spacing:.16em;color:#697481}
    /* Employee slip body only. Shared header, footer and approval signatures stay unchanged. */
    .employee-slip .slip-profile{display:grid;grid-template-columns:1fr 1fr;gap:2mm 8mm;padding:3mm 4mm;margin-bottom:3mm;border:1px solid #d5dde8;border-left:3px solid #c9a84a;background:#f6f8fb}
    .employee-slip .slip-field span{display:block;color:#6b7a8c;font-size:6.8pt;font-weight:800;text-transform:uppercase}
    .employee-slip .slip-field strong{display:block;margin-top:.5mm;font-size:9.5pt;color:#2a3544}
    .employee-slip .slip-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1.5mm;margin-bottom:4mm}
    .employee-slip .slip-total{padding:3mm;border:1px solid #d5dde8;border-top:2px solid #c9a84a;background:#fff}
    .employee-slip .slip-total span{display:block;color:#6b7a8c;font-size:7pt;font-weight:800;text-transform:uppercase}
    .employee-slip .slip-total strong{display:block;margin-top:1mm;color:#243b55;font-size:12pt;white-space:nowrap}
    .employee-slip .slip-total.is-net{background:#fcfaf3;border-color:#e2d4a8}
    .employee-slip .slip-total.is-net strong{color:#8a6414}
    .employee-slip .slip-section-title{margin:0 0 2mm;padding-bottom:1mm;border-bottom:1px solid #d5dde8;color:#243b55;font-size:10pt}
    .employee-slip .slip-daily{width:100%;border-collapse:collapse;table-layout:fixed}
    .employee-slip .slip-daily th{background:#2f4a68;color:#fff;text-align:left;font-size:7.5pt;text-transform:uppercase}
    .employee-slip .slip-daily th,.employee-slip .slip-daily td{padding:1.4mm 2mm;border:1px solid #e2e8f0}
    .employee-slip .slip-daily td{font-size:8.4pt;color:#2a3544}
    .employee-slip .slip-daily .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .employee-slip .slip-daily tbody tr:nth-child(even){background:#f8fafc}
    .employee-slip .slip-attendance{margin-top:4mm;break-inside:avoid;page-break-inside:avoid}
    .employee-slip .slip-attendance-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.5mm}
    .employee-slip .slip-attendance-item{padding:2.5mm 1mm;border:1px solid #d5dde8;background:#f6f8fb;text-align:center}
    .employee-slip .slip-attendance-item span{display:block;color:#6b7a8c;font-size:6.5pt;font-weight:800;text-transform:uppercase}
    .employee-slip .slip-attendance-item strong{display:block;margin-top:1mm;color:#243b55;font-size:12pt}
    .employee-slip .slip-attendance-note{margin:1.5mm 0 0;color:#6b7a8c;font-size:7pt}
    .employee-slip .slip-note{margin:3mm 0 0;padding:2mm 3mm;border:1px solid #e6ebf0;background:#fafbfc;color:#6b7a8c;font-size:7.5pt}
    @media print{
      .employee-slip-print .foot-space{height:12mm}
      .employee-slip-print .sign{position:static;left:auto;right:auto;bottom:auto;margin-top:2mm}
      .employee-slip-print .sign .box{min-height:20mm}
      .employee-slip-print .supervisor-sign .stage,.employee-slip-print .owner-sign .stage{height:10mm}
      .employee-slip-print .slip-profile{padding:2mm 3mm;gap:1mm 7mm;margin-bottom:2mm}
      .employee-slip-print .slip-field strong{font-size:8pt;margin-top:.2mm}
      .employee-slip-print .slip-summary{margin-bottom:2mm}
      .employee-slip-print .slip-total{padding:1.5mm 2mm}
      .employee-slip-print .slip-total strong{font-size:9.5pt;margin-top:.4mm}
      .employee-slip-print .slip-daily th,.employee-slip-print .slip-daily td{padding:.2mm .8mm;font-size:6.5pt;line-height:1}
      .employee-slip-print .slip-attendance{margin-top:2mm}
      .employee-slip-print .slip-attendance-item{padding:1.5mm 1mm}
      .employee-slip-print .slip-attendance-item strong{font-size:9.5pt;margin-top:.5mm}
      .employee-slip-print .slip-note{margin-top:1.5mm;padding:1mm 2mm}
      .employee{break-inside:auto;page-break-inside:auto;margin-bottom:1mm}
      .report-title{margin-bottom:1.1mm}.report-title h2{font-size:11.8pt}.report-title p{margin-top:.2mm;font-size:6.4pt}
      .meta{gap:.55mm 8mm;padding:1mm 3mm;margin-bottom:1mm;font-size:6.9pt}.meta .item{gap:3mm}
      .emp-head{padding:1.45mm 3mm;background:#e9ebee}.emp-head h3{font-size:10.7pt}.emp-head p{margin:.25mm 0 0;font-size:6.7pt}.id-badge{margin-left:1.2mm;padding:.25mm 1mm;font-size:5.5pt}.net span{font-size:6.5pt}.net strong{font-size:11.5pt}
      .tbl th,.tbl td{padding:.58mm .85mm;font-size:6.55pt;line-height:1.06}.tbl th{font-size:6.05pt;padding-top:.72mm;padding-bottom:.72mm;background:#e5e7ea}.tbl tr{break-inside:avoid;page-break-inside:avoid}
      .summary{gap:.7mm;padding:.75mm}.sum{padding:.68mm;border-top-width:1px;background:#eef0f2}.sum span{font-size:5.25pt}.sum strong{margin-top:.2mm;font-size:7pt}
      .sign{position:fixed;left:0;right:0;bottom:11mm;z-index:4;margin-top:0}.master-foot{position:fixed;left:0;right:0;bottom:0;z-index:5}
    }
    @media screen{body{padding:16px;background:#f3f1ea}.page-frame{background:#fff;max-width:210mm;margin:auto;box-shadow:0 8px 28px rgba(0,0,0,.12)}.page-frame>thead,.page-frame>tfoot{display:table-row-group}.head-space,.foot-space{height:auto}.master-head{height:auto;padding:16px 20px 0}.master-foot{height:auto;margin:0 20px;padding:10px 0 16px}.content{padding:0 20px 20px}}
  `;}

  function cardHtml(c,branchId){
    const rows=c.rows.length?c.rows.map(r=>`<tr><td>${esc(r[0]||'')}</td><td>${esc(r[1]||'')}</td><td class="num">${esc(r[2]||'')}</td><td class="num">${esc(r[3]||'')}</td><td class="num">${esc(r[4]||'')}</td><td class="num">${esc(r[5]||'')}</td><td class="num">${esc(r[6]||'')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">Tidak ada aktivitas.</td></tr>';
    const sums=c.sums.map(s=>`<div class="sum"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join('');
    const net=c.sums.find(s=>/pendapatan bersih|gaji bersih/i.test(s.label))?.value||c.displayNet||'—';
    const employeeId=c.employeeId?`<span class="id-badge">ID Karyawan #${esc(c.employeeId)}</span>`:'';
    const branchIdBadge=branchId?`<span class="id-badge">ID Cabang #${esc(branchId)}</span>`:'';
    const note=c.payoutNet!=null&&rupiah(c.payoutNet)!==net?`<p class="payout-note">Pendapatan bersih setelah denda final; gaji yang dicairkan ${esc(rupiah(c.payoutNet))}. Denda harian yang telah dibayar tidak dipotong ulang.</p>`:'';
    return `<section class="employee"><div class="emp-head"><div><h3>${esc(c.name)}${employeeId}</h3><p>${esc(c.info)}${branchIdBadge}</p></div><div class="net"><span>Pendapatan Bersih</span><strong>${esc(net)}</strong></div></div><table class="tbl"><thead><tr><th>Tanggal</th><th>Cabang Kerja</th><th class="num">Service</th><th class="num">Gaji Pokok</th><th class="num">Denda</th><th class="num">Kasbon</th><th class="num">Share Produk</th></tr></thead><tbody>${rows}</tbody></table><div class="summary">${sums}</div>${note}</section>`;
  }

  function employeeSlipHtml(slip,printedAt){
    const rows=(Array.isArray(slip.dailyRows)?slip.dailyRows:[]).map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="num">${esc(r[2])}</td><td class="num">${esc(r[3])}</td><td class="num">${esc(r[4])}</td><td class="num">${esc(r[5])}</td><td class="num">${esc(r[6])}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Belum ada data untuk periode ini.</td></tr>';
    const payrollDetails=Array.isArray(slip.payrollDetails)&&slip.payrollDetails.length
      ? slip.payrollDetails
      : [{label:'Share Bruto',value:slip.share},{label:'Total Denda',value:slip.denda},{label:'Net Diterima',value:slip.net}];
    const payrollCards=payrollDetails.map(item=>`<div class="slip-total${/pendapatan bersih|hak dibayar|net diterima/i.test(item.label)?' is-net':''}"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join('');
    const attendance=slip.attendance;
    const attendanceItems=attendance
      ? [['Hadir tepat waktu',attendance.masuk],['Terlambat',attendance.terlambat],['Izin',attendance.izin],['Sakit',attendance.sakit],['Libur',attendance.libur]]
          .map(([label,value])=>`<div class="slip-attendance-item"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')
      : '<p class="slip-attendance-note">Ringkasan kehadiran belum dapat dimuat.</p>';
    return `<div class="employee-slip"><section class="report-title"><h2>SLIP GAJI KARYAWAN</h2><p>Bukti penghasilan sesuai periode aktif pada Gaji Saya.</p></section>
      <section class="slip-profile"><div class="slip-field"><span>Nama</span><strong>${esc(slip.nama)}</strong></div><div class="slip-field"><span>Periode</span><strong>${esc(slip.periode)}</strong></div>
      <div class="slip-field"><span>Jabatan</span><strong>${esc(slip.jabatan)}</strong></div><div class="slip-field"><span>Tanggal Cetak</span><strong>${esc(printedAt)} WIB</strong></div>
      <div class="slip-field"><span>Cabang</span><strong>${esc(slip.cabang)}</strong></div></section>
      <section class="slip-summary">${payrollCards}</section>
      <h3 class="slip-section-title">Rincian Harian</h3><table class="slip-daily"><colgroup><col style="width:16%"><col style="width:23%"><col style="width:8%"><col style="width:15%"><col style="width:12%"><col style="width:12%"><col style="width:14%"></colgroup><thead><tr><th>Tanggal</th><th>Cabang Kerja</th><th class="num">Service</th><th class="num">Gaji Pokok</th><th class="num">Denda</th><th class="num">Kasbon</th><th class="num">Share Produk</th></tr></thead><tbody>${rows}</tbody></table>
      <section class="slip-attendance"><h3 class="slip-section-title">Ringkasan Kehadiran · ${esc(slip.periode)}</h3><div class="slip-attendance-grid">${attendanceItems}</div></section>
      <p class="slip-note">Nilai slip mengikuti data penghasilan dan denda yang tercatat di ERP untuk karyawan pemegang akun.</p></div>`;
  }

  function openSnapshot(snap,assets={}){
    if(!snap?.cards?.length){alert('Tidak ada data payroll untuk dicetak.');return;}
    const w=window.open('','_blank');if(!w){alert('Popup print diblokir browser.');return;}
    const logo=assets.logo||new URL('../assets/brand/erp-vax-wijaya.png',window.location.href).href;
    const ownerSignatureUrl=assets.ownerSignatureUrl||new URL('../assets/owner-signature.png',window.location.href).href;
    const supervisorSignatureUrl=assets.supervisorSignatureUrl||new URL('../assets/supervisor-signature-rangga.svg',window.location.href).href;
    const printedAt=nowWib();
    const header=`<header class="master-head"><div class="master-head-inner"><div class="brand"><img class="logo" src="${logo}" onerror="this.style.display='none'" alt="VAX"><div class="brand-copy"><h1>ERP VAX WIJAYA</h1><div class="report-name">PAYROLL KARYAWAN</div><div class="system">Enterprise Management System</div></div></div><div class="head-right"><div class="doc">DOKUMEN OPERASIONAL</div><strong>INTERNAL</strong></div></div><div class="gold-rule"></div></header>`;
    const footer=`<footer class="master-foot"><div><strong>ERP VAX WIJAYA</strong><br>Payroll Karyawan</div><div class="foot-center">${esc(snap.month)} · ${esc(snap.branchLabel)}</div><div class="foot-right">Dicetak ${esc(printedAt)} WIB<br>Dokumen Internal</div></footer>`;
    const reportContent=snap.presentation==='employee-slip'&&snap.employeeSlip?employeeSlipHtml(snap.employeeSlip,printedAt):`        <section class="report-title"><h2>MASTER GAJI KARYAWAN</h2><p>Pendapatan Kotor − Denda − Kasbon + Bonus Insentif + Bonus KPI + Share Produk</p></section>
        <section class="meta"><div class="item"><span class="lbl">Periode</span><span class="val">${esc(snap.month)}</span></div><div class="item"><span class="lbl">Cabang</span><span class="val">${esc(snap.branchLabel)}</span></div><div class="item"><span class="lbl">Karyawan</span><span class="val">${esc(snap.employeeLabel)}</span></div><div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${esc(printedAt)} WIB</span></div></section>
        ${snap.cards.map(c=>cardHtml(c,snap.branchId)).join('')}`;
    const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Payroll Karyawan ${esc(snap.month)}</title><style>${css()}</style></head><body class="${snap.presentation==='employee-slip'?'employee-slip-print':''}">
      <table class="page-frame"><thead><tr><td><div class="head-space">${header}</div></td></tr></thead><tbody><tr><td><main class="content">
        ${reportContent}
        <section class="sign"><div class="box supervisor-sign"><div class="who">Disetujui / Mengetahui,</div><div class="auth-role">Otorisasi Supervisor</div><div class="stage"><div class="ttd"><img src="${supervisorSignatureUrl}" alt="Tanda tangan Supervisor" onerror="this.style.display='none'"></div></div><div class="name">Rangga Putra Pratama</div><div class="supervisor-line"></div><div class="job">SUPERVISOR</div></div><div class="box owner-sign"><div class="who">Disetujui / Mengetahui,</div><div class="auth-role">Otorisasi Owner</div><div class="stage"><div class="ttd"><img src="${ownerSignatureUrl}" alt="Tanda tangan Owner" onerror="this.style.display='none'"></div></div><div class="name">Heri Herdianto</div><div class="owner-line"></div><div class="job">OWNER</div></div></section>
      </main></td></tr></tbody></table>
      <script>window.addEventListener('load',async()=>{await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.addEventListener('load',resolve,{once:true});i.addEventListener('error',resolve,{once:true});})));setTimeout(()=>window.print(),120);});<\/script></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }


  function openConsumerRecap(snap,assets={}){
    if(!snap?.groups?.length){alert('Tidak ada data rekap sesuai filter untuk dicetak.');return;}
    const w=window.open('','_blank');if(!w){alert('Popup print diblokir browser.');return;}
    const logo=assets.logo||new URL('../assets/brand/erp-vax-wijaya.png',window.location.href).href;
    const ownerSignatureUrl=assets.ownerSignatureUrl||new URL('../assets/owner-signature.png',window.location.href).href;
    const supervisorSignatureUrl=assets.supervisorSignatureUrl||new URL('../assets/supervisor-signature-rangga.svg',window.location.href).href;
    const printedAt=nowWib();
    const header=`<header class="master-head"><div class="master-head-inner"><div class="brand"><img class="logo" src="${logo}" onerror="this.style.display='none'" alt="VAX"><div class="brand-copy"><h1>ERP VAX WIJAYA</h1><div class="report-name">PAYROLL KARYAWAN</div><div class="system">Enterprise Management System</div></div></div><div class="head-right"><div class="doc">DOKUMEN OPERASIONAL</div><strong>INTERNAL</strong></div></div><div class="gold-rule"></div></header>`;
    const footer=`<footer class="master-foot"><div><strong>ERP VAX WIJAYA</strong><br>Payroll Karyawan</div><div class="foot-center">${esc(snap.month)} · ${esc(snap.branchLabel)}</div><div class="foot-right">Dicetak ${esc(printedAt)} WIB<br>Dokumen Internal</div></footer>`;
    const groups=snap.groups.map(group=>{
      const headerCells=(group.headers||[]).map(h=>`<th>${esc(h)}</th>`).join('');
      const bodyRows=(group.rows||[]).map(row=>`<tr>${row.map((cell,index)=>`<td class="${index?'num':''}">${esc(cell)}</td>`).join('')}</tr>`).join('');
      const foot=(group.footer||[]).length?`<tfoot><tr>${group.footer.map((cell,index)=>`<th class="${index?'num':''}">${esc(cell)}</th>`).join('')}</tr></tfoot>`:'';
      return `<section class="consumer-group"><h3>${esc(group.title)}</h3><table class="consumer-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody>${foot}</table></section>`;
    }).join('');
    const total=(snap.total||[]).length?`<table class="consumer-table consumer-total"><tbody><tr>${snap.total.map((cell,index)=>`<th class="${index?'num':''}">${esc(cell)}</th>`).join('')}</tr></tbody></table>`:'';
    const consumerCss=`
      @page{size:A4 landscape;margin:8mm 8mm 8mm}
      .consumer-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:1.5mm;border:1px solid #d5d5d5;padding:2.2mm 3mm;margin-bottom:3mm}
      .consumer-meta .item{display:flex;flex-direction:column;gap:.6mm}.consumer-meta .lbl{font-size:6.3pt;color:#666;text-transform:uppercase;font-weight:700}.consumer-meta .val{font-size:8pt;font-weight:800}
      .consumer-group{margin:0 0 3mm;break-inside:auto;page-break-inside:auto}.consumer-group h3{margin:0;padding:1.7mm 2mm;background:#d8b92f;color:#111;font-size:8.5pt;text-transform:uppercase;text-align:center;border:1px solid #8d7728;break-after:avoid-page;page-break-after:avoid}
      .consumer-table{width:100%;border-collapse:collapse;table-layout:fixed}.consumer-table thead{display:table-header-group}.consumer-table tfoot{display:table-row-group}.consumer-table tr{break-inside:avoid;page-break-inside:avoid}.consumer-table th,.consumer-table td{border:1px solid #bfc4c9;padding:1.25mm 1.3mm;font-size:6.5pt;line-height:1.2}.consumer-table thead th{background:#e6e8eb;color:#1a1d20;text-transform:uppercase;font-weight:800;text-align:center}.consumer-table td:first-child,.consumer-table th:first-child{text-align:left;width:22%}.consumer-table .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.consumer-table tfoot th,.consumer-total th{background:#d8b92f!important;color:#111!important;border-color:#8d7728!important;font-weight:800}
      .consumer-total{margin-top:2mm;break-inside:avoid;page-break-inside:avoid}.consumer-total th{padding:1.5mm 1.3mm;font-size:7pt}
      .consumer-final{break-inside:avoid;page-break-inside:avoid;margin-top:2mm}
      .consumer-final .sign{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;z-index:auto!important;margin:4mm 0 2mm!important;break-inside:avoid;page-break-inside:avoid;gap:16mm}
      .consumer-final .sign .box{min-height:19mm}
      .consumer-final .supervisor-sign .stage,.consumer-final .owner-sign .stage{height:10mm;margin:.2mm auto .4mm}
      .consumer-final .supervisor-sign .ttd img{width:27mm;height:9.5mm}
      .consumer-final .owner-sign .ttd img{max-width:34mm;max-height:11mm}
      .consumer-final .master-foot{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;z-index:auto!important;height:auto;margin:0;padding-top:2mm;break-inside:avoid;page-break-inside:avoid}
      @media print{.foot-space{height:0!important}}
    `;
    const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Rekap Payroll ${esc(snap.month)}</title><style>${css()}${consumerCss}</style></head><body>
      <table class="page-frame"><thead><tr><td><div class="head-space">${header}</div></td></tr></thead><tbody><tr><td><main class="content">
        <section class="report-title"><h2>DAFTAR GAJI KARYAWAN</h2><p>Rekap consumer dari hasil payroll utama sesuai filter aktif.</p></section>
        <section class="consumer-meta">
          <div class="item"><span class="lbl">Periode</span><span class="val">${esc(snap.periodLabel||snap.month)}</span></div>
          <div class="item"><span class="lbl">Cabang</span><span class="val">${esc(snap.branchLabel)}</span></div>
          <div class="item"><span class="lbl">Jabatan</span><span class="val">${esc(snap.positionLabel)}</span></div>
          <div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${esc(printedAt)} WIB</span></div>
        </section>
        ${groups}
        <section class="consumer-final">
          ${total}
          <section class="sign"><div class="box supervisor-sign"><div class="who">Disetujui / Mengetahui,</div><div class="auth-role">Otorisasi Supervisor</div><div class="stage"><div class="ttd"><img src="${supervisorSignatureUrl}" alt="Tanda tangan Supervisor" onerror="this.style.display='none'"></div></div><div class="name">Rangga Putra Pratama</div><div class="supervisor-line"></div><div class="job">SUPERVISOR</div></div><div class="box owner-sign"><div class="who">Disetujui / Mengetahui,</div><div class="auth-role">Otorisasi Owner</div><div class="stage"><div class="ttd"><img src="${ownerSignatureUrl}" alt="Tanda tangan Owner" onerror="this.style.display='none'"></div></div><div class="name">Heri Herdianto</div><div class="owner-line"></div><div class="job">OWNER</div></div></section>
          ${footer}
        </section>
      </main></td></tr></tbody></table>
      <script>window.addEventListener('load',async()=>{await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.addEventListener('load',resolve,{once:true});i.addEventListener('error',resolve,{once:true});})));setTimeout(()=>window.print(),120);});<\/script></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }

  function open(mode='print'){
    return openSnapshot(snapshot());
  }

  window.PayrollCapsterPrint={open,openSnapshot,openConsumerRecap};
})();