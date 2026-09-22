/* Owner Payroll Capster: read-only daily entitlement presentation.
   Uses existing Payroll daily rows and final Absensi settlement. Monthly bonuses and
   pre-ERP monthly manual fines have no approved daily allocation, so are excluded. */
(() => {
  'use strict';
  if (window.__vaxPayrollCapsterHarianReadonly) return;
  window.__vaxPayrollCapsterHarianReadonly = true;
  const list = document.getElementById('payrollList');
  if (!list) return;
  const months = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', Mei:'05', Jun:'06', Jul:'07', Agu:'08', Sep:'09', Okt:'10', Nov:'11', Des:'12' };
  const parseDate = text => {
    const m = String(text || '').trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    return m && months[m[2]] ? `${m[3]}-${months[m[2]]}-${m[1].padStart(2,'0')}` : null;
  };
  const parseMoney = text => {
    const raw = String(text || '').trim();
    if (!/^Rp\s*-?[\d.,]+$/.test(raw)) return null;
    const n = Number(raw.replace(/[^\d-]/g, ''));
    return Number.isSafeInteger(n) ? n : null;
  };
  const money = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(n);
  const period = () => {
    const m = String(document.getElementById('payrollPeriodLabel')?.textContent || '').trim().match(/^(\w+)\s+(\d{4})$/);
    if (!m || !months[m[1]]) return null;
    const y = Number(m[2]), mo = Number(months[m[1]]);
    return { start:`${y}-${String(mo).padStart(2,'0')}-01`, end:`${y}-${String(mo).padStart(2,'0')}-${String(new Date(y,mo,0).getDate()).padStart(2,'0')}` };
  };
  const isCapster = card => /\bcapster\b/i.test(card.querySelector('.payroll-person p')?.textContent || '');
  const noteText = 'Hak harian dari rincian Payroll: gaji pokok + share produk − kasbon − sisa denda final yang belum dibayar. Bonus Insentif/KPI dan denda manual tingkat bulan belum dialokasikan ke tanggal; angka ini bukan total gaji final atau bukti pencairan.';
  const style = document.createElement('style');
  style.textContent = '.payroll-table .vax-daily-payable{color:#eed28c!important;font-weight:800!important;white-space:nowrap}.vax-daily-payable-note{margin:8px 2px 3px;color:#c7b998;font-size:11px;line-height:1.5}.vax-daily-payable-note strong{color:#efd38c}';
  document.head.appendChild(style);
  let sequence = 0;
  function ensure(card) {
    const table = card.querySelector('.payroll-table'), wrap = card.querySelector('.payroll-table-wrap');
    if (!table || !wrap || !table.tHead?.rows[0]) return null;
    let head = table.tHead.rows[0].querySelector('[data-vax-daily-payable]');
    if (!head) {
      head = document.createElement('th');
      head.className = 'num vax-daily-payable';
      head.dataset.vaxDailyPayable = '1';
      head.textContent = 'Hak Harian*';
      head.title = noteText;
      table.tHead.rows[0].appendChild(head);
    }
    for (const tr of table.tBodies[0]?.rows || []) {
      if (tr.cells.length < 7) continue;
      if (!tr.querySelector('[data-vax-daily-payable]')) {
        const td = document.createElement('td');
        td.className = 'num vax-daily-payable';
        td.dataset.vaxDailyPayable = '1';
        td.textContent = '…';
        td.title = noteText;
        tr.appendChild(td);
      }
    }
    let note = card.querySelector('.vax-daily-payable-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'vax-daily-payable-note';
      const title = document.createElement('strong'); title.textContent = '*Hak Harian: ';
      note.append(title, document.createTextNode(noteText));
      wrap.insertAdjacentElement('afterend', note);
    }
    return table;
  }
  function paintRow(tr, result, message) {
    const td = tr.querySelector('td[data-vax-daily-payable]');
    if (!td) return;
    td.textContent = result == null ? '—' : money(result);
    td.title = message || noteText;
  }
  async function refresh() {
    const seq = ++sequence;
    const cards = [...list.querySelectorAll('.payroll-employee-card')].filter(isCapster);
    const range = period();
    cards.forEach(card => {
      ensure(card);
      card.querySelectorAll('td[data-vax-daily-payable]').forEach(td => { td.textContent = '…'; td.title = 'Memeriksa keputusan denda final…'; });
    });
    if (!cards.length || !range || typeof db === 'undefined') {
      cards.forEach(card => card.querySelectorAll('td[data-vax-daily-payable]').forEach(td => { td.textContent = '—'; td.title = 'Periode atau koneksi Payroll tidak tersedia.'; }));
      return;
    }
    const ids = [...new Set(cards.map(card => Number(card.dataset.employeeId)).filter(Number.isSafeInteger))];
    if (ids.length !== cards.length) {
      cards.forEach(card => card.querySelectorAll('td[data-vax-daily-payable]').forEach(td => { td.textContent = '—'; td.title = 'ID karyawan belum tersedia.'; }));
      return;
    }
    try {
      const { data, error } = await db.from('absensi_denda_review_v1')
        .select('karyawan_id,tanggal,nominal_final,dibayar,status')
        .in('karyawan_id', ids).gte('tanggal',range.start).lte('tanggal',range.end).limit(2000);
      if (seq !== sequence) return;
      if (error || !Array.isArray(data) || data.length >= 2000) throw error || new Error('DATA_DENDA_TIDAK_LENGKAP');
      const byKey = new Map();
      for (const row of data) {
        const key = `${row.karyawan_id}|${row.tanggal}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(row);
      }
      for (const card of cards) {
        if (!card.isConnected) continue;
        const table = ensure(card);
        if (!table) continue;
        const id = Number(card.dataset.employeeId);
        const days = [...table.tBodies[0].rows].filter(tr => tr.querySelector('td[data-vax-daily-payable]'));
        const counts = new Map();
        days.forEach(tr => { const date = parseDate(tr.cells[0]?.textContent); if (date) counts.set(date, (counts.get(date)||0)+1); });
        for (const tr of days) {
          const date = parseDate(tr.cells[0]?.textContent);
          if (!date || counts.get(date) !== 1 || tr.cells.length < 8) {
            paintRow(tr, null, 'Tanggal tidak valid atau lebih dari satu cabang pada hari yang sama; potongan belum dapat dialokasikan.');
            continue;
          }
          const base = parseMoney(tr.cells[3].textContent);
          const rawFine = parseMoney(tr.cells[4].textContent);
          const advance = parseMoney(tr.cells[5].textContent);
          const product = parseMoney(tr.cells[6].textContent);
          const reviews = byKey.get(`${id}|${date}`) || [];
          if ([base,rawFine,advance,product].some(x => x == null) || reviews.length > 1) {
            paintRow(tr, null, 'Rincian Payroll atau keputusan denda tidak lengkap.');
            continue;
          }
          let unpaid = 0;
          if (reviews.length === 1) {
            const review = reviews[0], final = Number(review.nominal_final), paid = Number(review.dibayar);
            if (!['DITETAPKAN','DIBEBASKAN'].includes(review.status) || !Number.isSafeInteger(final) || !Number.isSafeInteger(paid) || final < 0 || paid < 0 || paid > final) {
              paintRow(tr, null, 'Keputusan atau pembayaran denda belum valid.');
              continue;
            }
            unpaid = final - paid;
          } else if (rawFine !== 0) {
            paintRow(tr, null, 'Denda pada rincian Payroll belum memiliki keputusan final yang dapat diverifikasi.');
            continue;
          }
          const total = base + product - advance - unpaid;
          if (!Number.isSafeInteger(total)) { paintRow(tr, null, 'Nominal di luar batas yang dapat diverifikasi.'); continue; }
          paintRow(tr, total, noteText);
        }
      }
    } catch (error) {
      if (seq !== sequence) return;
      console.warn('Payroll Capster hak harian read-only:', error);
      cards.forEach(card => card.querySelectorAll('td[data-vax-daily-payable]').forEach(td => { td.textContent = '—'; td.title = 'Gagal memverifikasi denda final; nominal ditahan.'; }));
    }
  }
  let queued = false;
  const observer = new MutationObserver(records => {
    if (!records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('.payroll-employee-card') || n.querySelector?.('.payroll-employee-card'))))) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; void refresh(); });
  });
  observer.observe(list,{childList:true});
  document.getElementById('payrollRefresh')?.addEventListener('click', () => { sequence++; });
  void refresh();
})();