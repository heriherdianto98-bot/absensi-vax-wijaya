/*======================================
VAX WIJAYA — Gaji Saya (Capster)
Source: RPC karyawan_gaji_capster_self
Session: karyawan-session.js (canonical)
======================================*/

const MONTHS_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const MSG_NOT_CAPSTER = "Halaman ini sementara khusus Capster. Tampilan Kasir belum tersedia.";
const MSG_NO_PREV = "Belum ada data periode sebelumnya";
const MSG_NO_DAILY = "Belum ada data untuk periode ini.";

function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
}

function escapeHtml(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function todayWibIso(){
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthWibFirstIso(){
    return `${todayWibIso().slice(0, 7)}-01`;
}

function calendarMonthRangeFromIso(iso){
    const raw = String(iso || "").slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if(!year || month < 1 || month > 12) return null;
    const lastDay = new Date(year, month, 0).getDate();
    return {
        year,
        month,
        dari: `${year}-${String(month).padStart(2, "0")}-01`,
        sampai: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    };
}

function previousCalendarMonthRange(dari){
    const current = calendarMonthRangeFromIso(dari);
    if(!current) return null;
    let year = current.year;
    let month = current.month - 1;
    if(month < 1){
        month = 12;
        year -= 1;
    }
    return calendarMonthRangeFromIso(`${year}-${String(month).padStart(2, "0")}-01`);
}

function formatMonthLabelFromIso(iso){
    const range = calendarMonthRangeFromIso(iso);
    if(!range) return "—";
    return `${MONTHS_ID[range.month - 1]} ${range.year}`;
}

function formatTanggalPanjang(iso){
    const raw = String(iso || "").slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return "—";
    const day = m[3];
    const month = MONTHS_ID[Number(m[2]) - 1];
    if(!month) return "—";
    return `${day} ${month} ${m[1]}`;
}

function formatRangeLabel(dari, sampai){
    return `${formatTanggalPanjang(dari)} — ${formatTanggalPanjang(sampai)}`;
}

function isIsoDate(value){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function formatRupiahId(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return "Rp0";
    const abs = Math.abs(Math.round(n)).toLocaleString("id-ID");
    return n < 0 ? "-Rp" + abs : "Rp" + abs;
}

function formatPersen(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    const text = abs.toLocaleString("id-ID", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0
    }) + "%";
    if(n > 0) return "+" + text;
    if(n < 0) return "-" + text;
    return "0%";
}

function unwrapRpcPayload(data){
    if(data && typeof data === "object" && !Array.isArray(data)) return data;
    if(Array.isArray(data) && data[0] && typeof data[0] === "object") return data[0];
    return null;
}

let currentPayrollConsumer = null;

function payrollSourceToConsumer(payload){
    if(!payload?.data || typeof PayrollUnifiedEngine === "undefined") return null;

    const employee = payload.employee || {};
    const data = payload.data || {};
    const rows = Array.isArray(data.payroll_manual_adjustments) ? data.payroll_manual_adjustments : [];
    const lastAdjustment = rows.length ? rows[rows.length - 1] : null;
    const adjustments = {};
    if(lastAdjustment){
        adjustments[String(employee.id)] = {
            bonusInsentif: Number(lastAdjustment.bonus_insentif || 0),
            bonusKpi: Number(lastAdjustment.bonus_kpi || 0)
        };
    }

    const cabangRows = Array.isArray(data.cabang) ? data.cabang : [];
    const ctx = {
        range: {
            start: String(payload?.periode?.dari || ""),
            end: String(payload?.periode?.sampai || "")
        },
        cabangMap: new Map(cabangRows.map((row) => [Number(row.id), row.nama_cabang])),
        providerRows: Array.isArray(data.provider_sales_daily_source) ? data.provider_sales_daily_source : [],
        productRows: Array.isArray(data.product_sales_source) ? data.product_sales_source : [],
        absensiRows: Array.isArray(data.absensi) ? data.absensi : [],
        kasbonRows: Array.isArray(data.employee_cash_advances) ? data.employee_cash_advances : [],
        backupAssignments: { assigned: [], pending: [], fuelAllowances: [], backups: [] },
        salaryData: { rows: Array.isArray(data.payroll_salary_master) ? data.payroll_salary_master : [], byEmployee: {} },
        adjustments
    };

    const row = PayrollUnifiedEngine.buildEmployeePayroll(employee, ctx);
    const summary = row?.summary || {};
    const daily = (row?.daily || []).map((item) => ({
        tanggal: item.tanggal,
        share_bruto: Number(item.gajiPokok || 0),
        denda: Number(item.denda || 0),
        net_harian: Number(item.gajiPokok || 0)
            - Number(item.denda || 0)
            - Number(item.kasbon || 0)
            + Number(item.bonusProduk || 0)
    }));

    return {
        ok: true,
        source: "PAYROLL_UNIFIED_ENGINE",
        employee: {
            id: row.employeeId,
            nama: row.namaKaryawan,
            jabatan: row.jabatan,
            cabang: row.homeCabang
        },
        periode: payload.periode,
        summary: {
            share_bruto: Number(summary.gajiPokok || 0),
            total_denda: Number(summary.denda || 0),
            net_diterima: Number(summary.gajiBersih || 0)
        },
        payroll_summary: summary,
        payroll_row: row,
        daily
    };
}

function handleSelfReadSession(reason){
    if(String(reason || "").toUpperCase() !== "SESSION_INVALID") return false;
    if(typeof KaryawanSession !== "undefined" && typeof KaryawanSession.logout === "function"){
        KaryawanSession.logout();
        return true;
    }
    return false;
}

function sessionToken(){
    return (typeof KaryawanSession !== "undefined" && KaryawanSession.getToken)
        ? KaryawanSession.getToken()
        : "";
}

function setPeriodMessage(text){
    const el = document.getElementById("periodMessage");
    if(!el) return;
    if(!text){
        el.hidden = true;
        el.textContent = "";
        return;
    }
    el.hidden = false;
    el.textContent = text;
}

function setApplyBusy(busy){
    const btn = document.getElementById("gajiMonthButton");
    if(!btn) return;
    btn.disabled = Boolean(busy);
    btn.classList.toggle("is-loading", Boolean(busy));
}

function setTrend(kind){
    const el = document.querySelector(".cmp-trend");
    if(!el) return;
    el.classList.remove("is-flat", "is-up", "is-down");
    const key = kind === "up" ? "is-up" : kind === "down" ? "is-down" : "is-flat";
    el.classList.add(key);
    const icon = el.querySelector("i");
    if(!icon) return;
    icon.className = kind === "up"
        ? "fa-solid fa-arrow-up"
        : kind === "down"
            ? "fa-solid fa-arrow-down"
            : "fa-solid fa-minus";
}

function resetPrevCellLayout(){
    const prev = document.getElementById("cmpPeriodePrev");
    const li = prev ? prev.closest("li") : null;
    if(li) li.style.gridColumn = "";
    if(prev){
        prev.style.whiteSpace = "";
        prev.style.fontWeight = "";
        prev.style.color = "";
        prev.style.lineHeight = "";
    }
}

function renderSummary(share, denda, net){
    setText("valShareBruto", share);
    setText("valTotalDenda", denda);
    setText("valNetDiterima", net);
}

function renderComparisonEmptyPrev(periodeIni){
    const prev = document.getElementById("cmpPeriodePrev");
    const li = prev ? prev.closest("li") : null;
    if(li) li.style.gridColumn = "1 / -1";
    if(prev){
        prev.style.whiteSpace = "normal";
        prev.style.fontWeight = "600";
        prev.style.color = "#9a9a9a";
        prev.style.lineHeight = "1.25";
    }
    setText("cmpPeriodeIni", periodeIni);
    setText("cmpPeriodePrev", MSG_NO_PREV);
    setText("cmpSelisih", "—");
    setText("cmpPerubahan", "—");
    setTrend("flat");
}

function renderComparison(summaryNet, previousPayload){
    resetPrevCellLayout();

    const prevSummary = previousPayload && typeof previousPayload === "object"
        ? (previousPayload.summary && typeof previousPayload.summary === "object"
            ? previousPayload.summary
            : previousPayload)
        : null;

    const prevDaily = previousPayload
        ? (previousPayload.daily || previousPayload.days || previousPayload.rincian || [])
        : [];

    const hasPrev = Boolean(prevSummary) && (
        Number(prevSummary.share_bruto || 0) !== 0 ||
        Number(prevSummary.total_denda || 0) !== 0 ||
        Number(prevSummary.net_diterima || 0) !== 0 ||
        (Array.isArray(prevDaily) && prevDaily.length > 0)
    );

    if(!hasPrev){
        renderComparisonEmptyPrev(summaryNet);
        return;
    }

    const currentNet = Number(String(summaryNet).replace(/[^0-9-]/g, "")) || 0;
    const previousNet = Number(prevSummary.net_diterima || 0);
    const selisih = currentNet - previousNet;
    const persen = previousNet !== 0 ? (selisih / Math.abs(previousNet)) * 100 : (currentNet === 0 ? 0 : 100);

    setText("cmpPeriodeIni", formatRupiahId(currentNet));
    setText("cmpPeriodePrev", formatRupiahId(previousNet));
    setText("cmpSelisih", formatRupiahId(selisih));
    setText("cmpPerubahan", formatPersen(persen));
    setTrend(persen > 0 ? "up" : persen < 0 ? "down" : "flat");
}

function renderDailyEmpty(message){
    const list = document.getElementById("listHarian");
    const empty = document.getElementById("harianEmpty");
    const emptyText = empty ? empty.querySelector("p") : null;
    if(list){
        list.innerHTML = "";
        list.hidden = true;
    }
    if(empty) empty.hidden = false;
    if(emptyText) emptyText.textContent = message || MSG_NO_DAILY;
}

function normalizeDailyRow(item){
    const tanggal = String(
        item?.tanggal || item?.activity_date || item?.date || ""
    ).slice(0, 10);
    const share = Number(item?.share_bruto ?? item?.share ?? 0);
    const denda = Number(item?.denda ?? item?.total_denda ?? 0);
    const net = Number(
        item?.net_harian ?? item?.net_diterima ?? item?.net ?? (share - denda)
    );
    return {
        tanggal,
        share: Number.isFinite(share) ? share : 0,
        denda: Number.isFinite(denda) ? denda : 0,
        net: Number.isFinite(net) ? net : 0
    };
}

function renderDaily(rows){
    const list = document.getElementById("listHarian");
    const empty = document.getElementById("harianEmpty");
    if(!list) return;

    const daily = (Array.isArray(rows) ? rows : [])
        .map(normalizeDailyRow)
        .filter((row) => isIsoDate(row.tanggal))
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

    if(!daily.length){
        renderDailyEmpty(MSG_NO_DAILY);
        return;
    }

    if(empty) empty.hidden = true;
    list.hidden = false;
    list.innerHTML = daily.map((row) => `
        <article class="daily-card">
            <div class="daily-date">${escapeHtml(formatTanggalPanjang(row.tanggal))}</div>
            <div class="daily-row">
                <div>
                    <small>Share Bruto</small>
                    <b>${escapeHtml(formatRupiahId(row.share))}</b>
                </div>
                <div>
                    <small>Denda</small>
                    <b>${escapeHtml(formatRupiahId(row.denda))}</b>
                </div>
                <div>
                    <small>Net Harian</small>
                    <b>${escapeHtml(formatRupiahId(row.net))}</b>
                </div>
            </div>
        </article>`).join("");
}

function renderBlockedCapster(){
    renderSummary("—", "—", "—");
    resetPrevCellLayout();
    setText("cmpPeriodeIni", "—");
    setText("cmpPeriodePrev", "—");
    setText("cmpSelisih", "—");
    setText("cmpPerubahan", "—");
    setTrend("flat");
    renderDailyEmpty(MSG_NOT_CAPSTER);
    setPeriodMessage(MSG_NOT_CAPSTER);
}

function renderUnavailable(){
    renderSummary("—", "—", "—");
    renderComparisonEmptyPrev("—");
    renderDailyEmpty(MSG_NO_DAILY);
}

function renderPayload(payload, previousPayload){
    const summary = payload.summary && typeof payload.summary === "object"
        ? payload.summary
        : payload;
    const share = formatRupiahId(summary.share_bruto);
    const denda = formatRupiahId(summary.total_denda);
    const net = formatRupiahId(summary.net_diterima);
    renderSummary(share, denda, net);
    renderComparison(net, previousPayload);
    renderDaily(payload.daily || payload.days || payload.rincian || []);
}

function selectedPeriod(){
    const dariEl = document.getElementById("periodeDari");
    const sampaiEl = document.getElementById("periodeSampai");
    return {
        dari: dariEl ? dariEl.value : "",
        sampai: sampaiEl ? sampaiEl.value : ""
    };
}

async function fetchGajiRange(token, dari, sampai){
    const { data, error } = await db.rpc("karyawan_gaji_capster_self", {
        p_token: token,
        p_from: dari,
        p_to: sampai
    });
    return { data, error };
}

async function loadGaji(dari, sampai){
    const token = sessionToken();
    if(!token){
        handleSelfReadSession("SESSION_INVALID");
        return;
    }

    const selectedMonth = calendarMonthRangeFromIso(dari);
    const previousMonth = previousCalendarMonthRange(dari);
    if(!selectedMonth || !previousMonth){
        setPeriodMessage("Bulan tidak valid.");
        return;
    }

    setApplyBusy(true);
    try{
        const currentResult = await fetchGajiRange(token, selectedMonth.dari, selectedMonth.sampai);
        if(currentResult.error){
            console.error("Gaji Saya gagal (karyawan_gaji_capster_self):", currentResult.error);
            const reason = String(currentResult.error.message || currentResult.error.code || "").toUpperCase();
            if(handleSelfReadSession(reason)) return;
            if(reason.includes("ROLE_NOT_CAPSTER")){
                renderBlockedCapster();
                return;
            }
            setPeriodMessage("Gagal memuat data gaji.");
            renderUnavailable();
            return;
        }

        const sourcePayload = unwrapRpcPayload(currentResult.data);
        if(!sourcePayload || sourcePayload.ok === false){
            const reason = String(sourcePayload?.reason || "SESSION_INVALID").toUpperCase();
            console.error("Gaji Saya ditolak:", reason);
            if(handleSelfReadSession(reason)) return;
            if(reason.includes("ROLE_NOT_CAPSTER")){
                renderBlockedCapster();
                return;
            }
            setPeriodMessage("Gagal memuat data gaji.");
            renderUnavailable();
            return;
        }

        const payload = payrollSourceToConsumer(sourcePayload);
        if(!payload){
            console.error("Gaji Saya: Payroll Unified Engine tidak tersedia.");
            setPeriodMessage("Payroll belum dapat dimuat.");
            renderUnavailable();
            return;
        }

        let previousPayload = null;
        try{
            const previousResult = await fetchGajiRange(token, previousMonth.dari, previousMonth.sampai);
            if(!previousResult.error){
                const prevSource = unwrapRpcPayload(previousResult.data);
                if(prevSource && prevSource.ok !== false) previousPayload = payrollSourceToConsumer(prevSource);
            }else{
                console.warn("Perbandingan bulan sebelumnya gagal dimuat:", previousResult.error);
            }
        }catch(compareError){
            console.warn("Perbandingan bulan sebelumnya gagal dimuat:", compareError);
        }

        currentPayrollConsumer = payload;
        setPeriodMessage("");
        renderPayload(payload, previousPayload);
    }catch(err){
        console.error("Gaji Saya error:", err);
        setPeriodMessage("Gagal memuat data gaji.");
        renderUnavailable();
    }finally{
        setApplyBusy(false);
    }
}

function syncDateDisplays(){
    const { dari } = selectedPeriod();
    setText("periodRangeLabel", formatMonthLabelFromIso(dari));
}

function ensureCurrentMonthPeriod(){
    const dariEl = document.getElementById("periodeDari");
    const sampaiEl = document.getElementById("periodeSampai");
    if(!dariEl || !sampaiEl) return;
    if(isIsoDate(dariEl.value) && isIsoDate(sampaiEl.value)) return;

    const range = calendarMonthRangeFromIso(todayWibIso());
    if(!range) return;
    dariEl.value = range.dari;
    sampaiEl.value = range.sampai;

    const label = document.getElementById("gajiMonthButtonLabel");
    if(label) label.textContent = formatMonthLabelFromIso(range.dari);
}

function bindPeriod(){
    const btnPrint = document.getElementById("btnCetakSlip");

    ensureCurrentMonthPeriod();
    syncDateDisplays();

    document.addEventListener("gaji:month-change", async (event) => {
        const dari = String(event.detail?.dari || "");
        const sampai = String(event.detail?.sampai || "");
        if(!isIsoDate(dari) || !isIsoDate(sampai)) return;

        setPeriodMessage("");
        syncDateDisplays();
        await loadGaji(dari, sampai);
    });

    if(btnPrint){
        btnPrint.addEventListener("click", cetakSlipGaji);
    }
}

function screenText(id){
    return String(document.getElementById(id)?.textContent || "").trim() || "—";
}

function collectSlipFromPayroll(){
    const payload = currentPayrollConsumer;
    if(!payload) return null;
    const employee = payload.employee || {};
    const summary = payload.summary || {};
    return {
        nama: employee.nama || screenText("namaGaji"),
        jabatan: employee.jabatan || screenText("jabatanGaji"),
        cabang: employee.cabang || screenText("cabangGaji"),
        periode: formatMonthLabelFromIso(payload?.periode?.dari),
        share: formatRupiahId(summary.share_bruto),
        denda: formatRupiahId(summary.total_denda),
        net: formatRupiahId(summary.net_diterima),
        daily: (payload.daily || []).map((row) => ({
            tanggal: formatTanggalPanjang(row.tanggal),
            share: formatRupiahId(row.share_bruto),
            denda: formatRupiahId(row.denda),
            net: formatRupiahId(row.net_harian)
        }))
    };
}

function printClockWib(){
    const now = new Date();
    return {
        dateLabel: new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(now),
        timeLabel: new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(now) + " WIB"
    };
}

function fillSlipPrint(slip){
    const clock = printClockWib();
    setText("slipNama", slip.nama);
    setText("slipJabatan", slip.jabatan);
    setText("slipCabang", slip.cabang);
    setText("slipPeriode", slip.periode);
    setText("slipShare", slip.share);
    setText("slipDenda", slip.denda);
    setText("slipNet", slip.net);
    setText("slipSignName", slip.nama);
    setText("slipPrintDate", clock.dateLabel);
    setText("slipPrintTime", clock.timeLabel);
    setText("slipFootDate", clock.dateLabel);
    setText("slipFootTime", clock.timeLabel);

    const body = document.getElementById("slipDailyBody");
    if(!body) return;
    if(!slip.daily.length){
        body.innerHTML = `<tr><td colspan="4" class="empty">Belum ada data untuk periode ini.</td></tr>`;
        return;
    }
    body.innerHTML = slip.daily.map((row) => `
        <tr class="is-aktif">
            <td class="col-date">${escapeHtml(row.tanggal)}</td>
            <td class="num">${escapeHtml(row.share)}</td>
            <td class="num">${escapeHtml(row.denda)}</td>
            <td class="num">${escapeHtml(row.net)}</td>
        </tr>`).join("");
}

function payrollPrintDateLabel(iso){
    if(!isIsoDate(iso)) return String(iso || "—");
    return new Intl.DateTimeFormat("id-ID",{
        timeZone:"Asia/Jakarta",
        day:"2-digit",
        month:"short",
        year:"numeric"
    }).format(new Date(iso + "T12:00:00+07:00"));
}

function buildCanonicalPayrollPrintSnapshot(){
    const payload=currentPayrollConsumer;
    const row=payload?.payroll_row;
    if(!payload || !row) return null;

    const sm=row.summary || {};
    const money=(value)=>formatRupiahId(Number(value||0)).replace(/^Rp(?=\d)/,"Rp ");
    const daily=(Array.isArray(row.daily)?row.daily:[]).map(item=>[
        payrollPrintDateLabel(item.tanggal),
        item.cabang || row.homeCabang || "—",
        item.service == null ? "—" : String(Number(item.service)||0),
        money(item.gajiPokok),
        money(item.denda),
        money(item.kasbon),
        money(item.bonusProduk)
    ]);

    const sums=[
        {label:"Pendapatan Kotor",value:money(sm.gajiKotor ?? sm.gajiPokok)},
        {label:"Denda",value:money(sm.denda)},
        {label:"Kasbon",value:money(sm.kasbon)},
        {label:"Bonus Insentif",value:money(sm.bonusInsentif)},
        {label:"Bonus KPI",value:money(sm.bonusKpi)},
        {label:"Share Produk",value:money(sm.bonusProduk)},
        {label:"Pendapatan Bersih",value:money(sm.gajiBersih)},
        {label:"Hak Dibayar",value:money(sm.gajiBersih)}
    ];

    return {
        month:formatMonthLabelFromIso(payload?.periode?.dari),
        employeeLabel:`${row.namaKaryawan} · ${row.jabatan}`,
        branchLabel:row.homeCabang || payload?.employee?.cabang || "—",
        branchId:String(row.homeCabangId || ""),
        cards:[{
            employeeId:String(row.employeeId || ""),
            name:row.namaKaryawan || "—",
            info:`${row.homeCabang || "—"} · ${row.jabatan || "—"}`,
            rows:daily,
            sums,
            payoutNet:Number(sm.gajiBersih || 0),
            displayNet:money(sm.gajiBersih)
        }]
    };
}

function cetakSlipGaji(){
    const snap=buildCanonicalPayrollPrintSnapshot();
    if(!snap){
        setPeriodMessage("Data Payroll belum siap dicetak.");
        return;
    }
    if(typeof PayrollCapsterPrint?.openSnapshot !== "function"){
        setPeriodMessage("Presenter Payroll belum siap.");
        return;
    }
    PayrollCapsterPrint.openSnapshot(snap,{
        logo:new URL("ERP.NEW/assets/brand/erp-vax-wijaya.png",window.location.href).href,
        ownerSignatureUrl:new URL("ERP.NEW/assets/owner-signature.png",window.location.href).href,
        supervisorSignatureUrl:new URL("ERP.NEW/assets/supervisor-signature-rangga.svg",window.location.href).href
    });
}

async function loadCabangName(cabangId){
    if(!cabangId || typeof db === "undefined"){
        setText("cabangGaji", "—");
        return;
    }

    try{
        const { data: cabang } = await db
            .from("cabang")
            .select("nama_cabang")
            .eq("id", cabangId)
            .maybeSingle();
        setText("cabangGaji", cabang?.nama_cabang || "—");
    }catch(_e){
        setText("cabangGaji", "—");
    }
}

async function initGajiSaya(){
    const karyawan = await KaryawanSession.requirePage();
    if(!karyawan) return;

    setText("namaGaji", karyawan.nama_karyawan || "—");
    setText("jabatanGaji", karyawan.jabatan || "—");
    await loadCabangName(karyawan.cabang_id);

    bindPeriod();
    const { dari, sampai } = selectedPeriod();
    await loadGaji(dari, sampai);
}

initGajiSaya();
