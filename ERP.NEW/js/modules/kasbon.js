/*
=========================================================
VAX ERP — Kasbon Karyawan (Cash In / Kasbon)
=========================================================
Scope: modul kasbon saja.
Tidak mengubah SetoranMoneyEngine / Arus Kas / Dashboard /
Absensi / Payroll core / Sidebar.
=========================================================
*/

const KasbonModule = {
    TABLE: "employee_cash_advances",
    HISTORY: "employee_cash_advance_history",
    FILTER_KEY: "vax_kasbon_filter",

    cabangList: [],
    karyawanList: [],
    rows: [],
    historyCache: new Map(),
    role: "spv",
    busy: false,
    _bound: false,
    _mounted: false,
    _cashInNode: null,
    _editingId: null,
    _gajiAvailable: null,

    /* Custom date range picker (UI) — source of truth tetap #kasbonFilterStart/End */
    _rangeOpen: false,
    _rangeDraftStart: null,
    _rangeDraftEnd: null,
    _rangeViewYear: null,
    _rangeViewMonth: null,
    MONTH_ID: [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ],

    async boot(opts = {}){
        await this.mountUi(opts.hostId || "financeKasbonRoot");
        this.detectRole();
        this.bindEvents();
        this.restoreFilters();
        this.syncRangeLabel();
        await this.loadCabang();
        await this.loadKaryawan();
        this.fillFilterCabang();
        this.fillFilterKaryawan();
        this.enhanceSelects();
        await this.loadList();
        this.applyRoleUi();
        this.syncGlobalHeaderContext();
    },

    /** Sinkron chip header induk (Cabang aktif / Periode aktif) — UI only, tidak ubah filter logic */
    syncGlobalHeaderContext(){
        const title = document.getElementById("erpHeaderTitle");
        const sub = document.getElementById("erpHeaderSub");
        const cabangEl = document.getElementById("erpHeaderCabang");
        const periodeEl = document.getElementById("erpHeaderPeriode");

        if(title) title.textContent = "CASH IN / KASBON";
        if(sub) sub.textContent = "Pengajuan & approval kasbon karyawan";

        if(cabangEl){
            const sel = document.getElementById("kasbonFilterCabang");
            const opt = sel?.selectedOptions?.[0];
            const val = sel?.value || "";
            cabangEl.textContent = val && opt
                ? (opt.textContent || "").trim()
                : "Semua Cabang";
        }

        if(periodeEl){
            const start = document.getElementById("kasbonFilterStart")?.value || "";
            const end = document.getElementById("kasbonFilterEnd")?.value || "";
            if(start && end && start === end){
                periodeEl.textContent = this.formatRangeDisplay(start);
            }else if(start && end){
                periodeEl.textContent = `${this.formatRangeDisplay(start)} — ${this.formatRangeDisplay(end)}`;
            }else if(start){
                periodeEl.textContent = `${this.formatRangeDisplay(start)} — …`;
            }else{
                periodeEl.textContent = "—";
            }
        }

        if(typeof syncSidebarRoleMeta === "function") syncSidebarRoleMeta();
    },

    detectRole(){
        const raw = (typeof OwnerAuth !== "undefined" && OwnerAuth.profile?.role)
            || localStorage.getItem("role")
            || "";
        if(typeof OwnerAuth !== "undefined" && typeof OwnerAuth.isOwnerRole === "function"){
            this.role = OwnerAuth.isOwnerRole(raw) ? "owner" : "spv";
        }else{
            this.role = String(raw).toLowerCase() === "owner" ? "owner" : "spv";
        }
    },

    applyRoleUi(){
        const queue = document.getElementById("kasbonOwnerQueue");
        if(queue) queue.hidden = this.role !== "owner";
        const newBtn = document.getElementById("kasbonNewBtn");
        if(newBtn) newBtn.hidden = false; // SPV + Owner boleh buat
    },

    async mountUi(hostId){
        const host = document.getElementById(hostId);
        if(!host) throw new Error("Host Kasbon tidak ditemukan");
        if(host.dataset.mounted === "1"){
            this._mounted = true;
            return;
        }

        // Preserve existing Cash In hub content (pindahkan, jangan hapus)
        const hubCard = document.getElementById("financeHubCard");
        const hubGrid = document.getElementById("financeHubGrid");
        const chips = document.getElementById("financeFilterChips");
        const badge = document.getElementById("financeBadge");
        const title = document.getElementById("financeTitle");
        const desc = document.getElementById("financeDesc");

        this._cashInNode = document.createElement("div");
        this._cashInNode.className = "kasbon-cashin-preserved";
        if(badge){
            const b = document.createElement("p");
            b.className = "erp-section-badge";
            b.textContent = badge.textContent || "CASH IN";
            this._cashInNode.appendChild(b);
        }
        if(title){
            const h = document.createElement("h2");
            h.textContent = title.textContent || "CASH IN / KASBON";
            this._cashInNode.appendChild(h);
        }
        if(desc){
            const p = document.createElement("p");
            p.textContent = desc.textContent || "Menu Cash In / Kasbon.";
            this._cashInNode.appendChild(p);
        }

        const res = await fetch("../components/kasbon.html");
        if(!res.ok) throw new Error("Gagal memuat komponen Kasbon");
        host.innerHTML = await res.text();
        host.dataset.mounted = "1";

        const cashHost = document.getElementById("kasbonCashInHost");
        if(cashHost){
            cashHost.appendChild(this._cashInNode);
            if(chips) cashHost.appendChild(chips);
            if(hubGrid) cashHost.appendChild(hubGrid);
        }

        // Hide original hub chrome (content sudah dipindah ke tab Cash In)
        [badge, title, desc].forEach((el) => { if(el) el.hidden = true; });
        if(hubCard) hubCard.classList.add("kasbon-hub-shell");

        this._mounted = true;
        this.showMainTab("kasbon");
    },

    showMainTab(tab){
        const isKasbon = tab === "kasbon";
        document.getElementById("kasbonTabKasbon")?.classList.toggle("is-active", isKasbon);
        document.getElementById("kasbonTabCashIn")?.classList.toggle("is-active", !isKasbon);
        const pKasbon = document.getElementById("kasbonPanelKasbon");
        const pCash = document.getElementById("kasbonPanelCashIn");
        if(pKasbon) pKasbon.hidden = !isKasbon;
        if(pCash) pCash.hidden = isKasbon;
    },

    bindEvents(){
        if(this._bound) return;
        this._bound = true;
        const root = document.getElementById("financeKasbonRoot") || document;

        root.addEventListener("click", (e) => {
            const tabBtn = e.target.closest("[data-kasbon-main-tab]");
            if(tabBtn){
                this.showMainTab(tabBtn.getAttribute("data-kasbon-main-tab"));
                return;
            }
            if(e.target.closest("#kasbonRefresh")){
                this.loadList();
                return;
            }
            if(e.target.closest("#kasbonNewBtn")){
                this.openForm();
                return;
            }
            if(e.target.closest("#kasbonFilterApply")){
                this.persistFilters();
                this.loadList();
                this.syncGlobalHeaderContext();
                return;
            }
            if(e.target.closest("#kasbonRangeTrigger")){
                this.toggleRangePopup();
                return;
            }
            if(e.target.closest("#kasbonRangePrev")){
                this.shiftRangeMonth(-1);
                return;
            }
            if(e.target.closest("#kasbonRangeNext")){
                this.shiftRangeMonth(1);
                return;
            }
            if(e.target.closest("#kasbonRangeClear")){
                this.resetRangeToDefaultMonth();
                return;
            }
            if(e.target.closest("#kasbonRangeCancel")){
                this.closeRangePopup(false);
                return;
            }
            if(e.target.closest("#kasbonRangeApply")){
                this.applyRangeDraft();
                return;
            }
            const dayBtn = e.target.closest("[data-kasbon-day]");
            if(dayBtn){
                this.pickRangeDay(dayBtn.getAttribute("data-kasbon-day"));
                return;
            }
            if(e.target.closest("#kasbonSaveDraft")){
                this.submitForm("DRAFT");
                return;
            }
            if(e.target.closest("#kasbonSubmitOwner")){
                this.submitForm("MENUNGGU OWNER");
                return;
            }
            const close = e.target.closest("[data-kasbon-close]");
            if(close){
                this.closeModal(close.getAttribute("data-kasbon-close"));
                return;
            }
            const detailBtn = e.target.closest("[data-kasbon-detail]");
            if(detailBtn){
                this.openDetail(detailBtn.getAttribute("data-kasbon-detail"));
                return;
            }
            const ownAct = e.target.closest("[data-kasbon-owner]");
            if(ownAct){
                this.openOwnerAction(
                    ownAct.getAttribute("data-kasbon-id"),
                    ownAct.getAttribute("data-kasbon-owner")
                );
                return;
            }
            const disburse = e.target.closest("[data-kasbon-disburse]");
            if(disburse){
                this.disburse(disburse.getAttribute("data-kasbon-disburse"));
                return;
            }
            const lunas = e.target.closest("[data-kasbon-lunas]");
            if(lunas){
                this.markLunas(lunas.getAttribute("data-kasbon-lunas"));
                return;
            }
            const editBtn = e.target.closest("[data-kasbon-edit]");
            if(editBtn){
                this.openForm(editBtn.getAttribute("data-kasbon-edit"));
                return;
            }
        });

        root.addEventListener("change", (e) => {
            if(e.target.id === "kasbonFilterCabang"){
                this.fillFilterKaryawan();
                this.syncGlobalHeaderContext();
                return;
            }
            if(e.target.id === "kasbonFormCabang"){
                this.fillFormKaryawan();
                this.clearEmployeeSummary();
                return;
            }
            if(e.target.id === "kasbonFormKaryawan"){
                this.onEmployeeSelected();
                return;
            }
            if(e.target.id === "kasbonFormRekom"){
                this.syncSubmitButtons();
            }
        });

        root.addEventListener("input", (e) => {
            if(e.target.id === "kasbonFormNominal"){
                this.formatNominalInput(e.target);
                this.refreshProjection();
            }
            if(e.target.id === "kasbonOwnerAmount"){
                this.formatNominalInput(e.target);
            }
        });

        document.getElementById("kasbonOwnerForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            this.confirmOwnerAction();
        });

        document.addEventListener("click", (e) => {
            if(!this._rangeOpen) return;
            const wrap = document.getElementById("kasbonRangeWrap");
            if(wrap && !wrap.contains(e.target)){
                this.closeRangePopup(false);
            }
        });
        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && this._rangeOpen){
                this.closeRangePopup(false);
            }
        });
    },

    /* ---------- custom date range picker (UI only) ---------- */
    formatRangeDisplay(ymd){
        const p = String(ymd || "").slice(0, 10).split("-");
        if(p.length !== 3) return "—";
        return `${p[2]}/${p[1]}/${p[0]}`;
    },

    syncRangeLabel(){
        const start = document.getElementById("kasbonFilterStart")?.value || "";
        const end = document.getElementById("kasbonFilterEnd")?.value || "";
        const label = document.getElementById("kasbonRangeLabel");
        if(!label) return;
        if(start && end){
            label.textContent = `${this.formatRangeDisplay(start)} → ${this.formatRangeDisplay(end)}`;
        }else if(start){
            label.textContent = `${this.formatRangeDisplay(start)} → …`;
        }else{
            label.textContent = "Pilih rentang tanggal";
        }
    },

    toggleRangePopup(){
        if(this._rangeOpen) this.closeRangePopup(false);
        else this.openRangePopup();
    },

    openRangePopup(){
        const popup = document.getElementById("kasbonRangePopup");
        const trigger = document.getElementById("kasbonRangeTrigger");
        if(!popup) return;

        const start = document.getElementById("kasbonFilterStart")?.value || "";
        const end = document.getElementById("kasbonFilterEnd")?.value || "";
        this._rangeDraftStart = start || null;
        this._rangeDraftEnd = end || null;

        const seed = start || this.todayWib();
        const parts = seed.split("-").map(Number);
        this._rangeViewYear = parts[0];
        this._rangeViewMonth = (parts[1] || 1) - 1;

        this._rangeOpen = true;
        popup.hidden = false;
        if(trigger) trigger.setAttribute("aria-expanded", "true");
        this.renderRangeCalendar();
    },

    closeRangePopup(){
        const popup = document.getElementById("kasbonRangePopup");
        const trigger = document.getElementById("kasbonRangeTrigger");
        this._rangeOpen = false;
        if(popup) popup.hidden = true;
        if(trigger) trigger.setAttribute("aria-expanded", "false");
        this.syncRangeLabel();
    },

    shiftRangeMonth(delta){
        let y = this._rangeViewYear;
        let m = this._rangeViewMonth + Number(delta || 0);
        while(m < 0){ m += 12; y -= 1; }
        while(m > 11){ m -= 12; y += 1; }
        this._rangeViewYear = y;
        this._rangeViewMonth = m;
        this.renderRangeCalendar();
    },

    pickRangeDay(iso){
        const day = String(iso || "").slice(0, 10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;

        if(!this._rangeDraftStart || (this._rangeDraftStart && this._rangeDraftEnd)){
            this._rangeDraftStart = day;
            this._rangeDraftEnd = null;
            this.renderRangeCalendar();
            return;
        }

        let start = this._rangeDraftStart;
        let end = day;
        if(end < start){
            const tmp = start;
            start = end;
            end = tmp;
        }
        this._rangeDraftStart = start;
        this._rangeDraftEnd = end;
        this.renderRangeCalendar();
    },

    applyRangeDraft(){
        if(!this._rangeDraftStart){
            this.toast("Pilih tanggal mulai (Dari) terlebih dahulu.", "warn");
            return;
        }
        let start = this._rangeDraftStart;
        let end = this._rangeDraftEnd || this._rangeDraftStart;
        if(end < start){
            const tmp = start;
            start = end;
            end = tmp;
        }
        const startEl = document.getElementById("kasbonFilterStart");
        const endEl = document.getElementById("kasbonFilterEnd");
        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;
        this.syncRangeLabel();
        this.syncGlobalHeaderContext();
        this.closeRangePopup();
        /* Filter data tetap lewat tombol Terapkan existing — tidak auto-load */
    },

    resetRangeToDefaultMonth(){
        const { start, end } = this.monthBoundsWib(this.todayWib());
        this._rangeDraftStart = start;
        this._rangeDraftEnd = end;
        const parts = start.split("-").map(Number);
        this._rangeViewYear = parts[0];
        this._rangeViewMonth = (parts[1] || 1) - 1;
        const startEl = document.getElementById("kasbonFilterStart");
        const endEl = document.getElementById("kasbonFilterEnd");
        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;
        this.syncRangeLabel();
        this.syncGlobalHeaderContext();
        this.renderRangeCalendar();
    },

    renderRangeCalendar(){
        const grid = document.getElementById("kasbonRangeGrid");
        const monthEl = document.getElementById("kasbonRangeMonth");
        const draftStartEl = document.getElementById("kasbonRangeDraftStart");
        const draftEndEl = document.getElementById("kasbonRangeDraftEnd");
        const hintEl = document.getElementById("kasbonRangeHint");
        if(!grid) return;

        const y = this._rangeViewYear;
        const m = this._rangeViewMonth;
        if(monthEl) monthEl.textContent = `${this.MONTH_ID[m]} ${y}`;

        if(draftStartEl){
            draftStartEl.textContent = this._rangeDraftStart
                ? this.formatRangeDisplay(this._rangeDraftStart)
                : "—";
        }
        if(draftEndEl){
            draftEndEl.textContent = this._rangeDraftEnd
                ? this.formatRangeDisplay(this._rangeDraftEnd)
                : "—";
        }
        if(hintEl){
            hintEl.textContent = (!this._rangeDraftStart || this._rangeDraftEnd)
                ? "Pilih tanggal mulai, lalu tanggal akhir."
                : "Pilih tanggal akhir untuk menyelesaikan range.";
        }

        const first = new Date(Date.UTC(y, m, 1, 12, 0, 0));
        const weekdayMon0 = (first.getUTCDay() + 6) % 7;
        const daysInMonth = new Date(Date.UTC(y, m + 1, 0, 12, 0, 0)).getUTCDate();
        const today = this.todayWib();
        const start = this._rangeDraftStart;
        const end = this._rangeDraftEnd;

        let html = "";
        for(let i = 0; i < weekdayMon0; i++){
            html += `<span class="kasbon-day is-empty"></span>`;
        }
        for(let d = 1; d <= daysInMonth; d++){
            const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const cls = ["kasbon-day"];
            if(iso === today) cls.push("is-today");
            if(start && iso === start) cls.push("is-start");
            if(end && iso === end) cls.push("is-end");
            if(start && end && iso > start && iso < end) cls.push("is-in-range");
            if(start && !end && iso === start) cls.push("is-picking");
            html += `<button type="button" class="${cls.join(" ")}" data-kasbon-day="${iso}">${d}</button>`;
        }
        grid.innerHTML = html;
    },

    /* ---------- helpers ---------- */
    toast(msg, type){
        if(typeof ErpToast !== "undefined" && ErpToast.show){
            ErpToast.show(msg, type || "info");
            return;
        }
        alert(msg);
    },

    escapeHtml(str){
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    todayWib(){
        return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    },

    monthBoundsWib(ymd){
        const base = ymd || this.todayWib();
        const [y, m] = base.split("-").map(Number);
        const start = `${y}-${String(m).padStart(2, "0")}-01`;
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
        return { start, end, y, m };
    },

    parseRupiah(text){
        const digits = String(text || "").replace(/[^\d]/g, "");
        if(!digits) return 0;
        return Number(digits);
    },

    formatRupiah(n){
        const v = Number(n || 0);
        return "Rp" + v.toLocaleString("id-ID");
    },

    formatNominalInput(el){
        const n = this.parseRupiah(el.value);
        el.value = n ? this.formatRupiah(n) : "";
    },

    statusClass(st){
        const s = String(st || "");
        if(s === "MENUNGGU OWNER" || s === "DIKEMBALIKAN") return "is-wait";
        if(s === "DISETUJUI" || s === "DICAIRKAN" || s === "AKTIF" || s === "LUNAS") return "is-ok";
        if(s === "DITOLAK") return "is-bad";
        if(s === "DRAFT") return "is-muted";
        return "is-info";
    },

    isOpsCabang(c){
        const name = String(c?.nama_cabang || "").toLowerCase();
        if(name.includes("floating")) return false;
        if(c?.aktif === false) return false;
        if(c?.nama_minutes != null && String(c.nama_minutes).trim() === "") return false;
        return true;
    },

    /* ---------- data load ---------- */
    async loadCabang(){
        let data = null;
        let error = null;
        ({ data, error } = await db
            .from("cabang")
            .select("id,nama_cabang,urutan,aktif,nama_minutes")
            .eq("aktif", true)
            .order("urutan", { ascending: true, nullsFirst: false }));

        if(error && /nama_minutes|urutan|column/i.test(error.message || "")){
            ({ data, error } = await db
                .from("cabang")
                .select("id,nama_cabang,aktif")
                .eq("aktif", true)
                .order("id"));
        }
        if(error) throw error;
        this.cabangList = (data || []).filter((c) => this.isOpsCabang(c));
    },

    async loadKaryawan(){
        const colsTry = [
            "id,nama_karyawan,jabatan,cabang_id,aktif,gaji_pokok",
            "id,nama_karyawan,jabatan,cabang_id,aktif,gaji",
            "id,nama_karyawan,jabatan,cabang_id,aktif"
        ];
        let lastErr = null;
        for(const cols of colsTry){
            const { data, error } = await db
                .from("karyawan")
                .select(cols)
                .order("nama_karyawan", { ascending: true });
            if(!error){
                this.karyawanList = (data || []).filter((k) => k.aktif !== false);
                this._gajiAvailable = cols.includes("gaji");
                return;
            }
            lastErr = error;
            if(!/column|gaji/i.test(error.message || "")) break;
        }
        if(lastErr) throw lastErr;
        this.karyawanList = [];
    },

    /* UI only — custom dark select, tidak ubah value/options */
    enhanceSelects(){
        if(typeof ErpCustomSelect === "undefined") return;
        ErpCustomSelect.bindOutsideClose();
        const root = document.getElementById("financeKasbonRoot") || document;
        root.querySelectorAll("select[data-erp-cselect]").forEach((sel) => {
            ErpCustomSelect.enhance(sel);
            this.syncCselectLabel(sel);
            this.bindCselectOpenFocus(sel);
        });
        this.bindCselectKeyboard(root);
    },

    syncCselectLabel(el){
        const trigger = el?.closest(".erp-cselect")?.querySelector(".erp-cselect-trigger");
        if(!trigger || !el) return;
        const opt = el.selectedOptions?.[0];
        const text = opt ? opt.textContent : "—";
        trigger.innerHTML = `<span>${text}</span><i aria-hidden="true">▾</i>`;
    },

    setCselectActive(menu, idx){
        if(!menu) return;
        const list = menu.querySelector(".erp-cselect-list") || menu;
        const opts = [...list.querySelectorAll(".erp-cselect-option")].filter((o) => !o.hidden);
        if(!opts.length) return;
        const i = Math.max(0, Math.min(idx, opts.length - 1));
        opts.forEach((o, n) => o.classList.toggle("is-active", n === i));
        opts[i].scrollIntoView({ block: "nearest" });
    },

    bindCselectOpenFocus(sel){
        const wrap = sel?.closest(".erp-cselect");
        const trigger = wrap?.querySelector(".erp-cselect-trigger");
        if(!wrap || !trigger || trigger.dataset.kasbonCselectFocus === "1") return;
        trigger.dataset.kasbonCselectFocus = "1";
        trigger.addEventListener("click", () => {
            window.requestAnimationFrame(() => {
                if(!wrap.classList.contains("is-open")) return;
                const menu = wrap.querySelector(".erp-cselect-menu");
                if(!menu) return;
                const list = menu.querySelector(".erp-cselect-list") || menu;
                const opts = [...list.querySelectorAll(".erp-cselect-option")].filter((o) => !o.hidden);
                const selected = Math.max(0, opts.findIndex((o) => o.classList.contains("is-selected")));
                this.setCselectActive(menu, selected);
            });
        });
    },

    bindCselectKeyboard(root){
        if(this._cselectKeysBound) return;
        this._cselectKeysBound = true;

        root.addEventListener("keydown", (e) => {
            const wrap = e.target.closest?.(".erp-cselect") || root.querySelector(".erp-cselect.is-open");
            if(!wrap || !root.contains(wrap)) return;

            const menu = wrap.querySelector(".erp-cselect-menu");
            const trigger = wrap.querySelector(".erp-cselect-trigger");
            const isOpen = wrap.classList.contains("is-open");
            const list = menu?.querySelector(".erp-cselect-list") || menu;
            const opts = list ? [...list.querySelectorAll(".erp-cselect-option")].filter((o) => !o.hidden) : [];

            if(e.key === "Escape"){
                e.preventDefault();
                if(typeof ErpCustomSelect !== "undefined") ErpCustomSelect.closeAll();
                else wrap._erpCselectClose?.();
                trigger?.focus();
                return;
            }

            if(e.key === "ArrowDown" || e.key === "ArrowUp"){
                e.preventDefault();
                if(!isOpen){
                    trigger?.click();
                    return;
                }
                if(!opts.length) return;
                let idx = opts.findIndex((o) => o.classList.contains("is-active"));
                if(idx < 0) idx = opts.findIndex((o) => o.classList.contains("is-selected"));
                if(idx < 0) idx = 0;
                this.setCselectActive(menu, idx + (e.key === "ArrowDown" ? 1 : -1));
                return;
            }

            if(e.key === "Enter" && isOpen){
                e.preventDefault();
                if(!opts.length) return;
                let idx = opts.findIndex((o) => o.classList.contains("is-active"));
                if(idx < 0) idx = opts.findIndex((o) => o.classList.contains("is-selected"));
                if(idx < 0) idx = 0;
                opts[idx]?.click();
            }
        });
    },

    fillFilterCabang(){
        const el = document.getElementById("kasbonFilterCabang");
        if(!el) return;
        const cur = el.value;
        const opts = [`<option value="">${this.role === "owner" ? "Semua Cabang" : "Semua Cabang (scope)"}</option>`];
        this.cabangList.forEach((c) => {
            opts.push(`<option value="${c.id}">${this.escapeHtml(c.nama_cabang || ("#" + c.id))}</option>`);
        });
        el.innerHTML = opts.join("");
        if(cur) el.value = cur;
        this.syncCselectLabel(el);
    },

    fillFilterKaryawan(){
        const el = document.getElementById("kasbonFilterKaryawan");
        const cabangId = document.getElementById("kasbonFilterCabang")?.value || "";
        if(!el) return;
        const cur = el.value;
        let list = this.karyawanList;
        if(cabangId) list = list.filter((k) => Number(k.cabang_id) === Number(cabangId));
        const opts = [`<option value="">Semua Karyawan</option>`];
        list.forEach((k) => {
            opts.push(`<option value="${k.id}">${this.escapeHtml(k.nama_karyawan || ("#" + k.id))}</option>`);
        });
        el.innerHTML = opts.join("");
        if(cur) el.value = cur;
        this.syncCselectLabel(el);
    },

    fillFormCabang(){
        const el = document.getElementById("kasbonFormCabang");
        if(!el) return;
        const cur = el.value;
        el.innerHTML = `<option value="">— Pilih cabang —</option>` + this.cabangList.map((c) =>
            `<option value="${c.id}">${this.escapeHtml(c.nama_cabang || ("#" + c.id))}</option>`
        ).join("");
        if(cur) el.value = cur;
        this.syncCselectLabel(el);
    },

    fillFormKaryawan(){
        const el = document.getElementById("kasbonFormKaryawan");
        const cabangId = document.getElementById("kasbonFormCabang")?.value || "";
        if(!el) return;
        const list = this.karyawanList.filter((k) => Number(k.cabang_id) === Number(cabangId));
        el.innerHTML = `<option value="">— Pilih karyawan —</option>` + list.map((k) =>
            `<option value="${k.id}">${this.escapeHtml(k.nama_karyawan || ("#" + k.id))}</option>`
        ).join("");
        document.getElementById("kasbonFormJabatan").value = "";
        this.syncCselectLabel(el);
    },

    persistFilters(){
        const payload = {
            cabangId: document.getElementById("kasbonFilterCabang")?.value || "",
            karyawanId: document.getElementById("kasbonFilterKaryawan")?.value || "",
            status: document.getElementById("kasbonFilterStatus")?.value || "",
            start: document.getElementById("kasbonFilterStart")?.value || "",
            end: document.getElementById("kasbonFilterEnd")?.value || ""
        };
        try{ localStorage.setItem(this.FILTER_KEY, JSON.stringify(payload)); }catch(_e){ /* ignore */ }
    },

    restoreFilters(){
        let saved = null;
        try{ saved = JSON.parse(localStorage.getItem(this.FILTER_KEY) || "null"); }catch(_e){ saved = null; }
        const { start, end } = this.monthBoundsWib(this.todayWib());
        const set = (id, v) => {
            const el = document.getElementById(id);
            if(el && v != null) el.value = v;
        };
        set("kasbonFilterStart", saved?.start || start);
        set("kasbonFilterEnd", saved?.end || end);
        set("kasbonFilterCabang", saved?.cabangId || "");
        set("kasbonFilterKaryawan", saved?.karyawanId || "");
        set("kasbonFilterStatus", saved?.status || "");
    },

    async loadList(){
        const tbody = document.getElementById("kasbonTableBody");
        if(tbody) tbody.innerHTML = `<tr><td colspan="8" class="kasbon-empty">Memuat…</td></tr>`;

        let q = db.from(this.TABLE).select("*").order("request_date", { ascending: false }).order("created_at", { ascending: false });
        const cabangId = document.getElementById("kasbonFilterCabang")?.value || "";
        const karyawanId = document.getElementById("kasbonFilterKaryawan")?.value || "";
        const status = document.getElementById("kasbonFilterStatus")?.value || "";
        const start = document.getElementById("kasbonFilterStart")?.value || "";
        const end = document.getElementById("kasbonFilterEnd")?.value || "";

        if(cabangId) q = q.eq("branch_id", Number(cabangId));
        if(karyawanId) q = q.eq("employee_id", Number(karyawanId));
        if(status) q = q.eq("status", status);
        if(start) q = q.gte("request_date", start);
        if(end) q = q.lte("request_date", end);

        const { data, error } = await q;
        if(error){
            const msg = error.message || String(error);
            if(/employee_cash_advances|schema cache|does not exist|relation/i.test(msg)){
                if(tbody){
                    tbody.innerHTML = `<tr><td colspan="8" class="kasbon-empty">Tabel kasbon belum tersedia. Jalankan migration 20260830_employee_cash_advances.sql di Supabase.</td></tr>`;
                }
                this.rows = [];
                this.renderSummary();
                this.renderOwnerQueue();
                return;
            }
            this.toast("Gagal memuat kasbon: " + msg, "error");
            if(tbody) tbody.innerHTML = `<tr><td colspan="8" class="kasbon-empty">Gagal memuat data.</td></tr>`;
            return;
        }

        this.rows = data || [];
        await this.hydrateMonthIndexRows();
        this.renderSummary();
        this.renderOwnerQueue();
        this.renderTable();
    },

    async hydrateMonthIndexRows(){
        // Ambil semua record bulan terkait agar label "Kasbon ke-N" akurat meski filter periode sempit
        this._monthIndexRows = this.rows.slice();
        const employees = [...new Set(this.rows.map((r) => Number(r.employee_id)).filter(Boolean))];
        if(!employees.length) return;
        const months = [...new Set(this.rows.map((r) => String(r.request_date || "").slice(0, 7)).filter(Boolean))];
        if(!months.length) return;
        const starts = months.map((m) => `${m}-01`);
        const ends = months.map((m) => {
            const [y, mo] = m.split("-").map(Number);
            const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
            return `${m}-${String(last).padStart(2, "0")}`;
        });
        const rangeStart = starts.sort()[0];
        const rangeEnd = ends.sort().slice(-1)[0];
        const { data, error } = await db
            .from(this.TABLE)
            .select("id,employee_id,request_date,created_at,status,requested_amount,approved_amount,current_outstanding")
            .in("employee_id", employees)
            .gte("request_date", rangeStart)
            .lte("request_date", rangeEnd);
        if(error){
            console.warn("kasbon month index:", error.message || error);
            return;
        }
        this._monthIndexRows = data || this.rows;
    },

    monthSeqLabel(row, allRows){
        const { start, end } = this.monthBoundsWib(row.request_date);
        const pool = allRows || this._monthIndexRows || this.rows;
        const monthAll = pool
            .filter((r) =>
                Number(r.employee_id) === Number(row.employee_id)
                && r.request_date >= start
                && r.request_date <= end
            )
            .slice()
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
        const idx = monthAll.findIndex((r) => r.id === row.id);
        return idx >= 0 ? idx + 1 : monthAll.length + 1;
    },

    async fetchEmployeeMonthStats(employeeId, requestDate, excludeId){
        const { start, end } = this.monthBoundsWib(requestDate || this.todayWib());
        const { data, error } = await db
            .from(this.TABLE)
            .select("id,requested_amount,approved_amount,status,current_outstanding,request_date,created_at")
            .eq("employee_id", Number(employeeId))
            .gte("request_date", start)
            .lte("request_date", end)
            .order("created_at", { ascending: true });
        if(error) throw error;
        let rows = data || [];
        if(excludeId) rows = rows.filter((r) => r.id !== excludeId);

        const count = rows.length;
        const totalBulan = rows.reduce((s, r) => {
            const amt = r.approved_amount != null ? Number(r.approved_amount) : Number(r.requested_amount || 0);
            if(r.status === "DITOLAK") return s;
            return s + amt;
        }, 0);

        const { data: aktifRows, error: aktifErr } = await db
            .from(this.TABLE)
            .select("id,current_outstanding,status")
            .eq("employee_id", Number(employeeId))
            .in("status", ["AKTIF", "DICAIRKAN", "DISETUJUI"]);
        if(aktifErr) throw aktifErr;
        const aktif = (aktifRows || []).filter((r) => !excludeId || r.id !== excludeId);
        const sisa = aktif.reduce((s, r) => s + Number(r.current_outstanding || 0), 0);

        return {
            nextKe: count + 1,
            count,
            totalBulan,
            aktifCount: aktif.length,
            sisa
        };
    },

    renderSummary(){
        const waiting = this.rows.filter((r) => r.status === "MENUNGGU OWNER").length;
        const aktif = this.rows.filter((r) => r.status === "AKTIF" || r.status === "DICAIRKAN").length;
        const lunas = this.rows.filter((r) => r.status === "LUNAS").length;
        const totalReq = this.rows.reduce((s, r) => s + Number(r.requested_amount || 0), 0);
        const outstanding = this.rows.reduce((s, r) => s + Number(r.current_outstanding || 0), 0);
        const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
        set("kasbonSumWaiting", String(waiting));
        set("kasbonSumAktif", String(aktif));
        set("kasbonSumLunas", String(lunas));
        set("kasbonSumTotalReq", this.formatRupiah(totalReq));
        set("kasbonSumOutstanding", this.formatRupiah(outstanding));
    },

    renderOwnerQueue(){
        const wrap = document.getElementById("kasbonQueueList");
        const section = document.getElementById("kasbonOwnerQueue");
        if(!wrap || !section) return;
        if(this.role !== "owner"){
            section.hidden = true;
            return;
        }
        section.hidden = false;
        const waiting = this.rows.filter((r) => r.status === "MENUNGGU OWNER");
        if(!waiting.length){
            wrap.innerHTML = `<div class="kasbon-empty">Tidak ada pengajuan menunggu approval.</div>`;
            return;
        }
        wrap.innerHTML = waiting.map((r) => {
            const ke = this.monthSeqLabel(r);
            const monthTotal = (this._monthIndexRows || this.rows)
                .filter((x) => Number(x.employee_id) === Number(r.employee_id)
                    && x.request_date?.slice(0, 7) === r.request_date?.slice(0, 7)
                    && x.status !== "DITOLAK")
                .reduce((s, x) => s + Number(x.approved_amount ?? x.requested_amount ?? 0), 0);
            return `
              <article class="kasbon-queue-card">
                <strong>${this.escapeHtml(r.employee_name_snapshot)}</strong>
                <div class="kasbon-queue-meta">
                  <span>${this.escapeHtml(r.branch_name_snapshot)}</span>
                  <span>${this.escapeHtml(r.position_snapshot || "—")}</span>
                  <span>${this.escapeHtml(r.request_date)}</span>
                  <span>Kasbon ke-${ke}</span>
                  <span>Diajukan ${this.formatRupiah(r.requested_amount)}</span>
                  <span>Total bulan ${this.formatRupiah(monthTotal)}</span>
                  <span>Sisa ${this.formatRupiah(r.current_outstanding)}</span>
                </div>
                <div><em>Alasan:</em> ${this.escapeHtml(r.reason || "—")}</div>
                <div><em>Catatan SPV:</em> ${this.escapeHtml(r.spv_note || "—")}</div>
                <div class="kasbon-queue-actions">
                  <button type="button" class="kasbon-btn-primary" data-kasbon-owner="APPROVE" data-kasbon-id="${r.id}">Approve</button>
                  <button type="button" class="kasbon-btn-warn" data-kasbon-owner="RETURN" data-kasbon-id="${r.id}">Kembalikan</button>
                  <button type="button" class="kasbon-btn-danger" data-kasbon-owner="REJECT" data-kasbon-id="${r.id}">Tolak</button>
                  <button type="button" class="kasbon-btn-ghost" data-kasbon-detail="${r.id}">Detail</button>
                </div>
              </article>`;
        }).join("");
    },

    renderTable(){
        const tbody = document.getElementById("kasbonTableBody");
        if(!tbody) return;
        if(!this.rows.length){
            tbody.innerHTML = `<tr><td colspan="8" class="kasbon-empty">Belum ada data kasbon untuk filter ini.</td></tr>`;
            return;
        }
        tbody.innerHTML = this.rows.map((r) => {
            const ke = this.monthSeqLabel(r);
            return `<tr>
              <td>${this.escapeHtml(r.request_date)}</td>
              <td>${this.escapeHtml(r.employee_name_snapshot)}</td>
              <td>${this.escapeHtml(r.branch_name_snapshot)}</td>
              <td>${ke}</td>
              <td>${this.formatRupiah(r.requested_amount)}</td>
              <td>${r.approved_amount != null ? this.formatRupiah(r.approved_amount) : "—"}</td>
              <td><span class="kasbon-status ${this.statusClass(r.status)}">${this.escapeHtml(r.status)}</span></td>
              <td><button type="button" class="kasbon-btn-ghost" data-kasbon-detail="${r.id}">Detail</button></td>
            </tr>`;
        }).join("");
    },

    /* ---------- form ---------- */
    openForm(id){
        this._editingId = id || null;
        this.fillFormCabang();
        document.getElementById("kasbonEditId").value = id || "";
        document.getElementById("kasbonFormTanggal").value = this.todayWib();
        document.getElementById("kasbonFormNominal").value = "";
        document.getElementById("kasbonFormReason").value = "";
        document.getElementById("kasbonFormSpvNote").value = "";
        document.getElementById("kasbonFormRekom").value = "";
        document.getElementById("kasbonFormJabatan").value = "";
        document.getElementById("kasbonFormKaryawan").innerHTML = `<option value="">— Pilih karyawan —</option>`;
        this.clearEmployeeSummary();
        this.syncSubmitButtons();

        if(id){
            const row = this.rows.find((r) => r.id === id);
            if(row){
                document.getElementById("kasbonFormCabang").value = String(row.branch_id);
                this.fillFormKaryawan();
                document.getElementById("kasbonFormKaryawan").value = String(row.employee_id);
                document.getElementById("kasbonFormJabatan").value = row.position_snapshot || "";
                document.getElementById("kasbonFormTanggal").value = row.request_date;
                document.getElementById("kasbonFormNominal").value = this.formatRupiah(row.requested_amount);
                document.getElementById("kasbonFormReason").value = row.reason || "";
                document.getElementById("kasbonFormSpvNote").value = row.spv_note || "";
                document.getElementById("kasbonFormRekom").value = row.spv_recommendation || "";
                this.onEmployeeSelected();
                this.syncSubmitButtons();
            }
        }

        this.syncCselectLabel(document.getElementById("kasbonFormCabang"));
        this.syncCselectLabel(document.getElementById("kasbonFormKaryawan"));
        this.syncCselectLabel(document.getElementById("kasbonFormRekom"));

        const modal = document.getElementById("kasbonFormModal");
        if(modal) modal.hidden = false;
        document.getElementById("kasbonFormCabang")?.focus();
    },

    syncSubmitButtons(){
        const rekom = document.getElementById("kasbonFormRekom")?.value || "";
        const submitBtn = document.getElementById("kasbonSubmitOwner");
        if(!submitBtn) return;
        if(rekom === "TOLAK"){
            submitBtn.textContent = "Tolak Pengajuan";
        }else{
            submitBtn.textContent = "Ajukan ke Owner";
        }
    },

    clearEmployeeSummary(){
        const box = document.getElementById("kasbonEmployeeSummary");
        if(box) box.hidden = true;
    },

    async onEmployeeSelected(){
        const empId = document.getElementById("kasbonFormKaryawan")?.value;
        const cabangId = document.getElementById("kasbonFormCabang")?.value;
        const emp = this.karyawanList.find((k) => Number(k.id) === Number(empId));
        const jabatanEl = document.getElementById("kasbonFormJabatan");
        if(!emp){
            if(jabatanEl) jabatanEl.value = "";
            this.clearEmployeeSummary();
            return;
        }
        if(Number(emp.cabang_id) !== Number(cabangId)){
            this.toast("Karyawan tidak sesuai cabang yang dipilih.", "error");
            document.getElementById("kasbonFormKaryawan").value = "";
            if(jabatanEl) jabatanEl.value = "";
            this.clearEmployeeSummary();
            return;
        }
        if(jabatanEl) jabatanEl.value = emp.jabatan || "";

        const cabang = this.cabangList.find((c) => Number(c.id) === Number(cabangId));
        const tanggal = document.getElementById("kasbonFormTanggal")?.value || this.todayWib();
        try{
            const stats = await this.fetchEmployeeMonthStats(empId, tanggal, this._editingId);
            const box = document.getElementById("kasbonEmployeeSummary");
            if(box) box.hidden = false;
            document.getElementById("kasbonEmpSumTitle").textContent =
                `${emp.nama_karyawan || "—"} — ${cabang?.nama_cabang || "—"}`;
            document.getElementById("kasbonEmpKe").textContent = `Ke-${stats.nextKe}`;
            document.getElementById("kasbonEmpSudah").textContent = this.formatRupiah(stats.totalBulan);
            document.getElementById("kasbonEmpCount").textContent = String(stats.count);
            document.getElementById("kasbonEmpAktif").textContent = String(stats.aktifCount);
            document.getElementById("kasbonEmpSisa").textContent = this.formatRupiah(stats.sisa);
            this._empStats = stats;
            this.refreshProjection();

            const gaji = emp.gaji_pokok ?? emp.gaji;
            const gajiWrap = document.getElementById("kasbonEmpGajiWrap");
            if(gajiWrap){
                if(gaji != null && Number(gaji) > 0){
                    gajiWrap.hidden = false;
                    document.getElementById("kasbonEmpGaji").textContent = this.formatRupiah(gaji);
                }else{
                    gajiWrap.hidden = true;
                }
            }
        }catch(err){
            console.error(err);
            this.toast("Gagal memuat ringkasan karyawan: " + (err.message || err), "error");
        }
    },

    refreshProjection(){
        const baru = this.parseRupiah(document.getElementById("kasbonFormNominal")?.value);
        const stats = this._empStats || { totalBulan: 0 };
        document.getElementById("kasbonEmpBaru").textContent = this.formatRupiah(baru);
        document.getElementById("kasbonEmpProyeksi").textContent =
            `Total bulan ini ${this.formatRupiah(Number(stats.totalBulan || 0) + baru)}`;
    },

    async submitForm(mode){
        if(this.busy) return;
        const branchId = Number(document.getElementById("kasbonFormCabang")?.value || 0);
        const employeeId = Number(document.getElementById("kasbonFormKaryawan")?.value || 0);
        const requestDate = document.getElementById("kasbonFormTanggal")?.value || "";
        const amount = this.parseRupiah(document.getElementById("kasbonFormNominal")?.value);
        const reason = String(document.getElementById("kasbonFormReason")?.value || "").trim();
        const spvNote = String(document.getElementById("kasbonFormSpvNote")?.value || "").trim();
        const rekom = document.getElementById("kasbonFormRekom")?.value || "";
        const emp = this.karyawanList.find((k) => Number(k.id) === employeeId);
        const cab = this.cabangList.find((c) => Number(c.id) === branchId);

        if(!branchId || !cab){
            this.toast("Cabang wajib dipilih.", "error");
            return;
        }
        if(!employeeId || !emp){
            this.toast("Karyawan wajib dipilih dari Master Karyawan.", "error");
            return;
        }
        if(Number(emp.cabang_id) !== branchId){
            this.toast("Karyawan di luar branch scope cabang terpilih.", "error");
            return;
        }
        if(!(amount > 0)){
            this.toast("Nominal kasbon harus > 0.", "error");
            return;
        }
        if(!reason){
            this.toast("Alasan / kebutuhan wajib diisi.", "error");
            return;
        }
        if(!rekom){
            this.toast("Rekomendasi SPV wajib dipilih.", "error");
            return;
        }

        let status = mode;
        if(mode === "MENUNGGU OWNER"){
            if(rekom === "TOLAK"){
                status = "DITOLAK";
                if(!spvNote){
                    this.toast("Catatan SPV wajib saat Tolak.", "error");
                    return;
                }
            }else if(rekom === "SETUJUI"){
                if(!spvNote){
                    this.toast("Catatan SPV wajib sebelum Ajukan ke Owner.", "error");
                    return;
                }
                status = "MENUNGGU OWNER";
            }
        }

        const payload = {
            employee_id: employeeId,
            employee_name_snapshot: emp.nama_karyawan || "",
            position_snapshot: emp.jabatan || "",
            branch_id: branchId,
            branch_name_snapshot: cab.nama_cabang || "",
            request_date: requestDate || this.todayWib(),
            requested_amount: amount,
            reason,
            spv_note: spvNote || null,
            spv_recommendation: rekom,
            status
        };

        this.busy = true;
        const draftBtn = document.getElementById("kasbonSaveDraft");
        const submitBtn = document.getElementById("kasbonSubmitOwner");
        if(draftBtn) draftBtn.disabled = true;
        if(submitBtn) submitBtn.disabled = true;

        try{
            const editId = document.getElementById("kasbonEditId")?.value || this._editingId;
            let error = null;
            if(editId){
                ({ error } = await db.from(this.TABLE).update(payload).eq("id", editId));
            }else{
                ({ error } = await db.from(this.TABLE).insert(payload));
            }
            if(error) throw error;
            this.toast(
                status === "DRAFT" ? "Draft tersimpan."
                    : status === "DITOLAK" ? "Pengajuan ditolak (SPV)."
                    : "Diajukan ke Owner.",
                "success"
            );
            this.closeModal("form");
            await this.loadList();
        }catch(err){
            console.error(err);
            this.toast(err.message || String(err), "error");
        }finally{
            this.busy = false;
            if(draftBtn) draftBtn.disabled = false;
            if(submitBtn) submitBtn.disabled = false;
        }
    },

    closeModal(which){
        const map = {
            form: "kasbonFormModal",
            detail: "kasbonDetailModal",
            owner: "kasbonOwnerModal"
        };
        const el = document.getElementById(map[which]);
        if(el) el.hidden = true;
    },

    /* ---------- detail / owner ---------- */
    async openDetail(id){
        const row = this.rows.find((r) => r.id === id);
        if(!row){
            this.toast("Data tidak ditemukan.", "error");
            return;
        }
        let history = this.historyCache.get(id);
        if(!history){
            const { data, error } = await db
                .from(this.HISTORY)
                .select("*")
                .eq("kasbon_id", id)
                .order("created_at", { ascending: true });
            if(error && !/does not exist|schema cache/i.test(error.message || "")){
                console.error(error);
            }
            history = data || [];
            this.historyCache.set(id, history);
        }

        const ke = this.monthSeqLabel(row);
        const body = document.getElementById("kasbonDetailBody");
        body.innerHTML = `
          <div class="kasbon-detail-grid">
            <div><span>Karyawan</span><strong>${this.escapeHtml(row.employee_name_snapshot)}</strong></div>
            <div><span>Cabang</span><strong>${this.escapeHtml(row.branch_name_snapshot)}</strong></div>
            <div><span>Jabatan</span><strong>${this.escapeHtml(row.position_snapshot || "—")}</strong></div>
            <div><span>Tanggal</span><strong>${this.escapeHtml(row.request_date)}</strong></div>
            <div><span>Kasbon ke-</span><strong>${ke}</strong></div>
            <div><span>Status</span><strong><span class="kasbon-status ${this.statusClass(row.status)}">${this.escapeHtml(row.status)}</span></strong></div>
            <div><span>Nominal diajukan</span><strong>${this.formatRupiah(row.requested_amount)}</strong></div>
            <div><span>Nominal disetujui</span><strong>${row.approved_amount != null ? this.formatRupiah(row.approved_amount) : "—"}</strong></div>
            <div><span>Pencairan</span><strong>${this.escapeHtml(row.disbursement_date || "—")}</strong></div>
            <div><span>Total terbayar</span><strong>${this.formatRupiah(row.total_paid)}</strong></div>
            <div><span>Sisa</span><strong>${this.formatRupiah(row.current_outstanding)}</strong></div>
          </div>
          <div><span>Alasan</span><strong>${this.escapeHtml(row.reason || "—")}</strong></div>
          <div><span>Catatan SPV</span><strong>${this.escapeHtml(row.spv_note || "—")}</strong></div>
          <div><span>Catatan Owner</span><strong>${this.escapeHtml(row.owner_note || "—")}</strong></div>
          <details class="kasbon-history">
            <summary>Histori approval / status</summary>
            <ul>
              ${(history.length ? history : []).map((h) => `
                <li>
                  <strong>${this.escapeHtml(h.old_status || "—")} → ${this.escapeHtml(h.new_status)}</strong>
                  · ${this.escapeHtml(h.actor_role || "—")}
                  · ${this.escapeHtml(h.created_at || "")}
                  ${h.note ? `<br>${this.escapeHtml(h.note)}` : ""}
                  ${h.old_amount != null || h.new_amount != null
                    ? `<br>Amount: ${h.old_amount != null ? this.formatRupiah(h.old_amount) : "—"} → ${h.new_amount != null ? this.formatRupiah(h.new_amount) : "—"}`
                    : ""}
                </li>`).join("") || "<li>Belum ada histori.</li>"}
            </ul>
          </details>
        `;

        const actions = document.getElementById("kasbonDetailActions");
        const btns = [];
        if(this.role === "owner" && row.status === "MENUNGGU OWNER"){
            btns.push(`<button type="button" class="kasbon-btn-primary" data-kasbon-owner="APPROVE" data-kasbon-id="${row.id}">Approve</button>`);
            btns.push(`<button type="button" class="kasbon-btn-warn" data-kasbon-owner="RETURN" data-kasbon-id="${row.id}">Kembalikan</button>`);
            btns.push(`<button type="button" class="kasbon-btn-danger" data-kasbon-owner="REJECT" data-kasbon-id="${row.id}">Tolak</button>`);
        }
        if(this.role === "owner" && row.status === "DISETUJUI"){
            btns.push(`<button type="button" class="kasbon-btn-primary" data-kasbon-disburse="${row.id}">Cairkan &amp; Aktifkan</button>`);
        }
        if(this.role === "owner" && (row.status === "AKTIF" || row.status === "DICAIRKAN")){
            btns.push(`<button type="button" class="kasbon-btn-ghost" data-kasbon-lunas="${row.id}">Tandai Lunas</button>`);
        }
        if((row.status === "DRAFT" || row.status === "DIKEMBALIKAN") && (this.role === "spv" || this.role === "owner")){
            btns.push(`<button type="button" class="kasbon-btn-ghost" data-kasbon-edit="${row.id}">Edit / Lanjutkan</button>`);
        }
        btns.push(`<button type="button" class="kasbon-btn-ghost" data-kasbon-close="detail">Tutup</button>`);
        actions.innerHTML = btns.join("");

        document.getElementById("kasbonDetailModal").hidden = false;
    },

    openOwnerAction(id, action){
        const row = this.rows.find((r) => r.id === id);
        if(!row){
            this.toast("Data tidak ditemukan.", "error");
            return;
        }
        if(this.role !== "owner"){
            this.toast("Hanya Owner yang dapat approval final.", "error");
            return;
        }
        document.getElementById("kasbonOwnerId").value = id;
        document.getElementById("kasbonOwnerAction").value = action;
        document.getElementById("kasbonOwnerNote").value = "";
        document.getElementById("kasbonOwnerAmount").value = this.formatRupiah(row.requested_amount);
        document.getElementById("kasbonOwnerMeta").textContent =
            `${row.employee_name_snapshot} · ${row.branch_name_snapshot} · Diajukan ${this.formatRupiah(row.requested_amount)}`;

        const amountWrap = document.getElementById("kasbonOwnerAmountWrap");
        const noteLabel = document.getElementById("kasbonOwnerNoteLabel");
        const title = document.getElementById("kasbonOwnerTitle");
        if(action === "APPROVE"){
            title.textContent = "Approve Kasbon";
            amountWrap.hidden = false;
            noteLabel.textContent = "Catatan Owner (opsional)";
        }else if(action === "RETURN"){
            title.textContent = "Kembalikan ke SPV";
            amountWrap.hidden = true;
            noteLabel.textContent = "Catatan Owner (wajib)";
        }else{
            title.textContent = "Tolak Kasbon";
            amountWrap.hidden = true;
            noteLabel.textContent = "Alasan Owner (wajib)";
        }
        this.closeModal("detail");
        document.getElementById("kasbonOwnerModal").hidden = false;
    },

    async confirmOwnerAction(){
        if(this.busy) return;
        const id = document.getElementById("kasbonOwnerId")?.value;
        const action = document.getElementById("kasbonOwnerAction")?.value;
        const note = String(document.getElementById("kasbonOwnerNote")?.value || "").trim();
        const amount = this.parseRupiah(document.getElementById("kasbonOwnerAmount")?.value);
        const row = this.rows.find((r) => r.id === id);
        if(!row) return;

        let patch = { owner_note: note || null };
        if(action === "APPROVE"){
            if(!(amount > 0)){
                this.toast("Nominal final disetujui harus > 0.", "error");
                return;
            }
            patch.status = "DISETUJUI";
            patch.approved_amount = amount;
        }else if(action === "RETURN"){
            if(!note){
                this.toast("Catatan Owner wajib saat Kembalikan.", "error");
                return;
            }
            patch.status = "DIKEMBALIKAN";
            patch.approved_amount = null;
        }else if(action === "REJECT"){
            if(!note){
                this.toast("Alasan Owner wajib saat Tolak.", "error");
                return;
            }
            patch.status = "DITOLAK";
            patch.approved_amount = null;
        }else{
            return;
        }

        this.busy = true;
        const btn = document.getElementById("kasbonOwnerConfirm");
        if(btn) btn.disabled = true;
        try{
            // Jangan overwrite requested_amount
            const { error } = await db.from(this.TABLE).update(patch).eq("id", id);
            if(error) throw error;
            this.toast("Aksi Owner tersimpan.", "success");
            this.closeModal("owner");
            this.historyCache.delete(id);
            await this.loadList();
        }catch(err){
            console.error(err);
            this.toast(err.message || String(err), "error");
        }finally{
            this.busy = false;
            if(btn) btn.disabled = false;
        }
    },

    async disburse(id){
        if(this.busy || this.role !== "owner") return;
        if(!confirm("Cairkan kasbon ini dan set status AKTIF?\n(Tidak menulis ke Arus Kas di tahap ini.)")) return;
        this.busy = true;
        try{
            // DISETUJUI → DICAIRKAN
            let { error } = await db.from(this.TABLE).update({
                status: "DICAIRKAN",
                disbursement_date: this.todayWib(),
                disbursement_method: "MANUAL"
            }).eq("id", id);
            if(error) throw error;
            // DICAIRKAN → AKTIF
            ({ error } = await db.from(this.TABLE).update({
                status: "AKTIF"
            }).eq("id", id));
            if(error) throw error;
            this.toast("Kasbon dicairkan & aktif.", "success");
            this.historyCache.delete(id);
            this.closeModal("detail");
            await this.loadList();
        }catch(err){
            console.error(err);
            this.toast(err.message || String(err), "error");
        }finally{
            this.busy = false;
        }
    },

    async markLunas(id){
        if(this.busy || this.role !== "owner") return;
        if(!confirm("Tandai kasbon ini LUNAS?")) return;
        this.busy = true;
        try{
            const { error } = await db.from(this.TABLE).update({ status: "LUNAS" }).eq("id", id);
            if(error) throw error;
            this.toast("Kasbon ditandai lunas.", "success");
            this.historyCache.delete(id);
            this.closeModal("detail");
            await this.loadList();
        }catch(err){
            console.error(err);
            this.toast(err.message || String(err), "error");
        }finally{
            this.busy = false;
        }
    }
};

window.KasbonModule = KasbonModule;
