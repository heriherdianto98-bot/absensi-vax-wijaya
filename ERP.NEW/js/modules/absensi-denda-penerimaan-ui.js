/* VAX ERP — presentation only: receipt history belongs to Absensi; Arus Kas remains the accounting ledger. */
(() => {
  'use strict';
  if (window.__vaxAbsensiDendaPenerimaanUi) return;
  window.__vaxAbsensiDendaPenerimaanUi = true;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rupiah = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n) || 0);
  const dateTime = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(d) + ' WIB';
  };
  let busy = false;
  function mount() {
    const parent = $('vaxDendaReview');
    if (!parent || $('vaxDendaReceiptHistory')) return Boolean(parent);
    const box = document.createElement('section');
    box.id = 'vaxDendaReceiptHistory';
    box.className = 'vax-denda-receipt-history';
    box.innerHTML = '<div class="vax-denda-receipt-head"><div><h3>Riwayat Penerimaan Denda</h3><p>Catatan penerimaan tetap di modul Absensi. Arus Kas mencatat Piutang Denda dan Kas Denda secara otomatis.</p></div><button id="vaxDendaReceiptRefresh" type="button">Refresh penerimaan</button></div><p id="vaxDendaReceiptState" role="status"></p><div id="vaxDendaReceiptList"></div>';
    parent.appendChild(box);
    $('vaxDendaReceiptRefresh').addEventListener('click', load);
    const css = document.createElement('style');
    css.textContent = '#vaxDendaReceiptHistory{margin-top:20px;border-top:1px solid #57616b;padding-top:17px}#vaxDendaReceiptHistory .vax-denda-receipt-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}#vaxDendaReceiptHistory h3{margin:0 0 5px;font-size:17px;color:#f5d17e}#vaxDendaReceiptHistory p{margin:0 0 12px;color:#b7c3cf}#vaxDendaReceiptList{display:grid;gap:8px}#vaxDendaReceiptList article{border:1px solid #394d53;background:#182b2b;border-radius:10px;padding:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}#vaxDendaReceiptList strong{color:#9be5bd}#vaxDendaReceiptList small{color:#c3d0da;display:block;margin-top:4px}';
    document.head.appendChild(css);
    return true;
  }
  async function load() {
    if (busy || typeof db === 'undefined' || !mount()) return;
    busy = true;
    const state = $('vaxDendaReceiptState');
    const list = $('vaxDendaReceiptList');
    const button = $('vaxDendaReceiptRefresh');
    if (button) button.disabled = true;
    state.textContent = 'Memuat riwayat penerimaan…';
    try {
      const {data:{session},error:authError} = await db.auth.getSession();
      if (authError || !session) throw new Error('Sesi login tidak tersedia.');
      const {data:profile,error:profileError} = await db.from('profiles').select('role,aktif').eq('id',session.user.id).maybeSingle();
      if (profileError || !profile || profile.aktif === false || !['spv','svp','owner'].includes(String(profile.role || '').toLowerCase())) {
        throw new Error('Riwayat hanya tersedia bagi Owner dan SPV aktif.');
      }
      const {data:payments,error:payError} = await db.from('absensi_denda_pembayaran_v1')
        .select('id,absensi_id,nominal,metode,bukti,diterima_pada')
        .order('diterima_pada',{ascending:false}).limit(40);
      if (payError) throw payError;
      const ids = [...new Set((payments || []).map(p => p.absensi_id).filter(Boolean))];
      let reviews = [];
      if (ids.length) {
        const result = await db.from('absensi_denda_review_v1').select('absensi_id,karyawan_id,tanggal').in('absensi_id',ids);
        if (result.error) throw result.error;
        reviews = result.data || [];
      }
      const reviewById = new Map(reviews.map(r => [String(r.absensi_id),r]));
      const employeeIds = [...new Set(reviews.map(r => r.karyawan_id).filter(Boolean))];
      let employees = [];
      if (employeeIds.length) {
        const result = await db.from('karyawan').select('id,nama_karyawan,jabatan').in('id',employeeIds);
        if (result.error) throw result.error;
        employees = result.data || [];
      }
      const employeeById = new Map(employees.map(e => [String(e.id),e]));
      list.innerHTML = (payments || []).map(p => {
        const review = reviewById.get(String(p.absensi_id));
        const employee = employeeById.get(String(review?.karyawan_id));
        const payroll = p.metode === 'POTONGAN_GAJI';
        return `<article><div><strong>${esc(employee?.nama_karyawan || 'Karyawan')}</strong><small>${esc(employee?.jabatan || '—')} · Absensi ${esc(review?.tanggal || '—')}</small><small>${payroll ? 'Potongan payroll kasir' : 'Uang denda diterima SPV'} · ${esc(dateTime(p.diterima_pada))}</small><small>Catatan/bukti: ${esc(p.bukti || '—')}</small></div><div><strong>${rupiah(p.nominal)}</strong><small>${payroll ? 'Piutang lunas via payroll' : 'Piutang → Kas Denda'}</small></div></article>`;
      }).join('') || '<p>Belum ada penerimaan denda tercatat.</p>';
      state.textContent = `${(payments || []).length} transaksi penerimaan terakhir · tampilan Absensi (read-only).`;
    } catch (err) {
      state.textContent = `Gagal memuat riwayat: ${err?.message || String(err)}`;
      list.replaceChildren();
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }
  const start = () => {
    if (mount()) load();
    else {
      const observer = new MutationObserver(() => {if (mount()) {observer.disconnect();load();}});
      observer.observe(document.body,{childList:true,subtree:true});
    }
    document.addEventListener('click', event => {
      if (event.target.closest('#vaxDendaConfirm')) setTimeout(load,1800);
    });
    setInterval(() => {if (!document.hidden && $('vaxDendaReview') && !$('vaxDendaReview').hidden) load();},60000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();