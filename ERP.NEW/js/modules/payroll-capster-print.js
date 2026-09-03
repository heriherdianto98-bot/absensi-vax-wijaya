/* VAX ERP — Unified Payroll Print Presenter
   Header/footer mengikuti MASTER PRINT Tabel Harian Semua Cabang.
   Output: A4 portrait untuk Print / Save as PDF.
*/
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    @page{size:A4 portrait;margin:26mm 8mm 18mm}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#171717;background:#fff;font-size:8.5pt}
    .sheet{width:100%}

    /* MASTER HEADER — sama pola Tabel Harian Semua Cabang */
    .master-head{position:fixed;top:-20mm;left:0;right:0;height:20mm;background:#fff;z-index:10}
    .master-head-inner{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;height:15mm}
    .brand{display:flex;align-items:center;gap:4mm}.logo{width:14mm;height:14mm;object-fit:contain}
    .brand-copy h1{margin:0;font-size:14pt;font-weight:800;letter-spacing:.035em;line-height:1.05}
    .brand-copy .report-name{margin-top:1.2mm;font-size:7.2pt;font-weight:800;letter-spacing:.15em;text-transform:uppercase}
    .brand-copy .system{margin-top:.8mm;font-size:6.6pt;color:#666}
    .head-right{text-align:right;padding-top:.6mm}.head-right .doc{font-size:6.6pt;color:#666;letter-spacing:.08em;text-transform:uppercase}.head-right strong{display:block;margin-top:1mm;font-size:7.3pt;letter-spacing:.08em}
    .gold-rule{height:1mm;background:#d4af37;margin-top:2.5mm}

    /* MASTER FOOTER — repeating setiap halaman */
    .master-foot{position:fixed;bottom:-12mm;left:0;right:0;height:10mm;border-top:1px solid #b8b8b8;background:#fff;padding-top:2mm;display:flex;justify-content:space-between;align-items:flex-start;color:#666;font-size:6.2pt;z-index:10}
    .master-foot strong{color:#111}.foot-center{text-align:center;flex:1}.foot-right{text-align:right}

    .report-title{margin:0 0 4mm}.report-title h2{font-size:14pt;margin:0}.report-title p{margin:1mm 0 0;color:#666;font-size:7.4pt}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:2mm 10mm;border:1px solid #d5d5d5;padding:3mm 4mm;margin-bottom:5mm}.meta .item{display:flex;justify-content:space-between;gap:5mm}.meta .lbl{color:#666}.meta .val{font-weight:700;text-align:right}
    .employee{border:1px solid #aaa;margin-bottom:5mm;break-inside:auto}.emp-head{display:flex;justify-content:space-between;gap:5mm;padding:3mm 4mm;border-bottom:1px solid #aaa;background:#f5f5f5}.emp-head h3{margin:0;font-size:11pt}.emp-head p{margin:1mm 0 0;font-size:7pt;color:#666}.net{text-align:right}.net span{display:block;font-size:7pt;color:#666;text-transform:uppercase}.net strong{font-size:12pt}
    .tbl{width:100%;border-collapse:collapse}.tbl th,.tbl td{border-bottom:1px solid #ddd;padding:1.8mm 1.5mm;font-size:6.9pt}.tbl th{background:#fafafa;text-transform:uppercase;font-size:6.2pt;text-align:left;white-space:nowrap}.tbl .num{text-align:right;white-space:nowrap}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;padding:3mm}.sum{border:1px solid #ccc;padding:2.2mm}.sum span{display:block;color:#666;font-size:6.2pt;text-transform:uppercase}.sum strong{display:block;margin-top:1mm;font-size:8.6pt}.empty{text-align:center;padding:8mm;color:#777}
    .sign{margin-top:8mm;display:grid;grid-template-columns:1fr 1fr;gap:20mm;break-inside:avoid;page-break-inside:avoid}.sign .box{text-align:center}.sign .space{height:18mm}.sign .line{border-top:1px solid #333;padding-top:1.5mm;font-weight:700}.sign .role{font-size:7pt;color:#666;margin-top:1mm}

    @media screen{
      body{padding:16px;background:#f3f1ea}.sheet{background:#fff;padding:24px;max-width:210mm;margin:auto;box-shadow:0 8px 28px rgba(0,0,0,.12)}
      .master-head,.master-foot{position:static;height:auto}.master-head{margin-bottom:5mm}.master-foot{margin-top:6mm}
    }
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
    const printedAt=nowWib();
    const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Payroll Karyawan ${esc(snap.month)}</title><style>${css()}</style></head><body><div class="sheet">
      <header class="master-head"><div class="master-head-inner"><div class="brand"><img class="logo" src="${logo}" onerror="this.style.display='none'" alt="VAX"><div class="brand-copy"><h1>ERP VAX WIJAYA</h1><div class="report-name">PAYROLL KARYAWAN</div><div class="system">Enterprise Management System</div></div></div><div class="head-right"><div class="doc">DOKUMEN OPERASIONAL</div><strong>INTERNAL</strong></div></div><div class="gold-rule"></div></header>

      <footer class="master-foot"><div><strong>ERP VAX WIJAYA</strong><br>Payroll Karyawan</div><div class="foot-center">${esc(snap.month)} · ${esc(snap.branchLabel)}</div><div class="foot-right">Dicetak ${esc(printedAt)} WIB<br>Dokumen Internal</div></footer>

      <section class="report-title"><h2>MASTER GAJI KARYAWAN</h2><p>Gaji Pokok − Denda − Kasbon + Bonus Insentif + Bonus KPI + Bonus Produk</p></section>
      <section class="meta"><div class="item"><span class="lbl">Periode</span><span class="val">${esc(snap.month)}</span></div><div class="item"><span class="lbl">Cabang</span><span class="val">${esc(snap.branchLabel)}</span></div><div class="item"><span class="lbl">Karyawan</span><span class="val">${esc(snap.employeeLabel)}</span></div><div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${esc(printedAt)} WIB</span></div></section>
      ${snap.cards.map(cardHtml).join('')}
      <section class="sign"><div class="box"><div class="space"></div><div class="line">Supervisor</div><div class="role">VAX WIJAYA</div></div><div class="box"><div class="space"></div><div class="line">Owner</div><div class="role">VAX WIJAYA</div></div></section>
    </div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }
  window.PayrollCapsterPrint={open};
})();
