/* ERP VAX — additive status synchronizer for Owner -> SVP invoice ACC.
   Does not modify invoice engine or Arus Kas engine.
   It only reconciles invoice status when the matching OWNER_INVOICE ledger already exists.
*/
"use strict";
(() => {
  const SOURCE_TYPE = "OWNER_INVOICE";
  const RPC_NAME = "approve_owner_invoice_from_svp_bridge";
  let running = false;

  const roleOf = inv => String(inv?.role || "").toLowerCase();
  const isSvp = inv => ["svp", "spv"].includes(roleOf(inv));
  const senderRole = row => String(row?.sender_role || "").toLowerCase();
  const isOwnerInvoice = row => !["svp", "spv"].includes(senderRole(row));
  const isDraft = row => String(row?.status || "draft").toLowerCase() === "draft";
  const sourceKey = id => `OWNER_INVOICE:${id}`;

  async function reconcile(){
    const inv = window.SvPInvoice;
    if (!inv || !isSvp(inv) || running) return;
    const candidates = (Array.isArray(inv.rows) ? inv.rows : []).filter(r => r?.id && isOwnerInvoice(r) && isDraft(r));
    if (!candidates.length) return;

    running = true;
    try {
      const keys = candidates.map(r => sourceKey(r.id));
      const { data: ledgers, error: ledgerError } = await db
        .from("arus_kas_v2_transactions")
        .select("source_key")
        .eq("source_type", SOURCE_TYPE)
        .in("source_key", keys);
      if (ledgerError) throw ledgerError;

      const paidKeys = new Set((ledgers || []).map(x => String(x.source_key || "")));
      const matched = candidates.filter(r => paidKeys.has(sourceKey(r.id)));
      if (!matched.length) return;

      let changed = false;
      for (const row of matched) {
        const { data, error } = await db.rpc(RPC_NAME, { p_invoice_id: row.id });
        if (error) {
          console.warn("Owner invoice status sync:", row.invoice_no || row.id, error.message || error);
          continue;
        }
        const result = Array.isArray(data) ? data[0] : data;
        if (String(result?.status || "").toLowerCase() === "paid") {
          row.status = "paid";
          changed = true;
        }
      }

      if (changed) {
        if (typeof inv.render === "function") inv.render();
        if (typeof inv.reload === "function") await inv.reload();
      }
    } catch (err) {
      console.warn("Owner invoice status reconciliation:", err?.message || err);
    } finally {
      running = false;
    }
  }

  function install(){
    const inv = window.SvPInvoice;
    if (!inv || !inv.role) return false;
    if (!isSvp(inv)) return true;
    if (window.__ownerInvoiceStatusSyncInstalled) return true;
    window.__ownerInvoiceStatusSyncInstalled = true;

    document.addEventListener("click", e => {
      if (!e.target.closest?.("[data-owner-invoice-acc]")) return;
      setTimeout(reconcile, 500);
      setTimeout(reconcile, 1400);
      setTimeout(reconcile, 3000);
    }, true);

    setTimeout(reconcile, 250);
    setTimeout(reconcile, 1200);
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    if (install() || ++tries > 180) clearInterval(timer);
  }, 100);
  window.addEventListener("load", () => {
    setTimeout(install, 700);
    setTimeout(reconcile, 1800);
  });
})();
