/* Task 2 additive read-only salary history. Never writes to Minutes, Payroll, Arus Kas, or locked modules. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const isOwner = () => !!(window.OwnerAuth?.ready && window.OwnerAuth?.profile?.aktif === true && window.OwnerAuth?.isOwnerRole?.(window.OwnerAuth?.profile?.role));
let active = null, sequence = 0;
function init(){
 const salary = $('mkwPanel')?.querySelector('.mkw-salary');
 if(!salary || $('mkwAutoSalary'))return;
 const section = document.createElement('section');section.id='mkwAutoSalary';
 section.style.cssText='margin:13px 0;padding:13px;border:1px solid #766032;border-radius:11px;background:#111820;color:#e6ebf1;line-height:1.6';
 section.innerHTML='<div style="font-size:12px;color:#d7b968">TOTAL GAJI TERCATAT (MANUAL + OTOMATIS)</div><strong id="mkwAutoTotal" style="display:block;font-size:23px;color:#f4d078">—</strong><p id="mkwAutoDetail" style="font-size:12px;margin:5px 0 0;color:#c6ced8" aria-live="polite">Buka detail karyawan untuk memuat.</p>';
 salary.insertBefore(section,salary.firstChild);
 document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('#mkBody [data-mki-profile]');if(!trigger||!isOwner())return;
  const id=Number(trigger.dataset.mkiProfile);if(!Number.isSafeInteger(id)||id<=0)return;
  setTimeout(()=>{if($('mkiOverlay')?.classList.contains('is-open'))refresh(id);},150);
 },true);
 $('mkwSalarySave')?.addEventListener('click',()=>{if(active)setTimeout(()=>refresh(active),750);});
 document.querySelectorAll('#mkiOverlay [data-mki-close]').forEach(el=>el.addEventListener('click',()=>{active=null;sequence++;}));
}
async function pageShares(id,cutoff,end){
 const rows=[];
 for(let offset=0;offset<20000;offset+=500){
  const {data,error}=await db.from('provider_sales_daily_source').select('id,activity_date,provider_share,employee_id,mapping_status')
   .eq('employee_id',id).eq('mapping_status','MATCHED').gt('activity_date',cutoff).lte('activity_date',end)
   .order('activity_date',{ascending:true}).order('id',{ascending:true}).range(offset,offset+499);
  if(error)throw error;
  rows.push(...(data||[]));if((data||[]).length<500)return rows;
 }
 throw Error('Batas baca 20.000 baris tercapai; total tidak ditampilkan.');
}
async function refresh(id){
 if(!isOwner())return;
 active=id;const token=++sequence;
 const total=$('mkwAutoTotal'), detail=$('mkwAutoDetail');if(!total||!detail)return;
 total.textContent='Memuat…';detail.textContent='Membaca riwayat manual dan sumber gaji per karyawan.';
 try{
  const [emp,manual]=await Promise.all([
   db.from('karyawan').select('id,jabatan,nama_karyawan').eq('id',id).maybeSingle(),
   db.from('karyawan_riwayat_gaji_manual').select('total_gaji,periode_sampai').eq('karyawan_id',id).maybeSingle()
  ]);
  if(emp.error)throw emp.error;if(manual.error)throw manual.error;if(!emp.data)throw Error('Karyawan tidak ditemukan.');
  if(active!==id||token!==sequence)return;
  const capster=String(emp.data.jabatan||'').trim().toLowerCase()==='capster';
  const baseline=manual.data||null;
  const amount=baseline?Number(baseline.total_gaji):0;
  if(baseline&&(!Number.isSafeInteger(amount)||amount<0||!/^\d{4}-\d{2}-\d{2}$/.test(baseline.periode_sampai||'')||baseline.periode_sampai>today()))throw Error('Data historis manual belum valid.');
  if(!capster){total.textContent=baseline?money(amount):'Belum tersedia';detail.textContent='Gaji historis manual saja. Gaji kasir/bulanan belum dapat ditambahkan otomatis: transaksi pembayaran Arus Kas belum mengidentifikasi penerima dengan ID karyawan. Nominal slip Payroll tidak dianggap bukti bayar.';return;}
  const cutoff=baseline?.periode_sampai||'0001-01-01';
  const shares=await pageShares(id,cutoff,today());
  if(active!==id||token!==sequence)return;
  let sum=0;for(const row of shares){const n=Number(row.provider_share);if(!Number.isSafeInteger(n)||n<0)throw Error('Ada nominal share Minutes tidak valid; total tidak ditampilkan.');sum+=n;if(!Number.isSafeInteger(sum))throw Error('Akumulasi di luar rentang aman.');}
  const combined=amount+sum;if(!Number.isSafeInteger(combined))throw Error('Total di luar rentang aman.');
  total.textContent=money(combined);
  detail.textContent=`Manual ${money(amount)}${baseline?' s.d. '+baseline.periode_sampai:' (belum diisi)'} + share capster Minutes ${money(sum)} (${shares.length} baris MATCHED${baseline?', setelah tanggal batas manual':''}). Berdasarkan ID karyawan; tidak menghitung data pending mapping. Share produk, bonus, denda, dan kasbon belum termasuk dalam akumulasi ini.`;
 }catch(err){if(active!==id||token!==sequence)return;console.error('Total gaji otomatis gagal dibaca',err?.code||err?.message);total.textContent='Belum dapat dihitung';detail.textContent='Pembacaan sumber gaji gagal atau data belum lengkap; nominal tidak ditebak.';}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();