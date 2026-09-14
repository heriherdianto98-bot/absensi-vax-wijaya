/* VAX ERP — Payroll Kasbon Monthly Bridge V5
   Bridge only. Keeps locked payroll formula/source ownership intact.
   BULANAN kasbon is deducted by Payroll; HARIAN is paid via SVP daily flow and must not be deducted here.

   Owner rule:
   - Kasbon BULANAN tetap tercatat sebagai potongan payroll pada periode terkait walau status sudah LUNAS.
   - Jika belum diposting payroll, sumber potongan = current_outstanding.
   - Jika sudah diposting payroll dan outstanding menjadi 0/LUNAS, sumber historis potongan = employee_cash_advance_payments source PAYROLL.
   - Fallback untuk data LUNAS langsung/manual tanpa history PAYROLL: gunakan approved_amount HANYA pada bulan pencairan,
     agar potongan tidak hilang dari payroll bulan terkait dan tidak terbawa berulang ke bulan berikutnya.
   - Begitu payroll periode berhasil dimuat, semua kasbon BULANAN outstanding yang jatuh pada / sebelum akhir periode
     direkonsiliasi GLOBAL berdasarkan employee_id (tidak tergantung cabang aktif/current master/floating).
   - Posting tetap melalui RPC canonical erp_kasbon_post_monthly_payroll, sehingga payment history, outstanding,
     status LUNAS, settled_at dan Arus Kas tetap ditangani backend canonical.
   - Tidak mengubah formula PayrollUnifiedEngine dan tidak menulis Arus Kas langsung.
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
      const approved=Math.max(0,Number(r.approved_amount||0));
      const status=String(r.status||'').toUpperCase();
      const disbursementDate=String(r.disbursement_date||'');
      const disbursedInPeriod=Boolean(disbursementDate && disbursementDate>=start && disbursementDate<=end);

      let deduction=0;
      let deductionSource=null;
      let baseDate=r.disbursement_date || start;

      if((historical?.amount||0)>0){
        deduction=Number(historical.amount||0);
        deductionSource='PAYROLL_PAYMENT_HISTORY';
        baseDate=historical.paymentDate || r.disbursement_date || start;
      }else if(outstanding>0){
        deduction=outstanding;
        deductionSource='CURRENT_OUTSTANDING';
      }else if(status==='LUNAS' && disbursedInPeriod && approved>0){
        deduction=approved;
        deductionSource='LUNAS_PERIOD_APPROVED_FALLBACK';
      }

      if(deduction<=0) return [];

      const payrollDate=String(baseDate||'')<start ? start : (String(baseDate||'')>end ? end : baseDate);

      return [{
        ...r,
        original_status:r.status,
        original_current_outstanding:outstanding,
        original_disbursement_date:r.disbursement_date,
        payroll_deduction_source:deductionSource,
        payroll_payment_amount:historical?.amount||0,
        // View-model payroll only. DB status remains canonical.
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
    },

    async getGlobalDueEmployees(periodEnd){
      let q=db
        .from('employee_cash_advances')
        .select('employee_id,disbursement_date,request_date,status,current_outstanding,payment_method')
        .eq('payment_method','BULANAN')
        .in('status',['DICAIRKAN','AKTIF'])
        .gt('current_outstanding',0);
      if(periodEnd) q=q.lte('disbursement_date',periodEnd);
      const {data,error}=await q;
      if(error) throw error;
      return [...new Set((Array.isArray(data)?data:[])
        .map(r=>Number(r.employee_id||0))
        .filter(id=>id>0))];
    },

    async settleGlobalPeriod(payrollPeriod,periodEnd){
      const employeeIds=await this.getGlobalDueEmployees(periodEnd||null);
      let totalPosted=0;
      const errors=[];
      for(const employeeId of employeeIds){
        try{
          totalPosted += await this.postPaidPayroll(employeeId,payrollPeriod,periodEnd||null);
        }catch(err){
          errors.push({employeeId,error:err});
          console.error('[PayrollKasbonMonthlyBridge] global auto-settle gagal',employeeId,err);
        }
      }
      return {employeeIds,totalPosted,errors};
    }
  };

  if(!PayrollUnifiedEngine.__kasbonAutoCloseGlobalV2){
    PayrollUnifiedEngine.__kasbonAutoCloseGlobalV2=true;
    const originalLoadPeriod=PayrollUnifiedEngine.loadPeriod.bind(PayrollUnifiedEngine);
    PayrollUnifiedEngine.loadPeriod=async function(opts={}){
      const result=await originalLoadPeriod(opts);
      const start=String(opts.start||'');
      const end=String(opts.end||'');
      if(!start || !end) return result;

      try{
        // GLOBAL: tidak memakai branchId / employeeId filter halaman.
        await window.PayrollKasbonMonthlyBridge.settleGlobalPeriod(start,end);
      }catch(err){
        console.error('[PayrollKasbonMonthlyBridge] global period settle gagal',err);
      }
      return result;
    };
  }
})();
