/* Read-only presentation bridge. No changes to canonical Master Karyawan state/CRUD. */
(() => {
  if(typeof MasterKaryawan==='undefined') return;
  MasterKaryawan.getEmployeeRows = () => [...document.querySelectorAll('#mkBody button[data-edit-id]')].map(button => {
    const tr=button.closest('tr'); const td=tr?.querySelectorAll('td');
    return {id:Number(button.dataset.editId), nama:td?.[1]?.querySelector('.mk-name')?.textContent?.trim() || '', namaMaster:td?.[1]?.querySelector('.mk-name')?.textContent?.trim() || '', cabang:td?.[2]?.textContent?.trim() || '—'};
  });
  window.MasterKaryawan = MasterKaryawan;
  if(typeof OwnerAuth!=='undefined') window.OwnerAuth = OwnerAuth;
  // Task 2 additive panels. All original employee/attendance/payroll engines are untouched.
  const history = document.createElement('script');
  history.src = '../js/modules/master-karyawan-masa-kerja.js?v=20260918-task2';
  history.defer = true;
  history.addEventListener('load', () => {
    const ui = document.createElement('script');
    ui.src = '../js/modules/master-karyawan-masa-kerja-ui.js?v=20260918-gold-rp1';
    ui.defer = true;
    document.head.appendChild(ui);
    const manual = document.createElement('script');
    manual.src = '../js/modules/master-karyawan-riwayat-manual.js?v=20260918-baseline1';
    manual.defer = true;
    document.head.appendChild(manual);
  }, {once:true});
  document.head.appendChild(history);
})();