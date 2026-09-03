/*
=========================================================
VAX ERP — Payroll Capster Engine V1
=========================================================
OWNER RULES:
- Gaji Kotor Capster = total provider_share dari Minutes
- Denda = input dari modul Absensi (belum disimpan engine ini)
- Bonus Insentif = input manual
- Bonus KPI = input manual
- Bonus Penjualan Produk = revenue_share milik employee dari product_sales_source
- Gaji Bersih = Gaji Kotor - Denda + Bonus Insentif + Bonus KPI + Bonus Produk
- Backup / Capster generic yang belum jelas orangnya TIDAK boleh dipaksa ke payroll;
  tetap masuk pendingMapping sampai SVP memilih employee sebenarnya.

CATATAN:
Engine ini READ ONLY terhadap source. Tidak menulis / mengubah source Minutes.
=========================================================
*/

const PayrollCapsterEngine = {
    TABLE_KARYAWAN: "karyawan",
    TABLE_CABANG: "cabang",
    TABLE_PROVIDER_DAILY: "provider_sales_daily_source",
    TABLE_PRODUCT_SALES: "product_sales_source",

    number(value){ const n = Number(value || 0); return Number.isFinite(n) ? n : 0; },
    normalizeDate(value){
        const s = String(value || "").trim();
        if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        return "";
    },
    validateRange(start, end){
        const s = this.normalizeDate(start), e = this.normalizeDate(end);
        if(!s || !e) throw new Error("PayrollCapsterEngine: start/end wajib YYYY-MM-DD");
        if(s > e) throw new Error("PayrollCapsterEngine: start tidak boleh setelah end");
        return { start:s, end:e };
    },
    adjustmentFor(adjustments, employeeId){
        const raw = (adjustments || {})[employeeId] || (adjustments || {})[String(employeeId)] || {};
        return { denda:Math.max(0,this.number(raw.denda)), bonusInsentif:this.number(raw.bonusInsentif), bonusKpi:this.number(raw.bonusKpi) };
    },
    async fetchKaryawan(){
        const { data,error } = await db.from(this.TABLE_KARYAWAN).select("id,nama_karyawan,cabang_id,jabatan,aktif").order("nama_karyawan",{ascending:true});
        if(error) throw error; return Array.isArray(data)?data:[];
    },
    async fetchCabang(){
        const { data,error } = await db.from(this.TABLE_CABANG).select("id,nama_cabang").order("id",{ascending:true});
        if(error) throw error; return Array.isArray(data)?data:[];
    },
    async fetchProviderRows(start,end){
        const { data,error } = await db.from(this.TABLE_PROVIDER_DAILY)
            .select("id,activity_date,cabang_id,cabang_minutes_name,provider_name_raw,provider_name_normalized,provider_minutes_id,employee_id,mapping_status,total_service,provider_share,sub_income,total_income")
            .gte("activity_date",start).lte("activity_date",end).order("activity_date",{ascending:true});
        if(error) throw error; return Array.isArray(data)?data:[];
    },
    async fetchProductRows(start,end){
        const { data,error } = await db.from(this.TABLE_PRODUCT_SALES)
            .select("id,period_start,period_end,cabang_id,cabang_minutes_name,product_name,provider_name_raw,provider_name_normalized,provider_minutes_id,employee_id,mapping_status,qty,revenue_share")
            .gte("period_start",start).lte("period_start",end).order("period_start",{ascending:true});
        if(error) throw error;
        return (Array.isArray(data)?data:[]).filter(row=>{
            const s=this.normalizeDate(row.period_start), e=this.normalizeDate(row.period_end);
            return s && e && s===e && s>=start && s<=end;
        });
    },
    isCapster(employee){ return String(employee?.jabatan||"").trim().toLowerCase()==="capster"; },
    buildPendingMapping(providerRows,cabangMap){
        return providerRows.filter(row=>!row.employee_id || String(row.mapping_status||"").toUpperCase()!=="MATCHED").map(row=>({
            sourceId:row.id,tanggal:this.normalizeDate(row.activity_date),cabangId:row.cabang_id,
            cabang:cabangMap.get(Number(row.cabang_id))||row.cabang_minutes_name||"—",
            providerMinutes:row.provider_name_raw||row.provider_name_normalized||"Capster",providerMinutesId:row.provider_minutes_id||null,
            service:this.number(row.total_service),providerShare:this.number(row.provider_share),mappingStatus:row.mapping_status||"AMBIGUOUS"
        })).sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||this.number(a.cabangId)-this.number(b.cabangId));
    },
    buildEmployeePayroll(employee,providerRows,productRows,cabangMap,adjustments){
        const employeeId=Number(employee.id);
        const ownProviderRows=providerRows.filter(row=>Number(row.employee_id)===employeeId && String(row.mapping_status||"").toUpperCase()==="MATCHED");
        const ownProductRows=productRows.filter(row=>Number(row.employee_id)===employeeId && String(row.mapping_status||"").toUpperCase()==="MATCHED");
        const productByDate=new Map();
        ownProductRows.forEach(row=>{
            const tanggal=this.normalizeDate(row.period_start); if(!tanggal)return;
            const current=productByDate.get(tanggal)||{qty:0,share:0,items:[]};
            current.qty+=this.number(row.qty); current.share+=this.number(row.revenue_share);
            current.items.push({productName:row.product_name||"—",qty:this.number(row.qty),revenueShare:this.number(row.revenue_share),cabangId:row.cabang_id,cabang:cabangMap.get(Number(row.cabang_id))||row.cabang_minutes_name||"—"});
            productByDate.set(tanggal,current);
        });
        const providerByDate=new Map();
        ownProviderRows.forEach(row=>{
            const tanggal=this.normalizeDate(row.activity_date); if(!tanggal)return;
            const key=`${tanggal}|${Number(row.cabang_id)||0}`;
            const current=providerByDate.get(key)||{tanggal,cabangId:row.cabang_id,cabang:cabangMap.get(Number(row.cabang_id))||row.cabang_minutes_name||"—",service:0,gajiHarian:0,providerRows:[]};
            current.service+=this.number(row.total_service); current.gajiHarian+=this.number(row.provider_share); current.providerRows.push(row.id); providerByDate.set(key,current);
        });
        const daily=Array.from(providerByDate.values()).map(row=>{
            const product=productByDate.get(row.tanggal)||{qty:0,share:0,items:[]};
            return {...row,bonusProdukQty:product.qty,bonusProduk:product.share,productItems:product.items};
        }).sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||this.number(a.cabangId)-this.number(b.cabangId));
        productByDate.forEach((product,tanggal)=>{
            if(daily.some(row=>row.tanggal===tanggal))return;
            const first=product.items[0]||{};
            daily.push({tanggal,cabangId:first.cabangId||employee.cabang_id||null,cabang:first.cabang||cabangMap.get(Number(employee.cabang_id))||"—",service:0,gajiHarian:0,providerRows:[],bonusProdukQty:product.qty,bonusProduk:product.share,productItems:product.items,bonusOnly:true});
        });
        daily.sort((a,b)=>a.tanggal.localeCompare(b.tanggal)||this.number(a.cabangId)-this.number(b.cabangId));
        const gajiKotor=ownProviderRows.reduce((s,r)=>s+this.number(r.provider_share),0);
        const bonusProduk=ownProductRows.reduce((s,r)=>s+this.number(r.revenue_share),0);
        const totalService=ownProviderRows.reduce((s,r)=>s+this.number(r.total_service),0);
        const adjustment=this.adjustmentFor(adjustments,employeeId);
        const gajiBersih=gajiKotor-adjustment.denda+adjustment.bonusInsentif+adjustment.bonusKpi+bonusProduk;
        return {employeeId,namaKaryawan:employee.nama_karyawan||"—",jabatan:employee.jabatan||"Capster",aktif:Boolean(employee.aktif),homeCabangId:employee.cabang_id,homeCabang:cabangMap.get(Number(employee.cabang_id))||"—",daily,summary:{totalService,gajiKotor,denda:adjustment.denda,bonusInsentif:adjustment.bonusInsentif,bonusKpi:adjustment.bonusKpi,bonusProduk,gajiBersih}};
    },
    async loadPeriod({start,end,branchId=null,employeeId=null,adjustments={}}={}){
        const range=this.validateRange(start,end);
        const [karyawan,cabang,providerRows,productRows]=await Promise.all([this.fetchKaryawan(),this.fetchCabang(),this.fetchProviderRows(range.start,range.end),this.fetchProductRows(range.start,range.end)]);
        const cabangMap=new Map(cabang.map(row=>[Number(row.id),row.nama_cabang]));
        let capsters=karyawan.filter(row=>this.isCapster(row));
        if(branchId!==null && branchId!==undefined && String(branchId).trim()!=="") capsters=capsters.filter(row=>Number(row.cabang_id)===Number(branchId));
        if(employeeId!==null && employeeId!==undefined && String(employeeId).trim()!=="") capsters=capsters.filter(row=>Number(row.id)===Number(employeeId));
        const payroll=capsters.map(employee=>this.buildEmployeePayroll(employee,providerRows,productRows,cabangMap,adjustments));
        let pendingMapping=this.buildPendingMapping(providerRows,cabangMap);
        if(branchId!==null && branchId!==undefined && String(branchId).trim()!=="") pendingMapping=pendingMapping.filter(row=>Number(row.cabangId)===Number(branchId));
        const totals=payroll.reduce((acc,row)=>{acc.gajiKotor+=this.number(row.summary.gajiKotor);acc.denda+=this.number(row.summary.denda);acc.bonusInsentif+=this.number(row.summary.bonusInsentif);acc.bonusKpi+=this.number(row.summary.bonusKpi);acc.bonusProduk+=this.number(row.summary.bonusProduk);acc.gajiBersih+=this.number(row.summary.gajiBersih);return acc;},{gajiKotor:0,denda:0,bonusInsentif:0,bonusKpi:0,bonusProduk:0,gajiBersih:0});
        return {range,branchId:branchId?Number(branchId):null,payroll,pendingMapping,pendingSummary:{rows:pendingMapping.length,service:pendingMapping.reduce((s,r)=>s+this.number(r.service),0),providerShare:pendingMapping.reduce((s,r)=>s+this.number(r.providerShare),0)},totals};
    }
};
window.PayrollCapsterEngine=PayrollCapsterEngine;
