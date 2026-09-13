"use strict";

/*
VAX ERP — Laporan Bulanan Operasional / Payroll Dedup Bridge
Consumer-only.

Global monthly classification rules:
- Mengeluarkan Bonus Kasir / Bonus KPI dari Operasional jika nominalnya
  sudah masuk sebagai Bonus KPI Payroll pada periode/cabang yang sama.
- Memisahkan Tj. Mess / Tunjangan Mess dari Biaya Operasional menjadi
  kategori tersendiri TANPA mengubah total pengeluaran non-gaji / laba.

Tidak mengubah Cash Out source, Payroll source, DailyDataEngine,
LaporanBulananEngine, immutable snapshot, atau print engine.
*/
const LaporanBulananOperasionalPayrollDedupBridge = {
  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },
  normalize(v){ return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); },
  money(v){ return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(this.number(v)); },

  operationalRows(report){
    const rows=Array.isArray(report?.pengeluaran?.detail)?report.pengeluaran.detail:[];
    return rows.filter(row=>/^OPERASIONAL/.test(String(row?.category||"")));
  },

  cashOutBonusKpi(report){
    const matched=[];
    let total=0;
    for(const row of this.operationalRows(report)){
      const label=this.normalize(row?.label||row?.raw||"");
      if(!/\bbonus\s+(kasir|kpi)\b/.test(label)) continue;
      const amount=this.number(row?.nominal);
      if(amount<=0) continue;
      total+=amount;
      matched.push(row);
    }
    return {total,matched};
  },

  cashOutTunjanganMess(report){
    const matched=[];
    let total=0;
    for(const row of this.operationalRows(report)){
      const label=this.normalize(row?.label||row?.raw||"");
      // Strict classification: hanya label Tj Mess / Tunjangan Mess.
      // Item operasional lain yang kebetulan mengandung kata "mess" tidak dipindahkan.
      if(!/^(tj|tunjangan)\s+mess\b/.test(label)) continue;
      const amount=this.number(row?.nominal);
      if(amount<=0) continue;
      total+=amount;
      matched.push(row);
    }
    return {total,matched};
  },

  async cashOutTunjanganMessFromSource(report){
    const client=(typeof db!=="undefined"&&db?.from)?db:(typeof window!=="undefined"&&window.db?.from?window.db:null);
    const branchId=Number(report?.branch?.id||0);
    const start=String(report?.range?.start||"").slice(0,10);
    const end=String(report?.range?.end||"").slice(0,10);
    if(!client||!branchId||!start||!end) return {total:0,matched:[]};

    const {data,error}=await client
      .from("daily_recap_source")
      .select("tanggal,keterangan_cash_out,cash_out")
      .eq("cabang_id",branchId)
      .gte("tanggal",start)
      .lte("tanggal",end);
    if(error) throw error;

    const matched=[];
    let total=0;
    for(const row of (data||[])){
      const items=(typeof LaporanBulananEngine!=="undefined"&&typeof LaporanBulananEngine.parseCashOutItems==="function")
        ?LaporanBulananEngine.parseCashOutItems(row?.keterangan_cash_out)
        :[];
      for(const item of items){
        const label=this.normalize(item?.label||item?.raw||"");
        if(!/^(tj|tunjangan)\s+mess\b/.test(label)) continue;
        const amount=this.number(item?.nominal);
        if(amount<=0) continue;
        total+=amount;
        matched.push({
          tanggal:String(row?.tanggal||"").slice(0,10),
          label:item?.label||item?.raw||"Tj. Mess",
          raw:item?.raw||item?.label||"Tj. Mess",
          nominal:amount,
          source:"daily_recap_source.keterangan_cash_out"
        });
      }
    }
    return {total,matched};
  },

  patchExpensePresentation(report){
    if(typeof document==="undefined") return;
    const mess=this.number(report?.pengeluaran?.tunjanganMess);
    if(mess<=0) return;

    const render=()=>{
      const box=document.getElementById("lbExpenseLines");
      if(!box) return;
      const x=report?.pengeluaran||{};
      box.innerHTML=`<div class="lb-line"><span>Biaya Operasional</span><strong>${this.money(x.operasional)}</strong></div>`+
        `<div class="lb-line"><span>Tj. Mess</span><strong>${this.money(x.tunjanganMess)}</strong></div>`+
        `<div class="lb-line"><span>Sewa Tempat</span><strong>${this.money(x.sewa)}</strong></div>`+
        `<div class="lb-line total"><span>Total Pengeluaran Non-Gaji</span><strong>${this.money(x.total)}</strong></div>`;
      const opex=document.getElementById("lbOpex");
      if(opex) opex.textContent=this.money(x.operasional);
    };

    // UI utama merender setelah consumer selesai. Dua frame memastikan bridge
    // hanya menambahkan baris klasifikasi setelah renderFinance selesai.
    if(typeof requestAnimationFrame==="function") requestAnimationFrame(()=>requestAnimationFrame(render));
    else setTimeout(render,0);
  },

  applyMessReclassification(report,mess){
    const amount=this.number(mess?.total);
    if(!report||amount<=0) return report;

    report.pengeluaran=report.pengeluaran||{};
    if(this.number(report.pengeluaran.tunjanganMess)>0) return report;

    const operationalBefore=this.number(report.pengeluaran.operasional);
    report.pengeluaran.operasional=Math.max(0,operationalBefore-amount);
    report.pengeluaran.tunjanganMess=amount;
    report.pengeluaran.total=this.number(report.pengeluaran.operasional)
      +this.number(report.pengeluaran.tunjanganMess)
      +this.number(report.pengeluaran.sewa);

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.tunjanganMessClassification={
      operationalBefore,
      tunjanganMess:amount,
      operationalAfter:report.pengeluaran.operasional,
      rows:Array.isArray(mess?.matched)?mess.matched.length:0,
      source:Array.isArray(mess?.matched)&&mess.matched[0]?.source?mess.matched[0].source:"report.pengeluaran.detail",
      totalNonGajiPreserved:true
    };

    this.patchExpensePresentation(report);
    return report;
  },

  apply(report){
    if(!report) return report;

    const cashOut=this.cashOutBonusKpi(report);
    const payrollKpi=this.number(report?.gaji?.bonusKpi);
    const dedup=Math.min(cashOut.total,payrollKpi);
    const mess=this.cashOutTunjanganMess(report);

    report.pengeluaran=report.pengeluaran||{};
    const operationalBefore=this.number(report.pengeluaran.operasional);

    // Bonus KPI adalah true dedup: mengurangi biaya karena sudah dihitung di payroll.
    report.pengeluaran.operasional=Math.max(0,operationalBefore-dedup);
    report.pengeluaran.total=this.number(report.pengeluaran.operasional)+this.number(report.pengeluaran.sewa);

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.operasionalPayrollDedup={
      cashOutBonusKpi:cashOut.total,
      payrollBonusKpi:payrollKpi,
      deductedFromOperational:dedup,
      rows:cashOut.matched.length
    };

    if(dedup>0){
      report.laba=report.laba||{};
      report.laba.totalBiaya=Math.max(0,this.number(report.laba.totalBiaya)-dedup);
      report.laba.labaBersih=this.number(report.laba.totalPendapatan)-this.number(report.laba.totalBiaya);
    }

    // Jika detail sudah tersedia di report, reclass langsung.
    if(this.number(mess.total)>0){
      this.applyMessReclassification(report,mess);
    }else{
      // Fallback read-only ke source Cash Out asli. Tidak mengubah source/engine.
      // Dipakai karena report bulanan tidak selalu membawa pengeluaran.detail.
      this.cashOutTunjanganMessFromSource(report)
        .then(found=>{ if(this.number(found?.total)>0) this.applyMessReclassification(report,found); })
        .catch(err=>console.warn("[Laporan Bulanan Tj Mess]",err));
    }

    if(report.investor){
      if(typeof LaporanBulananInvestorShareBridge!=="undefined"&&typeof LaporanBulananInvestorShareBridge.apply==="function"){
        LaporanBulananInvestorShareBridge.apply(report);
        LaporanBulananInvestorShareBridge.emit?.(report);
      }else{
        const pct=this.number(report.investor.persentase);
        const share=report.laba.labaBersih>0&&pct>0?Math.round(report.laba.labaBersih*pct/100):0;
        report.investor.bagiHasil=share;
        report.investor.totalHakBulanIni=share+this.number(report.investor.sewaDibayar);
      }
    }

    this.patchExpensePresentation(report);
    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananOperasionalPayrollDedupBridge=LaporanBulananOperasionalPayrollDedupBridge;
