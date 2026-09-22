/* Payroll Capster read-only card. Mirror the existing Owner Payroll net after
   final Absensi fines have been presented; never recompute or add back fines. */
(() => {
  'use strict';
  if (window.__vaxCapsterHakDibayarUi) return;
  window.__vaxCapsterHakDibayarUi = true;
  const list = document.getElementById('payrollList');
  if (!list) return;
  const months = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', Mei:'05', Jun:'06', Jul:'07', Agu:'08', Sep:'09', Okt:'10', Nov:'11', Des:'12' };
  const period = () => {
    const match = (document.getElementById('payrollPeriodLabel')?.textContent || '').trim().match(/^(\w+)\s+(\d{4})$/);
    if (!match || !months[match[1]]) return null;
    const year = Number(match[2]), month = Number(months[match[1]]);
    return { start: `${year}-${String(month).padStart(2,'0')}-01`, end: `${year}-${String(month).padStart(2,'0')}-${String(new Date(year,month,0).getDate()).padStart(2,'0')}` };
  };
  const isCapster = card => /\bcapster\b/i.test(card.querySelector('.payroll-person p')?.textContent || '');
  const ensure = card => {
    if (!isCapster(card)) return null;
    const summary = card.querySelector('.payroll-summary');
    if (!summary) return null;
    let item = summary.querySelector('[data-vax-hak-dibayar]');
    if (!item) {
      item = document.createElement('div');
      item.className = 'payroll-sum is-hak-dibayar';
      item.dataset.vaxHakDibayar = '1';
      const label = document.createElement('span'); label.textContent = 'Hak Dibayar';
      const value = document.createElement('strong'); value.textContent = '—';
      const note = document.createElement('small'); note.className = 'vax-hak-note';
      item.append(label, value, note);
      summary.appendChild(item);
    }
    return item;
  };
  const render = (card, state) => {
    const item = ensure(card);
    if (!item) return;
    const value = item.querySelector('strong'), note = item.querySelector('.vax-hak-note');
    /* The existing final-fine UI already presents the net in this Owner Payroll
       card. It subtracts final fines for the informational net. Never use
       data-vax-payout-net here: that base includes paid fines and previously
       caused an incorrect Rp25.000 add-back. */
    const source = card.querySelector('.payroll-sum.is-net strong');
    const net = source?.textContent?.trim() || '';
    const ready = state === 'settled' && card.hasAttribute('data-vax-fine-extra')
      && /^Rp\s*-?[\d.,]+$/.test(net);
    if (!ready) {
      value.textContent = '—';
      note.textContent = state === 'unpaid' ? 'Ada denda final belum lunas; nominal perlu verifikasi.'
        : state === 'error' ? 'Data denda final tidak tersedia; nominal tidak ditampilkan.'
        : 'Menunggu Pendapatan Bersih dan denda final Payroll…';
      return;
    }
    value.textContent = net;
    note.textContent = card.dataset.vaxHakPreview === '1'
      ? 'Pratinjau bonus belum disimpan · bukan nilai final.'
      : 'Mengikuti Pendapatan Bersih Payroll · bukan bukti pencairan.';
  };
  let generation = 0;
  async function refresh() {
    const seq = ++generation, range = period();
    const cards = [...list.querySelectorAll('.payroll-employee-card')].filter(isCapster);
    for (const card of cards) { card.dataset.vaxHakState = 'loading'; delete card.dataset.vaxHakPreview; render(card, 'loading'); }
    if (!cards.length || !range || typeof db === 'undefined') return;
    const ids = [...new Set(cards.map(card => Number(card.dataset.employeeId)).filter(Number.isSafeInteger))];
    if (!ids.length) { for (const card of cards) { card.dataset.vaxHakState = 'error'; render(card, 'error'); } return; }
    try {
      const { data, error } = await db.from('absensi_denda_review_v1')
        .select('karyawan_id,nominal_final,dibayar,status')
        .in('karyawan_id', ids).gte('tanggal', range.start).lte('tanggal', range.end).limit(2000);
      if (seq !== generation) return;
      if (error || !Array.isArray(data) || data.length === 2000) throw error || new Error('FINE_DATA_INCOMPLETE');
      const unsettled = new Set();
      for (const row of data) {
        const final = Number(row.nominal_final), paid = Number(row.dibayar);
        if (!['DITETAPKAN','DIBEBASKAN'].includes(row.status) || !Number.isFinite(final)
          || !Number.isFinite(paid) || final < 0 || paid < 0 || paid < final) {
          unsettled.add(Number(row.karyawan_id));
        }
      }
      for (const card of cards) {
        if (!card.isConnected) continue;
        const state = unsettled.has(Number(card.dataset.employeeId)) ? 'unpaid' : 'settled';
        card.dataset.vaxHakState = state;
        render(card, state);
      }
    } catch (error) {
      if (seq !== generation) return;
      console.warn('Hak Dibayar Capster: verifikasi denda gagal', error);
      for (const card of cards) if (card.isConnected) { card.dataset.vaxHakState = 'error'; render(card, 'error'); }
    }
  }
  const style = document.createElement('style');
  style.textContent = '.payroll-summary .is-hak-dibayar{border-color:#a88740!important;background:linear-gradient(135deg,#242319,#171b20)!important}.payroll-summary .is-hak-dibayar span{color:#e9ce85!important}.payroll-summary .is-hak-dibayar strong{color:#f2d58f!important}.payroll-summary .is-hak-dibayar .vax-hak-note{display:block;margin-top:5px;color:#bbb5a7;font-size:10px;line-height:1.35;letter-spacing:0;text-transform:none;font-weight:400}';
  document.head.appendChild(style);
  let queued = false;
  new MutationObserver(records => {
    if (records.some(r => r.type === 'childList' && [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.payroll-employee-card') || n.querySelector?.('.payroll-employee-card'))))) {
      if (!queued) { queued = true; queueMicrotask(() => { queued = false; void refresh(); }); }
      return;
    }
    const changedCards = new Set();
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'data-vax-fine-extra') {
        const card = record.target;
        if (card?.matches?.('.payroll-employee-card') && isCapster(card)) changedCards.add(card);
      } else if (record.type === 'childList' || record.type === 'characterData') {
        const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        const source = node?.closest?.('.payroll-sum.is-net strong');
        if (source) {
          const card = source.closest('.payroll-employee-card');
          if (card && isCapster(card)) changedCards.add(card);
        }
      }
    }
    for (const card of changedCards) render(card, card.dataset.vaxHakState);
  }).observe(list, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-vax-fine-extra'] });
  list.addEventListener('input', event => {
    if (!event.target.matches('.js-insentif,.js-kpi')) return;
    const card = event.target.closest('.payroll-employee-card');
    if (card && isCapster(card)) {
      card.dataset.vaxHakPreview = '1';
      requestAnimationFrame(() => requestAnimationFrame(() => render(card, card.dataset.vaxHakState)));
    }
  });
  void refresh();
})();