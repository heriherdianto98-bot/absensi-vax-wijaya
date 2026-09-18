/* ERP VAX — Master Karyawan Task 2. Additive Owner-only profile UI.
 * Read attendance canonical sources; do not write to locked absensi/payroll engines.
 * Historical salary input is explicitly MANUAL, not a payroll payout calculation.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const isOwner = () => !!(window.OwnerAuth?.ready && window.OwnerAuth?.profile?.aktif === true && window.OwnerAuth?.isOwnerRole?.(window.OwnerAuth?.profile?.role));
  const fmtDate = iso => iso ? new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',day:'2-digit',month:'long',year:'numeric'}).format(new Date(`${iso}T12:00:00Z`)) : 'Belum lengkap';
  const fmtRp = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
  const todayWib = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let employeeId = null, requestId = 0, loading = false, savedSalary = null;
  const styles = `
    .mkw-section{margin-top:22px;padding:18px;border:1px solid #665027;border-radius:14px;background:linear-gradient(150deg,#1c2128,#11171d);color:#f4f1e9}
    .mkw-section h4{color:#f5d47a;font-size:18px;margin:0 0 5px}.mkw-desc{font-size:12px;color:#aeb8c4;margin:0 0 14px;line-height:1.5}
    .mkw-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.mkw-card{border:1px solid #3b414b;border-radius:10px;padding:12px;background:#141b23;min-width:0}
    .mkw-card span{display:block;font-size:12px;color:#b5c0cc}.mkw-card strong{display:block;font-size:20px;color:#f6d16c;line-height:1.45;overflow-wrap:anywhere}
    .mkw-meta{color:#bbc5d0;font-size:12px;line-height:1.55;margin:13px 0 0}.mkw-warning{color:#f2d18d}
    .mkw-salary{margin-top:16px;padding-top:15px;border-top:1px solid #50432b}.mkw-salary strong{font-size:18px;color:#f4d078}
    .mkw-salary label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#c8d0dc;font-weight:700;margin-top:10px}
    .mkw-salary input,.mkw-salary textarea{box-sizing:border-box;width:100%;background:#111820;border:1px solid #424954;border-radius:9px;color:#fff;padding:10px 12px;font:600 14px 'Source Sans 3',sans-serif;min-height:42px}
    .mkw-salary textarea{resize:vertical;min-height:58px}.mkw-salary button{margin-top:12px;background:#cfa638;border:1px solid #e7c662;border-radius:9px;padding:9px 14px;color:#201800;font-weight:800;cursor:pointer}
    .mkw-salary button:disabled{opacity:.5;cursor:wait}.mkw-info{font-size:12px;line-height:1.5;color:#c9d3de;margin:10px 0 0}
    @media(max-width:620px){.mkw-section{padding:13px}.mkw-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  function init(){
    const form = $('mkiForm');if(!form || $('mkwPanel'))return;
    const style = document.createElement('style');style.textContent=styles;document.head.appendChild(style);
    const panel = document.createElement('section');panel.id='mkwPanel';panel.className='mkw-section';panel.hidden=true;
    panel.innerHTML = `
      <h4>Riwayat masa kerja</h4>
      <p class="mkw-desc">Ringkasan berdasarkan ID karyawan yang sama meskipun pindah cabang. Hanya catatan yang tersedia di ERP; bukan rekonstruksi seluruh riwayat sejak pertama bekerja.</p>
      <div class="mkw-cards">
        <div class="mkw-card"><span>Lama kerja</span><strong id="mkwTenure">—</strong></div>
        <div class="mkw-card"><span>Hadir tercatat</span><strong id="mkwHadir">—</strong></div>
        <div class="mkw-card"><span>Terlambat tercatat</span><strong id="mkwLate">—</strong></div>
        <div class="mkw-card"><span>Libur tercatat</span><strong id="mkwLibur">—</strong></div>
        <div class="mkw-card"><span>Sakit tercatat</span><strong id="mkwSakit">—</strong></div>
        <div class="mkw-card"><span>Izin tercatat</span><strong id="mkwIzin">—</strong></div>
      </div>
      <p id="mkwCoverage" class="mkw-meta" aria-live="polite">Memuat riwayat…</p>
      <div class="mkw-salary">
        <h4>Total gaji selama masa kerja</h4>
        <p class="mkw-desc">Belum ada ledger pembayaran payroll lengkap yang dapat dijumlahkan secara aman. Nominal manual di bawah adalah data historis terpisah, <b>bukan</b> hasil perhitungan Payroll atau bukti gaji sudah dibayar.</p>
        <strong id="mkwSalaryDisplay">Belum tersedia</strong>
        <p id="mkwSalarySource" class="mkw-info">Menunggu data historis.</p>
        <form id="mkwSalaryForm" autocomplete="off">
          <label>Total gaji historis manual (Rp)<input id="mkwSalaryAmount" type="number" min="0" step="1" inputmode="numeric" placeholder="Isi hanya jika total telah diverifikasi"></label>
          <label>Perhitungan sampai tanggal<input id="mkwSalaryUntil" type="date"></label>
          <label>Catatan / sumber verifikasi<textarea id="mkwSalaryNote" maxlength="1000" placeholder="Contoh: rekap pembayaran manual sampai Agustus 2026"></textarea></label>
          <button type="submit" id="mkwSalarySave">Simpan data historis</button>
          <p id="mkwSalaryMessage" class="mkw-info" aria-live="polite"></p>
        </form>
      </div>`;
    const status=$('mkiStatus');form.insertBefore(panel,status);
    document.addEventListener('click', e => {
      const trigger=e.target.closest?.('#mkBody [data-mki-profile]');if(!trigger || !isOwner())return;
      const id=Number(trigger.dataset.mkiProfile);if(!id)return;
      queueMicrotask(()=>{if($('mkiOverlay')?.classList.contains('is-open'))open(id);});
    },true);
    document.querySelectorAll('#mkiOverlay [data-mki-close]').forEach(el=>el.addEventListener('click',()=>{employeeId=null;++requestId;panel.hidden=true;}));
    $('mkiJoin')?.addEventListener('change',()=>{if(employeeId)showTenure($('mkiJoin').value);});
    $('mkwSalaryForm').addEventListener('submit',saveSalary);
  }
  function showTenure(join){
    if(!join){$('mkwTenure').textContent='Belum lengkap';return;}
    const now=todayWib();if(join>now){$('mkwTenure').textContent='Tanggal belum valid';return;}
    const a=join.split('-').map(Number),b=now.split('-').map(Number);
    let years=b[0]-a[0],months=b[1]-a[1],days=b[2]-a[2];
    if(days<0){months--;days+=new Date(Date.UTC(b[0],b[1]-1,0)).getUTCDate();}
    if(months<0){years--;months+=12;}
    $('mkwTenure').textContent=`${years} th ${months} bln ${days} hr`;
  }
  async function readAll(table,select,id){
    const output=[];for(let start=0;start<10000;start+=1000){
      const {data,error}=await db.from(table).select(select).eq('karyawan_id',id).order('tanggal',{ascending:true}).range(start,start+999);
      if(error)throw error;output.push(...(data||[]));if((data||[]).length<1000)return {rows:output,truncated:false};
    }
    return {rows:output,truncated:true};
  }
  function canonical(row,fromSchedule=false){
    const code=String(fromSchedule?row.status_canonical:row.status_absensi||'').trim().toUpperCase();
    if(['H','L','I','S','O','A'].includes(code))return code;
    const legacy=String(row.status||'').trim().toUpperCase();
    return ({HADIR:'H',TERLAMBAT:'H',LIBUR:'L',IZIN:'I',SAKIT:'S',OFF:'O',ALFA:'A'})[legacy]||null;
  }
  async function open(id){
    employeeId=id;const token=++requestId;savedSalary=null;loading=true;
    $('mkwPanel').hidden=false;
    ['mkwTenure','mkwHadir','mkwLate','mkwLibur','mkwSakit','mkwIzin'].forEach(x=>$(x).textContent='—');
    $('mkwCoverage').textContent='Memuat data Absensi dan Jadwal…';
    $('mkwSalaryDisplay').textContent='Memuat…';$('mkwSalarySource').textContent='';$('mkwSalaryAmount').value='';$('mkwSalaryUntil').value='';$('mkwSalaryNote').value='';$('mkwSalaryMessage').textContent='';
    try{
      const [ident,ab,jad,salary] = await Promise.all([
        db.from('karyawan_identitas').select('tanggal_bergabung').eq('karyawan_id',id).maybeSingle(),
        readAll('absensi','tanggal,status_absensi,status,terlambat_menit',id),
        readAll('jadwal_libur','tanggal,status_canonical,status',id),
        db.from('karyawan_riwayat_gaji_manual').select('total_gaji,periode_sampai,catatan').eq('karyawan_id',id).maybeSingle()
      ]);
      if(employeeId!==id||token!==requestId)return;
      if(ident.error)throw ident.error;if(salary.error)throw salary.error;
      const join=ident.data?.tanggal_bergabung||'';showTenure(join);
      const days=new Map();for(const j of jad.rows){const code=canonical(j,true);if(j.tanggal&&code&&code!=='H')days.set(j.tanggal,code);}
      const late=new Set();for(const a of ab.rows){const code=canonical(a);if(a.tanggal&&code)days.set(a.tanggal,code);if(a.tanggal&&code==='H'&&Number(a.terlambat_menit)>0)late.add(a.tanggal);}
      const eligible=[...days.entries()].filter(([day])=>!join||day>=join);
      const count=code=>eligible.filter(([,c])=>c===code).length;
      $('mkwHadir').textContent=String(count('H'));$('mkwLate').textContent=String([...late].filter(d=>!join||d>=join).length);
      $('mkwLibur').textContent=String(count('L'));$('mkwSakit').textContent=String(count('S'));$('mkwIzin').textContent=String(count('I'));
      const dates=eligible.map(([day])=>day).sort();
      $('mkwCoverage').textContent=dates.length
        ? `Data ERP tercatat ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length-1])}. ${eligible.length} tanggal unik; hadir dari absensi, libur/izin/sakit dari absensi dan jadwal (tanpa hitung ganda). ${join?'Dibatasi sejak tanggal bergabung.':'Tanggal bergabung belum diisi.'} ${ab.truncated||jad.truncated?'Riwayat melebihi batas baca; angka belum lengkap.':''} Hari tanpa catatan tidak dianggap hadir, izin, atau alfa.`
        : 'Belum ada catatan Absensi/Jadwal untuk karyawan ini. Angka 0 hanya berarti tidak ada catatan ERP, bukan nol sepanjang masa kerja.';
      savedSalary=salary.data||null;
      if(savedSalary){
        $('mkwSalaryDisplay').textContent=fmtRp(Number(savedSalary.total_gaji));
        $('mkwSalarySource').textContent=`Sumber: input manual Owner sampai ${fmtDate(savedSalary.periode_sampai)}. Bukan angka otomatis Payroll. ${savedSalary.catatan||''}`;
        $('mkwSalaryAmount').value=String(savedSalary.total_gaji);$('mkwSalaryUntil').value=savedSalary.periode_sampai;$('mkwSalaryNote').value=savedSalary.catatan||'';
      }else{$('mkwSalaryDisplay').textContent='Belum tersedia';$('mkwSalarySource').textContent='Belum ada total gaji historis yang terverifikasi.';}
    }catch(err){
      if(employeeId!==id||token!==requestId)return;
      console.error('Riwayat karyawan gagal dibaca',err?.code||err?.message);
      $('mkwCoverage').textContent='Riwayat belum dapat dimuat; angka tidak ditampilkan agar tidak menyesatkan.';
      $('mkwSalaryDisplay').textContent='Belum dapat dimuat';$('mkwSalarySource').textContent='Periksa koneksi atau akses Owner.';
    }finally{if(token===requestId)loading=false;}
  }
  async function saveSalary(event){
    event.preventDefault();if(!employeeId||!isOwner()||loading)return;
    const raw=$('mkwSalaryAmount').value.trim(),until=$('mkwSalaryUntil').value,note=$('mkwSalaryNote').value.trim(),message=$('mkwSalaryMessage');
    if(raw===''||!Number.isSafeInteger(Number(raw))||Number(raw)<0||!until||until>todayWib()||note.length<3){message.textContent='Isi nominal bulat ≥ 0, tanggal sampai hari ini, dan catatan sumber minimal 3 karakter.';return;}
    if(savedSalary&&Number(savedSalary.total_gaji)===Number(raw)&&savedSalary.periode_sampai===until&&savedSalary.catatan===note){message.textContent='Tidak ada perubahan.';return;}
    const id=employeeId,token=requestId,btn=$('mkwSalarySave');btn.disabled=true;message.textContent='Menyimpan data historis manual…';
    try{
      const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user?.id)throw authError||new Error('Sesi Owner tidak valid');
      const {error}=await db.from('karyawan_riwayat_gaji_manual').upsert({karyawan_id:id,total_gaji:Number(raw),periode_sampai:until,catatan:note,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'karyawan_id'});
      if(error)throw error;
      if(employeeId!==id||token!==requestId)return;
      savedSalary={total_gaji:Number(raw),periode_sampai:until,catatan:note};
      $('mkwSalaryDisplay').textContent=fmtRp(Number(raw));$('mkwSalarySource').textContent=`Sumber: input manual Owner sampai ${fmtDate(until)}. Bukan angka otomatis Payroll. ${note}`;
      message.textContent='Data historis manual tersimpan. Payroll dan transaksi keuangan tidak diubah.';
    }catch(err){console.error('Simpan riwayat gaji gagal',err?.code||err?.message);if(employeeId===id&&token===requestId)message.textContent='Gagal menyimpan. Periksa sesi Owner dan koneksi.';}
    finally{btn.disabled=false;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();