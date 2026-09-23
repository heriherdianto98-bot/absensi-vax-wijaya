/* ERP VAX — deterministic Master Karyawan bootstrap.
   Scope: Master Karyawan only. No finance/payroll/absensi engine changes. */
(() => {
  'use strict';

  const VERSION = '20260923-final4';
  let started = false;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-mk-bootstrap-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', resolve, {once:true});
      existing.addEventListener('error', reject, {once:true});
      return;
    }

    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset.mkBootstrapSrc = src;
    s.addEventListener('load', () => {
      s.dataset.loaded = '1';
      resolve();
    }, {once:true});
    s.addEventListener('error', () => reject(new Error(`Gagal memuat ${src}`)), {once:true});
    document.head.appendChild(s);
  });

  async function waitForOwner(){
    if (window.OwnerAuth?.ready && window.OwnerAuth?.isOwnerRole?.(window.OwnerAuth?.profile?.role)) {
      return true;
    }

    return await new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        document.removeEventListener('erp:owner-only-ready', onReady);
        clearInterval(timer);
        clearTimeout(limit);
        resolve(value);
      };
      const onReady = () => finish(true);
      document.addEventListener('erp:owner-only-ready', onReady, {once:true});

      const timer = setInterval(() => {
        if (window.OwnerAuth?.ready && window.OwnerAuth?.isOwnerRole?.(window.OwnerAuth?.profile?.role)) {
          finish(true);
        }
      }, 100);

      const limit = setTimeout(() => finish(false), 10000);
    });
  }

  function exposeMasterHelpers(){
    const mk = window.MasterKaryawan;
    if (!mk) throw new Error('MasterKaryawan tidak tersedia setelah core dimuat.');

    mk.getEmployeeRows = () => [...document.querySelectorAll('#mkBody button[data-edit-id]')].map(button => {
      const tr = button.closest('tr');
      const td = tr?.querySelectorAll('td');
      return {
        id: Number(button.dataset.editId),
        nama: td?.[1]?.querySelector('.mk-name')?.textContent?.trim() || '',
        namaMaster: td?.[1]?.querySelector('.mk-name')?.textContent?.trim() || '',
        cabang: td?.[2]?.textContent?.trim() || '—'
      };
    });
  }

  async function boot(){
    if (started) return;
    started = true;

    const status = document.getElementById('mkLoadStatus');

    try{
      const ownerReady = await waitForOwner();
      if (!ownerReady) throw new Error('Sesi Owner belum siap.');

      await loadScript(`../js/modules/master-karyawan.js?v=${VERSION}`);

      if (!window.MasterKaryawan) {
        throw new Error('Core Master Karyawan tidak terekspos.');
      }

      await window.MasterKaryawan.init();
      exposeMasterHelpers();

      const additive = [
        'master-karyawan-identitas.js',
        'master-karyawan-masa-kerja.js',
        'master-karyawan-masa-kerja-ui.js',
        'master-karyawan-riwayat-manual.js',
        'master-karyawan-gaji-otomatis.js',
        'master-karyawan-kredensial-owner-ui.js'
      ];

      for (const file of additive) {
        await loadScript(`../js/modules/${file}?v=${VERSION}`);
        await wait(0);
      }

      document.dispatchEvent(new CustomEvent('erp:master-karyawan-ready'));
    }catch(err){
      console.error('Master Karyawan deterministic bootstrap gagal', err);
      if (status) {
        status.textContent = `Gagal memuat Master Karyawan: ${err?.message || err}`;
      }
      started = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();