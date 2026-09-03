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
- Ryan Casmin        : daily_recap_source.keterangan_cash_out semua cabang,
                       item gaji kasir/backup harian Rp100.000–Rp150.000
- Denda              : absensi.denda
- Kasbon             : employee_cash_advances.current_outstanding (status AKTIF)
                       yang dicairkan di periode payroll terpilih
- Bonus Produk       : product_sales_source.revenue_share by employee_id
- Bonus Insentif/KPI : payroll_manual_adjustments

Source tables are READ ONLY from this engine.
=========================================================
*/

const PayrollUnifiedEngine = {
    TABLE_KARYAWAN:"karyawan",
    TABLE_CABANG:"cabang",
    TABLE_PROVIDER_DAILY:"provider_sales_daily_source",
    TABLE_PRODUCT_SALES:"product_sales_source",
    TABLE_ABSENSI:"absensi",
    TABLE_KASBON:"employee_cash_advances",
    TABLE_DAILY_RECAP:"daily_recap_source",

    number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },
    normalizeDate(v){ const s=String(v||"").trim(); if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s; if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10); return ""; },
    validateRange(start,end){ const s=this.normalizeDate(start),e=this.normalizeDate(end); if(!s||!e)throw new Error("Payroll: periode tidak valid"); if(s>e)throw new Error("Payroll: tanggal awal melebihi akhir"); return {start:s,end:e}; },
    isCapster(emp){ return String(emp?.jabatan||"").trim().toLowerCase()==="capster"; },
    normalizeName(v){ return String(v||"").trim().toLowerCase().replace(/\s+/g," "); },
    isRyanCasmin(emp){ return this.normalizeName(emp?.nama_karyawan)==="ryan casmin"; },
    adjustmentFor(adjustments,id){ const r=(adjustments||{})[id]||(adjustments||{})[String(id)]||{}; return {bonusInsentif:Math.max(0,this.number(r.bonusInsentif)),bonusKpi:Math.max(0,this.number(r.bonusKpi))}; },
    addDays(date,days){ const [y,m,d]=date.split("-").map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+days); return dt.toISOString().slice(0,10); },
    dates(start,end){ const out=[]; for(let d=start;d<=end;d=this.addDays(d,1))out.push(d); return out; },
    daysInMonth(date){ const [y,m]=date.split("-").map(Number); return new Date(Date.UTC(y,m,0)).getUTCDate(); },
    monthlyDailyAmount(amount,date){
        const total=Math.round(this.number(amount));
        const days=this.daysInMonth(date);
        const base=Math.floor(total/days);
        const remainder=total-(base*days);
        const day=Number(String(date).slice(8,10));
        return base+(day<=remainder?1:0);
    },
    parseRupiahFromText(text){
        const m=String(text||"").match(/rp\s*([\d.,]+)/i);
        if(!m)return 0;
        const digits=String(m[1]||"").replace(/\D/g,"");
        return digits?Number(digits):0;
    },
    extractRyanCashOutItems(cashOutRows){
        const out=[];
        (cashOutRows||[]).forEach(day=>{
            const tanggal=this.normalizeDate(day.tanggal);
            const branchId=Number(day.cabang_id)||null;
            const raw=String(day.keterangan_cash_out||"").trim();
            if(!tanggal||!branchId||!raw)return;
            raw.split(/\s*;\s*/).map(s=>s.trim()).filter(Boolean).forEach(chunk=>{
                const norm=this.normalizeName(chunk);
                const amount=this.parseRupiahFromText(chunk);
                if(!norm.includes("gaji")||!norm.includes("kasir"))return;
                if(amount<100000||amount>150000)return;
                out.push({tanggal,cabangId:branchId,amount,keterangan:chunk});
            });
        });
        return out;
    },

    async fetchKaryawan(){ const {data,error}=await db.from(this.TABLE_KARYAWAN).select("id,nama_karyawan,cabang_id,jabatan,aktif").order("nama_karyawan",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
    async fetchCabang(){ const {data,error}=await db.from(this.TABLE_CABANG).select("id,nama_cabang").order("id",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
    async fetchProviderRows(start,end){ const {data,error}=await db.from(this.TABLE_PROVIDER_DAILY).select("id,activity_date,cabang_id,cabang_minutes_name,provider_name_raw,provider_name_normalized,provider_minutes_id,employee_id,mapping_status,total_service,provider_share").gte("activity_date",start).lte("activity_date",end).order("activity_date",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
    async fetchProductRows(start,end){ const {data,error}=await db.from(this.TABLE_PRODUCT_SALES).select("id,period_start,period_end,cabang_id,cabang_minutes_name,product_name,provider_name_raw,employee_id,mapping_status,qty,revenue_share").gte("period_start",start).lte("period_start",end).order("period_start",{ascending:true}); if(error)throw error; return (Array.isArray(data)?data:[]).filter(r=>{const s=this.normalizeDate(r.period_start),e=this.normalizeDate(r.period_end);return s&&e&&s===e&&s>=start&&s<=end;}); },
    async fetchAbsensi(start,end){ const {data,error}=await db.from(this.TABLE_ABSENSI).select("id,karyawan_id,cabang_id,cabang_asal_id,tanggal,status,terlambat_menit,denda,status_denda").gte("tanggal",start).lte("tanggal",end).order("tanggal",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
    async fetchKasbon(start,end){ const {data,error}=await db.from(this.TABLE_KASBON).select("id,employee_id,branch_id,employee_name_snapshot,position_snapshot,request_date,approved_amount,disbursement_date,status,current_outstanding,total_paid").gte("disbursement_date",start).lte("disbursement_date",end).order("disbursement_date",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },
    async fetchCashOutRows(start,end){ const {data,error}=await db.from(this.TABLE_DAILY_RECAP).select("tanggal,cabang_id,cash_out,keterangan_cash_out").gte("tanggal",start).lte("tanggal",end).order("tanggal",{ascending:true}); if(error)throw error; return Array.isArray(data)?data:[]; },

    buildPendingMapping(providerRows,cabangMap){
        return providerRows.filter(r=>!r.employee_id||String(r.mapping_status||"").toUpperCase()!=="MATCHED").map(r=>({
            sourceId:r.id,tanggal:this.normalizeDate(r.activity_date),cabangId:r.cabang_id,cabang:cabangMap.get(Number(r.cabang_id))||r.cabang_minutes_name||"—",
            providerMinutes:r.provider_name_raw||r.provider_name_normalized||"Capster",service:this.number(r.total_service),providerShare:this.number(r.provider_share),mappingStatus:r.mapping_status||"AMBIGUOUS"
        }));
    },

    newDaily(date,branchId,cabang,isCapster){
        return {tanggal:date,cabangId:branchId||null,cabang:cabang||"—",service:isCapster?0:null,gajiPokok:0,denda:0,kasbon:0,bonusProduk:0,bonusProdukQty:0,productItems:[],providerRows:[],cashOutSalaryItems:[],salaryBasis:null};
    },

    buildEmployeePayroll(employee,ctx){
        const {range,cabangMap,providerRows,productRows,absensiRows,kasbonRows,cashOutRows,salaryData,adjustments}=ctx;
        const employeeId=Number(employee.id), capster=this.isCapster(employee), ryan=this.isRyanCasmin(employee), homeCabang=cabangMap.get(Number(employee.cabang_id))||"—";
        const dailyMap=new Map();
        const keyFor=(date,branchId)=>`${date}|${Number(branchId)||0}`;
        const ensure=(date,branchId,cabang)=>{ const key=keyFor(date,branchId); if(!dailyMap.has(key))dailyMap.set(key,this.newDaily(date,branchId,cabang,capster)); return dailyMap.get(key); };

        const ownProvider=providerRows.filter(r=>Number(r.employee_id)===employeeId&&String(r.mapping_status||"").toUpperCase()==="MATCHED");
        const ownProduct=productRows.filter(r=>Number(r.employee_id)===employeeId&&String(r.mapping_status||"").toUpperCase()==="MATCHED");
        const ownAbsensi=absensiRows.filter(r=>Number(r.karyawan_id)===employeeId);
        const ownKasbon=kasbonRows.filter(r=>Number(r.employee_id)===employeeId&&String(r.status||"").toUpperCase()==="AKTIF"&&this.number(r.current_outstanding)>0);

        let gajiPokok=0, salaryMissing=false, salarySource=capster?"MINUTES_SHARE":(ryan?"CASHOUT_FLOATING_DAILY":"FIXED_MASTER");
        const salaryRates=[];

        if(capster){
            ownProvider.forEach(r=>{
                const date=this.normalizeDate(r.activity_date), branchId=Number(r.cabang_id)||employee.cabang_id;
                if(!date)return;
                const row=ensure(date,branchId,cabangMap.get(branchId)||r.cabang_minutes_name||homeCabang);
                row.service=this.number(row.service)+this.number(r.total_service);
                row.gajiPokok+=this.number(r.provider_share);
                row.salaryBasis="MINUTES_SHARE";
                row.providerRows.push(r.id);
                gajiPokok+=this.number(r.provider_share);
            });
        }else if(ryan){
            const items=this.extractRyanCashOutItems(cashOutRows);
            items.forEach(item=>{
                const row=ensure(item.tanggal,item.cabangId,cabangMap.get(item.cabangId)||homeCabang);
                row.gajiPokok+=item.amount;
                row.salaryBasis="CASHOUT_FLOATING_DAILY";
                row.cashOutSalaryItems.push(item.keterangan);
                gajiPokok+=item.amount;
            });
            salaryMissing=false;
        }else{
            const attendanceDates=new Set(ownAbsensi.map(r=>this.normalizeDate(r.tanggal)).filter(Boolean));
            this.dates(range.start,range.end).forEach(date=>{
                const rate=window.PayrollSalaryMasterStore?.rateAt(salaryData,employeeId,date)||null;
                if(!rate)return;
                salaryRates.push(rate);
                if(rate.payBasis==="MONTHLY"){
                    const amount=this.monthlyDailyAmount(rate.amount,date);
                    const row=ensure(date,employee.cabang_id,homeCabang);
                    row.gajiPokok+=amount; row.salaryBasis="MONTHLY"; gajiPokok+=amount;
                }else if(rate.payBasis==="DAILY"&&attendanceDates.has(date)){
                    const abs=ownAbsensi.find(a=>this.normalizeDate(a.tanggal)===date);
                    const branchId=Number(abs?.cabang_id)||employee.cabang_id;
                    const amount=this.number(rate.amount);
                    const row=ensure(date,branchId,cabangMap.get(branchId)||homeCabang);
                    row.gajiPokok+=amount; row.salaryBasis="DAILY"; gajiPokok+=amount;
                }
            });
            if(!salaryRates.length){ salaryMissing=true; salarySource="MISSING"; }
        }

        ownAbsensi.forEach(a=>{
            const date=this.normalizeDate(a.tanggal); if(!date)return;
            const branchId=Number(a.cabang_id)||employee.cabang_id;
            const row=ensure(date,branchId,cabangMap.get(branchId)||homeCabang);
            row.denda+=Math.max(0,this.number(a.denda));
            row.absensiStatus=a.status||null;
            row.terlambatMenit=(row.terlambatMenit||0)+this.number(a.terlambat_menit);
        });

        ownProduct.forEach(p=>{
            const date=this.normalizeDate(p.period_start); if(!date)return;
            const branchId=Number(p.cabang_id)||employee.cabang_id;
            const row=ensure(date,branchId,cabangMap.get(branchId)||p.cabang_minutes_name||homeCabang);
            row.bonusProduk+=this.number(p.revenue_share);
            row.bonusProdukQty+=this.number(p.qty);
            row.productItems.push({productName:p.product_name||"—",qty:this.number(p.qty),revenueShare:this.number(p.revenue_share)});
        });

        ownKasbon.forEach(k=>{
            const date=this.normalizeDate(k.disbursement_date);
            if(!date)return;
            const branchId=Number(k.branch_id)||employee.cabang_id;
            const row=ensure(date,branchId,cabangMap.get(branchId)||homeCabang);
            row.kasbon+=this.number(k.current_outstanding);
            (row.kasbonIds||(row.kasbonIds=[])).push(k.id);
        });

        const daily=Array.from(dailyMap.values()).sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||this.number(a.cabangId)-this.number(b.cabangId));
        const denda=daily.reduce((s,r)=>s+this.number(r.denda),0);
        const kasbon=daily.reduce((s,r)=>s+this.number(r.kasbon),0);
        const bonusProduk=daily.reduce((s,r)=>s+this.number(r.bonusProduk),0);
        const totalService=capster?daily.reduce((s,r)=>s+this.number(r.service),0):null;
        const adj=this.adjustmentFor(adjustments,employeeId);
        gajiPokok=Math.round(gajiPokok);
        const gajiBersih=gajiPokok-denda-kasbon+adj.bonusInsentif+adj.bonusKpi+bonusProduk;
        const uniqueRates=[...new Map(salaryRates.map(r=>[r.id,r])).values()];

        return {
            employeeId,namaKaryawan:employee.nama_karyawan||"—",jabatan:employee.jabatan||"—",aktif:Boolean(employee.aktif),isCapster:capster,isRyanCashoutFloating:ryan,
            homeCabangId:employee.cabang_id,homeCabang,daily,salarySource,salaryMissing,salaryRates:uniqueRates,
            summary:{totalService,gajiPokok,gajiKotor:gajiPokok,denda,kasbon,bonusInsentif:adj.bonusInsentif,bonusKpi:adj.bonusKpi,bonusProduk,gajiBersih}
        };
    },

    async loadPeriod({start,end,branchId=null,employeeId=null,adjustments={}}={}){
        const range=this.validateRange(start,end);
        const [karyawan,cabang,providerRows,productRows,absensiRows,kasbonRows,cashOutRows,salaryData]=await Promise.all([
            this.fetchKaryawan(),this.fetchCabang(),this.fetchProviderRows(range.start,range.end),this.fetchProductRows(range.start,range.end),this.fetchAbsensi(range.start,range.end),this.fetchKasbon(range.start,range.end),this.fetchCashOutRows(range.start,range.end),window.PayrollSalaryMasterStore?.loadAll?.()||Promise.resolve({rows:[],byEmployee:{}})
        ]);
        const cabangMap=new Map(cabang.map(r=>[Number(r.id),r.nama_cabang]));
        let employees=karyawan.slice();
        if(branchId!==null&&branchId!==undefined&&String(branchId).trim()!=="")employees=employees.filter(r=>Number(r.cabang_id)===Number(branchId));
        if(employeeId!==null&&employeeId!==undefined&&String(employeeId).trim()!=="")employees=employees.filter(r=>Number(r.id)===Number(employeeId));
        const ctx={range,cabangMap,providerRows,productRows,absensiRows,kasbonRows,cashOutRows,salaryData,adjustments};
        const payroll=employees.map(e=>this.buildEmployeePayroll(e,ctx));
        let pendingMapping=this.buildPendingMapping(providerRows,cabangMap);
        if(branchId!==null&&branchId!==undefined&&String(branchId).trim()!=="")pendingMapping=pendingMapping.filter(r=>Number(r.cabangId)===Number(branchId));
        const totals=payroll.reduce((a,r)=>{const s=r.summary;a.gajiPokok+=this.number(s.gajiPokok);a.denda+=this.number(s.denda);a.kasbon+=this.number(s.kasbon);a.bonusInsentif+=this.number(s.bonusInsentif);a.bonusKpi+=this.number(s.bonusKpi);a.bonusProduk+=this.number(s.bonusProduk);a.gajiBersih+=this.number(s.gajiBersih);return a;},{gajiPokok:0,denda:0,kasbon:0,bonusInsentif:0,bonusKpi:0,bonusProduk:0,gajiBersih:0});
        totals.gajiKotor=totals.gajiPokok;
        return {range,branchId:branchId?Number(branchId):null,payroll,pendingMapping,pendingSummary:{rows:pendingMapping.length,service:pendingMapping.reduce((s,r)=>s+this.number(r.service),0),providerShare:pendingMapping.reduce((s,r)=>s+this.number(r.providerShare),0)},totals,salaryData};
    }
};

window.PayrollUnifiedEngine=PayrollUnifiedEngine;
