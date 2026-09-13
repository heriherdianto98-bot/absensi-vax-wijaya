/*
=========================================================
VAX ERP — Historical Original Router V1
=========================================================
READ ONLY bridge for immutable monthly snapshots.

Rules:
- NEVER changes PayrollUnifiedEngine / payroll formulas.
- Locked snapshot data is read through secure Supabase RPC.
- When a locked snapshot is available, payroll is rebuilt by
  the existing LOCKED PayrollUnifiedEngine formula methods.
- SELF scope is forced to the authenticated employee only.
- Unsupported historical contexts fail closed.
- Returning null means the requested period has no locked
  snapshot and the caller may use the normal LIVE path.
=========================================================
*/
(() => {
  const RPC = 'erp_read_locked_payroll_snapshot_v3';

  const asArray = value => Array.isArray(value) ? value : [];
  const number = value => {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  };
  const normalizeDate = value => {
    const s = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  };
  const isSnapshotNotFound = err => /LOCKED_SNAPSHOT_NOT_FOUND/i.test(String(err?.message || err || ''));

  function salaryDataFrom(rows){
    const normalized = asArray(rows).map(row => {
      if(window.PayrollSalaryMasterStore?.normalizeRow) return window.PayrollSalaryMasterStore.normalizeRow(row);
      return {
        id: row.id,
        employeeId: Number(row.employee_id),
        payBasis: String(row.pay_basis || '').toUpperCase(),
        amount: number(row.amount),
        effectiveFrom: normalizeDate(row.effective_from),
        effectiveTo: row.effective_to ? normalizeDate(row.effective_to) : null,
        active: row.active !== false,
        note: row.note || '',
        updatedAt: row.updated_at || null
      };
    });
    const byEmployee = {};
    normalized.forEach(row => {
      const key = String(row.employeeId);
      (byEmployee[key] || (byEmployee[key] = [])).push(row);
    });
    return { rows: normalized, byEmployee };
  }

  function manualMonthFrom(rows, periodStart){
    const raw = asArray(rows);
    const byEmployee = {};
    raw.forEach(row => {
      byEmployee[String(row.employee_id)] = {
        id: row.id,
        employeeId: Number(row.employee_id),
        periodMonth: row.period_month,
        bonusInsentif: number(row.bonus_insentif),
        bonusKpi: number(row.bonus_kpi),
        note: row.note || '',
        updatedAt: row.updated_at || null
      };
    });
    return { periodMonth: normalizeDate(periodStart), rows: raw, byEmployee };
  }

  function adjustmentsFrom(manualMonth){
    if(window.PayrollManualAdjustmentStore?.toEngineAdjustments){
      return window.PayrollManualAdjustmentStore.toEngineAdjustments(manualMonth);
    }
    const result = {};
    Object.entries(manualMonth?.byEmployee || {}).forEach(([employeeId,row]) => {
      result[employeeId] = { bonusInsentif:number(row.bonusInsentif), bonusKpi:number(row.bonusKpi) };
    });
    return result;
  }

  // Mirrors the already-approved PayrollKasbonMonthlyBridge view-model behavior,
  // using ONLY immutable snapshot rows. No database writes are performed.
  function historicalKasbonRows(advances,payments,start,end){
    const payrollPayments=asArray(payments).filter(p =>
      String(p.payment_method||'').toUpperCase()==='BULANAN' &&
      String(p.source||'').toUpperCase()==='PAYROLL' &&
      String(p.payroll_period||'')>=start && String(p.payroll_period||'')<=end
    );
    const paidByKasbon=new Map();
    payrollPayments.forEach(p=>{
      const key=String(p.kasbon_id||''); if(!key)return;
      const prev=paidByKasbon.get(key)||{amount:0,paymentDate:null};
      prev.amount+=number(p.amount);
      const date=normalizeDate(p.payment_date);
      if(date&&(!prev.paymentDate||date>prev.paymentDate))prev.paymentDate=date;
      paidByKasbon.set(key,prev);
    });

    return asArray(advances)
      .filter(r=>String(r.payment_method||'BULANAN').toUpperCase()==='BULANAN')
      .flatMap(r=>{
        const historical=paidByKasbon.get(String(r.id));
        const outstanding=Math.max(0,number(r.current_outstanding));
        const approved=Math.max(0,number(r.approved_amount));
        const status=String(r.status||'').toUpperCase();
        const disbursementDate=normalizeDate(r.disbursement_date);
        const disbursedInPeriod=Boolean(disbursementDate&&disbursementDate>=start&&disbursementDate<=end);
        let deduction=0,baseDate=disbursementDate||start;
        if((historical?.amount||0)>0){deduction=number(historical.amount);baseDate=historical.paymentDate||baseDate;}
        else if(outstanding>0) deduction=outstanding;
        else if(status==='LUNAS'&&disbursedInPeriod&&approved>0) deduction=approved;
        if(deduction<=0)return [];
        const payrollDate=baseDate<start?start:(baseDate>end?end:baseDate);
        return [{...r,status:'AKTIF',current_outstanding:deduction,disbursement_date:payrollDate}];
      });
  }

  function buildResult(payload,{start,end,branchId=null,employeeId=null}={}){
    if(!window.PayrollUnifiedEngine) throw new Error('PayrollUnifiedEngine belum tersedia');
    const engine = window.PayrollUnifiedEngine;
    const range = engine.validateRange(start,end);
    const data = payload?.data || {};
    const karyawan = asArray(data.karyawan);
    const cabang = asArray(data.cabang);
    const providerRows = asArray(data.provider_sales_daily_source);
    const productRows = asArray(data.product_sales_source);
    const absensiRows = asArray(data.absensi);
    const kasbonRows = historicalKasbonRows(data.employee_cash_advances,data.employee_cash_advance_payments,range.start,range.end);
    const cashOutRows = asArray(data.daily_recap_source);
    const salaryData = salaryDataFrom(data.payroll_salary_master);
    const manualMonth = manualMonthFrom(data.payroll_manual_adjustments, start);
    const adjustments = adjustmentsFrom(manualMonth);
    const cabangMap = new Map(cabang.map(r => [Number(r.id), r.nama_cabang]));

    const accessScope = String(payload?.access_scope || '').toUpperCase();
    if(payload?.supported === false){
      const reason = payload?.reason || 'HISTORICAL_CONTEXT_UNSUPPORTED';
      throw new Error(`Data original terkunci tidak dapat dibuka: ${reason}`);
    }

    let effectiveEmployeeId = employeeId;
    if(accessScope === 'SELF') effectiveEmployeeId = Number(payload.employee_id || 0) || null;

    const backupAssignments = engine.buildBackupAssignments({karyawan,absensiRows,cashOutRows});
    let employees = karyawan.slice();
    if(branchId!==null && branchId!==undefined && String(branchId).trim()!==''){
      employees = employees.filter(r => Number(r.cabang_id)===Number(branchId));
    }
    if(effectiveEmployeeId!==null && effectiveEmployeeId!==undefined && String(effectiveEmployeeId).trim()!==''){
      employees = employees.filter(r => Number(r.id)===Number(effectiveEmployeeId));
    }

    const ctx = {range,cabangMap,providerRows,productRows,absensiRows,kasbonRows,backupAssignments,salaryData,adjustments};
    const payroll = employees.map(e => engine.buildEmployeePayroll(e,ctx));

    let pendingMapping = engine.buildPendingMapping(providerRows,cabangMap);
    if(branchId!==null && branchId!==undefined && String(branchId).trim()!==''){
      pendingMapping = pendingMapping.filter(r => Number(r.cabangId)===Number(branchId));
    }
    const pendingBackupAssignments = asArray(backupAssignments.pending).map(i => ({
      ...i,
      cabang:cabangMap.get(Number(i.cabangId))||'—',
      mappingStatus:'AMBIGUOUS_BACKUP'
    }));
    const totals = payroll.reduce((a,r) => {
      const s=r.summary||{};
      a.gajiPokok+=engine.number(s.gajiPokok);a.denda+=engine.number(s.denda);a.kasbon+=engine.number(s.kasbon);
      a.bonusInsentif+=engine.number(s.bonusInsentif);a.bonusKpi+=engine.number(s.bonusKpi);a.bonusProduk+=engine.number(s.bonusProduk);a.gajiBersih+=engine.number(s.gajiBersih);
      return a;
    },{gajiPokok:0,denda:0,kasbon:0,bonusInsentif:0,bonusKpi:0,bonusProduk:0,gajiBersih:0});
    totals.gajiKotor=totals.gajiPokok;

    return {
      range,
      branchId:branchId?Number(branchId):null,
      payroll,
      pendingMapping,
      pendingBackupAssignments,
      backupAssignments,
      pendingSummary:{
        rows:pendingMapping.length,
        service:pendingMapping.reduce((s,r)=>s+engine.number(r.service),0),
        providerShare:pendingMapping.reduce((s,r)=>s+engine.number(r.providerShare),0),
        backupRows:pendingBackupAssignments.length
      },
      totals,
      salaryData,
      manualMonth,
      source:'SNAPSHOT_ORIGINAL',
      accessScope,
      snapshot:payload.snapshot||null,
      historicalLocked:true
    };
  }

  async function loadPayrollPeriod({start,end,branchId=null,employeeId=null}={}){
    if(typeof db === 'undefined' || !db?.rpc) return null;
    const {data,error}=await db.rpc(RPC,{p_period_start:start,p_period_end:end});
    if(error){
      if(isSnapshotNotFound(error)) return null;
      throw error;
    }
    const status=String(data?.status||'').toUpperCase();
    if(status==='NOT_FOUND') return null;
    if(!data || status!=='LOCKED'){
      throw new Error('Snapshot historis tidak valid. LIVE fallback diblokir.');
    }
    return buildResult(data,{start,end,branchId,employeeId});
  }

  window.HistoricalOriginalRouter = Object.freeze({loadPayrollPeriod,buildResult});
})();