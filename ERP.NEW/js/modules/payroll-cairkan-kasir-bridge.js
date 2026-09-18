/* ERP VAX — isolated non-capster payout UI. LOCKED Payroll/Arus Kas engines untouched.
   Only the Owner-guarded database RPC can create an Arus Kas expense. */
(() => {
  'use strict';
  if (window.__vaxCashierPayoutBridgeV1) return;
  window.__vaxCashierPayoutBridgeV1 = true;
  const $ = id => document.getElementById(id);
  const rupiah = n => new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
  const escapeText = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const months = {Jan:1,Feb:2,Mar:3,Apr:4,Mei:5,Jun:6,Jul:8,Agu:8,Sep:9,Okt:10,Nov:11,Des:12};
  const monthNow = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date());
  let busy = false;
  let verification = null;
  const auth = () => typeof OwnerAuth !== 'undefined' ? OwnerAuth : null;
  const owner = () => {
    const a = auth();
    return Boolean(a?.ready && a?.session?.user?.id && a?.profile && a.isOwnerRole?.(a.profile.role) && a.isProfileActive?.(a.profile));
  };
  async function verifyOwner() {
    if (owner()) return true;
    const a = auth();
    if (!a?.validateOwnerSession) return false;
    if (!verification) verification = a.validateOwnerSession().then(result => Boolean(result?.ok)).catch(() => false).finally(() => {verification = null;});
    return verification;
  }
  function period() {
    const match = String($('payrollPeriodLabel')?.textContent || '').trim().match(/^(Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)\s+(\d{4})$/i);
    if (!match) return null;
    const label = Object.keys(months).find(k => k.toLowerCase() === match[1].toLowerCase());
    if (!label) return null;
    const value = `${match[2]}-${String(months[label]).padStart(2,'0')}`;
    return value <= monthNow() ? value : null;
  }
  function key(id, month) {return `CASHIER:${id}:${month}`;}
  function amount(card) {
    const n = Number(String(card.querySelector('.js-net-value')?.textContent || '').replace(/[^\d]/g,''));
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  function modal() {
    if ($('vaxPayoutModal')) return $('vaxPayoutModal');
    const style = document.createElement('style');
    style.textContent = `
      @keyframes vaxPayRedPulse {
        0%,100% { box-shadow:0 0 0 1px rgba(255,105,105,.45),0 0 12px rgba(235,38,49,.45); }
        50% { box-shadow:0 0 0 2px rgba(255,120,120,.85),0 0 27px rgba(255,47,61,.75); }
      }
      @keyframes vaxPayModalGlow {
        0%,100% { box-shadow:0 25px 90px rgba(0,0,0,.75),0 0 14px rgba(224,48,58,.19),0 0 0 1px rgba(225,174,66,.33);border-color:#9e713b; }
        50% { box-shadow:0 25px 90px rgba(0,0,0,.75),0 0 37px rgba(239,57,67,.48),0 0 0 1px rgba(255,98,98,.5);border-color:#f07867; }
      }
      .vax-pay-btn{background:linear-gradient(180deg,#c62832 0%,#89121e 100%)!important;border:1px solid #ff7979!important;color:#fff7f7!important;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer;animation:vaxPayRedPulse 1.45s ease-in-out infinite;transition:background .2s ease,filter .2s ease,transform .2s ease}
      .vax-pay-btn:hover:not(:disabled){background:linear-gradient(180deg,#e33840 0%,#aa1b2b 100%)!important;filter:brightness(1.12);transform:translateY(-1px)}
      .vax-pay-btn:focus-visible{outline:2px solid #ffe39c;outline-offset:3px}
      .vax-pay-btn:active:not(:disabled){transform:translateY(0)}
      .vax-pay-btn:disabled{background:#30333a!important;border-color:#62636b!important;color:#d0d0d2!important;box-shadow:none!important;animation:none!important;filter:none;transform:none;opacity:.8;cursor:not-allowed}
      .vax-pay-overlay[hidden]{display:none!important}
      .vax-pay-overlay{position:fixed;inset:0;z-index:2147483000;background:#000b;display:grid;place-items:center;padding:16px}
      .vax-pay-dialog{width:min(460px,100%);background:#151b24;border:1px solid #9e713b;border-radius:16px;padding:22px;color:#f3f2ee;animation:vaxPayModalGlow 1.65s ease-in-out infinite}
      .vax-pay-dialog h3{margin:0 0 12px;color:#f0cd72}
      .vax-pay-dialog p{line-height:1.55}
      .vax-pay-dialog label{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5}
      .vax-pay-dialog input{margin-top:4px}
      .vax-pay-actions{display:flex;gap:9px;justify-content:flex-end;margin-top:20px}
      .vax-pay-actions button{border-radius:9px;border:1px solid #7b6a45;padding:10px 15px;background:#252c34;color:#fff;cursor:pointer}
      .vax-pay-actions button.vax-pay-confirm{background:#d3a83d;color:#17140b;font-weight:800}
      .vax-pay-actions button:disabled{opacity:.45;cursor:not-allowed}
      .vax-pay-error{color:#ff9e9e;font-size:13px;white-space:pre-wrap}
      @media (prefers-reduced-motion:reduce){.vax-pay-btn,.vax-pay-dialog{animation:none!important}.vax-pay-btn{box-shadow:0 0 0 1px rgba(255,105,105,.45),0 0 12px rgba(235,38,49,.45)}}
    `;
    document.head.appendChild(style);
    const box = document.createElement('div');
    box.id = 'vaxPayoutModal';box.className = 'vax-pay-overlay';box.hidden = true;
    box.innerHTML = '<div class="vax-pay-dialog" role="dialog" aria-modal="true" aria-labelledby="vaxPayTitle"><h3 id="vaxPayTitle">Cairkan gaji non-capster</h3><p id="vaxPayInfo"></p><p>Pengeluaran akan dicatat satu kali ke <strong>Arus Kas · Pengeluaran Barber · Kas Besar</strong>. Fitur ini mencatat pembayaran yang sudah dilakukan, bukan transfer bank.</p><label><input id="vaxPayAgree" type="checkbox">Saya sudah membayar gaji ini, nominal sesuai, dan pembayaran yang sama belum dicatat di Arus Kas.</label><p id="vaxPayError" class="vax-pay-error" aria-live="polite"></p><div class="vax-pay-actions"><button type="button" id="vaxPayCancel">Batal</button><button type="button" id="vaxPayConfirm" class="vax-pay-confirm" disabled>Konfirmasi pencairan</button></div></div>';
    document.body.appendChild(box);
    $('vaxPayCancel').addEventListener('click', () => {if (!busy) box.hidden = true;});
    $('vaxPayAgree').addEventListener('change', e => {$('vaxPayConfirm').disabled = !e.target.checked || busy;});
    box.addEventListener('click', e => {if (e.target === box && !busy) box.hidden = true;});
    document.addEventListener('keydown', e => {if (e.key === 'Escape' && !busy) box.hidden = true;});
    return box;
  }
  async function checkStatus(card, id, month, job, btn) {
    if (!await verifyOwner()) {
      if (btn.isConnected) {btn.disabled = true;btn.textContent = 'Cairkan Gaji · Owner';btn.title = 'Menunggu autentikasi Owner.';}
      return;
    }
    const {data,error} = await db.from('arus_kas_v2_transactions').select('id,amount,tanggal').eq('source_type','PAYROLL_CASHIER_PAYOUT_V1').eq('source_key',key(id,month)).maybeSingle();
    if (error) throw error;
    if (!btn.isConnected || btn.dataset.month !== month) return;
    if (data) {btn.disabled = true;btn.textContent = 'Sudah dibayar';btn.title = `${rupiah(data.amount)} · ${data.tanggal} · Arus Kas ${data.id}`;return;}
    if (/backup|floating/i.test(job)) {btn.disabled = true;btn.textContent = 'Gaji harian via Cash Out';btn.title = 'Tidak boleh dicairkan ulang dari Payroll bulanan.';return;}
    const last = new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
    const end = `${month}-${String(last).padStart(2,'0')}`;
    const {data:rates,error:rateError} = await db.from('payroll_salary_master').select('employee_id').eq('employee_id',id).eq('pay_basis','MONTHLY').lte('effective_from',end).or(`effective_to.is.null,effective_to.gte.${end}`).limit(1);
    if (rateError) throw rateError;
    if (!btn.isConnected || btn.dataset.month !== month) return;
    if (!rates?.length) {btn.disabled = true;btn.textContent = 'Master bulanan belum ada';return;}
    btn.disabled = false;btn.textContent = 'Cairkan Gaji';
  }
  function mountCards() {
    const list = $('payrollList');
    if (!list) return;
    const month = period();
    if (!month) return;
    for (const card of list.querySelectorAll('.payroll-employee-card')) {
      const id = Number(card.dataset.employeeId);
      const name = card.querySelector('.payroll-person h3')?.textContent?.trim() || 'Karyawan';
      const job = card.querySelector('.payroll-person p')?.textContent || '';
      if (!id || /(^|[·\s])capster([\s·]|$)/i.test(job)) continue;
      let btn = card.querySelector('.vax-pay-btn');
      if (btn && btn.dataset.month === month) continue;
      if (btn) btn.remove();
      btn = document.createElement('button');btn.type = 'button';btn.className = 'vax-pay-btn';
      btn.textContent = 'Memeriksa pembayaran…';btn.disabled = true;btn.dataset.month = month;
      btn.addEventListener('click', () => openPayout(card,id,name,month));
      card.querySelector('.payroll-card-head')?.appendChild(btn);
      checkStatus(card,id,month,job,btn).catch(err => {if(btn.isConnected){btn.disabled = true;btn.textContent = 'Status tidak tersedia';btn.title = err?.message || 'Gagal cek Arus Kas';}});
    }
  }
  async function refreshAuthorization() {
    if (!await verifyOwner()) return;
    for (const btn of document.querySelectorAll('#payrollList .vax-pay-btn')) {
      if (btn.textContent !== 'Cairkan Gaji · Owner') continue;
      btn.remove();
    }
    mountCards();
  }
  async function openPayout(card,id,name,month) {
    if (busy || period() !== month) return;
    if (!await verifyOwner()) {alert('Sesi Owner belum terverifikasi. Login ulang sebagai Owner.');return;}
    const btn = card.querySelector('.vax-pay-btn');
    if (!btn || btn.disabled || !card.isConnected || period() !== month) return;
    const value = amount(card);
    if (!value) {alert('Nominal gaji bersih belum valid. Refresh Payroll dahulu.');return;}
    const box = modal();
    $('vaxPayInfo').innerHTML = `<strong>${escapeText(name)}</strong> · ${escapeText(month)}<br>Gaji bersih: <strong>${rupiah(value)}</strong>`;
    $('vaxPayAgree').checked = false;$('vaxPayError').textContent = '';$('vaxPayConfirm').disabled = true;box.hidden = false;
    $('vaxPayConfirm').onclick = async () => {
      if (busy || !$('vaxPayAgree').checked) return;
      if (!await verifyOwner()) {$('vaxPayError').textContent = 'Sesi Owner tidak valid. Login ulang sebelum mencairkan.';return;}
      if (period() !== month || !card.isConnected || amount(card) !== value) {$('vaxPayError').textContent = 'Payroll berubah. Tutup, refresh dan periksa nominal lagi.';return;}
      busy = true;$('vaxPayConfirm').disabled = true;$('vaxPayCancel').disabled = true;$('vaxPayError').textContent = 'Memproses transaksi…';
      try {
        const {data,error} = await db.rpc('erp_payroll_cashier_payout_v1',{p_employee_id:id,p_period_month:`${month}-01`,p_amount:value});
        if (error) throw error;
        if (!data || !['PAID','ALREADY_PAID'].includes(data.status) || Number(data.amount) !== value) throw Error('Status transaksi perlu pemeriksaan Owner.');
        box.hidden = true;
        if (btn.isConnected) {btn.disabled = true;btn.textContent = 'Sudah dibayar';btn.title = `${rupiah(data.amount)} · ${data.tanggal} · Arus Kas ${data.id}`;}
        alert(data.status === 'PAID' ? `Pembayaran ${rupiah(value)} tercatat di Arus Kas; saldo Kas Besar berkurang.` : 'Pembayaran sudah tercatat sebelumnya; tidak dibuat transaksi kedua.');
      } catch(err) {$('vaxPayError').textContent = err?.message || 'Pencairan gagal. Periksa Arus Kas sebelum mencoba ulang.';}
      finally {busy = false;$('vaxPayCancel').disabled = false;$('vaxPayConfirm').disabled = !$('vaxPayAgree').checked;}
    };
  }
  function init() {
    const list = $('payrollList');
    if (!list) return;
    modal();
    new MutationObserver(mountCards).observe(list,{childList:true});
    mountCards();
    document.addEventListener('erp:finance-ready',refreshAuthorization);
    document.addEventListener('erp:dashboard-ready',refreshAuthorization);
    document.addEventListener('erp:owner-only-ready',refreshAuthorization);
    if ($('payrollPeriodLabel')) new MutationObserver(mountCards).observe($('payrollPeriodLabel'),{childList:true});
    setTimeout(refreshAuthorization,1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();