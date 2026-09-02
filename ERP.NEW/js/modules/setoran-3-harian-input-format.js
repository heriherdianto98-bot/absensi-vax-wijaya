/* ERP VAX — Setoran 3 Harian money input + owner editor compatibility */
"use strict";
(function(){
  if (typeof SetoranDirectFlow === "undefined") return;
  const flow = SetoranDirectFlow;

  flow.isSvp = function(){
    const r = String(this.role || "").toLowerCase();
    return ["svp","spv","owner"].includes(r);
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

  const baseRowHtml = flow.rowHtml.bind(flow);
  flow.rowHtml = function(branch){
    let html = baseRowHtml(branch);
    html = html.replace(/(<input class="s3sheet-input" data-field="bri" )type="number"[^>]*value="([^"]*)"/,
      (m, start, val) => `${start}type="text" inputmode="numeric" autocomplete="off" value="${this.formatMoneyInput(val || 0)}"`);
    html = html.replace(/(<input class="s3sheet-input" data-field="outside" )type="number"[^>]*value="([^"]*)"/,
      (m, start, val) => `${start}type="text" inputmode="numeric" autocomplete="off" value="${this.formatMoneyInput(val || 0)}"`);
    return html;
  };

  flow.draftFromRow = function(tr){
    const id = Number(tr.dataset.cabangId), m = this.model(id);
    const briEl = tr.querySelector('[data-field="bri"]');
    const outsideEl = tr.querySelector('[data-field="outside"]');
    const noteEl = tr.querySelector('[data-field="note"]');
    const briRaw = String(briEl?.value || "").trim();
    const bri = briRaw === "" ? null : this.parseMoneyInput(briRaw);
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
})();
