/* VAX ERP — Payroll Capster UI */
(() => {
  const el = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const monthEnd = month => {
    const [y,m] = month.split('-').map(Number);
    return `${y}-${String(m).padStart(2,'0')}-${String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')}`;
  };
  const escapeHtml = s => String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  let lastResult = null;
  let manualMonth = null;

  function todayMonth(){
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date());
  }

  async function loadEmployees(){
    const { data, error } = await db.from('karyawan').select('id,nama_karyawan,jabatan,aktif').ilike('jabatan','Capster').order('nama_karyawan');
    if(error) throw error;
    const select = el('payrollEmployee');
    select.innerHTML = '<option value="">Semua Capster</option>' + (data||[]).map(r=>`<option value="${r.id}">${escapeHtml(r.nama_karyawan)}${r.aktif===false?' · nonaktif':''}</option>`).join('');
  }

  function renderPending(p){
    const box = el('payrollPending');
    if(!p || !p.rows){ box.hidden = true; return; }
    box.hidden = false;
    el('pendingRows').textContent = p.rows;
    el('pendingServices').textContent = p.service;
    el('pendingShare').textContent = money(p.providerShare);
  }

  function renderCard(row, month){
    const s = row.summary || {};
    const daily = row.daily || [];
    const rows = daily.length ? daily.map(d=>`<tr><td>${escapeHtml(d.tanggal)}</td><td>${escapeHtml(d.cabang)}</td><td class="num">${Number(d.service||0)}</td><td class="num">${money(d.gajiHarian)}</td><td class="num">${money(d.bonusProduk)}</td></tr>`).join('') : '<tr><td colspan="5" class="payroll-empty">Tidak ada aktivitas pada bulan ini.</td></tr>';
    return `<article class="payroll-employee-card" data-employee-id="${row.employeeId}">
      <div class="payroll-card-head"><div class="payroll-person"><h3>${escapeHtml(row.namaKaryawan)}</h3><p>${escapeHtml(row.homeCabang)} · ${escapeHtml(row.jabatan)}${row.aktif?'':' · nonaktif'}</p></div><div class="payroll-net"><span>Gaji Bersih</span><strong>${money(s.gajiBersih)}</strong></div></div>
      <div class="payroll-table-wrap"><table class="payroll-table"><thead><tr><th>Tanggal</th><th>Cabang Kerja</th><th class="num">Service</th><th class="num">Gaji Kotor Harian</th><th class="num">Bonus Produk</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="payroll-summary">
        <div class="payroll-sum"><span>Gaji Kotor</span><strong>${money(s.gajiKotor)}</strong></div>
        <div class="payroll-sum"><span>Denda</span><strong>${money(s.denda)}</strong></div>
        <div class="payroll-sum"><span>Bonus Insentif</span><strong>${money(s.bonusInsentif)}</strong></div>
        <div class="payroll-sum"><span>Bonus KPI</span><strong>${money(s.bonusKpi)}</strong></div>
        <div class="payroll-sum"><span>Bonus Produk</span><strong>${money(s.bonusProduk)}</strong></div>
        <div class="payroll-sum is-net"><span>Gaji Bersih</span><strong>${money(s.gajiBersih)}</strong></div>
      </div>
      <div class="payroll-manual">
        <label><span>Bonus Insentif</span><input class="js-insentif" inputmode="numeric" value="${Number(s.bonusInsentif||0)}"></label>
        <label><span>Bonus KPI</span><input class="js-kpi" inputmode="numeric" value="${Number(s.bonusKpi||0)}"></label>
        <label><span>Catatan</span><input class="js-note" value="${escapeHtml(manualMonth?.byEmployee?.[String(row.employeeId)]?.note||'')}"></label>
        <button type="button" class="payroll-save">Simpan Bonus</button><p class="payroll-save-msg"></p>
      </div>
    </article>`;
  }

  function bindSave(month){
    document.querySelectorAll('.payroll-employee-card').forEach(card=>{
      const btn = card.querySelector('.payroll-save');
      btn?.addEventListener('click', async()=>{
        const msg = card.querySelector('.payroll-save-msg');
        try{
          btn.disabled = true; msg.className='payroll-save-msg'; msg.textContent='Menyimpan…';
          await PayrollManualAdjustmentStore.save({employeeId:Number(card.dataset.employeeId),periodMonth:month,bonusInsentif:Number(card.querySelector('.js-insentif').value||0),bonusKpi:Number(card.querySelector('.js-kpi').value||0),note:card.querySelector('.js-note').value});
          msg.className='payroll-save-msg ok'; msg.textContent='Tersimpan.';
          await loadPayroll(false);
        }catch(err){ msg.className='payroll-save-msg err'; msg.textContent=err?.message||'Gagal menyimpan.'; }
        finally{ btn.disabled=false; }
      });
    });
  }

  async function loadPayroll(showLoading=true){
    const month = el('payrollMonth').value || todayMonth();
    const employeeId = el('payrollEmployee').value || null;
    const start = `${month}-01`, end = monthEnd(month);
    if(showLoading){ el('payrollStatus').className='payroll-status'; el('payrollStatus').textContent='Memuat payroll…'; }
    try{
      manualMonth = await PayrollManualAdjustmentStore.loadMonth(month);
      const adjustments = PayrollManualAdjustmentStore.toEngineAdjustments(manualMonth);
      const result = await PayrollCapsterEngine.loadPeriod({start,end,employeeId,adjustments});
      lastResult = result;
      renderPending(result.pendingSummary);
      el('payrollList').innerHTML = result.payroll.length ? result.payroll.map(r=>renderCard(r,month)).join('') : '<div class="payroll-empty">Tidak ada payroll pada filter ini.</div>';
      bindSave(month);
      el('payrollStatus').className='payroll-status';
      el('payrollStatus').textContent = `${result.payroll.length} capster · ${start} s/d ${end} · Gaji Kotor ${money(result.totals.gajiKotor)} · Gaji Bersih ${money(result.totals.gajiBersih)}`;
    }catch(err){
      el('payrollStatus').className='payroll-status is-error'; el('payrollStatus').textContent=err?.message||'Gagal memuat payroll.';
      el('payrollList').innerHTML='';
    }
  }

  async function init(){
    if(!el('payrollMonth')) return;
    el('payrollMonth').value = todayMonth();
    try{ await loadEmployees(); }catch(err){ el('payrollStatus').className='payroll-status is-error'; el('payrollStatus').textContent=err?.message||'Gagal memuat capster.'; return; }
    el('payrollRefresh').addEventListener('click',()=>loadPayroll());
    el('payrollMonth').addEventListener('change',()=>loadPayroll());
    el('payrollEmployee').addEventListener('change',()=>loadPayroll());
    el('payrollPrint').addEventListener('click',()=>window.print());
    el('payrollPdf').addEventListener('click',()=>window.print());
    await loadPayroll();
  }

  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',init) : init();
})();
