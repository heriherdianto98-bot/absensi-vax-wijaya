"use strict";

const LaporanBulananBackupCashoutBridge = {
  normalize(v){ return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); },
  parseMoney(v){ const m=String(v||"").match(/Rp\s*([\d.,]+)/i); return m?Number(String(m[1]).replace(/\D/g,"")):0; },
  stripCashierSuffix(v){ return String(v||"").replace(/\s*[-–]\s*Kasir:\s*.+$/i,"").trim(); },
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
  match(chunk,payrollRows){
    const label=this.stripCashierSuffix(chunk);
    const n=this.normalize(label);
    if(!n.includes("gaji")||!n.includes("backup")||n.includes("kasir")) return null;
    const amount=this.parseMoney(label); if(amount<=0) return null;
    const matches=(payrollRows||[]).filter(emp=>this.isBackupFloating(emp)&&this.aliases(emp).some(a=>n.split(" ").includes(a)||n.includes(" "+a+" ")||n.endsWith(" "+a)));
    if(matches.length!==1) return null;
    const e=matches[0];
    return {employeeId:Number(e.employeeId||e.id),nama:e.namaKaryawan||e.nama_karyawan||"—",jabatan:e.jabatan||"Kasir Backup / Floating",amount,raw:chunk,label};
  },
  extract({cashOutRows=[],payrollRows=[],cabangId=null}={}){
    const detail=[]; let total=0;
    for(const row of cashOutRows||[]){
      if(cabangId!==null&&cabangId!==undefined&&Number(row?.cabang_id)!==Number(cabangId)) continue;
      const tanggal=String(row?.tanggal||"").slice(0,10),raw=String(row?.keterangan_cash_out||"").trim(); if(!raw) continue;
      for(const chunk of raw.split(/\s*;\s*/).map(x=>x.trim()).filter(Boolean)){
        const hit=this.match(chunk,payrollRows); if(!hit) continue;
        total+=hit.amount; detail.push({tanggal,cabangId:Number(row?.cabang_id||0)||null,source:"CASHOUT_NAMED_BACKUP_SUPPLEMENT",...hit});
      }
    }
    return {total,detail};
  },
  apply(report,supplement){
    if(!report||!supplement||!supplement.total) return report;
    const amount=Number(supplement.total||0);
    report.gaji=report.gaji||{};
    report.gaji.backupNamedSupplement=amount;
    report.gaji.backupNamedDetail=supplement.detail||[];
    report.gaji.total=Number(report.gaji.total||0)+amount;
    report.pengeluaran=report.pengeluaran||{};
    report.pengeluaran.operasional=Math.max(0,Number(report.pengeluaran.operasional||0)-amount);
    report.pengeluaran.total=Number(report.pengeluaran.operasional||0)+Number(report.pengeluaran.sewa||0);
    report.diagnostics=report.diagnostics||{};
    report.diagnostics.namedBackupSupplement={amount,rows:(supplement.detail||[]).length,note:"Reklasifikasi Cash Out bernama ke gaji Floating; tidak dihitung dua kali."};
    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananBackupCashoutBridge=LaporanBulananBackupCashoutBridge;
