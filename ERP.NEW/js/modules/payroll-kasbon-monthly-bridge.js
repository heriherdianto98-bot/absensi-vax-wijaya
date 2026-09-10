/* VAX ERP — Payroll Kasbon Monthly Bridge V1
   UI/engine bridge only. Keeps locked payroll formula/source ownership intact.
   BULANAN kasbon is deducted by Payroll; HARIAN is paid via SVP daily flow and must not be deducted here.
*/
(() => {
  if (typeof PayrollUnifiedEngine === 'undefined' || typeof db === 'undefined') return;

  PayrollUnifiedEngine.fetchKasbon = async function(start,end){
    const {data,error}=await db
      .from(this.TABLE_KASBON)
      .select("id,employee_id,branch_id,employee_name_snapshot,position_snapshot,request_date,approved_amount,disbursement_date,status,current_outstanding,total_paid,payment_method")
      .lte("disbursement_date",end)
      .in("status",["DICAIRKAN","AKTIF"])
      .gt("current_outstanding",0)
      .order("disbursement_date",{ascending:true});
    if(error) throw error;
    return (Array.isArray(data)?data:[])
      .filter(r=>String(r.payment_method||'BULANAN').toUpperCase()==='BULANAN')
      .map(r=>({
        ...r,
        original_disbursement_date:r.disbursement_date,
        disbursement_date:String(r.disbursement_date||'')<start?start:r.disbursement_date
      }));
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
