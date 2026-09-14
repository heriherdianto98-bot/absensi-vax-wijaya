/*======================================
VAX WIJAYA
Dashboard Karyawan — MASTER
Session: karyawan-session.js (canonical)
======================================*/

let ID_KARYAWAN = null;

const PROFILE_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='32' fill='%23111111'/%3E%3Ccircle cx='32' cy='24' r='10' fill='%23d4a017'/%3E%3Cpath d='M14 56c2.4-12 12.2-18 18-18s15.6 6 18 18' fill='%23d4a017'/%3E%3C/svg%3E";

function applyFoto(url){
    const foto = document.getElementById("fotoKaryawan");
    if(!foto) return;

    const src = String(url || "").trim();
    if(!src){
        foto.src = PROFILE_PLACEHOLDER;
        return;
    }

    foto.onerror = function(){
        foto.onerror = null;
        foto.src = PROFILE_PLACEHOLDER;
    };
    foto.src = src;
}

function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
}

function normalizeJabatan(jabatan){
    return String(jabatan || "")
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

function isKasirJabatan(jabatan){
    const key = normalizeJabatan(jabatan);
    return key === "kasir" || key.includes("kasir");
}

function renderHomeKpiByJabatan(jabatan){
    const key = normalizeJabatan(jabatan);
    const role = isKasirJabatan(jabatan) ? "kasir" : (key ? "capster" : "pending");
    const card = document.getElementById("kpiHariIni");
    const capster = document.getElementById("kpiCapster");
    const kasir = document.getElementById("kpiKasir");

    document.documentElement.dataset.homeKpi = role;

    if(capster) capster.hidden = role !== "capster";
    if(kasir) kasir.hidden = role !== "kasir";
    if(card) card.dataset.kpiRole = role;
}

function formatRupiahId(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return "Rp0";
    return "Rp" + n.toLocaleString("id-ID");
}

function formatCustomerCount(value){
    const n = Number(value);
    return String(Number.isFinite(n) ? Math.round(n) : 0);
}

function escapeHtml(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function serviceDetailName(item){
    return String(item?.name || item?.service_package || "").replace(/\s+/g, " ").trim();
}

function displayServiceName(raw){
    const stripped = String(raw || "").replace(/\s+/g, " ").trim().replace(/^paket\s+/i, "").trim();
    const text = stripped || String(raw || "").replace(/\s+/g, " ").trim();
    return text.replace(/\S+/g, (word) => {
        if (/[A-Z]/.test(word) && word === word.toUpperCase()) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

function renderServiceDetail(items){
    const el = document.getElementById("todayService");
    if(!el) return;
    const list = Array.isArray(items) ? items.filter((x) => serviceDetailName(x)) : [];
    el.className = "service-detail-list";
    el.removeAttribute("data-count");
    el.removeAttribute("data-size");

    if(!list.length){
        el.innerHTML = `<span class="service-detail-empty">Belum ada service</span>`;
        return;
    }

    const size = list.length <= 2 ? "lg" : list.length <= 4 ? "md" : "sm";
    el.dataset.count = String(list.length);
    el.dataset.size = size;
    el.innerHTML = list.map((item) => {
        const qty = Number(item.qty);
        const n = Number.isFinite(qty) ? Math.round(qty) : 0;
        return `<span class="service-detail-item">${escapeHtml(displayServiceName(serviceDetailName(item)))} × ${n}</span>`;
    }).join("");
}

function setCapsterKpiText(customer, service, share, payable){
    setText("todayCustomer", customer);
    if(typeof service === "object"){
        renderServiceDetail(service);
    }else{
        const el = document.getElementById("todayService");
        if(el){
            el.className = "service-detail-list";
            el.removeAttribute("data-count");
            el.removeAttribute("data-size");
            el.textContent = service;
        }
    }
    setText("todayShare", share);
    setText("todayPayable", payable);
}

async function loadCapsterKpiHariIni(){
    if(document.documentElement.dataset.homeKpi !== "capster") return;

    setCapsterKpiText("…", "…", "…", "—");

    const token = (typeof KaryawanSession !== "undefined" && KaryawanSession.getToken)
        ? KaryawanSession.getToken()
        : "";

    if(!token){
        console.error("KPI Capster hari ini: session token tidak ada.");
        setCapsterKpiText("—", "—", "—", "—");
        return;
    }

    try{
        const { data, error } = await db.rpc("karyawan_kpi_harian_self", {
            p_token: token,
            p_date: todayWibIso()
        });

        if(error){
            console.error("KPI Capster hari ini gagal (karyawan_kpi_harian_self):", error);
            setCapsterKpiText("—", "—", "—", "—");
            return;
        }

        const payload = data && typeof data === "object" && !Array.isArray(data)
            ? data
            : (Array.isArray(data) ? data[0] : null);

        if(!payload || payload.ok === false){
            const reason = String(payload?.reason || "SESSION_INVALID");
            console.error("KPI Capster hari ini ditolak:", reason);
            setCapsterKpiText("—", "—", "—", "—");
            return;
        }

        const customer = Number(payload.customer);
        const share = Number(payload.share_bruto);
        const detail = Array.isArray(payload.service_detail) ? payload.service_detail : [];
        setCapsterKpiText(
            formatCustomerCount(Number.isFinite(customer) ? customer : 0),
            detail,
            formatRupiahId(Number.isFinite(share) ? share : 0),
            "—"
        );
    }catch(err){
        console.error("KPI Capster hari ini error:", err);
        setCapsterKpiText("—", "—", "—", "—");
    }
}

async function loadKaryawan(data){
    setText("namaKaryawan", data.nama_karyawan || data.nama || "-");
    setText("jabatanKaryawan", data.jabatan || "");
    renderHomeKpiByJabatan(data.jabatan);

    applyFoto(data.foto);

    if(!data.cabang_id){
        setText("cabangKaryawan", "");
        return;
    }

    const { data: cabang } = await db
        .from("cabang")
        .select("nama_cabang")
        .eq("id", data.cabang_id)
        .maybeSingle();

    setText("cabangKaryawan", cabang?.nama_cabang || "");
}

function greeting(){
    const jam = new Date().getHours();
    let title = "";
    let pesan = "";

    if(jam >= 5 && jam < 11){
        title = "Selamat Pagi,";
        pesan = "Semoga hari ini penuh semangat.";
    }else if(jam >= 11 && jam < 15){
        title = "Selamat Siang,";
        pesan = "Tetap semangat melayani pelanggan.";
    }else if(jam >= 15 && jam < 18){
        title = "Selamat Sore,";
        pesan = "Semoga target hari ini tercapai.";
    }else{
        title = "Selamat Malam,";
        pesan = "Terima kasih atas kerja keras hari ini.";
    }

    setText("greetingTitle", title);
    setText("greetingMessage", pesan);
}

function formatJam(value){
    if(!value) return "—";
    const raw = String(value);
    const m = raw.match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : raw;
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

async function loadTutupOperasional(cabangId){
    const banner = document.getElementById("tutupOperasionalBanner");
    const btn = document.getElementById("btnAbsen");
    if(!cabangId || typeof db === "undefined"){
        if(banner) banner.hidden = true;
        return false;
    }
    try{
        const { data, error } = await db.rpc("check_cabang_tutup", {
            p_cabang_id: Number(cabangId),
            p_tanggal: todayWibIso()
        });
        if(error || !data || data.tutup !== true){
            if(banner) banner.hidden = true;
            if(btn) btn.hidden = false;
            return false;
        }
        const jenis = String(data.jenis || "LN").toUpperCase();
        const label = data.label || (jenis === "LK" ? "LIBUR KHUSUS PERUSAHAAN" : "LIBUR NASIONAL");
        const cabang = data.cabang || "Cabang Anda";
        if(document.getElementById("tutupOpsJenis")) document.getElementById("tutupOpsJenis").textContent = label;
        if(document.getElementById("tutupOpsJudul")) document.getElementById("tutupOpsJudul").textContent = data.judul || label;
        if(document.getElementById("tutupOpsTeks")){
            document.getElementById("tutupOpsTeks").textContent =
                `${cabang} tutup operasional hari ini. Anda tidak perlu melakukan absensi.`;
        }
        if(banner) banner.hidden = false;
        if(btn) btn.hidden = true;
        setText("statusAbsen", label);
        setText("statusAbsenKasir", label);
        return true;
    }catch(_e){
        if(banner) banner.hidden = true;
        return false;
    }
}

async function loadStatusHariIni(){
    if(!ID_KARYAWAN) return;

    const today = todayWibIso();
    const tanggal = today;

    const { data, error } = await db
        .from("absensi")
        .select("status,jam_masuk,jam_pulang")
        .eq("karyawan_id", ID_KARYAWAN)
        .eq("tanggal", tanggal)
        .maybeSingle();

    if(error || !data){
        setText("statusAbsen", "BELUM ABSEN");
        setText("statusAbsenKasir", "BELUM ABSEN");
        setText("jamMasuk", "—");
        setText("jamPulang", "—");
        return;
    }

    const status = String(data.status || "SUDAH ABSEN").toUpperCase();
    setText("statusAbsen", status);
    setText("statusAbsenKasir", status);
    setText("jamMasuk", formatJam(data.jam_masuk));
    setText("jamPulang", formatJam(data.jam_pulang));
}

function renderRingkasanFromSummary(summary){
    const src = summary && typeof summary === "object" ? summary : {};
    const masuk = Number(src.masuk);
    const libur = Number(src.libur);
    const terlambat = Number(src.terlambat);
    const izin = Number(src.izin);
    const sakit = Number(src.sakit);
    const denda = Number(src.denda);
    const dendaText = formatRupiahId(Number.isFinite(denda) ? denda : 0);

    setText("totalMasuk", Number.isFinite(masuk) ? String(masuk) : "0");
    setText("totalMasukKasir", Number.isFinite(masuk) ? String(masuk) : "0");
    setText("totalLibur", Number.isFinite(libur) ? String(libur) : "0");
    setText("totalTerlambat", Number.isFinite(terlambat) ? String(terlambat) : "0");
    setText("totalIzin", Number.isFinite(izin) ? String(izin) : "0");
    setText("totalSakit", Number.isFinite(sakit) ? String(sakit) : "0");
    setText("totalDenda", dendaText);
    setText("totalDendaKasir", dendaText);
}

async function loadRingkasan(){
    const token = (typeof KaryawanSession !== "undefined" && KaryawanSession.getToken)
        ? KaryawanSession.getToken()
        : "";

    if(!token){
        console.error("Ringkasan bulan ini: session token tidak ada.");
        renderRingkasanFromSummary(null);
        return;
    }

    try{
        const { data, error } = await db.rpc("karyawan_absensi_bulan_self", {
            p_token: token,
            p_month: monthWibFirstIso()
        });

        if(error){
            console.error("Ringkasan bulan ini gagal (karyawan_absensi_bulan_self):", error);
            renderRingkasanFromSummary(null);
            return;
        }

        const payload = unwrapRpcPayload(data);
        if(!payload || payload.ok === false){
            const reason = String(payload?.reason || "SESSION_INVALID");
            console.error("Ringkasan bulan ini ditolak:", reason);
            if(handleSelfReadSession(reason)) return;
            renderRingkasanFromSummary(null);
            return;
        }

        renderRingkasanFromSummary(payload.summary || payload);
    }catch(err){
        console.error("Ringkasan bulan ini error:", err);
        renderRingkasanFromSummary(null);
    }
}

function bindAbsenButton(){
    const btn = document.getElementById("btnAbsen");
    if(!btn) return;
    btn.onclick = function(){
        window.location.href = "absensi.html";
    };
}

function openPengumumanPage(){
    window.location.href = "pengumuman.html";
}

function bindPengumumanCard(){
    const card = document.getElementById("cardPengumuman");
    if(!card) return;
    card.addEventListener("click", openPengumumanPage);
    card.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " "){
            e.preventDefault();
            openPengumumanPage();
        }
    });
}

function normalizePrioritas(value){
    const key = String(value || "")
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if(key === "sangat_penting" || key === "sangatpenting" || key === "urgent" || key === "critical"){
        return "sangat_penting";
    }
    if(key === "penting" || key === "important" || key === "high"){
        return "penting";
    }
    return "normal";
}

function unreadCountFromPayload(payload){
    if(payload == null) return 0;
    if(typeof payload === "number") return Number.isFinite(payload) ? Math.max(0, payload) : 0;
    const raw = payload.unread_count ?? payload.unread ?? payload.count ?? payload.total_unread ?? payload.belum_dibaca;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function unreadHasPenting(payload, items){
    const src = payload && typeof payload === "object" ? payload : {};
    const maxPri = normalizePrioritas(
        src.max_prioritas || src.prioritas || src.highest_priority || src.unread_prioritas
    );
    if(maxPri === "penting" || maxPri === "sangat_penting") return true;

    const pentingN = Number(src.unread_penting ?? src.penting ?? src.unread_important ?? 0);
    const sangatN = Number(src.unread_sangat_penting ?? src.sangat_penting ?? src.unread_urgent ?? 0);
    if((Number.isFinite(pentingN) && pentingN > 0) || (Number.isFinite(sangatN) && sangatN > 0)){
        return true;
    }
    if(src.has_penting === true || src.has_important === true || src.has_urgent === true){
        return true;
    }

    const list = Array.isArray(items) ? items : [];
    return list.some((row) => {
        const unread = row?.sudah_dibaca === false || row?.dibaca === false || row?.is_read === false || row?.read === false
            || row?.unread === true || row?.belum_dibaca === true;
        if(!unread && row?.sudah_dibaca !== false && row?.is_read !== false) return false;
        const pri = normalizePrioritas(row?.prioritas || row?.priority);
        return pri === "penting" || pri === "sangat_penting";
    });
}

function renderPengumumanCard(unread, hasPenting){
    const card = document.getElementById("cardPengumuman");
    const badge = document.getElementById("pengumumanBadge");
    const preview = document.getElementById("pengumumanPreview");
    const n = Number(unread) || 0;

    if(preview){
        preview.textContent = n > 0
            ? (n === 1 ? "1 pengumuman belum dibaca." : `${n} pengumuman belum dibaca.`)
            : "Tidak ada pengumuman baru.";
    }

    if(badge){
        if(n > 0){
            badge.hidden = false;
            badge.textContent = n > 99 ? "99+" : String(n);
        }else{
            badge.hidden = true;
            badge.textContent = "0";
        }
    }

    if(card){
        card.classList.toggle("is-unread", n > 0);
        card.classList.toggle("is-urgent", n > 0 && hasPenting === true);
    }
}

async function loadPengumumanCard(){
    const token = (typeof KaryawanSession !== "undefined" && KaryawanSession.getToken)
        ? KaryawanSession.getToken()
        : "";

    if(!token){
        renderPengumumanCard(0, false);
        return;
    }

    try{
        const { data, error } = await db.rpc("karyawan_pengumuman_unread_count_self", {
            p_token: token
        });

        if(error){
            console.error("Pengumuman unread gagal:", error);
            renderPengumumanCard(0, false);
            return;
        }

        const payload = unwrapRpcPayload(data);
        if(payload && payload.ok === false){
            const reason = String(payload.reason || "SESSION_INVALID");
            console.error("Pengumuman unread ditolak:", reason);
            if(handleSelfReadSession(reason)) return;
            renderPengumumanCard(0, false);
            return;
        }

        const unread = unreadCountFromPayload(payload ?? data);
        let hasPenting = unreadHasPenting(payload, null);

        if(unread > 0 && !hasPenting){
            try{
                const listRes = await db.rpc("karyawan_pengumuman_list_self", {
                    p_token: token,
                    p_limit: 8
                });
                const listPayload = unwrapRpcPayload(listRes.data);
                const rows = Array.isArray(listRes.data)
                    ? listRes.data
                    : (listPayload?.items || listPayload?.data || listPayload?.rows || listPayload?.list || []);
                hasPenting = unreadHasPenting(listPayload, Array.isArray(rows) ? rows : []);
            }catch(_e){ /* count tetap ditampilkan */ }
        }

        renderPengumumanCard(unread, hasPenting);
    }catch(err){
        console.error("Pengumuman unread error:", err);
        renderPengumumanCard(0, false);
    }
}

async function initDashboardKaryawan(){
    const karyawan = await KaryawanSession.requirePage();
    if(!karyawan) return;

    ID_KARYAWAN = Number(karyawan.id);

    greeting();
    bindAbsenButton();
    bindPengumumanCard();
    await loadKaryawan(karyawan);
    const tutup = await loadTutupOperasional(karyawan.cabang_id);
    const loadAbsenStatus = !tutup && document.documentElement.dataset.homeKpi === "kasir";
    await Promise.all([
        loadAbsenStatus ? loadStatusHariIni() : Promise.resolve(),
        loadRingkasan(),
        loadCapsterKpiHariIni(),
        loadPengumumanCard()
    ]);
}

renderHomeKpiByJabatan(localStorage.getItem("jabatan"));
initDashboardKaryawan();
