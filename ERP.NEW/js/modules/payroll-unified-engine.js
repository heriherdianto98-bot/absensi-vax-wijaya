/*
=========================================================
VAX ERP — Unified Payroll Engine V1
=========================================================
OWNER LOCK FORMULA:
Gaji Bersih = Gaji Pokok - Denda - Kasbon
              + Bonus Insentif + Bonus KPI + Bonus Produk

Canonical sources:
- Capster Gaji Pokok : provider_sales_daily_source.provider_share (Minutes)
- Fixed salary       : payroll_salary_master (MONTHLY / DAILY)
- Kasir Backup/Floating: daily_recap_source.keterangan_cash_out semua cabang
  melalui Backup Cashier Assignment Engine (nama eksplisit -> absensi -> continuity -> sisa pasangan)
  + tambahan bensin bernama eksplisit (contoh Bensin Hairi / Uang Bensin Ryan)
- Denda              : absensi.denda
- Kasbon             : employee_cash_advances.current_outstanding (status AKTIF)
- Bonus Produk       : product_sales_source.revenue_share by employee_id
- Bonus Insentif/KPI : payroll_manual_adjustments

Source tables are READ ONLY from this engine.
=========================================================
*/

const PayrollUnifiedEngine = {
  TABLE_KARYAWAN:"karyawan", TABLE_CABANG:"cabang", TABLE_PROVIDER_DAILY:"provider_sales_daily_source",
  TABLE_PRODUCT_SALES:"product_sales_source", TABLE_ABSENSI:"absensi", TABLE_KASBON:"employee_cash_advances", TABLE_DAILY_RECAP:"daily_recap_source",

  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },
  normalizeDate(v){ const s=String(v||"").trim(); if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s; if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10); return ""; },
  validateRange(start,end){ const s=this.normalizeDate(start),e=this.normalizeDate(end); if(!s||!e)throw new Error("Payroll: periode tidak valid"); if(s>e)throw new Error("Payroll: tanggal awal melebihi akhir"); return {start:s,end:e}; },
  normalizeName(v){ return String(v||"").trim().toLowerCase().replace(/\s+/g," "); },
  isCapster(emp){ return this.normalizeName(emp?.jabatan)==="capster"; },
  isBackupFloating(emp){ const r=this.normalizeName(emp?.jabatan); return r.includes("kasir")&&r.includes("backup")&&r.includes("floating"); },
  aliasesForBackup(emp){
    const name=this.normalizeName(emp?.nama_karyawan), aliases=new Set([name]);
    const first=name.split(" ")[0]; if(first)aliases.add(first);
    if(name==="ryan casmin"){ aliases.add("rian casmin"); aliases.add("ryan"); aliases.add("rian"); }
    if(name==="hairi"){ aliases.add("hairi"); }
    return [...aliases].filter(Boolean);
  },
  adjustmentFor(adjustments,id){ const r=(adjustments||{})[id]||(adjustments||{})[String(id)]||{}; return {bonusInsentif:Math.max(0,this.number(r.bonusInsentif)),bonusKpi:Math.max(0,this.number(r.bonusKpi))}; },
  addDays(date,days){ const [y,m,d]=date.split("-").map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+days); return dt.toISOString().slice(0,10); },
  dates(start,end){ const out=[]; for(let d=start;d<=end;d=this.addDays(d,1))out.push(d); return out; },
  daysInMonth(date){ const [y,m]=date.split("-").map(Number); return new Date(Date.UTC(y,m,0)).getUTCDate(); },
  monthlyDailyAmount(amount,date){ const total=Math.round(this.number(amount)),days=this.daysInMonth(date),base=Math.floor(total/days),rem=total-base*days,day=Number(date.slice(8,10)); return base+(day<=rem?1:0); },
  parseRupiahFromText(text){ const m=String(text||"").match(/rp\s*([\d.,]+)/i); if(!m)return 0; const digits=String(m[1]||"").replace(/\D/g,""); return digits?Number(digits):0; },

  extractBackupCashOutItems(cashOutRows){
    const out=[];
    (cashOutRows||[]).forEach(day=>{
      const tanggal=this.normalizeDate(day.tanggal), branchId=Number(day.cabang_id)||null, raw=String(day.keterangan_cash_out||"").trim();
      if(!tanggal||!branchId||!raw)return;
      raw.split(/\s*;\s*/).map(s=>s.trim()).filter(Boolean).forEach((chunk,index)=>{
        const norm=this.normalizeName(chunk),amount=this.parseRupiahFromText(chunk);
        if(!norm.includes("gaji")||!norm.includes("kasir")||amount<100000||amount>150000)return;
        out.push({key:`${tanggal}|${branchId}|${index}`,tanggal,cabangId:branchId,amount,keterangan:chunk,rawDay:raw,employeeId:null,confidence:null,reason:null});
      });
    });
    return out.sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||a.cabangId-b.cabangId||a.key.localeCompare(b.key));
  },

  extractBackupFuelAllowances(cashOutRows,backups){
    const out=[];
    (cashOutRows||[]).forEach(day=>{
      const tanggal=this.normalizeDate(day.tanggal), branchId=Number(day.cabang_id)||null, raw=String(day.keterangan_cash_out||"").trim();
      if(!tanggal||!branchId||!raw)return;
      raw.split(/\s*;\s*/).map(s=>s.trim()).filter(Boolean).forEach((chunk,index)=>{
        const norm=this.normalizeName(chunk), amount=this.parseRupiahFromText(chunk);
        if(!norm.includes("bensin")||amount<=0)return;
        const matches=(backups||[]).filter(emp=>this.aliasesForBackup(emp).some(a=>a.length>=4&&new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z0-9]|$)`,`i`).test(norm)));
        if(matches.length!==1)return;
        out.push({key:`fuel|${tanggal}|${branchId}|${index}`,tanggal,cabangId:branchId,amount,keterangan:chunk,employeeId:Number(matches[0].id),employeeName:matches[0].nama_karyawan,confidence:"HIGH",reason:"NAMED_FUEL_ALLOWANCE"});
      });
    });
    return out.sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||a.cabangId-b.cabangId||a.key.localeCompare(b.key));
  },

  buildBackupAssignments({karyawan,absensiRows,cashOutRows}){
    const backups=(karyawan||[]).filter(e=>e.aktif!==false&&this.isBackupFloating(e));
    const items=this.extractBackupCashOutItems(cashOutRows);
    const fuelAllowances=this.extractBackupFuelAllowances(cashOutRows,backups);
    const byDate=new Map(); items.forEach(i=>{ if(!byDate.has(i.tanggal))byDate.set(i.tanggal,[]); byDate.get(i.tanggal).push(i); });
    const lastByBranch=new Map();
    const attendance=(absensiRows||[]).filter(a=>backups.some(e=>Number(e.id)===Number(a.karyawan_id)));

    const assign=(item,emp,confidence,reason)=>{ if(!item||!emp||item.employeeId)return false; item.employeeId=Number(emp.id); item.employeeName=emp.nama_karyawan; item.confidence=confidence; item.reason=reason; lastByBranch.set(Number(item.cabangId),Number(emp.id)); return true; };

    [...byDate.keys()].sort().forEach(date=>{
      const dayItems=byDate.get(date)||[];
      const used=new Set();

      // 1) Nama eksplisit di seluruh keterangan Cash Out hari+cabang (contoh: Bensin Hairi).
      dayItems.forEach(item=>{
        const hay=this.normalizeName(item.rawDay);
        const matches=backups.filter(emp=>this.aliasesForBackup(emp).some(a=>a.length>=4&&new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z0-9]|$)`,`i`).test(hay)));
        if(matches.length===1&&!used.has(Number(matches[0].id))){ assign(item,matches[0],"HIGH","CASHOUT_NAME"); used.add(Number(matches[0].id)); }
      });

      // 2) Absensi/geofence tanggal + cabang yang sama.
      dayItems.filter(i=>!i.employeeId).forEach(item=>{
        const matches=attendance.filter(a=>this.normalizeDate(a.tanggal)===date&&Number(a.cabang_id)===Number(item.cabangId)).map(a=>backups.find(e=>Number(e.id)===Number(a.karyawan_id))).filter(Boolean).filter(e=>!used.has(Number(e.id)));
        if(matches.length===1){ assign(item,matches[0],"HIGH","ABSENSI_BRANCH"); used.add(Number(matches[0].id)); }
      });

      // 3) Continuity: orang yang kemarin/terakhir terdeteksi di cabang yang sama.
      dayItems.filter(i=>!i.employeeId).forEach(item=>{
        const empId=lastByBranch.get(Number(item.cabangId));
        const emp=backups.find(e=>Number(e.id)===Number(empId));
        if(emp&&!used.has(Number(emp.id))){ assign(item,emp,"MEDIUM","BRANCH_CONTINUITY"); used.add(Number(emp.id)); }
      });

      // 4) Bila satu sisi sudah terdeteksi dan jumlah transaksi = jumlah tim backup, pasangan sisanya aman diinfer.
      const unresolved=dayItems.filter(i=>!i.employeeId), remaining=backups.filter(e=>!used.has(Number(e.id)));
      if(unresolved.length===1&&remaining.length===1&&dayItems.length===backups.length){ assign(unresolved[0],remaining[0],"MEDIUM","REMAINDER_PAIR"); used.add(Number(remaining[0].id)); }
    });

    return {items,assigned:items.filter(i=>i.employeeId),pending:items.filter(i=>!i.employeeId),fuelAllowances,backups};
  },

  async fetchKaryawan(){ const {data,error}=await db.from(this.TABLE_KARYAWAN).select("id,nama_karyawan,cabang_id,jabatan,aktif").order("nama_karyawan",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
  async fetchCabang(){ const {data,error}=await db.from(this.TABLE_CABANG).select("id,nama_cabang").order("id",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
  async fetchProviderRows(start,end){ const {data,error}=await db.from(this.TABLE_PROVIDER_DAILY).select("id,activity_date,cabang_id,cabang_minutes_name,provider_name_raw,provider_name_normalized,provider_minutes_id,employee_id,mapping_status,total_service,provider_share").gte("activity_date",start).lte("activity_date",end).order("activity_date",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
  async fetchProductRows(start,end){ const {data,error}=await db.from(this.TABLE_PRODUCT_SALES).select("id,period_start,period_end,cabang_id,cabang_minutes_name,product_name,provider_name_raw,employee_id,mapping_status,qty,revenue_share").gte("period_start",start).lte("period_start",end).order("period_start",{ascending:true}); if(error)throw error; return (Array.isArray(data)?data:[]).filter(r=>{const s=this.normalizeDate(r.period_start),e=this.normalizeDate(r.period_end);return s&&e&&s===e&&s>=start&&s<=end;}); },
  async fetchAbsensi(start,end){ const {data,error}=await db.from(this.TABLE_ABSENSI).select("id,karyawan_id,cabang_id,cabang_asal_id,tanggal,status,terlambat_menit,denda,status_denda").gte("tanggal",start).lte("tanggal",end).order("tanggal",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
  async fetchKasbon(start,end){ const {data,error}=await db.from(this.TABLE_KASBON).select("id,employee_id,branch_id,employee_name_snapshot,position_snapshot,request_date,approved_amount,disbursement_date,status,current_outstanding,total_paid").gte("disbursement_date",start).lte("disbursement_date",end).order("disbursement_date",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
  async fetchCashOutRows(start,end){ const {data,error}=await db.from(this.TABLE_DAILY_RECAP).select("tanggal,cabang_id,cash_out,keterangan_cash_out").gte("tanggal",start).lte("tanggal",end).order("tanggal",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },

  buildPendingMapping(providerRows,cabangMap){ return providerRows.filter(r=>!r.employee_id||String(r.mapping_status||"").toUpperCase()!=="MATCHED").map(r=>({sourceId:r.id,tanggal:this.normalizeDate(r.activity_date),cabangId:r.cabang_id,cabang:cabangMap.get(Number(r.cabang_id))||r.cabang_minutes_name||"—",providerMinutes:r.provider_name_raw||r.provider_name_normalized||"Capster",service:this.number(r.total_service),providerShare:this.number(r.provider_share),mappingStatus:r.mapping_status||"AMBIGUOUS"})); },
  newDaily(date,branchId,cabang,isCapster){ return {tanggal:date,cabangId:branchId||null,cabang:cabang||"—",service:isCapster?0:null,gajiPokok:0,denda:0,kasbon:0,bonusProduk:0,bonusProdukQty:0,productItems:[],providerRows:[],cashOutSalaryItems:[],salaryBasis:null}; },

  buildEmployeePayroll(employee,ctx){
    const {range,cabangMap,providerRows,productRows,absensiRows,kasbonRows,backupAssignments,salaryData,adjustments}=ctx;
    const employeeId=Number(employee.id),capster=this.isCapster(employee),backup=this.isBackupFloating(employee),homeCabang=cabangMap.get(Number(employee.cabang_id))||"—";
    const dailyMap=new Map(),keyFor=(d,b)=>`${d}|${Number(b)||0}`;
    const ensure=(d,b,c)=>{ const k=keyFor(d,b); if(!dailyMap.has(k))dailyMap.set(k,this.newDaily(d,b,c,capster)); return dailyMap.get(k); };
    const ownProvider=providerRows.filter(r=>Number(r.employee_id)===employeeId&&String(r.mapping_status||"").toUpperCase()==="MATCHED");
    const ownProduct=productRows.filter(r=>Number(r.employee_id)===employeeId&&String(r.mapping_status||"").toUpperCase()==="MATCHED");
    const ownAbsensi=absensiRows.filter(r=>Number(r.karyawan_id)===employeeId);
    const ownKasbon=kasbonRows.filter(r=>Number(r.employee_id)===employeeId&&String(r.status||"").toUpperCase()==="AKTIF"&&this.number(r.current_outstanding)>0);
    let gajiPokok=0,salaryMissing=false,salarySource=capster?"MINUTES_SHARE":(backup?"CASHOUT_BACKUP_ASSIGNMENT":"FIXED_MASTER"); const salaryRates=[];

    if(capster){
      ownProvider.forEach(r=>{ const date=this.normalizeDate(r.activity_date),branchId=Number(r.cabang_id)||employee.cabang_id;if(!date)return;const row=ensure(date,branchId,cabangMap.get(branchId)||r.cabang_minutes_name||homeCabang);row.service=this.number(row.service)+this.number(r.total_service);row.gajiPokok+=this.number(r.provider_share);row.salaryBasis="MINUTES_SHARE";row.providerRows.push(r.id);gajiPokok+=this.number(r.provider_share); });
    }else if(backup){
      (backupAssignments?.assigned||[]).filter(i=>Number(i.employeeId)===employeeId).forEach(item=>{ const row=ensure(item.tanggal,item.cabangId,cabangMap.get(item.cabangId)||homeCabang);row.gajiPokok+=item.amount;row.salaryBasis="CASHOUT_BACKUP_ASSIGNMENT";row.cashOutSalaryItems.push({keterangan:item.keterangan,amount:item.amount,confidence:item.confidence,reason:item.reason});gajiPokok+=item.amount; });
      (backupAssignments?.fuelAllowances||[]).filter(i=>Number(i.employeeId)===employeeId).forEach(item=>{ const row=ensure(item.tanggal,item.cabangId,cabangMap.get(item.cabangId)||homeCabang);row.gajiPokok+=item.amount;row.salaryBasis="CASHOUT_BACKUP_ASSIGNMENT";row.cashOutSalaryItems.push({keterangan:item.keterangan,amount:item.amount,confidence:item.confidence,reason:item.reason});gajiPokok+=item.amount; });
      salaryMissing=false;
    }else{
      const attendanceDates=new Set(ownAbsensi.map(r=>this.normalizeDate(r.tanggal)).filter(Boolean));
      this.dates(range.start,range.end).forEach(date=>{ const rate=window.PayrollSalaryMasterStore?.rateAt(salaryData,employeeId,date)||null;if(!rate)return;salaryRates.push(rate);if(rate.payBasis==="MONTHLY"){const amount=this.monthlyDailyAmount(rate.amount,date),row=ensure(date,employee.cabang_id,homeCabang);row.gajiPokok+=amount;row.salaryBasis="MONTHLY";gajiPokok+=amount;}else if(rate.payBasis==="DAILY"&&attendanceDates.has(date)){const abs=ownAbsensi.find(a=>this.normalizeDate(a.tanggal)===date),branchId=Number(abs?.cabang_id)||employee.cabang_id,amount=this.number(rate.amount),row=ensure(date,branchId,cabangMap.get(branchId)||homeCabang);row.gajiPokok+=amount;row.salaryBasis="DAILY";gajiPokok+=amount;}});
      if(!salaryRates.length){salaryMissing=true;salarySource="MISSING";}
    }

    ownAbsensi.forEach(a=>{const date=this.normalizeDate(a.tanggal);if(!date)return;const branchId=Number(a.cabang_id)||employee.cabang_id,row=ensure(date,branchId,cabangMap.get(branchId)||homeCabang);row.denda+=Math.max(0,this.number(a.denda));row.absensiStatus=a.status||null;row.terlambatMenit=(row.terlambatMenit||0)+this.number(a.terlambat_menit);});
    ownProduct.forEach(p=>{const date=this.normalizeDate(p.period_start);if(!date)return;const branchId=Number(p.cabang_id)||employee.cabang_id,row=ensure(date,branchId,cabangMap.get(branchId)||p.cabang_minutes_name||homeCabang);row.bonusProduk+=this.number(p.revenue_share);row.bonusProdukQty+=this.number(p.qty);row.productItems.push({productName:p.product_name||"—",qty:this.number(p.qty),revenueShare:this.number(p.revenue_share)});});
    ownKasbon.forEach(k=>{const date=this.normalizeDate(k.disbursement_date);if(!date)return;const branchId=Number(k.branch_id)||employee.cabang_id,row=ensure(date,branchId,cabangMap.get(branchId)||homeCabang);row.kasbon+=this.number(k.current_outstanding);(row.kasbonIds||(row.kasbonIds=[])).push(k.id);});

    const daily=Array.from(dailyMap.values()).sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||this.number(a.cabangId)-this.number(b.cabangId));
    const denda=daily.reduce((s,r)=>s+this.number(r.denda),0),kasbon=daily.reduce((s,r)=>s+this.number(r.kasbon),0),bonusProduk=daily.reduce((s,r)=>s+this.number(r.bonusProduk),0),totalService=capster?daily.reduce((s,r)=>s+this.number(r.service),0):null,adj=this.adjustmentFor(adjustments,employeeId);
    gajiPokok=Math.round(gajiPokok); const gajiBersih=gajiPokok-denda-kasbon+adj.bonusInsentif+adj.bonusKpi+bonusProduk;
    const uniqueRates=[...new Map(salaryRates.map(r=>[r.id,r])).values()];
    return {employeeId,namaKaryawan:employee.nama_karyawan||"—",jabatan:employee.jabatan||"—",aktif:Boolean(employee.aktif),isCapster:capster,isBackupCashoutFloating:backup,homeCabangId:employee.cabang_id,homeCabang,daily,salarySource,salaryMissing,salaryRates:uniqueRates,summary:{totalService,gajiPokok,gajiKotor:gajiPokok,denda,kasbon,bonusInsentif:adj.bonusInsentif,bonusKpi:adj.bonusKpi,bonusProduk,gajiBersih}};
  },

  async loadPeriod({start,end,branchId=null,employeeId=null,adjustments={}}={}){
    const range=this.validateRange(start,end);
    const [karyawan,cabang,providerRows,productRows,absensiRows,kasbonRows,cashOutRows,salaryData]=await Promise.all([this.fetchKaryawan(),this.fetchCabang(),this.fetchProviderRows(range.start,range.end),this.fetchProductRows(range.start,range.end),this.fetchAbsensi(range.start,range.end),this.fetchKasbon(range.start,range.end),this.fetchCashOutRows(range.start,range.end),window.PayrollSalaryMasterStore?.loadAll?.()||Promise.resolve({rows:[],byEmployee:{}})]);
    const cabangMap=new Map(cabang.map(r=>[Number(r.id),r.nama_cabang]));
    const backupAssignments=this.buildBackupAssignments({karyawan,absensiRows,cashOutRows});
    let employees=karyawan.slice(); if(branchId!==null&&branchId!==undefined&&String(branchId).trim()!=="")employees=employees.filter(r=>Number(r.cabang_id)===Number(branchId)); if(employeeId!==null&&employeeId!==undefined&&String(employeeId).trim()!=="")employees=employees.filter(r=>Number(r.id)===Number(employeeId));
    const ctx={range,cabangMap,providerRows,productRows,absensiRows,kasbonRows,backupAssignments,salaryData,adjustments};
    const payroll=employees.map(e=>this.buildEmployeePayroll(e,ctx));
    let pendingMapping=this.buildPendingMapping(providerRows,cabangMap); if(branchId!==null&&branchId!==undefined&&String(branchId).trim()!=="")pendingMapping=pendingMapping.filter(r=>Number(r.cabangId)===Number(branchId));
    const pendingBackupAssignments=backupAssignments.pending.map(i=>({...i,cabang:cabangMap.get(Number(i.cabangId))||"—",mappingStatus:"AMBIGUOUS_BACKUP"}));
    const totals=payroll.reduce((a,r)=>{const s=r.summary;a.gajiPokok+=this.number(s.gajiPokok);a.denda+=this.number(s.denda);a.kasbon+=this.number(s.kasbon);a.bonusInsentif+=this.number(s.bonusInsentif);a.bonusKpi+=this.number(s.bonusKpi);a.bonusProduk+=this.number(s.bonusProduk);a.gajiBersih+=this.number(s.gajiBersih);return a;},{gajiPokok:0,denda:0,kasbon:0,bonusInsentif:0,bonusKpi:0,bonusProduk:0,gajiBersih:0}); totals.gajiKotor=totals.gajiPokok;
    return {range,branchId:branchId?Number(branchId):null,payroll,pendingMapping,pendingBackupAssignments,backupAssignments,pendingSummary:{rows:pendingMapping.length,service:pendingMapping.reduce((s,r)=>s+this.number(r.service),0),providerShare:pendingMapping.reduce((s,r)=>s+this.number(r.providerShare),0),backupRows:pendingBackupAssignments.length},totals,salaryData};
  }
};

window.PayrollUnifiedEngine=PayrollUnifiedEngine;