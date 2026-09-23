(() => {
'use strict';

const PAGE_SIZE=1000;
const TABLES=[
  'profiles','cabang','karyawan','absensi','pengaturan_absensi','jadwal_libur',
  'pengaturan','pengumuman','aktivitas','log_aktivitas',
  'minutes_daily','sync_status','daily_recap_source','daily_recap',
  'daily_recap_edit_log','daily_recap_final','target_bulanan',
  'qris_reconciliation','qris_reconciliation_status_history',
  'setoran_3_harian','setoran_3_harian_proofs','setoran_3_harian_receipts','setoran_3_harian_audit',
  'provider_sales_source','provider_sales_daily_source','product_sales_source','product_sales_daily_source',
  'kpi_ultimate_sales_source','kpi_ultimate_monthly_target','product_fund_ledger',
  'setoran_historical_backfill','qris_historical_backfill',
  'arus_kas_saldo_awal','arus_kas_utama','arus_kas_ledger',
  'arus_kas_owner_opening','arus_kas_owner_opening_history',
  'arus_kas_owner_safe_balance','arus_kas_owner_safe_balance_history',
  'arus_kas_v2_transactions','arus_kas_v2_audit',
  'employee_cash_advances','employee_cash_advance_history','employee_cash_advance_payments',
  'payroll_manual_adjustments','payroll_salary_master','payroll_historical_corrections',
  'payroll_historical_corrections_audit','payroll_pre_erp_manual_fines',
  'bri_merchant_daily','master_tagihan','svp_invoices','svp_invoice_items','svp_invoice_share_links',
  'master_biaya_sewa_tempat','master_investor','provider_master_identity_map',
  'laporan_bulanan_provider_mapping','erp_period_snapshots','erp_period_snapshot_rows',
  'erp_period_snapshot_schemas','investor_revised_snapshots',
  'pengajuan_izin','pengajuan_izin_audit',
  'jadwal_tutup_operasional','jadwal_tutup_operasional_cabang','jadwal_tutup_operasional_audit',
  'erp_pengumuman','erp_pengumuman_foto','erp_pengumuman_baca','erp_pengumuman_pesan',
  'karyawan_riwayat_gaji_manual','karyawan_riwayat_manual_baseline','karyawan_riwayat_manual_audit',
  'absensi_manual_audit','absensi_denda_review_v1','absensi_denda_pembayaran_v1',
  'absensi_izin_telat_v1','karyawan_dashboard_notifikasi_baca_v1',
  'vax_inbox_threads','vax_inbox_messages','vax_inbox_reads','vax_surat_peringatan_v1'
];

const EXCLUDED_SECURITY_TABLES=[
  'erp_internal_job_secrets',
  'karyawan_web_session',
  'karyawan_credential_v1',
  'karyawan_credential_reset_audit_v1',
  'karyawan_email_action_v1',
  'karyawan_identitas_private',
  'karyawan_identitas'
];

const $=id=>document.getElementById(id);
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');

async function readAllRows(table,onProgress){
  const rows=[];
  for(let from=0;;from+=PAGE_SIZE){
    const to=from+PAGE_SIZE-1;
    const {data,error}=await db.from(table).select('*').range(from,to);
    if(error)throw error;
    const batch=Array.isArray(data)?data:[];
    rows.push(...batch);
    onProgress?.(rows.length);
    if(batch.length<PAGE_SIZE)break;
  }
  return rows;
}

async function init(){
  const ok=await OwnerAuth.requireOwnerOnly();if(!ok)return;
  await Promise.all([
    loadComponent('sidebar','../components/sidebar.html'),
    loadComponent('header','../components/header.html')
  ]).catch(()=>{});
  OwnerAuth.bindUi?.();OwnerAuth.syncHeader?.();OwnerAuth.applyAccessControl?.();initErpShellChrome?.();
  document.querySelectorAll('.sidebar .menu-item').forEach(el=>el.classList.remove('active'));
  document.querySelector('.sidebar [data-erp-nav="backup"]')?.classList.add('active');
  const hc=$('erpHeaderCabang');if(hc)hc.textContent='Backup Data ERP';
  const hp=$('erpHeaderPeriode');if(hp)hp.textContent='Owner Only';
  $('backupRun')?.addEventListener('click',runBackup);
}

async function runBackup(){
  const btn=$('backupRun'),status=$('backupStatus'),detail=$('backupDetail'),log=$('backupLog');
  btn.disabled=true;
  btn.textContent='Membuat backup…';
  status.textContent='Sedang membaca data';
  detail.textContent='Read-only melalui RLS Owner. Data dibaca bertahap sampai selesai.';
  log.textContent='';

  const payload={
    meta:{
      app:'VAX ERP',
      created_at:new Date().toISOString(),
      mode:'owner-rls-read-only',
      format:2,
      page_size:PAGE_SIZE,
      excluded_security_tables:EXCLUDED_SECURITY_TABLES
    },
    tables:{},
    errors:{}
  };

  let success=0,totalRows=0;
  for(const table of TABLES){
    try{
      log.textContent+='READ '+table+'…\n';
      const rows=await readAllRows(table,count=>{
        status.textContent='Membaca '+table;
        detail.textContent=count.toLocaleString('id-ID')+' row terbaca…';
      });
      payload.tables[table]=rows;
      success++;
      totalRows+=rows.length;
      log.textContent+='OK   '+table+' : '+rows.length+' row\n';
    }catch(err){
      payload.errors[table]=String(err?.message||err);
      log.textContent+='SKIP '+table+' : '+payload.errors[table]+'\n';
    }
  }

  try{
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;
    a.download='VAX-ERP-BACKUP-'+stamp()+'.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    status.textContent='Backup selesai';
    detail.textContent=success+' tabel berhasil · '+totalRows.toLocaleString('id-ID')+' total row · '+Object.keys(payload.errors).length+' tabel dilewati.';
    log.textContent+='\nSECURITY: '+EXCLUDED_SECURITY_TABLES.length+' tabel credential/secret sengaja tidak diekspor.\n';
  }catch(err){
    status.textContent='Backup gagal dibuat';
    detail.textContent=String(err?.message||err);
  }finally{
    btn.disabled=false;
    btn.textContent='Buat & Download Backup JSON';
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();