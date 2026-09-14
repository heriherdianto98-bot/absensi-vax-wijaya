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
     UI ONLY — Dashboard-style Custom Tanggal for Kasbon
     Source of truth remains #kasbonFilterStart / End.
     Query/load/Supabase/Payroll/Arus Kas are untouched.
     ===================================================== */
  if(!M.__dashboardCustomPeriodUiV1){
    M.__dashboardCustomPeriodUiV1 = true;

    const MONTHS=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const MONTHS_SHORT=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    let viewYear=2026;
    let viewMonth=8;
    let draftStart="";
    let draftEnd="";
    let mode="range";

    function pad(n){return String(n).padStart(2,"0");}
    function iso(y,m,d){return `${y}-${pad(m+1)}-${pad(d)}`;}
    function parseIso(v){
      const p=String(v||"").slice(0,10).split("-").map(Number);
      return p.length===3&&p.every(Number.isFinite)?{y:p[0],m:p[1]-1,d:p[2]}:null;
    }
    function fmt(v){
      const p=parseIso(v); if(!p) return "—";
      return `${pad(p.d)} ${MONTHS_SHORT[p.m]} ${p.y}`;
    }
    function daysInMonth(y,m){return new Date(y,m+1,0).getDate();}
    function mondayIndex(jsDay){return (jsDay+6)%7;}

    function ensureModal(){
      if(document.getElementById("kasbonDashRangeModal")) return;
      const modal=document.createElement("div");
      modal.id="kasbonDashRangeModal";
      modal.className="kasbon-dash-cal";
      modal.hidden=true;
      modal.innerHTML=`
        <div class="kasbon-dash-cal-backdrop" data-kdc-close="1"></div>
        <div class="kasbon-dash-cal-panel" role="dialog" aria-modal="true" aria-label="Custom Tanggal">
          <div class="kasbon-dash-cal-title"><strong>Custom Tanggal</strong><button type="button" data-kdc-close="1" aria-label="Tutup">×</button></div>
          <div class="kasbon-dash-cal-tabs">
            <button type="button" id="kdcModeMonth">Pilih Bulan</button>
            <button type="button" id="kdcModeRange" class="is-active">Rentang Tanggal</button>
          </div>
          <div class="kasbon-dash-cal-nav">
            <button type="button" id="kdcPrev">‹</button>
            <strong id="kdcMonthLabel">—</strong>
            <button type="button" id="kdcNext">›</button>
          </div>
          <div id="kdcRangeView">
            <div class="kasbon-dash-cal-week"><span>SEN</span><span>SEL</span><span>RAB</span><span>KAM</span><span>JUM</span><span>SAB</span><span>MIN</span></div>
            <div class="kasbon-dash-cal-grid" id="kdcGrid"></div>
          </div>
          <div id="kdcMonthView" class="kasbon-dash-month-grid" hidden></div>
          <div class="kasbon-dash-cal-summary" id="kdcSummary">—</div>
          <div class="kasbon-dash-cal-actions"><button type="button" id="kdcApply">Terapkan</button><button type="button" data-kdc-close="1">Batal</button></div>
        </div>`;
      document.body.appendChild(modal);

      const style=document.createElement("style");
      style.id="kasbonDashRangeStyle";
      style.textContent=`
        #kasbonRangeWrap .kasbon-direct-period{display:none!important}
        #kasbonRangeWrap{min-width:0!important}
        #kasbonRangeTrigger{display:flex!important;width:100%!important}
        #kasbonRangePopup{display:none!important}
        #kasbonFilterStart,#kasbonFilterEnd{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important}
        .kasbon-dash-cal[hidden]{display:none!important}.kasbon-dash-cal{position:fixed;inset:0;z-index:99999;display:grid;place-items:center}
        .kasbon-dash-cal-backdrop{position:absolute;inset:0;background:rgba(1,5,10,.72);backdrop-filter:blur(4px)}
        .kasbon-dash-cal-panel{position:relative;width:min(440px,calc(100vw - 28px));border:1px solid rgba(212,175,55,.72);border-radius:17px;background:#111820;box-shadow:0 28px 80px rgba(0,0,0,.55);padding:18px;color:#eef2f7;font-family:'Source Sans 3',sans-serif}
        .kasbon-dash-cal-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;font-size:18px}.kasbon-dash-cal-title button{width:36px;height:36px;border:1px solid #263543;border-radius:9px;background:#17212b;color:#fff;font-size:24px;cursor:pointer}
        .kasbon-dash-cal-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.kasbon-dash-cal-tabs button{height:40px;border:1px solid #293745;border-radius:9px;background:#10161d;color:#cfd7df;font-weight:800;cursor:pointer}.kasbon-dash-cal-tabs button.is-active{border-color:#b8952b;background:rgba(184,149,43,.16);color:#f1c84a}
        .kasbon-dash-cal-nav{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;margin:8px 0 12px}.kasbon-dash-cal-nav button{height:38px;border:1px solid rgba(212,175,55,.35);border-radius:9px;background:#17202a;color:#f1c84a;font-size:25px;cursor:pointer}.kasbon-dash-cal-nav strong{text-align:center;font-size:16px}
        .kasbon-dash-cal-week,.kasbon-dash-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.kasbon-dash-cal-week{margin-bottom:6px}.kasbon-dash-cal-week span{text-align:center;color:#9aa8b5;font-size:10px;font-weight:900}
        .kasbon-dash-cal-grid button{height:41px;border:1px solid transparent;border-radius:9px;background:#0e151c;color:#e7edf3;font-weight:800;cursor:pointer}.kasbon-dash-cal-grid button:hover{border-color:rgba(212,175,55,.55)}.kasbon-dash-cal-grid button.is-in{background:rgba(212,175,55,.18)}.kasbon-dash-cal-grid button.is-edge{background:#f2c230;color:#101820}.kasbon-dash-cal-grid .is-empty{visibility:hidden}
        .kasbon-dash-month-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kasbon-dash-month-grid button{height:48px;border:1px solid #283643;border-radius:10px;background:#0e151c;color:#e7edf3;font-weight:800;cursor:pointer}.kasbon-dash-month-grid button:hover,.kasbon-dash-month-grid button.is-active{border-color:#d4af37;background:rgba(212,175,55,.16);color:#f2c230}
        .kasbon-dash-cal-summary{margin-top:13px;border:1px solid #2a3947;border-radius:10px;background:#0d141b;padding:11px;text-align:center;color:#f2c230;font-weight:900}
        .kasbon-dash-cal-actions{display:flex;gap:9px;margin-top:12px}.kasbon-dash-cal-actions button{height:42px;padding:0 18px;border:1px solid #2a3947;border-radius:10px;background:#17212b;color:#e7edf3;font-weight:900;cursor:pointer}.kasbon-dash-cal-actions #kdcApply{background:#f2c230;color:#111820;border-color:#f2c230}
      `;
      document.head.appendChild(style);

      modal.addEventListener("click",e=>{
        if(e.target.closest("[data-kdc-close]")){ closeModal(); return; }
        if(e.target.closest("#kdcPrev")){ shift(-1); return; }
        if(e.target.closest("#kdcNext")){ shift(1); return; }
        if(e.target.closest("#kdcModeRange")){ setMode("range"); return; }
        if(e.target.closest("#kdcModeMonth")){ setMode("month"); return; }
        if(e.target.closest("#kdcApply")){ applySelection(); return; }
        const day=e.target.closest("[data-kdc-day]"); if(day){ pickDay(day.dataset.kdcDay); return; }
        const mon=e.target.closest("[data-kdc-month]"); if(mon){ pickMonth(Number(mon.dataset.kdcMonth)); return; }
      });
    }

    function cleanupOldDirectUi(){
      document.querySelectorAll(".kasbon-direct-period").forEach(el=>el.remove());
      document.getElementById("kasbonDirectPeriodStyle")?.remove();
      const start=document.getElementById("kasbonFilterStart"), end=document.getElementById("kasbonFilterEnd"), trigger=document.getElementById("kasbonRangeTrigger"), popup=document.getElementById("kasbonRangePopup");
      [start,end].forEach(el=>{ if(!el)return; el.classList.add("kasbon-date-sr"); el.setAttribute("tabindex","-1"); el.setAttribute("aria-hidden","true"); });
      if(trigger){ trigger.hidden=false; trigger.setAttribute("aria-expanded","false"); }
      if(popup) popup.hidden=true;
      document.getElementById("kasbonRangeWrap")?.removeAttribute("data-direct-period-ui");
    }

    function render(){
      ensureModal(); cleanupOldDirectUi();
      document.getElementById("kdcMonthLabel").textContent=`${MONTHS[viewMonth]} ${viewYear}`;
      const rangeView=document.getElementById("kdcRangeView"), monthView=document.getElementById("kdcMonthView");
      rangeView.hidden=mode!=="range"; monthView.hidden=mode!=="month";
      document.getElementById("kdcModeRange").classList.toggle("is-active",mode==="range");
      document.getElementById("kdcModeMonth").classList.toggle("is-active",mode==="month");
      if(mode==="range"){
        const grid=document.getElementById("kdcGrid"); grid.innerHTML="";
        const lead=mondayIndex(new Date(viewYear,viewMonth,1).getDay());
        for(let i=0;i<lead;i++){const x=document.createElement("span");x.className="is-empty";grid.appendChild(x);}
        for(let d=1;d<=daysInMonth(viewYear,viewMonth);d++){
          const v=iso(viewYear,viewMonth,d), b=document.createElement("button"); b.type="button"; b.dataset.kdcDay=v; b.textContent=String(d);
          if(draftStart&&draftEnd&&v>=draftStart&&v<=draftEnd)b.classList.add("is-in");
          if(v===draftStart||v===draftEnd)b.classList.add("is-edge");
          grid.appendChild(b);
        }
      }else{
        const g=document.getElementById("kdcMonthView");g.innerHTML="";
        MONTHS.forEach((n,i)=>{const b=document.createElement("button");b.type="button";b.dataset.kdcMonth=String(i);b.textContent=n;if(i===viewMonth)b.classList.add("is-active");g.appendChild(b);});
      }
      document.getElementById("kdcSummary").textContent=draftStart?(draftEnd?`${fmt(draftStart)} — ${fmt(draftEnd)}`:`${fmt(draftStart)} — pilih tanggal akhir`):"Pilih periode";
    }

    function openModal(){
      ensureModal(); cleanupOldDirectUi();
      const start=document.getElementById("kasbonFilterStart")?.value||"", end=document.getElementById("kasbonFilterEnd")?.value||"";
      draftStart=start; draftEnd=end;
      const p=parseIso(start)||parseIso(end)||{y:new Date().getFullYear(),m:new Date().getMonth(),d:1}; viewYear=p.y; viewMonth=p.m; mode="range";
      M._rangeOpen=false;
      const modal=document.getElementById("kasbonDashRangeModal"); modal.hidden=false; render();
      document.getElementById("kasbonRangeTrigger")?.setAttribute("aria-expanded","true");
    }
    function closeModal(){const m=document.getElementById("kasbonDashRangeModal");if(m)m.hidden=true;document.getElementById("kasbonRangeTrigger")?.setAttribute("aria-expanded","false");}
    function shift(delta){let m=viewMonth+delta,y=viewYear;if(m<0){m=11;y--;}if(m>11){m=0;y++;}viewMonth=m;viewYear=y;render();}
    function setMode(next){mode=next;render();}
    function pickDay(v){if(!draftStart||draftEnd){draftStart=v;draftEnd="";}else{draftEnd=v;if(draftEnd<draftStart){const t=draftStart;draftStart=draftEnd;draftEnd=t;}}render();}
    function pickMonth(m){viewMonth=m;draftStart=iso(viewYear,m,1);draftEnd=iso(viewYear,m,daysInMonth(viewYear,m));render();}
    function applySelection(){
      if(!draftStart) return;
      if(!draftEnd) draftEnd=draftStart;
      const start=document.getElementById("kasbonFilterStart"), end=document.getElementById("kasbonFilterEnd");
      if(start) start.value=draftStart; if(end) end.value=draftEnd;
      M.syncRangeLabel?.(); M.syncGlobalHeaderContext?.(); closeModal();
    }

    const originalMountUi=M.mountUi.bind(M);
    M.mountUi=async function(...args){const result=await originalMountUi(...args);cleanupOldDirectUi();ensureModal();return result;};
    M.toggleRangePopup=function(){const modal=document.getElementById("kasbonDashRangeModal");if(modal&&!modal.hidden)closeModal();else openModal();};
    M.openRangePopup=openModal;
    M.closeRangePopup=closeModal;
  }
})();
