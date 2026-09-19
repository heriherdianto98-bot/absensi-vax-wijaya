/*
=========================================================
VAX ERP — Absensi Owner (shell ERP)
Logic inti dari dashboard-OWNER.js.
UI: search→detail (laporan.js #karyawan), Floating excluded,
custom calendar ERP, KPI accent + filter sync.
=========================================================
*/

const AbsensiOwner = {

    _bound: false,
    _karyawanIndex: [],
    _statusRows: [],
    _absensiDay: [],
    _dendaBulananRows: [],
    _kpiFilter: "",
    _calYear: 0,
    _calMonth: 0, // 0-11

    FOCUS_KEY_ID: "erp_absensi_karyawan_id",
    FOCUS_KEY_NAMA: "erp_absensi_karyawan_nama",

    todayJakarta(){
        return new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Jakarta"
        });
    },

    isFloatingCabang(nama){
        return String(nama || "").toLowerCase().includes("floating");
    },

    operationalCabang(list){
        return (list || [])
            .filter((c) => c && c.nama_cabang && !this.isFloatingCabang(c.nama_cabang))
            .sort((a, b) => String(a.nama_cabang).localeCompare(String(b.nama_cabang), "id"));
    },

    async boot(){
        const tanggalEl = document.getElementById("absensiFilterTanggal");
        if(tanggalEl && !tanggalEl.value){
            tanggalEl.value = this.todayJakarta();
        }
        this.syncDateLabel();
        this.bindUi();
        await this.loadDashboard();
        await this.loadAktivitasTerbaru();
        this.syncHeaderContext();
    },

    bindUi(){
        if(this._bound) return;
        this._bound = true;

        document.querySelectorAll("[data-absensi-filter]").forEach((el) => {
            el.addEventListener("click", () => {
                const key = el.getAttribute("data-absensi-filter") || "";
                if(key === "DENDA_BULAN"){
                    if(typeof AbsensiLaporanBulanan !== "undefined"){
                        AbsensiLaporanBulanan._activeFilter = "D";
                        AbsensiLaporanBulanan.setMode("bulan");
                    }
                    return;
                }
                const statusEl = document.getElementById("absensiFilterStatus");
                if(statusEl) statusEl.value = (key === "ALL" || key === "DENDA") ? "" : key;
                this._kpiFilter = key === "ALL" ? "" : key;
                this.syncKpiActive();
                this.applyStatusTableFilter();
                if(typeof AbsensiLaporanBulanan !== "undefined" && AbsensiLaporanBulanan.setDailyStatusFilter){
                    AbsensiLaporanBulanan.setDailyStatusFilter(this._kpiFilter);
                    document.getElementById("ablDetailBox")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }else{
                    document.getElementById("statusBox")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            });
        });

        document.getElementById("btnResetAbsensiFilter")?.addEventListener("click", () => {
            const statusEl = document.getElementById("absensiFilterStatus");
            if(statusEl) statusEl.value = "";
            this._kpiFilter = "";
            this.syncKpiActive();
            this.applyStatusTableFilter();
            const cari = document.getElementById("cariNama");
            if(cari) cari.value = "";
            if(typeof AbsensiLaporanBulanan !== "undefined"){
                AbsensiLaporanBulanan.setDailySearch?.("");
                AbsensiLaporanBulanan.setDailyStatusFilter?.("");
            }
        });

        document.getElementById("absensiFilterCabang")?.addEventListener("change", async () => {
            this.refreshKpiFromCache();
            this.applyStatusTableFilter();
            this.syncHeaderContext();
            if(typeof AbsensiLaporanBulanan !== "undefined" && AbsensiLaporanBulanan.setDailyCabangName){
                await AbsensiLaporanBulanan.setDailyCabangName(this.selectedCabangName());
            }
        });

        document.getElementById("absensiFilterStatus")?.addEventListener("change", () => {
            this._kpiFilter = String(document.getElementById("absensiFilterStatus")?.value || "");
            this.syncKpiActive();
            this.applyStatusTableFilter();
            if(typeof AbsensiLaporanBulanan !== "undefined" && AbsensiLaporanBulanan.setDailyStatusFilter){
                AbsensiLaporanBulanan.setDailyStatusFilter(this._kpiFilter);
            }
        });

        document.getElementById("btnPrintAbsensiHari")?.addEventListener("click", () => {
            if(typeof AbsensiLaporanBulanan !== "undefined" && AbsensiLaporanBulanan.printReport){
                AbsensiLaporanBulanan.printReport();
            }
        });

        const cari = document.getElementById("cariNama");
        if(cari){
            cari.addEventListener("input", () => this.onSearchInput());
            cari.addEventListener("keydown", (e) => {
                if(e.key === "Enter"){
                    e.preventDefault();
                    this.commitSearch(cari.value);
                }else if(e.key === "Escape"){
                    this.hideSuggest();
                    this.clearSearchMsg();
                }
            });
        }

        document.addEventListener("click", (e) => {
            const sug = e.target.closest("[data-absensi-karyawan-id]");
            if(sug){
                e.preventDefault();
                this.openEmployeeDetail(
                    sug.getAttribute("data-absensi-karyawan-id"),
                    sug.getAttribute("data-absensi-karyawan-nama") || ""
                );
                return;
            }

            const rowBtn = e.target.closest("[data-absensi-row-id]");
            if(rowBtn){
                this.openEmployeeDetail(
                    rowBtn.getAttribute("data-absensi-row-id"),
                    rowBtn.getAttribute("data-absensi-row-nama") || ""
                );
                return;
            }

            if(!e.target.closest(".absensi-search-wrap")){
                this.hideSuggest();
            }

            if(e.target.closest("[data-absensi-cal-close]")){
                this.closeCalendar();
                return;
            }
            if(e.target.closest("#absensiDateBtn")){
                this.openCalendar();
                return;
            }
            if(e.target.closest("#absensiCalPrev")){
                this.shiftCalendarMonth(-1);
                return;
            }
            if(e.target.closest("#absensiCalNext")){
                this.shiftCalendarMonth(1);
                return;
            }
            if(e.target.closest("#absensiCalToday")){
                this.pickCalendarDate(this.todayJakarta());
                return;
            }
            const day = e.target.closest("[data-absensi-cal-day]");
            if(day){
                this.pickCalendarDate(day.getAttribute("data-absensi-cal-day"));
            }
        });
    },

    selectedDate(){
        const el = document.getElementById("absensiFilterTanggal");
        return (el && el.value) ? el.value : this.todayJakarta();
    },

    syncDateLabel(){
        const label = document.getElementById("absensiDateLabel");
        const tanggal = this.selectedDate();
        if(!label) return;
        try{
            const [y, m, d] = tanggal.split("-");
            label.textContent = `${d}/${m}/${y}`;
        }catch(_e){
            label.textContent = tanggal;
        }
    },

    syncHeaderContext(){
        const monthlyHost = document.getElementById("absensiMonthlyHost");
        const monthlyOpen = Boolean(
            document.getElementById("absensiRoot")?.classList.contains("is-abl-open")
            || (monthlyHost && !monthlyHost.hidden)
            || (!monthlyHost && document.getElementById("ablPage"))
        );
        if(monthlyOpen && typeof AbsensiLaporanBulanan !== "undefined" && AbsensiLaporanBulanan._visible){
            AbsensiLaporanBulanan.syncHeaderContext();
            return;
        }
        const cabangEl = document.getElementById("erpHeaderCabang");
        const periodeEl = document.getElementById("erpHeaderPeriode");
        const filterCabang = document.getElementById("absensiFilterCabang");
        const tanggal = this.selectedDate();

        if(cabangEl){
            const opt = filterCabang?.selectedOptions?.[0];
            cabangEl.textContent = (opt && opt.value)
                ? opt.textContent.trim()
                : "Semua Cabang";
        }
        if(periodeEl){
            try{
                const [y, m, d] = String(tanggal || "").split("-");
                const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
                const day = Number(d);
                const mon = months[Number(m) - 1];
                periodeEl.textContent = (day && mon && y) ? `${day} ${mon} ${y}` : String(tanggal || "—");
            }catch(_e){
                periodeEl.textContent = tanggal || "—";
            }
        }
        if(typeof syncSidebarRoleMeta === "function"){
            syncSidebarRoleMeta();
        }
    },

    fillCabangOptions(cabangList){
        const select = document.getElementById("absensiFilterCabang");
        if(!select) return;
        const current = select.value;
        const ops = this.operationalCabang(cabangList);
        select.innerHTML = `<option value="">Semua Cabang</option>`;
        ops.forEach((item) => {
            const opt = document.createElement("option");
            opt.value = item.nama_cabang || "";
            opt.textContent = item.nama_cabang || "-";
            select.appendChild(opt);
        });
        if(current && [...select.options].some((o) => o.value === current)){
            select.value = current;
        }
        select.dataset.opsCount = String(ops.length);
    },

    /* ===== Search → Employee Detail (reuse laporan #karyawan) ===== */

    onSearchInput(){
        const raw = String(document.getElementById("cariNama")?.value || "").trim();
        const q = raw.toLowerCase();
        if(typeof AbsensiLaporanBulanan !== "undefined" && AbsensiLaporanBulanan.setDailySearch){
            AbsensiLaporanBulanan.setDailySearch(raw);
        }
        this.clearSearchMsg();
        if(!q){
            this.hideSuggest();
            return;
        }
        const hits = this._karyawanIndex
            .filter((k) => k.nama.toLowerCase().includes(q))
            .slice(0, 8);
        this.renderSuggest(hits);
    },

    renderSuggest(hits){
        const box = document.getElementById("absensiSearchSuggest");
        if(!box) return;
        if(!hits.length){
            box.hidden = true;
            box.innerHTML = "";
            return;
        }
        box.hidden = false;
        box.innerHTML = hits.map((k) => `
            <button type="button" class="absensi-suggest-item" role="option"
                data-absensi-karyawan-id="${k.id}"
                data-absensi-karyawan-nama="${String(k.nama).replace(/"/g, "&quot;")}">
                <strong>${k.nama}</strong>
                <span>${k.cabang || "-"}</span>
            </button>
        `).join("");
    },

    hideSuggest(){
        const box = document.getElementById("absensiSearchSuggest");
        if(box){
            box.hidden = true;
            box.innerHTML = "";
        }
    },

    clearSearchMsg(){
        const msg = document.getElementById("absensiSearchMsg");
        if(msg){
            msg.hidden = true;
            msg.textContent = "";
        }
    },

    showSearchMsg(text){
        const msg = document.getElementById("absensiSearchMsg");
        if(!msg) return;
        msg.hidden = false;
        msg.textContent = text;
    },

    commitSearch(raw){
        const q = String(raw || "").trim().toLowerCase();
        if(!q){
            this.showSearchMsg("Ketik nama karyawan");
            return;
        }
        const hits = this._karyawanIndex.filter((k) =>
            k.nama.toLowerCase().includes(q)
        );
        if(!hits.length){
            this.hideSuggest();
            this.showSearchMsg("Karyawan tidak ditemukan");
            return;
        }
        const exact = hits.find((k) => k.nama.toLowerCase() === q);
        const pick = exact || hits[0];
        this.openEmployeeDetail(pick.id, pick.nama);
    },

    openEmployeeDetail(id, nama){
        if(!id){
            this.showSearchMsg("Karyawan tidak ditemukan");
            return;
        }
        try{
            sessionStorage.setItem(this.FOCUS_KEY_ID, String(id));
            sessionStorage.setItem(this.FOCUS_KEY_NAMA, String(nama || ""));
        }catch(_e){ /* ignore */ }
        window.location.href = `./absensi-laporan.html?karyawan=${encodeURIComponent(String(id))}`;
    },

    /* ===== Custom calendar (ERP theme) ===== */

    openCalendar(){
        const modal = document.getElementById("absensiCalModal");
        if(!modal) return;
        const d = this.selectedDate();
        const parts = d.split("-").map(Number);
        this._calYear = parts[0] || new Date().getFullYear();
        this._calMonth = (parts[1] || 1) - 1;
        this.renderCalendar();
        modal.hidden = false;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("custom-cal-open");
    },

    closeCalendar(){
        const modal = document.getElementById("absensiCalModal");
        if(!modal) return;
        modal.hidden = true;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("custom-cal-open");
    },

    shiftCalendarMonth(delta){
        this._calMonth += delta;
        if(this._calMonth < 0){
            this._calMonth = 11;
            this._calYear -= 1;
        }else if(this._calMonth > 11){
            this._calMonth = 0;
            this._calYear += 1;
        }
        this.renderCalendar();
    },

    renderCalendar(){
        const label = document.getElementById("absensiCalMonthLabel");
        const days = document.getElementById("absensiCalDays");
        if(!days) return;

        const monthNames = [
            "Januari","Februari","Maret","April","Mei","Juni",
            "Juli","Agustus","September","Oktober","November","Desember"
        ];
        if(label){
            label.textContent = `${monthNames[this._calMonth]} ${this._calYear}`;
        }

        const first = new Date(this._calYear, this._calMonth, 1);
        const startPad = (first.getDay() + 6) % 7; // Senin=0
        const dim = new Date(this._calYear, this._calMonth + 1, 0).getDate();
        const selected = this.selectedDate();
        const today = this.todayJakarta();

        let html = "";
        for(let i = 0; i < startPad; i++){
            html += `<span class="cal-day is-empty" aria-hidden="true"></span>`;
        }
        for(let day = 1; day <= dim; day++){
            const iso = `${this._calYear}-${String(this._calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const classes = ["cal-day"];
            if(iso === selected) classes.push("is-selected");
            if(iso === today) classes.push("is-today");
            html += `<button type="button" class="${classes.join(" ")}" data-absensi-cal-day="${iso}">${day}</button>`;
        }
        days.innerHTML = html;
    },

    async pickCalendarDate(iso){
        const el = document.getElementById("absensiFilterTanggal");
        if(el) el.value = iso;
        this.syncDateLabel();
        this.closeCalendar();
        await this.loadDashboard();
        if(typeof AbsensiLaporanBulanan !== "undefined" && AbsensiLaporanBulanan.setDailyDate){
            await AbsensiLaporanBulanan.setDailyDate(iso);
        }
        this.syncHeaderContext();
    },

    /* ===== Filters / KPI ===== */

    selectedCabangName(){
        return String(document.getElementById("absensiFilterCabang")?.value || "").trim();
    },

    applyStatusTableFilter(){
        const cabang = this.selectedCabangName().toLowerCase();
        const statusKey = String(document.getElementById("absensiFilterStatus")?.value || "")
            .trim()
            .toUpperCase();
        const kpi = String(this._kpiFilter || "").toUpperCase();

        document.querySelectorAll("#statusKaryawan tr").forEach((row) => {
            const cab = (row.cells[1]?.innerText || "").toLowerCase();
            const status = (row.cells[2]?.innerText || "").trim().toUpperCase();
            const denda = Number(row.getAttribute("data-denda") || 0);
            const okCabang = !cabang || cab === cabang;
            let okStatus = true;
            if(kpi === "DENDA"){
                okStatus = denda > 0;
            }else if(statusKey){
                okStatus = status.includes(statusKey);
            }
            row.style.display = (okCabang && okStatus) ? "" : "none";
        });
    },

    syncKpiActive(){
        const kpi = String(this._kpiFilter || "").toUpperCase();
        document.querySelectorAll("#absensiDailyView [data-absensi-filter]").forEach((el) => {
            const key = String(el.getAttribute("data-absensi-filter") || "").toUpperCase();
            el.classList.toggle("is-active", Boolean(kpi) && key === kpi);
        });
        const head = document.querySelector("#statusBox h2");
        if(head){
            head.textContent = kpi && kpi !== "DENDA_BULAN"
                ? `Rincian ${kpi.replace("_", " ")} · Hari Ini`
                : "Status Karyawan Hari Ini";
        }
    },

    refreshKpiFromCache(){
        const cabang = this.selectedCabangName();
        const rows = cabang
            ? this._statusRows.filter((r) => r.cabang === cabang)
            : this._statusRows.slice();

        const ids = new Set(rows.map((r) => String(r.id)));

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if(!el) return;
            const next = String(val);
            if(el.textContent === next) return;
            el.textContent = next;
            el.classList.remove("is-counting");
            void el.offsetWidth;
            el.classList.add("is-counting");
        };

        setText("totalKaryawan", rows.length);
        setText("hadirHariIni", rows.filter((r) => r.status === "MASUK").length);
        setText("terlambat", rows.filter((r) => r.status === "TERLAMBAT").length);
        setText("totalBelumAbsen", rows.filter((r) => r.status === "BELUM ABSEN").length);
        setText("totalLiburHariIni", rows.filter((r) => r.status === "LIBUR").length);
        setText("totalIzinHariIni", rows.filter((r) => r.status === "IZIN").length);
        setText("totalSakitHariIni", rows.filter((r) => r.status === "SAKIT").length);

        const dendaDay = (this._absensiDay || [])
            .filter((a) => !cabang || ids.has(String(a.karyawan_id)))
            .reduce((t, a) => t + Number(a.denda || 0), 0);
        setText("totalDendaHariIni", "Rp" + dendaDay.toLocaleString("id-ID"));

        const dendaBulan = (this._dendaBulananRows || [])
            .filter((a) => !cabang || ids.has(String(a.karyawan_id)))
            .reduce((t, a) => t + Number(a.denda || 0), 0);
        setText("totalDendaBulanan", "Rp" + dendaBulan.toLocaleString("id-ID"));
    },

    async loadDashboard(){
        const hariIni = this.selectedDate();

        const { data: cabang } = await db.from("cabang").select("*");
        this.fillCabangOptions(cabang || []);

        const karyawanRes = await db
            .from("karyawan")
            .select(`
                id,
                nama_karyawan,
                jabatan,
                aktif,
                cabang (
                    nama_cabang
                )
            `);

        if(karyawanRes.error){
            console.error("Gagal memuat karyawan Absensi Owner:", karyawanRes.error);
        }

        const karyawan = karyawanRes.data || [];

        const activeKaryawan = (karyawan || []).filter((k) => {
            if(typeof AbsensiLaporanBulanan !== "undefined" && AbsensiLaporanBulanan.isActiveKaryawan){
                return AbsensiLaporanBulanan.isActiveKaryawan(k);
            }
            return k.aktif !== false;
        });

        this._karyawanIndex = activeKaryawan.map((k) => ({
            id: k.id,
            nama: k.nama_karyawan || "",
            cabang: k.cabang?.nama_cabang || "-"
        }));

        let absenRes = await db
            .from("absensi")
            .select("karyawan_id, status, denda, jam_masuk, terlambat_menit, status_denda")
            .eq("tanggal", hariIni);
        if(absenRes.error && /column/i.test(absenRes.error.message || "")){
            absenRes = await db
                .from("absensi")
                .select("karyawan_id, status, denda")
                .eq("tanggal", hariIni);
        }
        this._absensiDay = absenRes.data || [];

        const [y, m] = hariIni.split("-");
        const tahun = Number(y);
        const bulan = m;
        const tanggalAwalBulan = `${tahun}-${bulan}-01`;
        const tanggalAkhirObjek = new Date(tahun, Number(bulan), 0);
        const tanggalAkhirBulan =
            `${tahun}-${bulan}-${String(tanggalAkhirObjek.getDate()).padStart(2, "0")}`;

        const { data: dendaBulanan } = await db
            .from("absensi")
            .select("karyawan_id, denda")
            .gte("tanggal", tanggalAwalBulan)
            .lte("tanggal", tanggalAkhirBulan);
        this._dendaBulananRows = dendaBulanan || [];

        const { data: liburHariIni } = await db
            .from("jadwal_libur")
            .select("karyawan_id, status")
            .eq("tanggal", hariIni);

        const statusHariIni = activeKaryawan;
        this._statusRows = statusHariIni.map((row) => {
            const jadwal = (liburHariIni || []).find(
                (item) => String(item.karyawan_id) === String(row.id)
            );
            const absen = (this._absensiDay || []).find(
                (item) => String(item.karyawan_id) === String(row.id)
            );

            let status = "BELUM ABSEN";
            let statusClass = "st-belum";

            if(jadwal){
                const sj = (jadwal.status || "").toUpperCase();
                if(sj === "IZIN"){ status = "IZIN"; statusClass = "st-izin"; }
                else if(sj === "LIBUR"){ status = "LIBUR"; statusClass = "st-libur"; }
                else if(sj === "SAKIT"){ status = "SAKIT"; statusClass = "st-sakit"; }
            }else if(absen){
                if(absen.status === "Terlambat"){
                    status = "TERLAMBAT";
                    statusClass = "st-terlambat";
                }else{
                    status = "MASUK";
                    statusClass = "st-masuk";
                }
            }

            return {
                id: row.id,
                nama: row.nama_karyawan || "-",
                cabang: row.cabang?.nama_cabang ?? "-",
                status,
                statusClass,
                denda: Number(absen?.denda || 0)
            };
        });

        const tbody = document.getElementById("statusKaryawan");
        if(tbody){
            tbody.innerHTML = this._statusRows.map((r) => `
                <tr class="absensi-status-row" style="cursor:pointer"
                    data-absensi-row-id="${r.id}"
                    data-absensi-row-nama="${String(r.nama).replace(/"/g, "&quot;")}"
                    data-denda="${r.denda || 0}">
                    <td>${r.nama}</td>
                    <td>${r.cabang}</td>
                    <td><span class="absensi-status ${r.statusClass}">${r.status}</span></td>
                </tr>
            `).join("");
        }

        this.refreshKpiFromCache();
        this.applyStatusTableFilter();
        this.syncKpiActive();
        this.syncHeaderContext();
    },

    async loadAktivitasTerbaru(){
        const box = document.getElementById("aktivitasTerbaru");
        if(!box) return;

        const { data, error } = await db
            .from("log_aktivitas")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(30);

        if(error){
            console.error(error);
            box.innerHTML = `<p class="absensi-muted absensi-error">Gagal memuat aktivitas.</p>`;
            return;
        }

        if(!data || data.length === 0){
            box.innerHTML = `<p class="absensi-muted">Belum ada aktivitas absensi.</p>`;
            return;
        }

        const absensiRelated = data.filter((item) => {
            const blob = [
                item.tabel_target,
                item.aksi,
                item.keterangan,
                item.data_target
            ].join(" ").toLowerCase();
            return /absen|hadir|terlambat|izin|sakit|libur/.test(blob);
        }).slice(0, 5);

        if(!absensiRelated.length){
            box.innerHTML = `<p class="absensi-muted">Belum ada aktivitas absensi.</p>`;
            return;
        }

        box.innerHTML = absensiRelated.map((item) => {
            const waktu = new Date(item.created_at);
            return `
                <div class="absensi-activity-row">
                    <div>
                        <div class="absensi-activity-title">
                            ${item.nama_user || "-"}
                            <span>(${item.role_user || "-"})</span>
                        </div>
                        <div class="absensi-activity-aksi">
                            ${item.aksi || "-"} ${item.tabel_target || ""}
                        </div>
                        <div class="absensi-activity-ket">
                            ${item.keterangan || item.data_target || "-"}
                        </div>
                    </div>
                    <div class="absensi-activity-time">
                        ${waktu.toLocaleDateString("id-ID")}<br>
                        ${waktu.toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit"
                        })}
                    </div>
                </div>
            `;
        }).join("");
    }
};

window.AbsensiOwner = AbsensiOwner;
