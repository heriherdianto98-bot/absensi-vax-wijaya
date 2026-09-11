/* ERP VAX — additive bridge: SVP invoice approval -> Arus Kas V2 Kas Besar.
   IMPORTANT: does not modify invoice engine or Arus Kas engine.
   Owner ACC creates exactly one ledger OUT transaction using source_key idempotency.
*/
"use strict";
(() => {
  const TX_TABLE = "arus_kas_v2_transactions";
  const AUDIT_TABLE = "arus_kas_v2_audit";
  const SOURCE_TYPE = "SVP_INVOICE";

  const roleOf = (inv) => String(inv?.role || "").toLowerCase();
  const isOwner = (inv) => roleOf(inv) === "owner";
  const senderRole = (row) => String(row?.sender_role || "").toLowerCase();
  const isSvpInvoice = (row) => ["svp", "spv"].includes(senderRole(row));
  const statusOf = (row) => String(row?.status || "draft").toLowerCase();
  const isApproved = (row) => ["paid", "approved"].includes(statusOf(row));
  const sourceKey = (id) => `SVP_INVOICE:${id}`;

  function rupiah(v){
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(v || 0));
  }

  function localDate(){
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function ensureStyle(){
    if(document.getElementById("svpInvoiceCashBridgeStyle")) return;
    const style = document.createElement("style");
    style.id = "svpInvoiceCashBridgeStyle";
    style.textContent = `
      .mt-invoice-buttons .mt-action-acc{
        min-height:40px;padding:8px 13px;border:1px solid #37d77a;border-radius:10px;
        background:linear-gradient(180deg,#14824a 0%,#0e683b 55%,#094a2b 100%);
        color:#f3fff7;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:7px;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.13),0 5px 13px rgba(8,121,62,.24);
        cursor:pointer;white-space:nowrap;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;
      }
      .mt-invoice-buttons .mt-action-acc:hover{transform:translateY(-1px);border-color:#72f0a8;box-shadow:0 8px 18px rgba(26,180,90,.28)}
      .mt-invoice-buttons .mt-action-acc:disabled{opacity:.55;cursor:wait;transform:none}
      .mt-invoice-buttons .mt-action-acc .acc-icon{
        width:23px;height:23px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;
        background:linear-gradient(145deg,#d9ffe8,#6df4a5 55%,#20bd68);color:#064c28;font-size:15px;font-weight:1000;
        border:1px solid #adffcc;box-shadow:inset 0 1px 1px rgba(255,255,255,.9),0 2px 7px rgba(42,226,116,.35)
      }
      .mt-invoice-buttons .mt-action-view{
        min-height:40px;padding:8px 13px;border:1px solid #4da9d6;border-radius:10px;
        background:linear-gradient(180deg,#174a65 0%,#10384f 55%,#0b293b 100%);
        color:#eefaff;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:7px;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 5px 13px rgba(20,118,166,.22);
        cursor:pointer;white-space:nowrap;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;
      }
      .mt-invoice-buttons .mt-action-view:hover{transform:translateY(-1px);border-color:#7dd6ff;box-shadow:0 8px 18px rgba(42,157,211,.28)}
      .mt-invoice-buttons .mt-action-view .view-icon{
        width:23px;height:23px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;
        background:linear-gradient(145deg,#dff7ff,#76d9ff 55%,#2ca9df);color:#073a52;font-size:14px;font-weight:1000;
        border:1px solid #a9e9ff;box-shadow:inset 0 1px 1px rgba(255,255,255,.9),0 2px 7px rgba(72,193,239,.34)
      }
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-dialog{border-color:#2b789d;box-shadow:0 24px 80px rgba(0,0,0,.62),0 0 0 1px rgba(68,179,224,.12)}
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-dialog-head h2{color:#bfeeff}
      #mtInvoiceModal[data-owner-view-only="1"] #invAddItem,
      #mtInvoiceModal[data-owner-view-only="1"] [data-remove],
      #mtInvoiceModal[data-owner-view-only="1"] .mt-invoice-form-actions button[type="submit"]{display:none!important}
      #mtInvoiceModal[data-owner-view-only="1"] input:disabled,
      #mtInvoiceModal[data-owner-view-only="1"] textarea:disabled{
        opacity:1!important;color:#e7f7ff!important;-webkit-text-fill-color:#e7f7ff!important;
        background:#0d151d!important;border-color:#263b49!important;cursor:default!important
      }
      .mt-invoice-status.paid,.mt-invoice-status.approved{background:#103b27!important;color:#7df0ad!important;border-color:#2aaf67!important}
    `;
    document.head.appendChild(style);
  }

  function restoreViewMode(){
    const modal = document.getElementById("mtInvoiceModal");
    if(!modal || modal.dataset.ownerViewOnly !== "1") return;
    delete modal.dataset.ownerViewOnly;
    modal.querySelectorAll("#invNo,#invDate,#invDue,#invTitle,#invNotes,#invItems input").forEach(el => { el.disabled = false; });
  }

  async function viewInvoice(row){
    const inv = window.SvPInvoice;
    if(!inv || !row) return;
    await inv.open(row);
    const modal = document.getElementById("mtInvoiceModal");
    if(!modal) return;
    modal.dataset.ownerViewOnly = "1";
    const title = document.getElementById("mtInvoiceTitle");
    if(title) title.textContent = "Lihat Invoice SVP";
    modal.querySelectorAll("#invNo,#invDate,#invDue,#invTitle,#invNotes,#invItems input").forEach(el => { el.disabled = true; });
  }

  async function currentOwner(){
    const {data:s, error:se} = await db.auth.getSession();
    if(se) throw se;
    const user = s?.session?.user;
    if(!user) throw new Error("Sesi Owner tidak ditemukan.");
    const {data:p, error:pe} = await db.from("profiles").select("id,role,nama,aktif").eq("id", user.id).maybeSingle();
    if(pe) throw pe;
    if(!p || p.aktif === false || String(p.role || "").toLowerCase() !== "owner"){
      throw new Error("ACC invoice hanya boleh dilakukan Owner.");
    }
    return {user, profile:p};
  }

  async function findLedger(invoiceId){
    const {data,error} = await db.from(TX_TABLE)
      .select("id,amount,source_key")
      .eq("source_type", SOURCE_TYPE)
      .eq("source_key", sourceKey(invoiceId))
      .maybeSingle();
    if(error) throw error;
    return data || null;
  }

  async function markInvoicePaid(row, ownerId){
    const now = new Date().toISOString();
    const {error} = await db.from("svp_invoices")
      .update({status:"paid", updated_by:ownerId, updated_at:now})
      .eq("id", row.id);
    if(error) throw error;
  }

  async function writeAudit(transaction, row, ownerId){
    try{
      await db.from(AUDIT_TABLE).insert({
        transaction_id: transaction.id,
        action: "SVP_INVOICE_OWNER_ACC",
        actor_id: ownerId,
        snapshot: {
          invoice_id: row.id,
          invoice_no: row.invoice_no || null,
          total: Number(row.total || 0),
          source_type: SOURCE_TYPE,
          source_key: sourceKey(row.id)
        }
      });
    }catch(err){
      console.warn("SVP invoice cash bridge audit:", err?.message || err);
    }
  }

  async function approve(row, btn){
    if(!row || !isSvpInvoice(row)) return;
    if(isApproved(row)) return;
    const total = Math.round(Number(row.total || 0));
    if(!(total > 0)){
      alert("Invoice tidak dapat di-ACC karena total nominal Rp0.");
      return;
    }

    const ok = window.confirm(
      `ACC invoice ${row.invoice_no || "SVP"} sebesar ${rupiah(total)}?\n\n` +
      `Setelah ACC, nominal otomatis menjadi PENGELUARAN KAS BESAR.`
    );
    if(!ok) return;

    const old = btn?.innerHTML;
    if(btn){ btn.disabled = true; btn.textContent = "Memproses..."; }

    try{
      const {user} = await currentOwner();

      // Idempotency: the same invoice may create only one ledger transaction.
      let tx = await findLedger(row.id);
      if(!tx){
        const now = new Date().toISOString();
        const payload = {
          tanggal: localDate(),
          amount: total,
          from_wallet: "KAS_BESAR",
          to_wallet: "EXTERNAL",
          entry_type: "AUTO",
          category: "TAGIHAN_SVP",
          description: `ACC Invoice SVP ${row.invoice_no || row.id}${row.title ? ` · ${row.title}` : ""}`,
          source_type: SOURCE_TYPE,
          source_key: sourceKey(row.id),
          source_period_start: null,
          source_period_end: null,
          verification_status: "OWNER_VERIFIED",
          created_by: user.id,
          updated_by: user.id,
          verified_by: user.id,
          verified_at: now,
          metadata: {
            invoice_id: row.id,
            invoice_no: row.invoice_no || null,
            invoice_title: row.title || null,
            sender_role: senderRole(row),
            auto_kind: "SVP_INVOICE_OWNER_ACC"
          }
        };
        const {data,error} = await db.from(TX_TABLE).insert(payload).select("*").single();
        if(error) throw error;
        tx = data;
        await writeAudit(tx, row, user.id);
      }

      // Mark invoice only after the ledger transaction exists.
      await markInvoicePaid(row, user.id);

      const inv = window.SvPInvoice;
      if(inv?.reload) await inv.reload();
      alert(`Invoice berhasil di-ACC.\nKas Besar berkurang ${rupiah(total)}.`);
    }catch(err){
      console.error("SVP invoice cash bridge:", err);
      alert(`Gagal ACC invoice: ${err?.message || err}`);
    }finally{
      if(btn){ btn.disabled = false; if(old != null) btn.innerHTML = old; }
    }
  }

  function decorate(){
    const inv = window.SvPInvoice;
    if(!inv || !isOwner(inv)) return;
    const list = document.getElementById("mtInvoiceList");
    if(!list) return;

    ensureStyle();
    const rows = Array.isArray(inv.rows) ? inv.rows : [];
    list.querySelectorAll(".mt-invoice-row").forEach(rowEl => {
      const id = rowEl.querySelector("[data-id]")?.getAttribute("data-id");
      if(!id) return;
      const row = rows.find(x => String(x.id) === String(id));
      if(!row || !isSvpInvoice(row)) return;

      const actions = rowEl.querySelector(".mt-invoice-buttons");
      if(!actions) return;

      // Make direction explicit for Owner without touching invoice render engine.
      const small = rowEl.querySelector("small");
      if(small && !small.dataset.cashBridgeDirection){
        small.dataset.cashBridgeDirection = "1";
        if(!small.textContent.includes("SVP → OWNER")) small.textContent = `SVP → OWNER • ${small.textContent}`;
      }

      if(!actions.querySelector(`[data-invoice-view="${id}"]`)){
        const view = document.createElement("button");
        view.type = "button";
        view.className = "mt-action mt-action-view";
        view.dataset.invoiceView = id;
        view.title = "Lihat invoice yang diajukan SVP";
        view.innerHTML = '<span class="view-icon" aria-hidden="true">◉</span><span>Lihat Invoice</span>';
        actions.prepend(view);
      }

      if(isApproved(row)){
        rowEl.dataset.invoiceCashApproved = "1";
        return;
      }
      if(actions.querySelector(`[data-invoice-acc="${id}"]`)) return;

      const b = document.createElement("button");
      b.type = "button";
      b.className = "mt-action mt-action-acc";
      b.dataset.invoiceAcc = id;
      b.title = "ACC dan catat sebagai pengeluaran Kas Besar";
      b.innerHTML = '<span class="acc-icon" aria-hidden="true">✓</span><span>ACC</span>';
      const viewBtn = actions.querySelector(`[data-invoice-view="${id}"]`);
      if(viewBtn) viewBtn.insertAdjacentElement("afterend", b); else actions.prepend(b);
    });
  }

  function install(){
    const inv = window.SvPInvoice;
    if(!inv || !inv.role) return false;
    if(!isOwner(inv)) return true;
    if(window.__svpInvoiceCashBridgeInstalled) return true;
    window.__svpInvoiceCashBridgeInstalled = true;

    ensureStyle();
    document.addEventListener("click", (e) => {
      const viewBtn = e.target.closest?.("[data-invoice-view]");
      if(viewBtn){
        e.preventDefault();
        e.stopPropagation();
        const row = (window.SvPInvoice?.rows || []).find(x => String(x.id) === String(viewBtn.dataset.invoiceView));
        if(row) viewInvoice(row);
        return;
      }

      const closeBtn = e.target.closest?.("[data-inv-close]");
      if(closeBtn) restoreViewMode();

      const btn = e.target.closest?.("[data-invoice-acc]");
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const row = (window.SvPInvoice?.rows || []).find(x => String(x.id) === String(btn.dataset.invoiceAcc));
      if(row) approve(row, btn);
    }, true);

    const list = document.getElementById("mtInvoiceList");
    if(list){
      new MutationObserver(() => decorate()).observe(list, {childList:true, subtree:true});
    }
    decorate();
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    if(install() || ++tries > 180) clearInterval(timer);
  }, 100);
  window.addEventListener("load", () => {
    setTimeout(install, 600);
    setTimeout(install, 1400);
  });
})();
