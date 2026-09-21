/* ERP VAX: additive SPV fine decision / capster receipt UI. Server RPC owns authorization and accounting. */
(() => {
  'use strict';
  if (window.__vaxDendaReviewUiV1) return;
  window.__vaxDendaReviewUiV1 = true;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(v) || 0);
  const wibDate = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const wibClock = () => new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  let role = '', loading = false, rows = [], active = null, pendingRequestId = null;
  const isSpv = () => role === 'spv' || role === 'svp';
  function mount() {
    if ($('vaxDendaReview')) return;
    const panel = document.createElement('section');
    panel.id = 'vaxDendaReview'; panel.className = 'vax-denda-panel'; panel.hidden = true;
    panel.innerHTML = '<div class="vax-denda-heading"><div><small>REVIEW DENDA · WIB</small><h2>Keputusan Denda Absensi</h2><p>SPV menetapkan atau membebaskan sebelum 18.00 WIB. Denda capster masuk Piutang Denda; uang yang sudah diterima masuk Kas Denda.</p></div><button type="button" id="vaxDendaRefresh">Refresh</button></div><p id="vaxDendaNotice" role="status"></p><div id="vaxDendaRows"></div>';
    const anchor = $('izinSpvEmbed') || $('absensiDailyAuditBridge');
    if (anchor) anchor.insertAdjacentElement('afterend', panel);
    else ($('absensiDailyView') || document.body).appendChild(panel);
    const modal = document.createElement('div');
    modal.id = 'vaxDendaModal';modal.className = 'vax-denda-modal';modal.hidden = true;
    modal.innerHTML = '<div class="vax-denda-dialog" role="dialog" aria-modal="true" aria-labelledby="vaxDendaModalTitle"><h3 id="vaxDendaModalTitle">Keputusan Denda</h3><p id="vaxDendaModalInfo"></p><label id="vaxDendaAmountWrap" hidden>Uang diterima (Rp)<input id="vaxDendaAmount" type="number" min="1" step="1" inputmode="numeric"></label><label>Catatan / bukti penerimaan<textarea id="vaxDendaNote" maxlength="500" rows="3" placeholder="Wajib diisi, minimal 3 karakter"></textarea></label><p id="vaxDendaModalError" role="alert"></p><div class="vax-denda-actions"><button type="button" id="vaxDendaCancel">Batal</button><button type="button" id="vaxDendaConfirm">Konfirmasi</button></div></div>';
    document.body.appendChild(modal);
    $('vaxDendaRefresh').addEventListener('click',load);
    $('vaxDendaCancel').addEventListener('click', close);
    $('vaxDendaConfirm').addEventListener('click',submit);
    $('vaxDendaRows').addEventListener('click',e => {
      const button = e.target.closest('button[data-fine-id]');
      if (!button) return;
      const row = rows.find(x => String(x.id) === button.dataset.fineId);
      if (row) open(row,button.dataset.fineAction);
    });
  }
  function notice(message) {if ($('vaxDendaNotice')) $('vaxDendaNotice').textContent = message;}
  async function resolveRole() {
    const {data:{session},error} = await db.auth.getSession();
    if (error || !session) return '';
    const result = await db.from('profiles').select('role,aktif').eq('id',session.user.id).maybeSingle();
    if (result.error || !result.data || result.data.aktif === false) return '';
    return String(result.data.role || '').trim().toLowerCase();
  }
  function render() {
    const host = $('vaxDendaRows'); if (!host) return;
    if (!rows.length) {host.innerHTML = '<p class="vax-denda-empty">Belum ada keterlambatan yang perlu ditinjau hari ini.</p>';return;}
    host.innerHTML = rows.map(row => {
      const review = row.review;
      const status = review?.status || 'MENUNGGU_SPV';
      const initial = Number(review?.nominal_awal ?? row.denda ?? 0);
      const final = Number(review?.nominal_final ?? 0);
      const paid = Number(review?.dibayar ?? 0);
      const remaining = Math.max(0,final-paid);
      const capster = String(row.karyawan?.jabatan || '').trim().toLowerCase() === 'capster';
      const eligible = isSpv() && status === 'MENUNGGU_SPV' && wibClock() < '18.00';
      const decisionButtons = eligible ? `<button type="button" data-fine-id="${row.id}" data-fine-action="final">Tetapkan denda</button><button type="button" data-fine-id="${row.id}" data-fine-action="waive">Bebaskan</button>` : '';
      const receiptButton = capster && isSpv() && status === 'DITETAPKAN' && remaining > 0 ? `<button type="button" data-fine-id="${row.id}" data-fine-action="receive">Uang diterima</button>` : '';
      const finalLabel = status === 'MENUNGGU_SPV' ? 'Belum diputus' : status === 'DIBEBASKAN' ? 'Dibebaskan' : `Final ${money(final)}`;
      return `<article class="vax-denda-row"><div><strong>${esc(row.karyawan?.nama_karyawan || 'Karyawan')}</strong><small>${esc(row.karyawan?.jabatan || '')} · Jam masuk ${esc(String(row.jam_masuk || '—').slice(0,5))} WIB · Terlambat ${Number(row.terlambat_menit) || 0} menit</small></div><div><small>Awal: ${money(initial)}</small><strong>${esc(finalLabel)}</strong><small>${status === 'DITETAPKAN' ? `Piutang tersisa ${money(remaining)}` : 'Tidak menambah kas sebelum diterima'}</small></div><div class="vax-denda-row-actions">${decisionButtons}${receiptButton}</div></article>`;
    }).join('');
  }
  async function load() {
    if (loading || typeof db === 'undefined') return;
    loading = true; mount(); notice('Memuat data denda…');
    try {
      role = await resolveRole();
      $('vaxDendaReview').hidden = !(isSpv() || role === 'owner');
      if ($('vaxDendaReview').hidden) return;
      const day = wibDate();
      const [a,r] = await Promise.all([
        db.from('absensi').select('id,karyawan_id,tanggal,jam_masuk,terlambat_menit,denda,status,status_denda,karyawan:karyawan_id(nama_karyawan,jabatan)').eq('tanggal',day).gt('terlambat_menit',0).order('jam_masuk',{ascending:true}),
        db.from('absensi_denda_review_v1').select('absensi_id,nominal_awal,nominal_final,status,dibayar,catatan').eq('tanggal',day)
      ]);
      if (a.error) throw a.error;if (r.error) throw r.error;
      const map = new Map((r.data || []).map(x => [String(x.absensi_id),x]));
      rows = (a.data || []).filter(x => ['capster','kasir'].includes(String(x.karyawan?.jabatan||'').trim().toLowerCase()) && !['IZIN','SAKIT','LIBUR'].includes(String(x.status||'').toUpperCase()))
        .map(x => ({...x,review:map.get(String(x.id)) || null})).filter(x => x.review || Number(x.denda)>0);
      notice(`Hari ${day} · ${rows.filter(x => !x.review || x.review.status === 'MENUNGGU_SPV').length} menunggu keputusan · Batas 18.00 WIB.`);
      render();
    } catch (e) {notice('Gagal memuat keputusan denda: ' + (e?.message || String(e)));}
    finally {loading = false;}
  }
  function open(row,action) {
    if (!['final','waive','receive'].includes(action)) return;
    active = {row,action}; pendingRequestId = action === 'receive' ? crypto.randomUUID() : null;
    const amount = Number(row.review?.nominal_final || 0) - Number(row.review?.dibayar || 0);
    $('vaxDendaModalTitle').textContent = action === 'final' ? 'Tetapkan Denda' : action === 'waive' ? 'Bebaskan Denda' : 'Konfirmasi Uang Diterima';
    $('vaxDendaModalInfo').textContent = `${row.karyawan?.nama_karyawan || 'Karyawan'} · ${action === 'receive' ? 'Sisa piutang '+money(amount) : 'Nominal awal '+money(row.review?.nominal_awal ?? row.denda)}`;
    $('vaxDendaAmountWrap').hidden = action !== 'receive';
    $('vaxDendaAmount').value = action === 'receive' ? String(amount) : '';
    $('vaxDendaAmount').max = String(amount);
    $('vaxDendaNote').value = '';
    $('vaxDendaModalError').textContent = '';
    $('vaxDendaModal').hidden = false;
    $('vaxDendaNote').focus();
  }
  function close() {if (!$('vaxDendaConfirm')?.disabled) {$('vaxDendaModal').hidden = true;active = null;pendingRequestId = null;}}
  async function submit() {
    if (!active || $('vaxDendaConfirm').disabled) return;
    const note = String($('vaxDendaNote').value || '').trim();
    if (note.length < 3) {$('vaxDendaModalError').textContent = 'Catatan minimal 3 karakter.';return;}
    const {row,action} = active;
    const args = action === 'receive' ? {p_absensi_id:row.id,p_nominal:Number($('vaxDendaAmount').value),p_bukti:note,p_request_id:pendingRequestId} : {p_absensi_id:row.id,p_bebaskan:action === 'waive',p_catatan:note};
    if (action === 'receive' && (!Number.isSafeInteger(args.p_nominal) || args.p_nominal <= 0 || args.p_nominal > Number($('vaxDendaAmount').max))) {
      $('vaxDendaModalError').textContent = 'Nominal melebihi piutang atau tidak valid.';return;
    }
    $('vaxDendaConfirm').disabled = true;
    $('vaxDendaCancel').disabled = true;
    $('vaxDendaModalError').textContent = 'Menyimpan keputusan ke server…';
    try {
      const {error} = await db.rpc(action === 'receive' ? 'absensi_denda_terima_capster_v1' : 'absensi_denda_putus_v1',args);
      if (error) throw error;
      $('vaxDendaModal').hidden = true;active = null;pendingRequestId = null;
      notice(action === 'receive' ? 'Uang diterima: Piutang Denda berkurang dan Kas Denda bertambah otomatis.' : 'Keputusan SPV tersimpan. Piutang Denda diperbarui otomatis.');
      await load();
    } catch (e) {$('vaxDendaModalError').textContent = e?.message || 'Gagal menyimpan. Periksa sebelum mengulang.';}
    finally {$('vaxDendaConfirm').disabled = false;$('vaxDendaCancel').disabled = false;}
  }
  document.addEventListener('erp:finance-ready',() => {load();setInterval(() => {if (!document.hidden && $('vaxDendaModal')?.hidden) load();},60000);});
  if (document.readyState === 'complete' && typeof db !== 'undefined') load();
})();