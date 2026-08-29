/*
=========================================================
VAX ERP — Barber Aktif (from provider_sales_daily_source)
=========================================================
- Card + popup hanya membaca Supabase daily Provider Sales
- Mengikuti filter global DashboardEngine (cabang + periode)
- Ranking by SUM(total_service); provider_share = supporting
- Tidak mengubah KPI lain / Grafik Omzet / monthly payroll source
=========================================================
*/

const BarberAktif = {

    TABLE: "provider_sales_daily_source",
    MODAL_URL: "../components/barber-aktif-modal.html",

    _bound: false,
    _ready: false,
    _loadSeq: 0,
    _view: "tabs",          // tabs | branch-detail
    _tab: "branch",         // branch | ranking
    _detailCabangId: null,
    _payload: null,
    _subscribed: false,

    async ensureMounted(){
        if(document.getElementById("barberAktifModal")){
            this._ready = true;
            return true;
        }
        const host = document.getElementById("modal");
        if(!host) return false;
        try{
            const res = await fetch(this.MODAL_URL);
            if(!res.ok) throw new Error(this.MODAL_URL);
            host.insertAdjacentHTML("beforeend", await res.text());
            this._ready = true;
            return true;
        }catch(err){
            console.error("BarberAktif mount failed:", err);
            return false;
        }
    },

    init(){
        if(this._bound) return;
        this._bound = true;

        document.addEventListener("click", (e) => {
            if(e.target.closest("[data-barber-aktif-close]")){
                this.close();
                return;
            }

            const back = e.target.closest("#barberAktifBack");
            if(back){
                e.preventDefault();
                this._view = "tabs";
                this._detailCabangId = null;
                this.renderModal();
                return;
            }

            const tabBtn = e.target.closest("[data-barber-tab]");
            if(tabBtn && document.getElementById("barberAktifModal")?.contains(tabBtn)){
                e.preventDefault();
                this._tab = tabBtn.getAttribute("data-barber-tab") || "branch";
                this._view = "tabs";
                this._detailCabangId = null;
                this.renderModal();
                return;
            }

            const branchRow = e.target.closest("[data-barber-branch-id]");
            if(branchRow && document.getElementById("barberAktifModal")?.contains(branchRow)){
                e.preventDefault();
                const id = Number(branchRow.getAttribute("data-barber-branch-id"));
                if(Number.isFinite(id)){
                    this._view = "branch-detail";
                    this._detailCabangId = id;
                    this.renderModal();
                }
                return;
            }

            if(e.target.closest("button, a[href], select, input, textarea")) return;

            const card = e.target.closest("#kpiBarberCard, [data-barber-aktif]");
            if(card){
                e.preventDefault();
                this.open();
            }
        });

        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && this.isOpen()){
                if(this._view === "branch-detail"){
                    this._view = "tabs";
                    this._detailCabangId = null;
                    this.renderModal();
                }else{
                    this.close();
                }
            }
        });

        document.addEventListener("erp:components-ready", () => {
            this.ensureMounted();
            this.decorateCard();
        }, { once: true });

        if(document.getElementById("kpiBarber")){
            this.ensureMounted();
            this.decorateCard();
        }

        this.subscribeEngine();
    },

    subscribeEngine(){
        if(this._subscribed) return;
        if(typeof DashboardEngine === "undefined" || typeof DashboardEngine.subscribe !== "function"){
            return;
        }
        this._subscribed = true;
        DashboardEngine.subscribe((event) => {
            if(event === "loaded" || event === "error"){
                this.refresh();
            }
        });
    },

    decorateCard(){
        const card = document.getElementById("kpiBarberCard")
            || document.getElementById("kpiBarber")?.closest(".kpi-card");
        if(!card) return;
        card.id = "kpiBarberCard";
        card.setAttribute("data-barber-aktif", "1");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("title", "Klik untuk rincian Barber Aktif");
        card.setAttribute("aria-label", "Lihat rincian Barber Aktif");
        if(card.dataset.barberKeyBound === "1") return;
        card.dataset.barberKeyBound = "1";
        card.addEventListener("keydown", (e) => {
            if(e.key === "Enter" || e.key === " "){
                e.preventDefault();
                this.open();
            }
        });
    },

    isOwner(){
        try{
            if(typeof OwnerAuth !== "undefined" && OwnerAuth?.profile){
                return OwnerAuth.isOwnerRole(OwnerAuth.profile.role);
            }
        }catch(_e){ /* ignore */ }
        return document.body?.dataset?.erpRole === "owner";
    },

    escapeHtml(str){
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    formatAngka(n){
        if(typeof formatAngka === "function") return formatAngka(n);
        return Number(n || 0).toLocaleString("id-ID");
    },

    formatRupiah(n){
        if(typeof formatRupiah === "function") return formatRupiah(n);
        return "Rp" + Number(n || 0).toLocaleString("id-ID");
    },

    shortCabangName(name){
        if(typeof DashboardEngine !== "undefined" && typeof DashboardEngine.shortCabangName === "function"){
            return DashboardEngine.shortCabangName(name);
        }
        return String(name || "")
            .replace(/vax\s*wijaya/ig, "")
            .replace(/barbershop/ig, "")
            .trim() || String(name || "Cabang");
    },

    identityKey(row){
        const emp = row.employee_id;
        if(emp != null && emp !== "" && Number.isFinite(Number(emp))){
            return `e:${Number(emp)}`;
        }
        return `p:${Number(row.cabang_id)}:${String(row.provider_name_normalized || "").trim()}`;
    },

    displayName(row){
        return String(row.provider_name_raw || row.provider_name_normalized || "—").trim() || "—";
    },

    async fetchDailyRows(start, end, cabangIdNumeric){
        if(typeof db === "undefined") throw new Error("Supabase client (db) tidak tersedia");
        if(!start || !end) return [];

        const pageSize = 1000;
        const rows = [];
        let from = 0;

        const opIds = (!cabangIdNumeric && typeof DashboardEngine !== "undefined")
            ? DashboardEngine.getOperationalCabangIds()
            : null;

        if(!cabangIdNumeric && Array.isArray(opIds) && opIds.length === 0){
            return [];
        }

        for(;;){
            let q = db.from(this.TABLE).select(
                "activity_date,cabang_id,cabang_minutes_name,provider_name_raw,provider_name_normalized,provider_minutes_id,employee_id,mapping_status,total_service,provider_share,sub_income,total_income"
            );

            q = (start === end)
                ? q.eq("activity_date", start)
                : q.gte("activity_date", start).lte("activity_date", end);

            if(cabangIdNumeric){
                q = q.eq("cabang_id", cabangIdNumeric);
            }else{
                q = q.in("cabang_id", opIds);
            }

            q = q
                .order("activity_date", { ascending: true })
                .order("cabang_id", { ascending: true })
                .range(from, from + pageSize - 1);

            const { data, error } = await q;
            if(error) throw error;

            const chunk = data || [];
            rows.push(...chunk);
            if(chunk.length < pageSize) break;
            from += pageSize;
        }

        return rows;
    },

    cabangNameMap(){
        const map = new Map();
        const list = (typeof DashboardEngine !== "undefined")
            ? (DashboardEngine.getOperationalCabangList?.() || DashboardEngine.cabangList || [])
            : [];
        list.forEach((c) => {
            map.set(Number(c.id), c.nama_cabang || c.nama_minutes || String(c.id));
        });
        return map;
    },

    aggregate(rows){
        const nameMap = this.cabangNameMap();
        const barberMap = new Map();

        (rows || []).forEach((r) => {
            const service = Number(r.total_service || 0);
            if(!Number.isFinite(service)) return;

            const key = this.identityKey(r);
            const cabangId = Number(r.cabang_id);
            let item = barberMap.get(key);
            if(!item){
                item = {
                    key,
                    employee_id: r.employee_id != null ? Number(r.employee_id) : null,
                    provider_name_raw: this.displayName(r),
                    provider_name_normalized: String(r.provider_name_normalized || ""),
                    cabang_id: cabangId,
                    cabang_name: nameMap.get(cabangId) || r.cabang_minutes_name || String(cabangId),
                    mapping_status: r.mapping_status || "UNMAPPED",
                    total_service: 0,
                    total_income: 0,
                    provider_share: 0,
                    sub_income: 0
                };
                barberMap.set(key, item);
            }
            item.total_service += service;
            item.total_income += Number(r.total_income || 0);
            item.provider_share += Number(r.provider_share || 0);
            item.sub_income += Number(r.sub_income || 0);
            // Prefer non-empty display name
            const dn = this.displayName(r);
            if(dn && dn !== "—") item.provider_name_raw = dn;
        });

        const activeBarbers = [...barberMap.values()]
            .filter((b) => Number(b.total_service) > 0);

        const sortBarbers = (list) => list.slice().sort((a, b) => {
            if(b.total_service !== a.total_service) return b.total_service - a.total_service;
            if(b.total_income !== a.total_income) return b.total_income - a.total_income;
            return String(a.provider_name_raw).localeCompare(String(b.provider_name_raw), "id");
        });

        const ranking = sortBarbers(activeBarbers).map((b, idx) => ({
            ...b,
            rank_company: idx + 1
        }));

        // rank_branch within each cabang
        const byCabang = new Map();
        ranking.forEach((b) => {
            const cid = Number(b.cabang_id);
            if(!byCabang.has(cid)) byCabang.set(cid, []);
            byCabang.get(cid).push(b);
        });
        byCabang.forEach((list) => {
            sortBarbers(list).forEach((b, idx) => {
                b.rank_branch = idx + 1;
            });
        });

        const totalService = ranking.reduce((s, b) => s + Number(b.total_service || 0), 0);
        const topBarber = ranking[0] || null;

        // Branch breakdown — include all operational cabang (0 if empty)
        const opList = (typeof DashboardEngine !== "undefined" && DashboardEngine.getOperationalCabangList)
            ? DashboardEngine.getOperationalCabangList()
            : [...nameMap.entries()].map(([id, nama]) => ({ id, nama_cabang: nama }));

        const filterCabangId = (typeof DashboardEngine !== "undefined")
            ? DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId)
            : null;

        const branchSource = filterCabangId
            ? opList.filter((c) => Number(c.id) === Number(filterCabangId))
            : opList;

        const branches = branchSource.map((c) => {
            const cid = Number(c.id);
            const barbers = sortBarbers(ranking.filter((b) => Number(b.cabang_id) === cid));
            const service = barbers.reduce((s, b) => s + Number(b.total_service || 0), 0);
            const top = barbers[0] || null;
            return {
                cabang_id: cid,
                nama_cabang: c.nama_cabang || nameMap.get(cid) || String(cid),
                nama_pendek: this.shortCabangName(c.nama_cabang || nameMap.get(cid) || String(cid)),
                barber_aktif: barbers.length,
                total_service: service,
                top_barber: top
                    ? { name: top.provider_name_raw, total_service: top.total_service }
                    : null,
                barbers
            };
        }).sort((a, b) => {
            if(b.total_service !== a.total_service) return b.total_service - a.total_service;
            return String(a.nama_pendek).localeCompare(String(b.nama_pendek), "id");
        });

        return {
            activeCount: ranking.length,
            totalService,
            topBarber,
            ranking,
            branches,
            rowsCount: (rows || []).length
        };
    },

    renderCard(payload){
        this.decorateCard();
        const valueEl = document.getElementById("kpiBarber");
        const card = document.getElementById("kpiBarberCard")
            || valueEl?.closest(".kpi-card");
        if(!card) return;

        const active = Number(payload?.activeCount || 0);
        const service = Number(payload?.totalService || 0);
        const top = payload?.topBarber || null;

        if(valueEl) valueEl.textContent = this.formatAngka(active);

        let statusEl = card.querySelector("#kpiBarberSecondary")
            || card.querySelector(".kpi-status");
        if(statusEl){
            statusEl.id = "kpiBarberSecondary";
            statusEl.classList.remove("positive", "negative", "neutral");
            if(payload?._error){
                statusEl.classList.add("negative");
                statusEl.textContent = "Data Provider Sales tidak terbaca";
            }else{
                statusEl.textContent = `${this.formatAngka(service)} Service | ${this.formatAngka(active)} Barber`;
            }
        }

        let topEl = card.querySelector("#kpiBarberTop");
        if(!topEl){
            topEl = card.querySelector(".kpi-desc");
            if(topEl) topEl.id = "kpiBarberTop";
        }
        if(topEl){
            if(payload?._error){
                topEl.textContent = String(payload._error).slice(0, 120);
            }else if(top && Number(top.total_service) > 0){
                topEl.textContent = `🏆 Top Barber  ${top.provider_name_raw} — ${this.formatAngka(top.total_service)} Service`;
            }else{
                topEl.textContent = "Top Barber —";
            }
        }
    },

    async refresh(){
        this.subscribeEngine();
        this.decorateCard();

        if(typeof DashboardEngine === "undefined"){
            this.renderCard({ activeCount: 0, totalService: 0, topBarber: null, ranking: [], branches: [] });
            return;
        }

        const seq = ++this._loadSeq;
        const start = DashboardEngine.lastRange?.start || null;
        const end = DashboardEngine.lastRange?.end || null;
        const cabangIdNumeric = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);

        if(!start || !end){
            this._payload = this.aggregate([]);
            this.renderCard(this._payload);
            if(this.isOpen()) this.renderModal();
            return;
        }

        try{
            const rows = await this.fetchDailyRows(start, end, cabangIdNumeric);
            if(seq !== this._loadSeq) return;
            this._payload = this.aggregate(rows);
            this.renderCard(this._payload);
            if(this.isOpen()) this.renderModal();
        }catch(err){
            if(seq !== this._loadSeq) return;
            console.error("BarberAktif.refresh error:", err);
            // Fail-closed: jangan samarkan permission/RLS error sebagai "0 barber".
            this._payload = this.aggregate([]);
            this._payload._error = err?.message || "Gagal memuat Provider Sales harian.";
            this.renderCard(this._payload);
            if(this.isOpen()){
                this.renderModal();
                const note = document.getElementById("barberAktifFootnote");
                if(note){
                    note.hidden = false;
                    note.textContent = this._payload._error;
                }
            }
        }
    },

    isOpen(){
        const modal = document.getElementById("barberAktifModal");
        return Boolean(modal && !modal.hidden);
    },

    async open(){
        const ok = await this.ensureMounted();
        if(!ok) return;

        if(!this._payload){
            await this.refresh();
        }

        this._view = "tabs";
        this._tab = "branch";
        this._detailCabangId = null;

        const modal = document.getElementById("barberAktifModal");
        if(!modal) return;
        modal.hidden = false;
        document.body.classList.add("barber-aktif-modal-open");
        this.renderModal();
    },

    close(){
        const modal = document.getElementById("barberAktifModal");
        if(modal) modal.hidden = true;
        document.body.classList.remove("barber-aktif-modal-open");
        this._view = "tabs";
        this._detailCabangId = null;
    },

    periodLabel(){
        if(typeof getPeriodeLabel === "function" && typeof DashboardEngine !== "undefined"){
            return getPeriodeLabel(DashboardEngine.lastPeriode);
        }
        const start = DashboardEngine?.lastRange?.start;
        const end = DashboardEngine?.lastRange?.end;
        if(start && end) return start === end ? start : `${start} — ${end}`;
        return "—";
    },

    branchFilterLabel(){
        if(typeof DashboardEngine === "undefined") return "Semua Cabang";
        const resolved = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);
        if(!resolved) return "Semua Cabang";
        const found = (DashboardEngine.cabangList || []).find((c) => Number(c.id) === Number(resolved));
        return this.shortCabangName(found?.nama_cabang || DashboardEngine.lastCabangId || "Cabang");
    },

    medal(rank){
        if(rank === 1) return "🥇";
        if(rank === 2) return "🥈";
        if(rank === 3) return "🥉";
        return String(rank);
    },

    renderModal(){
        const payload = this._payload || this.aggregate([]);
        const titleEl = document.getElementById("barberAktifTitle");
        const periodEl = document.getElementById("barberAktifPeriod");
        const totalEl = document.getElementById("barberAktifTotal");
        const totalLabelEl = document.getElementById("barberAktifTotalLabel");
        const bodyEl = document.getElementById("barberAktifBody");
        const tabsEl = document.getElementById("barberAktifTabs");
        const backEl = document.getElementById("barberAktifBack");
        const noteEl = document.getElementById("barberAktifFootnote");

        if(noteEl){
            noteEl.hidden = true;
            noteEl.textContent = "";
        }

        if(this._view === "branch-detail"){
            const branch = (payload.branches || []).find(
                (b) => Number(b.cabang_id) === Number(this._detailCabangId)
            );
            if(tabsEl) tabsEl.hidden = true;
            if(backEl) backEl.hidden = false;
            if(titleEl) titleEl.textContent = branch
                ? `BARBER — ${branch.nama_pendek || branch.nama_cabang}`
                : "DETAIL BARBER CABANG";
            if(periodEl) periodEl.textContent = `${this.periodLabel()} · ${this.branchFilterLabel()}`;
            if(totalLabelEl) totalLabelEl.textContent = "TOTAL SERVICE";
            if(totalEl){
                totalEl.textContent = branch
                    ? `${this.formatAngka(branch.total_service)} · ${this.formatAngka(branch.barber_aktif)} Barber`
                    : "—";
            }
            if(bodyEl) bodyEl.innerHTML = this.renderBranchDetail(branch);
            return;
        }

        if(tabsEl){
            tabsEl.hidden = false;
            tabsEl.querySelectorAll("[data-barber-tab]").forEach((btn) => {
                const on = btn.getAttribute("data-barber-tab") === this._tab;
                btn.classList.toggle("is-active", on);
                btn.setAttribute("aria-selected", on ? "true" : "false");
            });
        }
        if(backEl) backEl.hidden = true;
        if(titleEl) titleEl.textContent = "BARBER AKTIF";
        if(periodEl) periodEl.textContent = `${this.periodLabel()} · ${this.branchFilterLabel()}`;
        if(totalLabelEl) totalLabelEl.textContent = "BARBER AKTIF · SERVICE";
        if(totalEl){
            totalEl.textContent =
                `${this.formatAngka(payload.activeCount)} Barber · ${this.formatAngka(payload.totalService)} Service`;
        }
        if(bodyEl){
            bodyEl.innerHTML = this._tab === "ranking"
                ? this.renderRanking(payload)
                : this.renderBranches(payload);
        }
    },

    renderBranches(payload){
        const branches = payload.branches || [];
        if(!branches.length){
            return `<div class="barber-aktif-empty">Tidak ada cabang operasional pada filter aktif.</div>`;
        }

        return branches.map((b) => {
            const top = b.top_barber
                ? `Top: ${this.escapeHtml(b.top_barber.name)} — ${this.formatAngka(b.top_barber.total_service)}`
                : "Top: —";
            return `
                <div class="barber-aktif-row"
                     role="listitem"
                     tabindex="0"
                     data-barber-branch-id="${this.escapeHtml(b.cabang_id)}">
                    <div class="barber-aktif-row-main">
                        <span class="barber-aktif-row-name">${this.escapeHtml(b.nama_pendek || b.nama_cabang)}</span>
                        <span class="barber-aktif-row-sub">${this.formatAngka(b.barber_aktif)} Barber · ${this.escapeHtml(top)}</span>
                    </div>
                    <span class="barber-aktif-row-value">${this.formatAngka(b.total_service)} Svc</span>
                    <span class="barber-aktif-row-chevron" aria-hidden="true">›</span>
                </div>
            `;
        }).join("");
    },

    renderBranchDetail(branch){
        if(!branch){
            return `<div class="barber-aktif-empty">Data cabang tidak ditemukan.</div>`;
        }
        const barbers = branch.barbers || [];
        if(!barbers.length){
            return `<div class="barber-aktif-empty">Tidak ada barber aktif di cabang ini pada periode terpilih.</div>`;
        }

        const showShare = this.isOwner();
        return barbers.map((b) => {
            const shareLine = showShare
                ? `<span class="barber-aktif-row-sub">Income ${this.escapeHtml(this.formatRupiah(b.total_income))} · Share ${this.escapeHtml(this.formatRupiah(b.provider_share))}</span>`
                : `<span class="barber-aktif-row-sub">Income ${this.escapeHtml(this.formatRupiah(b.total_income))}</span>`;
            return `
                <div class="barber-aktif-row is-static barber-aktif-rank-row" role="listitem">
                    <div class="barber-aktif-row-main">
                        <span class="barber-aktif-row-name">
                            <span class="barber-aktif-rank">${this.medal(b.rank_branch || 0)}</span>${this.escapeHtml(b.provider_name_raw)}
                        </span>
                        ${shareLine}
                    </div>
                    <span class="barber-aktif-row-value">${this.formatAngka(b.total_service)} Svc</span>
                </div>
            `;
        }).join("");
    },

    renderRanking(payload){
        const ranking = payload.ranking || [];
        if(!ranking.length){
            return `<div class="barber-aktif-empty">Tidak ada barber aktif pada filter aktif.</div>`;
        }

        const showShare = this.isOwner();
        return ranking.map((b) => {
            const cabang = this.shortCabangName(b.cabang_name);
            const shareBit = showShare
                ? ` · Share ${this.formatRupiah(b.provider_share)}`
                : "";
            return `
                <div class="barber-aktif-row is-static barber-aktif-rank-row" role="listitem">
                    <div class="barber-aktif-row-main">
                        <span class="barber-aktif-row-name">
                            <span class="barber-aktif-rank">${this.medal(b.rank_company)}</span>${this.escapeHtml(b.provider_name_raw)}
                        </span>
                        <span class="barber-aktif-row-sub">${this.escapeHtml(cabang)} · Income ${this.escapeHtml(this.formatRupiah(b.total_income))}${this.escapeHtml(shareBit)} · #${b.rank_branch || "-"} cabang</span>
                    </div>
                    <span class="barber-aktif-row-value">${this.formatAngka(b.total_service)} Svc</span>
                </div>
            `;
        }).join("");
    }
};

BarberAktif.init();
