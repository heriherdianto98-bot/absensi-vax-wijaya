/*
=========================================================
VAX ERP — Historical Original Router V3
=========================================================
READ ONLY bridge for immutable monthly snapshots plus an
AUDITED payroll-correction overlay for data that was not yet
configured when the snapshot was frozen.

Rules:
- NEVER changes PayrollUnifiedEngine / payroll formulas.
- NEVER changes immutable snapshot rows.
- Locked snapshot data is read through secure Supabase RPC.
- Historical corrections are stored separately with audit trail.
- Historical Kasbon correction is payroll-only and NEVER creates
  a Kasbon transaction or Arus Kas movement.
- SELF scope is forced to the authenticated employee only.
- Unsupported historical contexts fail closed.
- Returning null means the requested period has no locked
  snapshot and the caller may use the normal LIVE path.
=========================================================
*/
(() => {
  const RPC = 'erp_read_locked_payroll_snapshot_v4';
  const SAVE_RPC = 'erp_save_historical_payroll_correction';
  let lastHistoricalResult = null;

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
  const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(number(n));
  const rupiahInput = n => `Rp ${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(number(n))}`;
  const parseRupiah = value => Number(String(value ?? '').replace(/[^0-9]/g,'') || 0);
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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

  function applyKasbonCorrectionOverlay(rows,corrections,karyawan,start){
    let adjusted=asArray(rows).slice();
    asArray(corrections).forEach(corr=>{
      if(corr.kasbon_override===null || corr.kasbon_override===undefined) return;
      const employeeId=Number(corr.employee_id||0);
      if(!employeeId) return;
      const employee=asArray(karyawan).find(e=>Number(e.id)===employeeId);
      adjusted=adjusted.filter(r=>Number(r.employee_id)!==employeeId);
      const total=Math.max(0,number(corr.kasbon_override));
      if(total<=0) return;
      adjusted.push({
        id:`historical-kasbon-correction-${employeeId}-${start}`,
        employee_id:employeeId,
        branch_id:Number(employee?.cabang_id)||null,
        employee_name_snapshot:employee?.nama_karyawan||'',
        position_snapshot:employee?.jabatan||'',
        request_date:start,
        approved_amount:total,
        disbursement_date:start,
        status:'AKTIF',
        current_outstanding:total,
        total_paid:0,
        payment_method:'BULANAN',
        source:'HISTORICAL_CORRECTION'
      });
    });
    return adjusted;
  }

  function applyCorrectionOverlay({engine,karyawan,salaryRows,manualMonth,corrections,start,end}){
    const correctionMap=new Map(asArray(corrections).map(c=>[Number(c.employee_id),c]));
    let adjustedSalaryRows=asArray(salaryRows).slice();
    const adjustments=adjustmentsFrom(manualMonth);

    correctionMap.forEach((corr,employeeId)=>{
      const employee=karyawan.find(e=>Number(e.id)===employeeId);
      if(!employee)return;

      if(corr.gaji_pokok_override!==null && corr.gaji_pokok_override!==undefined){
        if(engine.isCapster(employee)){
          throw new Error(`Koreksi Gaji Pokok Capster diblokir: ${employee.nama_karyawan}. Gaji Capster harus tetap mengikuti snapshot Minutes.`);
        }
        adjustedSalaryRows=adjustedSalaryRows.filter(r=>Number(r.employee_id)!==employeeId);
        adjustedSalaryRows.push({
          id:`historical-correction-${employeeId}-${start}`,
          employee_id:employeeId,
          pay_basis:'MONTHLY',
          amount:number(corr.gaji_pokok_override),
          effective_from:start,
          effective_to:end,
          active:true,
          note:`Historical payroll correction: ${corr.note||''}`,
          updated_at:corr.updated_at||null
        });
      }

      const prev=adjustments[employeeId]||adjustments[String(employeeId)]||{bonusInsentif:0,bonusKpi:0};
      adjustments[employeeId]={
        bonusInsentif:(corr.bonus_insentif_override!==null&&corr.bonus_insentif_override!==undefined)?number(corr.bonus_insentif_override):number(prev.bonusInsentif),
        bonusKpi:(corr.bonus_kpi_override!==null&&corr.bonus_kpi_override!==undefined)?number(corr.bonus_kpi_override):number(prev.bonusKpi)
      };
    });

    return {salaryData:salaryDataFrom(adjustedSalaryRows),adjustments,correctionMap};
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
    const cashOutRows = asArray(data.daily_recap_source);
    const manualMonth = manualMonthFrom(data.payroll_manual_adjustments, start);
    const corrections = asArray(payload?.historical_corrections);
    const baseKasbonRows = historicalKasbonRows(data.employee_cash_advances,data.employee_cash_advance_payments,range.start,range.end);
    const kasbonRows = applyKasbonCorrectionOverlay(baseKasbonRows,corrections,karyawan,range.start);
    const overlay=applyCorrectionOverlay({engine,karyawan,salaryRows:data.payroll_salary_master,manualMonth,corrections,start:range.start,end:range.end});
    const salaryData=overlay.salaryData;
    const adjustments=overlay.adjustments;
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
    if(branchId!==null && branchId!==undefined && String(branchId).trim()!=='') employees = employees.filter(r => Number(r.cabang_id)===Number(branchId));
    if(effectiveEmployeeId!==null && effectiveEmployeeId!==undefined && String(effectiveEmployeeId).trim()!=='') employees = employees.filter(r => Number(r.id)===Number(effectiveEmployeeId));

    const ctx = {range,cabangMap,providerRows,productRows,absensiRows,kasbonRows,backupAssignments,salaryData,adjustments};
    const payroll = employees.map(e => engine.buildEmployeePayroll(e,ctx));

    let pendingMapping = engine.buildPendingMapping(providerRows,cabangMap);
    if(branchId!==null && branchId!==undefined && String(branchId).trim()!=='') pendingMapping = pendingMapping.filter(r => Number(r.cabangId)===Number(branchId));
    const pendingBackupAssignments = asArray(backupAssignments.pending).map(i => ({...i,cabang:cabangMap.get(Number(i.cabangId))||'—',mappingStatus:'AMBIGUOUS_BACKUP'}));
    const totals = payroll.reduce((a,r) => {
      const s=r.summary||{};
      a.gajiPokok+=engine.number(s.gajiPokok);a.denda+=engine.number(s.denda);a.kasbon+=engine.number(s.kasbon);
      a.bonusInsentif+=engine.number(s.bonusInsentif);a.bonusKpi+=engine.number(s.bonusKpi);a.bonusProduk+=engine.number(s.bonusProduk);a.gajiBersih+=engine.number(s.gajiBersih);
      return a;
    },{gajiPokok:0,denda:0,kasbon:0,bonusInsentif:0,bonusKpi:0,bonusProduk:0,gajiBersih:0});
    totals.gajiKotor=totals.gajiPokok;

    const visibleCorrections=corrections.filter(c=>employees.some(e=>Number(e.id)===Number(c.employee_id)));
    const snapshot={...(payload.snapshot||{}),correction_count:visibleCorrections.length};

    const result={
      range,branchId:branchId?Number(branchId):null,payroll,pendingMapping,pendingBackupAssignments,backupAssignments,
      pendingSummary:{rows:pendingMapping.length,service:pendingMapping.reduce((s,r)=>s+engine.number(r.service),0),providerShare:pendingMapping.reduce((s,r)=>s+engine.number(r.providerShare),0),backupRows:pendingBackupAssignments.length},
      totals,salaryData,manualMonth,source:'SNAPSHOT_ORIGINAL',accessScope,snapshot,historicalLocked:true,
      historicalCorrections:visibleCorrections
    };
    lastHistoricalResult=result;
    window.__VAX_HISTORICAL_PAYROLL_RESULT__=result;
    requestAnimationFrame(renderCorrectionPanels);
    return result;
  }

  async function loadPayrollPeriod({start,end,branchId=null,employeeId=null}={}){
    if(typeof db === 'undefined' || !db?.rpc) return null;
    const {data,error}=await db.rpc(RPC,{p_period_start:start,p_period_end:end});
    if(error){
      if(isSnapshotNotFound(error)) return null;
      throw error;
    }
    if(data && String(data.status||'').toUpperCase()==='NOT_FOUND') return null;
    if(!data || String(data.status||'').toUpperCase()!=='LOCKED') throw new Error('Snapshot historis tidak valid. LIVE fallback diblokir.');
    return buildResult(data,{start,end,branchId,employeeId});
  }

  function ensureCorrectionStyle(){
    if(document.getElementById('historicalPayrollCorrectionStyle'))return;
    const s=document.createElement('style');s.id='historicalPayrollCorrectionStyle';s.textContent=`
      .hist-payroll-correction{margin:12px 18px 14px;padding:14px;border:1px solid rgba(217,180,50,.45);border-radius:12px;background:rgba(217,180,50,.07)}
      .hist-payroll-correction h4{margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#e3c24a}
      .hist-payroll-correction p{margin:0 0 12px;color:#9eabb7;font-size:12px}
      .hist-payroll-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.hist-payroll-grid label{display:flex;flex-direction:column;gap:5px;font-size:11px;color:#99a8b5}.hist-payroll-grid input{min-width:0;border:1px solid #344552;border-radius:8px;background:#101820;color:#eef4f7;padding:9px 10px}
      .hist-payroll-actions{display:flex;align-items:center;gap:10px;margin-top:10px}.hist-payroll-save{border:1px solid #d5b233;background:#d5b233;color:#101010;border-radius:8px;padding:9px 14px;font-weight:800;cursor:pointer}.hist-payroll-save:disabled{opacity:.6}.hist-payroll-msg{font-size:12px;color:#9eabb7}.hist-payroll-capster{padding:9px 10px;border:1px solid #344552;border-radius:8px;color:#9eabb7;background:#101820}
      @media(max-width:1000px){.hist-payroll-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.hist-payroll-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function renderCorrectionPanels(){
    const result=lastHistoricalResult;
    if(!result?.historicalLocked || String(result.accessScope||'').toUpperCase()!=='OWNER'){
      document.querySelectorAll('.hist-payroll-correction').forEach(el=>el.remove());
      return;
    }
    ensureCorrectionStyle();
    const corrMap=new Map(asArray(result.historicalCorrections).map(c=>[Number(c.employee_id),c]));
    document.querySelectorAll('.payroll-employee-card[data-employee-id]').forEach(card=>{
      const employeeId=Number(card.dataset.employeeId||0);if(!employeeId)return;
      const payrollRow=result.payroll.find(r=>Number(r.employeeId)===employeeId);if(!payrollRow)return;
      const old=card.querySelector('.hist-payroll-correction');if(old)return;
      const corr=corrMap.get(employeeId)||{};
      const wrap=document.createElement('section');wrap.className='hist-payroll-correction';
      const gajiField=payrollRow.isCapster
        ? `<label><span>Gaji Pokok Historis</span><div class="hist-payroll-capster">Capster mengikuti snapshot Minutes (${money(payrollRow.summary?.gajiPokok)})</div></label>`
        : `<label><span>Gaji Pokok Historis</span><input class="hist-gaji" inputmode="numeric" value="${corr.gaji_pokok_override!=null?rupiahInput(corr.gaji_pokok_override):''}" placeholder="Kosong = data snapshot"></label>`;
      wrap.innerHTML=`<h4>Koreksi Payroll Historis</h4><p>Snapshot asli tetap terkunci. Koreksi ini terpisah dan tercatat di audit trail. Kasbon Historis adalah total kasbon payroll periode dan tidak membuat transaksi Kasbon/Arus Kas baru.</p><div class="hist-payroll-grid">${gajiField}<label><span>Kasbon Historis (Total)</span><input class="hist-kasbon" inputmode="numeric" value="${corr.kasbon_override!=null?rupiahInput(corr.kasbon_override):''}" placeholder="Kosong = data snapshot"></label><label><span>Bonus Insentif</span><input class="hist-insentif" inputmode="numeric" value="${corr.bonus_insentif_override!=null?rupiahInput(corr.bonus_insentif_override):''}" placeholder="Kosong = data snapshot"></label><label><span>Bonus KPI</span><input class="hist-kpi" inputmode="numeric" value="${corr.bonus_kpi_override!=null?rupiahInput(corr.bonus_kpi_override):''}" placeholder="Kosong = data snapshot"></label><label><span>Catatan / Alasan</span><input class="hist-note" value="${escapeHtml(corr.note||'')}"></label></div><div class="hist-payroll-actions"><button type="button" class="hist-payroll-save">Simpan Koreksi Historis</button><span class="hist-payroll-msg"></span></div>`;

      const head=card.querySelector('.payroll-card-head');
      if(head?.nextSibling) card.insertBefore(wrap,head.nextSibling);
      else if(head) card.appendChild(wrap);
      else card.prepend(wrap);

      wrap.querySelectorAll('input[inputmode="numeric"]').forEach(input=>input.addEventListener('blur',()=>{if(input.value.trim())input.value=rupiahInput(parseRupiah(input.value));}));
      wrap.querySelector('.hist-payroll-save')?.addEventListener('click',async e=>{
        const btn=e.currentTarget,msg=wrap.querySelector('.hist-payroll-msg');
        const nullableMoney=sel=>{const v=wrap.querySelector(sel)?.value?.trim()||'';return v?parseRupiah(v):null;};
        try{
          btn.disabled=true;msg.textContent='Menyimpan koreksi…';
          const {data,error}=await db.rpc(SAVE_RPC,{
            p_period_month:result.range.start,
            p_employee_id:employeeId,
            p_gaji_pokok_override:payrollRow.isCapster?null:nullableMoney('.hist-gaji'),
            p_bonus_insentif_override:nullableMoney('.hist-insentif'),
            p_bonus_kpi_override:nullableMoney('.hist-kpi'),
            p_kasbon_override:nullableMoney('.hist-kasbon'),
            p_note:wrap.querySelector('.hist-note')?.value||null
          });
          if(error)throw error;
          if(String(data?.status||'').toUpperCase()!=='OK')throw new Error('Koreksi historis gagal disimpan.');
          msg.textContent='Tersimpan. Memuat ulang payroll…';
          setTimeout(()=>document.getElementById('payrollRefresh')?.click(),250);
        }catch(err){msg.textContent=err?.message||'Gagal menyimpan koreksi.';}finally{btn.disabled=false;}
      });
    });
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(renderCorrectionPanels));
  const startObserver=()=>{const list=document.getElementById('payrollList');if(list)observer.observe(list,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startObserver,{once:true});else startObserver();

  window.HistoricalOriginalRouter = Object.freeze({loadPayrollPeriod,buildResult});
})();