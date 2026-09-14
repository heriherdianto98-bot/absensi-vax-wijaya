/* =====================================
   RIWAYAT KARYAWAN
   Session canonical — tanpa login ulang
   Source: RPC karyawan_absensi_bulan_self
   UI: kartu mobile per riwayat
===================================== */

let semuaRiwayat = [];

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

function formatJam(value){
    if(value == null || value === "") return "—";
    const raw = String(value);
    const m = raw.match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : raw;
}

function formatRupiahId(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return "Rp0";
    return "Rp" + n.toLocaleString("id-ID");
}

function formatTanggalId(iso){
    const raw = String(iso || "").slice(0, 10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "—";
    const d = new Date(`${raw}T00:00:00+07:00`);
    if(Number.isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta"
    }).format(d);
}

function cabangName(item){
    if(!item || typeof item !== "object") return "—";
    if(typeof item.cabang === "string" && item.cabang.trim()) return item.cabang.trim();
    if(item.cabang && typeof item.cabang === "object"){
        const nested = item.cabang.nama_cabang || item.cabang.nama || "";
        if(nested) return String(nested);
    }
    return String(item.nama_cabang || item.cabang_nama || "—");
}

function historyTanggal(item){
    return String(item?.tanggal || item?.activity_date || "").slice(0, 10);
}

function hasClockValue(value){
    return value != null && String(value).trim() !== "";
}

function statusBadge(item){
    const raw = String(item?.status || "").trim().toUpperCase();
    const late = Number(item?.terlambat_menit) > 0;

    if(raw === "I" || raw === "IZIN") return { key: "izin", label: "IZIN" };
    if(raw === "L" || raw === "LIBUR" || raw === "OFF" || raw === "O") return { key: "libur", label: "LIBUR" };
    if(raw === "S" || raw === "SAKIT") return { key: "sakit", label: "SAKIT" };
    if(late || raw === "TERLAMBAT" || raw === "T") return { key: "terlambat", label: "TERLAMBAT" };
    if(hasClockValue(item?.jam_pulang) || raw === "PULANG") return { key: "pulang", label: "PULANG" };
    if(hasClockValue(item?.jam_masuk) || raw === "H" || raw === "HADIR" || raw === "MASUK"){
        return { key: "masuk", label: "MASUK" };
    }
    return { key: "empty", label: raw || "—" };
}

function normalizeHistory(rows){
    return (Array.isArray(rows) ? rows : []).map((item) => {
        const terlambat = Number(item?.terlambat_menit);
        return {
            tanggal: historyTanggal(item),
            cabang: cabangName(item),
            jam_masuk: item?.jam_masuk ?? item?.jamMasuk ?? "",
            jam_pulang: item?.jam_pulang ?? item?.jamPulang ?? "",
            status: item?.status || item?.status_absensi || "—",
            terlambat_menit: Number.isFinite(terlambat) ? terlambat : 0,
            denda: Number(item?.denda || 0),
            keterangan: String(item?.keterangan || item?.catatan || "").trim()
        };
    });
}

function syncDateFieldState(input){
    const field = document.getElementById("dateField");
    if(!field) return;
    field.classList.toggle("has-value", Boolean(input?.value));
}

function openNativeDatePicker(input){
    if(!input) return;
    try{
        if(typeof input.showPicker === "function"){
            input.showPicker();
            return;
        }
    }catch(_err){}
    input.focus();
}

function setRiwayatMeta(text){
    setText("riwayatMeta", text);
}

function renderRiwayat(data){
    const list = document.getElementById("listRiwayat");
    if(!list) return;

    const rows = Array.isArray(data) ? data : [];
    const filtered = Boolean(document.getElementById("filterTanggal")?.value);

    if(rows.length === 0){
        setRiwayatMeta(filtered ? "Tidak ada catatan untuk tanggal ini" : "Belum ada riwayat absensi");
        list.innerHTML = `
            <div class="riwayat-empty">
                <i class="fas fa-clock-rotate-left"></i>
                <strong>Belum ada riwayat</strong>
                <span>${filtered ? "Coba tanggal lain atau tekan Reset." : "Absensi bulan ini akan muncul di sini."}</span>
            </div>`;
        return;
    }

    setRiwayatMeta(
        filtered
            ? `${rows.length} catatan · ${formatTanggalId(rows[0].tanggal)}`
            : `${rows.length} catatan bulan ini`
    );

    list.innerHTML = rows.map((item) => {
        const badge = statusBadge(item);
        const notes = [];
        if(Number(item.terlambat_menit) > 0){
            notes.push(`Terlambat ${escapeHtml(String(item.terlambat_menit))} menit`);
        }
        if(Number(item.denda) > 0){
            notes.push(`Denda ${escapeHtml(formatRupiahId(item.denda))}`);
        }
        const noteHtml = notes.length
            ? `<div class="riwayat-note">${notes.join(" · ")}</div>`
            : "";
        const ketHtml = item.keterangan
            ? `<div class="riwayat-ket">${escapeHtml(item.keterangan)}</div>`
            : "";

        return `
            <article class="riwayat-item">
                <div class="riwayat-item-head">
                    <div>
                        <time datetime="${escapeHtml(item.tanggal || "")}">${escapeHtml(formatTanggalId(item.tanggal))}</time>
                        <small>${escapeHtml(item.cabang || "—")}</small>
                    </div>
                    <span class="badge badge-${badge.key}">${escapeHtml(badge.label)}</span>
                </div>
                <div class="riwayat-times">
                    <div>
                        <span>Masuk</span>
                        <strong>${escapeHtml(formatJam(item.jam_masuk))}</strong>
                    </div>
                    <div>
                        <span>Pulang</span>
                        <strong>${escapeHtml(formatJam(item.jam_pulang))}</strong>
                    </div>
                </div>
                ${noteHtml}
                ${ketHtml}
            </article>`;
    }).join("");
}

function jalankanFilter(){
    const inputTanggal = document.getElementById("filterTanggal");
    const tanggal = inputTanggal?.value || "";
    syncDateFieldState(inputTanggal);
    const hasil = semuaRiwayat.filter((item) => !tanggal || item.tanggal === tanggal);
    renderRiwayat(hasil);
}

async function loadRiwayat(){
    const token = (typeof KaryawanSession !== "undefined" && KaryawanSession.getToken)
        ? KaryawanSession.getToken()
        : "";

    if(!token){
        console.error("Riwayat: session token tidak ada.");
        semuaRiwayat = [];
        renderRiwayat([]);
        return;
    }

    try{
        const { data, error } = await db.rpc("karyawan_absensi_bulan_self", {
            p_token: token,
            p_month: monthWibFirstIso()
        });

        if(error){
            console.error("Riwayat gagal (karyawan_absensi_bulan_self):", error);
            semuaRiwayat = [];
            renderRiwayat([]);
            return;
        }

        const payload = unwrapRpcPayload(data);
        if(!payload || payload.ok === false){
            const reason = String(payload?.reason || "SESSION_INVALID");
            console.error("Riwayat ditolak:", reason);
            if(handleSelfReadSession(reason)) return;
            semuaRiwayat = [];
            renderRiwayat([]);
            return;
        }

        const history = payload.history || payload.riwayat || payload.rows || [];
        semuaRiwayat = normalizeHistory(history);
        jalankanFilter();
    }catch(err){
        console.error("Riwayat error:", err);
        semuaRiwayat = [];
        renderRiwayat([]);
    }
}

function bindDateFilter(){
    const inputTanggal = document.getElementById("filterTanggal");
    const dateField = document.getElementById("dateField");
    const btnReset = document.getElementById("resetFilter");
    if(!inputTanggal) return;

    syncDateFieldState(inputTanggal);
    inputTanggal.addEventListener("change", jalankanFilter);
    inputTanggal.addEventListener("input", () => syncDateFieldState(inputTanggal));
    inputTanggal.addEventListener("click", () => openNativeDatePicker(inputTanggal));
    inputTanggal.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " "){
            e.preventDefault();
            openNativeDatePicker(inputTanggal);
        }
    });

    dateField?.addEventListener("click", (e) => {
        if(e.target === inputTanggal) return;
        openNativeDatePicker(inputTanggal);
    });

    btnReset?.addEventListener("click", () => {
        inputTanggal.value = "";
        syncDateFieldState(inputTanggal);
        renderRiwayat(semuaRiwayat);
        setRiwayatMeta(
            semuaRiwayat.length
                ? `${semuaRiwayat.length} catatan bulan ini`
                : "Belum ada riwayat absensi"
        );
    });
}

async function initRiwayat(){
    const karyawan = await KaryawanSession.requirePage();
    if(!karyawan) return;

    setText("namaRiwayat", karyawan.nama_karyawan || "");
    bindDateFilter();
    await loadRiwayat();
}

initRiwayat();
