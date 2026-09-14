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
    const btn = document.getElementById("btnTerapkan");
    if(!btn) return;
    btn.disabled = Boolean(busy);
    btn.textContent = busy ? "Memuat..." : "Terapkan";
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

function renderComparison(summaryNet, comparison){
    resetPrevCellLayout();
    const cmp = comparison && typeof comparison === "object" ? comparison : {};
    const hasData = cmp.has_data === true;

    if(!hasData){
        renderComparisonEmptyPrev(summaryNet);
        return;
    }

    const selisih = Number(cmp.selisih);
    const persen = Number(cmp.perubahan_persen);
    setText("cmpPeriodeIni", summaryNet);
    setText("cmpPeriodePrev", formatRupiahId(cmp.net_diterima));
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

function renderPayload(payload){
    const summary = payload.summary && typeof payload.summary === "object"
        ? payload.summary
        : payload;
    const share = formatRupiahId(summary.share_bruto);
    const denda = formatRupiahId(summary.total_denda);
    const net = formatRupiahId(summary.net_diterima);
    renderSummary(share, denda, net);
    renderComparison(net, payload.comparison);
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

async function loadGaji(dari, sampai){
    const token = sessionToken();
    if(!token){
        handleSelfReadSession("SESSION_INVALID");
        return;
    }

    setApplyBusy(true);
    try{
        const { data, error } = await db.rpc("karyawan_gaji_capster_self", {
            p_token: token,
            p_from: dari,
            p_to: sampai
        });

        if(error){
            console.error("Gaji Saya gagal (karyawan_gaji_capster_self):", error);
            const reason = String(error.message || error.code || "").toUpperCase();
            if(handleSelfReadSession(reason)) return;
            if(reason.includes("ROLE_NOT_CAPSTER")){
                renderBlockedCapster();
                return;
            }
            setPeriodMessage("Gagal memuat data gaji.");
            renderUnavailable();
            return;
        }

        const payload = unwrapRpcPayload(data);
        if(!payload || payload.ok === false){
            const reason = String(payload?.reason || "SESSION_INVALID").toUpperCase();
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

        setPeriodMessage("");
        renderPayload(payload);
    }catch(err){
        console.error("Gaji Saya error:", err);
        setPeriodMessage("Gagal memuat data gaji.");
        renderUnavailable();
    }finally{
        setApplyBusy(false);
    }
}

function syncDateDisplays(){
    const { dari, sampai } = selectedPeriod();
    setText("dariDisplay", formatTanggalPanjang(dari));
    setText("sampaiDisplay", formatTanggalPanjang(sampai));
    setText("periodRangeLabel", formatRangeLabel(dari, sampai));
}

function applyPeriod(){
    const { dari, sampai } = selectedPeriod();
    if(!isIsoDate(dari) || !isIsoDate(sampai)){
        setPeriodMessage("Pilih tanggal Dari dan Sampai.");
        return;
    }
    if(dari > sampai){
        setPeriodMessage("Tanggal Dari tidak boleh setelah Sampai.");
        return;
    }
    setPeriodMessage("");
    syncDateDisplays();
    loadGaji(dari, sampai);
}

function bindPeriod(){
    const dariEl = document.getElementById("periodeDari");
    const sampaiEl = document.getElementById("periodeSampai");
    const btn = document.getElementById("btnTerapkan");
    const btnPrint = document.getElementById("btnCetakSlip");

    if(dariEl){
        dariEl.value = monthWibFirstIso();
        dariEl.addEventListener("change", syncDateDisplays);
        dariEl.addEventListener("input", syncDateDisplays);
    }
    if(sampaiEl){
        sampaiEl.value = todayWibIso();
        sampaiEl.addEventListener("change", syncDateDisplays);
        sampaiEl.addEventListener("input", syncDateDisplays);
    }
    if(btn){
        btn.addEventListener("click", applyPeriod);
    }
    if(btnPrint){
        btnPrint.addEventListener("click", cetakSlipGaji);
    }

    syncDateDisplays();
}

function screenText(id){
    return String(document.getElementById(id)?.textContent || "").trim() || "—";
}

function collectSlipFromScreen(){
    const list = document.getElementById("listHarian");
    const daily = [];
    if(list && !list.hidden){
        list.querySelectorAll(".daily-card").forEach((card) => {
            const vals = [...card.querySelectorAll(".daily-row b")].map((el) => (
                String(el.textContent || "").trim() || "Rp0"
            ));
            daily.push({
                tanggal: String(card.querySelector(".daily-date")?.textContent || "—").trim() || "—",
                share: vals[0] || "Rp0",
                denda: vals[1] || "Rp0",
                net: vals[2] || "Rp0"
            });
        });
    }
    return {
        nama: screenText("namaGaji"),
        jabatan: screenText("jabatanGaji"),
        cabang: screenText("cabangGaji"),
        periode: screenText("periodRangeLabel"),
        share: screenText("valShareBruto"),
        denda: screenText("valTotalDenda"),
        net: screenText("valNetDiterima"),
        daily
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

function cetakSlipGaji(){
    fillSlipPrint(collectSlipFromScreen());
    window.print();
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
