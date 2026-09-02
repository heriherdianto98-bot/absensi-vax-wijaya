/*
=========================================================
VAX ERP — SETORAN 3 HARIAN DIRECT FLOW V1
SVP owns verification. Owner is read-only reviewer.
Canonical money stays in DailyDataEngine + SetoranMoneyEngine.
=========================================================
*/
"use strict";

const SetoranDirectFlow = {
    TABLE: "setoran_3_harian",
    QRIS_TABLE: "qris_reconciliation",
    PROOF_TABLE: "setoran_3_harian_proofs",
    AUDIT_TABLE: "setoran_3_harian_audit",
    PROOF_BUCKET: "setoran-proofs",
    MAX_DAYS: 3,

    role: "",
    user: null,
    profile: null,
    branches: [],
    dataset: null,
    branchSummary: new Map(),
    savedRows: new Map(),
    qrisRows: new Map(),
    activeCabangId: null,
    activeSaved: null,
    pendingFile: null,

    money(v){ return Number(v || 0); },
    rupiah(v){ return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(this.money(v)); },
    esc(v){ return String(v ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); },
    dateLocal(d = new Date()){
        return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    },
    addDays(iso, delta){
        const d = new Date(`${iso}T12:00:00+07:00`);
        d.setDate(d.getDate() + delta);
        return this.dateLocal(d);
    },
    diffDays(start, end){
        return Math.round((new Date(`${end}T12:00:00+07:00`) - new Date(`${start}T12:00:00+07:00`)) / 86400000) + 1;
    },
    key(cabangId){ return String(Number(cabangId)); },
    branchName(id){ return this.branches.find((b) => Number(b.id) === Number(id))?.nama_cabang || `Cabang ${id}`; },
    isSvp(){ return this.role === "svp"; },

    async init(){
        try {
            this.setDefaultPeriod();
            await this.loadIdentity();
            this.bind();
            await this.reload();
        } catch(err){
            this.fail(err?.message || String(err));
        }
    },

    setDefaultPeriod(){
        const end = this.dateLocal();
        const start = this.addDays(end, -2);
        const startEl = document.getElementById("s3v2Start");
        const endEl = document.getElementById("s3v2End");
        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;
    },

    async loadIdentity(){
        const { data: sessionData, error: sessionErr } = await db.auth.getSession();
        if(sessionErr) throw sessionErr;
        this.user = sessionData?.session?.user || null;
        if(!this.user) throw new Error("Sesi tidak ditemukan. Silakan login kembali.");

        const { data, error } = await db.from("profiles").select("id,nama,role,aktif").eq("id", this.user.id).maybeSingle();
        if(error) throw error;
        if(!data || data.aktif === false) throw new Error("Profil tidak aktif.");
        this.profile = data;
        this.role = String(data.role || "").toLowerCase();
        if(!["owner","svp"].includes(this.role)) throw new Error("Akses hanya untuk Owner / SVP.");

        document.getElementById("s3v2Role").textContent = this.role === "owner" ? "OWNER · REVIEW" : "SVP · VERIFIKASI";
        document.getElementById("s3v2User").textContent = data.nama || this.role.toUpperCase();
    },

    bind(){
        document.getElementById("s3v2Apply")?.addEventListener("click", () => this.reload());
        document.getElementById("s3v2Branches")?.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-cabang-id]");
            if(btn) this.selectBranch(Number(btn.dataset.cabangId));
        });
        document.getElementById("s3v2CashActual")?.addEventListener("input", () => this.refreshCashDifference());
        document.getElementById("s3v2ProofFile")?.addEventListener("change", (e) => {
            this.pendingFile = e.target.files?.[0] || null;
            document.getElementById("s3v2ProofPicked").textContent = this.pendingFile ? this.pendingFile.name : "Belum ada file dipilih";
        });
        document.getElementById("s3v2Save")?.addEventListener("click", () => this.save(false));
        document.getElementById("s3v2Taken")?.addEventListener("click", () => this.save(true));
        document.getElementById("s3v2Reopen")?.addEventListener("click", () => this.markNotTaken());
        document.getElementById("s3v2HistoryToggle")?.addEventListener("click", () => {
            const el = document.getElementById("s3v2History");
            el.hidden = !el.hidden;
        });
    },

    period(){
        const start = document.getElementById("s3v2Start")?.value;
        const end = document.getElementById("s3v2End")?.value;
        if(!start || !end) throw new Error("Pilih periode.");
        const days = this.diffDays(start, end);
        if(days < 1 || days > this.MAX_DAYS) throw new Error("Periode Setoran maksimal 3 hari.");
        return { start, end, days };
    },

    async reload(){
        this.clearMessage();
        const p = this.period();
        this.busy(true, "Mengambil data canonical...");
        try {
            this.dataset = await DailyDataEngine.load({ client: db, start: p.start, end: p.end });
            this.branches = this.dataset.branches || [];
            this.buildBranchSummaries();
            await Promise.all([this.loadSavedRows(p), this.loadQrisRows(p)]);
            this.renderAllSummary();
            this.renderBranches();
            const keep = this.branches.some((b) => Number(b.id) === Number(this.activeCabangId));
            const firstId = this.branches[0]?.id;
            await this.selectBranch(keep ? this.activeCabangId : firstId);
        } finally {
            this.busy(false);
        }
    },

    buildBranchSummaries(){
        this.branchSummary.clear();
        for(const b of this.branches){
            const rows = (this.dataset.rows || []).filter((r) => Number(r.cabang_id) === Number(b.id));
            this.branchSummary.set(this.key(b.id), DailyDataEngine.summarizeRows(rows));
        }
    },

    async loadSavedRows(p){
        this.savedRows.clear();
        const { data, error } = await db.from(this.TABLE).select("*").eq("period_start", p.start).eq("period_end", p.end);
        if(error) throw error;
        for(const row of data || []) this.savedRows.set(this.key(row.cabang_id), row);
    },

    async loadQrisRows(p){
        this.qrisRows.clear();
        const { data, error } = await db.from(this.QRIS_TABLE)
            .select("id,cabang_id,period_start,period_end,minutes_non_cash,bri_qris,difference,status,keterangan,spv_note")
            .eq("period_start", p.start).eq("period_end", p.end);
        if(error) throw error;
        for(const row of data || []) this.qrisRows.set(this.key(row.cabang_id), row);
    },

    renderAllSummary(){
        let net = 0, nonCash = 0, cashRef = 0, bri = 0, actual = 0, absDiff = 0, taken = 0;
        for(const b of this.branches){
            const k = this.key(b.id);
            const s = this.branchSummary.get(k) || {};
            const saved = this.savedRows.get(k);
            const q = this.qrisRows.get(k);
            net += this.money(s.netRevenueErp);
            nonCash += this.money(s.nonCash);
            cashRef += this.money(s.cashReference);
            bri += this.money(q?.bri_qris);
            actual += this.money(saved?.setoran_cash_actual);
            const d = q?.bri_qris == null ? 0 : this.money(q.bri_qris) - this.money(s.nonCash);
            absDiff += Math.abs(d);
            if(saved?.taken_status === "SUDAH DIAMBIL") taken++;
        }
        const cards = [
            ["Cash Harus Diambil", this.rupiah(cashRef)],
            ["Non Tunai Minutes", this.rupiah(nonCash)],
            ["BRI Merchant", this.rupiah(bri)],
            ["Selisih Non Tunai", this.rupiah(absDiff)],
            ["Cash Aktual", this.rupiah(actual)],
            ["Status", `${taken}/${this.branches.length} Sudah Diambil`]
        ];
        document.getElementById("s3v2GlobalCards").innerHTML = cards.map(([l,v], i) => `<div class="s3v2-global-card ${i===0?'is-primary':''}"><span>${l}</span><strong>${v}</strong></div>`).join("");
    },

    renderBranches(){
        document.getElementById("s3v2Branches").innerHTML = this.branches.map((b) => {
            const saved = this.savedRows.get(this.key(b.id));
            const done = saved?.taken_status === "SUDAH DIAMBIL";
            return `<button type="button" data-cabang-id="${b.id}" class="s3v2-branch ${Number(b.id)===Number(this.activeCabangId)?'is-active':''}"><span>${this.esc(b.nama_cabang)}</span><b>${done?'✓':'○'}</b></button>`;
        }).join("");
    },

    async selectBranch(id){
        if(!id) return;
        this.activeCabangId = Number(id);
        this.activeSaved = this.savedRows.get(this.key(id)) || null;
        this.renderBranches();
        this.renderFlow();
        await Promise.all([this.renderProofs(), this.renderHistory()]);
    },

    branchModel(){
        const k = this.key(this.activeCabangId);
        const s = this.branchSummary.get(k) || {};
        const saved = this.savedRows.get(k) || {};
        const q = this.qrisRows.get(k) || null;
        const minutesNonCash = this.money(s.nonCash);
        const bri = q?.bri_qris == null ? null : this.money(q.bri_qris);
        const nonCashDiff = bri == null ? null : bri - minutesNonCash;
        return { summary: s, saved, qris: q, minutesNonCash, bri, nonCashDiff };
    },

    renderFlow(){
        const m = this.branchModel();
        const p = this.period();
        const taken = m.saved?.taken_status === "SUDAH DIAMBIL";
        const hasQris = m.bri !== null;
        const diffClass = hasQris && Math.abs(m.nonCashDiff) > 0.5 ? "is-alert" : "is-ok";

        document.getElementById("s3v2BranchName").textContent = this.branchName(this.activeCabangId);
        document.getElementById("s3v2PeriodLabel").textContent = `${p.start} → ${p.end} · ${p.days} hari`;
        const status = document.getElementById("s3v2Status");
        status.textContent = taken ? "✓ SUDAH DIAMBIL" : "○ BELUM DIAMBIL";
        status.className = `s3v2-status ${taken?'is-taken':'is-pending'}`;

        const nodes = [
            ["Net Revenue", this.rupiah(m.summary.netRevenueErp), "Otomatis dari canonical"],
            ["Non Tunai Minutes", this.rupiah(m.minutesNonCash), "Otomatis dari Minutes"],
            ["BRI Merchant", hasQris ? this.rupiah(m.bri) : "Belum ada data BRI", hasQris ? "Data rekonsiliasi" : "Upload / rekonsiliasi BRI diperlukan"],
            ["Selisih Non Tunai", hasQris ? this.rupiah(m.nonCashDiff) : "—", hasQris && Math.abs(m.nonCashDiff) > 0.5 ? "WAJIB keterangan + bukti" : "Sesuai"],
            ["Cash Harus Diambil", this.rupiah(m.summary.cashReference), "Otomatis: Net Revenue − Non Tunai"]
        ];
        document.getElementById("s3v2FlowNodes").innerHTML = nodes.map((n, idx) => `<div class="s3v2-node ${idx===3?diffClass:''} ${idx===4?'is-cash':''}"><span>${n[0]}</span><strong>${n[1]}</strong><small>${n[2]}</small></div>${idx<nodes.length-1?'<div class="s3v2-arrow">↓</div>':''}`).join("");

        const cashEl = document.getElementById("s3v2CashActual");
        cashEl.value = m.saved?.setoran_cash_actual ?? "";
        document.getElementById("s3v2Note").value = m.saved?.non_cash_note || m.saved?.spv_note || "";
        this.pendingFile = null;
        document.getElementById("s3v2ProofFile").value = "";
        document.getElementById("s3v2ProofPicked").textContent = "Belum ada file dipilih";
        this.refreshCashDifference();

        const editor = document.getElementById("s3v2Editor");
        editor.classList.toggle("is-owner", !this.isSvp());
        [...editor.querySelectorAll("input,textarea,button[data-edit]")].forEach((el) => el.disabled = !this.isSvp());
        document.getElementById("s3v2OwnerHint").hidden = this.isSvp();
        document.getElementById("s3v2Taken").hidden = !this.isSvp() || taken;
        document.getElementById("s3v2Reopen").hidden = !this.isSvp() || !taken;
        document.getElementById("s3v2Save").hidden = !this.isSvp();
        document.getElementById("s3v2DiffRequirement").hidden = !(hasQris && Math.abs(m.nonCashDiff) > 0.5);
    },

    refreshCashDifference(){
        const m = this.branchModel();
        const actual = document.getElementById("s3v2CashActual")?.value;
        const value = actual === "" ? null : Number(actual);
        const diff = value == null ? null : value - this.money(m.summary.cashReference);
        const el = document.getElementById("s3v2CashDiff");
        el.textContent = diff == null ? "Selisih cash: —" : `Selisih cash: ${this.rupiah(diff)}`;
        el.classList.toggle("is-alert", diff != null && Math.abs(diff) > 0.5);
    },

    async ensureSetoranRow({ markTaken = false } = {}){
        const m = this.branchModel();
        const p = this.period();
        const cashRaw = document.getElementById("s3v2CashActual")?.value;
        const cash = cashRaw === "" ? null : Number(cashRaw);
        const note = String(document.getElementById("s3v2Note")?.value || "").trim();
        const diff = m.nonCashDiff;
        const now = new Date().toISOString();

        if(markTaken && cash == null) throw new Error("Isi Cash Aktual sebelum tandai Sudah Diambil.");
        if(markTaken && m.bri == null) throw new Error("Data BRI Merchant belum tersedia untuk periode ini.");
        if(diff != null && Math.abs(diff) > 0.5 && !note) throw new Error("Ada selisih non-tunai. Keterangan wajib diisi.");

        const payload = {
            period_start: p.start,
            period_end: p.end,
            cabang_id: this.activeCabangId,
            minutes_cash: this.money(m.summary.cashReference),
            minutes_non_cash: this.money(m.summary.nonCash),
            minutes_cash_out: this.money(m.summary.cashOut),
            setoran_cash_actual: cash,
            total_setoran: cash,
            spv_note: note || null,
            bri_non_cash_actual: m.bri,
            non_cash_difference: diff,
            non_cash_note: note || null,
            updated_by: this.user.id,
            updated_at: now
        };

        let saved;
        if(m.saved?.id){
            const { data, error } = await db.from(this.TABLE).update(payload).eq("id", m.saved.id).select("*").single();
            if(error) throw error;
            saved = data;
        } else {
            const insertPayload = { ...payload, created_by: this.user.id, status: "DRAFT SPV", taken_status: "BELUM DIAMBIL" };
            const { data, error } = await db.from(this.TABLE).insert(insertPayload).select("*").single();
            if(error) throw error;
            saved = data;
        }
        this.activeSaved = saved;
        this.savedRows.set(this.key(this.activeCabangId), saved);
        return saved;
    },

    async save(markTaken){
        if(!this.isSvp()) return;
        this.clearMessage();
        this.busy(true, markTaken ? "Menyimpan & menandai sudah diambil..." : "Menyimpan perubahan...");
        try {
            let saved = await this.ensureSetoranRow({ markTaken });
            const m = this.branchModel();
            let proofs = await this.getProofRows(saved.id);

            if(this.pendingFile){
                await this.uploadProof(saved, this.pendingFile, m.nonCashDiff != null && Math.abs(m.nonCashDiff) > 0.5 ? "NON_CASH_DIFF" : "SETORAN");
                proofs = await this.getProofRows(saved.id);
            }

            if(markTaken && m.nonCashDiff != null && Math.abs(m.nonCashDiff) > 0.5 && !proofs.some((p) => p.proof_kind === "NON_CASH_DIFF")){
                throw new Error("Ada selisih non-tunai. Upload bukti sebelum tandai Sudah Diambil.");
            }

            if(markTaken){
                const now = new Date().toISOString();
                const { data, error } = await db.from(this.TABLE).update({
                    taken_status: "SUDAH DIAMBIL",
                    taken_at: now,
                    taken_by: this.user.id,
                    updated_by: this.user.id,
                    updated_at: now
                }).eq("id", saved.id).select("*").single();
                if(error) throw error;
                saved = data;
                this.savedRows.set(this.key(this.activeCabangId), saved);
            }

            this.ok(markTaken ? "✓ Setoran ditandai Sudah Diambil. Histori tersimpan." : "Perubahan tersimpan. Histori tersimpan.");
            this.pendingFile = null;
            this.renderAllSummary();
            this.renderBranches();
            this.renderFlow();
            await Promise.all([this.renderProofs(), this.renderHistory()]);
        } catch(err){
            this.fail(err?.message || String(err));
        } finally {
            this.busy(false);
        }
    },

    async markNotTaken(){
        if(!this.isSvp() || !this.activeSaved?.id) return;
        if(!confirm("Ubah status menjadi BELUM DIAMBIL? Perubahan ini akan masuk histori.")) return;
        this.busy(true, "Mengubah status...");
        try {
            const now = new Date().toISOString();
            const { data, error } = await db.from(this.TABLE).update({
                taken_status: "BELUM DIAMBIL", taken_at: null, taken_by: null,
                updated_by: this.user.id, updated_at: now
            }).eq("id", this.activeSaved.id).select("*").single();
            if(error) throw error;
            this.savedRows.set(this.key(this.activeCabangId), data);
            this.activeSaved = data;
            this.ok("Status diubah menjadi Belum Diambil. Histori tersimpan.");
            this.renderAllSummary(); this.renderBranches(); this.renderFlow();
            await this.renderHistory();
        } catch(err){ this.fail(err?.message || String(err)); }
        finally { this.busy(false); }
    },

    async getProofRows(setoranId){
        if(!setoranId) return [];
        const { data, error } = await db.from(this.PROOF_TABLE).select("*").eq("setoran_id", setoranId).order("uploaded_at", { ascending: false });
        if(error) throw error;
        return data || [];
    },

    async uploadProof(saved, file, kind){
        if(!file?.type?.startsWith("image/")) throw new Error("Bukti harus berupa foto.");
        if(file.size > 5 * 1024 * 1024) throw new Error("Ukuran bukti maksimal 5 MB.");
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `direct-flow/${saved.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await db.storage.from(this.PROOF_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
        if(upErr) throw upErr;
        const { error: rowErr } = await db.from(this.PROOF_TABLE).insert({
            setoran_id: saved.id,
            request_no: Number(saved.proof_request_no || 1),
            storage_path: path,
            uploaded_by: this.user.id,
            proof_kind: kind
        });
        if(rowErr){
            await db.storage.from(this.PROOF_BUCKET).remove([path]);
            throw rowErr;
        }
    },

    async renderProofs(){
        const wrap = document.getElementById("s3v2Proofs");
        wrap.innerHTML = "";
        const saved = this.savedRows.get(this.key(this.activeCabangId));
        if(!saved?.id){ wrap.innerHTML = '<span class="s3v2-muted">Belum ada bukti.</span>'; return; }
        try {
            const proofs = await this.getProofRows(saved.id);
            if(!proofs.length){ wrap.innerHTML = '<span class="s3v2-muted">Belum ada bukti.</span>'; return; }
            for(const p of proofs){
                const { data } = await db.storage.from(this.PROOF_BUCKET).createSignedUrl(p.storage_path, 3600);
                const url = data?.signedUrl;
                const item = document.createElement("a");
                item.className = "s3v2-proof";
                item.href = url || "#";
                item.target = "_blank";
                item.rel = "noopener";
                item.innerHTML = `${url ? `<img src="${url}" alt="Bukti">` : ""}<span>${this.esc(p.proof_kind || "BUKTI")}</span>`;
                wrap.appendChild(item);
            }
        } catch(err){ wrap.innerHTML = `<span class="s3v2-muted">${this.esc(err.message || "Gagal memuat bukti")}</span>`; }
    },

    changedFields(beforeData, afterData){
        const labels = {
            setoran_cash_actual: "Cash Aktual", taken_status: "Status", bri_non_cash_actual: "BRI Merchant",
            non_cash_difference: "Selisih Non Tunai", non_cash_note: "Catatan", spv_note: "Catatan"
        };
        const keys = Object.keys(labels).filter((k) => JSON.stringify(beforeData?.[k] ?? null) !== JSON.stringify(afterData?.[k] ?? null));
        if(!keys.length) return "Data diperbarui";
        return keys.map((k) => `${labels[k]}: ${this.formatHistoryValue(k, beforeData?.[k])} → ${this.formatHistoryValue(k, afterData?.[k])}`).join(" · ");
    },
    formatHistoryValue(k, v){
        if(v == null || v === "") return "—";
        if(["setoran_cash_actual","bri_non_cash_actual","non_cash_difference"].includes(k)) return this.rupiah(v);
        return String(v);
    },

    async renderHistory(){
        const wrap = document.getElementById("s3v2HistoryList");
        const saved = this.savedRows.get(this.key(this.activeCabangId));
        if(!saved?.id){ wrap.innerHTML = '<div class="s3v2-muted">Belum ada histori.</div>'; return; }
        const { data, error } = await db.from(this.AUDIT_TABLE).select("*").eq("setoran_id", saved.id).order("created_at", { ascending: false }).limit(100);
        if(error){ wrap.innerHTML = `<div class="s3v2-muted">${this.esc(error.message)}</div>`; return; }
        const rows = data || [];
        const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
        const names = new Map();
        if(ids.length){
            const { data: profiles } = await db.from("profiles").select("id,nama,role").in("id", ids);
            for(const p of profiles || []) names.set(p.id, p);
        }
        if(!rows.length){ wrap.innerHTML = '<div class="s3v2-muted">Belum ada histori.</div>'; return; }
        wrap.innerHTML = rows.map((r) => {
            const actor = names.get(r.actor_id);
            const who = actor?.nama || r.actor_role?.toUpperCase() || "SYSTEM";
            let detail = r.action;
            if(r.action === "UPDATE" || r.action === "TAKEN_STATUS_CHANGE") detail = this.changedFields(r.before_data, r.after_data);
            if(r.action === "PROOF_ADD") detail = "Bukti foto ditambahkan";
            if(r.action === "PROOF_DELETE") detail = "Bukti foto dihapus";
            if(r.action === "CREATE") detail = "Verifikasi dibuat";
            const when = new Intl.DateTimeFormat("id-ID", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Jakarta" }).format(new Date(r.created_at));
            return `<div class="s3v2-history-item"><div><strong>${this.esc(who)}</strong><span>${this.esc(when)}</span></div><p>${this.esc(detail)}</p>${r.note?`<small>Catatan: ${this.esc(r.note)}</small>`:""}</div>`;
        }).join("");
    },

    busy(on, text = "Memproses..."){
        const el = document.getElementById("s3v2Busy");
        if(!el) return;
        el.hidden = !on;
        el.textContent = text;
    },
    clearMessage(){ const el=document.getElementById("s3v2Message"); if(el){el.hidden=true;el.className="s3v2-message";} },
    ok(msg){ const el=document.getElementById("s3v2Message"); if(el){el.hidden=false;el.className="s3v2-message is-ok";el.textContent=msg;} },
    fail(msg){ const el=document.getElementById("s3v2Message"); if(el){el.hidden=false;el.className="s3v2-message is-error";el.textContent=msg;} console.error("[SetoranDirectFlow]", msg); }
};

window.SetoranDirectFlow = SetoranDirectFlow;
window.addEventListener("DOMContentLoaded", () => SetoranDirectFlow.init());
