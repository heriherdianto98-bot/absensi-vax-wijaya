/* Payroll presentation bridge only. Source: final Absensi fine decisions, never absensi.denda (cleared for capsters). No ledger/payroll writes. */
(() => {
  'use strict';
  if (window.__vaxPayrollFineHistoryBridge) return;
  window.__vaxPayrollFineHistoryBridge = true;
  const $ = id => document.getElementById(id);
  const rupiah = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
  const number = v => Number(String(v || '').replace(/[^\d-]/g, '')) || 0;
  const months = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',Mei:'05',Jun:'06',Jul:'07',Agu:'08',Sep:'09',Okt:'10',Nov:'11',Des:'12'};
  const dateKey = text => {const m=String(text).trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);return m && months[m[2]] ? `${m[3]}-${months[m[2]]}-${m[1].padStart(2,'0')}` : '';};
  const period = () => {const label=$('payrollPeriodLabel')?.textContent?.trim()||'';const m=label.match(/^(\w+)\s+(\d{4})$/);if(!m||!months[m[1]])return null;const start=`${m[2]}-${months[m[1]]}-01`;const end=`${m[2]}-${months[m[1]]}-${new Date(Number(m[2]),Number(months[m[1]]),0).getDate()}`;return {start,end};};
  const summaryValue=(card,label)=>{const x=[...card.querySelectorAll('.payroll-sum')].find(e=>e.querySelector('span')?.textContent?.trim().toLowerCase()===label.toLowerCase());return number(x?.querySelector('strong')?.textContent);};
  let queue=Promise.resolve(),lastError='',pending=0,ready=false;
  function addSum(card,label,value,kind){
    const host=card.querySelector('.payroll-summary');if(!host)return;
    let node=[...host.querySelectorAll('[data-vax-fine-summary]')].find(x=>x.dataset.vaxFineSummary===kind);
    if(!node){node=document.createElement('div');node.className='payroll-sum vax-fine-history-sum';node.dataset.vaxFineSummary=kind;node.innerHTML='<span></span><strong></strong>';host.appendChild(node);}
    node.querySelector('span').textContent=label;node.querySelector('strong').textContent=rupiah(value);
  }
  function ensureStyle(){if($('vaxPayrollFineHistoryCss'))return;const style=document.createElement('style');style.id='vaxPayrollFineHistoryCss';style.textContent='.vax-fine-history-sum{border-top:2px solid #b79349!important;background:#17212a!important}.vax-fine-history-sum span{color:#e7ca83!important}.vax-fine-history-detail{font-size:11px;display:block;white-space:normal;color:#dec48a;margin-top:2px}.vax-fine-history-state{font-size:12px;color:#d5bb83;padding:7px 10px;border:1px solid #594c34;border-radius:8px;margin:8px 0}';document.head.appendChild(style);}
  async function apply(){
    const host=$('payrollList'),cards=[...(host?.querySelectorAll('.payroll-employee-card')||[])],range=period();
    if(!cards.length||!range||typeof db==='undefined'){ready=false;return;}
    ready=false;lastError='';ensureStyle();
    try{
      const ids=[...new Set(cards.map(c=>Number(c.dataset.employeeId)).filter(Number.isSafeInteger))];
      if(!ids.length)return;
      const {data,error}=await db.from('absensi_denda_review_v1').select('absensi_id,karyawan_id,tanggal,nominal_awal,nominal_final,dibayar,status').in('karyawan_id',ids).gte('tanggal',range.start).lte('tanggal',range.end).order('tanggal',{ascending:true}).limit(2000);
      if(error)throw error;
      const byEmployee=new Map();
      for(const fine of data||[]){const id=Number(fine.karyawan_id);if(!byEmployee.has(id))byEmployee.set(id,[]);byEmployee.get(id).push(fine);}
      for(const card of cards){
        if(!card.isConnected)continue;
        const fines=byEmployee.get(Number(card.dataset.employeeId))||[];
        const finalized=fines.filter(f=>['DITETAPKAN','DIBEBASKAN'].includes(String(f.status||'')));
        const daily=new Map(finalized.map(f=>[String(f.tanggal),f]));
        const job=(card.querySelector('.payroll-person p')?.textContent||'').toLowerCase();
        const capster=job.includes('capster');
        const body=card.querySelector('.payroll-table tbody');if(!body)continue;
        for(const tr of body.querySelectorAll('tr')){
          const key=dateKey(tr.cells[0]?.textContent);const fine=daily.get(key);if(!fine||!tr.cells[4])continue;
          const cell=tr.cells[4];const value=Math.max(0,Number(fine.nominal_final)||0);const paid=Math.min(value,Math.max(0,Number(fine.dibayar)||0));
          cell.textContent=rupiah(value);
          cell.title=`Denda final SPV · awal ${rupiah(fine.nominal_awal)} · dibayar ${rupiah(paid)} · sisa ${rupiah(value-paid)}. ${capster?'Denda capster tidak dipotong ulang dari gaji.':'Potongan kasir tetap mengikuti payroll.'}`;
          const hint=document.createElement('small');hint.className='vax-fine-history-detail';hint.textContent=value===0?'Dibebaskan SPV':paid>=value?'Lunas · '+(capster?'dibayar harian':'terbayar'):`${rupiah(paid)} dibayar · sisa ${rupiah(value-paid)}`;cell.appendChild(hint);
        }
        const total=finalized.reduce((s,f)=>s+Math.max(0,Number(f.nominal_final)||0),0);
        const paid=finalized.reduce((s,f)=>s+Math.min(Math.max(0,Number(f.nominal_final)||0),Math.max(0,Number(f.dibayar)||0)),0);
        const deducted=summaryValue(card,'Denda');
        const kasbon=summaryValue(card,'Kasbon');
        const paidSalary=number(card.querySelector('.js-net-value')?.textContent);
        const gross=paidSalary+deducted+kasbon;
        addSum(card,'Gaji kotor (sebelum potongan)',gross,'gross');
        addSum(card,'Riwayat denda final',total,'total');
        addSum(card,capster?'Denda dibayar harian':'Denda sudah dilunasi',paid,'paid');
        addSum(card,'Denda dipotong dari gaji',deducted,'deducted');
        addSum(card,'Gaji setelah seluruh denda (informasi)',gross-total,'after');
        addSum(card,'Gaji dicairkan (tanpa potong ulang)',paidSalary,'cash');
        const note=card.querySelector('.vax-fine-history-state')||document.createElement('p');note.className='vax-fine-history-state';note.textContent=capster?'Denda capster tercatat sebagai riwayat harian. Yang telah dibayar tidak dipotong lagi dari payroll.':'Riwayat denda final terpisah dari nominal potongan payroll; tidak menambah potongan gaji.';
        if(!note.isConnected)card.querySelector('.payroll-summary')?.insertAdjacentElement('afterend',note);
      }
      ready=true;
    }catch(e){lastError=e?.message||String(e);console.error('Riwayat denda payroll tidak tersedia:',e);for(const card of cards){let msg=card.querySelector('.vax-fine-history-state');if(!msg){msg=document.createElement('p');msg.className='vax-fine-history-state';card.querySelector('.payroll-summary')?.insertAdjacentElement('afterend',msg);}if(msg)msg.textContent='Riwayat denda belum dapat dimuat: '+lastError;}}
  }
  function schedule(){pending++;queue=queue.catch(()=>{}).then(apply).finally(()=>{pending--;});return queue;}
  function boot(){const list=$('payrollList');if(!list)return;new MutationObserver(()=>{schedule();}).observe(list,{childList:true});
    const waitPrint=()=>{if(!window.PayrollCapsterPrint?.open)return false;const original=window.PayrollCapsterPrint.open.bind(window.PayrollCapsterPrint);window.PayrollCapsterPrint.open=mode=>{if(pending||!ready){alert('Mohon tunggu sampai riwayat denda selesai dimuat sebelum mencetak slip.');return;}if(lastError){alert('Riwayat denda belum termuat. Slip tidak dicetak agar rincian denda tidak keliru: '+lastError);return;}return original(mode);};return true;};
    if(!waitPrint()){const timer=setInterval(()=>{if(waitPrint())clearInterval(timer);},100);setTimeout(()=>clearInterval(timer),10000);}
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
