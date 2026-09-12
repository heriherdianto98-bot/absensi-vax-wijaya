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

    employeeOptions(review, branchId, selectedId, manualSelected=false){
        const rows = review?.employeesByBranch?.get?.(Number(branchId)) || [];
        return ['<option value="">Pilih karyawan</option>']
            .concat(rows.map((e) => {
                const label = `${e.nama_karyawan || "—"}${e.aktif===false?" — NONAKTIF / RESIGN":""}`;
                return `<option value="${Number(e.id)}" ${Number(e.id)===Number(selectedId)?"selected":""}>${this.esc(label)}</option>`;
            }))
            .concat([`<option value="__manual__" ${manualSelected?"selected":""}>LAINNYA / INPUT NAMA MANUAL</option>`])
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
            const savedManualName = !savedEmployee ? String(row.saved?.employee_name_snapshot || "").trim() : "";
            const manualSelected = Boolean(savedManualName);
            return `<article class="monthly-provider-map-row" data-source-id="${this.esc(row.sourceId)}">
                <div class="monthly-provider-source">
                    <strong>${this.esc(row.provider)}</strong>
                    <span>${this.esc(row.tanggal)} · ${this.esc(row.sourceCabang)}</span>
                    <small>${Number(row.service || 0)} service · ${this.money(row.providerShare)}</small>
                </div>
                <div class="monthly-provider-choice">
                    <label><span>Cabang Asal Karyawan</span><select class="js-map-branch">${this.branchOptions(review.branches, savedBranch)}</select></label>
                    <label><span>Nama Karyawan</span><select class="js-map-employee" ${savedBranch?"":"disabled"}>${savedBranch?this.employeeOptions(review,savedBranch,savedEmployee,manualSelected):'<option value="">Pilih cabang dulu</option>'}</select></label>
                    <label class="monthly-provider-manual ${manualSelected?"is-open":""}"><span>Nama Manual / Historis</span><input type="text" class="js-map-manual-name" value="${this.esc(savedManualName)}" placeholder="Ketik nama capster yang sudah resign / terhapus"></label>
                    <button type="button" class="js-map-save">${row.resolved?"Update Mapping":"Simpan Mapping"}</button>
                    <span class="js-map-msg">${row.resolved?`Sudah dimapping → ${this.esc(row.saved?.employee_name_snapshot || "")}`:"Belum dimapping"}</span>
                </div>
            </article>`;
        }).join("");

        container.querySelectorAll(".monthly-provider-map-row").forEach((card) => {
            const sourceId = card.dataset.sourceId;
            const row = rows.find((r) => String(r.sourceId) === String(sourceId));
            const branchSelect = card.querySelector(".js-map-branch");
            const employeeSelect = card.querySelector(".js-map-employee");
            const manualWrap = card.querySelector(".monthly-provider-manual");
            const manualInput = card.querySelector(".js-map-manual-name");
            const saveButton = card.querySelector(".js-map-save");
            const msg = card.querySelector(".js-map-msg");

            const syncManual = () => {
                const manual = employeeSelect?.value === "__manual__";
                manualWrap?.classList.toggle("is-open", manual);
                if(!manual && manualInput) manualInput.value = "";
            };

            branchSelect?.addEventListener("change", () => {
                const branchId = Number(branchSelect.value || 0);
                employeeSelect.disabled = !branchId;
                employeeSelect.innerHTML = branchId
                    ? this.employeeOptions(review, branchId, null, false)
                    : '<option value="">Pilih cabang dulu</option>';
                syncManual();
            });

            employeeSelect?.addEventListener("change", syncManual);
            syncManual();

            saveButton?.addEventListener("click", async () => {
                try{
                    const branchId = Number(branchSelect?.value || 0);
                    const branch = (review.branches || []).find((b) => Number(b.id) === branchId);
                    if(!branchId || !branch) throw new Error("Pilih cabang asal karyawan.");

                    const employeeValue = String(employeeSelect?.value || "");
                    const isManual = employeeValue === "__manual__";
                    const employeeId = isManual ? 0 : Number(employeeValue || 0);
                    const employee = employeeId
                        ? (review.employeesByBranch?.get?.(branchId) || []).find((e) => Number(e.id) === employeeId)
                        : null;
                    const manualName = isManual ? String(manualInput?.value || "").trim() : "";

                    if(isManual && !manualName) throw new Error("Isi nama karyawan manual.");
                    if(!isManual && !employee) throw new Error("Pilih nama karyawan.");

                    saveButton.disabled = true;
                    msg.textContent = "Menyimpan…";
                    await LaporanBulananProviderMapping.save({ client, month, providerRow: row, employee, branch, manualName });
                    const savedName = employee?.nama_karyawan || manualName;
                    msg.textContent = `Tersimpan → ${savedName}${isManual?" (MANUAL)":""}`;
                    saveButton.textContent = "Update Mapping";
                    await onSaved?.({ sourceId, employee, branch, manualName });
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
