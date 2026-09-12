/* VAX ERP — Laporan Bulanan pending provider mapping UI */
"use strict";

const LaporanBulananProviderMappingUI = {
    esc(value){
        return String(value ?? "").replace(/[&<>"']/g, (c) => ({
            "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
        }[c]));
    },

    money(value){
        return new Intl.NumberFormat("id-ID", {
            style:"currency", currency:"IDR", maximumFractionDigits:0
        }).format(Number(value || 0));
    },

    branchOptions(branches, selectedId){
        return ['<option value="">Pilih cabang asal</option>']
            .concat((branches || []).map((b) => `<option value="${Number(b.id)}" ${Number(b.id)===Number(selectedId)?"selected":""}>${this.esc(b.nama_cabang || "—")}</option>`))
            .join("");
    },

    employeeOptions(review, branchId, selectedId){
        const rows = review?.employeesByBranch?.get?.(Number(branchId)) || [];
        return ['<option value="">Pilih karyawan</option>']
            .concat(rows.map((e) => `<option value="${Number(e.id)}" ${Number(e.id)===Number(selectedId)?"selected":""}>${this.esc(e.nama_karyawan || "—")}</option>`))
            .join("");
    },

    render(container, { review, month, client, onSaved } = {}){
        if(!container) return;
        const rows = review?.rows || [];
        if(!rows.length){
            container.innerHTML = '<div class="monthly-provider-empty">Tidak ada provider pending untuk periode ini.</div>';
            return;
        }

        container.innerHTML = rows.map((row) => {
            const savedBranch = Number(row.saved?.employee_cabang_id || 0) || null;
            const savedEmployee = Number(row.saved?.employee_id || 0) || null;
            return `<article class="monthly-provider-map-row" data-source-id="${this.esc(row.sourceId)}">
                <div class="monthly-provider-source">
                    <strong>${this.esc(row.provider)}</strong>
                    <span>${this.esc(row.tanggal)} · ${this.esc(row.sourceCabang)}</span>
                    <small>${Number(row.service || 0)} service · ${this.money(row.providerShare)}</small>
                </div>
                <div class="monthly-provider-choice">
                    <label><span>Cabang Asal Karyawan</span><select class="js-map-branch">${this.branchOptions(review.branches, savedBranch)}</select></label>
                    <label><span>Nama Karyawan</span><select class="js-map-employee" ${savedBranch?"":"disabled"}>${savedBranch?this.employeeOptions(review,savedBranch,savedEmployee):'<option value="">Pilih cabang dulu</option>'}</select></label>
                    <button type="button" class="js-map-save">${row.resolved?"Update Mapping":"Simpan Mapping"}</button>
                    <span class="js-map-msg">${row.resolved?"Sudah dimapping":"Belum dimapping"}</span>
                </div>
            </article>`;
        }).join("");

        container.querySelectorAll(".monthly-provider-map-row").forEach((card) => {
            const sourceId = card.dataset.sourceId;
            const row = rows.find((r) => String(r.sourceId) === String(sourceId));
            const branchSelect = card.querySelector(".js-map-branch");
            const employeeSelect = card.querySelector(".js-map-employee");
            const saveButton = card.querySelector(".js-map-save");
            const msg = card.querySelector(".js-map-msg");

            branchSelect?.addEventListener("change", () => {
                const branchId = Number(branchSelect.value || 0);
                employeeSelect.disabled = !branchId;
                employeeSelect.innerHTML = branchId
                    ? this.employeeOptions(review, branchId, null)
                    : '<option value="">Pilih cabang dulu</option>';
            });

            saveButton?.addEventListener("click", async () => {
                try{
                    const branchId = Number(branchSelect?.value || 0);
                    const employeeId = Number(employeeSelect?.value || 0);
                    if(!branchId || !employeeId) throw new Error("Pilih cabang dan nama karyawan.");
                    const branch = (review.branches || []).find((b) => Number(b.id) === branchId);
                    const employee = (review.employeesByBranch?.get?.(branchId) || []).find((e) => Number(e.id) === employeeId);
                    if(!branch || !employee) throw new Error("Pilihan karyawan tidak valid.");
                    saveButton.disabled = true;
                    msg.textContent = "Menyimpan…";
                    await LaporanBulananProviderMapping.save({ client, month, providerRow: row, employee, branch });
                    msg.textContent = `Tersimpan → ${employee.nama_karyawan}`;
                    saveButton.textContent = "Update Mapping";
                    await onSaved?.({ sourceId, employee, branch });
                }catch(err){
                    msg.textContent = err?.message || "Gagal menyimpan mapping.";
                }finally{
                    saveButton.disabled = false;
                }
            });
        });
    }
};

if(typeof window !== "undefined") window.LaporanBulananProviderMappingUI = LaporanBulananProviderMappingUI;
