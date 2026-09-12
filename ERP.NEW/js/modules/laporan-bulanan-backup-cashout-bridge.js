"use strict";

/*
VAX ERP — Laporan Bulanan Backup Cash Out Bridge
Consumer-only reconciliation for backup cashier salary.
Reads actual Cash Out and Payroll output without modifying either locked source engine.
*/
const LaporanBulananBackupCashoutBridge = {
  normalize(v){ return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); },
  parseMoney(v){ const m=String(v||"").match(/Rp\s*([\d.,]+)/i); return m?Number(String(m[1]).replace(/\D/g,"")):0; },
  stripCashierSuffix(v){ return String(v||"").replace(/\s*[-–]\s*Kasir:\s*.+$/i,"").trim(); },
  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },

  isBackupFloating(row){
    if(row?.isBackupCashoutFloating) return true;
    const r=this.normalize(row?.jabatan||"");
    return r.includes("kasir")&&r.includes("backup")&&r.includes("floating");
  },

  aliases(row){
    const n=this.normalize(row?.namaKaryawan||row?.nama_karyawan||"");
    const out=[n,n.split(" ")[0]].filter(Boolean);
    if(n==="ryan casmin") out.push("ryan","rian","rian casmin");
    if(n==="hairi") out.push("hairi");
    return [...new Set(out)];
  },

  isGenericBackupCashier(chunk){
    const label=this.stripCashierSuffix(chunk);
    const n=this.normalize(label);
    return /\bgaji\s+backup\s*kasir\b/.test(n) || /\bgaji\s+backupkasir\b/.test(n);
  },

  matchNamedBackup(chunk,payrollRows){
    const label=this.stripCashierSuffix(chunk);
    const n=this.normalize(label);
    if(!n.includes("gaji")||!n.includes("backup")||n.includes("kasir")) return null;
    const amount=this.parseMoney(label); if(amount<=0) return null;
    const matches=(payrollRows||[]).filter(emp=>this.isBackupFloating(emp)&&this.aliases(emp).some(a=>n.split(" ").includes(a)||n.includes(" "+a+" ")||n.endsWith(" "+a)));
    if(matches.length!==1) return null;
    const e=matches[0];
    return {employeeId:Number(e.employeeId||e.id),nama:e.namaKaryawan||e.nama_karyawan||"—",jabatan:e.jabatan||"Kasir Backup / Floating",amount,raw:chunk,label,kind:"NAMED_BACKUP"};
  },

  payrollIncludedBackupAmount(payrollRows,cabangId){
    const id=Number(cabangId);
    let total=0;
    const detail=[];
    for(const employee of (payrollRows||[])){
      if(!this.isBackupFloating(employee)) continue;
      for(const day of (employee?.daily||[])){
        if(Number(day?.cabangId)!==id) continue;
        for(const item of (day?.cashOutSalaryItems||[])){
          const amount=this.number(item?.amount);
          if(amount<=0) continue;
          total+=amount;
          detail.push({
            employeeId:Number(employee?.employeeId||employee?.id||0)||null,
            nama:employee?.namaKaryawan||employee?.nama_karyawan||"—",
            tanggal:String(day?.tanggal||"").slice(0,10),
            amount,
            keterangan:item?.keterangan||"Gaji Backup Kasir"
          });
        }
      }
    }
    return {total,detail};
  },

  extract({cashOutRows=[],payrollRows=[],cabangId=null}={}){
    const detail=[];
    let total=0;
    for(const row of (cashOutRows||[])){
      if(cabangId!==null&&cabangId!==undefined&&Number(row?.cabang_id)!==Number(cabangId)) continue;
      const tanggal=String(row?.tanggal||"").slice(0,10);
      const raw=String(row?.keterangan_cash_out||"").trim();
      if(!raw) continue;

      for(const chunk of raw.split(/\s*;\s*/).map(x=>x.trim()).filter(Boolean)){
        if(this.isGenericBackupCashier(chunk)){
          const label=this.stripCashierSuffix(chunk);
          const amount=this.parseMoney(label);
          if(amount>0){
            total+=amount;
            detail.push({tanggal,cabangId:Number(row?.cabang_id||0)||null,source:"CASHOUT_GAJI_BACKUP_KASIR",amount,raw:chunk,label,kind:"GENERIC_BACKUP_CASHIER"});
          }
          continue;
        }

        const hit=this.matchNamedBackup(chunk,payrollRows);
        if(!hit) continue;
        total+=hit.amount;
        detail.push({tanggal,cabangId:Number(row?.cabang_id||0)||null,source:"CASHOUT_NAMED_BACKUP_SUPPLEMENT",...hit});
      }
    }

    const payrollIncluded=this.payrollIncludedBackupAmount(payrollRows,cabangId);
    return {
      total,
      detail,
      payrollIncludedAmount:payrollIncluded.total,
      payrollIncludedDetail:payrollIncluded.detail
    };
  },

  apply(report,supplement){
    if(!report||!supplement) return report;

    const actualCashOut=this.number(supplement.total);
    report.gaji=report.gaji||{};

    // Always expose the actual branch Cash Out amount as the monthly Backup Kasir line.
    report.gaji.backupNamedSupplement=actualCashOut;
    report.gaji.backupNamedDetail=supplement.detail||[];

    if(actualCashOut<=0) return report;

    // Payroll engine already absorbs assigned backup-cashier Cash Out into floating daily salary.
    // Reclassify that included portion out of the generic "Payroll Karyawan" display so the
    // monthly report can show "Gaji Backup Kasir" separately without double counting.
    const payrollIncluded=Math.min(actualCashOut,this.number(supplement.payrollIncludedAmount));
    const missingFromPayroll=Math.max(0,actualCashOut-payrollIncluded);

    report.gaji.payroll=Math.max(0,this.number(report.gaji.payroll)-payrollIncluded);
    report.gaji.total=this.number(report.gaji.total)+missingFromPayroll;

    // Cash Out classifier already excludes Gaji Backup Kasir from operational expense.
    // Therefore only a genuinely missing Payroll portion changes total cost/laba here.
    if(missingFromPayroll>0){
      report.laba=report.laba||{};
      report.laba.totalBiaya=this.number(report.laba.totalBiaya)+missingFromPayroll;
      report.laba.labaBersih=this.number(report.laba.totalPendapatan)-this.number(report.laba.totalBiaya);

      if(report.investor){
        const pct=this.number(report.investor.persentase);
        const share=report.laba.labaBersih>0&&pct>0?Math.round(report.laba.labaBersih*pct/100):0;
        report.investor.bagiHasil=share;
        report.investor.totalHakBulanIni=share+this.number(report.investor.sewaDibayar);
      }
    }

    report.diagnostics=report.diagnostics||{};
    report.diagnostics.backupCashierReconciliation={
      actualCashOut,
      payrollIncluded,
      missingFromPayroll,
      rows:(supplement.detail||[]).length,
      note:"Gaji Backup Kasir ditampilkan dari Cash Out aktual; porsi yang sudah masuk Payroll hanya direklasifikasi agar tidak double count."
    };

    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananBackupCashoutBridge=LaporanBulananBackupCashoutBridge;
