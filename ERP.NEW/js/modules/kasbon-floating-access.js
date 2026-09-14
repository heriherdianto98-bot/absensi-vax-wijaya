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
      emp.cabang_id = branchId;
      return await originalSubmitForm(...args);
    } finally {
      emp.cabang_id = originalBranchId;
    }
  };

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

  /* =====================================================
     UI ONLY — Quick month/year navigation for Kasbon popup
     - Does not alter filter source (#kasbonFilterStart/End)
     - Does not alter query/load/payroll/kasbon data logic
     - Adds direct month selection so historical periods such
       as Agustus 2026 can be opened without repeated arrows.
     ===================================================== */
  if(!M.__rangeQuickMonthUiV1){
    M.__rangeQuickMonthUiV1 = true;

    function ensureRangeQuickUi(){
      const head = document.querySelector("#kasbonRangePopup .kasbon-range-head");
      const monthLabel = document.getElementById("kasbonRangeMonth");
      if(!head || !monthLabel || document.getElementById("kasbonRangeQuickMonth")) return;

      const wrap = document.createElement("div");
      wrap.className = "kasbon-range-quick-selects";
      wrap.innerHTML = `
        <select id="kasbonRangeQuickMonth" aria-label="Pilih bulan kalender">
          ${M.MONTH_ID.map((name,i)=>`<option value="${i}">${name}</option>`).join("")}
        </select>
        <select id="kasbonRangeQuickYear" aria-label="Pilih tahun kalender"></select>
      `;
      monthLabel.replaceWith(wrap);

      const monthSel = wrap.querySelector("#kasbonRangeQuickMonth");
      const yearSel = wrap.querySelector("#kasbonRangeQuickYear");
      const thisYear = new Date().getFullYear();
      const minYear = Math.min(2024, thisYear - 2);
      const maxYear = Math.max(2028, thisYear + 2);
      for(let y=minYear;y<=maxYear;y++){
        const opt=document.createElement("option");
        opt.value=String(y);
        opt.textContent=String(y);
        yearSel.appendChild(opt);
      }

      const sync = () => {
        if(Number.isInteger(M._rangeViewMonth)) monthSel.value=String(M._rangeViewMonth);
        if(Number.isFinite(Number(M._rangeViewYear))) yearSel.value=String(M._rangeViewYear);
      };
      sync();

      [monthSel,yearSel].forEach(el=>{
        el.addEventListener("click",e=>e.stopPropagation());
        el.addEventListener("change",()=>{
          M._rangeViewMonth=Number(monthSel.value);
          M._rangeViewYear=Number(yearSel.value);
          M.renderRangeCalendar();
          sync();
        });
      });

      if(!document.getElementById("kasbonRangeQuickMonthStyle")){
        const style=document.createElement("style");
        style.id="kasbonRangeQuickMonthStyle";
        style.textContent=`
          .kasbon-range-quick-selects{display:flex;align-items:center;justify-content:center;gap:6px;min-width:172px}
          .kasbon-range-quick-selects select{height:34px;border:1px solid rgba(212,175,55,.42);border-radius:9px;background:#17150d;color:#f8e7a2;padding:0 8px;font:800 12px/1 'Source Sans 3',sans-serif;outline:none;cursor:pointer}
          .kasbon-range-quick-selects select:first-child{min-width:104px}
          .kasbon-range-quick-selects select:focus{border-color:#f2c230;box-shadow:0 0 0 2px rgba(242,194,48,.12)}
        `;
        document.head.appendChild(style);
      }
    }

    const originalOpenRangePopup = M.openRangePopup.bind(M);
    M.openRangePopup = function(...args){
      const result = originalOpenRangePopup(...args);
      ensureRangeQuickUi();
      const monthSel=document.getElementById("kasbonRangeQuickMonth");
      const yearSel=document.getElementById("kasbonRangeQuickYear");
      if(monthSel) monthSel.value=String(this._rangeViewMonth);
      if(yearSel) yearSel.value=String(this._rangeViewYear);
      return result;
    };

    const originalRenderRangeCalendar = M.renderRangeCalendar.bind(M);
    M.renderRangeCalendar = function(...args){
      const result=originalRenderRangeCalendar(...args);
      ensureRangeQuickUi();
      const monthSel=document.getElementById("kasbonRangeQuickMonth");
      const yearSel=document.getElementById("kasbonRangeQuickYear");
      if(monthSel) monthSel.value=String(this._rangeViewMonth);
      if(yearSel) yearSel.value=String(this._rangeViewYear);
      return result;
    };
  }
})();
