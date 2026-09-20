/* Additive owner-only manual attendance UI. Does not alter existing attendance/print engines. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Jakarta'});
  let allowed = false, busy = false, employees = [], branches = [];
  const css = `
    #vamOverlay[hidden]{display:none!important}#vamOverlay{position:fixed;inset:0;z-index:100000;background:#000b;display:grid;place-items:center;padding:15px;overflow:auto}
    #vamPanel{background:#181c22;color:#f3f4f6;border:1px solid #987525;border-radius:16px;width:min(660px,100%);max-height:92vh;overflow:auto;padding:24px;box-shadow:0 22px 80px #000b;font:inherit}
    #vamPanel h2{margin:0 0 6px;color:#e9c34c}#vamPanel p{color:#bfc5cc;margin:0 0 14px}#vamPanel label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:13px;color:#d9dde2}
    #vamPanel input,#vamPanel select,#vamPanel textarea{width:100%;box-sizing:border-box;background:#242a32;color:#fff;border:1px solid #525b69;border-radius:8px;padding:10px;font:inherit;color-scheme:dark}
    #vamPanel textarea{min-height:75px;resize:vertical}#vamFields{display:grid;grid-template-columns:1fr 1fr;gap:12px}#vamFields .wide{grid-column:1/-1}
    #vamPanel .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:17px}#vamPanel button{cursor:pointer;padding:10px 16px;border-radius:9px;border:1px solid #7a6629;background:#282b31;color:#fff;font-weight:700}
    #vamPanel #vamSave{background:#d9ad31;color:#161616}#vamPanel button:disabled{opacity:.5;cursor:not-allowed}#vamMessage{min-height:21px;color:#eebd67;margin-top:8px}
    #vamHistory{border-top:1px solid #4e4631;margin-top:14px;padding-top:10px;font-size:12px;color:#cbd0d9;max-height:125px;overflow:auto}
    @media(max-width:560px){#vamFields{grid-template-columns:1fr}#vamFields .wide{grid-column:auto}#vamPanel{padding:15px}}
  `;
  function ui() {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const overlay = document.createElement('div'); overlay.id = 'vamOverlay'; overlay.hidden = true;
    overlay.innerHTML = `<section id="vamPanel" role="dialog" aria-modal="true" aria-labelledby="vamTitle">
      <h2 id="vamTitle">Input / Edit Absensi Manual</h2><p>Khusus Owner. Setiap perubahan tersimpan dalam audit trail.</p>
      <form id="vamForm"><div id="vamFields">
        <label>Cabang<select id="vamCabang" required><option value="">Pilih cabang</option></select></label>
        <label>Karyawan<select id="vamKaryawan" required><option value="">Pilih karyawan</option></select></label>
        <label>Tanggal<input id="vamTanggal" type="date" required></label>
        <label>Status<select id="vamStatus"><option value="H">Hadir</option><option value="L">Libur</option><option value="I">Izin</option><option value="S">Sakit</option></select></label>
        <label class="vamTime">Jam masuk (WIB)<input id="vamMasuk" type="time" step="60"></label>
        <label class="vamTime">Jam pulang (WIB)<input id="vamPulang" type="time" step="60"></label>
        <label class="wide">Alasan koreksi (wajib)<textarea id="vamAlasan" maxlength="500" minlength="5" required placeholder="Jelaskan alasan input atau koreksi"></textarea></label>
      </div><div id="vamMessage" role="status"></div><div id="vamHistory"></div>
      <div class="actions"><button type="button" id="vamClose">Batal</button><button type="submit" id="vamSave">Simpan Absensi</button></div></form></section>`;
    document.body.appendChild(overlay);
    $('vamClose').addEventListener('click', close);
    overlay.addEventListener('click', e => {if(e.target === overlay)close();});
    document.addEventListener('keydown', e => {if(e.key === 'Escape' && !overlay.hidden)close();});
    $('vamCabang').addEventListener('change', () => {fillEmployees(); loadExisting();});
    $('vamKaryawan').addEventListener('change', loadExisting);
    $('vamTanggal').addEventListener('change', loadExisting);
    $('vamStatus').addEventListener('change', syncStatus);
    $('vamForm').addEventListener('submit', save);
  }
  function syncStatus(){
    const present = $('vamStatus').value === 'H';
    document.querySelectorAll('#vamPanel .vamTime').forEach(x => x.hidden = !present);
    $('vamMasuk').required = present;
    if(!present){$('vamMasuk').value='';$('vamPulang').value='';}
  }
  function fillEmployees(){
    const cabang = $('vamCabang').value;
    const current = $('vamKaryawan').value;
    $('vamKaryawan').replaceChildren(new Option('Pilih karyawan', ''));
    employees.filter(e => String(e.cabang_id) === cabang).forEach(e => $('vamKaryawan').add(new Option(e.nama_karyawan, e.id)));
    if([...$('vamKaryawan').options].some(o => o.value === current)) $('vamKaryawan').value = current;
  }
  function message(text, error=false){$('vamMessage').textContent = text; $('vamMessage').style.color = error ? '#ff8888' : '#e9c34c';}
  async function loadExisting(){
    const employee = $('vamKaryawan').value, date = $('vamTanggal').value;
    $('vamHistory').replaceChildren(); message('');
    if(!employee || !date)return;
    const result = await db.from('absensi').select('id,cabang_id,status_absensi,status,jam_masuk,jam_pulang,denda').eq('karyawan_id', employee).eq('tanggal',date).maybeSingle();
    if(result.error){message('Gagal membaca absensi: '+result.error.message,true);return;}
    if(result.data){
      const a=result.data;
      const status = String(a.status_absensi || '').trim().toUpperCase() || ({Hadir:'H',Terlambat:'H',LIBUR:'L',IZIN:'I',SAKIT:'S'}[a.status] || 'H');
      if(['H','L','I','S'].includes(status)) $('vamStatus').value=status;
      if(a.cabang_id && [...$('vamCabang').options].some(o=>o.value===String(a.cabang_id))) $('vamCabang').value=String(a.cabang_id);
      $('vamMasuk').value=String(a.jam_masuk||'').slice(0,5);
      $('vamPulang').value=String(a.jam_pulang||'').slice(0,5);
      message('Data ditemukan. Koreksi akan memperbarui record yang sama (ID '+a.id+').');
    }else{
      $('vamStatus').value='H';$('vamMasuk').value='';$('vamPulang').value='';message('Belum ada absensi. Data baru akan dibuat.');
    }
    syncStatus();
    const audit = await db.from('absensi_manual_audit').select('action,reason,created_at').eq('karyawan_id',employee).eq('tanggal',date).order('created_at',{ascending:false}).limit(10);
    if(!audit.error && audit.data?.length){
      const title=document.createElement('strong');title.textContent='Riwayat koreksi Owner';$('vamHistory').appendChild(title);
      audit.data.forEach(a=>{const p=document.createElement('p');p.textContent=`${new Date(a.created_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} · ${a.action} · ${a.reason}`;$('vamHistory').appendChild(p);});
    }
  }
  function close(){if(busy)return;$('vamOverlay').hidden=true;document.body.style.removeProperty('overflow');}
  async function open(){
    if(!allowed)return;
    $('vamOverlay').hidden=false;document.body.style.overflow='hidden';$('vamForm').reset();$('vamTanggal').max=today();
    $('vamTanggal').value=today();$('vamCabang').replaceChildren(new Option('Pilih cabang',''));
    branches.forEach(b=>$('vamCabang').add(new Option(b.nama_cabang,b.id)));
    const branch = String(document.getElementById('absensiFilterCabang')?.value||'');
    const selected = branches.find(b=>b.nama_cabang===branch);
    if(selected)$('vamCabang').value=String(selected.id);
    fillEmployees();
    const employee = document.getElementById('absensiFilterKaryawan')?.value || document.getElementById('ablFilterKaryawan')?.value;
    if(employee && [...$('vamKaryawan').options].some(o=>o.value===String(employee)))$('vamKaryawan').value=String(employee);
    const selectedDate=document.getElementById('absensiFilterTanggal')?.value;
    if(selectedDate && selectedDate<=today())$('vamTanggal').value=selectedDate;
    syncStatus();await loadExisting();$('vamCabang').focus();
  }
  async function save(e){
    e.preventDefault();if(busy||!allowed)return;
    const v={p_karyawan_id:Number($('vamKaryawan').value),p_cabang_id:Number($('vamCabang').value),p_tanggal:$('vamTanggal').value,p_status:$('vamStatus').value,
      p_jam_masuk:$('vamStatus').value==='H'?($('vamMasuk').value||null):null,
      p_jam_pulang:$('vamStatus').value==='H'?($('vamPulang').value||null):null,p_alasan:$('vamAlasan').value.trim()};
    if(!v.p_karyawan_id||!v.p_cabang_id||!v.p_tanggal||v.p_alasan.length<5){message('Lengkapi karyawan, cabang, tanggal dan alasan minimal 5 karakter.',true);return;}
    if(v.p_status==='H'&&!v.p_jam_masuk){message('Jam masuk wajib diisi.',true);return;}
    busy=true;$('vamSave').disabled=true;message('Menyimpan...');
    try{
      const {error}=await db.rpc('owner_save_absensi_manual',v);
      if(error)throw error;
      message('Absensi tersimpan. Memuat ulang laporan...');
      window.location.reload();
    }catch(err){message('Gagal menyimpan: '+(err.message||String(err)),true);}
    finally{busy=false;$('vamSave').disabled=false;}
  }
  async function boot(){
    if(typeof db==='undefined')return;
    const {data:{session},error}=await db.auth.getSession();
    if(error||!session)return;
    const profile=await db.from('profiles').select('role,aktif').eq('id',session.user.id).maybeSingle();
    allowed=profile.data?.aktif===true && String(profile.data.role||'').toLowerCase()==='owner';
    if(!allowed)return;
    const [k,c]=await Promise.all([
      db.from('karyawan').select('id,nama_karyawan,cabang_id,aktif').eq('aktif',true).order('nama_karyawan'),
      db.from('cabang').select('id,nama_cabang').order('nama_cabang')
    ]);
    if(k.error||c.error)return console.error('Absensi manual: gagal membaca master',k.error||c.error);
    employees=k.data||[];branches=(c.data||[]).filter(b=>!String(b.nama_cabang||'').toLowerCase().includes('floating'));
    ui();
    function insertButton(){
      const bar=document.querySelector('#absensiMonthlyHost .abl-toolbar-right') || document.querySelector('#absensiDailyView .toolbar-right');
      if(!bar || bar.querySelector('#vamOpen'))return;
      const btn=document.createElement('button');btn.id='vamOpen';btn.type='button';btn.className='absensi-btn-primary';btn.textContent='Input / Edit Manual';btn.addEventListener('click',open);
      const refresh=[...bar.querySelectorAll('button')].find(b=>/refresh/i.test(b.textContent));
      if(refresh)refresh.before(btn);else bar.appendChild(btn);
    }
    insertButton();
    let last=0;
    new MutationObserver(()=>{const now=Date.now();if(now-last<100)return;last=now;insertButton();}).observe($('absensiRoot')||document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
