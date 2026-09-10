/* VAX ERP — Payroll Kasbon Monthly Bridge V2
   UI/engine bridge only. Keeps locked payroll formula/source ownership intact.
   BULANAN kasbon is deducted by Payroll; HARIAN is paid via SVP daily flow and must not be deducted here.

   Owner rule:
   - Kasbon BULANAN tetap tercatat sebagai potongan payroll pada periode terkait walau status sudah LUNAS.
   - Jika belum diposting payroll, sumber potongan = current_outstanding.
   - Jika sudah diposting payroll dan outstanding menjadi 0/LUNAS, sumber historis potongan = employee_cash_advance_payments source PAYROLL.
   - Tidak mengubah formula PayrollUnifiedEngine dan tidak menulis Arus Kas.
*/
(() => {
  if (typeof PayrollUnifiedEngine === 'undefined' || typeof db === 'undefined') return;

  PayrollUnifiedEngine.fetchKasbon = async function(start,end){
    const [{data:advances,error:advanceError},{data:payments,error:paymentError}] = await Promise.all([
      db
        .from(this.TABLE_KASBON)
        .select("id,employee_id,branch_id,employee_name_snapshot,position_snapshot,request_date,approved_amount,disbursement_date,status,current_outstanding,total_paid,payment_method")
        .lte("disbursement_date",end)
        .in("status",["DICAIRKAN","AKTIF","LUNAS"])
        .order("disbursement_date",{ascending:true}),
      db
        .from("employee_cash_advance_payments")
        .select("id,kasbon_id,employee_id,branch_id,payment_date,amount,payment_method,source,payroll_period,created_at")
        .eq("payment_method","BULANAN")
        .eq("source","PAYROLL")
        .gte("payroll_period",start)
        .lte("payroll_period",end)
        .order("payment_date",{ascending:true})
    ]);
    if(advanceError) throw advanceError;
    if(paymentError) throw paymentError;

    const monthly = (Array.isArray(advances)?advances:[])
      .filter(r=>String(r.payment_method||'BULANAN').toUpperCase()==='BULANAN');
    const payrollPayments = Array.isArray(payments)?payments:[];
    const paidByKasbon = new Map();

    payrollPayments.forEach(p=>{
      const key=String(p.kasbon_id||'');
      if(!key) return;
      const prev=paidByKasbon.get(key)||{amount:0,paymentDate:null};
      prev.amount+=Number(p.amount||0);
      if(!prev.paymentDate || String(p.payment_date||'')>prev.paymentDate) prev.paymentDate=String(p.payment_date||'');
      paidByKasbon.set(key,prev);
    });

    return monthly.flatMap(r=>{
      const historical=paidByKasbon.get(String(r.id));
      const outstanding=Math.max(0,Number(r.current_outstanding||0));
      const deduction=historical?.amount>0 ? historical.amount : outstanding;
      if(deduction<=0) return [];

      const baseDate=historical?.paymentDate || r.disbursement_date || start;
      const payrollDate=String(baseDate||'')<start ? start : (String(baseDate||'')>end ? end : baseDate);

      return [{
        ...r,
        original_status:r.status,
        original_current_outstanding:outstanding,
        original_disbursement_date:r.disbursement_date,
        payroll_deduction_source:historical?.amount>0?'PAYROLL_PAYMENT_HISTORY':'CURRENT_OUTSTANDING',
        payroll_payment_amount:historical?.amount||0,
        // Payroll core memang memproses hanya status AKTIF + current_outstanding > 0.
        // Normalisasi ini hanya view-model payroll; status database tetap tidak diubah.
        status:'AKTIF',
        current_outstanding:deduction,
        disbursement_date:payrollDate
      }];
    });
  };

  window.PayrollKasbonMonthlyBridge = {
    async getDue(employeeId,periodEnd){
      const {data,error}=await db.rpc('erp_kasbon_monthly_due',{
        p_employee_id:Number(employeeId),
        p_period_end:periodEnd||null
      });
      if(error) throw error;
      return Array.isArray(data)?data:[];
    },

    async postPaidPayroll(employeeId,payrollPeriod,paymentDate=null){
      const {data,error}=await db.rpc('erp_kasbon_post_monthly_payroll',{
        p_employee_id:Number(employeeId),
        p_payroll_period:payrollPeriod,
        p_payment_date:paymentDate||null
      });
      if(error) throw error;
      return Number(data||0);
    }
  };
})();
