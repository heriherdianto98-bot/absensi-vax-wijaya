/* VAX ERP — Payroll Finalisasi Kasbon UI V1
   Scope: tombol Owner untuk settlement Kasbon BULANAN saat payroll benar-benar difinalisasi.

   TIDAK MENYENTUH:
   - flow ACC/pencairan Kasbon -> Arus Kas
   - formula PayrollUnifiedEngine
   - Print / PDF Payroll

   Finalisasi ini hanya mem-posting outstanding Kasbon BULANAN melalui RPC canonical.
*/
(() => {
  if (typeof db === 'undefined') return;
  if (window.__payrollFinalizeKasbonUiV1) return;
  window.__payrollFinalizeKasbonUiV1 = true;

  const MONTHS = {Jan:1,Feb:2,Mar:3,Apr:4,Mei:5,Jun:6,Jul:7,Agu:8,Sep:9,Okt:10,Nov:11,Des:12};
  const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const pad = n => String(n).padStart(2,'0');

  function ownerActive(){
    try{
      const raw = (typeof OwnerAuth !== 'undefined' && OwnerAuth.profile?.role) || localStorage.getItem('role') || '';
      if(typeof OwnerAuth !== 'undefined' && typeof OwnerAuth.isOwnerRole === 'function') return OwnerAuth.isOwnerRole(raw);
      return String(raw).toLowerCase()==='owner';
    }catch(_){ return false; }
  }

  function selectedPeriod(){
    const label = String(document.getElementById('payrollPeriodLabel')?.textContent || '').trim();
    const m = label.match(/^(Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)\s+(\d{4})$/i);
    if(!m) return null;
    const key = Object.keys(MONTHS).find(k=>k.toLowerCase()===m[1].toLowerCase());
    const month = MONTHS[key];
    const year = Number(m[2]);
    if(!month || !year) return null;
    const last = new Date(Date.UTC(year,month,0)).getUTCDate();
    return {
      year,month,
      start:`${year}-${pad(month)}-01`,
      end:`${year}-${pad(month)}-${pad(last)}`,
      label:`${key} ${year}`
    };
  }

  async function fetchDue(period){
    const {data,error} = await db
      .from('employee_cash_advances')
      .select('id,employee_id,employee_name_snapshot,branch_name_snapshot,approved_amount,current_outstanding,payment_method,status,disbursement_date')
      .eq('payment_method','BULANAN')
      .in('status',['DICAIRKAN','AKTIF'])
      .gt('current_outstanding',0)
      .lte('disbursement_date',period.end)
      .order('disbursement_date',{ascending:true});
    if(error) throw error;
    return Array.isArray(data)?data:[];
  }

  async function finalize(){
    const btn = document.getElementById('payrollFinalizeKasbon');
    const msg = document.getElementById('payrollFinalizeKasbonMsg');
    if(!ownerActive()){
      alert('Finalisasi Payroll hanya boleh Owner.');
      return;
    }
    const period = selectedPeriod();
    if(!period){
      alert('Pilih periode Payroll dulu.');
      return;
    }

    try{
      if(btn) btn.disabled=true;
      if(msg){ msg.textContent='Memeriksa Kasbon BULANAN…'; msg.className='payroll-finalize-kasbon-msg'; }
      const due = await fetchDue(period);
      const total = due.reduce((s,r)=>s+Number(r.current_outstanding||0),0);
      if(!due.length){
        if(msg){ msg.textContent=`${period.label}: tidak ada Kasbon BULANAN outstanding.`; msg.className='payroll-finalize-kasbon-msg is-ok'; }
        return;
      }

      const employees = [...new Set(due.map(r=>Number(r.employee_id)).filter(n=>n>0))];
      const sample = due.slice(0,6).map(r=>`• ${r.employee_name_snapshot || '#'+r.employee_id} — ${money(r.current_outstanding)}`).join('\n');
      const more = due.length>6 ? `\n• +${due.length-6} kasbon lainnya` : '';
      const ok = confirm(
        `FINALISASI PAYROLL ${period.label.toUpperCase()}?\n\n`+
        `${due.length} Kasbon BULANAN akan dipotong dari payroll.\nTotal: ${money(total)}\n\n${sample}${more}\n\n`+
        `Setelah finalisasi: outstanding menjadi Rp0 dan status Kasbon menjadi LUNAS.\nLanjutkan?`
      );
      if(!ok) return;

      if(msg){ msg.textContent=`Memfinalisasi ${due.length} Kasbon…`; msg.className='payroll-finalize-kasbon-msg'; }
      let posted=0;
      for(const employeeId of employees){
        const {data,error} = await db.rpc('erp_kasbon_post_monthly_payroll',{
          p_employee_id:employeeId,
          p_payroll_period:period.start,
          p_payment_date:period.end
        });
        if(error) throw error;
        posted += Number(data||0);
      }

      if(msg){ msg.textContent=`FINAL ${period.label} · Kasbon diposting ${money(posted)} · status LUNAS otomatis.`; msg.className='payroll-finalize-kasbon-msg is-ok'; }
      document.getElementById('payrollRefresh')?.click();
    }catch(err){
      console.error('[PayrollFinalizeKasbonUI]',err);
      if(msg){ msg.textContent=err?.message || 'Finalisasi gagal.'; msg.className='payroll-finalize-kasbon-msg is-error'; }
      alert(err?.message || 'Finalisasi Payroll gagal.');
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  function mount(){
    const actions = document.querySelector('.payroll-toolbar-actions');
    if(!actions || document.getElementById('payrollFinalizeKasbon')) return;
    const btn = document.createElement('button');
    btn.id='payrollFinalizeKasbon';
    btn.type='button';
    btn.className='payroll-finalize-kasbon-btn';
    btn.textContent='Finalisasi Payroll';
    btn.hidden=!ownerActive();
    btn.addEventListener('click',finalize);
    actions.insertBefore(btn, document.getElementById('payrollPrint') || null);

    const status = document.getElementById('payrollStatus');
    if(status && !document.getElementById('payrollFinalizeKasbonMsg')){
      const msg = document.createElement('p');
      msg.id='payrollFinalizeKasbonMsg';
      msg.className='payroll-finalize-kasbon-msg';
      status.insertAdjacentElement('afterend',msg);
    }

    if(!document.getElementById('payrollFinalizeKasbonStyle')){
      const style=document.createElement('style');
      style.id='payrollFinalizeKasbonStyle';
      style.textContent=`
        .payroll-finalize-kasbon-btn{border:1px solid rgba(80,220,150,.5)!important;background:linear-gradient(180deg,rgba(31,128,85,.95),rgba(18,91,62,.95))!important;color:#fff!important;font-weight:900!important}
        .payroll-finalize-kasbon-btn:hover{filter:brightness(1.08)}
        .payroll-finalize-kasbon-btn:disabled{opacity:.55;cursor:wait}
        .payroll-finalize-kasbon-msg{min-height:18px;margin:6px 0 0;padding:0 2px;color:#9eabb8;font-size:12px;font-weight:700}
        .payroll-finalize-kasbon-msg.is-ok{color:#55d996}.payroll-finalize-kasbon-msg.is-error{color:#ff7b86}
      `;
      document.head.appendChild(style);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,0),{once:true});
  else setTimeout(mount,0);
})();
