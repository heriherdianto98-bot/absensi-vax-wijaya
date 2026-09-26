/* ERP VAX — Employee Kasbon -> SVP notification bridge.
   READ ONLY: notification mirrors pending employee_cash_advance_requests.
*/
"use strict";
(function(){
  const install=()=>{
    const N=window.ERPGlobalNotifications;
    if(!N||N.__employeeKasbonSvpNotifV1)return false;
    N.__employeeKasbonSvpNotifV1=true;

    const loadEmployeeKasbonRequests=async(db)=>{
      if(N.role!=="svp")return;
      try{
        const {data,error}=await db.from("employee_cash_advance_requests")
          .select("id,employee_name_snapshot,branch_name_snapshot,requested_amount,reason,request_date,status,created_at")
          .eq("status","MENUNGGU_SVP")
          .order("created_at",{ascending:false})
          .limit(60);
        if(error)throw error;

        (data||[]).forEach(r=>{
          N.add({
            key:"kasbon-employee-svp:"+r.id,
            tone:"warning",
            icon:"⇧",
            module:"KASBON KARYAWAN",
            href:"./finance.html?menu=cash-in&focus=employee-kasbon&request="+encodeURIComponent(r.id),
            title:"Pengajuan Kasbon baru dari Karyawan",
            detail:(r.employee_name_snapshot||"Karyawan")+" • "+(r.branch_name_snapshot||"—")+" • "+N.money(r.requested_amount)+" • "+(r.reason||"Tanpa keterangan")
          });
        });
      }catch(e){
        console.warn("[Notif Kasbon Karyawan -> SVP]",e);
      }
    };

    const originalRefresh=N.refresh;
    N.refresh=async function(){
      await originalRefresh.call(this);
      if(this.role!=="svp")return;
      const db=await this.waitDb();
      if(!db)return;
      await loadEmployeeKasbonRequests(db);
      this.render();
    };

    setTimeout(()=>N.refresh(),300);
    return true;
  };

  if(!install()){
    let tries=0;
    const t=setInterval(()=>{if(install()||++tries>80)clearInterval(t)},100);
  }
})();