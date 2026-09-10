/*
=========================================================
VAX ERP — Kasbon Floating Access Bridge V1
=========================================================
Scope: Kasbon only.
- Floating employees may request Kasbon from any operational branch.
- Transaction branch remains the operational branch selected by SPV/Owner.
- Employee identity/ID remains the original Master Karyawan ID.
- Payment method is NOT changed here; existing Kasbon payment flow decides it.
- No Payroll / Arus Kas engine changes.
=========================================================
*/
(() => {
  if (typeof KasbonModule === "undefined") return;
  const M = KasbonModule;
  if (M.__floatingAccessV1) return;
  M.__floatingAccessV1 = true;

  function floatingBranchIds(){
    const ids = new Set();
    (M.karyawanList || []).forEach((k) => {
      const jabatan = String(k?.jabatan || "").toLowerCase();
      if(jabatan.includes("floating")) ids.add(Number(k.cabang_id));
    });
    return ids;
  }

  function isFloatingEmployee(emp){
    if(!emp) return false;
    const jabatan = String(emp.jabatan || "").toLowerCase();
    if(jabatan.includes("floating")) return true;
    return floatingBranchIds().has(Number(emp.cabang_id));
  }

  function employeeAllowedForBranch(emp, branchId){
    return Number(emp?.cabang_id) === Number(branchId) || isFloatingEmployee(emp);
  }

  const originalFillFormKaryawan = M.fillFormKaryawan.bind(M);
  M.fillFormKaryawan = function(){
    const el = document.getElementById("kasbonFormKaryawan");
    const cabangId = document.getElementById("kasbonFormCabang")?.value || "";
    if(!el || !cabangId) return originalFillFormKaryawan();

    const list = (this.karyawanList || []).filter((k) => employeeAllowedForBranch(k, cabangId));
    el.innerHTML = `<option value="">— Pilih karyawan —</option>` + list.map((k) => {
      const suffix = isFloatingEmployee(k) ? " · FLOATING" : "";
      return `<option value="${k.id}">${this.escapeHtml(k.nama_karyawan || ("#" + k.id))}${suffix}</option>`;
    }).join("");
    const jabatan = document.getElementById("kasbonFormJabatan");
    if(jabatan) jabatan.value = "";
    this.syncCselectLabel?.(el);
  };

  const originalFillFilterKaryawan = M.fillFilterKaryawan.bind(M);
  M.fillFilterKaryawan = function(){
    const el = document.getElementById("kasbonFilterKaryawan");
    const cabangId = document.getElementById("kasbonFilterCabang")?.value || "";
    if(!el || !cabangId) return originalFillFilterKaryawan();

    const cur = el.value;
    const list = (this.karyawanList || []).filter((k) => employeeAllowedForBranch(k, cabangId));
    el.innerHTML = `<option value="">Semua Karyawan</option>` + list.map((k) => {
      const suffix = isFloatingEmployee(k) ? " · FLOATING" : "";
      return `<option value="${k.id}">${this.escapeHtml(k.nama_karyawan || ("#" + k.id))}${suffix}</option>`;
    }).join("");
    if(cur && list.some((k) => String(k.id) === String(cur))) el.value = cur;
    this.syncCselectLabel?.(el);
  };

  const originalOnEmployeeSelected = M.onEmployeeSelected.bind(M);
  M.onEmployeeSelected = async function(...args){
    const empId = document.getElementById("kasbonFormKaryawan")?.value;
    const branchId = Number(document.getElementById("kasbonFormCabang")?.value || 0);
    const emp = (this.karyawanList || []).find((k) => Number(k.id) === Number(empId));
    if(!emp || !branchId || !isFloatingEmployee(emp)) return originalOnEmployeeSelected(...args);

    const originalBranchId = emp.cabang_id;
    try{
      // Compatibility shim for existing branch guard only.
      // Snapshot/identity stays on the same employee; transaction branch is selected operational branch.
      emp.cabang_id = branchId;
      return await originalOnEmployeeSelected(...args);
    } finally {
      emp.cabang_id = originalBranchId;
    }
  };

  const originalSubmitForm = M.submitForm.bind(M);
  M.submitForm = async function(...args){
    const empId = Number(document.getElementById("kasbonFormKaryawan")?.value || 0);
    const branchId = Number(document.getElementById("kasbonFormCabang")?.value || 0);
    const emp = (this.karyawanList || []).find((k) => Number(k.id) === empId);
    if(!emp || !branchId || !isFloatingEmployee(emp)) return originalSubmitForm(...args);

    const originalBranchId = emp.cabang_id;
    try{
      // Pass existing branch validation without changing Master Karyawan.
      emp.cabang_id = branchId;
      return await originalSubmitForm(...args);
    } finally {
      emp.cabang_id = originalBranchId;
    }
  };

  // UI text only: keep the existing disbursement logic untouched, but replace the stale native-confirm copy.
  if(typeof M.disburse === "function" && !M.__disburseConfirmCopyV1){
    M.__disburseConfirmCopyV1 = true;
    const originalDisburse = M.disburse.bind(M);
    M.disburse = async function(...args){
      const nativeConfirm = window.confirm;
      window.confirm = (message) => {
        const text = String(message || "");
        if(text.includes("Cairkan kasbon ini dan set status AKTIF?")){
          return nativeConfirm("Cairkan kasbon ini dan set status AKTIF?\nArus Kas akan mencatat pencairan Kasbon secara otomatis.");
        }
        return nativeConfirm(message);
      };
      try{
        return await originalDisburse(...args);
      } finally {
        window.confirm = nativeConfirm;
      }
    };
  }
})();
