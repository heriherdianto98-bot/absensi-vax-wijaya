/*
=========================================================
VAX ERP — Share Cukur Provider Drilldown Click Fix
=========================================================
READ ONLY UI fix.
Reason: provider buttons also carry data-sc-branch, so the older modal
listener handles them as branch clicks before provider detail can open.
This capture-phase handler routes provider clicks directly to the canonical
provider_sales_daily_source detail view.
=========================================================
*/
"use strict";

(function(){
    const MODAL_ID = "thcShareCukurDrilldownModal";

    function esc(value){
        return String(value ?? "")
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }

    function rupiah(value){
        const n = Number(value || 0);
        return new Intl.NumberFormat("id-ID", {
            style:"currency", currency:"IDR", minimumFractionDigits:0, maximumFractionDigits:0
        }).format(Number.isFinite(n) ? n : 0);
    }

    async function openProviderDetail(button){
        const modal = document.getElementById(MODAL_ID);
        if(!modal || typeof db === "undefined" || typeof DashboardEngine === "undefined") return;

        const branchId = Number(button.dataset.scBranch);
        const providerName = String(button.dataset.scProvider || "").trim();
        const start = DashboardEngine.lastRange?.start || null;
        const end = DashboardEngine.lastRange?.end || start;
        if(!Number.isFinite(branchId) || !providerName || !start || !end) return;

        const titleText = modal.querySelector("#scTitle")?.textContent || "";
        const branchName = titleText.includes("—") ? titleText.split("—").slice(-1)[0].trim() : `Cabang #${branchId}`;

        const { data, error } = await db
            .from("provider_sales_daily_source")
            .select("activity_date,provider_name_raw,provider_share")
            .gte("activity_date", start)
            .lte("activity_date", end)
            .eq("cabang_id", branchId)
            .eq("source", "MINUTES_PROVIDER_SALES_DAILY")
            .eq("provider_name_raw", providerName);

        if(error){
            console.warn("[ShareCukurProviderClickFix] detail provider gagal:", error);
            return;
        }

        const byDate = new Map();
        for(const row of data || []){
            const tanggal = String(row.activity_date || "").slice(0,10);
            const nominal = Number(row.provider_share || 0);
            if(!tanggal || !Number.isFinite(nominal) || nominal <= 0) continue;
            byDate.set(tanggal, (byDate.get(tanggal) || 0) + nominal);
        }

        const rows = [...byDate.entries()]
            .map(([tanggal, nominal]) => ({ tanggal, nominal }))
            .sort((a,b) => a.tanggal.localeCompare(b.tanggal));
        const total = rows.reduce((sum, row) => sum + row.nominal, 0);

        const title = modal.querySelector("#scTitle");
        const label = modal.querySelector("#scTotalLabel");
        const grand = modal.querySelector("#scGrandTotal");
        const body = modal.querySelector("#scBody");
        if(title) title.textContent = `${providerName} — ${branchName}`;
        if(label) label.textContent = `Total Share ${providerName}`;
        if(grand) grand.textContent = rupiah(total);
        if(body){
            body.innerHTML = `<button type="button" class="sc-back" data-sc-back-branch="${esc(String(branchId))}">← Kembali ke Provider</button>` +
                `<table><thead><tr><th>Tanggal</th><th>Nominal Share</th></tr></thead><tbody>` +
                (rows.length
                    ? rows.map(r => `<tr><td>${esc(r.tanggal)}</td><td>${rupiah(r.nominal)}</td></tr>`).join("")
                    : `<tr><td colspan="2" class="sc-empty">Belum ada rincian share provider pada periode aktif.</td></tr>`) +
                `</tbody></table>`;
        }
    }

    document.addEventListener("click", (event) => {
        const button = event.target.closest?.(`#${MODAL_ID} [data-sc-provider]`);
        if(!button) return;

        // Hentikan listener lama yang salah membaca tombol provider sebagai tombol cabang.
        event.preventDefault();
        event.stopImmediatePropagation();
        openProviderDetail(button);
    }, true);
})();
