(() => {
'use strict';
const TABLES=[
'profiles','cabang','karyawan','minutes_daily','setoran_3_harian','setoran_bulanan',
'cash_out','cash_in','arus_kas','qris','master_tagihan','tagihan','pengumuman',
'izin_libur','absensi','payroll','investor','sewa'
];
const $=id=>document.getElementById(id);
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
async function init(){
  const ok=await OwnerAuth.requireOwnerOnly();if(!ok)return;
  await Promise.all([loadComponent('sidebar','../components/sidebar.html'),loadComponent('header','../components/header.html')]).catch(()=>{});
  OwnerAuth.bindUi?.();OwnerAuth.syncHeader?.();OwnerAuth.applyAccessControl?.();initErpShellChrome?.();
  document.querySelectorAll('.sidebar .menu-item').forEach(el=>el.classList.remove('active'));
  document.querySelector('.sidebar [data-erp-nav="backup"]')?.classList.add('active');
  const hc=$('erpHeaderCabang');if(hc)hc.textContent='Backup Data ERP';
  const hp=$('erpHeaderPeriode');if(hp)hp.textContent='Owner Only';
  $('backupRun')?.addEventListener('click',runBackup);
}
async function runBackup(){
  const btn=$('backupRun'),status=$('backupStatus'),detail=$('backupDetail'),log=$('backupLog');
  btn.disabled=true;btn.textContent='Membuat backup…';status.textContent='Sedang membaca data';detail.textContent='Read-only melalui RLS Owner.';log.textContent='';
  const payload={meta:{app:'VAX ERP',created_at:new Date().toISOString(),mode:'owner-rls-read-only',format:1},tables:{},errors:{}};
  let success=0,totalRows=0;
  for(const table of TABLES){
    try{
      const {data,error}=await db.from(table).select('*');
      if(error)throw error;
      payload.tables[table]=Array.isArray(data)?data:[];
      success++;totalRows+=payload.tables[table].length;
      log.textContent += 'OK  '+table+' : '+payload.tables[table].length+' row\n';
    }catch(err){
      payload.errors[table]=String(err?.message||err);
      log.textContent += 'SKIP '+table+' : '+payload.errors[table]+'\n';
    }
  }
  try{
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='VAX-ERP-BACKUP-'+stamp()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    status.textContent='Backup selesai';detail.textContent=success+' tabel berhasil · '+totalRows+' total row · '+Object.keys(payload.errors).length+' tabel dilewati.';
  }catch(err){status.textContent='Backup gagal dibuat';detail.textContent=String(err?.message||err);}
  finally{btn.disabled=false;btn.textContent='Buat & Download Backup JSON';}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();