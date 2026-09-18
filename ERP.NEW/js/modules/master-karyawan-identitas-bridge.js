/* Read-only presentation bridge. Does not modify Master Karyawan state or CRUD. */
(() => {
  if(typeof MasterKaryawan==='undefined') return;
  MasterKaryawan.getEmployeeRows = () => [...document.querySelectorAll('#mkBody button[data-edit-id]')].map(button => {
    const tr=button.closest('tr'); const td=tr?.querySelectorAll('td');
    return {id:Number(button.dataset.editId), nama:td?.[1]?.querySelector('.mk-name')?.textContent?.trim() || '', namaMaster:td?.[1]?.querySelector('.mk-name')?.textContent?.trim() || '', cabang:td?.[2]?.textContent?.trim() || '—'};
  });
})();