/*
=========================================================
VAX ERP — SETORAN 3 HARIAN OWNER VERIFICATION LAYER
Additive UI/status layer only.

IMPORTANT:
- Tidak mengubah SetoranMoneyEngine / DailyDataEngine / rumus Setoran.
- Checklist "Sudah Diambil" tetap workflow SVP.
- Owner verification hanya boleh setelah taken_status = SUDAH DIAMBIL.
- Data yang belum Owner Verified belum eligible menjadi source Arus Kas V2.
=========================================================
*/
"use strict";

(function(){
    if(typeof SetoranDirectFlow === "undefined") return;

    const flow = SetoranDirectFlow;
    let busy = false;

    function isOwner(){
        return String(flow.role || "").toLowerCase() === "owner";
    }

    function ensureStyle(){
        if(document.getElementById("s3OwnerVerifyStyle")) return;
        const style = document.createElement("style");
        style.id = "s3OwnerVerifyStyle";
        style.textContent = `
          .s3sheet-table th[data-s3-owner-verify-head]{
            min-width:112px;
            text-align:center;
            color:#ffd34f;
          }
          .s3-owner-verify-cell{
            min-width:112px;
            text-align:center;
          }
          .s3-owner-verify{
            display:inline-flex;
            align-items:center;
            justify-content:center;
            gap:6px;
            min-width:94px;
            min-height:34px;
            padding:5px 8px;
            border:1px solid rgba(255,211,79,.25);
            border-radius:9px;
            background:rgba(255,211,79,.055);
            color:#8e9aaa;
            font-size:10px;
            font-weight:800;
            letter-spacing:.35px;
            user-select:none;
          }
          .s3-owner-verify input{
            width:15px;
            height:15px;
            margin:0;
            accent-color:#f5c542;
          }
          .s3-owner-verify.is-ready{
            border-color:rgba(245,197,66,.58);
            color:#f5d870;
            background:rgba(245,197,66,.09);
          }
          .s3-owner-verify.is-verified{
            border-color:rgba(74,222,128,.58);
            color:#6ee7a7;
            background:rgba(34,197,94,.10);
            box-shadow:0 0 12px rgba(34,197,94,.08);
          }
          .s3-owner-verify.is-locked{
            opacity:.58;
            cursor:not-allowed;
          }
        `;
        document.head.appendChild(style);
    }

    function ensureHeader(){
        const tr = document.querySelector(".s3sheet-table thead tr");
        if(!tr || tr.querySelector("[data-s3-owner-verify-head]")) return;
        const th = document.createElement("th");
        th.setAttribute("data-s3-owner-verify-head", "1");
        th.textContent = "VERIF OWNER";
        const history = tr.lastElementChild;
        tr.insertBefore(th, history || null);
    }

    function renderVerifyCells(){
        const body = document.getElementById("s3sheetBody");
        if(!body) return;

        body.querySelectorAll("tr[data-cabang-id]").forEach((tr) => {
            tr.querySelector("[data-s3-owner-verify-cell]")?.remove();

            const id = Number(tr.dataset.cabangId);
            const saved = flow.savedRows.get(flow.key(id)) || {};
            const taken = saved.taken_status === "SUDAH DIAMBIL";
            const verified = saved.owner_verified === true;
            const canEdit = isOwner() && taken && Boolean(saved.id) && !busy;

            const td = document.createElement("td");
            td.className = "s3-owner-verify-cell";
            td.setAttribute("data-s3-owner-verify-cell", "1");

            const label = document.createElement("label");
            label.className = `s3-owner-verify ${verified ? "is-verified" : taken ? "is-ready" : "is-locked"}`;
            label.title = verified
                ? "Sudah diverifikasi Owner"
                : taken
                    ? (isOwner() ? "Klik setelah pengecekan Owner selesai" : "Menunggu verifikasi Owner")
                    : "Menunggu SVP menandai Sudah Diambil";

            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = verified;
            input.disabled = !canEdit;
            input.setAttribute("data-owner-verify", "1");

            const text = document.createElement("span");
            text.textContent = verified ? "VERIFIED" : "BELUM";

            label.append(input, text);
            td.appendChild(label);

            const historyCell = tr.lastElementChild;
            tr.insertBefore(td, historyCell || null);
        });
    }

    function renderStatusMeta(){
        const meta = document.getElementById("s3sheetStatusMeta");
        if(!meta) return;
        const total = flow.branches?.length || 0;
        const rows = [...flow.savedRows.values()];
        const taken = rows.filter(r => r.taken_status === "SUDAH DIAMBIL").length;
        const verified = rows.filter(r => r.owner_verified === true).length;
        meta.textContent = `${taken}/${total} Sudah Diambil · ${verified}/${total} Owner Verified`;
    }

    function decorate(){
        ensureStyle();
        ensureHeader();
        renderVerifyCells();
        renderStatusMeta();
    }

    const originalRenderTable = flow.renderTable.bind(flow);
    flow.renderTable = function(){
        const result = originalRenderTable(...arguments);
        decorate();
        return result;
    };

    async function saveVerification(tr, checked, input){
        if(busy) return;
        const id = Number(tr?.dataset?.cabangId);
        const saved = flow.savedRows.get(flow.key(id));

        if(!isOwner()){
            if(input) input.checked = Boolean(saved?.owner_verified);
            flow.fail?.("Verifikasi Setoran hanya dapat dilakukan Owner.");
            return;
        }
        if(!saved?.id){
            if(input) input.checked = false;
            flow.fail?.("Data Setoran cabang ini belum tersimpan.");
            return;
        }
        if(saved.taken_status !== "SUDAH DIAMBIL"){
            if(input) input.checked = false;
            flow.fail?.("SVP harus menandai Sudah Diambil terlebih dahulu.");
            return;
        }

        busy = true;
        flow.busy?.(true);
        renderVerifyCells();

        try{
            const now = new Date().toISOString();
            const payload = checked
                ? {
                    owner_verified: true,
                    owner_verified_at: now,
                    owner_verified_by: flow.user.id,
                    updated_by: flow.user.id,
                    updated_at: now
                  }
                : {
                    owner_verified: false,
                    owner_verified_at: null,
                    owner_verified_by: null,
                    updated_by: flow.user.id,
                    updated_at: now
                  };

            const {data, error} = await db
                .from(flow.TABLE)
                .update(payload)
                .eq("id", saved.id)
                .eq("taken_status", "SUDAH DIAMBIL")
                .select("*")
                .single();

            if(error) throw error;
            flow.savedRows.set(flow.key(id), data);
            flow.ok?.(checked
                ? "Setoran cabang sudah diverifikasi Owner."
                : "Verifikasi Owner dibatalkan.");
        }catch(err){
            if(input) input.checked = Boolean(saved.owner_verified);
            flow.fail?.(err?.message || String(err));
        }finally{
            busy = false;
            flow.busy?.(false);
            flow.renderTable();
            flow.renderTotals?.();
        }
    }

    document.addEventListener("change", (event) => {
        const input = event.target.closest?.("[data-owner-verify]");
        if(!input) return;
        const tr = input.closest("tr[data-cabang-id]");
        saveVerification(tr, input.checked, input);
    });

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", decorate, {once:true});
    }else{
        decorate();
    }
})();
