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
     UI ONLY — Custom Periode langsung (Dari / Sampai)
     Mengganti popup kalender visual yang menyulitkan navigasi.
     Source of truth tetap input existing #kasbonFilterStart / End.
     Query, loadList, Supabase, Payroll, Arus Kas tidak diubah.
     ===================================================== */
  if(!M.__directCustomPeriodUiV1){
    M.__directCustomPeriodUiV1 = true;

    function installDirectPeriodUi(){
      const wrap=document.getElementById("kasbonRangeWrap");
      const start=document.getElementById("kasbonFilterStart");
      const end=document.getElementById("kasbonFilterEnd");
      if(!wrap || !start || !end || wrap.dataset.directPeriodUi==="1") return;
      wrap.dataset.directPeriodUi="1";

      const trigger=document.getElementById("kasbonRangeTrigger");
      const popup=document.getElementById("kasbonRangePopup");
      if(trigger) trigger.hidden=true;
      if(popup) popup.hidden=true;

      start.classList.remove("kasbon-date-sr");
      end.classList.remove("kasbon-date-sr");
      start.removeAttribute("tabindex");
      end.removeAttribute("tabindex");
      start.removeAttribute("aria-hidden");
      end.removeAttribute("aria-hidden");

      const box=document.createElement("div");
      box.className="kasbon-direct-period";
      box.innerHTML=`
        <label class="kasbon-direct-period-item">
          <small>DARI</small>
        </label>
        <span class="kasbon-direct-period-sep">→</span>
        <label class="kasbon-direct-period-item">
          <small>SAMPAI</small>
        </label>
      `;

      const labels=box.querySelectorAll(".kasbon-direct-period-item");
      labels[0].appendChild(start);
      labels[1].appendChild(end);
      wrap.appendChild(box);

      const sync=()=>{
        if(start.value && end.value && end.value < start.value) end.value=start.value;
        M.syncGlobalHeaderContext?.();
      };
      start.addEventListener("change",sync);
      end.addEventListener("change",sync);

      if(!document.getElementById("kasbonDirectPeriodStyle")){
        const style=document.createElement("style");
        style.id="kasbonDirectPeriodStyle";
        style.textContent=`
          #kasbonRangeWrap{min-width:430px}
          #kasbonRangeWrap>span{display:block;margin-bottom:6px}
          .kasbon-direct-period{display:grid;grid-template-columns:minmax(160px,1fr) auto minmax(160px,1fr);align-items:end;gap:10px}
          .kasbon-direct-period-item{display:flex;flex-direction:column;gap:5px;min-width:0}
          .kasbon-direct-period-item small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#d4af37}
          .kasbon-direct-period-item input[type="date"]{display:block!important;width:100%!important;height:42px!important;box-sizing:border-box;border:1px solid rgba(212,175,55,.35)!important;border-radius:10px!important;background:#121417!important;color:#f5f5f5!important;padding:0 12px!important;font:800 13px/1 'Source Sans 3',sans-serif!important;opacity:1!important;position:static!important;clip:auto!important;clip-path:none!important;overflow:visible!important}
          .kasbon-direct-period-item input[type="date"]:focus{outline:none!important;border-color:#f2c230!important;box-shadow:0 0 0 2px rgba(242,194,48,.12)!important}
          .kasbon-direct-period-item input[type="date"]::-webkit-calendar-picker-indicator{cursor:pointer;filter:invert(82%) sepia(67%) saturate(591%) hue-rotate(351deg) brightness(98%)}
          .kasbon-direct-period-sep{padding-bottom:11px;color:#d4af37;font-size:18px;font-weight:900}
          @media(max-width:900px){#kasbonRangeWrap{min-width:100%}.kasbon-direct-period{grid-template-columns:1fr}.kasbon-direct-period-sep{display:none}}
        `;
        document.head.appendChild(style);
      }
    }

    const originalMountUi=M.mountUi.bind(M);
    M.mountUi=async function(...args){
      const result=await originalMountUi(...args);
      installDirectPeriodUi();
      return result;
    };
  }
})();
