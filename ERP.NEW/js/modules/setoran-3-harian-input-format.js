/* ERP VAX — Setoran 3 Harian money input + role-safe editor UI */
"use strict";
(function(){
  if (typeof SetoranDirectFlow === "undefined") return;
  const flow = SetoranDirectFlow;

  /* Owner wajib READ ONLY untuk input operasional Setoran 3 Harian.
     Hanya SVP/SPV yang boleh masuk editor/input flow. */
  flow.isSvp = function(){
    const r = String(this.role || "").toLowerCase();
    return ["svp","spv"].includes(r);
  };

  flow.parseMoneyInput = function(v){
    const digits = String(v ?? "").replace(/[^0-9-]/g, "");
    const n = Number(digits || 0);
    return Number.isFinite(n) ? n : 0;
  };
  flow.formatMoneyInput = function(v){
    const n = this.parseMoneyInput(v);
    return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)}`;
  };

  /* Di layar, Rp0 untuk BRI berarti field belum diisi/di-reset, bukan settlement Rp0. */
  const baseModel = flow.model.bind(flow);
  flow.model = function(id){
    const m = baseModel(id);
    if (m.bri != null && this.money(m.bri) <= 0) {
      m.bri = null;
      m.diff = null;
    }
    return m;
  };

  const baseRowHtml = flow.rowHtml.bind(flow);
  flow.rowHtml = function(branch){
    let html = baseRowHtml(branch);
    html = html.replace(/(<input class="s3sheet-input" data-field="bri" )type="number"[^>]*value="([^"]*)"/,
      (m, start, val) => `${start}type="text" inputmode="numeric" autocomplete="off" value="${this.formatMoneyInput(val || 0)}"`);
    html = html.replace(/(<input class="s3sheet-input" data-field="outside" )type="number"[^>]*value="([^"]*)"/,
      (m, start, val) => `${start}type="text" inputmode="numeric" autocomplete="off" value="${this.formatMoneyInput(val || 0)}"`);
    html = html.replace(/(<input class="s3sheet-input s3sheet-note" data-field="note"[^>]*)(>)/,
      (m, start, end) => `${start} readonly data-note-popup="1" title="Klik untuk isi / lihat keterangan lengkap"${end}`);
    return html;
  };

  flow.draftFromRow = function(tr){
    const id = Number(tr.dataset.cabangId), m = this.model(id);
    const briEl = tr.querySelector('[data-field="bri"]');
    const outsideEl = tr.querySelector('[data-field="outside"]');
    const noteEl = tr.querySelector('[data-field="note"]');
    const briRaw = String(briEl?.value || "").trim();
    const briParsed = this.parseMoneyInput(briRaw);
    const bri = briRaw === "" || briParsed <= 0 ? null : briParsed;
    const outside = this.parseMoneyInput(outsideEl?.value || 0);
    const note = String(noteEl?.value || "").trim();
    const diff = bri == null ? null : bri - this.money(m.s.nonCash);
    const actual = this.money(m.s.cashReference) - this.money(outside);
    return { id, m, bri, outside, note, diff, actual };
  };

  const baseOnInput = flow.onTableInput.bind(flow);
  flow.onTableInput = function(e){
    const el = e.target;
    if (el?.matches?.('[data-field="bri"],[data-field="outside"]')) {
      const caretAtEnd = el.selectionStart === el.value.length;
      el.value = this.formatMoneyInput(el.value);
      if (caretAtEnd && typeof el.setSelectionRange === "function") {
        const end = el.value.length;
        try { el.setSelectionRange(end, end); } catch (_) {}
      }
    }
    return baseOnInput(e);
  };

  /* History: buka modal terlebih dahulu supaya user selalu mendapat feedback. */
  flow.openHistory = async function(id){
    const p = this.period();
    const branch = this.branches.find(b => Number(b.id) === Number(id));
    const name = this.canonicalName(branch?.nama_cabang || "Cabang");
    const modal = document.getElementById("s3sheetHistoryModal");
    const list = document.getElementById("s3sheetHistoryList");
    document.getElementById("s3sheetHistoryTitle").textContent = `RIWAYAT · ${name}`;
    document.getElementById("s3sheetHistoryPeriod").textContent = `${p.start} — ${p.end}`;
    if (list) list.innerHTML = '<p class="s3sheet-muted">Memuat riwayat...</p>';
    if (modal) { modal.hidden = false; modal.setAttribute("aria-hidden", "false"); }
    try {
      const { data, error } = await db.from(this.AUDIT_TABLE)
        .select("*")
        .eq("cabang_id", id)
        .eq("period_start", p.start)
        .eq("period_end", p.end)
        .order("created_at", { ascending:false })
        .limit(50);
      if (error) throw error;
      if (!list) return;
      if (!(data || []).length) {
        list.innerHTML = '<p class="s3sheet-muted">Belum ada histori untuk cabang dan periode ini.</p>';
        return;
      }
      const moneyFields = new Set(["bri_non_cash_actual","non_cash_difference","outside_cashout_cost","setoran_cash_actual","total_setoran"]);
      const labels = {
        bri_non_cash_actual:"BRI Merchant",
        non_cash_difference:"Selisih Non Tunai",
        outside_cashout_cost:"Biaya di luar Cashout",
        setoran_cash_actual:"Cash Aktual",
        non_cash_note:"Keterangan",
        taken_status:"Status Diambil",
        proof_path:"Bukti"
      };
      const esc = v => this.esc(v ?? "—");
      const changed = row => {
        const before = row.before_data || {}, after = row.after_data || {};
        const keys = Object.keys(labels).filter(k => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
        if (!keys.length) return "Tidak ada perubahan nilai utama";
        return keys.map(k => {
          const fmt = v => moneyFields.has(k) && v != null ? this.rupiah(v) : (v == null || v === "" ? "—" : String(v));
          return `<div class="s3hist-change"><b>${labels[k]}</b><span>${esc(fmt(before[k]))}</span><i>→</i><strong>${esc(fmt(after[k]))}</strong></div>`;
        }).join("");
      };
      list.innerHTML = data.map(x => `
        <div class="s3sheet-history-item">
          <div><strong>${esc(x.action)}</strong><span>${new Date(x.created_at).toLocaleString("id-ID")}</span></div>
          <div class="s3hist-changes">${changed(x)}</div>
          ${x.note ? `<p>${esc(x.note)}</p>` : ""}
          <small>${esc(x.actor_role || "")} · ${esc(x.actor_id || "")}</small>
        </div>`).join("");
    } catch (err) {
      if (list) list.innerHTML = `<p class="s3sheet-message is-error">${this.esc(err?.message || String(err))}</p>`;
    }
  };

  function ensureNoteModal(){
    if (document.getElementById("s3noteModal")) return;
    const wrap = document.createElement("div");
    wrap.id = "s3noteModal";
    wrap.className = "s3note-modal";
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="s3note-backdrop" data-note-close></div>
      <div class="s3note-panel" role="dialog" aria-modal="true" aria-labelledby="s3noteTitle">
        <div class="s3note-head"><div><small>KETERANGAN</small><h3 id="s3noteTitle">Keterangan Cabang</h3></div><button type="button" data-note-close>×</button></div>
        <textarea id="s3noteText" rows="7" maxlength="1200" placeholder="Tulis keterangan selisih settlement / biaya di luar Cashout secara lengkap..."></textarea>
        <div class="s3note-foot"><span id="s3noteCount">0 / 1200</span><div><button type="button" data-note-close>BATAL</button><button type="button" id="s3noteSave">SIMPAN</button></div></div>
      </div>`;
    document.body.appendChild(wrap);
    const style = document.createElement("style");
    style.textContent = `
      .s3note-modal[hidden]{display:none!important}.s3note-modal{position:fixed;inset:0;z-index:120;display:grid;place-items:center}.s3note-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.74);backdrop-filter:blur(3px)}.s3note-panel{position:relative;width:min(620px,calc(100% - 32px));border:1px solid rgba(216,165,59,.42);border-radius:14px;background:#0d1824;padding:16px;box-shadow:0 24px 70px rgba(0,0,0,.6)}.s3note-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.s3note-head small{color:#e1b64c;font-weight:800;letter-spacing:.1em}.s3note-head h3{margin:2px 0 0;font-size:18px}.s3note-head button{border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer}.s3note-panel textarea{width:100%;resize:vertical;min-height:150px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#09131e;color:#fff;padding:12px;font:inherit;line-height:1.45;outline:none}.s3note-panel textarea:focus{border-color:rgba(216,165,59,.72);box-shadow:0 0 0 3px rgba(216,165,59,.08)}.s3note-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;color:#91a0af;font-size:11px}.s3note-foot>div{display:flex;gap:8px}.s3note-foot button{height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#111d29;color:#fff;font-weight:800;cursor:pointer}#s3noteSave{border-color:#d8a53b;background:linear-gradient(180deg,#efc451,#bb8420);color:#111}.s3sheet-note[readonly]{cursor:pointer}.s3hist-changes{display:grid;gap:5px;margin-top:8px}.s3hist-change{display:grid;grid-template-columns:minmax(115px,1.2fr) 1fr auto 1fr;gap:8px;align-items:center;padding:6px 8px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:#09131e}.s3hist-change b{color:#e1b64c}.s3hist-change span{color:#9ba9b6}.s3hist-change i{font-style:normal;color:#6f8293}.s3hist-change strong{color:#e9f1f8;text-align:right}`;
    document.head.appendChild(style);
  }

  let activeNoteInput = null;
  function openNote(input){
    /* Owner hanya boleh melihat data, bukan membuka editor Keterangan. */
    if(String(flow.role||"").toLowerCase()==="owner") return;
    ensureNoteModal();
    activeNoteInput = input;
    const tr = input.closest("tr[data-cabang-id]");
    const id = Number(tr?.dataset.cabangId);
    const branch = flow.branches.find(b => Number(b.id) === id);
    document.getElementById("s3noteTitle").textContent = `Keterangan · ${flow.canonicalName(branch?.nama_cabang || "Cabang")}`;
    const ta = document.getElementById("s3noteText");
    ta.value = input.value || "";
    document.getElementById("s3noteCount").textContent = `${ta.value.length} / 1200`;
    const modal = document.getElementById("s3noteModal");
    modal.hidden = false;
    setTimeout(() => ta.focus(), 0);
  }
  function closeNote(){ const m=document.getElementById("s3noteModal"); if(m)m.hidden=true; activeNoteInput=null; }

  document.addEventListener("DOMContentLoaded", () => {
    ensureNoteModal();
    document.addEventListener("click", e => {
      const note = e.target.closest?.('[data-note-popup="1"]');
      if (note) { e.preventDefault(); openNote(note); return; }
      if (e.target.closest?.("[data-note-close]")) closeNote();
    });
    document.getElementById("s3noteText")?.addEventListener("input", e => {
      document.getElementById("s3noteCount").textContent = `${e.target.value.length} / 1200`;
    });
    document.getElementById("s3noteSave")?.addEventListener("click", () => {
      if(String(flow.role||"").toLowerCase()==="owner") return closeNote();
      if (!activeNoteInput) return closeNote();
      activeNoteInput.value = document.getElementById("s3noteText").value.trim();
      activeNoteInput.dispatchEvent(new Event("input", { bubbles:true }));
      activeNoteInput.dispatchEvent(new Event("change", { bubbles:true }));
      closeNote();
    });
  });
})();
