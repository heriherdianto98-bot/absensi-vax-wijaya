/*
=========================================================
VAX ERP — KPI Ultimate (read-only source + Owner edit target)
=========================================================
SOURCE LOCK:
  public.kpi_ultimate_sales_source
  public.kpi_ultimate_monthly_target

Tidak mengubah Dashboard Engine / SetoranMoneyEngine /
Arus Kas / Product Sales / modul LOCK.
=========================================================
*/

const KpiUltimate = {
    DEFAULT_TARGET: 6000000,
    PACKAGES: ["MAX", "RELAX", "REGULER", "PLUS", "ENAKIN KEPALA"],
    ANIM_MS: 780,
    _seq: 0,
    _animToken: 0,
    _bound: false,
    _subscribed: false,
    _filter: null,
    _targets: new Map(),
    _animFrom: { realisasi: 0, selisih: 0, progress: 0 },

    boot(){
        if(!document.getElementById("thcKpiuSection")) return;
        this.ensureProgressDom();
        this.bindUi();
        this.subscribeEngine();
        if(typeof DashboardEngine !== "undefined" && DashboardEngine.lastRange?.start){
            this.refresh();
        }
    },

    isOwner(){
        return typeof OwnerAuth !== "undefined"
            && OwnerAuth.isOwnerRole(OwnerAuth.profile?.role);
    },

    reduceMotion(){
        return window.matchMedia
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    },

    bindUi(){
        if(this._bound) return;
        this._bound = true;
        const save = document.getElementById("thcKpiuTargetSave");
        if(save){
            save.addEventListener("click", () => this.saveTarget());
        }
        const input = document.getElementById("thcKpiuTargetInput");
        if(input){
            input.addEventListener("keydown", (e) => {
                if(e.key === "Enter"){
                    e.preventDefault();
                    this.saveTarget();
                }
            });
        }
    },

    subscribeEngine(){
        if(this._subscribed || typeof DashboardEngine === "undefined") return;
        this._subscribed = true;
        DashboardEngine.subscribe((event) => {
            if(event === "loaded" || event === "calculated" || event === "error"){
                this.refresh();
            }
        });
    },

    ensureProgressDom(){
        if(document.getElementById("thcKpiuProgressBlock")) return;
        const cards = document.querySelector("#thcKpiuSection .thc-kpiu-cards");
        if(!cards) return;
        const block = document.createElement("div");
        block.id = "thcKpiuProgressBlock";
        block.className = "thc-kpiu-progress";
        block.innerHTML = `
            <div class="thc-kpiu-progress-head">
                <div>
                    <span class="thc-kpiu-progress-kicker">Progress target cabang</span>
                    <strong class="thc-kpiu-progress-pct" id="thcKpiuBarPct">0,0%</strong>
                </div>
                <span class="thc-kpiu-badge" id="thcKpiuBadge">BELUM TERCAPAI</span>
            </div>
            <div class="thc-kpiu-bar" aria-hidden="true">
                <span class="thc-kpiu-bar-fill" id="thcKpiuBarFill"></span>
            </div>
            <p class="thc-kpiu-progress-line" id="thcKpiuBarLine">0,0% tercapai · sisa 0,0%</p>
            <p class="thc-kpiu-progress-sub" id="thcKpiuBarSub">Kurang Rp0 lagi menuju target</p>
            <p class="thc-kpiu-progress-vs" id="thcKpiuBarVs">Realisasi Rp0 vs target Rp0</p>
        `;
        cards.after(block);
    },

    classifyPackage(teks){
        const raw = String(teks || "").replace(/\s+/g, " ").trim();
        if(/\benakin\s*kepala\b/i.test(raw) || /\benakinkepala\b/i.test(raw)) return "ENAKIN KEPALA";
        if(/\bmax\b/i.test(raw)) return "MAX";
        if(/\brelax\b/i.test(raw)) return "RELAX";
        if(/\breguler\b|\bregular\b/i.test(raw)) return "REGULER";
        if(/\bplus\b/i.test(raw)) return "PLUS";
        return null;
    },

    ultimateRows(rows){
        return (rows || []).filter((r) => this.classifyPackage(r.service_package));
    },

    formatRupiah(nilai){
        const n = Number(nilai);
        if(!Number.isFinite(n)) return "—";
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(n);
    },

    formatPct(nilai){
        const n = Number(nilai);
        if(!Number.isFinite(n)) return "0,0%";
        return `${n.toFixed(1).replace(".", ",")}%`;
    },

    parseMoney(teks){
        const cleaned = String(teks || "").replace(/[^\d-]/g, "");
        if(!cleaned) return NaN;
        return Number(cleaned);
    },

    escapeHtml(str){
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    shortCabang(name){
        return String(name || "")
            .replace(/^vax\s+wijiaya\s+/i, "")
            .replace(/^vax\s+wijaya\s+/i, "")
            .replace(/\s+/g, " ")
            .trim() || name || "—";
    },

    /* bigint-safe: never send "", "null", NaN, or 0 to cabang_id / karyawan.id filters */
    asBigintId(value){
        if(value == null) return null;
        const raw = String(value).trim();
        if(!raw) return null;
        const lower = raw.toLowerCase();
        if(lower === "null" || lower === "undefined" || lower === "nan" || lower === "all") return null;
        const n = Number(raw);
        if(!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
        return n;
    },

    todayWib(){
        if(typeof DashboardEngine !== "undefined" && typeof DashboardEngine.getJakartaToday === "function"){
            return DashboardEngine.getJakartaToday();
        }
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());
    },

    safeProgress(realisasi, target){
        const r = Number(realisasi);
        const t = Number(target);
        if(!Number.isFinite(r) || !Number.isFinite(t) || t <= 0) return 0;
        return (r / t) * 100;
    },

    remainingPct(progress){
        const p = Number(progress);
        if(!Number.isFinite(p)) return 0;
        const shown = Number(p.toFixed(1));
        return Math.max(0, Number((100 - shown).toFixed(1)));
    },

    remainingNominal(realisasi, target){
        const r = Number(realisasi) || 0;
        const t = Number(target);
        if(!Number.isFinite(t) || t <= 0) return 0;
        return Math.max(0, t - r);
    },

    statusMeta(progress){
        const p = Number(progress);
        const pct = Number.isFinite(p) ? p : 0;
        if(pct >= 110) return { key: "over", label: "MELEBIHI TARGET" };
        if(pct >= 100) return { key: "done", label: "TARGET TERCAPAI" };
        if(pct >= 80) return { key: "near", label: "HAMPIR TERCAPAI" };
        if(pct >= 50) return { key: "mid", label: "MENUJU TARGET" };
        return { key: "low", label: "BELUM TERCAPAI" };
    },

    activeFilter(){
        const today = this.todayWib();
        const endRaw = (typeof DashboardEngine !== "undefined" && DashboardEngine.lastRange?.end)
            ? String(DashboardEngine.lastRange.end).slice(0, 10)
            : today;
        const end = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : today;
        const year = Number(end.slice(0, 4)) || Number(today.slice(0, 4));
        const month = Number(end.slice(5, 7)) || Number(today.slice(5, 7));
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const resolved = (typeof DashboardEngine !== "undefined" && typeof DashboardEngine.resolveCabangId === "function")
            ? DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId)
            : null;
        const cabangId = this.asBigintId(resolved);
        const opList = (typeof DashboardEngine.getOperationalCabangList === "function")
            ? DashboardEngine.getOperationalCabangList()
            : (DashboardEngine.cabangList || []).filter((c) =>
                this.asBigintId(c?.id) && c?.nama_cabang && c.aktif !== false
                && !String(c.nama_cabang).toLowerCase().includes("floating")
            );
        const opIds = cabangId
            ? [cabangId]
            : opList.map((c) => this.asBigintId(c.id)).filter((id) => id != null);
        const cab = cabangId
            ? opList.find((c) => this.asBigintId(c.id) === cabangId)
            : null;
        return {
            start,
            end,
            cabangId,
            opIds,
            opList,
            year,
            month,
            cabangLabel: cab ? this.shortCabang(cab.nama_cabang) : "Semua Cabang"
        };
    },

    periodeLabel(filter){
        const start = filter.start;
        const end = filter.end;
        if(!start || !end) return "—";
        const fmt = (iso) => {
            const [y, m, d] = String(iso).split("-").map(Number);
            return new Intl.DateTimeFormat("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                timeZone: "UTC"
            }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
        };
        return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
    },

    monthLabel(filter){
        const months = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        return `${months[(filter.month || 1) - 1]} ${filter.year}`;
    },

    async fetchSales(filter){
        if(typeof db === "undefined") throw new Error("Supabase client tidak tersedia");
        const cabangId = this.asBigintId(filter.cabangId);
        const opIds = (filter.opIds || []).map((id) => this.asBigintId(id)).filter((id) => id != null);
        if(!filter.start || !filter.end) return [];
        if(cabangId == null && !opIds.length) return [];
        const pageSize = 1000;
        const rows = [];
        let from = 0;
        for(;;){
            let q = db.from("kpi_ultimate_sales_source")
                .select("activity_date,cabang_id,service_package,price_with_discount,close_name_raw,cashier_employee_id,mapping_status");
            q = q.gte("activity_date", filter.start).lte("activity_date", filter.end);
            q = cabangId != null
                ? q.eq("cabang_id", cabangId)
                : q.in("cabang_id", opIds);
            q = q.range(from, from + pageSize - 1);
            const { data, error } = await q;
            if(error) throw error;
            const chunk = data || [];
            rows.push(...chunk);
            if(chunk.length < pageSize) break;
            from += pageSize;
        }
        return rows;
    },

    async fetchTargets(filter){
        const map = new Map();
        const opIds = (filter.opIds || []).map((id) => this.asBigintId(id)).filter((id) => id != null);
        opIds.forEach((id) => map.set(id, this.DEFAULT_TARGET));
        if(typeof db === "undefined" || !opIds.length) return map;
        const { data, error } = await db.from("kpi_ultimate_monthly_target")
            .select("cabang_id,target_amount,active")
            .eq("year", filter.year)
            .eq("month", filter.month)
            .in("cabang_id", opIds);
        if(error) throw error;
        (data || []).forEach((r) => {
            if(r.active === false) return;
            const id = this.asBigintId(r.cabang_id);
            const n = Number(r.target_amount);
            if(id != null && Number.isFinite(n)) map.set(id, n);
        });
        return map;
    },

    async fetchKaryawan(ids){
        const uniq = [...new Set((ids || []).map((id) => this.asBigintId(id)).filter((id) => id != null))];
        const map = new Map();
        if(!uniq.length || typeof db === "undefined") return map;
        const { data, error } = await db.from("karyawan")
            .select("id,nama_karyawan")
            .in("id", uniq);
        if(error) throw error;
        (data || []).forEach((k) => {
            const id = this.asBigintId(k.id);
            if(id != null) map.set(id, String(k.nama_karyawan || "").trim());
        });
        return map;
    },

    buildKasir(rows, names, targets){
        const map = new Map();
        (rows || []).forEach((r) => {
            const empId = r.cashier_employee_id != null ? Number(r.cashier_employee_id) : null;
            const key = empId || `raw:${String(r.close_name_raw || "").trim()}`;
            if(!map.has(key)){
                const name = (empId && names.get(empId))
                    || String(r.close_name_raw || "").trim()
                    || "—";
                map.set(key, {
                    name,
                    employee_id: empId,
                    cabang_id: Number(r.cabang_id),
                    mapping: r.mapping_status || "UNMAPPED",
                    trx: 0,
                    realisasi: 0
                });
            }
            const g = map.get(key);
            g.trx += 1;
            g.realisasi += Number(r.price_with_discount || 0);
            if(r.mapping_status === "UNMAPPED") g.mapping = "UNMAPPED";
        });
        return [...map.values()]
            .map((g) => {
                const target = Number(targets.get(g.cabang_id) ?? this.DEFAULT_TARGET);
                const progress = this.safeProgress(g.realisasi, target);
                const status = this.statusMeta(progress);
                return {
                    ...g,
                    target,
                    progress,
                    status: status.label,
                    tone: status.key
                };
            })
            .sort((a, b) => b.realisasi - a.realisasi || a.name.localeCompare(b.name));
    },

    buildPackages(rows, totalRealisasi){
        const map = Object.fromEntries(this.PACKAGES.map((k) => [k, { code: k, trx: 0, realisasi: 0, contrib: 0 }]));
        (rows || []).forEach((r) => {
            const code = this.classifyPackage(r.service_package);
            if(!code || !map[code]) return;
            map[code].trx += 1;
            map[code].realisasi += Number(r.price_with_discount || 0);
        });
        const total = Number(totalRealisasi) || 0;
        return this.PACKAGES.map((k) => {
            const item = map[k];
            item.contrib = total > 0 ? (item.realisasi / total) * 100 : 0;
            return item;
        });
    },

    setMsg(text, kind){
        const el = document.getElementById("thcKpiuTargetMsg");
        if(!el) return;
        el.textContent = text || "";
        el.classList.toggle("is-ok", kind === "ok");
        el.classList.toggle("is-err", kind === "err");
    },

    applyTone(el, tone){
        if(!el) return;
        el.classList.remove("is-low", "is-mid", "is-near", "is-done", "is-over");
        el.classList.add(`is-${tone}`);
    },

    writeSnapshot(snap){
        const set = (id, text) => {
            const el = document.getElementById(id);
            if(el) el.textContent = text;
        };
        set("thcKpiuRealisasiVal", this.formatRupiah(snap.realisasi));
        set("thcKpiuSelisihVal", this.formatRupiah(snap.selisih));
        set("thcKpiuProgressVal", this.formatPct(snap.progress));
        set("thcKpiuBarPct", this.formatPct(snap.progress));
        set("thcKpiuBarLine", `${this.formatPct(snap.progress)} tercapai · sisa ${this.formatPct(snap.sisa)}`);

        const kurang = snap.kurang;
        const over = Number(snap.realisasi) - Number(snap.target);
        if(Number(snap.target) <= 0){
            set("thcKpiuBarSub", "Target 0 · progress tidak dihitung");
        }else if(over > 0){
            set("thcKpiuBarSub", `Melebihi ${this.formatRupiah(over)} di atas target`);
        }else{
            set("thcKpiuBarSub", `Kurang ${this.formatRupiah(kurang)} lagi menuju target`);
        }
        set("thcKpiuBarVs", `Realisasi ${this.formatRupiah(snap.realisasi)} vs target ${this.formatRupiah(snap.target)}`);

        const fill = document.getElementById("thcKpiuBarFill");
        if(fill){
            fill.style.width = `${Math.max(0, Math.min(100, snap.progress))}%`;
        }
    },

    animateNumbers(model){
        const to = {
            realisasi: Number(model.realisasi) || 0,
            selisih: Number(model.selisih) || 0,
            progress: Number(model.progress) || 0,
            sisa: Number(model.sisa) || 0,
            kurang: Number(model.kurang) || 0,
            target: Number(model.target) || 0
        };
        const from = this.reduceMotion()
            ? to
            : {
                realisasi: 0,
                selisih: 0,
                progress: 0,
                sisa: 100,
                kurang: to.target,
                target: to.target
            };

        const token = ++this._animToken;
        if(this.reduceMotion()){
            this.writeSnapshot(to);
            this._animFrom = to;
            return;
        }

        const start = performance.now();
        const dur = this.ANIM_MS;
        const ease = (t) => 1 - Math.pow(1 - t, 3);

        const step = (now) => {
            if(token !== this._animToken) return;
            const t = Math.min(1, (now - start) / dur);
            const e = ease(t);
            this.writeSnapshot({
                realisasi: from.realisasi + (to.realisasi - from.realisasi) * e,
                selisih: from.selisih + (to.selisih - from.selisih) * e,
                progress: from.progress + (to.progress - from.progress) * e,
                sisa: from.sisa + (to.sisa - from.sisa) * e,
                kurang: from.kurang + (to.kurang - from.kurang) * e,
                target: to.target
            });
            if(t < 1) requestAnimationFrame(step);
            else this._animFrom = to;
        };
        requestAnimationFrame(step);
    },

    paint(model){
        this.ensureProgressDom();
        const meta = document.getElementById("thcKpiuMeta");
        if(meta){
            meta.textContent = `${model.cabangLabel} · ${model.periodeLabel} · Target ${model.monthLabel}`;
        }

        const targetEl = document.getElementById("thcKpiuTargetVal");
        if(targetEl) targetEl.textContent = this.formatRupiah(model.target);

        const selisihCard = document.getElementById("thcKpiuSelisihCard");
        if(selisihCard){
            selisihCard.classList.toggle("is-plus", model.selisih >= 0);
            selisihCard.classList.toggle("is-minus", model.selisih < 0);
        }

        const status = this.statusMeta(model.progress);
        const badge = document.getElementById("thcKpiuBadge");
        if(badge) badge.textContent = status.label;
        this.applyTone(document.getElementById("thcKpiuProgressBlock"), status.key);
        this.applyTone(badge, status.key);

        const input = document.getElementById("thcKpiuTargetInput");
        const save = document.getElementById("thcKpiuTargetSave");
        const editWrap = document.getElementById("thcKpiuEditWrap");
        const canEdit = this.isOwner() && model.singleCabang;
        if(editWrap){
            editWrap.hidden = !this.isOwner();
        }
        if(input){
            input.disabled = !canEdit;
            if(model.singleCabang){
                input.value = this.formatRupiah(model.target);
            }else{
                input.value = "";
                input.placeholder = "Pilih 1 cabang";
            }
        }
        if(save) save.disabled = !canEdit;
        if(!model.singleCabang && this.isOwner()){
            this.setMsg("Pilih satu cabang untuk mengubah target.", null);
        }else if(this.isOwner() && !model.keepMsg){
            this.setMsg("", null);
        }

        const tbody = document.getElementById("thcKpiuKasirTbody");
        if(tbody){
            if(!model.kasir.length){
                tbody.innerHTML = `<tr><td colspan="6" class="thc-kpiu-empty">Belum ada transaksi Ultimate pada filter ini.</td></tr>`;
            }else{
                tbody.innerHTML = model.kasir.map((k) => {
                    const fill = Math.max(0, Math.min(100, k.progress));
                    return `
                    <tr>
                        <td>${this.escapeHtml(k.name)}${k.mapping === "UNMAPPED" ? " · UNMAPPED" : ""}</td>
                        <td class="thc-num">${k.trx}</td>
                        <td class="thc-num">${this.escapeHtml(this.formatRupiah(k.realisasi))}</td>
                        <td class="thc-num">${this.escapeHtml(this.formatRupiah(k.target))}</td>
                        <td class="thc-kpiu-mini-cell">
                            <div class="thc-kpiu-mini is-${this.escapeHtml(k.tone)}">
                                <span class="thc-kpiu-mini-track"><i style="width:${fill}%"></i></span>
                                <b>${this.escapeHtml(this.formatPct(k.progress))}</b>
                            </div>
                        </td>
                        <td><span class="thc-kpiu-chip is-${this.escapeHtml(k.tone)}">${this.escapeHtml(k.status)}</span></td>
                    </tr>`;
                }).join("");
            }
        }

        const pkg = document.getElementById("thcKpiuPkg");
        if(pkg){
            pkg.innerHTML = model.packages.map((p) => `
                <div class="thc-kpiu-pkg-item">
                    <b>${this.escapeHtml(p.code)}</b>
                    <strong>${this.escapeHtml(this.formatRupiah(p.realisasi))}</strong>
                    <em>${p.trx} trx</em>
                    <span class="thc-kpiu-pkg-contrib">${this.escapeHtml(this.formatPct(p.contrib))} kontribusi</span>
                </div>
            `).join("");
        }

        this.animateNumbers(model);
    },

    async refresh(){
        const seq = ++this._seq;
        this._animToken += 1;
        const filter = this.activeFilter();
        this._filter = filter;
        const meta = document.getElementById("thcKpiuMeta");
        if(meta) meta.textContent = `${filter.cabangLabel} · ${this.periodeLabel(filter)} · memuat…`;

        try{
            const [rows, targets] = await Promise.all([
                this.fetchSales(filter),
                this.fetchTargets(filter)
            ]);
            if(seq !== this._seq) return;
            this._targets = targets;
            const ultimateRows = this.ultimateRows(rows);
            const names = await this.fetchKaryawan(ultimateRows.map((r) => r.cashier_employee_id));
            if(seq !== this._seq) return;

            const realisasi = ultimateRows.reduce((s, r) => s + Number(r.price_with_discount || 0), 0);
            const cabangId = this.asBigintId(filter.cabangId);
            const target = cabangId != null
                ? Number(targets.get(cabangId) ?? this.DEFAULT_TARGET)
                : filter.opIds.reduce((s, id) => s + Number(targets.get(this.asBigintId(id)) ?? this.DEFAULT_TARGET), 0);
            const safeTarget = Number.isFinite(target) ? target : 0;
            const progress = this.safeProgress(realisasi, safeTarget);
            const sisa = this.remainingPct(progress);
            const kurang = this.remainingNominal(realisasi, safeTarget);
            const selisih = realisasi - safeTarget;

            this.paint({
                cabangLabel: filter.cabangLabel,
                periodeLabel: this.periodeLabel(filter),
                monthLabel: this.monthLabel(filter),
                singleCabang: cabangId != null,
                target: safeTarget,
                realisasi,
                selisih,
                progress,
                sisa,
                kurang,
                kasir: this.buildKasir(ultimateRows, names, targets),
                packages: this.buildPackages(ultimateRows, realisasi),
                unmapped: ultimateRows.filter((r) => r.mapping_status === "UNMAPPED").length
            });
        }catch(err){
            if(seq !== this._seq) return;
            console.warn("KpiUltimate.refresh:", err);
            this.paint({
                cabangLabel: filter.cabangLabel,
                periodeLabel: this.periodeLabel(filter),
                monthLabel: this.monthLabel(filter),
                singleCabang: this.asBigintId(filter.cabangId) != null,
                target: this.DEFAULT_TARGET,
                realisasi: 0,
                selisih: -this.DEFAULT_TARGET,
                progress: 0,
                sisa: 100,
                kurang: this.DEFAULT_TARGET,
                kasir: [],
                packages: this.PACKAGES.map((code) => ({ code, trx: 0, realisasi: 0, contrib: 0 })),
                unmapped: 0
            });
            this.setMsg(err.message || "Gagal memuat KPI Ultimate", "err");
        }
    },

    async saveTarget(){
        if(!this.isOwner()){
            this.setMsg("Hanya Owner yang boleh mengubah target.", "err");
            return;
        }
        const filter = this._filter || this.activeFilter();
        const cabangId = this.asBigintId(filter.cabangId);
        if(cabangId == null){
            this.setMsg("Pilih satu cabang untuk mengubah target.", "err");
            return;
        }
        const amount = this.parseMoney(document.getElementById("thcKpiuTargetInput")?.value);
        if(!Number.isFinite(amount) || amount < 0){
            this.setMsg("Target tidak valid.", "err");
            return;
        }
        const save = document.getElementById("thcKpiuTargetSave");
        if(save) save.disabled = true;
        this.setMsg("Menyimpan…", null);
        try{
            const { error } = await db.from("kpi_ultimate_monthly_target")
                .upsert({
                    year: filter.year,
                    month: filter.month,
                    cabang_id: cabangId,
                    target_amount: amount,
                    active: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: "year,month,cabang_id" });
            if(error) throw error;
            this.setMsg("Target tersimpan.", "ok");
            await this.refresh();
            this.setMsg("Target tersimpan.", "ok");
        }catch(err){
            this.setMsg(err.message || "Gagal simpan target", "err");
        }finally{
            if(save) save.disabled = !this.isOwner();
        }
    }
};

window.KpiUltimate = KpiUltimate;
