"use strict";

/* Laporan Bulanan — Pembagian Investor presenter. UI ONLY. */
(() => {
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
  const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0;};
  const allReports=new Map();
  let allRenderTimer=null;
  let activePeriodKey="";
  let consolidatedReport=null; // Satu sumber yang sama dengan tujuh card Semua Cabang.

  function isAllBranches(){
    return String(document.getElementById("lbBranch")?.value||"")==="all";
  }

  function periodKey(report){
    return String(report?.range?.start||report?.range?.end||"");
  }

  function branchKey(report){
    const id=report?.branch?.id;
    return id!==null&&id!==undefined&&id!==""?`id:${id}`:`name:${String(report?.branch?.name||report?.branch?.nama_cabang||"").toLowerCase()}`;
  }

  function branchName(report){
    return String(report?.branch?.name||report?.branch?.nama_cabang||"Cabang");
  }

  function collect(report){
    if(!report) return;
    const key=periodKey(report);
    if(key&&key!==activePeriodKey){
      activePeriodKey=key;
      allReports.clear();
    }
    allReports.set(branchKey(report),report);
  }

  function renderSingle(report){
    const host=document.getElementById("lbInvestorLines");
    const inv=report?.investor;
    if(!host||!inv?.nama) return;

    const hakInvestor=num(inv.totalHakBulanIni);
    const hakManajemen=num(inv.nilaiManajemen);

    host.innerHTML=`
      <div class="lb-line"><span>Investor</span><strong>${esc(inv.nama)}</strong></div>
      <div class="lb-line"><span>Laba Bersih</span><strong>${money(report?.laba?.labaBersih)}</strong></div>
      <div class="lb-line"><span>Nett Produk</span><strong>${money(inv.nettProduk)}</strong></div>
      <div class="lb-line"><span>Modal Produk (${Number(inv.modalProdukRate||60)}% × Nett Produk)</span><strong>${money(inv.modalProduk)}</strong></div>
      <div class="lb-line total lb-investor-base-total"><span>Laba Dasar Pembagian</span><strong>${money(inv.labaDasarPembagian)}</strong></div>
      <div class="lb-line"><span>Porsi Investor</span><strong>${Number(inv.porsiInvestor||0)}%</strong></div>
      <div class="lb-line"><span>Nilai Investor</span><strong>${money(inv.nilaiInvestor)}</strong></div>
      <div class="lb-line"><span>Porsi Manajemen</span><strong>${Number(inv.porsiManajemen||0)}%</strong></div>
      <div class="lb-line"><span>Nilai Manajemen</span><strong>${money(inv.nilaiManajemen)}</strong></div>
      <div class="lb-line"><span>Sewa Dibayar</span><strong>${money(inv.sewaDibayar)}</strong></div>
      <div class="lb-investor-rights-title">Total Hak Pembagian</div>
      <div class="lb-investor-rights-grid">
        <div class="lb-investor-rights-card is-investor">
          <span>Hak Investor</span>
          <strong>${money(hakInvestor)}</strong>
          <small>Nilai Investor + Sewa</small>
        </div>
        <div class="lb-investor-rights-card is-management">
          <span>Hak Manajemen</span>
          <strong>${money(hakManajemen)}</strong>
          <small>Nilai Manajemen</small>
        </div>
      </div>`;
  }

  function renderAll(){
    if(!isAllBranches()) return;
    const host=document.getElementById("lbInvestorLines");
    if(!host) return;

    const month=String(document.getElementById("lbMonth")?.value||"");
    const expectedIds=[...document.getElementById("lbBranch").options]
      .map(option=>option.value).filter(value=>value!=="all").map(Number);
    const source=consolidatedReport;
    const sourceRows=Array.isArray(source?.branchReports)?source.branchReports:[];
    if(!source?.isAllBranches || String(source?.range?.start||"").slice(0,7)!==month
      || sourceRows.length!==expectedIds.length
      || sourceRows.some(row=>!expectedIds.includes(Number(row?.branch?.id)))) return;
    const rows=sourceRows
      .filter(report=>report?.branch && report?.branch?.name!=="Semua Cabang")
      .sort((a,b)=>branchName(a).localeCompare(branchName(b),"id"));
    if(!rows.length) return;

    let totalInvestor=0;
    let totalManagement=0;
    let totalRentPaid=0;
    let totalRentDeferred=0;
    let investorBranchCount=0;

    const detail=rows.map(report=>{
      const inv=report?.investor||{};
      const hasInvestor=Boolean(inv?.nama);
      const hakInvestor=num(inv.totalHakBulanIni);
      const hakManajemen=num(inv.nilaiManajemen);
      // Nilai sewaDibayar dapat tetap berisi kewajiban pada cabang rugi.
      // Hanya field status final per cabang yang menentukan realisasi pembayaran.
      const deferred=inv.statusPembayaranSewa==="DITANGGUHKAN_KARENA_RUGI"
        ? num(inv.sewaDitangguhkan ?? inv.sewaKewajiban ?? inv.sewaDibayar)
        : num(inv.sewaDitangguhkan);
      const rentPaid=inv.sewaDibayarAktual!==undefined
        ? num(inv.sewaDibayarAktual)
        : inv.statusPembayaranSewa==="DITANGGUHKAN_KARENA_RUGI" ? 0 : num(inv.sewaDibayar);
      totalInvestor+=hakInvestor;
      totalManagement+=hakManajemen;
      totalRentPaid+=rentPaid;
      totalRentDeferred+=deferred;
      if(hasInvestor) investorBranchCount+=1;

      return `
        <div class="lb-line total"><span>${esc(branchName(report))}</span><strong>${hasInvestor?esc(inv.nama):"Manajemen"}</strong></div>
        <div class="lb-line"><span>Porsi Investor</span><strong>${Number(inv.porsiInvestor||0)}%</strong></div>
        <div class="lb-line"><span>Hak Investor</span><strong>${money(hakInvestor)}</strong></div>
        <div class="lb-line"><span>Porsi Manajemen</span><strong>${Number(inv.porsiManajemen||0)}%</strong></div>
        <div class="lb-line"><span>Hak Manajemen</span><strong>${money(hakManajemen)}</strong></div>
        ${rentPaid?`<div class="lb-line"><span>Sewa Dibayar</span><strong>${money(rentPaid)}</strong></div>`:""}
        ${deferred?`<div class="lb-line"><span>Sewa Ditangguhkan (Belum Dibayar)</span><strong>${money(deferred)}</strong></div>`:""}`;
    }).join("");

    host.innerHTML=`
      <div class="lb-line"><span>Total Cabang</span><strong>${rows.length} cabang</strong></div>
      <div class="lb-line"><span>Cabang dengan Investor</span><strong>${investorBranchCount} cabang</strong></div>
      ${detail}
      <div class="lb-line"><span>Total Sewa Dibayar</span><strong>${money(totalRentPaid)}</strong></div>
      <div class="lb-line"><span>Total Sewa Ditangguhkan (Belum Dibayar)</span><strong>${money(totalRentDeferred)}</strong></div>
      <div class="lb-line total"><span>Total Kewajiban Sewa Investor</span><strong>${money(totalRentPaid+totalRentDeferred)}</strong></div>
      <div class="lb-investor-rights-title">Total Hak Semua Cabang</div>
      <div class="lb-investor-rights-grid">
        <div class="lb-investor-rights-card is-investor">
          <span>Total Hak Investor</span>
          <strong>${money(totalInvestor)}</strong>
          <small>Nilai investor + sewa dibayar; tidak termasuk sewa ditangguhkan</small>
        </div>
        <div class="lb-investor-rights-card is-management">
          <span>Total Hak Manajemen</span>
          <strong>${money(totalManagement)}</strong>
          <small>Nilai manajemen seluruh cabang</small>
        </div>
      </div>`;
  }

  function scheduleAllRender(){
    if(allRenderTimer) clearTimeout(allRenderTimer);
    allRenderTimer=setTimeout(renderAll,120);
  }

  function render(report){
    collect(report);
    if(isAllBranches()){
      // Jangan render cache event per cabang yang belum final.
      return;
    }
    renderSingle(report);
  }

  function boot(){
    document.addEventListener("laporan-bulanan:investor-share",e=>render(e.detail));
    document.addEventListener("laporan-bulanan:all-ready",e=>{
      consolidatedReport=e.detail;
      scheduleAllRender();
    });
    document.getElementById("lbBranch")?.addEventListener("change",()=>{
      if(isAllBranches()){ consolidatedReport=null; }
      else setTimeout(()=>renderSingle(window.LaporanBulananInvestorShareBridge?.lastReport),80);
    });
    document.getElementById("lbMonth")?.addEventListener("change",()=>{
      allReports.clear();
      activePeriodKey="";
      consolidatedReport=null;
    });
    setTimeout(()=>render(window.LaporanBulananInvestorShareBridge?.lastReport),300);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();

/*
  Laporan Bulanan — A4 Print / PDF presenter. UI ONLY.
  - Header/footer mengikuti master print Payroll.
  - Tidak mengubah engine, formula, Cash Out source, Payroll, atau bridge LOCK.
  - Cash Out dicetak dari hasil klasifikasi Bulanan yang sudah anti double-count.
  - Jika dedup Bonus KPI membuat total detail berbeda, presenter menambahkan baris rekonsiliasi
    agar total Operasional cetak sama persis dengan angka final Laporan Bulanan.
*/
(() => {
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0;};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
  const norm=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  const reportCache=new Map();
  let busy=false;

  function periodValue(){return String(document.getElementById("lbMonth")?.value||"");}
  function periodLabel(){
    const [y,m]=periodValue().split("-").map(Number);
    const names=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    return y&&m?`${names[m-1]} ${y}`:"—";
  }
  function reportKey(report){return `${String(report?.range?.start||"").slice(0,7)}|${Number(report?.branch?.id||0)}`;}
  function collect(report){if(report?.branch?.id) reportCache.set(reportKey(report),report);}
  function branchName(report){return String(report?.branch?.name||report?.branch?.nama_cabang||"Cabang");}
  function nowWib(){return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"long",timeStyle:"short"}).format(new Date());}
  function isReady(report){return report?.readiness?.finalReady===true;}

  async function ensureReports(){
    const select=document.getElementById("lbBranch");
    const value=String(select?.value||"");
    const [year,month]=periodValue().split("-").map(Number);
    if(!year||!month) throw new Error("Periode belum dipilih.");
    const ids=value==="all"
      ?[...select.options].map(o=>o.value).filter(v=>v!=="all").map(Number).filter(Boolean)
      :[Number(value)].filter(Boolean);
    if(!ids.length) throw new Error("Cabang belum dipilih.");

    const period=`${year}-${String(month).padStart(2,"0")}`;
    const reports=await Promise.all(ids.map(async id=>{
      const key=`${period}|${id}`;
      if(reportCache.has(key)) return reportCache.get(key);
      if(typeof LaporanBulananConsumer==="undefined") throw new Error("Consumer Laporan Bulanan belum tersedia.");
      const report=await LaporanBulananConsumer.loadMonth({client:window.db||db,year,month,cabangId:id});
      if(typeof LaporanBulananOperasionalPayrollDedupBridge!=="undefined"){
        LaporanBulananOperasionalPayrollDedupBridge.apply(report);
      }
      collect(report);
      return report;
    }));
    return reports.sort((a,b)=>branchName(a).localeCompare(branchName(b),"id"));
  }

  function classificationLabel(category){
    const map={
      GAJI_SVP:"Gaji SVP",
      GAJI_CAPSTER_PROTEK:"Gaji Capster / Protek",
      EXCLUDE_PAYROLL_DUPLICATE:"Payroll · tidak masuk Operasional",
      EXCLUDE_SEWA_MASTER:"Sewa Master · tidak masuk Operasional",
      OPERASIONAL:"Operasional",
      OPERASIONAL_UNPARSED:"Operasional · sisa resmi belum terurai",
      PENYESUAIAN_LAPORAN:"Penyesuaian Laporan Bulanan"
    };
    return map[category]||String(category||"Operasional");
  }

  function reconciledCashOut(report){
    const source=Array.isArray(report?.pengeluaran?.detail)?report.pengeluaran.detail:[];
    let dedupLeft=num(report?.diagnostics?.operasionalPayrollDedup?.deductedFromOperational);
    const rows=source.map(row=>{
      const nominal=num(row?.nominal);
      const category=String(row?.category||"OPERASIONAL");
      let effective=/^OPERASIONAL/.test(category)?nominal:0;
      let displayCategory=category;
      let note="";
      const label=norm(row?.label||row?.raw||"");
      if(/^OPERASIONAL/.test(category)&&/\bbonus\s+(kasir|kpi)\b/.test(label)&&dedupLeft>0){
        const cut=Math.min(effective,dedupLeft);
        effective-=cut;
        dedupLeft-=cut;
        if(cut>0){displayCategory="EXCLUDE_PAYROLL_DUPLICATE";note=`Reklasifikasi Bonus KPI ke Payroll ${money(cut)}`;}
      }
      return {
        tanggal:String(row?.tanggal||"").slice(0,10),
        label:String(row?.label||row?.raw||"Cash Out"),
        nominal,
        category:displayCategory,
        effective,
        note
      };
    });
    const effectiveTotal=rows.reduce((s,r)=>s+num(r.effective),0);
    const finalOpex=num(report?.pengeluaran?.operasional);
    const adjustment=finalOpex-effectiveTotal;
    if(adjustment!==0){
      rows.push({tanggal:"—",label:"Penyesuaian konsolidasi ke angka Operasional Laporan Bulanan",nominal:0,category:"PENYESUAIAN_LAPORAN",effective:adjustment,note:"Presenter-only reconciliation; tidak mengubah source Cash Out."});
    }
    return {rows,finalOpex,adjustment};
  }

  function line(label,value,cls=""){
    return `<div class="line ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function salaryTable(report){
    const capsters=Array.isArray(report?.gaji?.capsterDetail)?report.gaji.capsterDetail:[];
    const staff=Array.isArray(report?.gaji?.nonCapsterDetail)?report.gaji.nonCapsterDetail:[];
    const rows=[];
    capsters.forEach(r=>rows.push(`<tr><td>${esc(r.nama||"Capster")}</td><td>Capster${r.isBackup?" / Backup":""}</td><td class="num">${money(r.payroll)}</td><td class="num">${money(r.mapped)}</td><td class="num">${money(r.protek)}</td><td class="num"><strong>${money(r.total)}</strong></td></tr>`));
    staff.forEach(r=>rows.push(`<tr><td>${esc(r.nama||"Karyawan")}</td><td>${esc(r.jabatan||"Karyawan")}</td><td class="num">${money(r.gajiPokok)}</td><td class="num">${money(num(r.bonusInsentif)+num(r.bonusKpi)+num(r.bonusProduk)-num(r.denda)-num(r.kasbon))}</td><td class="num">—</td><td class="num"><strong>${money(r.amount)}</strong></td></tr>`));
    if(!rows.length) rows.push('<tr><td colspan="6" class="empty">Tidak ada rincian gaji.</td></tr>');
    return `<table class="data-table"><thead><tr><th>Nama</th><th>Posisi</th><th class="num">Dasar / Share</th><th class="num">Adj.</th><th class="num">Protek</th><th class="num">Total</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }

  function cashoutTable(report){
    const recon=reconciledCashOut(report);
    const rows=recon.rows.map(r=>`<tr><td>${esc(r.tanggal)}</td><td>${esc(r.label)}${r.note?`<small>${esc(r.note)}</small>`:""}</td><td>${esc(classificationLabel(r.category))}</td><td class="num">${money(r.nominal)}</td><td class="num"><strong>${money(r.effective)}</strong></td></tr>`).join("");
    return `<table class="data-table cashout"><thead><tr><th>Tanggal</th><th>Keterangan Cash Out</th><th>Pos Bulanan</th><th class="num">Nominal Cash Out</th><th class="num">Masuk Operasional</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="empty">Tidak ada Cash Out pada periode ini.</td></tr>'}</tbody></table>`;
  }

  function investorBlock(report){
    const inv=report?.investor;
    if(!inv?.nama) return '<div class="note">Cabang ini tidak memiliki investor aktif.</div>';
    return `<div class="two-col">
      <div>${line("Investor",inv.nama)}${line("Porsi Investor",`${num(inv.porsiInvestor||inv.persentase)}%`)}${line("Nilai Investor",money(inv.nilaiInvestor||inv.bagiHasil))}${line("Sewa Dibayar",money(inv.sewaDibayar))}${line("Total Hak Investor",money(inv.totalHakBulanIni),"total")}</div>
      <div>${line("Laba Dasar Pembagian",money(inv.labaDasarPembagian))}${line("Modal Produk",money(inv.modalProduk))}${line("Porsi Manajemen",`${num(inv.porsiManajemen)}%`)}${line("Hak Manajemen",money(inv.nilaiManajemen),"total")}</div>
    </div>`;
  }

  function issuesBlock(report){
    const issues=Array.isArray(report?.readiness?.issues)?report.readiness.issues:[];
    if(!issues.length) return '<div class="ready">FINAL READY · Kelengkapan data bersih.</div>';
    return `<div class="issues">${issues.map(i=>`<div><strong>${esc(i.code||"PERLU REVIEW")}</strong><span>${esc(i.message||"")}${i.amount?` · ${money(i.amount)}`:""}</span></div>`).join("")}</div>`;
  }

  function branchHtml(report){
    const p=report?.pendapatan||{},g=report?.gaji||{},x=report?.pengeluaran||{},l=report?.laba||{};
    const diag=report?.diagnostics?.operasionalPayrollDedup||{};
    const status=isReady(report)?"FINAL READY":"BELUM FINAL / PERLU REVIEW";
    return `<section class="branch-report">
      <div class="branch-title"><div><h2>${esc(branchName(report))}</h2><span>${esc(status)}</span></div><strong>${money(l.labaBersih)}</strong></div>

      <div class="kpis">
        <div><span>Total Pendapatan</span><strong>${money(p.total)}</strong></div>
        <div><span>Total Gaji</span><strong>${money(g.total)}</strong></div>
        <div><span>Operasional</span><strong>${money(x.operasional)}</strong></div>
        <div><span>Sewa</span><strong>${money(x.sewa)}</strong></div>
        <div><span>Laba Bersih</span><strong>${money(l.labaBersih)}</strong></div>
      </div>

      <h3>Pendapatan</h3>
      <div class="two-col"><div>${line("Pendapatan Cukur",money(p.cukur))}${line("Gross Produk",money(p.produkGross))}${line("Total Pendapatan",money(p.total),"total")}</div><div>${line("Customer",Number(p.customer||0).toLocaleString("id-ID"))}${line("Transaksi",Number(p.transaction||0).toLocaleString("id-ID"))}${line("Avg Ticket",money(report?.performance?.avgTicket||p.avgTicketCanonical))}</div></div>

      <h3>Biaya Gaji Karyawan</h3>
      ${salaryTable(report)}
      <div class="summary-strip">${line("Gaji SVP",money(g.svp))}${line("Gaji Backup Kasir",money(g.backupNamedSupplement))}${line("Total Biaya Gaji",money(g.total),"total")}</div>

      <h3>Cash Out 1 Bulan · Sudah Disesuaikan ke Pos Laporan Bulanan</h3>
      <div class="recon">
        ${line("Cash Out Resmi",money(x.cashOutOfficial))}
        ${line("Dikeluarkan karena Payroll",money(x.excludedPayrollDuplicate))}
        ${line("Dikeluarkan karena Sewa Master",money(x.excludedRentDuplicate))}
        ${line("Dedup Bonus KPI / Kasir",money(diag.deductedFromOperational||0))}
        ${line("Operasional Final Laporan",money(x.operasional),"total")}
      </div>
      ${cashoutTable(report)}

      <h3>Hasil Bulan Berjalan</h3>
      <div class="two-col"><div>${line("Total Pendapatan",money(l.totalPendapatan))}${line("Total Biaya",money(l.totalBiaya))}${line("Laba Bersih",money(l.labaBersih),"total")}</div><div>${line("Operasional",money(x.operasional))}${line("Sewa",money(x.sewa))}${line("Total Pengeluaran Non-Gaji",money(x.total),"total")}</div></div>

      <h3>Pembagian Investor / Manajemen</h3>
      ${investorBlock(report)}

      <h3>Ringkasan Performance</h3>
      <div class="two-col"><div>${line("Status",report?.performance?.status||"—")}${line("Omzet",money(report?.performance?.omzet||p.total))}${line("Customer",Number(report?.performance?.customer||p.customer||0).toLocaleString("id-ID"))}</div><div class="note">${esc(report?.performance?.finding||"Tidak ada catatan performance.")}</div></div>

      <h3>Kelengkapan Data</h3>
      ${issuesBlock(report)}
    </section>`;
  }

  function grandSummary(reports){
    if(reports.length<=1) return "";
    const sum=path=>reports.reduce((t,r)=>{let v=r;for(const p of path.split("."))v=v?.[p];return t+num(v);},0);
    const investor=reports.reduce((t,r)=>t+num(r?.investor?.totalHakBulanIni),0);
    const management=reports.reduce((t,r)=>t+num(r?.investor?.nilaiManajemen),0);
    return `<section class="grand"><h2>Ringkasan Semua Cabang</h2><div class="grand-grid">
      <div><span>Total Pendapatan</span><strong>${money(sum("pendapatan.total"))}</strong></div>
      <div><span>Total Gaji</span><strong>${money(sum("gaji.total"))}</strong></div>
      <div><span>Total Operasional</span><strong>${money(sum("pengeluaran.operasional"))}</strong></div>
      <div><span>Total Sewa</span><strong>${money(sum("pengeluaran.sewa"))}</strong></div>
      <div><span>Total Laba Bersih</span><strong>${money(sum("laba.labaBersih"))}</strong></div>
      <div><span>Total Hak Investor</span><strong>${money(investor)}</strong></div>
      <div><span>Total Hak Manajemen</span><strong>${money(management)}</strong></div>
      <div><span>Status</span><strong>${reports.every(isReady)?"FINAL READY":"PERLU REVIEW"}</strong></div>
    </div></section>`;
  }

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

  // Renderer bersama: HTML email memakai format A4 identik dengan tombol PDF.
  async function emailDocument(){
    const branch=String(document.getElementById("lbBranch")?.value||"");
    const month=periodValue();
    const reports=await ensureReports();
    if(branch!==String(document.getElementById("lbBranch")?.value||"")||month!==periodValue())
      throw new Error("Filter berubah. Pilih kembali laporan untuk dikirim.");
    if(reports.some(r=>!isReady(r))) throw new Error("Laporan belum FINAL READY. Email belum dapat dikirim.");
    return buildPrintDocument(reports,"pdf");
  }

  function buildPrintDocument(reports,mode="pdf"){
    const branchLabel=reports.length>1?"Semua Cabang":branchName(reports[0]);
    const printedAt=nowWib();
    const notFinal=reports.some(r=>!isReady(r));
    const title=`Laporan Bulanan ${branchLabel} ${periodLabel()}${mode==="pdf"?" PDF":""}`;
    const body=`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${printCss()}</style></head><body>
        <table class="page-frame"><thead><tr><td><div class="head-space">${masterHeader()}</div></td></tr></thead><tfoot><tr><td><div class="foot-space">${masterFooter(branchLabel,printedAt)}</div></td></tr></tfoot><tbody><tr><td><main class="content">
          <section class="report-title"><h1>Laporan Bulanan ${esc(branchLabel)}</h1><p>Periode ${esc(periodLabel())} · Cash Out ditampilkan sesuai klasifikasi dan rekonsiliasi Laporan Bulanan.</p></section>
          ${notFinal?'<div class="warn">BELUM FINAL / PERLU REVIEW — masih ada data yang belum lengkap. Angka dapat berubah setelah kelengkapan data diselesaikan.</div>':""}
          ${grandSummary(reports)}
          ${reports.map(branchHtml).join("")}
        </main></td></tr></tbody></table>
        <script>window.addEventListener('load',async()=>{await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(resolve=>{i.addEventListener('load',resolve,{once:true});i.addEventListener('error',resolve,{once:true});})));setTimeout(()=>window.print(),120);});<\/script></body></html>`;
    return {html:body,branch:branchLabel,month:periodValue(),title};
  }

  async function openPrint(mode="print"){
    if(busy) return;
    busy=true;
    const buttons=[document.getElementById("lbPrintMonthly"),document.getElementById("lbPdfMonthly")];
    buttons.forEach(b=>{if(b)b.disabled=true;});
    try{
      const reports=await ensureReports();
      const w=window.open("","_blank");
      if(!w){alert("Popup print diblokir browser.");return;}
      const {html:body}=buildPrintDocument(reports,mode);
      w.document.open();w.document.write(body);w.document.close();
    }catch(err){
      console.error("[Laporan Bulanan Print]",err);
      alert(`Gagal menyiapkan laporan: ${err?.message||"unknown error"}`);
    }finally{
      busy=false;
      buttons.forEach(b=>{if(b)b.disabled=false;});
    }
  }

  function installButtons(){
    const actions=document.querySelector(".lb-toolbar .lb-actions");
    if(!actions||document.getElementById("lbPrintMonthly")) return;
    const style=document.createElement("style");
    style.textContent=`
      .lb-print-action{height:38px;min-width:42px;padding:0 12px;border:1px solid rgba(212,175,55,.42);border-radius:10px;background:rgba(212,175,55,.08);color:#e7c85e;display:inline-flex;align-items:center;justify-content:center;gap:7px;font:800 12px/1 'Source Sans 3',sans-serif;cursor:pointer;transition:.16s ease}.lb-print-action:hover{background:rgba(212,175,55,.16);border-color:rgba(212,175,55,.72);transform:translateY(-1px)}.lb-print-action:disabled{opacity:.45;cursor:wait;transform:none}.lb-print-action svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8}.lb-actions{display:flex;align-items:center;gap:8px}`;
    document.head.appendChild(style);
    const print=document.createElement("button");
    print.type="button";print.id="lbPrintMonthly";print.className="lb-print-action";print.title="Cetak Laporan Bulanan";
    print.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/></svg><span>Print</span>';
    const pdf=document.createElement("button");
    pdf.type="button";pdf.id="lbPdfMonthly";pdf.className="lb-print-action";pdf.title="Simpan Laporan Bulanan sebagai PDF";
    pdf.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 13h6M9 17h6"/></svg><span>PDF</span>';
    print.addEventListener("click",()=>openPrint("print"));
    pdf.addEventListener("click",()=>openPrint("pdf"));
    actions.prepend(pdf);actions.prepend(print);
  }

  function boot(){
    document.addEventListener("laporan-bulanan:investor-share",e=>collect(e.detail));
    document.getElementById("lbMonth")?.addEventListener("change",()=>reportCache.clear());
    installButtons();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
  window.LaporanBulananPrintUI={open:openPrint,reconciledCashOut,emailDocument};
})();
