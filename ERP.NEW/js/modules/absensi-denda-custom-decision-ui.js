/* Additive Absensi-only fine decision UI. All money/accounting mutations happen in RPC. */
(() => {
  'use strict';
  if (window.__vaxDendaCustomDecisionV2) return;
  window.__vaxDendaCustomDecisionV2 = true;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = amount => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(amount) || 0);
  const wibDay = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let busy = false, selected = null, requests = new Map(), signed = new Map(), prior = new Map();
  async function identity() {
    const {data:{session},error} = await db.auth.getSession();
    if(error || !session) return null;
    const {data:profile,error:pe} = await db.from('profiles').select('role,aktif').eq('id',session.user.id).maybeSingle();
    if(pe || !profile || profile.aktif === false) return null;
    return {user:session.user,role:String(profile.role||'').toLowerCase()};
  }
  function mount() {
    if ($('vaxDendaCustomModal')) return;
    const modal = document.createElement('div');modal.id='vaxDendaCustomModal';modal.hidden=true;
    modal.innerHTML = '<section role="dialog" aria-modal="true" aria-labelledby="vaxFineCustomTitle"><h3 id="vaxFineCustomTitle">Putuskan nominal denda</h3><p id="vaxFineCustomPerson"></p><label>Nominal final (Rp)<input id="vaxFineCustomAmount" type="number" min="0" step="1000" inputmode="numeric" required></label><p id="vaxFineCustomPreset"><button type="button" data-fine-fraction="1">Penuh</button> <button type="button" data-fine-fraction="0.5">Setengah</button> <button type="button" data-fine-fraction="0">Bebaskan</button></p><label>Catatan / alasan SPV (wajib)<textarea id="vaxFineCustomReason" maxlength="1000" rows="3" placeholder="Jelaskan dasar keputusan, minimal 5 karakter" required></textarea></label><label>Foto bukti keputusan (wajib)<input id="vaxFineCustomPhoto" type="file" accept="image/jpeg,image/png,image/webp" required></label><p id="vaxFineCustomState" role="status"></p><div class="vax-fine-custom-actions"><button type="button" id="vaxFineCustomCancel">Batal</button><button type="button" id="vaxFineCustomSave">Simpan keputusan final</button></div></section>';
    document.body.appendChild(modal);
    $('vaxFineCustomCancel').addEventListener('click',()=>{if(!busy){modal.hidden=true;selected=null;}});
    modal.addEventListener('click',e=>{if(e.target===modal && !busy){modal.hidden=true;selected=null;}});
    $('vaxFineCustomPreset').addEventListener('click',e=>{const b=e.target.closest('[data-fine-fraction]');if(b && selected)$('vaxFineCustomAmount').value=String(Math.round(selected.initial*Number(b.dataset.fineFraction)));});
    $('vaxFineCustomSave').addEventListener('click',save);
  }
  async function urlFor(path) {
    if(!path) return '';
    const key=String(path).replace(/^izin-proofs\//,'');
    if(signed.has(key)) return signed.get(key);
    if(!key || /^https?:/i.test(key)) return '';
    const {data,error}=await db.storage.from('izin-proofs').createSignedUrl(key,600);
    const url=error?'':(data?.signedUrl||'');signed.set(key,url);return url;
  }
  async function loadExistingRequests() {
    const day=wibDay();
    const {data,error}=await db.from('pengajuan_izin').select('id,karyawan_id,tanggal,jenis,alasan,bukti_path,status,created_at').eq('tanggal',day).eq('jenis','IZIN').order('created_at',{ascending:false}).limit(200);
    if(error) {console.warn('Gagal memuat bukti izin terlambat',error);requests=new Map();return;}
    requests=new Map();for(const item of data||[]){const key=String(item.karyawan_id);if(!requests.has(key))requests.set(key,item);}
  }
  async function loadDecisions() {
    const start=new Date();start.setDate(start.getDate()-30);
    const startDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
    const {data,error}=await db.from('absensi_denda_review_v1').select('absensi_id,karyawan_id,tanggal,nominal_awal,nominal_final,status,dibayar,catatan,bukti_path,diputus_oleh,diputus_pada,karyawan:karyawan_id(nama_karyawan,jabatan)').gte('tanggal',startDay).neq('status','MENUNGGU_SPV').order('diputus_pada',{ascending:false}).limit(100);
    if(error){console.warn('Gagal memuat keputusan SPV',error);return;}
    prior=new Map((data||[]).map(x=>[String(x.absensi_id),x]));
    const history=$('vaxFineDecisionHistory');if(!history)return;
    if(!(data||[]).length){history.innerHTML='<p>Belum ada keputusan denda final.</p>';return;}
    history.innerHTML=(data||[]).map(x=>`<article class="vax-fine-history-row"><div><strong>${esc(x.karyawan?.nama_karyawan||'Karyawan')}</strong><small>${esc(x.tanggal)} · ${esc(x.karyawan?.jabatan)} · Awal ${money(x.nominal_awal)} → Final ${money(x.nominal_final)}</small><small>SPV: ${esc(x.diputus_oleh||'—')} · ${x.diputus_pada?new Date(x.diputus_pada).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'—'} WIB</small><p>${esc(x.catatan||'—')}</p></div><button type="button" data-vax-fine-proof="${esc(x.bukti_path||'')}" ${x.bukti_path?'':'disabled'}>Lihat bukti foto</button></article>`).join('');
  }
  async function enrichRows() {
    const host=$('vaxDendaRows');if(!host)return;
    const isSupervisor=(await identity())?.role;
    const allow=isSupervisor==='spv'||isSupervisor==='svp';
    const {data:attendance,error}=await db.from('absensi').select('id,karyawan_id,tanggal').eq('tanggal',wibDay()).gt('terlambat_menit',0);
    if(error)return;
    const byId=new Map((attendance||[]).map(x=>[String(x.id),x]));
    for(const article of host.querySelectorAll('.vax-denda-row')) {
      const button=article.querySelector('button[data-fine-id]');
      const id=button?.dataset.fineId; if(!id || !byId.has(id)) continue;
      const a=byId.get(id), request=requests.get(String(a.karyawan_id));
      if(request && !article.querySelector('.vax-fine-izin-context')) {
        const text=document.createElement('div');text.className='vax-fine-izin-context';
        text.innerHTML=`<strong>Pengajuan izin dari karyawan · ${esc(request.status)}</strong><p>${esc(request.alasan||'Tidak ada alasan')}</p>${request.bukti_path?`<button type="button" data-vax-fine-proof="${esc(request.bukti_path)}">Lihat bukti foto karyawan</button>`:'<small>Belum ada foto izin karyawan.</small>'}`;
        article.appendChild(text);
      }
      if(allow && article.querySelector('[data-fine-action="final"]') && !article.querySelector('[data-fine-action="custom"]')) {
        const button=document.createElement('button');button.type='button';button.dataset.fineId=id;button.dataset.fineAction='custom';button.textContent='Edit nominal denda';
        article.querySelector('.vax-denda-row-actions')?.appendChild(button);
      }
      const review=prior.get(id);
      if(review && !article.querySelector('.vax-fine-previous-decision')) {
        const el=document.createElement('div');el.className='vax-fine-previous-decision';el.innerHTML=`<strong>Catatan keputusan SPV</strong><p>${esc(review.catatan||'—')}</p>${review.bukti_path?`<button type="button" data-vax-fine-proof="${esc(review.bukti_path)}">Lihat bukti keputusan</button>`:''}`;article.appendChild(el);
      }
    }
  }
  async function refresh() {
    if(typeof db==='undefined' || !$('vaxDendaReview'))return;
    await Promise.all([loadExistingRequests(),loadDecisions()]);await enrichRows();
  }
  async function openDecision(id,action) {
    const who=await identity();if(!who || !['spv','svp'].includes(who.role))return;
    const {data:attendance,error}=await db.from('absensi').select('id,karyawan_id,tanggal,terlambat_menit,karyawan:karyawan_id(nama_karyawan)').eq('id',id).maybeSingle();
    const {data:review,error:re}=await db.from('absensi_denda_review_v1').select('nominal_awal,status').eq('absensi_id',id).maybeSingle();
    if(error||re||!attendance||review?.status!=='MENUNGGU_SPV'||attendance.tanggal!==wibDay()) {alert('Keputusan tidak tersedia. Refresh panel denda.');return;}
    const initial=Number(review.nominal_awal);if(!Number.isSafeInteger(initial)||initial<=0)return;
    selected={id:Number(id),initial};mount();
    $('vaxFineCustomPerson').textContent=`${attendance.karyawan?.nama_karyawan||'Karyawan'} · ${attendance.terlambat_menit} menit · denda awal ${money(initial)}.`;
    $('vaxFineCustomAmount').max=String(initial);
    $('vaxFineCustomAmount').value=String(action==='waive'?0:initial);
    $('vaxFineCustomReason').value='';$('vaxFineCustomPhoto').value='';$('vaxFineCustomState').textContent='Foto bukti dan alasan akan disimpan untuk pemeriksaan Owner.';
    $('vaxDendaCustomModal').hidden=false;
  }
  async function save() {
    if(busy||!selected)return;
    const nominal=Number($('vaxFineCustomAmount').value),reason=$('vaxFineCustomReason').value.trim(),file=$('vaxFineCustomPhoto').files?.[0];
    if(!Number.isSafeInteger(nominal)||nominal<0||nominal>selected.initial){$('vaxFineCustomState').textContent='Nominal harus antara Rp0 dan denda awal.';return;}
    if(reason.length<5){$('vaxFineCustomState').textContent='Alasan minimal 5 karakter.';return;}
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('vaxFineCustomState').textContent='Foto JPG, PNG atau WebP wajib, maksimal 5 MB.';return;}
    busy=true;$('vaxFineCustomSave').disabled=true;$('vaxFineCustomCancel').disabled=true;
    try {
      const who=await identity();if(!who||!['spv','svp'].includes(who.role))throw Error('Sesi SPV tidak aktif.');
      const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type];
      const path=`denda-review/${who.user.id}/${selected.id}/${crypto.randomUUID()}.${ext}`;
      $('vaxFineCustomState').textContent='Mengunggah bukti foto…';
      const uploaded=await db.storage.from('izin-proofs').upload(path,file,{contentType:file.type,upsert:false});if(uploaded.error)throw uploaded.error;
      $('vaxFineCustomState').textContent='Mencatat keputusan final…';
      const {error}=await db.rpc('absensi_denda_putus_nominal_v2',{p_absensi_id:selected.id,p_nominal:nominal,p_catatan:reason,p_bukti_path:path});if(error)throw error;
      $('vaxDendaCustomModal').hidden=true;selected=null;
      $('vaxDendaRefresh')?.click();setTimeout(refresh,500);
    }catch(e){$('vaxFineCustomState').textContent=e?.message||'Keputusan gagal. Periksa riwayat sebelum mengulang.';}
    finally{busy=false;$('vaxFineCustomSave').disabled=false;$('vaxFineCustomCancel').disabled=false;}
  }
  function start() {
    mount();const panel=$('vaxDendaReview');if(!panel)return;
    if(!$('vaxFineDecisionHistory')) {
      const section=document.createElement('section');section.id='vaxFineDecisionHistory';section.className='vax-fine-decision-history';
      section.innerHTML='<h3>Riwayat Keputusan SPV · Pemeriksaan Owner</h3><p>Keputusan final, nominal, alasan dan foto bukti 30 hari terakhir.</p><div id="vaxFineDecisionHistoryRows"></div>';
      panel.appendChild(section);
      // Keep header and rows as separate nodes so refresh never destroys section.
      const list=$('vaxFineDecisionHistoryRows');list.id='vaxFineDecisionHistoryList';
    }
    refresh();setInterval(()=>{if(!document.hidden && $('vaxDendaCustomModal')?.hidden)refresh();},60000);
    panel.addEventListener('click',e=>{
      const proof=e.target.closest('[data-vax-fine-proof]');if(proof){e.preventDefault();urlFor(proof.dataset.vaxFineProof).then(url=>{if(url)window.open(url,'_blank','noopener,noreferrer');else alert('Foto tidak tersedia.');});return;}
      const action=e.target.closest('button[data-fine-action]');if(!action||!['final','waive','custom'].includes(action.dataset.fineAction))return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openDecision(action.dataset.fineId,action.dataset.fineAction);
    },true);
    $('vaxDendaRefresh')?.addEventListener('click',()=>setTimeout(refresh,300));
    const host=$('vaxDendaRows');if(host)new MutationObserver(()=>{setTimeout(enrichRows,0);}).observe(host,{childList:true});
  }
  const bootstrap=()=>{if($('vaxDendaReview'))start();else{let attempts=0;const t=setInterval(()=>{if($('vaxDendaReview')){clearInterval(t);start();}else if(++attempts>90)clearInterval(t);},250);}};
  document.addEventListener('erp:finance-ready',bootstrap,{once:true});
  if(document.readyState==='complete' && typeof db!=='undefined')bootstrap();
})();