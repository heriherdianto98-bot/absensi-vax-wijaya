/* Pre-ERP manual fine consumer: isolated from Absensi, locked engine and historic snapshots. */
"use strict";
(() => {
  const engine = window.PayrollUnifiedEngine;
  if (!engine?.loadPeriod || !window.db || engine.__preErpManualFineBridge) return;
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
      .payroll-sum.is-denda-card.has-pre-erp-fine{cursor:pointer;outline-offset:3px}
      .payroll-sum.is-denda-card .pre-erp-fine-breakdown{display:block;margin-top:5px;font-size:11px;line-height:1.35;color:#edc1bd;font-weight:600;white-space:normal}
      .payroll-sum.is-denda-card .pre-erp-fine-hint{display:block;margin-top:5px;font-size:11px;color:#c5d3dd}
      .pre-erp-fine-editor{margin:10px 0;padding:13px 15px;border:1px solid #775246;border-radius:12px;background:linear-gradient(140deg,#251c1e,#151e29);color:#f0e6e3}
      .pre-erp-fine-editor[hidden]{display:none!important}
      .pre-erp-fine-editor h4{margin:0 0 5px;color:#f1bcad;font-size:14px}
      .pre-erp-fine-editor p{margin:0 0 10px;font-size:12px;color:#ced5de}
      .pre-erp-fine-fields{display:grid;grid-template-columns:minmax(145px,1fr) minmax(240px,2fr) auto;gap:9px;align-items:end}
      .pre-erp-fine-fields label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#e9d1c8}
      .pre-erp-fine-fields input{width:100%;min-width:0;padding:10px;border-radius:8px;border:1px solid #58616f;background:#111b27;color:#fff;font:inherit}
      .pre-erp-fine-fields button{padding:10px 13px;border-radius:8px;border:1px solid #d4a06b;background:#c58b53;color:#151718;font-weight:900;cursor:pointer}
      .pre-erp-fine-fields button:disabled{opacity:.65;cursor:wait}
      .pre-erp-fine-msg{min-height:16px;margin:8px 0 0!important;color:#b8dcbf!important}
      .pre-erp-fine-msg.error{color:#ffaca8!important}
      @media(max-width:800px){.pre-erp-fine-fields{grid-template-columns:1fr}.pre-erp-fine-fields button{width:100%}}
    `;
    document.head.appendChild(el);
  }

  function enhance(card) {
    if (card.dataset.preErpFineEnhanced === "1") return;
    const id = Number(card.dataset.employeeId);
    const row = window.__preErpFineRows?.get(id);
    if (!row || !row.month || !Number.isSafeInteger(id)) return;
    const dendaCard = card.querySelector(".payroll-sum.is-denda-card");
    const summary = card.querySelector(".payroll-summary");
    if (!dendaCard || !summary) return;
    card.dataset.preErpFineEnhanced = "1";
    card.dataset.preErpFineMonth = row.month;
    const detail = document.createElement("small"); detail.className = "pre-erp-fine-breakdown";
    detail.textContent = `Absensi ERP ${money(row.absensi)} + Manual sebelum ERP ${money(row.amount)}`;
    dendaCard.appendChild(detail);
    const hint = document.createElement("small"); hint.className = "pre-erp-fine-hint";
    hint.textContent = "Klik untuk isi denda lama";
    dendaCard.appendChild(hint);
    dendaCard.classList.add("has-pre-erp-fine");
    dendaCard.tabIndex = 0; dendaCard.setAttribute("role", "button");
    dendaCard.setAttribute("aria-label", "Buka input denda manual sebelum ERP");
    const editor = document.createElement("section");
    editor.className = "pre-erp-fine-editor";editor.hidden = true;
    editor.innerHTML = '<h4>Denda Manual Sebelum ERP</h4><p>Masukkan hanya total denda dari catatan lama yang BELUM tercatat di Absensi ERP. Nilai ini ditambah satu kali ke denda Absensi.</p><div class="pre-erp-fine-fields"><label>Nominal denda lama (Rp)<input class="pre-erp-fine-amount" type="text" inputmode="numeric" autocomplete="off"></label><label>Catatan sumber / periode denda<input class="pre-erp-fine-note" type="text" maxlength="500" placeholder="Contoh: Rekap manual 1–15 Sep 2026"></label><button type="button" class="pre-erp-fine-save">Simpan Denda</button></div><p class="pre-erp-fine-msg" role="status" aria-live="polite"></p>';
    editor.querySelector(".pre-erp-fine-amount").value = money(row.amount);
    editor.querySelector(".pre-erp-fine-note").value = row.note;
    summary.after(editor);
    const toggle = () => {editor.hidden = !editor.hidden;if (!editor.hidden) editor.querySelector(".pre-erp-fine-amount").focus();};
    dendaCard.addEventListener("click", toggle);
    dendaCard.addEventListener("keydown", event => {if(event.key === "Enter" || event.key === " "){event.preventDefault();toggle();}});
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
