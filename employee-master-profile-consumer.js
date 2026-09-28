/* Employee Profile — READ ONLY Master Karyawan consumer.
   Source of truth stays in Master Karyawan. No employee master data can be edited here. */
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? '').trim();
  const escText = (id,value,fallback='Belum lengkap') => { const el=$(id); if(el) el.textContent=text(value)||fallback; };
  const fmtDate = value => {
    if(!value) return 'Belum lengkap';
    try { return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')); }
    catch(_) { return value; }
  };
  const rupiah = value => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value)||0);
  const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

  function tenure(join){
    if(!join) return 'Belum lengkap';
    const current=today();
    if(join>current) return 'Tanggal belum valid';
    const a=join.split('-').map(Number),b=current.split('-').map(Number);
    let y=b[0]-a[0],m=b[1]-a[1],d=b[2]-a[2];
    if(d<0){m--;d+=new Date(Date.UTC(b[0],b[1]-1,0)).getUTCDate();}
    if(m<0){y--;m+=12;}
    return `${y} th ${m} bln ${d} hr`;
  }

  function status(row,schedule){
    let code=String((schedule?row.status_canonical:row.status_absensi)||'').trim().toUpperCase();
    if('HLISOA'.includes(code)&&code.length===1) return code;
    const legacy=String(row.status||'').trim().toUpperCase();
    return {HADIR:'H',TERLAMBAT:'H',LIBUR:'L',IZIN:'I',SAKIT:'S',OFF:'O',ALFA:'A'}[legacy]||null;
  }

  function renderHistory(identity,history){
    const join=text(identity?.tanggal_bergabung);
    const days=new Map(),late=new Set();
    for(const row of (history?.jadwal_libur||[])){
      const code=status(row,true);
      if(row.tanggal&&code&&code!=='H') days.set(row.tanggal,code);
    }
    for(const row of (history?.absensi||[])){
      const code=status(row,false);
      if(row.tanggal&&code) days.set(row.tanggal,code);
      if(row.tanggal&&code==='H'&&Number(row.terlambat_menit)>0) late.add(row.tanggal);
    }
    const eligible=[...days.entries()].filter(([date])=>!join||date>=join);
    const count=code=>eligible.filter(([,v])=>v===code).length;
    escText('profileTenure',tenure(join),'Belum lengkap');
    escText('profileHadir',count('H'), '0');
    escText('profileLate',[...late].filter(date=>!join||date>=join).length,'0');
    escText('profileLibur',count('L'),'0');
    escText('profileSakit',count('S'),'0');
    escText('profileIzin',count('I'),'0');
    const dates=eligible.map(([d])=>d).sort();
    const note=$('profileHistoryNote');
    if(note){
      note.textContent=dates.length
        ? `Catatan ERP ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length-1])}. Hari tanpa catatan tidak dianggap hadir/alfa.`
        : 'Belum ada catatan Absensi/Jadwal yang tersedia pada ERP.';
    }
  }

  try{
    if(typeof KaryawanSession==='undefined'||typeof db==='undefined') throw new Error('Layanan sesi tidak tersedia.');
    const employee=await KaryawanSession.requirePage();
    if(!employee) return;
    const token=KaryawanSession.getToken();
    const {data,error}=await db.rpc('karyawan_master_profile_self',{p_token:token});
    if(error||data?.ok!==true) throw new Error(data?.reason||error?.message||'Profil Master tidak dapat dimuat.');

    const emp=data.employee||{}, identity=data.identity||{}, salary=data.salary||{};
    escText('profileMasterName',emp.nama_karyawan);
    escText('profileEmployeeId',emp.id);
    escText('profileBranch',emp.nama_cabang);
    escText('profileRole',emp.jabatan);
    escText('profileStatus',emp.aktif===true?'Aktif':'Nonaktif');
    escText('profilePhone',emp.no_hp_wa);
    escText('profileAddress',emp.alamat_ktp);

    escText('profileKtpName',identity.nama_lengkap_ktp);
    escText('profileNik',identity.nik);
    escText('profileBirthPlace',identity.tempat_lahir);
    escText('profileBirthDate',fmtDate(identity.tanggal_lahir));
    escText('profileJoinDate',fmtDate(identity.tanggal_bergabung));
    escText('profileIdentityStatus',identity.status_verifikasi);

    renderHistory(identity,data.history||{});

    escText('profileSalaryTotal',rupiah(salary.total_recorded||0));
    const salaryNote=$('profileSalaryNote');
    if(salaryNote){
      const manual=Number(salary.manual_total)||0;
      const auto=Number(salary.matched_capster_share_after_manual)||0;
      salaryNote.textContent = manual>0 || auto>0
        ? `Sumber Master: historis terverifikasi ${rupiah(manual)} + share Capster MATCHED setelah batas historis ${rupiah(auto)}. Data ini bersifat catatan masa kerja dan dapat belum mencakup seluruh komponen Payroll.`
        : 'Belum ada total gaji historis yang lengkap/terverifikasi di Master Karyawan.';
    }
  }catch(err){
    console.error('Master profile consumer gagal',err?.code||err?.message);
    const box=$('profileMasterError');
    if(box){ box.hidden=false; box.textContent='Data Master Karyawan belum dapat dimuat. Silakan coba lagi setelah koneksi stabil.'; }
  }
})();