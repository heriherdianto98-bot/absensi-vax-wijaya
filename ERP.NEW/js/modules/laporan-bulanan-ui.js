/* VAX ERP — Laporan Bulanan Investor UI */
"use strict";

(() => {
  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
  const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  let branches=[],employees=[],currentReport=null,booted=false,headerSyncTimer=null;
  let reportRequestNo=0; // Abaikan respons periode/cabang lama yang datang belakangan.

  /*
     Consumer-page read cache.
     PERFORMANCE ONLY: engine source files/formula/data flow are not changed.
     We memoize identical READ calls while user switches branches in the same month.
     Refresh Data and month changes clear the cache so a fresh read still works.
  */
  const monthlyReadCache={
    installed:false,
    payroll:new Map(),
    daily:new Map(),
    report:new Map(),
    originalPayrollLoad:null,
    originalDailyLoad:null
  };

  function stableAdjustments(value){
    if(!value||typeof value!=="object") return "{}";
    const sorted={};
    Object.keys(value).sort().forEach(key=>{
      const row=value[key];
      sorted[key]=row&&typeof row==="object"
        ?Object.keys(row).sort().reduce((acc,k)=>{acc[k]=row[k];return acc;},{})
        :row;
    });
    try{return JSON.stringify(sorted);}catch(_){return "{}";}
  }

  function installMonthlyReadCache(){
    if(monthlyReadCache.installed) return;

    if(typeof PayrollUnifiedEngine!=="undefined"&&typeof PayrollUnifiedEngine.loadPeriod==="function"){
      monthlyReadCache.originalPayrollLoad=PayrollUnifiedEngine.loadPeriod;
      PayrollUnifiedEngine.loadPeriod=function(args={}){
        const key=[String(args.start||""),String(args.end||""),String(args.branchId??""),String(args.employeeId??""),stableAdjustments(args.adjustments)].join("|");
        if(monthlyReadCache.payroll.has(key)) return monthlyReadCache.payroll.get(key);
        const pending=Promise.resolve(monthlyReadCache.originalPayrollLoad.call(this,args)).catch(err=>{
          monthlyReadCache.payroll.delete(key);
          throw err;
        });
        monthlyReadCache.payroll.set(key,pending);
        return pending;
      };
    }

    if(typeof DailyDataEngine!=="undefined"&&typeof DailyDataEngine.load==="function"){
      monthlyReadCache.originalDailyLoad=DailyDataEngine.load;
      DailyDataEngine.load=function(args={}){
        const key=[String(args.start||""),String(args.end||args.start||""),String(args.cabangId??"")].join("|");
        if(monthlyReadCache.daily.has(key)) return monthlyReadCache.daily.get(key);
        const pending=Promise.resolve(monthlyReadCache.originalDailyLoad.call(this,args)).catch(err=>{
          monthlyReadCache.daily.delete(key);
          throw err;
        });
        monthlyReadCache.daily.set(key,pending);
        return pending;
      };
    }

    monthlyReadCache.installed=true;
  }

  function clearMonthlyReadCache(){
    monthlyReadCache.payroll.clear();
    monthlyReadCache.daily.clear();
    monthlyReadCache.report.clear();
  }

  function monthLabel(value){ const [y,m]=String(value||"").split("-").map(Number); return y&&m?`${MONTHS[m-1]} ${y}`:"—"; }
  function setText(id,value){ const node=el(id); if(node && node.textContent!==String(value)) node.textContent=value; }
  function setHtml(id,value){ const node=el(id); if(node) node.innerHTML=value; }
  function statusReady(report){ return report?.readiness?.finalReady===true; }
  function num(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; }

  function selectedBranchLabel(){
    const select=el("lbBranch");
    return select?.selectedOptions?.[0]?.textContent?.trim() || currentReport?.branch?.name || "Semua Cabang";
  }

  function syncHeaderContext(report=currentReport){
    const branch=report?.branch?.name || selectedBranchLabel();
    const period=monthLabel(el("lbMonth")?.value);
    setText("erpHeaderCabang",branch || "Semua Cabang");
    setText("erpHeaderPeriode",period || "—");
  }

  function bindHeaderSync(){
    let tries=0;
    const tick=()=>{
      syncHeaderContext();
      tries+=1;
      if(tries>=12 && headerSyncTimer){ clearInterval(headerSyncTimer); headerSyncTimer=null; }
    };
    tick();
    if(headerSyncTimer) clearInterval(headerSyncTimer);
    headerSyncTimer=setInterval(tick,250);
    window.addEventListener("load",()=>syncHeaderContext(),{once:true});
  }

  function withTimeout(promise,ms,label){
    return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timeout`)),ms))]);
  }

  async function loadBase(){
    if(typeof db==="undefined" || !db?.from) throw new Error("Supabase client belum siap.");
    const cabsReq=db.from("cabang").select("id,nama_cabang").order("id",{ascending:true});
    const empsReq=db.from("karyawan").select("id,nama_karyawan,cabang_id,jabatan,aktif").order("nama_karyawan",{ascending:true});
    const [cabsRes,empsRes]=await withTimeout(Promise.all([cabsReq,empsReq]),10000,"Master cabang/karyawan");
    if(cabsRes?.error) throw cabsRes.error;
    if(empsRes?.error) throw empsRes.error;
    branches=(cabsRes?.data||[]).filter(c=>!String(c.nama_cabang||"").toLowerCase().includes("floating"));
    employees=empsRes?.data||[];
    const select=el("lbBranch");
    if(!select) throw new Error("Filter cabang tidak ditemukan.");
    select.innerHTML=`<option value="all">Semua Cabang</option>${branches.map(c=>`<option value="${Number(c.id)}">${esc(c.nama_cabang)}</option>`).join("")}`;
    if(branches[0]) select.value=String(branches[0].id); else select.value="all";
    syncHeaderContext();
  }

  function renderStatus(report){
    const ready=statusReady(report), box=el("lbReportStatus");
    if(!box) return;
    box.classList.toggle("is-ready",ready); box.classList.toggle("is-review",!ready);
    setText("lbReportStatusText",ready?"FINAL READY":"BELUM FINAL / PERLU REVIEW");
  }

  function renderKpis(report){
    const p=report?.pendapatan||{},g=report?.gaji||{},x=report?.pengeluaran||{},l=report?.laba||{};
    setText("lbRevenue",money(p.total));
    setText("lbServiceRevenue",money(p.cukur));
    setText("lbProductGross",money(p.produkGross));
    setText("lbPayroll",money(g.total));
    setText("lbOpex",money(x.operasional));
    setText("lbRent",money(x.sewa));
    setText("lbProfit",money(l.labaBersih));
    const all=report?.isAllBranches===true;
    const allKpis=el("lbAllKpis");
    if(allKpis) allKpis.hidden=!all;
    setText("lbProfitNote",all?`Setelah gaji, operasional & seluruh sewa ${money(x.sewa)}`:"Setelah gaji, operasional & sewa");
    if(all && Array.isArray(report.branchReports)){
      const rows=report.branchReports;
      const sum=fn=>rows.reduce((total,row)=>total+num(fn(row)),0);
      const rentPaid=sum(row=>{
        const inv=row?.investor||{};
        return inv.sewaDibayarAktual!==undefined ? inv.sewaDibayarAktual
          :inv.statusPembayaranSewa==="DITANGGUHKAN_KARENA_RUGI" ? 0 :inv.sewaDibayar;
      });
      const rentDeferred=sum(row=>{
        const inv=row?.investor||{};
        return inv.statusPembayaranSewa==="DITANGGUHKAN_KARENA_RUGI"
          ?(inv.sewaDitangguhkan??inv.sewaKewajiban??inv.sewaDibayar):inv.sewaDitangguhkan;
      });
      const investorRights=sum(row=>row?.investor?.totalHakBulanIni);
      const managementRights=sum(row=>row?.investor?.nilaiManajemen);
      const profitRights=investorRights-rentPaid+managementRights;
      const gap=num(l.labaBersih)-profitRights;
      setText("lbAllRentPaid",money(rentPaid));
      setText("lbAllRentDeferred",money(rentDeferred));
      setText("lbAllProfitRights",money(profitRights));
      setText("lbAllGap",`${gap>0?"+":""}${money(gap)}`);
      el("lbAllGapCard")?.classList.toggle("is-negative",gap<0);
      el("lbAllGapCard")?.classList.toggle("is-positive",gap>0);
      setText("lbAllKpisNote",`Rekonsiliasi ${rows.length} cabang · hak investor ${money(investorRights-rentPaid)} + hak manajemen ${money(managementRights)} · sewa investor ${money(rentPaid)} tidak dipotong dua kali. Nominal laporan, bukan saldo kas atau bukti transfer.`);
    }
    const card=el("lbProfitCard"); card?.classList.toggle("is-all-branches",all); card?.classList.toggle("is-profit",Number(l.labaBersih||0)>=0); card?.classList.toggle("is-loss",Number(l.labaBersih||0)<0);
    setText("lbCustomer",`${Number(p.customer||0).toLocaleString("id-ID")} customer`); setText("lbTransactions",`${Number(p.transaction||0).toLocaleString("id-ID")} transaksi`);
  }

  function capsterSalaryHtml(g){
    const rows=Array.isArray(g?.capsterDetail)?g.capsterDetail:[];
    if(!rows.length) return '<div class="lb-line"><span>Gaji Tukang Cukur</span><strong>—</strong></div>';
    return rows.map(row=>{
      const parts=[];
      if(Number(row?.payroll||0)) parts.push(`Share Cukur ${money(row.payroll)}`);
      if(Number(row?.mapped||0)) parts.push(`Backup Capster ${money(row.mapped)}`);
      if(Number(row?.protek||0)) parts.push(`Protek ${money(row.protek)}`);
      if(String(el("lbBranch")?.value)==="all" && Number(row?.freePoint||0)) parts.push(`Free Point ${money(row.freePoint)}`);
      const name=`${row?.nama||"Capster"}${row?.isBackup?" (Backup Capster)":""}`;
      const formula=parts.length?` · ${parts.join(" + ")}`:"";
      return `<div class="lb-line"><span>${esc(name)}${esc(formula)}</span><strong>${money(row?.total)}</strong></div>`;
    }).join("");
  }

  function payrollEmployeeFormula(row){
    const plus=[];
    const minus=[];
    plus.push(`Gaji Pokok ${money(row?.gajiPokok)}`);
    if(Number(row?.bonusInsentif||0)) plus.push(`Bonus Insentif ${money(row.bonusInsentif)}`);
    if(Number(row?.bonusKpi||0)) plus.push(`Bonus KPI ${money(row.bonusKpi)}`);
    if(Number(row?.bonusProduk||0)) plus.push(`Bonus Produk ${money(row.bonusProduk)}`);
    if(Number(row?.denda||0)) minus.push(`Denda ${money(row.denda)}`);
    if(Number(row?.kasbon||0)) minus.push(`Kasbon ${money(row.kasbon)}`);
    return `${plus.join(" + ")}${minus.length?` - ${minus.join(" - ")}`:""}`;
  }

  function nonCapsterSalaryHtml(g){
    const rows=Array.isArray(g?.nonCapsterDetail)?g.nonCapsterDetail:[];
    if(!rows.length) return '';
    return rows.map(row=>{
      const jabatan=String(row?.jabatan||"").toLowerCase();
      const label=jabatan.includes("kasir")?`Gaji Kasir — ${row?.nama||"Kasir"}`:`Gaji ${row?.jabatan||"Karyawan"} — ${row?.nama||"Karyawan"}`;
      return `<div class="lb-line"><span>${esc(label)} · ${esc(payrollEmployeeFormula(row))}</span><strong>${money(row?.amount)}</strong></div>`;
    }).join("");
  }

  function renderFinance(report){
    const p=report?.pendapatan||{},g=report?.gaji||{},x=report?.pengeluaran||{},l=report?.laba||{},inv=report?.investor||{};
    setHtml("lbIncomeLines",`<div class="lb-line"><span>Pendapatan Cukur</span><strong>${money(p.cukur)}</strong></div><div class="lb-line"><span>Pendapatan Produk (Gross)</span><strong>${money(p.produkGross)}</strong></div><div class="lb-line total"><span>Total Pendapatan</span><strong>${money(p.total)}</strong></div>`);

    const capsterRows=capsterSalaryHtml(g);
    const nonCapsterRows=nonCapsterSalaryHtml(g);
    setHtml("lbSalaryLines",`${capsterRows}${nonCapsterRows}<div class="lb-line"><span>Gaji SVP</span><strong>${money(g.svp)}</strong></div><div class="lb-line"><span>Gaji Backup Kasir</span><strong>${money(g.backupNamedSupplement)}</strong></div><div class="lb-line total"><span>Total Biaya Gaji</span><strong>${money(g.total)}</strong></div>`);

    setHtml("lbExpenseLines",`<div class="lb-line"><span>Biaya Operasional</span><strong>${money(x.operasional)}</strong></div>${report?.isAllBranches && num(x.tunjanganMess)>0 ? `<div class="lb-line"><span>Tj. Mess</span><strong>${money(x.tunjanganMess)}</strong></div>` : ""}<div class="lb-line"><span>Sewa Tempat</span><strong>${money(x.sewa)}</strong></div><div class="lb-line total"><span>Total Pengeluaran Non-Gaji</span><strong>${money(x.total)}</strong></div>`);
    if(report?.isAllBranches){
      setHtml("lbInvestorLines",`<div class="lb-line"><span>Cabang dengan Investor</span><strong>${Number(inv.branchCount||0)} cabang</strong></div><div class="lb-line"><span>Total Bagi Hasil Investor</span><strong>${money(inv.bagiHasil)}</strong></div><div class="lb-line"><span>Total Sewa Dibayar</span><strong>${money(inv.sewaDibayar)}</strong></div><div class="lb-line total"><span>Total Hak Investor Bulan Ini</span><strong>${money(inv.totalHakBulanIni)}</strong></div>`);
    }else{
      setHtml("lbInvestorLines",inv?.nama?`<div class="lb-line"><span>Investor</span><strong>${esc(inv.nama)}</strong></div><div class="lb-line"><span>Persentase</span><strong>${Number(inv.persentase||0)}%</strong></div><div class="lb-line"><span>Bagi Hasil</span><strong>${money(inv.bagiHasil)}</strong></div><div class="lb-line"><span>Sewa Dibayar</span><strong>${money(inv.sewaDibayar)}</strong></div><div class="lb-line total"><span>Total Hak Bulan Ini</span><strong>${money(inv.totalHakBulanIni)}</strong></div>`:inv?.managementOnly?`<div class="lb-line"><span>Status Investor</span><strong>Tidak ada investor aktif</strong></div><div class="lb-line"><span>Porsi Manajemen</span><strong>100%</strong></div><div class="lb-line total"><span>Hak Manajemen (Laba Bersih)</span><strong>${money(inv.nilaiManajemen)}</strong></div>`:'<div class="lb-ok">Cabang ini tidak memiliki investor aktif.</div>');
    }
    setHtml("lbResultLines",`<div class="lb-line"><span>Total Pendapatan</span><strong>${money(l.totalPendapatan)}</strong></div><div class="lb-line"><span>Total Biaya</span><strong>${money(l.totalBiaya)}</strong></div><div class="lb-line total"><span>Laba Bersih</span><strong>${money(l.labaBersih)}</strong></div>`);
  }

  function renderReadiness(report){
    const r=report?.readiness;
    if(!r){ setHtml("lbIssues",'<div class="lb-issue"><strong>VALIDASI BELUM TERSEDIA</strong><span>Readiness validator belum memberi hasil.</span></div>'); return; }
    if(r.finalReady){ setHtml("lbIssues",'<div class="lb-ok">Data laporan sudah lengkap dan siap direview sebagai laporan investor.</div>'); return; }
    setHtml("lbIssues",(r.issues||[]).map(i=>`<div class="lb-issue"><strong>${esc(i.code||"PERLU REVIEW")}</strong><span>${esc(i.message||"")}${i.amount?` · ${money(i.amount)}`:""}</span></div>`).join(""));
  }

  function renderPerformance(report){
    const perf=report?.performance||{};
    const status=perf.status||"—";
    const finding=perf.finding||"AI Insight akan ditampilkan sebagai ringkasan sederhana untuk investor setelah object insight periode aktif tersedia.";
    const growth=Number(perf.growthPct);
    const hasGrowth=perf.growthPct!==null&&perf.growthPct!==undefined&&Number.isFinite(growth);
    const toneClass=!hasGrowth?"perf-flat":growth>0?"perf-up":growth<0?"perf-down":"perf-flat";
    const arrow=!hasGrowth?"—":growth>0?"▲":growth<0?"▼":"●";
    const growthText=!hasGrowth?"—":`${arrow} ${growth>0?"+":""}${growth}%`;
    const statusTone=/turun|menurun|lemah|perlu perhatian|underperform/i.test(String(status))?"perf-down":/naik|meningkat|baik|stabil/i.test(String(status))?"perf-up":"perf-flat";
    setHtml("lbPerformance",`<div class="${statusTone}"><span>Status</span><strong>${esc(status)}</strong></div><div><span>Omzet</span><strong>${money(perf.omzet)}</strong></div><div class="${toneClass}"><span>Growth</span><strong>${esc(growthText)}</strong></div><div><span>Customer</span><strong>${Number(perf.customer||0).toLocaleString("id-ID")}</strong></div><div><span>Avg Ticket</span><strong>${money(perf.avgTicket)}</strong></div><div><span>Periode</span><strong>${esc(monthLabel(el("lbMonth")?.value))}</strong></div>`);
    setText("lbPerformanceNote",finding);
  }

  async function renderMapping(report){
    const box=el("lbProviderMapping"); if(!box) return;
    if(report?.isAllBranches){
      box.innerHTML='<div class="lb-ok">Mode Semua Cabang bersifat ringkasan. Pilih satu cabang untuk review atau mapping provider/capster backup.</div>';
      return;
    }
    const pending=report?.gaji?.providerPendingDetail||[];
    if(!pending.length){ box.innerHTML='<div class="lb-ok">Tidak ada provider/capster backup yang perlu dimapping untuk cabang ini.</div>'; return; }
    try{
      const mappings=await LaporanBulananProviderMapping.loadMonth({client:db,month:report.range.start});
      const review=LaporanBulananProviderMapping.buildReview({pendingRows:pending,mappings,branches,employees});
      LaporanBulananProviderMappingUI.render(box,{review,month:report.range.start,client:db,onSaved:async()=>{clearMonthlyReadCache();await loadReport(false);}});
    }catch(err){ console.warn("[Laporan Bulanan Mapping]",err); box.innerHTML=`<div class="lb-issue"><strong>MAPPING BELUM TERSEDIA</strong><span>${esc(err?.message||"Gagal membaca mapping provider.")}</span></div>`; }
  }

  function mergeCapsterDetails(reports){
    const map=new Map();
    reports.forEach(report=>(report?.gaji?.capsterDetail||[]).forEach(row=>{
      const key=row?.employeeId?`id:${row.employeeId}`:`name:${String(row?.nama||"").toLowerCase()}`;
      if(!map.has(key)) map.set(key,{...row,payroll:0,mapped:0,protek:0,freePoint:0,total:0});
      const target=map.get(key);
      target.payroll+=num(row?.payroll);
      target.mapped+=num(row?.mapped);
      target.protek+=num(row?.protek);
      target.freePoint+=num(row?.freePoint);
      target.total+=num(row?.total);
      target.isBackup=Boolean(target.isBackup||row?.isBackup);
    }));
    return [...map.values()].sort((a,b)=>String(a.nama||"").localeCompare(String(b.nama||""),"id"));
  }

  function mergeNonCapsterDetails(reports){
    const map=new Map();
    reports.forEach(report=>(report?.gaji?.nonCapsterDetail||[]).forEach(row=>{
      const key=row?.employeeId?`id:${row.employeeId}`:`name:${String(row?.nama||"").toLowerCase()}|${String(row?.jabatan||"").toLowerCase()}`;
      if(!map.has(key)) map.set(key,{...row,amount:0,gajiPokok:0,denda:0,kasbon:0,bonusInsentif:0,bonusKpi:0,bonusProduk:0});
      const target=map.get(key);
      ["amount","gajiPokok","denda","kasbon","bonusInsentif","bonusKpi","bonusProduk"].forEach(field=>{target[field]+=num(row?.[field]);});
    }));
    return [...map.values()].sort((a,b)=>String(a.nama||"").localeCompare(String(b.nama||""),"id"));
  }

  function aggregateReports(reports){
    const list=(reports||[]).filter(Boolean);
    if(!list.length) throw new Error("Tidak ada laporan cabang yang dapat digabungkan.");
    const sum=path=>list.reduce((total,report)=>{
      const parts=path.split(".");
      let value=report;
      for(const part of parts) value=value?.[part];
      return total+num(value);
    },0);
    const issues=[];
    list.forEach(report=>(report?.readiness?.issues||[]).forEach(issue=>issues.push({...issue,message:`${report?.branch?.name||"Cabang"}: ${issue?.message||"Perlu review"}`})));
    const investorBranches=list.filter(report=>report?.investor?.nama);
    const omzet=sum("performance.omzet")||sum("pendapatan.total");
    const customer=sum("pendapatan.customer");
    const transaction=sum("pendapatan.transaction");

    return {
      isAllBranches:true,
      branch:{id:null,name:"Semua Cabang",nama_cabang:"Semua Cabang"},
      range:{...list[0].range},
      pendapatan:{
        cukur:sum("pendapatan.cukur"),
        produkGross:sum("pendapatan.produkGross"),
        produkNett:sum("pendapatan.produkNett"),
        total:sum("pendapatan.total"),
        customer,
        transaction
      },
      gaji:{
        payroll:sum("gaji.payroll"),
        svp:sum("gaji.svp"),
        backupNamedSupplement:sum("gaji.backupNamedSupplement"),
        providerMapped:sum("gaji.providerMapped"),
        protek:sum("gaji.protek"),
        freePoint:sum("gaji.freePoint"),
        total:sum("gaji.total"),
        capsterDetail:mergeCapsterDetails(list),
        nonCapsterDetail:mergeNonCapsterDetails(list),
        providerPendingDetail:list.flatMap(report=>report?.gaji?.providerPendingDetail||[])
      },
      pengeluaran:{
        operasional:sum("pengeluaran.operasional"),
        tunjanganMess:sum("pengeluaran.tunjanganMess"),
        sewa:sum("pengeluaran.sewa"),
        total:sum("pengeluaran.total")
      },
      laba:{
        totalPendapatan:sum("laba.totalPendapatan"),
        totalBiaya:sum("laba.totalBiaya"),
        labaBersih:sum("laba.labaBersih")
      },
      investor:{
        branchCount:investorBranches.length,
        bagiHasil:sum("investor.bagiHasil"),
        nilaiInvestor:sum("investor.nilaiInvestor"),
        nilaiManajemen:sum("investor.nilaiManajemen"),
        sewaDibayar:sum("investor.sewaDibayar"),
        totalHakBulanIni:sum("investor.totalHakBulanIni")
      },
      performance:{
        status:"Konsolidasi",
        omzet,
        growthPct:null,
        customer,
        avgTicket:transaction>0?Math.round(omzet/transaction):0,
        finding:`Ringkasan konsolidasi ${list.length} cabang. Growth ditampilkan per cabang agar tidak menghasilkan persentase gabungan yang menyesatkan.`
      },
      readiness:{finalReady:list.length===branches.length&&list.every(statusReady),issues},
      branchReports:list,
      diagnostics:{aggregate:true,branchCount:list.length}
    };
  }

  async function loadBranchReport(year,mon,branchId){
    const key=`${year}-${String(mon).padStart(2,"0")}|${Number(branchId)}`;
    if(monthlyReadCache.report.has(key)) return monthlyReadCache.report.get(key);
    const pending=Promise.resolve(LaporanBulananConsumer.loadMonth({client:db,year,month:mon,cabangId:Number(branchId)})).then(report=>{
      if(typeof LaporanBulananOperasionalPayrollDedupBridge!=="undefined") LaporanBulananOperasionalPayrollDedupBridge.apply(report);
      return report;
    }).catch(err=>{
      monthlyReadCache.report.delete(key);
      throw err;
    });
    monthlyReadCache.report.set(key,pending);
    return pending;
  }

  // Khusus Semua Cabang: tunggu hasil akhir bridge per cabang sebelum menjumlahkan.
  // Engine, formula, dan jalur tampilan satu cabang tetap tidak diubah.
  async function settleBranchForAggregate(report){
    const bridge=typeof LaporanBulananOperasionalPayrollDedupBridge!=="undefined"
      ? LaporanBulananOperasionalPayrollDedupBridge : null;
    if(!bridge) return report;
    const [mess,freePoint]=await Promise.all([
      bridge.cashOutTunjanganMessFromSource(report),
      bridge.cashOutFreePointFromSource(report)
    ]);
    if(num(mess?.total)>0) bridge.applyMessReclassification(report,mess);
    if(num(freePoint?.total)>0) bridge.applyFreePointReclassification(report,freePoint);
    return report;
  }

  // Patch DOM dari bridge per cabang tidak boleh menimpa tampilan konsolidasi.
  function guardAllBranchesPresenterPatches(){
    const bridge=typeof LaporanBulananOperasionalPayrollDedupBridge!=="undefined"
      ? LaporanBulananOperasionalPayrollDedupBridge : null;
    if(!bridge || bridge.__monthlyAllPresenterGuard) return;
    for(const method of ["patchExpensePresentation","patchFreePointSalaryPresentation"]){
      if(typeof bridge[method]!=="function") continue;
      const original=bridge[method];
      bridge[method]=function(report){
        if(String(el("lbBranch")?.value)==="all") return;
        return original.call(this,report);
      };
    }
    bridge.__monthlyAllPresenterGuard=true;
  }

  async function loadAllBranchesReport(year,mon){
    const reports=await Promise.all(branches.map(branch=>loadBranchReport(year,mon,branch.id)));
    await Promise.all(reports.map(settleBranchForAggregate));
    if(reports.length!==branches.length) throw new Error("Jumlah laporan cabang tidak lengkap.");
    return aggregateReports(reports);
  }

  async function loadReport(showLoading=true){
    const branchValue=String(el("lbBranch")?.value||""),month=el("lbMonth")?.value;
    const requestNo=++reportRequestNo;
    const isAll=branchValue==="all";
    const branchId=isAll?null:Number(branchValue||0);
    if((!isAll&&!branchId)||!month){ setText("lbLoadState","Pilih cabang dan periode."); return; }
    syncHeaderContext(); if(showLoading) setText("lbLoadState",isAll?"Memuat semua cabang...":"Memuat laporan...");
    try{
      if(typeof LaporanBulananConsumer==="undefined") throw new Error("Consumer Bulanan belum termuat.");
      const [year,mon]=month.split("-").map(Number);
      const task=isAll?loadAllBranchesReport(year,mon):loadBranchReport(year,mon,branchId);
      const report=await withTimeout(task,isAll?60000:30000,isAll?"Laporan Semua Cabang":"Engine Laporan Bulanan");
      if(requestNo!==reportRequestNo) return; // Respons lama tidak boleh menimpa filter terbaru.
      currentReport=report; renderStatus(report); renderKpis(report); renderFinance(report); renderReadiness(report); renderPerformance(report); syncHeaderContext(report);
      if(isAll) document.dispatchEvent(new CustomEvent("laporan-bulanan:all-ready",{detail:report}));
      setText("lbLoadState",isAll?`Semua Cabang · ${monthLabel(month)} · ${branches.length} cabang · consumer read only`:`${report.branch.name} · ${monthLabel(month)} · consumer read only`);
      await renderMapping(report);
    }catch(err){ if(requestNo!==reportRequestNo) return; console.error(err); syncHeaderContext(); setText("lbLoadState",`Gagal memuat: ${err?.message||"unknown error"}`); setText("lbReportStatusText","GAGAL MEMUAT"); }
  }

  async function init(){
    if(booted||!el("lbBranch")) return; booted=true;
    installMonthlyReadCache();
    guardAllBranchesPresenterPatches();
    bindHeaderSync();
    try{
      setText("lbLoadState","Memuat master cabang...");
      await loadBase();
      el("lbMonth").value="2026-08"; syncHeaderContext();
      await loadReport();
    }catch(err){ console.error(err); syncHeaderContext(); setText("lbLoadState",`Gagal memuat modul: ${err?.message||"unknown error"}`); setText("lbReportStatusText","GAGAL MEMUAT"); }
    el("lbRefresh")?.addEventListener("click",()=>{clearMonthlyReadCache();loadReport();});
    el("lbBranch")?.addEventListener("change",()=>{syncHeaderContext();loadReport();});
    el("lbMonth")?.addEventListener("change",()=>{clearMonthlyReadCache();syncHeaderContext();loadReport();});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
  window.LaporanBulananUI={init,loadReport,syncHeaderContext,clearMonthlyReadCache};
})();