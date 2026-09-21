/* Absensi-only SPV fine decisions. Employee supplies the photo via Izin Telat Masuk; SPV supplies reason and amount only. */
(() => {
  'use strict';
  if(window.__vaxDendaCustomDecisionV3)return;
  window.__vaxDendaCustomDecisionV3=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;', '"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'Rp '+new Intl.NumberFormat('id-ID').format(Number(n)||0);
  const digits=v=>String(v||'').replace(/\D/g,'');
  const wibDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dayKey=(id,date)=>`${id}:${date}`;
  let busy=false,selected=null,late=new Map(),decision=new Map(),started=false,refreshing=false;
  async function identity(){
    const {data:{session},error}=await db.auth.getSession();if(error||!session)return null;
    const {data,error:e}=await db.from('profiles').select('role,aktif').eq('id',session.user.id).maybeSingle();
    return e||!data||data.aktif===false?null:{role:String(data.role||'').trim().toLowerCase()};
  }
  function mount(){
    if($('vaxDendaCustomModal'))return;
    const modal=document.createElement('div');modal.id='vaxDendaCustomModal';modal.hidden=true;
    modal.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="vaxFineCustomTitle"><h3 id="vaxFineCustomTitle">Putuskan nominal denda</h3><p id="vaxFineCustomPerson"></p><label for="vaxFineCustomAmount">Nominal final (Rp)</label><input id="vaxFineCustomAmount" type="text" inputmode="numeric" autocomplete="off" value="Rp 0" aria-label="Nominal denda dalam Rupiah"><p id="vaxFineCustomPreset"><button type="button" data-fine-fraction="1">Penuh</button> <button type="button" data-fine-fraction="0.5">Setengah</button> <button type="button" data-fine-fraction="0">Bebaskan</button></p><div id="vaxFineEmployeeEvidence" class="vax-fine-employee-evidence"></div><label for="vaxFineCustomReason">Catatan / alasan keputusan SPV (wajib)</label><textarea id="vaxFineCustomReason" maxlength="1000" rows="3" placeholder="Jelaskan dasar keputusan, minimal 5 karakter" required></textarea><p id="vaxFineCustomState" role="status"></p><div class="vax-fine-custom-actions"><button type="button" id="vaxFineCustomCancel">Batal</button><button type="button" id="vaxFineCustomSave">Simpan keputusan final</button></div></section>';
    document.body.appendChild(modal);
    $('vaxFineCustomCancel').addEventListener('click',()=>{if(!busy){modal.hidden=true;selected=null;}});
    modal.addEventListener('click',e=>{if(e.target===modal&&!busy){modal.hidden=true;selected=null;}});
    $('vaxFineCustomAmount').addEventListener('input',e=>{const raw=digits(e.target.value);e.target.value=raw?money(raw):'Rp 0';e.target.setSelectionRange(e.target.value.length,e.target.value.length);});
    $('vaxFineCustomAmount').addEventListener('focus',e=>e.target.select());
    $('vaxFineCustomPreset').addEventListener('click',e=>{const btn=e.target.closest('[data-fine-fraction]');if(btn&&selected)$('vaxFineCustomAmount').value=money(Math.round(selected.initial*Number(btn.dataset.fineFraction)));});
    $('vaxFineCustomSave').addEventListener('click',save);
  }
  function proofButton(path,title){return path?`<button type="button" data-vax-fine-proof="${esc(path)}">${title}</button>`:'<small>Foto belum tersedia.</small>';}
  async function loadLate(){
    const {data,error}=await db.from('absensi_izin_telat_v1').select('karyawan_id,tanggal,alasan,bukti_path,created_at').gte('tanggal',new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-31*86400000))).order('created_at',{ascending:false}).limit(500);
    if(error)throw error;
    late=new Map((data||[]).map(r=>[dayKey(r.karyawan_id,r.tanggal),r]));
  }
  async function loadDecisions(){
    const since=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-31*86400000));
    const {data,error}=await db.from('absensi_denda_review_v1').select('absensi_id,karyawan_id,tanggal,nominal_awal,nominal_final,status,dibayar,catatan,bukti_path,diputus_oleh,diputus_pada,karyawan:karyawan_id(nama_karyawan,jabatan)').gte('tanggal',since).neq('status','MENUNGGU_SPV').order('diputus_pada',{ascending:false}).limit(100);
    if(error)throw error;
    decision=new Map((data||[]).map(r=>[String(r.absensi_id),r]));
    const host=$('vaxFineDecisionHistoryList');if(!host)return;
    if(!(data||[]).length){host.innerHTML='<p>Belum ada keputusan denda final.</p>';return;}
    const actors=[...new Set((data||[]).map(r=>r.diputus_oleh).filter(Boolean))];
    let people=new Map();if(actors.length){const res=await db.from('profiles').select('id,nama').in('id',actors);if(!res.error)people=new Map((res.data||[]).map(r=>[r.id,r.nama]));}
    host.innerHTML=data.map(r=>{
      const evidence=late.get(dayKey(r.karyawan_id,r.tanggal));
      const path=evidence?.bukti_path||r.bukti_path;
      const when=r.diputus_pada?new Date(r.diputus_pada).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'—';
      return `<article class="vax-fine-history-row"><div><strong>${esc(r.karyawan?.nama_karyawan||'Karyawan')}</strong><small>${esc(r.tanggal)} · ${esc(r.karyawan?.jabatan||'')} · Awal ${money(r.nominal_awal)} → Final ${money(r.nominal_final)}</small><small>Diputus oleh ${esc(people.get(r.diputus_oleh)||'SPV')} · ${esc(when)} WIB</small>${evidence?`<p><b>Alasan karyawan:</b> ${esc(evidence.alasan)}</p>`:''}<p><b>Keputusan SPV:</b> ${esc(r.catatan||'—')}</p></div>${proofButton(path,'Lihat foto dari karyawan')}</article>`;
    }).join('');
  }
  async function enrichRows(){
    const host=$('vaxDendaRows');if(!host)return;
    const actor=await identity(),allow=['spv','svp'].includes(actor?.role);
    const {data,error}=await db.from('absensi').select('id,karyawan_id,tanggal').eq('tanggal',wibDay()).gt('terlambat_menit',0);
    if(error)return;
    const byId=new Map((data||[]).map(r=>[String(r.id),r]));
    for(const card of host.querySelectorAll('.vax-denda-row')){
      const original=card.querySelector('button[data-fine-id]');const id=original?.dataset.fineId;
      if(!id||!byId.has(id))continue;
      const row=byId.get(id),evidence=late.get(dayKey(row.karyawan_id,row.tanggal));
      if(evidence&&!card.querySelector('.vax-fine-izin-context')){
        const box=document.createElement('div');box.className='vax-fine-izin-context';
        box.innerHTML=`<strong>Izin Telat Masuk · Bukti dari akun karyawan</strong><p>${esc(evidence.alasan)}</p>${proofButton(evidence.bukti_path,'Lihat foto bukti karyawan')}`;
        card.appendChild(box);
      }
      if(allow&&card.querySelector('[data-fine-action="final"]')&&!card.querySelector('[data-fine-action="custom"]')){
        const btn=document.createElement('button');btn.type='button';btn.dataset.fineId=id;btn.dataset.fineAction='custom';btn.textContent='Edit nominal denda';card.querySelector('.vax-denda-row-actions')?.appendChild(btn);
      }
      const previous=decision.get(id);
      if(previous&&!card.querySelector('.vax-fine-previous-decision')){
        const box=document.createElement('div');box.className='vax-fine-previous-decision';box.innerHTML=`<strong>Catatan keputusan SPV</strong><p>${esc(previous.catatan||'—')}</p>${proofButton(previous.bukti_path,'Lihat foto dari karyawan')}`;card.appendChild(box);
      }
    }
  }
  async function refresh(){
    if(refreshing||typeof db==='undefined'||!$('vaxDendaReview'))return;
    refreshing=true;
    try{await loadLate();await loadDecisions();await enrichRows();}catch(err){console.error('Review izin telat:',err);const host=$('vaxFineDecisionHistoryList');if(host)host.textContent='Gagal memuat riwayat: '+(err?.message||String(err));}
    finally{refreshing=false;}
  }
  async function openDecision(id,action){
    if(!['spv','svp'].includes((await identity())?.role))return;
    const [a,r]=await Promise.all([
      db.from('absensi').select('id,karyawan_id,tanggal,terlambat_menit,karyawan:karyawan_id(nama_karyawan)').eq('id',id).maybeSingle(),
      db.from('absensi_denda_review_v1').select('nominal_awal,status').eq('absensi_id',id).maybeSingle()
    ]);
    if(a.error||r.error||!a.data||r.data?.status!=='MENUNGGU_SPV'||a.data.tanggal!==wibDay()){alert('Keputusan tidak tersedia. Refresh panel denda.');return;}
    const initial=Number(r.data.nominal_awal);if(!Number.isSafeInteger(initial)||initial<=0)return;
    mount();selected={id:Number(id),initial};
    $('vaxFineCustomPerson').textContent=`${a.data.karyawan?.nama_karyawan||'Karyawan'} · ${a.data.terlambat_menit} menit · denda awal ${money(initial)}.`;
    $('vaxFineCustomAmount').value=money(action==='waive'?0:initial);
    $('vaxFineCustomReason').value='';$('vaxFineCustomState').textContent='Alasan keputusan SPV wajib. Foto hanya berasal dari pengajuan karyawan.';
    const evidence=late.get(dayKey(a.data.karyawan_id,a.data.tanggal));
    $('vaxFineEmployeeEvidence').innerHTML=evidence?`<strong>Pengajuan Izin Telat dari karyawan</strong><p>${esc(evidence.alasan)}</p>${proofButton(evidence.bukti_path,'Lihat foto karyawan')}`:'<p>Belum ada pengajuan Izin Telat dari akun karyawan. SPV tetap dapat mencatat keputusan dengan alasan.</p>';
    $('vaxDendaCustomModal').hidden=false;
  }
  async function save(){
    if(busy||!selected)return;
    const nominal=Number(digits($('vaxFineCustomAmount').value)),reason=$('vaxFineCustomReason').value.trim();
    if(!Number.isSafeInteger(nominal)||nominal<0||nominal>selected.initial){$('vaxFineCustomState').textContent='Nominal harus antara Rp0 dan denda awal.';return;}
    if(reason.length<5){$('vaxFineCustomState').textContent='Alasan SPV wajib minimal 5 karakter.';return;}
    busy=true;$('vaxFineCustomSave').disabled=true;$('vaxFineCustomCancel').disabled=true;
    try{
      if(!['spv','svp'].includes((await identity())?.role))throw Error('Sesi SPV tidak aktif.');
      $('vaxFineCustomState').textContent='Menyimpan keputusan final ke server…';
      const {error}=await db.rpc('absensi_denda_putus_nominal_v3',{p_absensi_id:selected.id,p_nominal:nominal,p_catatan:reason});
      if(error)throw error;
      $('vaxDendaCustomModal').hidden=true;selected=null;
      $('vaxDendaRefresh')?.click();setTimeout(refresh,450);
    }catch(err){$('vaxFineCustomState').textContent=err?.message||'Keputusan gagal. Periksa riwayat sebelum mengulang.';}
    finally{busy=false;$('vaxFineCustomSave').disabled=false;$('vaxFineCustomCancel').disabled=false;}
  }
  function start(){
    if(started)return;started=true;mount();const panel=$('vaxDendaReview');if(!panel)return;
    if(!$('vaxFineDecisionHistory')){
      const section=document.createElement('section');section.id='vaxFineDecisionHistory';section.className='vax-fine-decision-history';
      section.innerHTML='<h3>Riwayat Keputusan SPV · Pemeriksaan Owner</h3><p>Keputusan final, alasan SPV, dan foto dari karyawan selama 30 hari terakhir.</p><div id="vaxFineDecisionHistoryList"></div>';
      panel.appendChild(section);
    }
    refresh();setInterval(()=>{if(!document.hidden&&$('vaxDendaCustomModal')?.hidden)refresh();},60000);
    panel.addEventListener('click',event=>{
      const action=event.target.closest('button[data-fine-action]');if(!action||!['final','waive','custom'].includes(action.dataset.fineAction))return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openDecision(action.dataset.fineId,action.dataset.fineAction);
    },true);
    $('vaxDendaRefresh')?.addEventListener('click',()=>setTimeout(refresh,300));
    const host=$('vaxDendaRows');if(host)new MutationObserver(()=>{setTimeout(enrichRows,0);}).observe(host,{childList:true});
  }
  const boot=()=>{if($('vaxDendaReview'))start();else{let count=0;const timer=setInterval(()=>{if($('vaxDendaReview')){clearInterval(timer);start();}else if(++count>90)clearInterval(timer);},250);}};
  document.addEventListener('erp:finance-ready',boot,{once:true});
  if(document.readyState==='complete'&&typeof db!=='undefined')boot();
})();
