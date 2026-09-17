/* Master Cabang / target popup: branch navigator + isolated non-writing atomic-save test. */
"use strict";
(() => {
  const modal = document.getElementById("modalTargetBulanan");
  const periodRow = modal?.querySelector(".target-periode-row");
  const list = document.getElementById("targetListWrapper");
  if (!modal || !periodRow || !list || document.getElementById("targetCabangNav")) return;

  const style = document.createElement("style");
  style.textContent = `
    #modalTargetBulanan .target-periode-row{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr) minmax(125px,.56fr);align-items:end;gap:14px}
    #modalTargetBulanan .target-periode-row>.form-group{min-width:0}
    #modalTargetBulanan #targetCabangNav{height:49px;width:100%;min-width:0;border:1px solid #536276;border-radius:11px;padding:0 13px;background:#202b39;color:#fff;font-size:17px;font-weight:900;box-shadow:inset 0 2px 5px rgba(0,0,0,.22)}
    #modalTargetBulanan #targetCabangNav:focus-visible{outline:2px solid rgba(213,164,29,.55);outline-offset:1px}
    #modalTargetBulanan .target-row.target-nav-current{outline:2px solid rgba(213,164,29,.85);outline-offset:-2px;background:rgba(213,164,29,.09)}
    #modalTargetBulanan #btnTestDualTargetSave{font-size:12px;font-weight:800;border:1px solid #b58b34;background:#24303e;color:#f4d483;border-radius:8px;cursor:pointer;padding:8px 10px}
    #modalTargetBulanan #btnTestDualTargetSave:disabled{opacity:.55;cursor:wait}
    #modalTargetBulanan #dualTargetTestStatus{display:block;margin:3px 22px 0;font-size:12px;font-weight:700;color:#e4b338}
    #modalTargetBulanan #dualTargetTestStatus.is-error{color:#ff9393}
    @media(max-width:640px){#modalTargetBulanan .target-periode-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}#modalTargetBulanan .target-cabang-nav-field{grid-column:1/-1}#modalTargetBulanan #targetCabangNav{height:45px;font-size:15px}}
  `;
  document.head.appendChild(style);

  const field = document.createElement("div");
  field.className = "form-group target-cabang-nav-field";
  const label = document.createElement("label");
  label.htmlFor = "targetCabangNav";
  label.textContent = "Cabang";
  const select = document.createElement("select");
  select.id = "targetCabangNav";
  select.setAttribute("aria-label", "Navigasi cabang pada daftar target");
  select.appendChild(new Option("Semua Cabang", ""));
  field.append(label, select);
  periodRow.prepend(field);

  function rows(){ return [...list.querySelectorAll(".target-row")]; }
  function syncOptions(){
    const current = select.value;
    const entries = rows().map(row => {
      const input = row.querySelector(".input-target-cabang");
      const name = row.querySelector(".target-nama strong")?.textContent?.trim();
      const code = row.querySelector(".target-nama small")?.textContent?.trim();
      return input?.dataset.cabangId && name ? { id: input.dataset.cabangId, title: code && code !== "-" ? `${code} — ${name}` : name } : null;
    }).filter(Boolean);
    select.replaceChildren(new Option("Semua Cabang", ""), ...entries.map(entry => new Option(entry.title, entry.id)));
    select.value = entries.some(entry => entry.id === current) ? current : "";
    if(!entries.some(entry => entry.id === current)) rows().forEach(row => row.classList.remove("target-nav-current"));
  }
  function navigate(){
    const target = rows().find(row => row.querySelector(".input-target-cabang")?.dataset.cabangId === select.value);
    rows().forEach(row => row.classList.toggle("target-nav-current", row === target));
    if(target){
      list.scrollTop += target.getBoundingClientRect().top - list.getBoundingClientRect().top - 9;
    } else list.scrollTop = 0;
  }
  select.addEventListener("change", navigate);
  const observer = new MutationObserver(records => {
    if(records.some(record => record.type === "childList" && [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.classList?.contains("target-row") || node.querySelector?.(".target-row"))))) syncOptions();
  });
  observer.observe(list, {childList:true});
  syncOptions();

  // Test button uses a dedicated Owner-only RPC that writes/reads BOTH target tables
  // inside a rolled-back subtransaction. It never saves the popup draft or production targets.
  const footer = modal.querySelector(".modal-footer");
  const saveButton = document.getElementById("btnSimpanSemuaTarget");
  if (footer && saveButton && !document.getElementById("btnTestDualTargetSave")) {
    const testButton = document.createElement("button");
    testButton.id = "btnTestDualTargetSave";
    testButton.type = "button";
    testButton.textContent = "Uji Simpan Gabungan";
    testButton.title = "Menguji kedua tabel dengan rollback otomatis. Tidak mengubah target atau draft.";
    footer.insertBefore(testButton, saveButton);
    const status = document.createElement("span");
    status.id = "dualTargetTestStatus";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    footer.before(status);
    testButton.addEventListener("click", async () => {
      if (typeof OwnerAuth === "undefined" || !OwnerAuth.isOwnerRole(OwnerAuth.profile?.role)) {
        status.classList.add("is-error");
        status.textContent = "Hanya Owner yang boleh menguji penyimpanan target.";
        return;
      }
      const client = typeof db !== "undefined" ? db : (typeof supabaseClient !== "undefined" ? supabaseClient : null);
      if (!client?.rpc) {
        status.classList.add("is-error");
        status.textContent = "Koneksi database belum siap.";
        return;
      }
      testButton.disabled = true;
      status.classList.remove("is-error");
      status.textContent = "Menguji dua target dan rollback tanpa mengubah data…";
      try {
        const { data, error } = await client.rpc("test_cabang_monthly_targets_atomic");
        if (error) throw error;
        if (data?.ok !== true || data?.atomic_write_test !== true || data?.rollback_verified !== true || data?.data_changed !== false) {
          throw new Error("Hasil verifikasi simpan gabungan tidak lengkap.");
        }
        status.textContent = "PASS: Omzet + Ultimate berhasil diuji; rollback terverifikasi. Data target tidak berubah.";
      } catch (error) {
        status.classList.add("is-error");
        status.textContent = `GAGAL uji simpan gabungan: ${error?.message || "kesalahan tidak diketahui"}`;
      } finally {
        testButton.disabled = false;
      }
    });
  }
})();
