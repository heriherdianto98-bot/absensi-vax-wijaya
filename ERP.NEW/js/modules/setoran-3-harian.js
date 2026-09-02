/*
=========================================================
VAX ERP — Setoran 3 Harian (FINAL UI + Minutes + AI + Print)
Source of truth angka referensi: daily_recap_source (Minutes).
real_cash BUKAN sumber utama.
QRIS reconciliation LOCK — hanya share periode/cabang filter.
 
OWNER LOCKED — canonical = SetoranMoneyEngine (setoran-money-engine.js).
  NET REVENUE ERP / CASH REFERENSI tidak dihitung ulang di file ini.
DONE = derived from setoran_3_harian_receipts (CLEAR + transfer proof), bukan base status mutation.
=========================================================
*/
 
const Setoran3Harian = {
 
    TABLE: "setoran_3_harian",
    CABANG: "cabang",
    SOURCE: "daily_recap_source",
    PROFILES: "profiles",
    FILTER_KEY: "vax_setoran3_filter",
    HANDOFF_KEY: "vax_kpi_drilldown",
 
    /* Urutan operasional final — match nama_cabang / nama_minutes, jangan ubah cabang_id */
    CABANG_ORDER: [
        { label: "Kalijati", aliases: ["kalijati"] },
        { label: "Palabuan", aliases: ["palabuan"] },
        /* Barsel di Minutes sering termapping ke Soklat di ERP — pakai cabang existing */
        { label: "Barsel", aliases: ["barsel", "soklat"] },
        { label: "Rawabadak", aliases: ["rawabadak", "rawa badak", "rawa-badak"] },
        { label: "AR Hakim", aliases: ["ar hakim", "ar-hakim", "arhkim", "hakim"] },
        { label: "SPBU Pagaden", aliases: ["spbu pagaden", "pagaden"] },
        { label: "Pamanukan", aliases: ["pamanukan", "wijiaya pamanukan", "wijaya pamanukan"] },
        { label: "Parahyangan", aliases: ["parahyangan"] },
        { label: "Cinangsi", aliases: ["cinangsi"] },
        { label: "Mekarwangi", aliases: ["mekarwangi"] }
    ],
 
    /* Cash Out abnormal: naik ≥25% vs periode sebelumnya yang sebanding (transparan) */
    CASHOUT_PCT_WARN: 25,
 
    /* Bukti foto multi — private bucket + tabel proofs (20260816) */
    PROOF_BUCKET: "setoran-proofs",
    PROOF_TABLE: "setoran_3_harian_proofs",
    RECEIPT_TABLE: "setoran_3_harian_receipts",
    PROOF_MAX_BYTES: 5 * 1024 * 1024,
    PROOF_MAX_COUNT: 5,
    PROOF_MIME: {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
    },
 
    cabangList: [],
    allRows: [],
    rows: [],
    activeRow: null,
    activeCabangId: null,
    insight: null,
    cashOutAnalysis: null,
    bound: false,
    role: "owner",
    loadSeq: 0,
    filtersRestored: false,
    suppressFilterEvents: false,
    nameCache: new Map(),
    pendingCabangId: null,
    persistedCabangName: null,
    persistedPeriode: null,
    proofUploading: false,
    proofSignedCache: new Map(),
    modalScrollLockCount: 0,
    currentProofs: [],
    historyProofGroups: [],
 
    /* Ringkasan Semua Cabang — periode independen (default = periode aktif halaman) */
    allBranchesStart: null,
    allBranchesEnd: null,
    allBranchesPeriodTouched: false,
    allBranchesLoadSeq: 0,
    allBranchesAgg: null,
    /* Custom calendar lokal (pola Dashboard — tidak share state Dashboard) */
    allCalViewYear: null,
    allCalViewMonth: null,
    allCalPickStart: null,
    allCalPickEnd: null,
    allCalMode: "range",
    allCalMonthPickYear: null,
    allCalMonthPickMonth: null,
    allCalEscBound: false,
 
    /* Modal Pilih Periode — custom VAX calendar (draft only; aktif = qrisRecoStart/End) */
    draftStart: null,
    draftEnd: null,
    viewYear: null,
    viewMonth: null,
    periodCalEscBound: false,
    /* true hanya saat default periode dipakai (bukan URL/handoff/histori persisted) */
    periodSuggestPending: false,
 
    STATUS: {
        EMPTY: "BELUM DIISI",
        DRAFT: "DRAFT SPV",
        WAIT_OWNER: "MENUNGGU APPROVAL OWNER",
        CLEAR: "CLEAR",
        RETURN_SPV: "PERLU TINDAK LANJUT",
        DONE: "DONE"
    },
 
    init(){
        if(this.bound) return;
        this.bound = true;
 
        this.ensureProofDom();
 
        document.getElementById("setoran3PrevCabang")
            ?.addEventListener("click", () => this.shiftCabang(-1));
        document.getElementById("setoran3NextCabang")
            ?.addEventListener("click", () => this.shiftCabang(1));
 
        document.getElementById("setoran3ProgressToggle")
            ?.addEventListener("click", () => this.toggleProgressList());
 
        document.getElementById("setoran3PeriodBtn")
            ?.addEventListener("click", () => this.openPeriodModal());
 
        document.getElementById("setoran3TodayBtn")
            ?.addEventListener("click", () => this.applyTodayPeriod());
 
        document.getElementById("setoran3PeriodApply")
            ?.addEventListener("click", () => this.applyPeriodFromModal());
        document.getElementById("s3PeriodCalPrev")
            ?.addEventListener("click", () => this.shiftPeriodCalMonth(-1));
        document.getElementById("s3PeriodCalNext")
            ?.addEventListener("click", () => this.shiftPeriodCalMonth(1));
        document.getElementById("s3PeriodCalToday")
            ?.addEventListener("click", () => this.jumpPeriodCalToday());
        document.getElementById("s3PeriodCalDays")
            ?.addEventListener("click", (e) => {
                const dayBtn = e.target.closest("[data-s3-period-cal-day]");
                if(dayBtn) this.onPeriodCalDayClick(dayBtn.getAttribute("data-s3-period-cal-day"));
            });
 
        document.querySelectorAll("[data-s3-period-close]").forEach(el => {
            el.addEventListener("click", () => this.closePeriodModal());
        });
        if(!this.periodCalEscBound){
            this.periodCalEscBound = true;
            document.addEventListener("keydown", (e) => {
                if(e.key === "Escape" && this.isPeriodCalOpen()){
                    this.closePeriodModal();
                }
            });
        }
 
        /* Ringkasan Semua Cabang — custom calendar (tidak mengubah periode halaman) */
        document.getElementById("setoran3AllBranchesPeriodBtn")
            ?.addEventListener("click", () => this.openAllBranchesPeriodModal());
        document.getElementById("s3AllCalApply")
            ?.addEventListener("click", () => this.applyAllBranchesPeriodFromModal());
        document.getElementById("s3AllCalPrev")
            ?.addEventListener("click", () => this.shiftAllBranchesCalMonth(-1));
        document.getElementById("s3AllCalNext")
            ?.addEventListener("click", () => this.shiftAllBranchesCalMonth(1));
        document.getElementById("s3AllCalMonthYearPrev")
            ?.addEventListener("click", () => this.shiftAllBranchesMonthPickerYear(-1));
        document.getElementById("s3AllCalMonthYearNext")
            ?.addEventListener("click", () => this.shiftAllBranchesMonthPickerYear(1));
        document.querySelectorAll("[data-s3-all-cal-mode]").forEach(el => {
            el.addEventListener("click", () => {
                this.setAllBranchesCalMode(el.getAttribute("data-s3-all-cal-mode"));
            });
        });
        document.querySelectorAll("[data-s3-all-cal-close]").forEach(el => {
            el.addEventListener("click", () => this.closeAllBranchesPeriodModal());
        });
        document.getElementById("s3AllCalDays")
            ?.addEventListener("click", (e) => {
                const dayBtn = e.target.closest("[data-s3-all-cal-day]");
                if(dayBtn) this.onAllBranchesCalDayClick(dayBtn.getAttribute("data-s3-all-cal-day"));
            });
        document.getElementById("s3AllCalMonthGrid")
            ?.addEventListener("click", (e) => {
                const mBtn = e.target.closest("[data-s3-all-cal-month]");
                if(mBtn) this.onAllBranchesMonthPickerClick(mBtn.getAttribute("data-s3-all-cal-month"));
            });
        if(!this.allCalEscBound){
            this.allCalEscBound = true;
            document.addEventListener("keydown", (e) => {
                if(e.key === "Escape" && this.isAllBranchesCalOpen()){
                    this.closeAllBranchesPeriodModal();
                }
            });
        }
 
        document.getElementById("setoran3BtnSaveDraft")
            ?.addEventListener("click", () => {
                if(this.activeRow) this.saveDraft(this.activeRow);
            });
        document.getElementById("setoran3BtnSubmit")
            ?.addEventListener("click", () => {
                if(this.activeRow) this.submitToOwner(this.activeRow);
            });
        document.getElementById("setoran3BtnSubmitUlang")
            ?.addEventListener("click", () => {
                if(this.activeRow) this.submitToOwner(this.activeRow);
            });
 
        document.getElementById("setoran3FormCash")
            ?.addEventListener("input", () => this.refreshFormTotal());
 
        document.getElementById("setoran3PrintBtn")
            ?.addEventListener("click", () => this.printMonthly());

        document.getElementById("setoran3SummaryCards")
            ?.addEventListener("click", (e) => {
                if(e.target.closest("[data-s3-open-cashout]")) this.openCashOutModule();
            });
        document.getElementById("setoran3SummaryCards")
            ?.addEventListener("keydown", (e) => {
                if(!e.target.closest("[data-s3-open-cashout]")) return;
                if(e.key === "Enter" || e.key === " "){
                    e.preventDefault();
                    this.openCashOutModule();
                }
            });
 
        document.getElementById("setoran3TableBody")
            ?.addEventListener("click", (e) => {
                const btn = e.target.closest("[data-s3-action]");
                if(!btn || !this.activeRow) return;
                const action = btn.getAttribute("data-s3-action");
                if(action === "detail") this.openOwnerModal(this.activeRow, "detail");
                if(action === "approve") this.openOwnerModal(this.activeRow, "approve");
                if(action === "return") this.openOwnerModal(this.activeRow, "return");
                if(action === "reopen") this.openOwnerModal(this.activeRow, "reopen");
                if(action === "edit-focus"){
                    document.getElementById("setoran3SpvFormCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
 
        document.getElementById("setoran3OwnerActionBtns")
            ?.addEventListener("click", (e) => {
                const btn = e.target.closest("[data-s3-action]");
                if(!btn || !this.activeRow) return;
                const action = btn.getAttribute("data-s3-action");
                if(action === "detail") this.openOwnerModal(this.activeRow, "detail");
                if(action === "approve") this.openOwnerModal(this.activeRow, "approve");
                if(action === "return") this.openOwnerModal(this.activeRow, "return");
                if(action === "reopen") this.openOwnerModal(this.activeRow, "reopen");
            });
 
        document.getElementById("setoran3OwnerForm")
            ?.addEventListener("submit", (e) => {
                e.preventDefault();
                this.submitOwnerModal();
            });
 
        document.addEventListener("input", (e) => {
            if(e.target?.id === "setoran3OwnerNote") this.syncOwnerSubmitBtn();
        });
 
        document.querySelectorAll("[data-s3-close]").forEach(el => {
            el.addEventListener("click", () => this.closeOwnerModal());
        });
 
        document.querySelectorAll("[data-s3-proof-close]").forEach(el => {
            el.addEventListener("click", () => this.closeProofModal());
        });
 
        document.addEventListener("change", (e) => {
            if(e.target?.id === "setoran3ProofFile" || e.target?.id === "setoran3ProofCamera"){
                this.onProofFilePicked(e);
            }
        });
 
        document.addEventListener("click", (e) => {
            const histToggle = e.target.closest("[data-s3-proof-history-toggle]");
            if(histToggle){
                const wrap = document.getElementById(histToggle.getAttribute("data-s3-proof-history-toggle"));
                if(wrap){
                    wrap.hidden = !wrap.hidden;
                    histToggle.setAttribute("aria-expanded", wrap.hidden ? "false" : "true");
                    histToggle.textContent = wrap.hidden
                        ? "RIWAYAT BUKTI SEBELUMNYA ▼"
                        : "TUTUP RIWAYAT BUKTI ▲";
                }
                return;
            }
 
            const btn = e.target.closest("[data-s3-proof-action]");
            if(!btn) return;
            const action = btn.getAttribute("data-s3-proof-action");
            if(action === "pick") document.getElementById("setoran3ProofFile")?.click();
            if(action === "camera") document.getElementById("setoran3ProofCamera")?.click();
            if(action === "view"){
                const path = btn.getAttribute("data-proof-path");
                const when = btn.getAttribute("data-proof-when") || "";
                this.openProofModal(path, when);
            }
            if(action === "delete"){
                const proofId = btn.getAttribute("data-proof-id");
                if(proofId) this.deleteProofById(proofId);
            }
        });
 
        this.syncPeriodButton();
        this.syncActiveCabangUi();
    },
 
    /* ---------- Bukti foto DOM inject (allowlist: tidak ubah table.html) ---------- */
 
    ensureProofDom(){
        const noteLabel = document.getElementById("setoran3OwnerNoteLabel");
        if(noteLabel && !document.getElementById("setoran3OwnerRequestProofWrap")){
            const wrap = document.createElement("label");
            wrap.id = "setoran3OwnerRequestProofWrap";
            wrap.className = "setoran3-proof-check";
            wrap.hidden = true;
            wrap.innerHTML = `
                <input type="checkbox" id="setoran3OwnerRequestProof">
                <span>WAJIBKAN BUKTI FOTO / STRUK</span>
            `;
            noteLabel.insertAdjacentElement("afterend", wrap);
        }
 
        const ownerForm = document.getElementById("setoran3OwnerForm");
        if(ownerForm && !document.getElementById("setoran3OwnerProofBox")){
            const box = document.createElement("div");
            box.id = "setoran3OwnerProofBox";
            box.className = "setoran3-proof-view";
            box.hidden = true;
            const noteRo = document.getElementById("setoran3OwnerNoteReadonly");
            if(noteRo) noteRo.insertAdjacentElement("beforebegin", box);
            else noteLabel?.insertAdjacentElement("beforebegin", box);
        }
 
        const cancelBtn = ownerForm?.querySelector(".qris-reco-form-actions .qris-reco-btn-ghost[data-s3-close]");
        if(cancelBtn) cancelBtn.classList.add("setoran3-owner-cancel");
 
        const formCard = document.getElementById("setoran3SpvFormCard");
        if(formCard){
            const proofPanelHtml = `
                <p class="setoran3-proof-alert" id="setoran3ProofAlert">⚠ OWNER MEMINTA BUKTI FOTO / STRUK</p>
                <div class="setoran3-proof-owner-note" id="setoran3ProofOwnerNoteWrap">
                    <strong>Catatan Owner</strong>
                    <div id="setoran3ProofOwnerNoteText">—</div>
                </div>
                <div class="setoran3-proof-head">
                    <h5 class="setoran3-proof-title">BUKTI FOTO / STRUK</h5>
                    <strong id="setoran3ProofCount" class="setoran3-proof-count">0 / 5 FOTO</strong>
                </div>
                <p class="setoran3-proof-hint" id="setoran3ProofHint">JPG / PNG / WEBP · maks 5 MB/file · maks 5 foto.</p>
                <div class="setoran3-proof-actions" id="setoran3ProofUploadActions">
                    <button type="button" class="setoran3-proof-btn setoran3-proof-btn-primary" data-s3-proof-action="camera">AMBIL FOTO</button>
                    <button type="button" class="setoran3-proof-btn setoran3-proof-btn-ghost" data-s3-proof-action="pick">PILIH DARI GALERI</button>
                </div>
                <input type="file" id="setoran3ProofCamera" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>
                <input type="file" id="setoran3ProofFile" accept="image/jpeg,image/png,image/webp" multiple hidden>
                <p id="setoran3ProofError" class="setoran3-proof-error" hidden></p>
                <div id="setoran3ProofGallery" class="setoran3-proof-gallery" hidden></div>
                <button type="button" id="setoran3ProofHistoryToggle" class="setoran3-proof-history-toggle" data-s3-proof-history-toggle="setoran3ProofHistoryWrap" hidden aria-expanded="false">RIWAYAT BUKTI SEBELUMNYA ▼</button>
                <div id="setoran3ProofHistoryWrap" class="setoran3-proof-history" hidden></div>
            `;
            let panel = document.getElementById("setoran3ProofPanel");
            if(!panel){
                panel = document.createElement("div");
                panel.id = "setoran3ProofPanel";
                panel.className = "setoran3-proof-panel";
                panel.hidden = true;
                panel.innerHTML = proofPanelHtml;
                const err = document.getElementById("setoran3FormError");
                const actions = formCard.querySelector(".setoran3-form-actions");
                if(err) formCard.insertBefore(panel, err);
                else if(actions) formCard.insertBefore(panel, actions);
                else formCard.appendChild(panel);
            }else if(!document.getElementById("setoran3ProofGallery")){
                panel.innerHTML = proofPanelHtml;
            }
            const fileInput = document.getElementById("setoran3ProofFile");
            if(fileInput) fileInput.multiple = true;
        }
 
        const ownerCard = document.getElementById("setoran3OwnerActionCard");
        if(ownerCard && !document.getElementById("setoran3OwnerCardProof")){
            const box = document.createElement("div");
            box.id = "setoran3OwnerCardProof";
            box.className = "setoran3-proof-view";
            box.hidden = true;
            const btns = document.getElementById("setoran3OwnerActionBtns");
            if(btns) ownerCard.insertBefore(box, btns);
            else ownerCard.appendChild(box);
        }
    },
 
    detectRole(){
        const raw =
            (typeof OwnerAuth !== "undefined" && OwnerAuth.profile?.role) ||
            localStorage.getItem("role") ||
            "owner";
        if(typeof OwnerAuth !== "undefined" && typeof OwnerAuth.isSpvRole === "function"){
            this.role = OwnerAuth.isSpvRole(raw) ? "spv" : "owner";
        }else{
            const n = String(raw).trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
            this.role = (n === "spv" || n === "svp") ? "spv" : "owner";
        }
        return this.role;
    },
 
    isOwner(){ return this.role === "owner"; },
    isSpv(){ return this.role === "spv"; },
 
    /* ---------- Date helpers — internal ALWAYS YYYY-MM-DD ---------- */
 
    /** Ambil YYYY-MM-DD dari string apa pun; tolak tahun rusak (<2000 / >2100). */
    normalizeIsoDate(value){
        if(value == null) return null;
        const raw = String(value).trim();
        if(!raw) return null;
 
        // Hanya terima ISO murni / awalan ISO — JANGAN parse display "05 Agu 2026"
        let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if(!m) return null;
 
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if(y < 2000 || y > 2100) return null;
        if(mo < 1 || mo > 12) return null;
        if(d < 1 || d > 31) return null;
 
        const dt = new Date(Date.UTC(y, mo - 1, d));
        if(
            dt.getUTCFullYear() !== y ||
            dt.getUTCMonth() !== mo - 1 ||
            dt.getUTCDate() !== d
        ) return null;
 
        return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    },
 
    isValidIsoDate(value){
        return Boolean(this.normalizeIsoDate(value));
    },
 
    parseIsoParts(iso){
        const n = this.normalizeIsoDate(iso);
        if(!n) return null;
        const m = n.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
    },
 
    /** Hari ini lokal browser/HP → YYYY-MM-DD (TANPA UTC conversion). */
    todayIsoLocal(){
        const n = new Date();
        const y = n.getFullYear();
        const m = String(n.getMonth() + 1).padStart(2, "0");
        const d = String(n.getDate()).padStart(2, "0");
        return this.normalizeIsoDate(`${y}-${m}-${d}`);
    },
 
    defaultPeriodRange(){
        const end = this.todayIsoLocal();
        const start = this.addDaysIso(end, -2);
        return { start, end };
    },
 
    applyDefaultPeriodToDom(){
        const { start, end } = this.defaultPeriodRange();
        const startEl = document.getElementById("qrisRecoStart");
        const endEl = document.getElementById("qrisRecoEnd");
        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;
        this.periodSuggestPending = true;
        return { start, end };
    },
 
    /** Closed ranges [aStart,aEnd] vs [bStart,bEnd] — inclusive overlap. */
    periodsOverlap(aStart, aEnd, bStart, bEnd){
        const as = this.normalizeIsoDate(aStart);
        const ae = this.normalizeIsoDate(aEnd);
        const bs = this.normalizeIsoDate(bStart);
        const be = this.normalizeIsoDate(bEnd);
        if(!as || !ae || !bs || !be) return false;
        return as <= be && bs <= ae;
    },
 
    formatOverlapBlockMessage(conflict){
        const ps = this.formatPeriodDate(conflict?.period_start);
        const pe = this.formatPeriodDate(conflict?.period_end);
        return (
            "Periode ini bentrok dengan Setoran 3 Harian yang sudah ada:\n" +
            `${ps} – ${pe}.\n` +
            "Pilih periode lain."
        );
    },
 
    /**
     * READ — cari record lain cabang sama yang overlap range.
     * excludeId: id row yang sedang diedit (self-match diabaikan).
     */
    async findPeriodOverlap({ cabangId, start, end, excludeId = null } = {}){
        const s = this.normalizeIsoDate(start);
        const e = this.normalizeIsoDate(end);
        const id = Number(cabangId);
        if(!id || !s || !e || s > e) return null;
        if(typeof db === "undefined") return null;
 
        let q = db
            .from(this.TABLE)
            .select("id,cabang_id,period_start,period_end,status")
            .eq("cabang_id", id)
            .lte("period_start", e)
            .gte("period_end", s)
            .limit(5);
        if(excludeId){
            q = q.neq("id", excludeId);
        }
        const { data, error } = await q;
        if(error){
            if(/setoran_3_harian|schema cache|does not exist/i.test(error.message || "")){
                return null;
            }
            throw error;
        }
        const hit = (data || []).find((r) =>
            this.periodsOverlap(s, e, r.period_start, r.period_end)
            && (!excludeId || String(r.id) !== String(excludeId))
        );
        return hit || null;
    },
 
    async fetchLatestPeriodEnd(cabangId){
        const id = Number(cabangId);
        if(!id || typeof db === "undefined") return null;
        const { data, error } = await db
            .from(this.TABLE)
            .select("period_end")
            .eq("cabang_id", id)
            .order("period_end", { ascending: false })
            .limit(1)
            .maybeSingle();
        if(error){
            if(/setoran_3_harian|schema cache|does not exist/i.test(error.message || "")){
                return null;
            }
            throw error;
        }
        return this.normalizeIsoDate(data?.period_end) || null;
    },
 
    /**
     * Suggestion only: latest period_end + 1 → +2 hari (jendela 3 hari).
     * Fallback: defaultPeriodRange() jika belum ada histori cabang.
     */
    async suggestNextPeriodRange(cabangId){
        const latestEnd = await this.fetchLatestPeriodEnd(cabangId);
        if(!latestEnd) return this.defaultPeriodRange();
        const start = this.addDaysIso(latestEnd, 1);
        if(!start) return this.defaultPeriodRange();
        const end = this.addDaysIso(start, 2);
        if(!end) return this.defaultPeriodRange();
        return { start, end };
    },
 
    async applySuggestedPeriodIfPending(){
        if(!this.periodSuggestPending) return false;
        this.periodSuggestPending = false;
        const cabangId = this.activeCabangId != null
            ? Number(this.activeCabangId)
            : null;
        if(!cabangId) return false;
 
        /* Jangan timpa jika user sudah di histori / filter non-default */
        const current = this.readPeriodFromDom();
        const bare = this.defaultPeriodRange();
        const stillBareDefault = Boolean(
            current.start
            && current.end
            && current.start === bare.start
            && current.end === bare.end
        );
        if(!stillBareDefault) return false;
 
        const suggested = await this.suggestNextPeriodRange(cabangId);
        if(!suggested?.start || !suggested?.end) return false;
        if(suggested.start === current.start && suggested.end === current.end) return false;
 
        const startEl = document.getElementById("qrisRecoStart");
        const endEl = document.getElementById("qrisRecoEnd");
        if(startEl) startEl.value = suggested.start;
        if(endEl) endEl.value = suggested.end;
        this.saveFilter();
        this.syncPeriodButton();
        return true;
    },
 
    clearCorruptFilterStorage(){
        try{ localStorage.removeItem(this.FILTER_KEY); }catch(_e){ /* ignore */ }
    },
 
    formatPeriodDate(iso){
        const p = this.parseIsoParts(iso);
        if(!p) return "—";
        const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
        return `${String(p.d).padStart(2, "0")} ${months[p.mo - 1]} ${p.y}`;
    },
 
    formatPeriodLong(iso){
        const p = this.parseIsoParts(iso);
        if(!p) return "—";
        const months = [
            "Januari","Februari","Maret","April","Mei","Juni",
            "Juli","Agustus","September","Oktober","November","Desember"
        ];
        return `${String(p.d).padStart(2, "0")} ${months[p.mo - 1]} ${p.y}`;
    },
 
    formatPeriodButtonLabel(start, end){
        const s = this.normalizeIsoDate(start);
        const e = this.normalizeIsoDate(end);
        if(s && e){
            return `📅 ${this.formatPeriodDate(s)} — ${this.formatPeriodDate(e)}`;
        }
        return "📅 PILIH PERIODE";
    },
 
    addDaysIso(iso, days){
        const p = this.parseIsoParts(iso);
        if(!p) return "";
        const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d));
        dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
        const d = String(dt.getUTCDate()).padStart(2, "0");
        return this.normalizeIsoDate(`${y}-${m}-${d}`) || "";
    },
 
    daysInclusive(start, end){
        const a = this.parseIsoParts(start);
        const b = this.parseIsoParts(end);
        if(!a || !b) return 0;
        const t0 = Date.UTC(a.y, a.mo - 1, a.d);
        const t1 = Date.UTC(b.y, b.mo - 1, b.d);
        return Math.floor((t1 - t0) / 86400000) + 1;
    },
 
    monthBoundsFromIso(iso){
        const p = this.parseIsoParts(iso);
        if(!p) return null;
        const last = new Date(Date.UTC(p.y, p.mo, 0)).getUTCDate();
        const mm = String(p.mo).padStart(2, "0");
        return {
            start: `${p.y}-${mm}-01`,
            end: `${p.y}-${mm}-${String(last).padStart(2, "0")}`,
            year: p.y,
            month: p.mo,
            lastDay: last
        };
    },
 
    formatRupiah(nilai){
        if(nilai === null || nilai === undefined || nilai === "") return "—";
        return "Rp" + Number(nilai || 0).toLocaleString("id-ID");
    },
 
    /** Canonical engine — jangan hitung rumus uang cabang di luar ini. */
    branchMoney(row){
        if(typeof SetoranMoneyEngine === "undefined" || typeof SetoranMoneyEngine.calculateBranchMoney !== "function"){
            throw new Error("SetoranMoneyEngine tidak termuat — canonical money engine wajib.");
        }
        return SetoranMoneyEngine.calculateBranchMoney(row);
    },
 
    nettRevenueErp(row){
        return this.branchMoney(row).netRevenueErp;
    },
 
    cashReferensi(row){
        return this.branchMoney(row).cashReference;
    },

    /**
     * Owner take = current CLEAR / DONE. ever_cleared after reopen is not current take.
     * Presentation only — does not change workflow status values.
     */
    isOwnerTaken(row){
        if(!row) return false;
        return row.status === this.STATUS.CLEAR || row.status === this.STATUS.DONE;
    },

    /**
     * Frozen SPV actual at Owner CLEAR. cashReference at CLEAR is not stored.
     * Owner cannot change setoran_cash_actual after submit / CLEAR.
     */
    ownerTakenAmount(row){
        if(!row) return null;
        const raw = row.setoran_cash_actual;
        if(raw === null || raw === undefined || raw === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    },

    /** Existing CLEAR timestamps only — last_cleared_at, else owner_approved_at. */
    ownerTakenAt(row){
        if(!row) return null;
        return row.last_cleared_at || row.owner_approved_at || null;
    },

    ownerTakenDateIso(row){
        const ts = this.ownerTakenAt(row);
        if(!ts) return null;
        return this.normalizeIsoDate(String(ts).slice(0, 10));
    },

    /** CLEAR date (ISO yyyy-mm-dd from stored timestamptz) before period_end. */
    isEarlyOwnerTake(row){
        const takenDate = this.ownerTakenDateIso(row);
        const periodEnd = this.normalizeIsoDate(row?.period_end);
        if(!takenDate || !periodEnd) return false;
        return takenDate < periodEnd;
    },

    /**
     * Keep selisih = actual − liveCashRef.
     * When already taken and live moved: surface live − actual as informational change.
     */
    ownerTakeView(row, liveCashRef){
        const taken = this.isOwnerTaken(row);
        const amount = this.ownerTakenAmount(row);
        const takenAt = this.ownerTakenAt(row);
        const live = Number(liveCashRef || 0);
        const selisih = amount == null ? null : amount - live;
        const changeAfterTake = (taken && amount != null) ? live - amount : null;
        const liveChanged = changeAfterTake != null && changeAfterTake !== 0;
        const early = taken && this.isEarlyOwnerTake(row);
        const infoDelta = taken && (early || liveChanged);
        return {
            taken,
            amount,
            takenAt,
            live,
            selisih,
            changeAfterTake,
            liveChanged,
            early,
            infoDelta
        };
    },

    ownerTakeNoteText(view){
        if(!view?.taken) return "";
        if(view.early){
            return "Setoran sudah diambil Owner sebelum batas maksimal periode berakhir. Perubahan Cash Referensi setelah pengambilan berasal dari transaksi/data yang masuk setelah uang diambil.";
        }
        if(view.liveChanged){
            return "Setoran sudah diambil Owner. Perubahan Cash Referensi setelah pengambilan berasal dari transaksi/data yang masuk setelah uang diambil.";
        }
        return "Setoran sudah diambil Owner. Cash Referensi live di bawah tidak menagih ulang nominal yang sudah diambil.";
    },

    ownerTakenPanelHtml(row, liveCashRef){
        const view = this.ownerTakeView(row, liveCashRef);
        if(!view.taken) return "";
        const when = view.takenAt ? this.formatStampDateTime(view.takenAt) : "—";
        const changeVal = view.changeAfterTake == null
            ? "—"
            : this.formatRupiah(view.changeAfterTake);
        const changeNote = view.liveChanged
            ? "bukan kekurangan setoran"
            : "live sama dengan nominal pengambilan";
        const note = this.ownerTakeNoteText(view);
        const wf = row.status === this.STATUS.DONE ? "DONE" : "CLEAR";
        return `
            <div class="setoran3-taken-card">
                <div class="setoran3-taken-head">
                    <span class="qris-reco-badge sesuai">SUDAH DIAMBIL OWNER</span>
                    <small>Workflow ${escapeHtmlS3(wf)} · ${escapeHtmlS3(when)}</small>
                </div>
                <div class="setoran3-taken-kpis">
                    <div class="setoran3-work-kpi is-actual">
                        <span>Nominal saat pengambilan</span>
                        <strong>${this.formatRupiah(view.amount)}</strong>
                        <em>uang yang diambil saat Owner CLEAR</em>
                    </div>
                    <div class="setoran3-work-kpi is-ref">
                        <span>Cash Referensi live</span>
                        <strong>${this.formatRupiah(view.live)}</strong>
                        <em>nilai Minutes saat ini</em>
                    </div>
                    <div class="setoran3-work-kpi is-selisih ${view.infoDelta ? "is-info" : (view.changeAfterTake === 0 ? "is-ok" : "")}">
                        <span>${view.infoDelta ? "Perubahan setelah pengambilan" : "Selisih"}</span>
                        <strong>${changeVal}</strong>
                        <em>${escapeHtmlS3(changeNote)}</em>
                    </div>
                </div>
                ${note ? `<p class="setoran3-taken-note">${escapeHtmlS3(note)}</p>` : ""}
            </div>
        `;
    },

    renderOwnerTakenPanels(row, liveCashRef){
        const html = this.ownerTakenPanelHtml(row, liveCashRef);
        ["setoran3OwnerTakenPanel", "setoran3OwnerTakenWork"].forEach((id) => {
            const el = document.getElementById(id);
            if(!el) return;
            if(!html){
                el.hidden = true;
                el.innerHTML = "";
                return;
            }
            el.hidden = false;
            el.innerHTML = html;
        });
    },
 
    pctChange(curr, prev){
        if(prev === null || prev === undefined) return null;
        if(Number(prev) === 0){
            if(Number(curr) === 0) return 0;
            return null; // tidak bisa % dari baseline 0
        }
        return ((Number(curr) - Number(prev)) / Number(prev)) * 100;
    },
 
    formatPct(p){
        if(p === null || p === undefined || Number.isNaN(p)) return "—";
        const sign = p > 0 ? "+" : "";
        return `${sign}${p.toFixed(0)}%`;
    },
 
    /* ---------- Filter / period / cabang ---------- */
 
    readPeriodFromDom(){
        return {
            start: this.normalizeIsoDate(document.getElementById("qrisRecoStart")?.value),
            end: this.normalizeIsoDate(document.getElementById("qrisRecoEnd")?.value)
        };
    },
 
    getFilter(){
        let { start, end } = this.readPeriodFromDom();
 
        if(!start || !end || start > end){
            const def = this.applyDefaultPeriodToDom();
            start = def.start;
            end = def.end;
        }
 
        return {
            start,
            end,
            cabangId: this.activeCabangId != null ? Number(this.activeCabangId) : null
        };
    },
 
    isValidDateRange(start, end){
        const s = this.normalizeIsoDate(start);
        const e = this.normalizeIsoDate(end);
        return Boolean(s && e && s <= e);
    },
 
    /** Handoff KPI hanya sekali — Ctrl+R wajib pakai FILTER_KEY. */
    consumeHandoff(){
        try{
            const raw = localStorage.getItem(this.HANDOFF_KEY);
            if(!raw) return;
            const handoff = JSON.parse(raw);
            if(!handoff || typeof handoff !== "object") return;
            if(handoff.consumed === true) return;
            handoff.consumed = true;
            handoff.consumedAt = new Date().toISOString();
            localStorage.setItem(this.HANDOFF_KEY, JSON.stringify(handoff));
        }catch(_e){ /* ignore */ }
    },
 
    saveFilter(){
        try{
            // Jangan panggil getFilter() — applyDefaultPeriodToDom bisa menimpa persisted value
            const { start, end } = this.readPeriodFromDom();
            const s = this.normalizeIsoDate(start);
            const e = this.normalizeIsoDate(end);
            if(!s || !e || s > e) return;
 
            const cabangId = this.activeCabangId != null
                ? Number(this.activeCabangId)
                : (this.pendingCabangId != null ? Number(this.pendingCabangId) : null);
            const cabang = cabangId != null
                ? this.cabangList.find(c => Number(c.id) === Number(cabangId))
                : null;
            const cabangName = cabang
                ? String(cabang.display_name || cabang.nama_cabang || "")
                : (this.persistedCabangName || null);
 
            localStorage.setItem(this.FILTER_KEY, JSON.stringify({
                start: s,
                end: e,
                cabangId: cabangId != null && !Number.isNaN(cabangId) ? cabangId : null,
                cabangName: cabangName || null,
                periode: this.persistedPeriode || null
            }));
        }catch(_e){ /* ignore */ }
    },
 
    restoreFilter(){
        this.pendingCabangId = null;
        try{
            // Urutan WAJIB:
            // 1) URL drilldown (navigasi KPI saat ini)
            // 2) handoff KPI yang BELUM di-consume
            // 3) persisted FILTER_KEY (Ctrl+R)
            // 4) default — hanya jika belum ada persisted
            const q = new URLSearchParams(window.location.search || "");
            let handoff = null;
            try{ handoff = JSON.parse(localStorage.getItem(this.HANDOFF_KEY) || "null"); }
            catch(_e){ handoff = null; }
 
            const hasUrlFilter = Boolean(q.get("start") || q.get("end") || q.get("cabangId"));
            const handoffFresh = Boolean(
                handoff
                && handoff.consumed !== true
                && (
                    handoff.source === "dashboard-kpi-branch"
                    || handoff.menu === "qris"
                    || handoff.focus === "qris"
                    || handoff.start
                    || handoff.end
                    || handoff.cabangId
                )
            );
 
            let start = null;
            let end = null;
            let cabangRaw = null;
            let cabangName = null;
            let periode = null;
            let fromNav = false;
 
            if(hasUrlFilter){
                start = this.normalizeIsoDate(q.get("start"));
                end = this.normalizeIsoDate(q.get("end"));
                cabangRaw = q.get("cabangId");
                cabangName = q.get("cabangName") || null;
                periode = q.get("periode") || null;
                if(handoffFresh){
                    if(!start) start = this.normalizeIsoDate(handoff?.start);
                    if(!end) end = this.normalizeIsoDate(handoff?.end);
                    if(cabangRaw === null || cabangRaw === undefined || cabangRaw === ""){
                        cabangRaw = handoff?.cabangId;
                    }
                    if(!cabangName) cabangName = handoff?.cabangName || null;
                    if(!periode) periode = handoff?.periode || null;
                }
                fromNav = true;
            }else if(handoffFresh){
                start = this.normalizeIsoDate(handoff?.start);
                end = this.normalizeIsoDate(handoff?.end);
                cabangRaw = handoff?.cabangId;
                cabangName = handoff?.cabangName || null;
                periode = handoff?.periode || null;
                fromNav = true;
            }
 
            if(!(start && end && start <= end)){
                const raw = localStorage.getItem(this.FILTER_KEY);
                if(!raw){
                    this.applyDefaultPeriodToDom();
                    this.persistedCabangName = null;
                    this.persistedPeriode = null;
                    return;
                }
                const saved = JSON.parse(raw);
                start = this.normalizeIsoDate(saved?.start);
                end = this.normalizeIsoDate(saved?.end);
                if(!start || !end || start > end){
                    this.clearCorruptFilterStorage();
                    this.applyDefaultPeriodToDom();
                    this.persistedCabangName = null;
                    this.persistedPeriode = null;
                    return;
                }
                cabangRaw = saved.cabangId;
                cabangName = saved.cabangName || null;
                periode = saved.periode || null;
                fromNav = false;
            }
 
            const startEl = document.getElementById("qrisRecoStart");
            const endEl = document.getElementById("qrisRecoEnd");
            if(startEl) startEl.value = start;
            if(endEl) endEl.value = end;
            /* Histori / URL / handoff / FILTER_KEY — jangan auto-suggest next period */
            this.periodSuggestPending = false;
            this.pendingCabangId =
                cabangRaw !== null && cabangRaw !== undefined && cabangRaw !== ""
                    ? Number(cabangRaw)
                    : null;
            this.persistedCabangName = cabangName ? String(cabangName) : null;
            this.persistedPeriode = periode ? String(periode) : null;
 
            // Navigasi KPI/URL → simpan sebagai current persisted, lalu consume handoff
            // agar Ctrl+R berikutnya tidak menimpa pilihan Owner.
            if(fromNav){
                this.saveFilter();
                this.consumeHandoff();
            }
        }catch(_e){
            this.clearCorruptFilterStorage();
            this.applyDefaultPeriodToDom();
            this.pendingCabangId = null;
            this.persistedCabangName = null;
            this.persistedPeriode = null;
        }
    },
 
    syncPeriodButton(){
        const btn = document.getElementById("setoran3PeriodBtn");
        if(!btn) return;
        const { start, end } = this.getFilter();
        btn.textContent = this.formatPeriodButtonLabel(start, end);
        btn.title = `Periode aktif: ${this.formatPeriodDate(start)} — ${this.formatPeriodDate(end)}`;
    },
 
    /* Kunci scroll halaman saat modal terbuka — tanpa reset posisi scroll */
    lockPageScroll(){
        this.modalScrollLockCount = Math.max(0, Number(this.modalScrollLockCount || 0)) + 1;
        if(this.modalScrollLockCount === 1){
            document.documentElement.classList.add("setoran3-modal-open");
            document.body.classList.add("setoran3-modal-open");
        }
    },
 
    unlockPageScroll(){
        this.modalScrollLockCount = Math.max(0, Number(this.modalScrollLockCount || 0) - 1);
        if(this.modalScrollLockCount === 0){
            document.documentElement.classList.remove("setoran3-modal-open");
            document.body.classList.remove("setoran3-modal-open");
        }
    },
 
    isPeriodCalOpen(){
        const modal = document.getElementById("setoran3PeriodModal");
        return Boolean(modal && !modal.hidden);
    },
 
    openPeriodModal(){
        const modal = document.getElementById("setoran3PeriodModal");
        if(!modal) return;
        const { start, end } = this.getFilter();
        const errEl = document.getElementById("setoran3PeriodError");
 
        this.draftStart = start || null;
        this.draftEnd = (start && end && end >= start) ? end : null;
 
        const seed = this.draftStart || this.todayIsoLocal();
        this.viewYear = Number(String(seed).slice(0, 4));
        this.viewMonth = Number(String(seed).slice(5, 7)) - 1;
 
        if(errEl){ errEl.hidden = true; errEl.textContent = ""; }
 
        const wasHidden = modal.hidden;
        modal.hidden = false;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        if(wasHidden) this.lockPageScroll();
 
        this.renderPeriodCustomCalendar();
        this.syncPeriodCalPreview();
    },
 
    closePeriodModal(){
        const modal = document.getElementById("setoran3PeriodModal");
        if(!modal || modal.hidden) return;
        modal.hidden = true;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        this.unlockPageScroll();
        /* Draft dibuang — periode aktif (qrisRecoStart/End) tidak berubah */
        this.draftStart = null;
        this.draftEnd = null;
    },
 
    shiftPeriodCalMonth(delta){
        if(this.viewYear == null || this.viewMonth == null) return;
        const d = new Date(Date.UTC(this.viewYear, this.viewMonth + delta, 1));
        this.viewYear = d.getUTCFullYear();
        this.viewMonth = d.getUTCMonth();
        this.renderPeriodCustomCalendar();
    },
 
    jumpPeriodCalToday(){
        const today = this.todayIsoLocal();
        if(!today) return;
        this.viewYear = Number(String(today).slice(0, 4));
        this.viewMonth = Number(String(today).slice(5, 7)) - 1;
        this.draftStart = today;
        this.draftEnd = today;
        this.renderPeriodCustomCalendar();
        this.syncPeriodCalPreview();
    },
 
    onPeriodCalDayClick(isoRaw){
        const iso = this.normalizeIsoDate(isoRaw);
        if(!iso) return;
        if(!this.draftStart || (this.draftStart && this.draftEnd)){
            this.draftStart = iso;
            this.draftEnd = null;
        }else if(iso < this.draftStart){
            this.draftEnd = this.draftStart;
            this.draftStart = iso;
        }else{
            this.draftEnd = iso;
        }
        this.renderPeriodCustomCalendar();
        this.syncPeriodCalPreview();
    },
 
    renderPeriodCustomCalendar(){
        const grid = document.getElementById("s3PeriodCalDays");
        const label = document.getElementById("s3PeriodCalMonthLabel");
        if(!grid || this.viewYear == null || this.viewMonth == null) return;
 
        const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
        if(label) label.textContent = `${monthNames[this.viewMonth]} ${this.viewYear}`;
 
        const today = this.todayIsoLocal();
        const first = new Date(Date.UTC(this.viewYear, this.viewMonth, 1));
        const jsDay = first.getUTCDay();
        const mondayIndex = (jsDay + 6) % 7;
        const daysInMonth = new Date(Date.UTC(this.viewYear, this.viewMonth + 1, 0)).getUTCDate();
 
        let html = "";
        for(let i = 0; i < mondayIndex; i++){
            html += `<span class="s3-period-cal-day is-empty" aria-hidden="true"></span>`;
        }
        for(let day = 1; day <= daysInMonth; day++){
            const iso = `${this.viewYear}-${String(this.viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const classes = ["s3-period-cal-day"];
            if(iso === today) classes.push("is-today");
            if(this.draftStart && iso === this.draftStart) classes.push("is-start");
            if(this.draftEnd && iso === this.draftEnd) classes.push("is-end");
            if(
                this.draftStart
                && this.draftEnd
                && iso > this.draftStart
                && iso < this.draftEnd
            ){
                classes.push("is-in-range");
            }
            html += `<button type="button" class="${classes.join(" ")}" data-s3-period-cal-day="${iso}">${day}</button>`;
        }
        grid.innerHTML = html;
    },
 
    syncPeriodCalPreview(){
        const preview = document.getElementById("s3PeriodCalPreview");
        const applyBtn = document.getElementById("setoran3PeriodApply");
        const valid = Boolean(
            this.draftStart
            && this.draftEnd
            && this.draftEnd >= this.draftStart
        );
        if(preview){
            if(this.draftStart && this.draftEnd){
                preview.textContent =
                    `${this.formatPeriodDate(this.draftStart)} — ${this.formatPeriodDate(this.draftEnd)}`;
            }else if(this.draftStart){
                preview.textContent =
                    `${this.formatPeriodDate(this.draftStart)} — pilih tanggal akhir`;
            }else{
                preview.textContent = "Pilih tanggal awal, lalu tanggal akhir";
            }
        }
        if(applyBtn) applyBtn.disabled = !valid;
    },
 
    /**
     * Terapkan periode ISO ke DOM + localStorage + refresh Setoran & QRIS.
     * HARI INI: start=end=today (1 hari).
     * PILIH PERIODE: start/end dari draft custom calendar.
     */
    async applyPeriodRange(startRaw, endRaw, { closeModal = false } = {}){
        const start = this.normalizeIsoDate(startRaw);
        const end = this.normalizeIsoDate(endRaw);
        if(!start || !end || start > end){
            return false;
        }
 
        const startEl = document.getElementById("qrisRecoStart");
        const endEl = document.getElementById("qrisRecoEnd");
        this.suppressFilterEvents = true;
        if(typeof QrisReconciliation !== "undefined"){
            QrisReconciliation.suppressFilterEvents = true;
        }
        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;
        this.suppressFilterEvents = false;
        if(typeof QrisReconciliation !== "undefined"){
            QrisReconciliation.suppressFilterEvents = false;
        }
 
        this.saveFilter();
        this.syncPeriodButton();
        /* Default Ringkasan Semua Cabang mengikuti periode aktif — jangan timpa jika Owner sudah pilih sendiri */
        if(!this.allBranchesPeriodTouched){
            this.allBranchesStart = start;
            this.allBranchesEnd = end;
        }
        if(closeModal) this.closePeriodModal();
        await this.load({ quiet: true });
        this.reloadQrisQuiet();
        return true;
    },
 
    /** HARI INI = 1 hari saja (bukan +2). */
    async applyTodayPeriod(){
        const today = this.todayIsoLocal();
        if(!today){
            alert("Tanggal hari ini tidak valid.");
            return;
        }
        const btn = document.getElementById("setoran3TodayBtn");
        if(btn) btn.disabled = true;
        try{
            await this.applyPeriodRange(today, today, { closeModal: true });
        }finally{
            if(btn) btn.disabled = false;
        }
    },
 
    async applyPeriodFromModal(){
        const start = this.normalizeIsoDate(this.draftStart);
        const end = this.normalizeIsoDate(this.draftEnd);
        const errEl = document.getElementById("setoran3PeriodError");
        const showErr = (msg) => {
            if(!errEl) return;
            errEl.hidden = false;
            errEl.textContent = msg;
        };
 
        if(!start || !end){
            showErr("Pilih tanggal awal dan tanggal akhir di kalender.");
            return;
        }
        if(start > end){
            showErr("Tanggal awal tidak boleh lebih besar dari tanggal akhir.");
            return;
        }
 
        await this.applyPeriodRange(start, end, { closeModal: true });
    },
 
    syncCabangToQris(){
        const dst = document.getElementById("qrisRecoCabang");
        if(!dst || !this.cabangList.length) return;
        if(typeof QrisReconciliation !== "undefined"){
            QrisReconciliation.suppressFilterEvents = true;
        }
        dst.innerHTML = this.cabangList.map(c =>
            `<option value="${c.id}">${escapeHtmlS3(c.display_name || c.nama_cabang)}</option>`
        ).join("");
        if(this.activeCabangId != null){
            dst.value = String(this.activeCabangId);
        }
        if(typeof QrisReconciliation !== "undefined"){
            QrisReconciliation.cabangList = [...this.cabangList];
            QrisReconciliation.suppressFilterEvents = false;
        }
    },
 
    reloadQrisQuiet(){
        if(typeof QrisReconciliation !== "undefined" && typeof QrisReconciliation.load === "function"){
            QrisReconciliation.load({ quiet: true }).catch(() => {});
        }
    },
 
    resolveActiveCabangId(){
        if(!this.cabangList.length){
            this.activeCabangId = null;
            return null;
        }
        const preferred = this.pendingCabangId != null
            ? Number(this.pendingCabangId)
            : (this.activeCabangId != null ? Number(this.activeCabangId) : null);
 
        if(preferred != null && this.cabangList.some(c => Number(c.id) === preferred)){
            this.activeCabangId = preferred;
        }else{
            // Fallback: Kalijati = index 0 urutan operasional
            this.activeCabangId = Number(this.cabangList[0].id);
        }
        this.pendingCabangId = null;
        const cabang = this.getActiveCabang();
        if(cabang){
            this.persistedCabangName = String(cabang.display_name || cabang.nama_cabang || "");
        }
        return this.activeCabangId;
    },
 
    getActiveCabang(){
        if(this.activeCabangId == null) return null;
        return this.cabangList.find(c => Number(c.id) === Number(this.activeCabangId)) || null;
    },
 
    getActiveCabangIndex(){
        if(this.activeCabangId == null || !this.cabangList.length) return -1;
        return this.cabangList.findIndex(c => Number(c.id) === Number(this.activeCabangId));
    },
 
    syncActiveCabangUi(){
        const nameEl = document.getElementById("setoran3ActiveCabang");
        const prev = document.getElementById("setoran3PrevCabang");
        const next = document.getElementById("setoran3NextCabang");
        const cabang = this.getActiveCabang();
        const idx = this.getActiveCabangIndex();
 
        if(nameEl){
            nameEl.textContent = cabang
                ? String(cabang.display_name || cabang.nama_cabang).toUpperCase()
                : "—";
        }
        if(prev) prev.disabled = !this.cabangList.length || idx <= 0;
        if(next) next.disabled = !this.cabangList.length || idx < 0 || idx >= this.cabangList.length - 1;
        this.syncCabangToQris();
    },
 
    async setActiveCabang(cabangId, { reload = true } = {}){
        const id = Number(cabangId);
        if(!this.cabangList.some(c => Number(c.id) === id)) return;
        this.activeCabangId = id;
        const cabang = this.getActiveCabang();
        this.persistedCabangName = cabang
            ? String(cabang.display_name || cabang.nama_cabang || "")
            : null;
        this.syncActiveCabangUi();
        this.saveFilter();
        if(reload){
            await this.load({ quiet: true });
            this.reloadQrisQuiet();
        }
    },
 
    async shiftCabang(dir){
        if(!this.cabangList.length) return;
        let idx = this.getActiveCabangIndex();
        if(idx < 0) idx = 0;
        const nextIdx = idx + Number(dir || 0);
        // Tidak looping: batas Kalijati / Mekarwangi
        if(nextIdx < 0 || nextIdx >= this.cabangList.length) return;
        await this.setActiveCabang(this.cabangList[nextIdx].id);
    },
 
    /* ---------- Cabang order / load ---------- */
 
    normalizeName(s){
        return String(s || "")
            .toLowerCase()
            .replace(/barbershop/g, "")
            .replace(/vax\s*wijaya/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    },
 
    matchOrderIndex(cabang){
        const hay = `${this.normalizeName(cabang.nama_cabang)} ${this.normalizeName(cabang.nama_minutes)}`;
        for(let i = 0; i < this.CABANG_ORDER.length; i++){
            const aliases = this.CABANG_ORDER[i].aliases;
            if(aliases.some(a => hay.includes(this.normalizeName(a)))) return i;
        }
        return 999;
    },
 
    displayCabangName(cabang){
        const idx = this.matchOrderIndex(cabang);
        if(idx < this.CABANG_ORDER.length) return this.CABANG_ORDER[idx].label;
        return cabang.nama_cabang;
    },
 
    filterOperationalCabang(rows, { requireMinutesName = true } = {}){
        return (rows || []).filter((c) => {
            if(!c?.id || !c?.nama_cabang) return false;
            if(c.aktif === false) return false;
            const nama = String(c.nama_cabang).toLowerCase();
            if(nama.includes("floating")) return false;
            if(requireMinutesName){
                const minutesName = String(c.nama_minutes ?? "").trim();
                if(!minutesName) return false;
            }
            return true;
        });
    },
 
    sortCabangOperational(list){
        return [...list].sort((a, b) => {
            const ia = this.matchOrderIndex(a);
            const ib = this.matchOrderIndex(b);
            if(ia !== ib) return ia - ib;
            return Number(a.urutan || 0) - Number(b.urutan || 0) || Number(a.id) - Number(b.id);
        });
    },
 
    async loadCabangList(){
        if(
            typeof DailyDataEngine === "undefined"
            || typeof DailyDataEngine.fetchCabang !== "function"
        ){
            throw new Error("DailyDataEngine tidak termuat — canonical daily source wajib.");
        }

        const data = await DailyDataEngine.fetchCabang(db);
        this.cabangList = this.sortCabangOperational(data || []).map(c => ({
            ...c,
            display_name: this.displayCabangName(c)
        }));
    },
 
    fillCabangSelect(){
        // Alias kompatibilitas: dropdown dihapus — resolve + sync UI prev/next
        this.resolveActiveCabangId();
        this.syncActiveCabangUi();
    },
 
    /* ---------- Minutes / setoran data ---------- */
 
    async loadMinutesMap(start, end){
        if(
            typeof DailyDataEngine === "undefined"
            || typeof DailyDataEngine.load !== "function"
        ){
            throw new Error("DailyDataEngine tidak termuat — canonical daily source wajib.");
        }

        const dataset = await DailyDataEngine.load({
            client: db,
            start,
            end
        });
        const map = new Map();

        (dataset.branches || []).forEach((cabang) => {
            const cabangId = Number(cabang.id);
            const rows = (dataset.rows || []).filter(
                (row) => Number(row.cabang_id) === cabangId
            );
            const summary = DailyDataEngine.summarizeRows(rows);

            map.set(cabangId, {
                minutes_cash: Number(summary.cashPayment || 0),
                minutes_non_cash: Number(summary.nonCash || 0),
                minutes_cash_out: Number(summary.cashOut || 0)
            });
        });

        return map;
    },
 
    async loadSavedMap(start, end){
        const { data, error } = await db
            .from(this.TABLE)
            .select("*")
            .eq("period_start", start)
            .eq("period_end", end);
        if(error){
            if(/setoran_3_harian|schema cache|does not exist/i.test(error.message || "")){
                return new Map();
            }
            throw error;
        }
 
        const rows = data || [];
        const ids = rows.map(r => r.id).filter(Boolean);
        const receiptMap = new Map();
 
        if(ids.length){
            const { data: receipts, error: receiptErr } = await db
                .from(this.RECEIPT_TABLE)
                .select("id,setoran_id,transfer_proof_id,cash_received,received_by,received_at,created_at")
                .in("setoran_id", ids);
 
            if(receiptErr){
                // Graceful pre-migration compatibility: base workflow tetap bisa dibaca.
                if(!/setoran_3_harian_receipts|schema cache|does not exist|relation/i.test(receiptErr.message || "")){
                    throw receiptErr;
                }
            }else{
                (receipts || []).forEach(r => receiptMap.set(String(r.setoran_id), r));
            }
        }
 
        const map = new Map();
        rows.forEach(r => {
            map.set(Number(r.cabang_id), {
                ...r,
                __receipt: receiptMap.get(String(r.id)) || null
            });
        });
        return map;
    },
 
    /**
     * Aggregate Minutes fields yang BENAR-BENAR ada di daily_recap_source
     * (kontrak minutes-connector/sync.js + dashboard-engine).
     */
    async loadMinutesAggregate(cabangId, start, end){
        if(
            typeof DailyDataEngine === "undefined"
            || typeof DailyDataEngine.load !== "function"
        ){
            throw new Error("DailyDataEngine tidak termuat — canonical daily source wajib.");
        }

        const dataset = await DailyDataEngine.load({
            client: db,
            start,
            end,
            cabangId
        });

        return this.sumMinutesRows(dataset.rows || []);
    },
 
    sumMinutesRows(rows){
        const sum = (f) => rows.reduce((t, r) => t + Number(r[f] || 0), 0);
        const notes = rows
            .map(r => String(r.keterangan_cash_out || "").trim())
            .filter(Boolean);
        const keterangan_cash_out = notes.join("; ");
        const nett_revenue = sum("nett_revenue");
        const product_cost = sum("product_cost");
        const non_cash = sum("non_cash");
        const parts = { nett_revenue, product_cost, non_cash };
        return {
            days: rows.length,
            cash_payment: sum("cash_payment"),
            non_cash,
            cash_out: sum("cash_out"),
            nett_revenue,
            customer: sum("customer_minutes"),
            service: sum("service"),
            produk: sum("produk"),
            product_cost,
            nett_erp: this.nettRevenueErp(parts),
            cash_referensi: this.cashReferensi(parts),
            services: sum("services_minutes"),
            keterangan_cash_out,
            /* Rincian dari kontrak minutes-connector/sync.js → keterangan_cash_out */
            cash_out_rincian: this.buildCashOutRincian(keterangan_cash_out, sum("cash_out"))
        };
    },
 
    /* ---------- Ringkasan Semua Cabang (READ-ONLY, independen dari laporan SPV) ---------- */
 
    emptyAllBranchesAggregate(){
        return {
            nett_revenue: 0,
            product_cost: 0,
            nett_erp: 0,
            cash_referensi: 0,
            cash_out: 0,
            non_cash: 0,
            cash_payment: 0,
            days: 0,
            source_ok: false
        };
    },
 
    ensureAllBranchesPeriod(activeStart, activeEnd){
        if(
            this.allBranchesPeriodTouched
            && this.isValidDateRange(this.allBranchesStart, this.allBranchesEnd)
        ){
            return {
                start: this.allBranchesStart,
                end: this.allBranchesEnd
            };
        }
        const start = this.normalizeIsoDate(activeStart);
        const end = this.normalizeIsoDate(activeEnd);
        this.allBranchesStart = start;
        this.allBranchesEnd = end;
        return { start, end };
    },
 
    syncAllBranchesPeriodButton(){
        const btn = document.getElementById("setoran3AllBranchesPeriodBtn");
        const start = this.normalizeIsoDate(this.allBranchesStart);
        const end = this.normalizeIsoDate(this.allBranchesEnd);
        if(btn){
            btn.textContent = this.formatPeriodButtonLabel(start, end);
            btn.title = start && end
                ? `Periode ringkasan semua cabang: ${this.formatPeriodDate(start)} — ${this.formatPeriodDate(end)}`
                : "Pilih periode ringkasan semua cabang";
        }
    },
 
    isAllBranchesCalOpen(){
        const modal = document.getElementById("setoran3AllBranchesPeriodModal");
        return Boolean(modal && !modal.hidden);
    },
 
    openAllBranchesPeriodModal(){
        const modal = document.getElementById("setoran3AllBranchesPeriodModal");
        if(!modal) return;
        const errEl = document.getElementById("setoran3AllBranchesPeriodError");
        const { start: activeStart, end: activeEnd } = this.getFilter();
        const { start, end } = this.ensureAllBranchesPeriod(activeStart, activeEnd);
 
        this.allCalPickStart = start || null;
        this.allCalPickEnd = (start && end && end >= start) ? end : null;
 
        const seed = this.allCalPickStart || this.todayIsoLocal();
        this.allCalViewYear = Number(String(seed).slice(0, 4));
        this.allCalViewMonth = Number(String(seed).slice(5, 7)) - 1;
        this.allCalMonthPickYear = this.allCalViewYear;
        this.allCalMonthPickMonth = null;
 
        if(errEl){
            errEl.hidden = true;
            errEl.textContent = "";
        }
 
        modal.hidden = false;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("s3-all-cal-open");
 
        this.setAllBranchesCalMode("range", { silent: true });
        this.renderAllBranchesCustomCalendar();
        this.renderAllBranchesMonthPicker();
        this.syncAllBranchesCalPreview();
    },
 
    closeAllBranchesPeriodModal(){
        const modal = document.getElementById("setoran3AllBranchesPeriodModal");
        if(modal){
            modal.hidden = true;
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
        }
        document.body.classList.remove("s3-all-cal-open");
    },
 
    setAllBranchesCalMode(mode, opts = {}){
        const next = mode === "month" ? "month" : "range";
        this.allCalMode = next;
 
        document.querySelectorAll("[data-s3-all-cal-mode]").forEach((btn) => {
            const active = btn.getAttribute("data-s3-all-cal-mode") === next;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        });
 
        const rangePane = document.getElementById("s3AllCalRangePane");
        const monthPane = document.getElementById("s3AllCalMonthPane");
        if(rangePane){
            rangePane.hidden = next !== "range";
            rangePane.classList.toggle("is-active", next === "range");
        }
        if(monthPane){
            monthPane.hidden = next !== "month";
            monthPane.classList.toggle("is-active", next === "month");
        }
 
        if(next === "month"){
            if(this.allCalMonthPickYear == null){
                const seed = this.allCalPickStart || this.todayIsoLocal();
                this.allCalMonthPickYear = Number(String(seed).slice(0, 4));
            }
            if(this.allCalMonthPickMonth != null){
                this.applyAllBranchesMonthPickToRange(
                    this.allCalMonthPickYear,
                    this.allCalMonthPickMonth
                );
            }
            this.renderAllBranchesMonthPicker();
        }else{
            this.renderAllBranchesCustomCalendar();
        }
        this.syncAllBranchesCalPreview();
    },
 
    shiftAllBranchesCalMonth(delta){
        if(this.allCalViewYear == null || this.allCalViewMonth == null) return;
        const d = new Date(Date.UTC(this.allCalViewYear, this.allCalViewMonth + delta, 1));
        this.allCalViewYear = d.getUTCFullYear();
        this.allCalViewMonth = d.getUTCMonth();
        this.renderAllBranchesCustomCalendar();
    },
 
    shiftAllBranchesMonthPickerYear(delta){
        if(this.allCalMonthPickYear == null) return;
        this.allCalMonthPickYear += delta;
        if(this.allCalMonthPickMonth >= 1 && this.allCalMonthPickMonth <= 12){
            this.applyAllBranchesMonthPickToRange(
                this.allCalMonthPickYear,
                this.allCalMonthPickMonth
            );
        }
        this.renderAllBranchesMonthPicker();
        this.syncAllBranchesCalPreview();
    },
 
    onAllBranchesCalDayClick(isoRaw){
        const iso = this.normalizeIsoDate(isoRaw);
        if(!iso) return;
        if(!this.allCalPickStart || (this.allCalPickStart && this.allCalPickEnd)){
            this.allCalPickStart = iso;
            this.allCalPickEnd = null;
        }else if(iso < this.allCalPickStart){
            this.allCalPickEnd = this.allCalPickStart;
            this.allCalPickStart = iso;
        }else{
            this.allCalPickEnd = iso;
        }
        this.renderAllBranchesCustomCalendar();
        this.syncAllBranchesCalPreview();
    },
 
    onAllBranchesMonthPickerClick(monthNum){
        const m = Number(monthNum);
        if(!m || m < 1 || m > 12 || this.allCalMonthPickYear == null) return;
        this.allCalMonthPickMonth = m;
        this.applyAllBranchesMonthPickToRange(this.allCalMonthPickYear, m);
        this.renderAllBranchesMonthPicker();
        this.syncAllBranchesCalPreview();
    },
 
    applyAllBranchesMonthPickToRange(year, month){
        const y = Number(year);
        const m = Number(month);
        if(!(y >= 2000 && y <= 2100) || !(m >= 1 && m <= 12)) return null;
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const mm = String(m).padStart(2, "0");
        const dd = String(lastDay).padStart(2, "0");
        const start = `${y}-${mm}-01`;
        const end = `${y}-${mm}-${dd}`;
        this.allCalMonthPickYear = y;
        this.allCalMonthPickMonth = m;
        this.allCalPickStart = start;
        this.allCalPickEnd = end;
        return { start, end, year: y, month: m };
    },
 
    renderAllBranchesMonthPicker(){
        const grid = document.getElementById("s3AllCalMonthGrid");
        const label = document.getElementById("s3AllCalMonthYearLabel");
        if(!grid || this.allCalMonthPickYear == null) return;
        if(label) label.textContent = String(this.allCalMonthPickYear);
 
        const monthNames = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        const today = this.todayIsoLocal();
        const curY = Number(String(today).slice(0, 4));
        const curM = Number(String(today).slice(5, 7));
 
        let html = "";
        for(let m = 1; m <= 12; m++){
            const classes = ["s3-all-cal-month-btn"];
            if(this.allCalMonthPickMonth === m) classes.push("is-selected");
            if(curY === this.allCalMonthPickYear && curM === m) classes.push("is-current");
            html += `<button type="button" class="${classes.join(" ")}" data-s3-all-cal-month="${m}" role="option" aria-selected="${this.allCalMonthPickMonth === m ? "true" : "false"}">${monthNames[m - 1]}</button>`;
        }
        grid.innerHTML = html;
    },
 
    renderAllBranchesCustomCalendar(){
        const grid = document.getElementById("s3AllCalDays");
        const label = document.getElementById("s3AllCalMonthLabel");
        if(!grid || this.allCalViewYear == null || this.allCalViewMonth == null) return;
 
        const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
        if(label) label.textContent = `${monthNames[this.allCalViewMonth]} ${this.allCalViewYear}`;
 
        const today = this.todayIsoLocal();
        const first = new Date(Date.UTC(this.allCalViewYear, this.allCalViewMonth, 1));
        const jsDay = first.getUTCDay();
        const mondayIndex = (jsDay + 6) % 7;
        const daysInMonth = new Date(Date.UTC(this.allCalViewYear, this.allCalViewMonth + 1, 0)).getUTCDate();
 
        let html = "";
        for(let i = 0; i < mondayIndex; i++){
            html += `<span class="s3-all-cal-day is-empty" aria-hidden="true"></span>`;
        }
        for(let day = 1; day <= daysInMonth; day++){
            const iso = `${this.allCalViewYear}-${String(this.allCalViewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const classes = ["s3-all-cal-day"];
            if(iso === today) classes.push("is-today");
            if(this.allCalPickStart && iso === this.allCalPickStart) classes.push("is-start");
            if(this.allCalPickEnd && iso === this.allCalPickEnd) classes.push("is-end");
            if(
                this.allCalPickStart
                && this.allCalPickEnd
                && iso > this.allCalPickStart
                && iso < this.allCalPickEnd
            ){
                classes.push("is-in-range");
            }
            html += `<button type="button" class="${classes.join(" ")}" data-s3-all-cal-day="${iso}">${day}</button>`;
        }
        grid.innerHTML = html;
    },
 
    syncAllBranchesCalPreview(){
        const preview = document.getElementById("s3AllCalPreview");
        const applyBtn = document.getElementById("s3AllCalApply");
        const monthNames = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
 
        let valid = false;
        if(this.allCalMode === "month"){
            valid = Boolean(
                this.allCalMonthPickYear
                && this.allCalMonthPickMonth >= 1
                && this.allCalMonthPickMonth <= 12
            );
            if(preview){
                preview.textContent = valid
                    ? `${monthNames[this.allCalMonthPickMonth - 1]} ${this.allCalMonthPickYear}`
                    : "Pilih bulan dan tahun";
            }
            if(valid){
                this.applyAllBranchesMonthPickToRange(
                    this.allCalMonthPickYear,
                    this.allCalMonthPickMonth
                );
            }
        }else{
            valid = Boolean(
                this.allCalPickStart
                && this.allCalPickEnd
                && this.allCalPickEnd >= this.allCalPickStart
            );
            if(preview){
                if(this.allCalPickStart && this.allCalPickEnd){
                    preview.textContent =
                        `${this.formatPeriodDate(this.allCalPickStart)} — ${this.formatPeriodDate(this.allCalPickEnd)}`;
                }else if(this.allCalPickStart){
                    preview.textContent =
                        `${this.formatPeriodDate(this.allCalPickStart)} — pilih tanggal akhir`;
                }else{
                    preview.textContent = "Pilih tanggal mulai, lalu tanggal akhir";
                }
            }
        }
        if(applyBtn) applyBtn.disabled = !valid;
    },
 
    async applyAllBranchesPeriodFromModal(){
        const errEl = document.getElementById("setoran3AllBranchesPeriodError");
        const showErr = (msg) => {
            if(!errEl) return;
            errEl.hidden = false;
            errEl.textContent = msg;
        };
 
        let start = null;
        let end = null;
        if(this.allCalMode === "month"){
            if(!(this.allCalMonthPickMonth >= 1 && this.allCalMonthPickMonth <= 12)){
                showErr("Pilih bulan terlebih dahulu.");
                return;
            }
            const range = this.applyAllBranchesMonthPickToRange(
                this.allCalMonthPickYear,
                this.allCalMonthPickMonth
            );
            if(!range){
                showErr("Bulan tidak valid.");
                return;
            }
            start = range.start;
            end = range.end;
        }else{
            start = this.normalizeIsoDate(this.allCalPickStart);
            end = this.normalizeIsoDate(this.allCalPickEnd);
        }
 
        if(!start || !end){
            showErr("Tanggal tidak valid. Pilih lewat kalender.");
            return;
        }
        if(start > end){
            showErr("Tanggal mulai tidak boleh lebih besar dari tanggal selesai.");
            return;
        }
 
        this.allBranchesPeriodTouched = true;
        this.allBranchesStart = start;
        this.allBranchesEnd = end;
        this.closeAllBranchesPeriodModal();
        this.syncAllBranchesPeriodButton();
        await this.loadAllBranchesSummary();
    },
 
    /**
     * Aggregate Minutes seluruh cabang valid untuk periode ringkasan.
     * Source sama dengan loadMinutesAggregate (daily_recap_source) — tidak dari laporan SPV.
     */
    async loadAllBranchesAggregate(start, end){
        if(!this.isValidDateRange(start, end)){
            return this.emptyAllBranchesAggregate();
        }

        if(
            typeof DailyDataEngine === "undefined"
            || typeof DailyDataEngine.load !== "function"
        ){
            throw new Error("DailyDataEngine tidak termuat — canonical daily source wajib.");
        }

        const dataset = await DailyDataEngine.load({
            client: db,
            start,
            end
        });
        const summary = dataset.summary || DailyDataEngine.summarizeRows(dataset.rows || []);

        return {
            days: Number(summary.rowCount || 0),
            nett_revenue: Number(summary.nettRevenueMinutes || 0),
            product_cost: Number(summary.productCost || 0),
            nett_erp: Number(summary.netRevenueErp || 0),
            cash_referensi: Number(summary.cashReference || 0),
            cash_out: Number(summary.cashOut || 0),
            non_cash: Number(summary.nonCash || 0),
            cash_payment: Number(summary.cashPayment || 0),
            source_ok: true
        };
    },

    /** READ-ONLY card — SUM(daily_recap_source.non_cash) seluruh cabang operasional. */
    allBranchesNonTunaiCardHtml(agg, { loading = false } = {}){
        if(loading){
            return `<div class="setoran3-summary-card is-nontunai">
                <span>Total Non Tunai</span>
                <strong>…</strong>
                <em>Pembayaran non tunai seluruh cabang</em>
            </div>`;
        }
        const ready = Boolean(agg && agg.source_ok === true);
        const value = ready
            ? this.formatRupiah(this.branchMoney(agg).nonCash)
            : "Data belum tersedia";
        const cls = ready ? "is-nontunai" : "is-nontunai is-unavailable";
        return `<div class="setoran3-summary-card ${cls}">
            <span>Total Non Tunai</span>
            <strong>${escapeHtmlS3(value)}</strong>
            <em>Pembayaran non tunai seluruh cabang</em>
        </div>`;
    },
 
    /**
     * Actual / status dari allRows (sudah termuat) — UI aggregate saja.
     * Hanya dipakai jika periode ringkasan = periode halaman aktif.
     */
    getAllBranchesActualStatus(){
        const { start: pageStart, end: pageEnd } = this.getFilter();
        const allStart = this.normalizeIsoDate(this.allBranchesStart);
        const allEnd = this.normalizeIsoDate(this.allBranchesEnd);
        const periodMatch = Boolean(
            allStart && allEnd && pageStart && pageEnd
            && allStart === pageStart
            && allEnd === pageEnd
        );
        const rows = Array.isArray(this.allRows) ? this.allRows : [];
        const total = rows.length;
        const clear = rows.filter(r => r.status === this.STATUS.CLEAR).length;
        let filled = 0;
        let actualSum = 0;
        rows.forEach((r) => {
            if(r.setoran_cash_actual === null || r.setoran_cash_actual === undefined || r.setoran_cash_actual === ""){
                return;
            }
            filled += 1;
            actualSum += Number(r.setoran_cash_actual || 0);
        });
        return {
            periodMatch,
            total,
            clear,
            filled,
            incomplete: !periodMatch || total === 0 || filled < total,
            hasAnyActual: filled > 0,
            actualSum: periodMatch && filled > 0 ? actualSum : null
        };
    },
 
    renderAllBranchesSummary(agg){
        const cards = document.getElementById("setoran3AllBranchesCards");
        if(!cards) return;
        const a = agg || this.allBranchesAgg || this.emptyAllBranchesAggregate();
        this.allBranchesAgg = a;
        const cashRef = this.cashReferensi(a);
        const st = this.getAllBranchesActualStatus();
        this.syncAllBranchesPeriodButton();
 
        let actualHtml = "—";
        let actualNote = "Belum ada setoran aktual";
        let actualClass = "is-actual";
        if(!st.periodMatch){
            actualHtml = "—";
            actualNote = "Samakan periode dengan halaman untuk total aktual";
        }else if(st.hasAnyActual){
            actualHtml = this.formatRupiah(st.actualSum);
            actualNote = st.incomplete
                ? `${st.filled} / ${st.total} cabang terisi · belum lengkap`
                : `${st.filled} / ${st.total} cabang terisi`;
            if(st.incomplete) actualClass += " is-incomplete";
        }else if(st.total > 0){
            actualHtml = "—";
            actualNote = `0 / ${st.total} cabang terisi · belum diisi`;
            actualClass += " is-incomplete";
        }
 
        let selisihHtml = "—";
        let selisihNote = "aktual − referensi";
        let selisihClass = "is-selisih";
        if(st.periodMatch && !st.incomplete && st.hasAnyActual){
            const selisih = Number(st.actualSum) - Number(cashRef || 0);
            selisihHtml = this.formatRupiah(selisih);
            if(selisih < 0) selisihClass += " is-warn";
            else if(selisih > 0) selisihClass += " is-over";
            else selisihClass += " is-ok";
        }else if(st.periodMatch && st.incomplete){
            selisihHtml = "Belum lengkap";
            selisihNote = st.hasAnyActual
                ? `${st.filled} / ${st.total} cabang sudah isi`
                : "Menunggu pengisian setoran aktual";
            selisihClass += " is-incomplete";
        }
 
        const statusHtml = st.total
            ? `${st.clear} / ${st.total} CLEAR`
            : "—";
        const statusNote = st.total
            ? (st.clear === st.total ? "Semua cabang clear" : `${st.total - st.clear} belum clear`)
            : "Belum ada data cabang";
        /* UI-only tint class — does not change status values/logic */
        const statusClass = (st.total && st.clear === st.total)
            ? "is-status is-all-clear"
            : "is-status";
 
        cards.innerHTML = `
            <div class="setoran3-summary-card is-hero-ref">
                <span>Total Cash Referensi</span>
                <strong>${this.formatRupiah(cashRef)}</strong>
                <em>uang yang seharusnya diambil</em>
            </div>
            ${this.allBranchesNonTunaiCardHtml(a)}
            <div class="setoran3-summary-card ${actualClass}">
                <span>Total Setoran Aktual</span>
                <strong>${actualHtml}</strong>
                <em>${escapeHtmlS3(actualNote)}</em>
            </div>
            <div class="setoran3-summary-card ${selisihClass}">
                <span>Total Selisih</span>
                <strong>${selisihHtml}</strong>
                <em>${escapeHtmlS3(selisihNote)}</em>
            </div>
            <div class="setoran3-summary-card ${statusClass}">
                <span>Status Cabang</span>
                <strong>${escapeHtmlS3(statusHtml)}</strong>
                <em>${escapeHtmlS3(statusNote)}</em>
            </div>
        `;
    },
 
    async loadAllBranchesSummary(){
        const seq = ++this.allBranchesLoadSeq;
        const section = document.getElementById("setoran3AllBranchesSection");
        const cards = document.getElementById("setoran3AllBranchesCards");
        if(!section || !cards) return;
 
        const { start: activeStart, end: activeEnd } = this.getFilter();
        const { start, end } = this.ensureAllBranchesPeriod(activeStart, activeEnd);
        this.syncAllBranchesPeriodButton();
 
        if(!this.isValidDateRange(start, end)){
            this.renderAllBranchesSummary(this.emptyAllBranchesAggregate());
            return;
        }
 
        cards.innerHTML = `
            <div class="setoran3-summary-card is-hero-ref"><span>Total Cash Referensi</span><strong>…</strong></div>
            ${this.allBranchesNonTunaiCardHtml(null, { loading: true })}
            <div class="setoran3-summary-card is-actual"><span>Total Setoran Aktual</span><strong>…</strong></div>
            <div class="setoran3-summary-card is-selisih"><span>Total Selisih</span><strong>…</strong></div>
            <div class="setoran3-summary-card is-status"><span>Status Cabang</span><strong>…</strong></div>
        `;
 
        try{
            const agg = await this.loadAllBranchesAggregate(start, end);
            if(seq !== this.allBranchesLoadSeq) return;
            this.renderAllBranchesSummary(agg);
        }catch(err){
            if(seq !== this.allBranchesLoadSeq) return;
            console.error("Setoran3Harian.loadAllBranchesSummary error:", err);
            cards.innerHTML = `
                <div class="setoran3-summary-card is-hero-ref">
                    <span>Total Cash Referensi</span>
                    <strong>Gagal memuat</strong>
                </div>
                ${this.allBranchesNonTunaiCardHtml(this.emptyAllBranchesAggregate())}
            `;
        }
    },
 
    /**
     * Parse keterangan_cash_out Minutes (sync.js):
     * "Service AC Rp310.000 - Kasir: Rangga; Laundry Rp25.000 - Kasir: Rangga"
     * Aman: jika format tidak dikenali → raw fallback, jangan mengarang.
     */
    parseCashOutKeteranganItems(rawText){
        const raw = String(rawText || "").trim();
        if(!raw) return { items: [], unparsed: [] };
 
        const chunks = raw.split(/\s*;\s*/).map(s => s.trim()).filter(Boolean);
        const items = [];
        const unparsed = [];
 
        chunks.forEach((chunk) => {
            // Format resmi sync: {keterangan} Rp{nominal id-ID}[ - Kasir: {nama}]
            const m = chunk.match(
                /^(.+?)\s+Rp\s*([\d.]+)(?:\s*[-–]\s*Kasir:\s*(.+))?$/i
            );
            if(!m){
                unparsed.push(chunk);
                return;
            }
            const nama = String(m[1] || "").trim();
            const nominal = Number(String(m[2] || "").replace(/\./g, ""));
            const kasir = String(m[3] || "").trim();
            if(!nama || !Number.isFinite(nominal) || nominal < 0){
                unparsed.push(chunk);
                return;
            }
            items.push({ nama, nominal, kasir: kasir || null, raw: chunk });
        });
 
        return { items, unparsed };
    },
 
    buildCashOutRincian(keteranganText, totalCashOut){
        const total = Number(totalCashOut || 0);
        const raw = String(keteranganText || "").trim();
        const { items, unparsed } = this.parseCashOutKeteranganItems(raw);
 
        // Merge item sama (nama + kasir) antar hari dalam periode
        const merged = new Map();
        items.forEach((it) => {
            const key = `${it.nama.toLowerCase()}||${(it.kasir || "").toLowerCase()}`;
            if(!merged.has(key)){
                merged.set(key, { ...it });
            }else{
                merged.get(key).nominal += it.nominal;
            }
        });
 
        const list = [...merged.values()].sort((a, b) => b.nominal - a.nominal);
        const itemsSum = list.reduce((t, it) => t + Number(it.nominal || 0), 0);
        const hasParsed = list.length > 0;
        const hasRawOnly = !hasParsed && Boolean(raw);
        const matchTotal = hasParsed && Math.abs(itemsSum - total) <= 1;
 
        let validation = "empty";
        if(total <= 0 && !raw){
            validation = "empty";
        }else if(hasParsed && matchTotal && unparsed.length === 0){
            validation = "match";
        }else if(hasParsed && matchTotal && unparsed.length > 0){
            validation = "partial";
        }else if(hasParsed && !matchTotal){
            validation = "mismatch";
        }else if(hasRawOnly){
            validation = "raw";
        }else if(total > 0 && !raw){
            validation = "missing";
        }
 
        return {
            total,
            items: list,
            itemsSum,
            unparsed,
            raw,
            validation,
            matchTotal
        };
    },
 
    isDoneStatus(status){
        return status === this.STATUS.DONE;
    },
 
    buildRows(minutesMap, savedMap, start, end){
        return this.cabangList.map(cabang => {
            const id = Number(cabang.id);
            const m = minutesMap.get(id) || {
                minutes_cash: 0,
                minutes_non_cash: 0,
                minutes_cash_out: 0
            };
            const saved = savedMap.get(id) || null;
            const receipt = saved?.__receipt || null;
            // DONE = derived from immutable Owner receipt; base workflow status remains CLEAR.
            const status = receipt ? this.STATUS.DONE : (saved?.status || this.STATUS.EMPTY);
            return {
                cabang_id: id,
                nama_cabang: cabang.display_name || cabang.nama_cabang,
                nama_cabang_db: cabang.nama_cabang,
                period_start: start,
                period_end: end,
                minutes_cash: Number(saved?.minutes_cash ?? m.minutes_cash),
                minutes_non_cash: Number(saved?.minutes_non_cash ?? m.minutes_non_cash),
                minutes_cash_out: Number(saved?.minutes_cash_out ?? m.minutes_cash_out),
                nett_revenue: 0,
                product_cost: 0,
                nett_erp: 0,
                cash_referensi: 0,
                setoran_cash_actual: saved?.setoran_cash_actual ?? null,
                /* non_cash_to_spv = legacy unused — frontend tidak memakai */
                status,
                workflow_status: saved?.status || this.STATUS.EMPTY,
                receipt_id: receipt?.id || null,
                transfer_proof_id: receipt?.transfer_proof_id || null,
                cash_received: receipt?.cash_received ?? null,
                received_at: receipt?.received_at || null,
                spv_note: saved?.spv_note || "",
                owner_note: saved?.owner_note || "",
                request_proof: Boolean(saved?.request_proof),
                proof_request_no: Number(saved?.proof_request_no || 1),
                proof_path: saved?.proof_path || null,
                proof_uploaded_by: saved?.proof_uploaded_by || null,
                proof_uploaded_at: saved?.proof_uploaded_at || null,
                ever_cleared: Boolean(saved?.ever_cleared),
                last_cleared_at: saved?.last_cleared_at || null,
                spv_submitted_by: saved?.spv_submitted_by || null,
                spv_submitted_at: saved?.spv_submitted_at || null,
                owner_approved_by: saved?.owner_approved_by || null,
                owner_approved_at: saved?.owner_approved_at || null,
                updated_at: saved?.updated_at || null,
                saved_id: saved?.id || null
            };
        });
    },
 
    statusClass(status){
        switch(status){
            case this.STATUS.CLEAR: return "sesuai";
            case this.STATUS.DONE: return "sesuai";
            case this.STATUS.WAIT_OWNER: return "wait-owner";
            case this.STATUS.RETURN_SPV: return "bermasalah";
            case this.STATUS.DRAFT: return "belum-ada-data";
            default: return "belum-ada-data";
        }
    },
 
    /* ---------- Cash Out + AI Insight (rule-based, real Minutes) ---------- */
 
    analyzeCashOut(curr, prev, histAvg){
        const analysis = {
            current: Number(curr?.cash_out || 0),
            previous: prev ? Number(prev.cash_out || 0) : null,
            histAvg: histAvg != null ? Number(histAvg) : null,
            delta: null,
            pct: null,
            ratioCurr: null,
            ratioPrev: null,
            abnormal: false,
            hasHistory: Boolean(prev),
            minutesNote: String(curr?.keterangan_cash_out || "").trim(),
            message: ""
        };
 
        if(analysis.previous != null){
            analysis.delta = analysis.current - analysis.previous;
            analysis.pct = this.pctChange(analysis.current, analysis.previous);
        }
 
        const nettCurr = this.nettRevenueErp(curr);
        const nettPrev = prev ? this.nettRevenueErp(prev) : 0;
        if(nettCurr > 0) analysis.ratioCurr = (analysis.current / nettCurr) * 100;
        if(nettPrev > 0) analysis.ratioPrev = (analysis.previous / nettPrev) * 100;
 
        if(analysis.hasHistory && analysis.previous > 0 && analysis.pct != null){
            analysis.abnormal = analysis.pct >= this.CASHOUT_PCT_WARN;
        }else if(
            analysis.hasHistory
            && analysis.previous === 0
            && analysis.current > 0
            && analysis.histAvg != null
            && analysis.histAvg > 0
            && analysis.current >= analysis.histAvg * (1 + this.CASHOUT_PCT_WARN / 100)
        ){
            analysis.abnormal = true;
        }
 
        if(analysis.abnormal){
            const deltaTxt = analysis.delta != null
                ? `${analysis.delta >= 0 ? "naik" : "turun"} ${this.formatRupiah(Math.abs(analysis.delta))}`
                : "";
            const pctTxt = analysis.pct != null ? ` / ${this.formatPct(analysis.pct)}` : "";
            analysis.message =
                `Cash Out periode ini ${this.formatRupiah(analysis.current)}` +
                (deltaTxt ? `, ${deltaTxt}${pctTxt} dibanding periode sebelumnya.` : ".");
        }
 
        return analysis;
    },
 
    buildInsight(curr, prev, cashOut, cabangName, catatanCabang){
        const detailFields = [
            { key: "nett_erp", label: "Nett Revenue", money: true },
            { key: "customer", label: "Customer", money: false },
            { key: "cash_payment", label: "Cash Payment", money: true },
            { key: "non_cash", label: "QRIS / Non Cash", money: true },
            { key: "cash_out", label: "Cash Out", money: true },
            { key: "service", label: "Service (gross)", money: true },
            { key: "produk", label: "Product", money: true },
            { key: "product_cost", label: "Product Cost", money: true }
        ];
 
        const formatVal = (key, v, money) => {
            if(key === "customer" || !money) return Number(v || 0).toLocaleString("id-ID");
            return this.formatRupiah(v);
        };
 
        const detailLines = detailFields.map(f => {
            const c = Number(curr[f.key] || 0);
            const p = prev ? Number(prev[f.key] || 0) : null;
            const pct = prev ? this.pctChange(c, p) : null;
            return {
                label: f.label,
                current: formatVal(f.key, c, f.money),
                previous: prev ? formatVal(f.key, p, f.money) : null,
                pct
            };
        });
 
        const cashOutLine = (() => {
            const nominal = this.formatRupiah(cashOut.current);
            if(!cashOut.hasHistory || cashOut.pct == null){
                return `${nominal}. Belum ada perbandingan periode sebelumnya.`;
            }
            const gerak = cashOut.pct >= 0 ? "naik" : "turun";
            let t = `${nominal}, ${gerak} ${Math.abs(cashOut.pct).toFixed(0)}%`;
            if(cashOut.ratioCurr != null){
                t += `. Rasio terhadap Nett Revenue ${cashOut.ratioCurr.toFixed(1).replace(".", ",")}%`;
            }
            t += ".";
            return t;
        })();
 
        if(!prev){
            return {
                cabangName,
                status: "STABIL",
                statusClass: "flat",
                hasHistory: false,
                performaLine: "Belum cukup histori untuk membandingkan performa.",
                cashOutLine,
                cashOutWarn: Boolean(cashOut.abnormal),
                saranLine: "Lengkapi Catatan Cabang bila ada cash out / kendala, lalu bandingkan lagi setelah ada periode sebelumnya.",
                detailLines,
                minutesNote: cashOut.minutesNote || "",
                catatanCabang: String(catatanCabang || "").trim(),
                cashOut,
                cashOutRincian: curr?.cash_out_rincian || this.buildCashOutRincian(curr?.keterangan_cash_out, curr?.cash_out)
            };
        }
 
        const nettPct = this.pctChange(this.nettRevenueErp(curr), this.nettRevenueErp(prev));
        const custPct = this.pctChange(curr.customer, prev.customer);
        const parts = [];
        if(nettPct != null && Math.abs(nettPct) >= 5){
            parts.push(`Nett Revenue ${nettPct >= 0 ? "naik" : "turun"} ${Math.abs(nettPct).toFixed(0)}%`);
        }
        if(custPct != null && Math.abs(custPct) >= 5){
            parts.push(`customer ${custPct >= 0 ? "naik" : "turun"} ${Math.abs(custPct).toFixed(0)}%`);
        }
        let performaLine = parts.length
            ? (parts.join(" dan ") + ".")
            : "Nett Revenue dan customer relatif stabil dibanding periode sebelumnya.";
 
        let scoreUp = 0;
        let scoreDown = 0;
        detailFields.forEach(f => {
            if(f.key === "cash_out") return;
            const pct = this.pctChange(curr[f.key], prev[f.key]);
            if(pct == null || Math.abs(pct) < 5) return;
            const betterIfDown = f.key === "product_cost";
            const improved = betterIfDown ? pct < 0 : pct > 0;
            if(improved) scoreUp += Math.abs(pct);
            else scoreDown += Math.abs(pct);
        });
 
        let status = "STABIL";
        let statusClass = "flat";
        if(cashOut.abnormal){
            status = "PERLU PERHATIAN";
            statusClass = "down";
        }else if(scoreUp - scoreDown >= 15 && (nettPct == null || nettPct >= 0)){
            status = "MENINGKAT";
            statusClass = "up";
        }else if(scoreDown - scoreUp >= 15 || (nettPct != null && nettPct <= -8)){
            status = "PERLU PERHATIAN";
            statusClass = "down";
        }
 
        // Jika Cash Out abnormal, performa positif tidak boleh mengaburkan warning
        if(cashOut.abnormal && parts.length && nettPct != null && nettPct > 0){
            performaLine = parts.join(" dan ") + " — namun Cash Out perlu perhatian.";
        }
 
        let saranLine = "Jaga konsistensi setoran dan lengkapi catatan bila ada kejadian khusus.";
        if(cashOut.abnormal){
            saranLine = String(catatanCabang || "").trim()
                ? "Cek kembali pengeluaran periode ini sebelum pengajuan disetujui."
                : "Isi Catatan Cabang dan cek pengeluaran sebelum diajukan ke Owner.";
        }else if(nettPct != null && nettPct <= -8){
            saranLine = (custPct != null && custPct <= -5)
                ? "Fokus periode berikutnya pada peningkatan traffic / jumlah customer."
                : "Nett Revenue turun — tinjau ticket size / mix service.";
        }else if(status === "MENINGKAT"){
            saranLine = "Pertahankan pola operasional yang sudah berjalan baik.";
        }
 
        return {
            cabangName,
            status,
            statusClass,
            hasHistory: true,
            performaLine,
            cashOutLine,
            cashOutWarn: Boolean(cashOut.abnormal),
            saranLine,
            detailLines,
            minutesNote: cashOut.minutesNote || "",
            catatanCabang: String(catatanCabang || "").trim(),
            cashOut,
            cashOutRincian: curr?.cash_out_rincian || this.buildCashOutRincian(curr?.keterangan_cash_out, curr?.cash_out)
        };
    },
 
    renderCashOutWarn(analysis){
        const el = document.getElementById("setoran3CashOutWarn");
        if(!el) return;
        if(!analysis?.abnormal){
            el.hidden = true;
            el.innerHTML = "";
            return;
        }
        el.hidden = false;
        el.innerHTML = `
            <strong>⚠ CASH OUT PERLU PERHATIAN</strong>
            ${escapeHtmlS3(analysis.message)}
            ${analysis.minutesNote
                ? `<br><em>Keterangan Minutes: ${escapeHtmlS3(analysis.minutesNote)}</em>`
                : `<br><em>Penyebab belum tercatat. SPV wajib memberikan Catatan Cabang.</em>`}
        `;
    },
 
    /** Display-only: bold Rp / % / angka penting setelah escape HTML. */
    emphasizeInsightNumbers(escapedText){
        return String(escapedText || "")
            .replace(/Rp[\d.]+/g, (m) => `<span class="setoran3-ai-num">${m}</span>`)
            .replace(/[+\-]?\d+(?:[.,]\d+)?%/g, (m) => `<span class="setoran3-ai-num">${m}</span>`)
            .replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (m) => `<span class="setoran3-ai-num">${m}</span>`);
    },
 
    renderCashOutRincianHtml(insight){
        const r = insight?.cashOutRincian
            || this.buildCashOutRincian(insight?.minutesNote, insight?.cashOut?.current);
        const co = insight?.cashOut || {};
        const pctTxt = (co.hasHistory && co.pct != null)
            ? `${co.pct >= 0 ? "naik" : "turun"} ${Math.abs(co.pct).toFixed(0)}% vs periode sebelumnya`
            : "belum ada perbandingan periode sebelumnya";
 
        const itemsHtml = (r.items || []).map((it) => `
            <div class="setoran3-co-item">
                <div class="setoran3-co-item-name">${escapeHtmlS3(it.nama)}</div>
                <div class="setoran3-co-item-nominal">${escapeHtmlS3(this.formatRupiah(it.nominal))}</div>
                ${it.kasir ? `<div class="setoran3-co-item-kasir">Kasir: ${escapeHtmlS3(it.kasir)}</div>` : ""}
            </div>
        `).join("");
 
        let statusHtml = "";
        if(r.validation === "match"){
            statusHtml = `<div class="setoran3-co-status ok">RINCIAN SESUAI TOTAL</div>`;
        }else if(r.validation === "empty"){
            statusHtml = `<div class="setoran3-co-status muted">Tidak ada Cash Out pada periode ini.</div>`;
        }else if(r.validation === "raw"){
            statusHtml = `
                <div class="setoran3-co-status warn">Format rincian tidak dapat diparse aman — menampilkan teks asli Minutes.</div>
                <div class="setoran3-co-raw">
                    <strong>KETERANGAN CASH OUT MINUTES</strong>
                    <p>${escapeHtmlS3(r.raw)}</p>
                </div>
            `;
        }else if(r.validation === "missing"){
            statusHtml = `<div class="setoran3-co-status warn">Rincian Cash Out belum lengkap dari sumber Minutes.</div>`;
        }else if(r.validation === "mismatch" || r.validation === "partial"){
            statusHtml = `<div class="setoran3-co-status warn">Rincian Cash Out belum lengkap dari sumber Minutes.</div>`;
            if(r.unparsed?.length){
                statusHtml += `
                    <div class="setoran3-co-raw">
                        <strong>KETERANGAN CASH OUT MINUTES (belum terparse)</strong>
                        <p>${escapeHtmlS3(r.unparsed.join("; "))}</p>
                    </div>
                `;
            }
        }
 
        const biggest = r.items?.[0]
            ? `Pengeluaran terbesar: ${escapeHtmlS3(r.items[0].nama)} (${escapeHtmlS3(this.formatRupiah(r.items[0].nominal))})`
            : "";
 
        return `
            <div class="setoran3-co-rincian ${insight.cashOutWarn ? "is-warn" : ""}">
                <h5>RINCIAN CASH OUT</h5>
                <div class="setoran3-co-meta">
                    <div>TOTAL CASH OUT MINUTES: <strong>${escapeHtmlS3(this.formatRupiah(r.total))}</strong></div>
                    <div>${escapeHtmlS3(pctTxt)}</div>
                    ${biggest ? `<div>${biggest}</div>` : ""}
                </div>
                ${itemsHtml ? `<div class="setoran3-co-list">${itemsHtml}</div>` : ""}
                <div class="setoran3-co-total">
                    TOTAL CASH OUT
                    <strong>${escapeHtmlS3(this.formatRupiah(r.total))}</strong>
                </div>
                ${statusHtml}
            </div>
        `;
    },
 
    renderInsight(insight){
        const body = document.getElementById("setoran3AiBody");
        const title = document.getElementById("setoran3AiTitle");
        if(!body) return;
        if(!insight){
            if(title) title.textContent = "🤖 AI INSIGHT";
            body.innerHTML = `<p class="setoran3-ai-loading">Pilih cabang untuk melihat AI Insight.</p>`;
            return;
        }
 
        if(title){
            title.textContent = `🤖 AI INSIGHT — ${String(insight.cabangName || "").toUpperCase()}`;
        }
 
        const detailHtml = (insight.detailLines || []).map(d => {
            const pctTxt = d.pct == null ? "" : ` (${this.formatPct(d.pct)})`;
            const prevTxt = d.previous != null ? ` · sebelumnya ${d.previous}` : "";
            return `<li><strong>${escapeHtmlS3(d.label)}:</strong> ${escapeHtmlS3(d.current)}${escapeHtmlS3(prevTxt)}${escapeHtmlS3(pctTxt)}</li>`;
        }).join("");
 
        const contextBits = [];
        if(insight.minutesNote){
            contextBits.push(`Keterangan Cash Out Minutes: ${insight.minutesNote}`);
        }
        if(insight.catatanCabang){
            contextBits.push(`Catatan Cabang: ${insight.catatanCabang}`);
        }
        if(!insight.hasHistory){
            contextBits.push("Belum cukup histori untuk membandingkan performa.");
        }
 
        const performaHtml = this.emphasizeInsightNumbers(escapeHtmlS3(insight.performaLine));
        const cashOutHtml = this.emphasizeInsightNumbers(escapeHtmlS3(insight.cashOutLine));
        const saranHtml = escapeHtmlS3(insight.saranLine);
        const rincianHtml = this.renderCashOutRincianHtml(insight);
 
        // Status banner atas (PERLU PERHATIAN pink/gold) dihapus — hindari double warning.
        // Cash Out merah (is-warn) tetap ditampilkan di bawah Performa.
        body.innerHTML = `
            <div class="setoran3-ai-compact">
                <div class="setoran3-ai-line">
                    <span class="setoran3-ai-label">📈 PERFORMA</span>
                    <span class="setoran3-ai-text">${performaHtml}</span>
                </div>
                <div class="setoran3-ai-line ${insight.cashOutWarn ? "is-warn" : ""}">
                    <span class="setoran3-ai-label">⚠ CASH OUT</span>
                    <span class="setoran3-ai-text">${cashOutHtml}</span>
                </div>
                <div class="setoran3-ai-line is-saran">
                    <span class="setoran3-ai-label">💡 SARAN</span>
                    <span class="setoran3-ai-text">${saranHtml}</span>
                </div>
            </div>
            <button type="button" id="setoran3AiDetailToggle" class="setoran3-ai-detail-toggle" aria-expanded="false">
                LIHAT DETAIL ANALISIS ▼
            </button>
            <div id="setoran3AiDetail" class="setoran3-ai-detail" hidden>
                ${rincianHtml}
                <div class="setoran3-ai-block">
                    <h5>PERBANDINGAN LENGKAP</h5>
                    <ul>${detailHtml || "<li>Tidak ada data detail.</li>"}</ul>
                </div>
                ${contextBits.length ? `
                <div class="setoran3-ai-block">
                    <h5>KONTEKS</h5>
                    <ul>${contextBits.map(t => `<li>${escapeHtmlS3(t)}</li>`).join("")}</ul>
                </div>` : ""}
                <p class="setoran3-ai-loading">Sumber: histori Minutes aktual. AI tidak mengubah data / approve.</p>
            </div>
        `;
 
        const toggle = document.getElementById("setoran3AiDetailToggle");
        const detail = document.getElementById("setoran3AiDetail");
        toggle?.addEventListener("click", () => {
            if(!detail || !toggle) return;
            detail.hidden = !detail.hidden;
            const open = !detail.hidden;
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
            toggle.textContent = open ? "TUTUP DETAIL ▲" : "LIHAT DETAIL ANALISIS ▼";
        });
    },
 
 
 
    renderPerfGrid(curr, prev){
        const grid = document.getElementById("setoran3PerfGrid");
        if(!grid) return;
        const cell = (label, value, prevVal) => {
            const pct = prev ? this.pctChange(value, prevVal) : null;
            const pctHtml = pct == null ? "" : ` <small style="color:#aaa">(${escapeHtmlS3(this.formatPct(pct))})</small>`;
            return `
                <div class="setoran3-perf-card">
                    <span>${escapeHtmlS3(label)}</span>
                    <strong>${typeof value === "number" && label !== "Customer" && label !== "Services"
                        ? this.formatRupiah(value)
                        : Number(value || 0).toLocaleString("id-ID")}${pctHtml}</strong>
                </div>
            `;
        };
        grid.innerHTML = [
            cell("Nett Revenue", this.nettRevenueErp(curr), prev ? this.nettRevenueErp(prev) : null),
            cell("Customer", curr.customer, prev?.customer),
            cell("Cash Payment", curr.cash_payment, prev?.cash_payment),
            cell("QRIS / Non Cash", curr.non_cash, prev?.non_cash),
            cell("Cash Out", curr.cash_out, prev?.cash_out),
            cell("Service (gross)", curr.service, prev?.service),
            cell("Product Cost", curr.product_cost, prev?.product_cost),
            cell("Services", curr.services, prev?.services)
        ].join("");
    },
 
    /* ---------- Render progress / table / forms ---------- */
 
    isProgressListExpanded(){
        const wrap = document.getElementById("setoran3ProgressListWrap");
        return Boolean(wrap && !wrap.hidden);
    },
 
    syncProgressToggleUi(){
        const btn = document.getElementById("setoran3ProgressToggle");
        const wrap = document.getElementById("setoran3ProgressListWrap");
        if(!btn || !wrap) return;
        const open = !wrap.hidden;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.textContent = open ? "TUTUP DAFTAR ▲" : "LIHAT SEMUA CABANG ▼";
    },
 
    toggleProgressList(){
        const wrap = document.getElementById("setoran3ProgressListWrap");
        if(!wrap) return;
        wrap.hidden = !wrap.hidden;
        this.syncProgressToggleUi();
    },
 
    collapseProgressList(){
        const wrap = document.getElementById("setoran3ProgressListWrap");
        if(wrap) wrap.hidden = true;
        this.syncProgressToggleUi();
    },
 
    renderProgress(){
        const total = this.allRows.length;
        const done = this.allRows.filter(r => r.status === this.STATUS.DONE).length;
        const clear = this.allRows.filter(r => r.status === this.STATUS.CLEAR).length;
        const wait = this.allRows.filter(r => r.status === this.STATUS.WAIT_OWNER).length;
        const ret = this.allRows.filter(r => r.status === this.STATUS.RETURN_SPV).length;
        const empty = this.allRows.filter(r => r.status === this.STATUS.EMPTY || r.status === this.STATUS.DRAFT).length;
 
        const text = document.getElementById("setoran3ProgressText");
        const fill = document.getElementById("setoran3ProgressFill");
        const stats = document.getElementById("setoran3ProgressStats");
        const list = document.getElementById("setoran3ProgressList");
 
        if(text) text.textContent = `${done} / ${total} Done`;
        if(fill) fill.style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";
 
        if(stats){
            stats.innerHTML = `
                <span class="setoran3-stat-chip is-clear">Done <strong>${done}</strong></span>
                <span class="setoran3-stat-chip is-clear">Clear / Menunggu Transfer <strong>${clear}</strong></span>
                <span class="setoran3-stat-chip is-wait">Menunggu Owner <strong>${wait}</strong></span>
                <span class="setoran3-stat-chip is-return">Tindak Lanjut <strong>${ret}</strong></span>
                <span class="setoran3-stat-chip is-empty">Belum Diisi <strong>${empty}</strong></span>
            `;
        }
 
        // Default collapsed — jangan force-open saat data refresh
        this.syncProgressToggleUi();
 
        if(list){
            if(!this.allRows.length){
                list.innerHTML = `<div class="setoran-board-empty">Tidak ada cabang operasional.</div>`;
            }else{
                list.innerHTML = this.allRows.map(r => `
                    <div class="setoran-rekap-item" data-s3-jump="${r.cabang_id}">
                        <strong>${escapeHtmlS3(r.nama_cabang)}</strong>
                        <span class="qris-reco-badge ${this.statusClass(r.status)}">${escapeHtmlS3(r.status)}</span>
                    </div>
                `).join("");
                list.querySelectorAll("[data-s3-jump]").forEach(el => {
                    el.addEventListener("click", () => {
                        const id = el.getAttribute("data-s3-jump");
                        if(id) this.setActiveCabang(id);
                    });
                });
            }
        }
    },
 
    actionButtons(row){
        if(this.isSpv()){
            if(row.status === this.STATUS.CLEAR || row.status === this.STATUS.WAIT_OWNER){
                return `<span class="qris-reco-badge ${this.statusClass(row.status)}">${escapeHtmlS3(row.status)}</span>`;
            }
            return `
                <button type="button" class="qris-reco-btn-ghost" data-s3-action="edit-focus" data-cabang-id="${row.cabang_id}">ISI / EDIT</button>
            `;
        }
        const buttons = [
            `<button type="button" class="qris-reco-btn-ghost" data-s3-action="detail" data-cabang-id="${row.cabang_id}">DETAIL</button>`
        ];
        if(row.status === this.STATUS.WAIT_OWNER){
            buttons.push(
                `<button type="button" class="qris-reco-btn-action" data-s3-action="approve" data-cabang-id="${row.cabang_id}">APPROVE</button>`,
                `<button type="button" class="qris-reco-btn-ghost" data-s3-action="return" data-cabang-id="${row.cabang_id}">TINDAK LANJUT</button>`
            );
        }
        if(row.status === this.STATUS.CLEAR){
            buttons.push(
                `<button type="button" class="qris-reco-btn-action" data-s3-action="reopen" data-cabang-id="${row.cabang_id}">EDIT / KEMBALIKAN KE SPV</button>`
            );
        }
        return buttons.join(" ");
    },
 
    renderSummaryCards(row, curr){
        const section = document.getElementById("setoran3SummarySection");
        const cards = document.getElementById("setoran3SummaryCards");
        const nameEl = document.getElementById("setoran3SummaryCabang");
        const periodEl = document.getElementById("setoran3SummaryPeriod");
        const stEl = document.getElementById("setoran3SummaryStatus");
        if(!section || !cards) return;
 
        if(!row){
            section.hidden = true;
            this.renderOwnerTakenPanels(null, 0);
            return;
        }
 
        section.hidden = false;
        if(nameEl) nameEl.textContent = row.nama_cabang || "—";
        if(periodEl){
            periodEl.textContent =
                `${this.formatPeriodDate(row.period_start)} — ${this.formatPeriodDate(row.period_end)}`;
        }
        const src = curr || row;
        const nett = this.nettRevenueErp(src);
        const cashRef = this.cashReferensi(src);
        const view = this.ownerTakeView(row, cashRef);
        if(stEl){
            stEl.className = `qris-reco-badge ${this.statusClass(row.status)}`;
            if(view.taken){
                stEl.textContent = row.status === this.STATUS.DONE
                    ? "SUDAH DIAMBIL OWNER · DONE"
                    : "SUDAH DIAMBIL OWNER";
            }else{
                stEl.textContent = row.status;
            }
        }
        this.renderOwnerTakenPanels(row, cashRef);

        const cash = curr?.cash_payment ?? row.minutes_cash ?? 0;
        const qris = curr?.non_cash ?? row.minutes_non_cash ?? 0;
        const cashOut = curr?.cash_out ?? row.minutes_cash_out ?? 0;
        const actual = row.setoran_cash_actual;
        const selisih = view.selisih;
        const infoDelta = view.infoDelta;
        const selisihClass = selisih == null
            ? ""
            : (infoDelta ? "is-info" : (selisih < 0 ? "is-warn" : (selisih > 0 ? "is-over" : "is-ok")));
        const deltaLabel = infoDelta ? "Perubahan setelah pengambilan" : "Selisih";
        const deltaValue = infoDelta
            ? this.formatRupiah(view.changeAfterTake)
            : (selisih == null ? "—" : this.formatRupiah(selisih));
        const deltaEm = infoDelta
            ? "live − nominal pengambilan · bukan kekurangan setoran"
            : "aktual − referensi";

        cards.innerHTML = `
            <div class="setoran3-summary-card is-hero-ref">
                <span>Cash Referensi</span>
                <strong>${this.formatRupiah(cashRef)}</strong>
                <em>${view.taken ? "nilai live sekarang" : "uang yang seharusnya diambil"}</em>
            </div>
            <div class="setoran3-summary-card is-actual">
                <span>${view.taken ? "Nominal pengambilan" : "Setoran Aktual"}</span>
                <strong>${this.formatRupiah(actual)}</strong>
                <em>${view.taken ? "saat Owner CLEAR" : "uang yang diserahkan"}</em>
            </div>
            <div class="setoran3-summary-card is-selisih ${selisihClass}">
                <span>${deltaLabel}</span>
                <strong>${deltaValue}</strong>
                <em>${deltaEm}</em>
            </div>
            <div class="setoran3-summary-card">
                <span>Nett Revenue</span>
                <strong>${this.formatRupiah(nett)}</strong>
            </div>
            <div class="setoran3-summary-card is-nontunai">
                <span>Non Tunai</span>
                <strong>${this.formatRupiah(qris)}</strong>
            </div>
            <div class="setoran3-summary-card is-secondary">
                <span>Cash Minutes</span>
                <strong>${this.formatRupiah(cash)}</strong>
            </div>
            <div class="setoran3-summary-card is-secondary is-cashout is-link" id="setoran3CardCashOut" data-s3-open-cashout role="link" tabindex="0" title="Buka modul Cash Out dengan filter cabang & periode aktif">
                <span>Cash Out</span>
                <strong>${this.formatRupiah(cashOut)}</strong>
                <em class="setoran3-cashout-go" aria-hidden="true">↗</em>
            </div>
        `;
    },

    /**
     * Drilldown ke modul Cash Out — pakai handoff / query existing.
     * Cabang + periode = filter aktif Setoran 3 Harian. Tidak mengubah rumus/nominal.
     */
    openCashOutModule(){
        const filter = this.getFilter();
        const cabang = this.getActiveCabang();
        const cabangId = filter.cabangId != null
            ? Number(filter.cabangId)
            : (this.activeRow?.cabang_id != null ? Number(this.activeRow.cabang_id) : null);
        if(cabangId == null || Number.isNaN(cabangId)) return;

        const cabangName = String(
            cabang?.display_name
            || cabang?.nama_cabang
            || this.activeRow?.nama_cabang
            || ""
        );
        const start = this.normalizeIsoDate(filter.start) || "";
        const end = this.normalizeIsoDate(filter.end) || start;
        const periode = "customtanggal";
        const savedAt = new Date().toISOString();
        const payload = {
            metric: "cashOut",
            menu: "cash-out",
            focus: "cash-out",
            cabangId,
            cabangName,
            start,
            end,
            periode,
            source: "setoran-3-harian",
            savedAt
        };

        try{
            localStorage.setItem(this.HANDOFF_KEY, JSON.stringify(payload));
            localStorage.setItem("vax_cashout_filter", JSON.stringify({
                cabangId,
                periode,
                start,
                end,
                cabangName,
                savedAt
            }));
        }catch(_e){ /* ignore */ }

        const url = new URL("./cash-out.html", window.location.href);
        url.searchParams.set("menu", "cash-out");
        url.searchParams.set("cabangId", String(cabangId));
        url.searchParams.set("cabangName", cabangName);
        url.searchParams.set("periode", periode);
        if(start) url.searchParams.set("start", start);
        if(end) url.searchParams.set("end", end);
        window.location.href = url.pathname.split("/").pop() + url.search;
    },
 
    renderTable(){
        const body = document.getElementById("setoran3TableBody");
        if(!body) return;
 
        if(!this.activeRow){
            body.innerHTML = `<tr><td colspan="11">Pilih satu cabang untuk melihat detail.</td></tr>`;
            return;
        }
 
        const row = this.activeRow;
        const period = `${this.formatPeriodDate(row.period_start)} — ${this.formatPeriodDate(row.period_end)}`;
 
        body.innerHTML = `
            <tr>
                <td>${escapeHtmlS3(period)}</td>
                <td>${this.formatRupiah(this.nettRevenueErp(row))}</td>
                <td>${this.formatRupiah(row.minutes_cash)}</td>
                <td>${this.formatRupiah(row.minutes_non_cash)}</td>
                <td>${this.formatRupiah(row.minutes_cash_out)}</td>
                <td>${this.formatRupiah(this.cashReferensi(row))}</td>
                <td>${this.formatRupiah(row.setoran_cash_actual)}</td>
                <td><span class="qris-reco-badge ${this.statusClass(row.status)}">${escapeHtmlS3(row.status)}</span></td>
                <td class="qris-reco-note">${row.spv_note ? escapeHtmlS3(row.spv_note) : "—"}</td>
                <td class="qris-reco-note">${row.owner_note ? escapeHtmlS3(row.owner_note) : "—"}</td>
                <td class="qris-reco-actions">${this.actionButtons(row)}</td>
            </tr>
        `;
    },
 
    refreshFormTotal(){
        const cash = document.getElementById("setoran3FormCash")?.value;
        const el = document.getElementById("setoran3FormTotal");
        if(el){
            if(cash === ""){
                el.textContent = "—";
            }else{
                // Total Setoran Aktual = Setoran Cash Aktual saja
                el.textContent = this.formatRupiah(Number(cash || 0));
            }
        }
        this.syncFormSelisih();
    },
 
    syncFormSelisih(){
        const selisihEl = document.getElementById("setoran3FormSelisih");
        const box = document.getElementById("setoran3FormSelisihBox");
        const refEl = document.getElementById("setoran3FormCashRef");
        if(!selisihEl) return;
 
        const row = this.activeRow;
        const cashRef = row ? Number(this.cashReferensi(row) || 0) : 0;
        if(refEl && row) refEl.textContent = this.formatRupiah(cashRef);
        const labelEl = box?.querySelector("span");
        const emEl = box?.querySelector("em");

        const cashRaw = document.getElementById("setoran3FormCash")?.value;
        if(cashRaw === "" || cashRaw === null || cashRaw === undefined){
            selisihEl.textContent = "—";
            if(box) box.className = "setoran3-work-kpi is-selisih";
            if(labelEl) labelEl.textContent = "Selisih";
            if(emEl) emEl.textContent = "aktual − referensi";
            return;
        }
        const view = row ? this.ownerTakeView(row, cashRef) : null;
        if(view?.infoDelta){
            selisihEl.textContent = this.formatRupiah(view.changeAfterTake);
            if(labelEl) labelEl.textContent = "Perubahan setelah pengambilan";
            if(emEl) emEl.textContent = "bukan kekurangan setoran";
            if(box) box.className = "setoran3-work-kpi is-selisih is-info";
            return;
        }
        const selisih = Number(cashRaw || 0) - cashRef;
        selisihEl.textContent = this.formatRupiah(selisih);
        if(labelEl) labelEl.textContent = "Selisih";
        if(emEl) emEl.textContent = "aktual − referensi";
        if(box){
            box.className = "setoran3-work-kpi is-selisih "
                + (selisih < 0 ? "is-warn" : (selisih > 0 ? "is-over" : "is-ok"));
        }
    },
 
    syncSpvForm(row){
        const card = document.getElementById("setoran3SpvFormCard");
        const ownerCard = document.getElementById("setoran3OwnerActionCard");
        const err = document.getElementById("setoran3FormError");
        if(err){ err.hidden = true; err.textContent = ""; }
 
        const locked = row.status === this.STATUS.WAIT_OWNER || row.status === this.STATUS.CLEAR;
        const canEdit = this.isSpv() && !locked &&
            [this.STATUS.EMPTY, this.STATUS.DRAFT, this.STATUS.RETURN_SPV].includes(row.status);
        const needsProof = Boolean(row.request_proof);
        const cashRef = this.cashReferensi(row);
        const actualNum = (row.setoran_cash_actual === null || row.setoran_cash_actual === undefined || row.setoran_cash_actual === "")
            ? null
            : Number(row.setoran_cash_actual);
        const selisih = actualNum == null ? null : actualNum - Number(cashRef || 0);
 
        if(card){
            card.hidden = !this.isSpv();
            const cash = document.getElementById("setoran3FormCash");
            const note = document.getElementById("setoran3FormNote");
            const saveBtn = document.getElementById("setoran3BtnSaveDraft");
            const subBtn = document.getElementById("setoran3BtnSubmit");
            const ulangBtn = document.getElementById("setoran3BtnSubmitUlang");
            const formLead = card.querySelector(".setoran3-form-lead");
            const cashLabel = cash?.closest("label");
            const noteLabel = note?.closest("label");
            const totalEl = card.querySelector(".setoran3-form-total");
            const workKpis = card.querySelector(".setoran3-work-kpis");
            const refEl = document.getElementById("setoran3FormCashRef");
 
            if(refEl) refEl.textContent = this.formatRupiah(cashRef);
            if(cash){ cash.value = row.setoran_cash_actual ?? ""; cash.disabled = !canEdit; }
            if(note){ note.value = row.spv_note || ""; note.disabled = !canEdit; }
            if(saveBtn) saveBtn.hidden = !canEdit;
            if(subBtn){
                subBtn.hidden = !(canEdit && row.status !== this.STATUS.RETURN_SPV && row.saved_id);
            }
            if(ulangBtn){
                ulangBtn.hidden = !(canEdit && row.status === this.STATUS.RETURN_SPV && row.saved_id);
            }
            if(row.status === this.STATUS.WAIT_OWNER || row.status === this.STATUS.CLEAR || row.status === this.STATUS.DONE){
                if(saveBtn) saveBtn.hidden = true;
                if(subBtn) subBtn.hidden = true;
                if(ulangBtn) ulangBtn.hidden = true;
                if(cash) cash.disabled = true;
                if(note) note.disabled = true;
            }
            // CLEAR: form input hidden; DONE sama
            const clearReadonly = row.status === this.STATUS.CLEAR || row.status === this.STATUS.DONE;
            if(formLead) formLead.hidden = clearReadonly;
            if(cashLabel) cashLabel.hidden = clearReadonly;
            if(noteLabel) noteLabel.hidden = clearReadonly;
            if(totalEl) totalEl.hidden = clearReadonly;
            if(workKpis) workKpis.hidden = false;
 
            this.refreshFormTotal();
            this.syncSpvProofPanel(row).then(() => {
                if(!ulangBtn || ulangBtn.hidden) return;
                const blockProof = needsProof && this.currentProofs.length < 1;
                ulangBtn.disabled = blockProof || this.proofUploading;
                ulangBtn.title = blockProof
                    ? "Upload minimal 1 bukti foto/struk terlebih dahulu."
                    : "";
            });
        }
 
        if(ownerCard){
            ownerCard.hidden = !this.isOwner();
            const noteBox = document.getElementById("setoran3OwnerNoteBox");
            const btns = document.getElementById("setoran3OwnerActionBtns");
            const takeView = this.ownerTakeView(row, cashRef);
            const selisihClass = selisih == null
                ? ""
                : (takeView.infoDelta ? "is-info" : (selisih < 0 ? "is-warn" : (selisih > 0 ? "is-over" : "is-ok")));
            const inspectDeltaLabel = takeView.infoDelta ? "Perubahan setelah pengambilan" : "Selisih";
            const inspectDeltaValue = takeView.infoDelta
                ? this.formatRupiah(takeView.changeAfterTake)
                : (selisih == null ? "—" : this.formatRupiah(selisih));
            if(noteBox){
                noteBox.innerHTML = `
                    <div class="setoran3-owner-inspect-grid">
                        <div class="setoran3-work-kpi is-ref">
                            <span>${takeView.taken ? "Cash Referensi live" : "Cash Referensi"}</span>
                            <strong>${this.formatRupiah(cashRef)}</strong>
                        </div>
                        <div class="setoran3-work-kpi is-actual">
                            <span>${takeView.taken ? "Nominal pengambilan" : "Setoran Aktual"}</span>
                            <strong>${this.formatRupiah(row.setoran_cash_actual)}</strong>
                        </div>
                        <div class="setoran3-work-kpi is-selisih ${selisihClass}">
                            <span>${inspectDeltaLabel}</span>
                            <strong>${inspectDeltaValue}</strong>
                        </div>
                    </div>
                    <div class="setoran3-owner-note-row"><strong>Catatan Cabang</strong><div>${row.spv_note ? escapeHtmlS3(row.spv_note) : "<em>—</em>"}</div></div>
                    <div class="setoran3-owner-note-row"><strong>Catatan Owner</strong><div>${row.owner_note ? escapeHtmlS3(row.owner_note) : "<em>—</em>"}</div></div>
                    ${needsProof ? `<div class="setoran3-owner-proof-flag">⚠ Bukti foto/struk diminta Owner</div>` : ""}
                `;
            }
            if(btns) btns.innerHTML = this.actionButtons(row);
            this.renderMultiProofBox("setoran3OwnerCardProof", row, { canEdit: false, showAlert: false });
        }
    },
 
    renderMode(){
        const cabangId = this.activeCabangId;
        const allMode = document.getElementById("setoran3AllMode");
        const single = document.getElementById("setoran3SingleMode");
        const printBtn = document.getElementById("setoran3PrintBtn");
        const hint = document.getElementById("setoran3DetailHint");
 
        // Header selalu 1 cabang aktif; progress section = monitoring 10 cabang
        if(allMode) allMode.hidden = true;
        if(single) single.hidden = false;
        if(printBtn) printBtn.hidden = !cabangId;

        this.activeRow = cabangId
            ? (this.allRows.find(r => Number(r.cabang_id) === Number(cabangId)) || null)
            : null;
        if(hint){
            hint.textContent = this.activeRow && this.isOwnerTaken(this.activeRow)
                ? "Owner sudah mengambil setoran periode ini. Cash Referensi live tidak menagih ulang."
                : "Cash Referensi read-only. Isi aktual → Draft → Submit.";
        }
        this.renderSummaryCards(this.activeRow, null);
        this.renderTable();
        if(this.activeRow) this.syncSpvForm(this.activeRow);
    },
 
    /* ---------- Workflow SPV / Owner ---------- */
 
    parseNullableNumber(raw){
        if(raw === "" || raw === null || raw === undefined) return null;
        const n = Number(raw);
        return Number.isNaN(n) ? null : n;
    },
 
    readFormValues(){
        return {
            cash: this.parseNullableNumber(document.getElementById("setoran3FormCash")?.value),
            note: String(document.getElementById("setoran3FormNote")?.value || "").trim()
        };
    },
 
    async saveDraft(row, { quietSuccess = false } = {}){
        if(!this.isSpv()) return false;
        const errEl = document.getElementById("setoran3FormError");
        const showErr = (msg) => {
            if(errEl){
                errEl.hidden = false;
                errEl.style.whiteSpace = "pre-line";
                errEl.textContent = msg;
            }else this.showBanner(msg, true);
        };
 
        const { cash, note } = this.readFormValues();
        if(cash !== null && cash < 0){ showErr("Setoran Cash Aktual tidak boleh negatif."); return false; }
        if(cash === null){
            showErr("Isi Setoran Cash Aktual sebelum menyimpan draft.");
            return false;
        }
 
        const { start, end } = this.getFilter();
        if(!this.isValidDateRange(start, end)){
            showErr("Tanggal awal dan akhir wajib valid (akhir ≥ awal).");
            return false;
        }
        const now = new Date().toISOString();
 
        try{
            let latest = null;
            if(row.saved_id){
                const { data } = await db.from(this.TABLE).select("*").eq("id", row.saved_id).maybeSingle();
                latest = data;
            }else{
                latest = (await this.loadSavedMap(start, end)).get(row.cabang_id) || null;
            }
 
            const currentStatus = latest?.status || this.STATUS.EMPTY;
            if(currentStatus === this.STATUS.CLEAR || currentStatus === this.STATUS.WAIT_OWNER){
                showErr(`Status ${currentStatus} — SPV tidak dapat mengubah.`);
                await this.load({ quiet: true });
                return false;
            }
 
            /* UI anti-overlap — blok simpan sebelum INSERT/UPDATE */
            const conflict = await this.findPeriodOverlap({
                cabangId: row.cabang_id,
                start,
                end,
                excludeId: latest?.id || null
            });
            if(conflict){
                showErr(this.formatOverlapBlockMessage(conflict));
                return false;
            }
 
            const nextStatus = currentStatus === this.STATUS.RETURN_SPV
                ? this.STATUS.RETURN_SPV
                : this.STATUS.DRAFT;
 
            // non_cash_to_spv dikosongkan (legacy unused) agar total DB = cash aktual
            const payload = {
                setoran_cash_actual: cash,
                non_cash_to_spv: null,
                spv_note: note || null,
                status: nextStatus,
                updated_at: now
            };
 
            if(latest?.id){
                await this.updateById(latest.id, payload);
            }else{
                const { error } = await db.from(this.TABLE).insert({
                    period_start: start,
                    period_end: end,
                    cabang_id: row.cabang_id,
                    ...payload,
                    status: this.STATUS.DRAFT,
                    created_by: this.currentUid()
                });
                if(error) throw error;
            }
 
            await this.load({ quiet: true });
            if(!quietSuccess){
                this.showBanner(
                    `<strong>${escapeHtmlS3(row.nama_cabang)}</strong> — draft pengajuan disimpan (${escapeHtmlS3(nextStatus)}).`
                );
            }
            return true;
        }catch(err){
            console.error(err);
            showErr(err.message || "Gagal simpan draft");
            return false;
        }
    },
 
    async submitToOwner(row){
        if(!this.isSpv()) return;
        const errEl = document.getElementById("setoran3FormError");
        const showErr = (msg) => {
            if(errEl){ errEl.hidden = false; errEl.textContent = msg; }
            else this.showBanner(msg, true);
        };
 
        const form = this.readFormValues();
        if(form.cash === null && row.setoran_cash_actual == null){
            showErr("Isi Setoran Cash Aktual sebelum submit ke Owner.");
            return;
        }
 
        if(this.cashOutAnalysis?.abnormal){
            const note = form.note || String(row.spv_note || "").trim();
            if(!note){
                showErr("Cash Out mengalami kenaikan. Isi Catatan Cabang sebelum diajukan ke Owner.");
                return;
            }
        }
 
        if(row.request_proof){
            await this.refreshProofState(row);
            if(this.currentProofs.length < 1){
                showErr("Upload minimal 1 bukti foto/struk terlebih dahulu.");
                return;
            }
        }
 
        if(!confirm(
            `SUBMIT pengajuan ke Owner untuk ${row.nama_cabang}?\n\n` +
            `Status → MENUNGGU APPROVAL OWNER\nOwner wajib memeriksa sebelum CLEAR.`
        )) return;
 
        try{
            const savedOk = await this.saveDraft(row, { quietSuccess: true });
            if(!savedOk) return;
            const refreshed = this.allRows.find(r => r.cabang_id === row.cabang_id);
            if(!refreshed?.saved_id){
                showErr("Simpan draft gagal — tidak bisa submit.");
                return;
            }
            row = refreshed;
 
            const { data: latest, error } = await db
                .from(this.TABLE)
                .select("*")
                .eq("id", row.saved_id)
                .maybeSingle();
            if(error) throw error;
            if(!latest){ showErr("Data tidak ditemukan."); return; }
            if(![this.STATUS.DRAFT, this.STATUS.RETURN_SPV].includes(latest.status)){
                showErr(`Status terbaru: ${latest.status}. Tidak dapat submit.`);
                await this.load({ quiet: true });
                return;
            }
            if(latest.setoran_cash_actual == null){
                showErr("Isi Setoran Cash Aktual sebelum submit.");
                return;
            }
            if(this.cashOutAnalysis?.abnormal && !String(latest.spv_note || "").trim()){
                showErr("Cash Out mengalami kenaikan. Isi Catatan Cabang sebelum diajukan ke Owner.");
                return;
            }
            if(latest.request_proof){
                await this.refreshProofState({
                    ...row,
                    saved_id: latest.id,
                    proof_request_no: latest.proof_request_no,
                    request_proof: latest.request_proof
                });
                if(this.currentProofs.length < 1){
                    showErr("Upload minimal 1 bukti foto/struk terlebih dahulu.");
                    return;
                }
            }
 
            await this.updateById(latest.id, {
                setoran_cash_actual: latest.setoran_cash_actual,
                non_cash_to_spv: null,
                spv_note: latest.spv_note,
                status: this.STATUS.WAIT_OWNER,
                updated_at: new Date().toISOString()
            });
 
            await this.load({ quiet: true });
            this.showBanner(
                `<strong>${escapeHtmlS3(row.nama_cabang)}</strong> — pengajuan dikirim ke Owner (MENUNGGU APPROVAL OWNER).`
            );
        }catch(err){
            console.error(err);
            showErr(err.message || "Gagal submit");
        }
    },
 
    async updateById(id, patch){
        if(!id) throw new Error("ID setoran tidak ditemukan.");
        const { data, error } = await db
            .from(this.TABLE)
            .update(patch)
            .eq("id", id)
            .select("id,status")
            .maybeSingle();
        if(error) throw error;
        if(!data?.id) throw new Error("Update gagal / ditolak RLS.");
        return data;
    },
 
    currentUid(){
        return (
            (typeof OwnerAuth !== "undefined" && OwnerAuth.session?.user?.id) ||
            localStorage.getItem("user_id") ||
            null
        );
    },
 
    showBanner(msg, isError){
        const el = document.getElementById("setoran3ActionBanner");
        if(!el) return;
        el.hidden = false;
        el.classList.toggle("qris-reco-import-error", Boolean(isError));
        el.innerHTML = msg;
    },
 
    async resolveProfileName(uid){
        if(!uid) return null;
        if(this.nameCache.has(uid)) return this.nameCache.get(uid);
        try{
            const { data, error } = await db
                .from(this.PROFILES)
                .select("nama")
                .eq("id", uid)
                .maybeSingle();
            if(error) throw error;
            const nama = data?.nama || null;
            this.nameCache.set(uid, nama);
            return nama;
        }catch(_e){
            this.nameCache.set(uid, null);
            return null;
        }
    },
 
    /* ---------- Bukti foto helpers ---------- */
 
    formatProofDateTime(ts){
        if(!ts) return "—";
        try{
            return new Date(ts).toLocaleString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });
        }catch(_e){
            return "—";
        }
    },
 
    validateProofFile(file){
        if(!file) return "Pilih foto terlebih dahulu.";
        if(!this.PROOF_MIME[file.type]){
            return "Format tidak didukung. Gunakan JPEG, PNG, atau WEBP.";
        }
        if(file.size > this.PROOF_MAX_BYTES){
            return "Ukuran file terlalu besar. Maksimum 5 MB per file.";
        }
        return null;
    },
 
    buildProofObjectPath(setoranId, file){
        const ext = this.PROOF_MIME[file.type] || "jpg";
        const rand = Math.random().toString(36).slice(2, 10);
        return `${setoranId}/${Date.now()}-${rand}.${ext}`;
    },
 
    async getProofSignedUrl(path){
        if(!path) return null;
        const cached = this.proofSignedCache.get(path);
        if(cached && cached.exp > Date.now()) return cached.url;
 
        const { data, error } = await db.storage
            .from(this.PROOF_BUCKET)
            .createSignedUrl(path, 60 * 30);
        if(error) throw error;
        const url = data?.signedUrl || null;
        if(url) this.proofSignedCache.set(path, { url, exp: Date.now() + 25 * 60 * 1000 });
        return url;
    },
 
    setProofPanelError(msg){
        const el = document.getElementById("setoran3ProofError");
        if(!el) return;
        if(!msg){
            el.hidden = true;
            el.textContent = "";
            return;
        }
        el.hidden = false;
        el.textContent = msg;
    },
 
    currentProofRequestNo(row){
        return Math.max(1, Number(row?.proof_request_no || 1));
    },
 
    async fetchProofRows(setoranId){
        if(!setoranId) return [];
        const { data, error } = await db
            .from(this.PROOF_TABLE)
            .select("id,setoran_id,request_no,proof_kind,storage_path,uploaded_by,uploaded_at,created_at")
            .eq("setoran_id", setoranId)
            .order("uploaded_at", { ascending: true });
        if(error) throw error;
        return data || [];
    },
 
    async refreshProofState(row){
        const setoranId = row?.saved_id;
        const reqNo = this.currentProofRequestNo(row);
        if(!setoranId){
            this.currentProofs = [];
            this.historyProofGroups = [];
            return { current: [], historyGroups: [] };
        }
        try{
            const rows = await this.fetchProofRows(setoranId);
            const transferMode = row.status === this.STATUS.CLEAR || row.status === this.STATUS.DONE;
            const current = transferMode
                ? rows.filter(p => String(p.proof_kind || "FOLLOW_UP") === "TRANSFER_OWNER")
                : rows.filter(p =>
                    Number(p.request_no) === reqNo
                    && String(p.proof_kind || "FOLLOW_UP") === "FOLLOW_UP"
                );
            const histMap = new Map();
            rows.forEach(p => {
                if(String(p.proof_kind || "FOLLOW_UP") !== "FOLLOW_UP") return;
                const n = Number(p.request_no);
                if(!transferMode && n >= reqNo) return;
                if(!histMap.has(n)) histMap.set(n, []);
                histMap.get(n).push(p);
            });
            const historyGroups = Array.from(histMap.entries())
                .sort((a, b) => b[0] - a[0])
                .map(([requestNo, proofs]) => ({ requestNo, proofs }));
            this.currentProofs = current;
            this.historyProofGroups = historyGroups;
            return { current, historyGroups };
        }catch(err){
            console.error(err);
            this.currentProofs = [];
            this.historyProofGroups = [];
            throw err;
        }
    },
 
    async buildProofCardHtml(proof, index, { canDelete = false } = {}){
        const path = String(proof.storage_path || "").trim();
        const when = this.formatProofDateTime(proof.uploaded_at);
        let url = "";
        try{
            url = await this.getProofSignedUrl(path);
        }catch(_e){
            url = "";
        }
        const delBtn = canDelete
            ? `<button type="button" class="setoran3-proof-btn setoran3-proof-btn-danger" data-s3-proof-action="delete" data-proof-id="${escapeHtmlS3(proof.id)}">HAPUS</button>`
            : "";
        return `
            <article class="setoran3-proof-card">
                <strong class="setoran3-proof-card-label">FOTO ${index + 1}</strong>
                <div class="setoran3-proof-thumb-wrap">
                    ${url
                        ? `<img class="setoran3-proof-thumb" src="${escapeHtmlS3(url)}" alt="Bukti foto ${index + 1}">`
                        : `<div class="setoran3-proof-thumb-fallback">Preview gagal</div>`}
                </div>
                <p class="setoran3-proof-meta">${escapeHtmlS3(when)}</p>
                <div class="setoran3-proof-card-actions">
                    <button type="button" class="setoran3-proof-btn setoran3-proof-btn-primary" data-s3-proof-action="view" data-proof-path="${escapeHtmlS3(path)}" data-proof-when="${escapeHtmlS3(when)}">LIHAT FOTO</button>
                    ${delBtn}
                </div>
            </article>
        `;
    },
 
    async buildProofGalleryHtml(proofs, { canDelete = false } = {}){
        if(!proofs.length){
            return `<p class="setoran3-proof-empty">Belum ada bukti foto untuk permintaan ini.</p>`;
        }
        const cards = [];
        for(let i = 0; i < proofs.length; i++){
            cards.push(await this.buildProofCardHtml(proofs[i], i, { canDelete }));
        }
        return `<div class="setoran3-proof-grid">${cards.join("")}</div>`;
    },
 
    async buildHistoryHtml(historyGroups){
        if(!historyGroups.length) return "";
        const blocks = [];
        for(const group of historyGroups){
            const gallery = await this.buildProofGalleryHtml(group.proofs, { canDelete: false });
            blocks.push(`
                <div class="setoran3-proof-history-group">
                    <h6>Request #${group.requestNo} · ${group.proofs.length} foto · READ ONLY</h6>
                    ${gallery}
                </div>
            `);
        }
        return blocks.join("");
    },
 
    proofToneClass(row, currentCount){
        if(row.status === this.STATUS.CLEAR || row.status === this.STATUS.DONE) return "is-clear";
        if(row.status === this.STATUS.WAIT_OWNER) return "is-wait";
        if(row.request_proof && currentCount > 0) return "is-ready";
        if(row.request_proof) return "is-request";
        return "";
    },
 
    async renderMultiProofBox(elId, row, { canEdit = false, showAlert = false } = {}){
        const box = document.getElementById(elId);
        if(!box) return;
        if(!row?.saved_id){
            box.hidden = true;
            box.innerHTML = "";
            return;
        }
 
        box.hidden = false;
        box.innerHTML = `<h5 class="setoran3-proof-title">BUKTI FOTO / STRUK</h5><p class="setoran3-ai-loading">Memuat bukti…</p>`;
 
        try{
            const { current, historyGroups } = await this.refreshProofState(row);
            const tone = this.proofToneClass(row, current.length);
            const histId = `${elId}History`;
            const histHtml = await this.buildHistoryHtml(historyGroups);
            const gallery = await this.buildProofGalleryHtml(current, { canDelete: canEdit });
            box.className = `setoran3-proof-view ${tone}`.trim();
            box.innerHTML = `
                ${showAlert && row.request_proof && row.status === this.STATUS.RETURN_SPV
                    ? `<p class="setoran3-proof-alert">⚠ OWNER MEMINTA BUKTI FOTO / STRUK</p>` : ""}
                <div class="setoran3-proof-head">
                    <h5 class="setoran3-proof-title">BUKTI PERMINTAAN SAAT INI</h5>
                    <strong class="setoran3-proof-count">${current.length} FOTO</strong>
                </div>
                ${gallery}
                ${histHtml ? `
                    <button type="button" class="setoran3-proof-history-toggle" data-s3-proof-history-toggle="${histId}" aria-expanded="false">RIWAYAT BUKTI SEBELUMNYA ▼</button>
                    <div id="${histId}" class="setoran3-proof-history" hidden>${histHtml}</div>
                ` : ""}
            `;
            if(!current.length && !historyGroups.length){
                // tetap tampilkan empty state jika request_proof / menunggu owner
                if(!row.request_proof && row.status !== this.STATUS.WAIT_OWNER && row.status !== this.STATUS.CLEAR){
                    box.hidden = true;
                    box.innerHTML = "";
                }
            }
        }catch(err){
            box.innerHTML = `<p class="setoran3-proof-error">Gagal memuat bukti: ${escapeHtmlS3(err.message || "error")}</p>`;
        }
    },
 
    async syncSpvProofPanel(row){
        const panel = document.getElementById("setoran3ProofPanel");
        if(!panel) return;
 
        const showRequest = this.isSpv()
            && row.status === this.STATUS.RETURN_SPV
            && Boolean(row.request_proof);
 
        const showTransferProof = this.isSpv()
            && row.status === this.STATUS.CLEAR
            && Boolean(row.saved_id);
 
        const showDone = this.isSpv()
            && row.status === this.STATUS.DONE
            && Boolean(row.saved_id);
 
        const showLocked = this.isSpv()
            && row.status === this.STATUS.WAIT_OWNER
            && Boolean(row.saved_id);
 
        if(!showRequest && !showLocked && !showTransferProof && !showDone){
            panel.hidden = true;
            this.currentProofs = [];
            this.historyProofGroups = [];
            return;
        }
 
        panel.hidden = false;
        panel.classList.remove("is-request", "is-ready", "is-wait", "is-clear");
 
        try{
            await this.refreshProofState(row);
        }catch(err){
            this.setProofPanelError(err.message || "Gagal memuat daftar bukti.");
            return;
        }
 
        const count = this.currentProofs.length;
        panel.classList.add(this.proofToneClass(row, count) || "is-request");
 
        const noteWrap = document.getElementById("setoran3ProofOwnerNoteWrap");
        const noteEl = document.getElementById("setoran3ProofOwnerNoteText");
        if(noteEl) noteEl.textContent = String(row.owner_note || "").trim() || "—";
        if(noteWrap) noteWrap.hidden = !showRequest && !String(row.owner_note || "").trim();
 
        const alertEl = document.getElementById("setoran3ProofAlert");
        if(alertEl){
            if(showTransferProof){
                alertEl.hidden = false;
                alertEl.textContent = "UPLOAD BUKTI TRANSFER KE OWNER → status DONE";
            }else if(showDone){
                alertEl.hidden = false;
                alertEl.textContent = "DONE — TRANSFER SUDAH DITERIMA OWNER";
            }else{
                alertEl.hidden = !showRequest;
                alertEl.textContent = "⚠ OWNER MEMINTA BUKTI FOTO / STRUK";
            }
        }
 
        const countEl = document.getElementById("setoran3ProofCount");
        if(countEl){
            countEl.textContent = (showRequest || showTransferProof)
                ? `${count} / ${this.PROOF_MAX_COUNT} FOTO`
                : `${count} FOTO`;
        }
 
        const canEdit = (showRequest || showTransferProof) && !this.proofUploading;
        const atMax = count >= this.PROOF_MAX_COUNT;
        const uploadActions = document.getElementById("setoran3ProofUploadActions");
        if(uploadActions){
            uploadActions.hidden = !(showRequest || showTransferProof);
            uploadActions.querySelectorAll("button").forEach(b => {
                b.disabled = !canEdit || atMax;
            });
        }
 
        const hint = document.getElementById("setoran3ProofHint");
        if(hint){
            if(showTransferProof){
                hint.hidden = false;
                hint.textContent = count < 1
                    ? "CLEAR — upload bukti transfer ke Owner. Setelah sukses → DONE (masuk Kas Owner)."
                    : "Bukti transfer tersimpan. Sistem menandai DONE otomatis.";
            }else if(showRequest && atMax){
                hint.hidden = false;
                hint.textContent = "MAKSIMAL 5 FOTO";
            }else if(showRequest){
                hint.hidden = false;
                hint.textContent = count < 1
                    ? "Upload minimal 1 bukti foto/struk sebelum submit ulang. JPG/PNG/WEBP · maks 5 MB/file."
                    : "JPG / PNG / WEBP · maks 5 MB/file · maks 5 foto. Hapus lalu upload ulang untuk ganti.";
            }else if(row.status === this.STATUS.WAIT_OWNER){
                hint.hidden = false;
                hint.textContent = "Menunggu Approval Owner — bukti read-only.";
            }else if(row.status === this.STATUS.DONE){
                hint.hidden = false;
                hint.textContent = "DONE — uang sudah di Kas Owner.";
            }else{
                hint.hidden = false;
                hint.textContent = "Bukti read-only.";
            }
        }
 
        const gallery = document.getElementById("setoran3ProofGallery");
        if(gallery){
            gallery.hidden = false;
            gallery.innerHTML = await this.buildProofGalleryHtml(this.currentProofs, { canDelete: showRequest && canEdit });
        }
 
        const histToggle = document.getElementById("setoran3ProofHistoryToggle");
        const histWrap = document.getElementById("setoran3ProofHistoryWrap");
        if(histToggle && histWrap){
            if(this.historyProofGroups.length){
                histToggle.hidden = false;
                histWrap.innerHTML = await this.buildHistoryHtml(this.historyProofGroups);
                if(!histToggle.dataset.keepOpen){
                    histWrap.hidden = true;
                    histToggle.setAttribute("aria-expanded", "false");
                    histToggle.textContent = "RIWAYAT BUKTI SEBELUMNYA ▼";
                }
            }else{
                histToggle.hidden = true;
                histWrap.hidden = true;
                histWrap.innerHTML = "";
            }
        }
 
        if(showRequest && count < 1){
            this.setProofPanelError("Upload minimal 1 bukti foto/struk terlebih dahulu.");
        }else if((showRequest || showTransferProof) && atMax){
            this.setProofPanelError("MAKSIMAL 5 FOTO");
        }else if(!this.proofUploading){
            this.setProofPanelError("");
        }
    },
 
    async onProofFilePicked(e){
        const input = e?.target;
        const files = Array.from(input?.files || []);
        if(input) input.value = "";
        if(!files.length || !this.activeRow) return;
        await this.uploadProofFiles(files);
    },
 
    async uploadProofFiles(files){
        const row = this.activeRow;
        if(!this.isSpv() || !row?.saved_id) return;
 
        if(row.status !== this.STATUS.RETURN_SPV || !row.request_proof){
            if(row.status !== this.STATUS.CLEAR){
                this.setProofPanelError("Upload bukti hanya saat PERLU TINDAK LANJUT (request Owner) atau CLEAR (bukti transfer ke Owner).");
                return;
            }
        }
 
        await this.refreshProofState(row);
        let remaining = this.PROOF_MAX_COUNT - this.currentProofs.length;
        if(remaining <= 0){
            this.setProofPanelError("MAKSIMAL 5 FOTO");
            return;
        }
 
        const accepted = [];
        for(const file of files){
            if(remaining <= 0) break;
            const errMsg = this.validateProofFile(file);
            if(errMsg){
                this.setProofPanelError(errMsg);
                continue;
            }
            accepted.push(file);
            remaining -= 1;
        }
 
        if(!accepted.length) return;
        if(files.length > accepted.length && this.currentProofs.length + accepted.length >= this.PROOF_MAX_COUNT){
            this.setProofPanelError("Sebagian file diabaikan karena batas maksimal 5 foto.");
        }else{
            this.setProofPanelError("");
        }
 
        this.proofUploading = true;
        this.syncSpvForm(row);
 
        let okCount = 0;
        try{
            const reqNo = this.currentProofRequestNo(row);
            for(const file of accepted){
                const objectPath = this.buildProofObjectPath(row.saved_id, file);
                const { error: upErr } = await db.storage
                    .from(this.PROOF_BUCKET)
                    .upload(objectPath, file, {
                        contentType: file.type,
                        upsert: false,
                        cacheControl: "3600"
                    });
                if(upErr) throw upErr;
 
                const { error: insErr } = await db
                    .from(this.PROOF_TABLE)
                    .insert({
                        setoran_id: row.saved_id,
                        request_no: reqNo,
                        proof_kind: row.status === this.STATUS.CLEAR ? "TRANSFER_OWNER" : "FOLLOW_UP",
                        storage_path: objectPath
                    });
                if(insErr){
                    try{
                        await db.storage.from(this.PROOF_BUCKET).remove([objectPath]);
                    }catch(_e){ /* orphan cleanup best-effort */ }
                    throw insErr;
                }
                this.proofSignedCache.delete(objectPath);
                okCount += 1;
            }
 
            await this.load({ quiet: true });
            // V4: CLEAR + bukti transfer sukses → DONE (uang baru masuk Kas Owner)
            if(row.status === this.STATUS.CLEAR && okCount > 0){
                try{
                    const { data: doneRow, error: doneErr } = await db.rpc("erp_setoran_mark_done", {
                        p_setoran_id: row.saved_id
                    });
                    if(doneErr) throw doneErr;
                    await this.load({ quiet: true });
                    const receivedAt = doneRow?.received_at ? ` · ${escapeHtmlS3(this.formatProofDateTime(doneRow.received_at))}` : "";
                    this.showBanner(
                        `<strong>${escapeHtmlS3(row.nama_cabang)}</strong> — bukti transfer OK · status <b>DONE</b> · diterima Kas Owner${receivedAt}.`
                    );
                }catch(doneCatch){
                    console.error(doneCatch);
                    this.showBanner(
                        `<strong>${escapeHtmlS3(row.nama_cabang)}</strong> — ${okCount} bukti terupload, tetapi DONE gagal: ${escapeHtmlS3(doneCatch.message || "error")}.`
                    );
                }
            }else{
                this.showBanner(
                    `<strong>${escapeHtmlS3(row.nama_cabang)}</strong> — ${okCount} bukti foto berhasil diupload.`
                );
            }
        }catch(err){
            console.error(err);
            this.setProofPanelError(err.message || "Upload bukti gagal.");
            await this.load({ quiet: true });
        }finally{
            this.proofUploading = false;
            if(this.activeRow) this.syncSpvForm(this.activeRow);
        }
    },
 
    async deleteProofById(proofId){
        const row = this.activeRow;
        if(!this.isSpv() || !row?.saved_id) return;
        if(row.status !== this.STATUS.RETURN_SPV || !row.request_proof){
            this.setProofPanelError("Hapus bukti hanya saat PERLU TINDAK LANJUT dan Owner meminta bukti.");
            return;
        }
 
        const proof = this.currentProofs.find(p => String(p.id) === String(proofId));
        if(!proof){
            this.setProofPanelError("Bukti tidak ditemukan pada permintaan saat ini.");
            return;
        }
        if(Number(proof.request_no) !== this.currentProofRequestNo(row)){
            this.setProofPanelError("Foto histori tidak dapat dihapus.");
            return;
        }
        if(!confirm("Hapus bukti foto ini?")) return;
 
        this.proofUploading = true;
        this.setProofPanelError("");
        try{
            const { error: delErr } = await db
                .from(this.PROOF_TABLE)
                .delete()
                .eq("id", proofId);
            if(delErr) throw delErr;
 
            try{
                await db.storage.from(this.PROOF_BUCKET).remove([proof.storage_path]);
            }catch(storageErr){
                console.error(storageErr);
                this.setProofPanelError(
                    "Bukti dihapus dari data, tetapi file Storage gagal dibersihkan. Hubungi admin jika perlu."
                );
            }
 
            this.proofSignedCache.delete(proof.storage_path);
            await this.load({ quiet: true });
            this.showBanner(`<strong>${escapeHtmlS3(row.nama_cabang)}</strong> — bukti foto dihapus.`);
        }catch(err){
            console.error(err);
            this.setProofPanelError(err.message || "Gagal menghapus bukti.");
        }finally{
            this.proofUploading = false;
            if(this.activeRow) this.syncSpvForm(this.activeRow);
        }
    },
 
    async openProofModal(path, whenLabel){
        const modal = document.getElementById("setoran3ProofModal");
        const img = document.getElementById("setoran3ProofModalImg");
        const err = document.getElementById("setoran3ProofModalError");
        const meta = document.getElementById("setoran3ProofModalMeta");
        if(!modal || !path) return;
 
        if(img){ img.hidden = true; img.removeAttribute("src"); }
        if(err){ err.hidden = true; err.textContent = ""; }
        if(meta) meta.textContent = "Memuat…";
        const wasHidden = modal.hidden;
        modal.hidden = false;
        if(wasHidden) this.lockPageScroll();
 
        try{
            const url = await this.getProofSignedUrl(path);
            if(!url) throw new Error("Signed URL tidak tersedia.");
            if(img){
                img.src = url;
                img.hidden = false;
            }
            if(meta){
                meta.textContent = whenLabel && whenLabel !== "—"
                    ? `Diunggah: ${whenLabel}`
                    : path;
            }
        }catch(e){
            console.error(e);
            if(err){
                err.hidden = false;
                err.textContent = e.message || "Gagal membuka foto.";
            }
            if(meta) meta.textContent = "Gagal memuat";
        }
    },
 
    closeProofModal(){
        const modal = document.getElementById("setoran3ProofModal");
        const img = document.getElementById("setoran3ProofModalImg");
        if(modal && !modal.hidden){
            modal.hidden = true;
            this.unlockPageScroll();
        }
        if(img){ img.hidden = true; img.removeAttribute("src"); }
    },
 
    fillOwnerModal(row, mode){
        this.ensureProofDom();
        this.editing = { ...row, mode };
        document.getElementById("setoran3OwnerMode").value = mode;
        document.getElementById("setoran3OwnerCabangId").value = row.cabang_id;
        setTextS3("setoran3OwnerCabang", `${row.nama_cabang} · ${this.formatPeriodDate(row.period_start)} — ${this.formatPeriodDate(row.period_end)}`);
        setTextS3("setoran3OwnerNett", this.formatRupiah(this.nettRevenueErp(row)));
        setTextS3("setoran3OwnerMinutesCash", this.formatRupiah(row.minutes_cash));
        setTextS3("setoran3OwnerMinutesNonCash", this.formatRupiah(row.minutes_non_cash));
        setTextS3("setoran3OwnerMinutesCashOut", this.formatRupiah(row.minutes_cash_out));
        setTextS3("setoran3OwnerCashRef", this.formatRupiah(this.cashReferensi(row)));
        setTextS3("setoran3OwnerCashActual", this.formatRupiah(row.setoran_cash_actual));
 
        const spvBox = document.getElementById("setoran3OwnerSpvNote");
        if(spvBox){
            spvBox.innerHTML = row.spv_note
                ? `<strong>Catatan Cabang:</strong> ${escapeHtmlS3(row.spv_note)}`
                : "<em>Belum ada Catatan Cabang.</em>";
        }
 
        const aiBrief = document.getElementById("setoran3OwnerAiBrief");
        if(aiBrief && this.insight){
            aiBrief.hidden = false;
            aiBrief.innerHTML = `
                <strong>AI Insight:</strong> ${escapeHtmlS3(this.insight.status)}
                ${this.cashOutAnalysis?.abnormal ? " · ⚠ Cash Out perlu perhatian" : ""}
            `;
        }else if(aiBrief){
            aiBrief.hidden = true;
        }
 
        const title = document.getElementById("setoran3OwnerTitle");
        const noteLabel = document.getElementById("setoran3OwnerNoteLabel");
        const noteRo = document.getElementById("setoran3OwnerNoteReadonly");
        const noteEl = document.getElementById("setoran3OwnerNote");
        const saveBtn = document.getElementById("setoran3OwnerSave");
        const req = document.getElementById("setoran3OwnerNoteRequired");
        const proofCheck = document.getElementById("setoran3OwnerRequestProofWrap");
        const proofCb = document.getElementById("setoran3OwnerRequestProof");
        const cancelBtn = document.querySelector("#setoran3OwnerForm .setoran3-owner-cancel");
 
        if(mode === "detail"){
            if(title) title.textContent = "Detail Setoran 3 Harian";
            if(noteLabel) noteLabel.hidden = true;
            if(saveBtn) saveBtn.hidden = true;
            if(proofCheck) proofCheck.hidden = true;
            if(cancelBtn) cancelBtn.hidden = false;
            if(noteRo){
                noteRo.hidden = false;
                const on = String(row.owner_note || "").trim();
                noteRo.innerHTML = on
                    ? `<strong>Catatan Owner:</strong> ${escapeHtmlS3(on)}`
                    : "<em>Belum ada catatan Owner.</em>";
            }
        }else if(mode === "approve"){
            if(title) title.textContent = "APPROVE Setoran";
            if(noteLabel) noteLabel.hidden = false;
            if(noteRo) noteRo.hidden = true;
            if(proofCheck) proofCheck.hidden = true;
            if(cancelBtn) cancelBtn.hidden = false;
            if(saveBtn){ saveBtn.hidden = false; saveBtn.textContent = "APPROVE"; saveBtn.disabled = false; }
            if(noteEl){ noteEl.value = ""; noteEl.required = false; noteEl.placeholder = "Catatan (opsional)"; }
            if(req) req.hidden = true;
        }else{
            if(title) title.textContent = mode === "reopen"
                ? "EDIT / KEMBALIKAN KE SPV (buka ulang CLEAR)"
                : "KEMBALIKAN KE SPV";
            if(noteLabel) noteLabel.hidden = false;
            if(noteRo) noteRo.hidden = true;
            if(proofCheck){
                proofCheck.hidden = false;
                if(proofCb) proofCb.checked = false;
            }
            if(cancelBtn) cancelBtn.hidden = true;
            if(saveBtn){
                saveBtn.hidden = false;
                saveBtn.textContent = "SIMPAN & KEMBALIKAN KE SPV";
                saveBtn.disabled = true;
            }
            if(noteEl){
                noteEl.value = "";
                noteEl.required = true;
                noteEl.placeholder = "Catatan Owner wajib…";
            }
            if(req) req.hidden = false;
        }
 
        this.renderMultiProofBox("setoran3OwnerProofBox", row, { canEdit: false, showAlert: false });
        this.syncOwnerSubmitBtn();
    },
 
    syncOwnerSubmitBtn(){
        const mode = document.getElementById("setoran3OwnerMode")?.value;
        const btn = document.getElementById("setoran3OwnerSave");
        if(!btn || btn.hidden) return;
        if(mode === "return" || mode === "reopen"){
            const note = String(document.getElementById("setoran3OwnerNote")?.value || "").trim();
            btn.disabled = !note;
        }else if(mode === "approve"){
            btn.disabled = false;
        }
    },
 
    async openOwnerModal(row, mode){
        if(!this.isOwner()) return;
        const modal = document.getElementById("setoran3OwnerModal");
        if(!modal) return;
        const err = document.getElementById("setoran3OwnerError");
        if(err){ err.hidden = true; err.textContent = ""; }
 
        this.fillOwnerModal(row, mode);
        const wasHidden = modal.hidden;
        modal.hidden = false;
        if(wasHidden) this.lockPageScroll();
 
        if(row.saved_id){
            try{
                const { data } = await db.from(this.TABLE).select("*").eq("id", row.saved_id).maybeSingle();
                if(data){
                    const fresh = {
                        ...row,
                        ...data,
                        nama_cabang: row.nama_cabang,
                        status: data.status || row.status,
                        spv_note: data.spv_note || "",
                        owner_note: data.owner_note || "",
                        request_proof: Boolean(data.request_proof),
                        proof_request_no: Number(data.proof_request_no || 1),
                        proof_path: data.proof_path || null,
                        proof_uploaded_by: data.proof_uploaded_by || null,
                        proof_uploaded_at: data.proof_uploaded_at || null,
                        saved_id: data.id
                    };
                    this.fillOwnerModal(fresh, mode);
                }
            }catch(_e){ /* keep local */ }
        }
    },
 
    closeOwnerModal(){
        const modal = document.getElementById("setoran3OwnerModal");
        if(modal && !modal.hidden){
            modal.hidden = true;
            this.unlockPageScroll();
        }
        this.editing = null;
    },
 
    async submitOwnerModal(){
        if(!this.isOwner() || !this.editing) return;
        const mode = document.getElementById("setoran3OwnerMode")?.value;
        if(mode === "detail"){
            this.closeOwnerModal();
            return;
        }
 
        const errEl = document.getElementById("setoran3OwnerError");
        const showErr = (msg) => {
            if(errEl){ errEl.hidden = false; errEl.textContent = msg; }
            else alert(msg);
        };
 
        const ownerNote = String(document.getElementById("setoran3OwnerNote")?.value || "").trim();
        if((mode === "return" || mode === "reopen") && !ownerNote){
            this.syncOwnerSubmitBtn();
            showErr("Catatan Owner wajib diisi.");
            return;
        }
 
        if(!this.editing.saved_id){
            showErr("Belum ada data setoran untuk cabang ini.");
            return;
        }
 
        const requestProof = Boolean(document.getElementById("setoran3OwnerRequestProof")?.checked);
        const btn = document.getElementById("setoran3OwnerSave");
        if(btn) btn.disabled = true;
        const cabangName = this.editing.nama_cabang;
 
        try{
            const { data: latest, error } = await db
                .from(this.TABLE)
                .select("*")
                .eq("id", this.editing.saved_id)
                .maybeSingle();
            if(error) throw error;
            if(!latest){ showErr("Data tidak ditemukan di database."); return; }
 
            if(mode === "approve"){
                if(latest.status !== this.STATUS.WAIT_OWNER){
                    showErr(`Status terbaru: ${latest.status}. APPROVE hanya dari MENUNGGU APPROVAL OWNER.`);
                    await this.load({ quiet: true });
                    return;
                }
                const patch = {
                    status: this.STATUS.CLEAR,
                    updated_at: new Date().toISOString()
                };
                if(ownerNote) patch.owner_note = ownerNote;
                await this.updateById(latest.id, patch);
            }else{
                const canReturn = [this.STATUS.WAIT_OWNER, this.STATUS.CLEAR].includes(latest.status);
                if(!canReturn){
                    showErr(`Status terbaru: ${latest.status}. Tidak dapat dikembalikan.`);
                    await this.load({ quiet: true });
                    return;
                }
                await this.updateById(latest.id, {
                    status: this.STATUS.RETURN_SPV,
                    owner_note: ownerNote,
                    request_proof: requestProof,
                    updated_at: new Date().toISOString()
                });
            }
 
            await this.load({ quiet: true });
            this.closeOwnerModal();
            this.showBanner(
                mode === "approve"
                    ? `<strong>${escapeHtmlS3(cabangName)}</strong> — APPROVE berhasil (CLEAR).`
                    : `<strong>${escapeHtmlS3(cabangName)}</strong> — dikembalikan ke SPV${requestProof ? " (bukti foto wajib)." : "."}`
            );
        }catch(err){
            console.error(err);
            showErr(err.message || "Gagal menyimpan.");
            this.syncOwnerSubmitBtn();
        }finally{
            this.syncOwnerSubmitBtn();
        }
    },
 
    /* ---------- Monthly print ---------- */
 
    formatStampDate(ts){
        const iso = this.normalizeIsoDate(String(ts || "").slice(0, 10));
        return iso ? this.formatPeriodLong(iso) : "—";
    },

    /** Date + clock from stored timestamptz ISO prefix. Does not invent a timezone. */
    formatStampDateTime(ts){
        const dateLabel = this.formatStampDate(ts);
        const hm = String(ts || "").match(/T(\d{2}):(\d{2})/);
        if(dateLabel === "—" || !hm) return dateLabel;
        return `${dateLabel} · ${hm[1]}.${hm[2]}`;
    },
 
    async printMonthly(){
        const { start, cabangId } = this.getFilter();
        if(!cabangId){
            alert("Pilih satu cabang untuk print bulanan.");
            return;
        }
        const startIso = this.normalizeIsoDate(start);
        const bounds = this.monthBoundsFromIso(startIso);
        if(!bounds || bounds.year < 2000){
            alert("Periode tidak valid untuk print. Pilih ulang lewat kalender.");
            return;
        }
 
        const cabang = this.cabangList.find(c => Number(c.id) === Number(cabangId));
        const nama = cabang?.display_name || cabang?.nama_cabang || "—";

        try{
            if(
                typeof DailyDataEngine === "undefined"
                || typeof DailyDataEngine.load !== "function"
            ){
                throw new Error("DailyDataEngine tidak termuat — canonical daily source wajib.");
            }

            const monthlyDataset = await DailyDataEngine.load({
                client: db,
                start: bounds.start,
                end: bounds.end,
                cabangId
            });
            const minutesRows = monthlyDataset.rows || [];
 
            const { data: setoranRows, error: sErr } = await db
                .from(this.TABLE)
                .select("*")
                .eq("cabang_id", cabangId)
                .lte("period_start", bounds.end)
                .gte("period_end", bounds.start)
                .order("period_start", { ascending: true });
            if(sErr && !/setoran_3_harian|schema cache|does not exist/i.test(sErr.message || "")){
                throw sErr;
            }
 
            const periods = setoranRows || [];
            const lastClear = [...periods].reverse().find(r => r.status === this.STATUS.CLEAR);
            const lastSubmitted = [...periods].reverse().find(r =>
                r.spv_submitted_by || r.status === this.STATUS.WAIT_OWNER || r.status === this.STATUS.CLEAR
            );
 
            const spvName = lastSubmitted?.spv_submitted_by
                ? await this.resolveProfileName(lastSubmitted.spv_submitted_by)
                : null;
            const ownerName = lastClear?.owner_approved_by
                ? await this.resolveProfileName(lastClear.owner_approved_by)
                : null;
 
            const spvChecked = Boolean(lastSubmitted?.spv_submitted_at);
            const ownerApproved = Boolean(lastClear?.owner_approved_at && lastClear?.status === this.STATUS.CLEAR);
 
            const dayMap = new Map();
            (minutesRows || []).forEach(r => {
                const key = this.normalizeIsoDate(r.tanggal);
                if(key) dayMap.set(key, r);
            });
 
            // Aggregate minutes per setoran period for Nett column
            const periodRowsHtml = periods.length
                ? (await Promise.all(periods.map(async (r) => {
                    const ps = this.normalizeIsoDate(r.period_start);
                    const pe = this.normalizeIsoDate(r.period_end);
                    let nett = 0;
                    let cashRef = 0;
                    if(ps && pe){
                        const agg = await this.loadMinutesAggregate(cabangId, ps, pe);
                        nett = this.nettRevenueErp(agg);
                        cashRef = this.cashReferensi(agg);
                    }
                    return `<tr>
                        <td>${escapeHtmlS3(this.formatPeriodDate(ps))} — ${escapeHtmlS3(this.formatPeriodDate(pe))}</td>
                        <td>${escapeHtmlS3(this.formatRupiah(nett))}</td>
                        <td>${escapeHtmlS3(this.formatRupiah(r.minutes_cash))}</td>
                        <td>${escapeHtmlS3(this.formatRupiah(r.minutes_non_cash))}</td>
                        <td>${escapeHtmlS3(this.formatRupiah(r.minutes_cash_out))}</td>
                        <td>${escapeHtmlS3(this.formatRupiah(cashRef))}</td>
                        <td>${escapeHtmlS3(this.formatRupiah(r.setoran_cash_actual))}</td>
                        <td>${escapeHtmlS3(r.status || "—")}</td>
                        <td>${escapeHtmlS3(r.spv_note || "—")}</td>
                    </tr>`;
                }))).join("")
                : `<tr><td colspan="9">Belum ada record setoran 3 harian di bulan ini.</td></tr>`;
 
            let dailyHtml = "";
            for(let d = 1; d <= bounds.lastDay; d++){
                const iso = `${bounds.year}-${String(bounds.month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                const m = dayMap.get(iso);
                dailyHtml += `<tr>
                    <td>${escapeHtmlS3(iso.split("-").reverse().join("/"))}</td>
                    <td>${escapeHtmlS3(this.formatRupiah(this.nettRevenueErp(m)))}</td>
                    <td>${escapeHtmlS3(this.formatRupiah(m?.cash_payment ?? 0))}</td>
                    <td>${escapeHtmlS3(this.formatRupiah(m?.non_cash ?? 0))}</td>
                    <td>${escapeHtmlS3(this.formatRupiah(m?.cash_out ?? 0))}</td>
                    <td>${escapeHtmlS3(this.formatRupiah(this.cashReferensi(m)))}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>Minutes harian</td>
                </tr>`;
            }
 
            const spvBlock = spvChecked
                ? `Nama: ${escapeHtmlS3(spvName || "—")}<br>Tanggal: ${escapeHtmlS3(this.formatStampDate(lastSubmitted.spv_submitted_at))}`
                : `BELUM DIPERIKSA SPV<br>Nama: ____________<br>Tanggal: ____________`;
 
            const ownerBlock = ownerApproved
                ? `Nama: ${escapeHtmlS3(ownerName || "—")}<br>Tanggal: ${escapeHtmlS3(this.formatStampDate(lastClear.owner_approved_at))}`
                : `BELUM DISETUJUI OWNER<br>Nama: ____________<br>Tanggal: ____________`;
 
            const periodLabel =
                `${String(bounds.start).slice(8,10)}/${String(bounds.start).slice(5,7)}/${bounds.year}` +
                ` — ${String(bounds.end).slice(8,10)}/${String(bounds.end).slice(5,7)}/${bounds.year}`;
 
            const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>Laporan Setoran — ${escapeHtmlS3(nama)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
body{ font-family: Arial, Helvetica, sans-serif; color:#111; font-size:12px; }
h1{ font-size:18px; margin:0 0 4px; }
h2{ font-size:14px; margin:0 0 12px; font-weight:600; }
.meta{ margin-bottom:14px; line-height:1.5; }
table{ width:100%; border-collapse:collapse; margin-bottom:16px; }
th,td{ border:1px solid #333; padding:5px 6px; text-align:left; vertical-align:top; }
th{ background:#f0f0f0; }
.footer{ display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:28px; }
.box{ border:1px solid #333; padding:12px; min-height:90px; }
.box h3{ margin:0 0 10px; font-size:12px; }
</style></head><body>
<h1>VAX WIJAYA BARBERSHOP</h1>
<h2>LAPORAN SETORAN CABANG</h2>
<div class="meta">
<strong>Cabang:</strong> ${escapeHtmlS3(nama)}<br>
<strong>Periode:</strong> ${escapeHtmlS3(this.formatPeriodLong(bounds.start))} — ${escapeHtmlS3(this.formatPeriodLong(bounds.end))}
<span style="display:none">${escapeHtmlS3(periodLabel)}</span>
</div>
 
<h2>Rekap Periode Setoran 3 Harian</h2>
<table>
<thead><tr>
<th>Tanggal / Periode</th><th>Nett Revenue</th><th>Cash Minutes</th><th>QRIS / Non Cash</th>
<th>Cash Out</th><th>Cash Referensi</th><th>Setoran Cash Aktual</th><th>Status</th><th>Catatan Cabang</th>
</tr></thead>
<tbody>${periodRowsHtml}</tbody>
</table>
 
<h2>Minutes Harian (01/${String(bounds.month).padStart(2,"0")}/${bounds.year} — ${String(bounds.lastDay).padStart(2,"0")}/${String(bounds.month).padStart(2,"0")}/${bounds.year})</h2>
<table>
<thead><tr>
<th>Tanggal</th><th>Nett Revenue</th><th>Cash Minutes</th><th>QRIS / Non Cash</th>
<th>Cash Out</th><th>Cash Referensi</th><th>Setoran Cash Aktual</th><th>Status</th><th>Catatan Cabang</th>
</tr></thead>
<tbody>${dailyHtml}</tbody>
</table>
 
<div class="footer">
  <div class="box"><h3>DIPERIKSA OLEH SPV</h3>${spvBlock}</div>
  <div class="box"><h3>DISETUJUI OLEH OWNER</h3>${ownerBlock}</div>
</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
 
            const w = window.open("", "_blank");
            if(!w){
                alert("Popup diblokir — izinkan popup untuk print.");
                return;
            }
            w.document.open();
            w.document.write(html);
            w.document.close();
        }catch(err){
            console.error(err);
            alert(err.message || "Gagal menyiapkan print.");
        }
    },
 
    /* ---------- Load pipeline ---------- */
 
    async loadInsightForActive(start, end){
        const row = this.activeRow;
        const body = document.getElementById("setoran3AiBody");
        if(!row){
            this.insight = null;
            this.cashOutAnalysis = null;
            this.renderInsight(null);
            this.renderCashOutWarn(null);
            return;
        }
        if(body) body.innerHTML = `<p class="setoran3-ai-loading">Memuat analisis dari histori Minutes…</p>`;
 
        const len = this.daysInclusive(start, end) || 3;
        const prevEnd = this.addDaysIso(start, -1);
        const prevStart = this.addDaysIso(prevEnd, -(len - 1));
 
        const histEnd = this.addDaysIso(start, -1);
        const histStart = this.addDaysIso(histEnd, -29);
 
        const [curr, prev, historyDataset] = await Promise.all([
            this.loadMinutesAggregate(row.cabang_id, start, end),
            this.loadMinutesAggregate(row.cabang_id, prevStart, prevEnd),
            DailyDataEngine.load({
                client: db,
                start: histStart,
                end: histEnd,
                cabangId: row.cabang_id
            }).catch(() => ({ rows: [] }))
        ]);
        const histRows = historyDataset.rows || [];
 
        const hasPrev = prev.days > 0;
        const prevAgg = hasPrev ? prev : null;
 
        let histAvg = null;
        if((histRows || []).length >= len){
            const totalOut = histRows.reduce((t, r) => t + Number(r.cash_out || 0), 0);
            const periods = Math.max(1, Math.floor((histRows.length) / len));
            histAvg = totalOut / periods;
        }
 
        // Override angka Minutes di row dari aggregate aktual.
        // nett_revenue tetap mentah Minutes — ERP dihitung di nettRevenueErp().
        row.minutes_cash = curr.cash_payment;
        row.minutes_non_cash = curr.non_cash;
        row.minutes_cash_out = curr.cash_out;
        row.nett_revenue = Number(curr.nett_revenue || 0);
        row.product_cost = Number(curr.product_cost || 0);
        row.nett_erp = this.nettRevenueErp(curr);
        row.cash_referensi = this.cashReferensi(curr);
 
        this.cashOutAnalysis = this.analyzeCashOut(curr, prevAgg, histAvg);
        this.insight = this.buildInsight(curr, prevAgg, this.cashOutAnalysis, row.nama_cabang, row.spv_note);
 
        this.renderSummaryCards(row, curr);
        this.renderPerfGrid(curr, prevAgg);
        this.renderCashOutWarn(this.cashOutAnalysis);
        this.renderInsight(this.insight);
        this.renderTable();
        this.syncSpvForm(row);
    },
 
    async load({ quiet = false } = {}){
        const seq = ++this.loadSeq;
        try{
            this.init();
            this.detectRole();
 
            if(!this.filtersRestored){
                this.restoreFilter();
                this.filtersRestored = true;
            }
            this.syncPeriodButton();
 
            await this.loadCabangList();
            if(seq !== this.loadSeq) return;
            this.resolveActiveCabangId();
            this.syncActiveCabangUi();
 
            /* Suggestion default saja — tidak menimpa histori/URL/FILTER_KEY */
            if(this.periodSuggestPending){
                await this.applySuggestedPeriodIfPending();
                if(seq !== this.loadSeq) return;
            }
 
            const { start, end } = this.getFilter();
            const cabangId = this.activeCabangId;
            if(!this.isValidDateRange(start, end)){
                if(!quiet) alert("Tanggal awal dan akhir wajib valid.");
                return;
            }
 
            /* Ringkasan Semua Cabang — parallel READ-ONLY, tidak mengganggu pipeline cabang aktif */
            this.loadAllBranchesSummary();
 
            const [minutesMap, savedMap] = await Promise.all([
                this.loadMinutesMap(start, end),
                this.loadSavedMap(start, end)
            ]);
            if(seq !== this.loadSeq) return;
 
            this.allRows = this.buildRows(minutesMap, savedMap, start, end);
            this.rows = cabangId
                ? this.allRows.filter(r => Number(r.cabang_id) === Number(cabangId))
                : [];
 
            this.renderProgress();
            /* Refresh actual/status di ringkasan semua cabang setelah allRows siap */
            this.renderAllBranchesSummary(this.allBranchesAgg || this.emptyAllBranchesAggregate());
            this.renderMode();
            this.syncActiveCabangUi();
            this.saveFilter();
 
            if(cabangId && this.activeRow){
                await this.loadInsightForActive(start, end);
            }else{
                this.insight = null;
                this.cashOutAnalysis = null;
                this.renderInsight(null);
                this.renderCashOutWarn(null);
            }
 
            if(typeof OwnerAuth !== "undefined"){
                OwnerAuth.applyAccessControl();
            }
 
            const banner = document.getElementById("qrisRecoAccessBanner");
            if(banner && this.isSpv()){
                banner.hidden = false;
                const nama = this.getActiveCabang()?.display_name || "—";
                banner.textContent =
                    `Mode SPV — cabang aktif: ${nama}. Progress memantau ${this.cabangList.length} cabang. CLEAR hanya Owner.`;
            }
        }catch(err){
            if(seq !== this.loadSeq) return;
            console.error("Setoran3Harian.load error:", err);
            const body = document.getElementById("setoran3TableBody");
            if(body){
                body.innerHTML = `<tr><td colspan="11">Gagal memuat: ${escapeHtmlS3(err.message || err)}</td></tr>`;
            }
            this.showBanner(`Gagal memuat Setoran 3 Harian: ${escapeHtmlS3(err.message || err)}`, true);
        }
    }
};
 
function setTextS3(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
}
 
function escapeHtmlS3(text){
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
 
document.addEventListener("erp:components-ready", async () => {
    if(document.getElementById("setoran3Sticky") || document.getElementById("setoran3TableBody")){
        await Setoran3Harian.load();
        // Sinkron UI dari state yang sudah di-restore — JANGAN apply default / re-resolve cabang
        setTimeout(async () => {
            const saved = (() => {
                try{ return JSON.parse(localStorage.getItem(Setoran3Harian.FILTER_KEY) || "null"); }
                catch(_e){ return null; }
            })();
            const startEl = document.getElementById("qrisRecoStart");
            const endEl = document.getElementById("qrisRecoEnd");
            const start = Setoran3Harian.normalizeIsoDate(saved?.start)
                || Setoran3Harian.readPeriodFromDom().start;
            const end = Setoran3Harian.normalizeIsoDate(saved?.end)
                || Setoran3Harian.readPeriodFromDom().end;
            if(start && end && start <= end){
                if(startEl) startEl.value = start;
                if(endEl) endEl.value = end;
            }
            if(saved?.cabangId != null && saved.cabangId !== ""){
                Setoran3Harian.pendingCabangId = Number(saved.cabangId);
                Setoran3Harian.resolveActiveCabangId();
            }
            if(saved?.cabangName) Setoran3Harian.persistedCabangName = String(saved.cabangName);
            if(saved?.periode) Setoran3Harian.persistedPeriode = String(saved.periode);
            Setoran3Harian.syncPeriodButton();
            Setoran3Harian.syncActiveCabangUi();
            Setoran3Harian.saveFilter();
 
            if(typeof QrisReconciliation !== "undefined" && typeof QrisReconciliation.load === "function"){
                QrisReconciliation.filtersRestored = true;
                if(Setoran3Harian.activeCabangId != null){
                    QrisReconciliation.pendingCabangId = Number(Setoran3Harian.activeCabangId);
                }
                await QrisReconciliation.load({ quiet: true });
            }
 
            try{
                const q = new URLSearchParams(window.location.search || "");
                const wantQris = String(q.get("menu") || "").toLowerCase() === "qris";
                if(wantQris){
                    const section = document.getElementById("sectionQrisReco");
                    if(section && typeof section.scrollIntoView === "function"){
                        section.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                }
            }catch(_e){ /* ignore */ }
        }, 450);
    }
});
