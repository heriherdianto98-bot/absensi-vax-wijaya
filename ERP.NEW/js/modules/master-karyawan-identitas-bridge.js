/* Read-only presentation bridge. No changes to canonical Master Karyawan state/CRUD. */
(() => {
  if(typeof MasterKaryawan==='undefined') return;
  MasterKaryawan.getEmployeeRows = () => [...document.querySelectorAll('#mkBody button[data-edit-id]')].map(button => {
    const tr=button.closest('tr'); const td=tr?.querySelectorAll('td');
    return {id:Number(button.dataset.editId), nama:td?.[1]?.querySelector('.mk-name')?.textContent?.trim() || '', namaMaster:td?.[1]?.querySelector('.mk-name')?.textContent?.trim() || '', cabang:td?.[2]?.textContent?.trim() || '—'};
  });
  window.MasterKaryawan = MasterKaryawan;
  if(typeof OwnerAuth!=='undefined') window.OwnerAuth = OwnerAuth;
  // Optional additive profile panel; loading this file must not affect the locked CRUD engine.
  const history = document.createElement('script');
  history.src = '../js/modules/master-karyawan-masa-kerja.js?v=20260918-task2';
  history.defer = true;
  document.head.appendChild(history);
})();