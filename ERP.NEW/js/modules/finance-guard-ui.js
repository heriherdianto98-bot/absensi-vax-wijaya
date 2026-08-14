/*
============================================================
VAX ERP — FINANCE GUARD UI
Read-only renderer for VaxFinanceGuard.
Requires:
- connector.js (window db)
- finance-guard.js (window.VaxFinanceGuard)
- #financeGuardPanel component in DOM
============================================================
*/
(function(){
  "use strict";

  const rupiah = (value) => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

  function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  }

  function statusClass(status){
    if(status === "VALID") return "valid";
    if(status === "MISMATCH") return "mismatch";
    if(status === "WAITING_DATA") return "waiting";
    return "error";
  }

  function statusLabel(status){
    if(status === "VALID") return "FINANCE VALID ✓";
    if(status === "MISMATCH") return "MISMATCH ⚠";
    if(status === "WAITING_DATA") return "MENUNGGU DATA";
    return "ERROR";
  }

  function mismatchDetails(branch){
    return (branch.checks || [])
      .filter(c => c.status === "MISMATCH")
      .map(c => `${c.label}: selisih ${rupiah(Math.abs(c.difference || 0))}`)
      .join(" • ");
  }

  function renderBranches(branches){
    const host = document.getElementById("financeGuardBranches");
    if(!host) return;

    host.innerHTML = (branches || []).map(branch => {
      const cls = statusClass(branch.status);
      const detail = mismatchDetails(branch);
      return `
        <div class="finance-guard-branch">
          <span class="finance-guard-branch__name">${branch.branchName}</span>
          <span class="finance-guard-branch__state finance-guard-branch__state--${cls}">${statusLabel(branch.status)}</span>
          ${detail ? `<div class="finance-guard-branch__detail">${detail}</div>` : ""}
        </div>`;
    }).join("");
  }

  function renderResult(result){
    const badge = document.getElementById("financeGuardStatus");
    const message = document.getElementById("financeGuardMessage");

    if(!badge || !message) return;

    badge.className = `finance-guard-panel__status finance-guard-panel__status--${statusClass(result.status)}`;
    badge.textContent = statusLabel(result.status);

    if(result.status === "ERROR"){
      message.textContent = result.error || "Finance Guard gagal membaca data.";
      return;
    }

    const totals = result.global?.totals || {};
    setText("fgProductFund", rupiah(totals.productFund));
    setText("fgSetoran", rupiah(totals.setoranDone));
    setText("fgShortage", rupiah(totals.shortage));
    setText("fgQris", rupiah(totals.qrisNonTunai));
    setText("fgKasOwner", rupiah(totals.kasOwnerExpected ?? totals.ownerLedgerNet ?? 0));

    if(result.status === "VALID"){
      message.textContent = `Semua pemeriksaan periode ${result.period.start} s.d. ${result.period.end} cocok sampai Rp1. Data aman digunakan sebagai acuan.`;
    } else if(result.status === "MISMATCH"){
      const bad = (result.branches || []).filter(b => b.status === "MISMATCH");
      message.textContent = `Ditemukan ketidaksesuaian pada ${bad.length} cabang. Jangan finalkan periode ini sebelum sumber selisih diperiksa.`;
    } else {
      message.textContent = "Sebagian data sumber belum tersedia. Periode belum boleh dianggap final sampai seluruh pemeriksaan lengkap.";
    }

    renderBranches(result.branches || []);
  }

  async function run(options){
    if(!window.VaxFinanceGuard){
      renderResult({status:"ERROR", error:"Finance Guard Engine belum dimuat."});
      return;
    }
    const result = await window.VaxFinanceGuard.run(options);
    renderResult(result);
    return result;
  }

  window.VaxFinanceGuardUI = Object.freeze({ run, renderResult });
})();
