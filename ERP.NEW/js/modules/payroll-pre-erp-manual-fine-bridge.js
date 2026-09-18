/* Pre-ERP manual fine consumer: isolated from Absensi, locked engine and historic snapshots. */
"use strict";
(() => {
  const engine = window.PayrollUnifiedEngine;
  // ERP connector exposes db as a top-level const, not necessarily window.db.
  if (!engine?.loadPeriod || typeof db === "undefined" || engine.__preErpManualFineBridge) return;
  const baseLoad = engine.loadPeriod.bind(engine);
  const TABLE = "payroll_pre_erp_manual_fines";
  const money = v => "Rp " + Number(v || 0).toLocaleString("id-ID");
  const amountOf = v => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 ? n : NaN; };
  const pad = n => String(n).padStart(2, "0");
  const firstDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? `${String(v).slice(0,7)}-01` : "";
  let currentToken = 0;

  engine.loadPeriod = async function preErpFineAwareLoad(args = {}) {
    const token = ++currentToken;
    const result = await baseLoad(args);
    // Never recalculate an immutable original payroll or its approved correction.
    if (result?.historicalLocked || window.__VAX_PAYROLL_HISTORICAL_LOCKED__?.locked || result?.source === "SNAPSHOT_ORIGINAL") return result;
    const month = firstDay(args.start);
    const employees = (result?.payroll || []).map(row => Number(row.employeeId)).filter(Number.isSafeInteger);
    if (!month || !employees.length) return result;
    const {data, error} = await db.from(TABLE).select("employee_id,period_month,amount,note,updated_at")
      .eq("period_month", month).in("employee_id", employees);
    if (error) throw new Error("Denda manual sebelum ERP tidak dapat dibaca: " + error.message);
    // Let the UI discard stale requests when the selected branch or period changes.
    if (token !== currentToken) return result;
    const saved = new Map((data || []).map(row => [Number(row.employee_id), row]));
    for (const row of result.payroll) {
      const record = saved.get(Number(row.employeeId));
      const manual = record ? amountOf(record.amount) : 0;
      if (!Number.isFinite(manual)) throw new Error("Nominal denda manual tidak valid untuk karyawan " + row.employeeId);
      const s = row.summary;
      if (!s) continue;
      const automatic = Number(s.denda || 0);
      row.preErpManualFine = {amount:manual, absensi:automatic, note:record?.note || "", updatedAt:record?.updated_at || null, month};
      s.denda = automatic + manual;
      s.gajiBersih = Number(s.gajiBersih || 0) - manual;
      if (result.totals) {
        result.totals.denda = Number(result.totals.denda || 0) + manual;
        result.totals.gajiBersih = Number(result.totals.gajiBersih || 0) - manual;
      }
    }
    return result;
  };

  function style() {
    if (document.getElementById("preErpFineStyle")) return;
    const el = document.createElement("style"); el.id = "preErpFineStyle";
    el.textContent = `
      .pre-erp-fine-panel{margin:10px 0;border:1px solid #775246;border-radius:12px;background:linear-gradient(140deg,#251c1e,#151e29);color:#f0e6e3;overflow:hidden}
      .pre-erp-fine-panel-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 15px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}
      .pre-erp-fine-panel-head:hover,.pre-erp-fine-panel-head:focus-visible{background:rgba(214,164,106,.09)}
      .pre-erp-fine-panel-head strong{display:block;color:#f1bcad;font-size:13px}
      .pre-erp-fine-panel-head small{display:block;margin-top:3px;color:#d2bdba;font-size:11px;line-height:1.4}
      .pre-erp-fine-panel-chevron{flex:none;color:#f1bcad;font-size:17px;transition:transform .2s ease}
      .pre-erp-fine-panel-head[aria-expanded="true"] .pre-erp-fine-panel-chevron{transform:rotate(180deg)}
      .pre-erp-fine-editor{padding:0 15px 13px;border-top:1px solid rgba(194,143,106,.25)}
      .pre-erp-fine-editor[hidden]{display:none!important}
      .pre-erp-fine-editor p{margin:10px 0;font-size:12px;color:#ced5de}
      .pre-erp-fine-fields{display:grid;grid-template-columns:minmax(145px,1fr) minmax(240px,2fr) auto;gap:9px;align-items:end}
      .pre-erp-fine-fields label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#e9d1c8}
      .pre-erp-fine-fields input{width:100%;min-width:0;padding:10px;border-radius:8px;border:1px solid #58616f;background:#111b27;color:#fff;font:inherit}
      .pre-erp-fine-fields button{padding:10px 13px;border-radius:8px;border:1px solid #d4a06b;background:#c58b53;color:#151718;font-weight:900;cursor:pointer}
      .pre-erp-fine-fields button:disabled{opacity:.65;cursor:wait}
      .pre-erp-fine-msg{min-height:16px;margin:8px 0 0!important;color:#b8dcbf!important}
      .pre-erp-fine-msg.error{color:#ffaca8!important}
      @media(max-width:800px){.pre-erp-fine-fields{grid-template-columns:1fr}.pre-erp-fine-fields button{width:100%}.pre-erp-fine-panel-head{align-items:flex-start}}
      @media(prefers-reduced-motion:reduce){.pre-erp-fine-panel-chevron{transition:none}}
    `;
    document.head.appendChild(el);
  }

  function enhance(card) {
    if (card.dataset.preErpFineEnhanced === "1") return;
    const id = Number(card.dataset.employeeId);
    const row = window.__preErpFineRows?.get(id);
    if (!row || !row.month || !Number.isSafeInteger(id)) return;
    const summary = card.querySelector(".payroll-summary");
    if (!summary) return;
    card.dataset.preErpFineEnhanced = "1";
    card.dataset.preErpFineMonth = row.month;
    // Keep the original Denda KPI card unchanged in size and appearance.
    const panel = document.createElement("section");
    panel.className = "pre-erp-fine-panel";
    const heading = document.createElement("button");
    heading.className = "pre-erp-fine-panel-head";
    heading.type = "button";
    heading.setAttribute("aria-expanded", "false");
    heading.setAttribute("aria-label", "Buka atau tutup Denda Manual Sebelum ERP");
    const headingText = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = "Denda Manual Sebelum ERP";
    const detail = document.createElement("small");
    detail.textContent = `Absensi ERP ${money(row.absensi)} + Manual sebelum ERP ${money(row.amount)}`;
    headingText.append(title, detail);
    const chevron = document.createElement("span");
    chevron.className = "pre-erp-fine-panel-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    heading.append(headingText, chevron);
    const editor = document.createElement("div");
    editor.className = "pre-erp-fine-editor";
    editor.hidden = true;
    const editorId = `preErpFineEditor-${id}`;
    editor.id = editorId;
    heading.setAttribute("aria-controls", editorId);
    editor.innerHTML = '<p>Masukkan hanya total denda dari catatan lama yang BELUM tercatat di Absensi ERP. Nilai ini ditambah satu kali ke denda Absensi.</p><div class="pre-erp-fine-fields"><label>Nominal denda lama (Rp)<input class="pre-erp-fine-amount" type="text" inputmode="numeric" autocomplete="off"></label><label>Catatan sumber / periode denda<input class="pre-erp-fine-note" type="text" maxlength="500" placeholder="Contoh: Rekap manual 1–15 Sep 2026"></label><button type="button" class="pre-erp-fine-save">Simpan Denda</button></div><p class="pre-erp-fine-msg" role="status" aria-live="polite"></p>';
    editor.querySelector(".pre-erp-fine-amount").value = money(row.amount);
    editor.querySelector(".pre-erp-fine-note").value = row.note;
    panel.append(heading, editor);
    summary.after(panel);
    heading.addEventListener("click", () => {
      editor.hidden = !editor.hidden;
      heading.setAttribute("aria-expanded", String(!editor.hidden));
      if (!editor.hidden) editor.querySelector(".pre-erp-fine-amount").focus();
    });
    const input = editor.querySelector(".pre-erp-fine-amount");
    input.addEventListener("blur", () => {const v = Number(input.value.replace(/\D/g, "") || 0);input.value = money(v);});
    editor.querySelector(".pre-erp-fine-save").addEventListener("click", async event => {
      const button = event.currentTarget, msg = editor.querySelector(".pre-erp-fine-msg");
      const amount = Number(input.value.replace(/\D/g, "") || 0);
      const note = editor.querySelector(".pre-erp-fine-note").value.trim();
      msg.classList.remove("error");
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 99999999999999 || !note) {
        msg.classList.add("error");msg.textContent = "Isi nominal yang valid dan catatan sumber/periode denda.";return;
      }
      try {
        button.disabled = true;msg.textContent = "Menyimpan denda manual…";
        const {data:auth,error:authError} = await db.auth.getUser();
        if(authError || !auth?.user?.id) throw new Error("Sesi login Owner tidak tersedia.");
        const {error} = await db.from(TABLE).upsert({employee_id:id,period_month:row.month,amount,note,updated_by:auth.user.id,updated_at:new Date().toISOString()}, {onConflict:"employee_id,period_month"});
        if(error) throw error;
        msg.textContent = "Denda manual tersimpan. Memuat ulang payroll…";
        document.getElementById("payrollRefresh")?.click();
      } catch (err) {msg.classList.add("error");msg.textContent = err?.message || "Gagal menyimpan denda manual.";}
      finally {button.disabled = false;}
    });
  }

  // Keep the read-only view model alongside each render; never save it to another payroll table.
  const wrappedLoad = engine.loadPeriod;
  engine.loadPeriod = async function trackPreErpFineRows(args = {}) {
    const result = await wrappedLoad.call(this, args);
    window.__preErpFineRows = new Map((result?.payroll || []).filter(row => row.preErpManualFine).map(row => [Number(row.employeeId), row.preErpManualFine]));
    return result;
  };
  const start = () => {
    style();const list = document.getElementById("payrollList");if (!list) return;
    const observer = new MutationObserver(() => list.querySelectorAll(".payroll-employee-card:not([data-pre-erp-fine-enhanced])").forEach(enhance));
    observer.observe(list,{childList:true,subtree:true});
    list.querySelectorAll(".payroll-employee-card").forEach(enhance);
  };
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true}); else start();
  Object.defineProperty(engine,"__preErpManualFineBridge",{value:true,enumerable:false});
})();
