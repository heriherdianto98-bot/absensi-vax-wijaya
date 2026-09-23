/* Owner-only email visibility for Master Karyawan. Additive UI; canonical employee CRUD stays untouched. */
(() => {
  'use strict';
  const table = document.querySelector('.master-karyawan-page .mk-table');
  const body = document.getElementById('mkBody');
  if (!table || !body || typeof db === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    .mk-email-cell{min-width:210px;max-width:280px}
    .mk-email-main{display:block;color:#f4f6f8;font-size:14px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mk-email-state{display:inline-flex;align-items:center;margin-top:4px;padding:2px 7px;border-radius:999px;border:1px solid #5b4a1d;background:#211d13;color:#d7bd79;font-size:11px;font-weight:800}
    .mk-email-state.is-verified{border-color:#285f43;background:#10281d;color:#8ee0ad}
    .mk-email-empty{color:#7f8a94;font-size:13px;font-weight:700}
    @media(max-width:900px){.mk-email-cell{min-width:190px}}
  `;
  document.head.appendChild(style);

  let emailMap = new Map();
  let loading = false;

  function ensureHeader(){
    const row = table.querySelector('thead tr');
    if (!row || row.querySelector('[data-mk-email-head]')) return;
    const action = row.lastElementChild;
    const th = document.createElement('th');
    th.dataset.mkEmailHead = '1';
    th.textContent = 'Email Login';
    row.insertBefore(th, action || null);
  }

  function decorateRows(){
    ensureHeader();
    body.querySelectorAll('tr').forEach(tr => {
      const edit = tr.querySelector('button[data-edit-id]');
      if (!edit) return;
      const id = Number(edit.dataset.editId || 0);
      if (!id) return;
      let cell = tr.querySelector('[data-mk-email-cell]');
      if (!cell){
        cell = document.createElement('td');
        cell.dataset.mkEmailCell = '1';
        cell.className = 'mk-email-cell';
        const actionCell = edit.closest('td');
        tr.insertBefore(cell, actionCell || null);
      }
      const info = emailMap.get(id);
      if (!info?.email){
        cell.innerHTML = '<span class="mk-email-empty">Belum diisi</span>';
        return;
      }
      const email = String(info.email);
      cell.textContent = '';
      const main = document.createElement('span');
      main.className = 'mk-email-main';
      main.textContent = email;
      main.title = email;
      const badge = document.createElement('span');
      badge.className = 'mk-email-state' + (info.email_verified ? ' is-verified' : '');
      badge.textContent = info.email_verified ? 'Terverifikasi' : 'Belum diverifikasi';
      cell.append(main, badge);
    });
  }

  async function loadEmails(){
    if (loading) return;
    loading = true;
    try {
      const {data, error} = await db.rpc('karyawan_credential_owner_list');
      if (error || data?.ok !== true) {
        if (data?.reason === 'OWNER_ONLY') return;
        throw error || new Error(data?.reason || 'EMAIL_LIST_FAILED');
      }
      emailMap = new Map((data.karyawan || []).map(item => [
        Number(item.id),
        {email: item.email || '', email_verified: item.email_verified === true}
      ]));
      decorateRows();
    } catch (error) {
      console.error('Master Karyawan email login gagal dimuat', error?.message || error);
    } finally {
      loading = false;
    }
  }

  const observer = new MutationObserver(decorateRows);
  observer.observe(body, {childList:true, subtree:true});

  document.getElementById('mkRefresh')?.addEventListener('click', () => {
    window.setTimeout(loadEmails, 250);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadEmails();
  });

  ensureHeader();
  decorateRows();
  loadEmails();
})();