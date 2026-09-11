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
    .master-head{height:20mm;background:#fff}
    .master-head-inner{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;height:15mm}
    .brand{display:flex;align-items:center;gap:4mm}.logo{width:14mm;height:14mm;object-fit:contain}
    .brand-copy h1{margin:0;font-size:14pt;font-weight:800;letter-spacing:.035em;line-height:1.05}
    .brand-copy .report-name{margin-top:1.2mm;font-size:7.2pt;font-weight:800;letter-spacing:.15em;text-transform:uppercase}
    .brand-copy .system{margin-top:.8mm;font-size:6.6pt;color:#666}
    .head-right{text-align:right;padding-top:.6mm}.head-right .doc{font-size:6.6pt;color:#666;letter-spacing:.08em;text-transform:uppercase}.head-right strong{display:block;margin-top:1mm;font-size:7.3pt;letter-spacing:.08em}
    .gold-rule{height:1mm;background:#d4af37;margin-top:2.5mm}
    .master-foot{height:10mm;border-top:1px solid #b8b8b8;background:#fff;padding-top:2mm;display:flex;justify-content:space-between;align-items:flex-start;color:#666;font-size:6.2pt}
    .master-foot strong{color:#111}.foot-center{text-align:center;flex:1}.foot-right{text-align:right}
    .content{padding:0}
    .report-title{margin:0 0 2.5mm}.report-title h2{font-size:14pt;margin:0}.report-title p{margin:.7mm 0 0;color:#666;font-size:7.4pt}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 10mm;border:1px solid #d5d5d5;padding:2.2mm 4mm;margin-bottom:3mm}.meta .item{display:flex;justify-content:space-between;gap:5mm}.meta .lbl{color:#666}.meta .val{font-weight:700;text-align:right}
    .employee{border:1px solid #aaa;margin-bottom:2.5mm;break-inside:avoid-page;page-break-inside:avoid}.emp-head{display:flex;justify-content:space-between;gap:5mm;padding:2.2mm 4mm;border-bottom:1px solid #aaa;background:#f5f5f5}.emp-head h3{margin:0;font-size:11pt}.emp-head p{margin:.7mm 0 0;font-size:7pt;color:#666}.net{text-align:right}.net span{display:block;font-size:7pt;color:#666;text-transform:uppercase}.net strong{font-size:12pt}
    .tbl{width:100%;border-collapse:collapse}.tbl thead{display:table-header-group}.tbl th,.tbl td{border-bottom:1px solid #ddd;padding:1.15mm 1.35mm;font-size:6.9pt}.tbl th{background:#fafafa;text-transform:uppercase;font-size:6.2pt;text-align:left;white-space:nowrap}.tbl .num{text-align:right;white-space:nowrap}.tbl tr{break-inside:avoid;page-break-inside:avoid}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1.5mm;padding:2mm}
    .sum{border:1px solid #c7d0da;border-top-width:1.4mm;padding:1.55mm;background:#f7fafc;border-radius:1.2mm}
    .sum span{display:block;color:#53616f;font-size:6.2pt;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
    .sum strong{display:block;margin-top:.7mm;font-size:8.6pt;color:#172233}
    .sum:nth-child(1){border-top-color:#42b8e8;background:#eef9fd}.sum:nth-child(1) span{color:#177ba3}
    .sum:nth-child(2){border-top-color:#e45b62;background:#fff2f3}.sum:nth-child(2) span,.sum:nth-child(2) strong{color:#b63c45}
    .sum:nth-child(3){border-top-color:#e6a23c;background:#fff8ea}.sum:nth-child(3) span{color:#a86a08}
    .sum:nth-child(4){border-top-color:#36b37e;background:#effaf5}.sum:nth-child(4) span{color:#167953}
    .sum:nth-child(5){border-top-color:#8c77d9;background:#f5f2ff}.sum:nth-child(5) span{color:#6652ad}
    .sum:nth-child(6){border-top-color:#43c5cf;background:#eefbfd}.sum:nth-child(6) span{color:#187f87}
    .sum:nth-child(7){border-top-color:#d4af37;background:#fff9e6}.sum:nth-child(7) span,.sum:nth-child(7) strong{color:#8c6b00}
    .empty{text-align:center;padding:8mm;color:#777}
    .sign{margin-top:2.5mm;display:grid;grid-template-columns:1fr 1fr;gap:20mm;align-items:end;break-inside:avoid;page-break-inside:avoid}
    .sign .box{text-align:center;min-height:25mm}
    .supervisor-sign .who,.owner-sign .who{font-size:7.5pt;font-weight:700;color:#172233}
    .supervisor-sign .auth-role,.owner-sign .auth-role{margin-top:.5mm;font-size:6.5pt;font-weight:800;letter-spacing:.12em;color:#697481;text-transform:uppercase}
    .supervisor-sign .stage{height:14mm;width:100%;margin:.3mm auto .7mm;display:flex;align-items:center;justify-content:center;overflow:visible}
    .supervisor-sign .ttd svg{display:block;width:42mm;height:16mm;overflow:visible}
    .supervisor-sign .name,.owner-sign .name{font-size:8.5pt;font-weight:800;color:#172233}
    .supervisor-sign .supervisor-line,.owner-sign .owner-line{height:1px;background:#333;width:40mm;margin:.7mm auto .7mm}
    .supervisor-sign .job,.owner-sign .job{font-size:6.5pt;font-weight:900;letter-spacing:.16em;color:#697481}
    .owner-sign .stage{height:14mm;width:100%;margin:.3mm auto .7mm;display:flex;align-items:center;justify-content:center}.owner-sign .ttd img{max-width:38mm;max-height:13.5mm;object-fit:contain}
    @media print{
      .sign{position:fixed;left:0;right:0;bottom:11mm;z-index:4;margin-top:0}
      .master-foot{position:fixed;left:0;right:0;bottom:0;z-index:5}
    }
    @media screen{
      body{padding:16px;background:#f3f1ea}.page-frame{background:#fff;max-width:210mm;margin:auto;box-shadow:0 8px 28px rgba(0,0,0,.12)}
      .page-frame>thead,.page-frame>tfoot{display:table-row-group}.head-space,.foot-space{height:auto}.master-head{height:auto;padding:16px 20px 0}.master-foot{height:auto;margin:0 20px;padding:10px 0 16px}.content{padding:0 20px 20px}
    }
  `;}

  function cardHtml(c){
    const rows=c.rows.length?c.rows.map(r=>`<tr><td>${esc(r[0]||'')}</td><td>${esc(r[1]||'')}</td><td class="num">${esc(r[2]||'')}</td><td class="num">${esc(r[3]||'')}</td><td class="num">${esc(r[4]||'')}</td><td class="num">${esc(r[5]||'')}</td><td class="num">${esc(r[6]||'')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">Tidak ada aktivitas.</td></tr>';
    const sums=c.sums.map(s=>`<div class="sum"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join('');
    const net=c.sums.find(s=>/gaji bersih/i.test(s.label))?.value||'—';
    return `<section class="employee"><div class="emp-head"><div><h3>${esc(c.name)}</h3><p>${esc(c.info)}</p></div><div class="net"><span>Gaji Bersih</span><strong>${esc(net)}</strong></div></div><table class="tbl"><thead><tr><th>Tanggal</th><th>Cabang Kerja</th><th class="num">Service</th><th class="num">Gaji Pokok</th><th class="num">Denda</th><th class="num">Kasbon</th><th class="num">Bonus Produk</th></tr></thead><tbody>${rows}</tbody></table><div class="summary">${sums}</div></section>`;
  }

  const supervisorSignatureSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 584 328" preserveAspectRatio="xMidYMid meet" aria-label="Tanda tangan Supervisor"><path d="M 583 136 L 582 134 L 574 131 L 559 132 L 555 134 L 538 137 L 528 141 L 525 141 L 522 143 L 515 144 L 512 146 L 501 149 L 492 153 L 491 152 L 487 155 L 485 155 L 472 161 L 467 162 L 462 165 L 459 165 L 457 167 L 452 168 L 434 177 L 422 181 L 409 188 L 398 192 L 396 194 L 394 194 L 380 201 L 378 203 L 372 205 L 333 225 L 331 225 L 320 231 L 318 231 L 314 234 L 312 234 L 289 244 L 280 247 L 277 247 L 270 250 L 265 250 L 263 251 L 262 250 L 259 250 L 257 248 L 257 239 L 259 232 L 263 224 L 277 206 L 290 195 L 292 192 L 308 180 L 320 168 L 323 163 L 322 162 L 323 161 L 321 154 L 318 151 L 311 149 L 308 150 L 307 149 L 281 158 L 243 174 L 220 182 L 201 191 L 189 195 L 180 200 L 175 201 L 171 204 L 159 208 L 155 211 L 150 212 L 133 221 L 126 223 L 101 235 L 100 234 L 101 230 L 118 217 L 120 217 L 139 203 L 157 193 L 160 190 L 168 186 L 199 165 L 202 164 L 210 158 L 235 143 L 245 135 L 257 128 L 294 101 L 305 91 L 310 88 L 324 75 L 335 62 L 343 45 L 344 36 L 345 35 L 339 22 L 327 12 L 312 5 L 311 6 L 308 4 L 305 4 L 300 2 L 299 3 L 294 1 L 282 1 L 281 0 L 259 0 L 258 1 L 255 1 L 254 0 L 253 1 L 247 1 L 240 3 L 239 2 L 238 3 L 226 4 L 225 5 L 220 5 L 215 7 L 206 8 L 203 10 L 192 12 L 180 16 L 170 21 L 168 21 L 137 38 L 113 56 L 96 71 L 93 76 L 87 82 L 79 88 L 79 102 L 80 103 L 79 106 L 80 107 L 81 142 L 82 143 L 81 144 L 82 145 L 82 160 L 83 161 L 83 192 L 84 193 L 83 194 L 84 197 L 83 198 L 84 200 L 83 201 L 83 204 L 84 205 L 83 206 L 84 208 L 83 210 L 83 223 L 71 233 L 62 238 L 58 242 L 52 245 L 33 259 L 31 259 L 27 263 L 3 280 L 0 283 L 0 288 L 2 292 L 7 295 L 16 295 L 29 289 L 31 289 L 33 287 L 35 287 L 37 285 L 39 285 L 46 281 L 55 278 L 57 276 L 61 275 L 67 271 L 71 270 L 73 268 L 80 266 L 81 267 L 81 271 L 80 272 L 80 291 L 79 292 L 79 305 L 78 306 L 77 316 L 80 324 L 87 327 L 91 325 L 95 320 L 95 293 L 96 292 L 96 285 L 97 284 L 96 283 L 97 281 L 97 266 L 98 265 L 98 257 L 99 256 L 101 256 L 103 254 L 121 245 L 123 245 L 141 236 L 143 234 L 145 234 L 163 225 L 165 225 L 178 218 L 180 218 L 187 214 L 194 212 L 201 208 L 203 208 L 250 187 L 257 185 L 262 182 L 272 179 L 277 176 L 280 176 L 282 174 L 285 173 L 288 174 L 269 190 L 258 203 L 253 207 L 244 218 L 244 220 L 241 223 L 239 230 L 237 233 L 236 247 L 239 255 L 246 263 L 256 267 L 272 267 L 277 265 L 281 265 L 297 259 L 300 259 L 305 256 L 308 256 L 316 252 L 319 252 L 326 248 L 328 248 L 330 246 L 332 246 L 361 232 L 363 232 L 375 226 L 377 224 L 383 222 L 394 216 L 396 216 L 398 214 L 400 214 L 427 200 L 429 200 L 431 198 L 433 198 L 467 182 L 477 179 L 489 173 L 494 172 L 499 169 L 501 169 L 506 166 L 511 165 L 529 157 L 535 156 L 538 154 L 544 153 L 547 151 L 553 150 L 560 147 L 580 143 L 583 139 Z M 68 252 L 69 251 L 71 252 L 70 253 Z M 75 248 L 76 249 L 73 251 L 72 250 Z M 82 245 L 80 248 L 77 249 L 75 248 L 77 245 L 80 244 Z M 325 33 L 327 37 L 327 43 L 321 55 L 315 63 L 292 84 L 241 120 L 219 133 L 216 136 L 208 140 L 205 143 L 200 145 L 189 153 L 173 162 L 169 166 L 164 168 L 150 178 L 136 186 L 130 191 L 122 195 L 118 199 L 105 207 L 102 210 L 100 209 L 101 207 L 101 204 L 100 203 L 101 195 L 100 194 L 100 182 L 99 181 L 100 180 L 100 174 L 99 173 L 99 149 L 98 148 L 98 130 L 97 129 L 96 103 L 108 85 L 124 70 L 153 49 L 160 46 L 162 44 L 166 43 L 174 38 L 184 35 L 194 30 L 197 30 L 204 27 L 207 27 L 228 21 L 232 21 L 233 20 L 245 19 L 246 18 L 255 18 L 256 17 L 285 17 L 292 19 L 293 18 L 298 20 L 310 22 L 318 26 Z" fill="#111" fill-rule="evenodd"/></svg>`;

  function open(mode='print'){
    const snap=snapshot();if(!snap.cards.length){alert('Tidak ada data payroll untuk dicetak.');return;}
    const w=window.open('','_blank');if(!w){alert('Popup print diblokir browser.');return;}
    const logo='../assets/logo-vax-wijaya.png';
    const signatureUrl=new URL('../assets/owner-signature.png',window.location.href).href;
    const printedAt=nowWib();
    const header=`<header class="master-head"><div class="master-head-inner"><div class="brand"><img class="logo" src="${logo}" onerror="this.style.display='none'" alt="VAX"><div class="brand-copy"><h1>ERP VAX WIJAYA</h1><div class="report-name">PAYROLL KARYAWAN</div><div class="system">Enterprise Management System</div></div></div><div class="head-right"><div class="doc">DOKUMEN OPERASIONAL</div><strong>INTERNAL</strong></div></div><div class="gold-rule"></div></header>`;
    const footer=`<footer class="master-foot"><div><strong>ERP VAX WIJAYA</strong><br>Payroll Karyawan</div><div class="foot-center">${esc(snap.month)} · ${esc(snap.branchLabel)}</div><div class="foot-right">Dicetak ${esc(printedAt)} WIB<br>Dokumen Internal</div></footer>`;
    const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Payroll Karyawan ${esc(snap.month)}</title><style>${css()}</style></head><body>
      <table class="page-frame"><thead><tr><td><div class="head-space">${header}</div></td></tr></thead><tfoot><tr><td><div class="foot-space">${footer}</div></td></tr></tfoot><tbody><tr><td><main class="content">
        <section class="report-title"><h2>MASTER GAJI KARYAWAN</h2><p>Gaji Pokok − Denda − Kasbon + Bonus Insentif + Bonus KPI + Bonus Produk</p></section>
        <section class="meta"><div class="item"><span class="lbl">Periode</span><span class="val">${esc(snap.month)}</span></div><div class="item"><span class="lbl">Cabang</span><span class="val">${esc(snap.branchLabel)}</span></div><div class="item"><span class="lbl">Karyawan</span><span class="val">${esc(snap.employeeLabel)}</span></div><div class="item"><span class="lbl">Tanggal Cetak</span><span class="val">${esc(printedAt)} WIB</span></div></section>
        ${snap.cards.map(cardHtml).join('')}
        <section class="sign"><div class="box supervisor-sign"><div class="who">Disetujui / Mengetahui,</div><div class="auth-role">Otorisasi Supervisor</div><div class="stage"><div class="ttd">${supervisorSignatureSvg}</div></div><div class="name">Rangga Putra Pratama</div><div class="supervisor-line"></div><div class="job">SUPERVISOR</div></div><div class="box owner-sign"><div class="who">Disetujui / Mengetahui,</div><div class="auth-role">Otorisasi Owner</div><div class="stage"><div class="ttd"><img src="${signatureUrl}" alt="Tanda tangan Owner" onerror="this.style.display='none'"></div></div><div class="name">Heri Herdianto</div><div class="owner-line"></div><div class="job">OWNER</div></div></section>
      </main></td></tr></tbody></table>
      <script>
      window.addEventListener('load',async()=>{
        await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.addEventListener('load',resolve,{once:true});i.addEventListener('error',resolve,{once:true});})));
        setTimeout(()=>window.print(),120);
      });
      <\/script></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }
  window.PayrollCapsterPrint={open};
})();
