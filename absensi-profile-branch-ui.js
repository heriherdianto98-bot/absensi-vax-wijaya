(() => {
  'use strict';

  async function loadAbsensiProfileBranch(){
    const nameEl=document.getElementById('absensiProfileBranchName');
    const addressEl=document.getElementById('absensiProfileBranchAddress');
    if(!nameEl || !addressEl) return;

    try{
      if(typeof KaryawanSession==='undefined' || typeof db==='undefined'){
        nameEl.textContent='Cabang belum tersedia';
        addressEl.textContent='Alamat belum dapat dimuat';
        return;
      }

      const employee=await KaryawanSession.requirePage();
      if(!employee?.cabang_id){
        nameEl.textContent='Cabang belum tersedia';
        addressEl.textContent='Alamat cabang belum tersedia';
        return;
      }

      const {data,error}=await db
        .from('cabang')
        .select('nama_cabang,alamat')
        .eq('id',employee.cabang_id)
        .maybeSingle();

      if(error || !data){
        nameEl.textContent='Cabang belum tersedia';
        addressEl.textContent='Alamat belum dapat dimuat dari Master Cabang';
        return;
      }

      nameEl.textContent=String(data.nama_cabang||'').trim() || 'Cabang belum tersedia';
      addressEl.textContent=String(data.alamat||'').trim() || 'Alamat belum diisi di Master Cabang';
    }catch(_error){
      nameEl.textContent='Cabang belum tersedia';
      addressEl.textContent='Alamat belum dapat dimuat dari Master Cabang';
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',loadAbsensiProfileBranch,{once:true});
  }else{
    void loadAbsensiProfileBranch();
  }
})();