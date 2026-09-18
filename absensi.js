/* =====================================
   VAX WIJAYA ABSENSI
   SESSION CANONICAL + GPS EXISTING
   Absen Masuk / Absen Pulang + anti-double
===================================== */

let ID_KARYAWAN = null;
let dataKaryawanAktif = null;
let cabangOperasional = [];
let cabangTerdekat = null;
let posisiTerakhir = null;
let gpsTimer = null;
let gpsSiapAbsen = false;
let absensiHariIni = null;
let pengaturanAbsensi = null;
let absenBusy = false;


/* =====================================
   WAKTU
===================================== */

function updateJam(){

    const sekarang = new Date();

    const jam = String(sekarang.getHours()).padStart(2,"0");
    const menit = String(sekarang.getMinutes()).padStart(2,"0");
    const detik = String(sekarang.getSeconds()).padStart(2,"0");

    const elJam = document.getElementById("jam");
    if(elJam){
        elJam.textContent = `${jam}:${menit}:${detik}`;
    }

    const hari = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu"
    ];

    const bulan = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember"
    ];

    const elTanggal = document.getElementById("tanggal");
    if(elTanggal){
        elTanggal.textContent =
            `${hari[sekarang.getDay()]}, ${sekarang.getDate()} ${bulan[sekarang.getMonth()]} ${sekarang.getFullYear()}`;
    }

}

setInterval(updateJam,1000);
updateJam();


/* =====================================
   GREETING
===================================== */

function greeting(){

    const h = new Date().getHours();

    let title="";
    let emoji="";
    let pesan="";

    if(h>=5 && h<11){
        title="Selamat Pagi";
        emoji="🌞";
        pesan="Semoga hari ini penuh semangat.";
    }
    else if(h>=11 && h<15){
        title="Selamat Siang";
        emoji="☀️";
        pesan="Tetap semangat melayani pelanggan.";
    }
    else if(h>=15 && h<18){
        title="Selamat Sore";
        emoji="🌤️";
        pesan="Jangan lupa tetap tersenyum.";
    }
    else{
        title="Selamat Malam";
        emoji="🌙";
        pesan="Semoga pekerjaan hari ini lancar.";
    }

    const titleEl = document.getElementById("greetingTitle");
    const messageEl = document.getElementById("greetingMessage");
    const emojiEl = document.getElementById("emojiGreeting");

    if(titleEl) titleEl.textContent = title;
    if(messageEl) messageEl.textContent = pesan;
    if(emojiEl) emojiEl.textContent = emoji;

}

greeting();


/* =====================================
   UTIL
===================================== */

function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
}

function setInfo(message){
    setText("infoAbsen", message);
}

function setRadiusLabel(radius){
    const nilai = Number(radius);
    if(!Number.isFinite(nilai) || nilai <= 0){
        setText("radiusInfo", "Radius maksimal - meter");
        return;
    }
    setText("radiusInfo", `Radius maksimal ${nilai} meter`);
}

function setStatusLokasi(message, ok = null){

    const el = document.getElementById("statusLokasi");
    if(!el) return;

    el.textContent = message;

    if(ok === true){
        el.style.color = "#3ff2a0";
    }else if(ok === false){
        el.style.color = "#ff4d55";
    }else{
        el.style.color = "";
    }

}

function normalizeName(value){
    return String(value || "")
        .trim()
        .toLowerCase();
}

function isFloating(cabang){
    const nama = normalizeName(cabang?.nama_cabang);
    const kode = normalizeName(cabang?.kode_cabang);

    return (
        nama.includes("floating") ||
        kode === "floating" ||
        kode === "flt"
    );
}


/* =====================================
   HITUNG JARAK HAVERSINE
===================================== */

function hitungJarak(lat1, lon1, lat2, lon2){

    const R = 6371000;

    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;

    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1*Math.PI/180) *
        Math.cos(lat2*Math.PI/180) *
        Math.sin(dLon/2) *
        Math.sin(dLon/2);

    const c = 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));

    return R * c;

}


/* =====================================
   LOAD KARYAWAN
===================================== */

async function loadKaryawan(data){

    dataKaryawanAktif = data;
    ID_KARYAWAN = Number(data.id);

    setText("namaKaryawan", data.nama_karyawan || "-");
    setText("jabatan", data.jabatan || "-");
    setText(
        "statusKaryawan",
        data.aktif === false ? "Karyawan Tidak Aktif" : "Karyawan Aktif"
    );

    const foto = document.getElementById("fotoKaryawan");
    if(foto && data.foto){
        foto.src = data.foto;
    }

    return true;

}


/* =====================================
   LOAD MASTER CABANG OPERASIONAL
===================================== */

async function loadCabangOperasional(){

    const { data, error } = await db
        .from("cabang")
        .select("id,nama_cabang,kode_cabang,latitude,longitude,radius_meter,aktif,urutan")
        .eq("aktif", true)
        .order("urutan", { ascending: true });

    if(error){
        console.error("Gagal memuat master cabang:", error);
        setStatusLokasi("Master cabang gagal dimuat.", false);
        setInfo("Coba muat ulang halaman.");
        return false;
    }

    cabangOperasional = (data || []).filter((item) => {

        if(isFloating(item)) return false;

        const lat = Number(item.latitude);
        const lng = Number(item.longitude);
        const radius = Number(item.radius_meter);

        return (
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            Number.isFinite(radius) &&
            radius > 0
        );

    });

    if(cabangOperasional.length === 0){
        setStatusLokasi("Master geofence belum tersedia.", false);
        setInfo("Koordinat cabang operasional belum valid.");
        return false;
    }

    const cabangAsal = cabangOperasional.find((item) =>
        Number(item.id) === Number(dataKaryawanAktif?.cabang_id)
    );

    if(cabangAsal){
        setText("kodeCabang", cabangAsal.nama_cabang || "-");
        setRadiusLabel(cabangAsal.radius_meter);
    }

    return true;

}


/* =====================================
   CARI CABANG AKTUAL TERDEKAT
===================================== */

function cariCabangTerdekat(lat, lng){

    let hasil = null;

    cabangOperasional.forEach((cabang) => {

        const jarak = hitungJarak(
            lat,
            lng,
            Number(cabang.latitude),
            Number(cabang.longitude)
        );

        if(!hasil || jarak < hasil.jarak){
            hasil = {
                ...cabang,
                jarak
            };
        }

    });

    return hasil;

}


/* =====================================
   RENDER HASIL GPS READ ONLY
===================================== */

function renderHasilGps(pos){

    const lat = Number(pos.coords.latitude);
    const lng = Number(pos.coords.longitude);
    const accuracy = Number(pos.coords.accuracy || 0);

    posisiTerakhir = {
        latitude: lat,
        longitude: lng,
        accuracy
    };

    const terdekat = cariCabangTerdekat(lat, lng);

    if(!terdekat){
        cabangTerdekat = null;
        gpsSiapAbsen = false;
        setStatusLokasi("Cabang tidak terdeteksi.", false);
        setText("jarak", "-");
        setInfo("Tidak ada master cabang operasional yang valid.");
        sinkronTombolAbsen();
        return;
    }

    cabangTerdekat = terdekat;

    const radius = Number(terdekat.radius_meter);
    const dalamRadius = Number.isFinite(radius) && radius > 0
        ? terdekat.jarak <= radius
        : false;

    setText("namaCabang", String(terdekat.nama_cabang || "-").toUpperCase());
    setText("kodeCabang", terdekat.nama_cabang || "-");
    setText("jarak", `${Math.round(terdekat.jarak)} Meter`);
    setRadiusLabel(radius);

    if(accuracy > 100){
        gpsSiapAbsen = false;
        setStatusLokasi("🟠 Akurasi GPS terlalu rendah", false);
        setInfo(
            `Akurasi GPS ±${Math.round(accuracy)} m. Tunggu GPS lebih akurat sebelum absensi.`
        );
        sinkronTombolAbsen();
        return;
    }

    if(dalamRadius){
        gpsSiapAbsen = true;
        setStatusLokasi("🟢 Dalam Radius", true);
        const mode = modeAbsenHariIni();
        if(mode === "done"){
            setInfo("Absensi hari ini sudah selesai.");
        }else if(mode === "pulang"){
            setInfo(
                `Absen masuk tercatat. Siap Absen Pulang di ${terdekat.nama_cabang}.`
            );
        }else{
            setInfo(
                `Lokasi terdeteksi di ${terdekat.nama_cabang}. GPS valid untuk absensi.`
            );
        }
    }else{
        gpsSiapAbsen = false;
        setStatusLokasi("🔴 Di luar Radius", false);
        setInfo(
            `Cabang terdekat: ${terdekat.nama_cabang}. Dekati lokasi cabang hingga maksimal ${radius} meter.`
        );
    }

    sinkronTombolAbsen();

}


/* =====================================
   GPS READ ONLY
===================================== */

function cekLokasi(){

    if(!navigator.geolocation){
        gpsSiapAbsen = false;
        setStatusLokasi("Browser tidak mendukung GPS.", false);
        setInfo("Gunakan perangkat/browser yang mendukung lokasi.");
        sinkronTombolAbsen();
        return;
    }

    if(cabangOperasional.length === 0){
        return;
    }

    setStatusLokasi("Mendeteksi lokasi...", null);

    navigator.geolocation.getCurrentPosition(

        renderHasilGps,

        function(error){

            console.error("GPS error:", error);

            let pesan = "GPS tidak dapat digunakan.";

            if(error?.code === 1){
                pesan = "GPS tidak diizinkan.";
            }
            else if(error?.code === 2){
                pesan = "Lokasi tidak tersedia.";
            }
            else if(error?.code === 3){
                pesan = "GPS timeout. Mencoba lagi...";
            }

            setStatusLokasi(pesan, false);
            setText("jarak", "-");
            setInfo("Aktifkan GPS dan izinkan akses lokasi untuk melakukan absensi.");
            gpsSiapAbsen = false;
            sinkronTombolAbsen();

        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }

    );

}


/* =====================================
   WAKTU LOKAL WIB + ATURAN TERLAMBAT EXISTING
   jam_masuk + toleransi = batas (default 10:15)
   denda = tarif per menit (default Rp1.000)
===================================== */

function nowWib(){
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).formatToParts(new Date());

    const ambil = (type) => parts.find((item) => item.type === type)?.value || "";
    return {
        tanggal: `${ambil("year")}-${ambil("month")}-${ambil("day")}`,
        jam: `${ambil("hour")}:${ambil("minute")}:${ambil("second")}`
    };
}

function parseHm(value){
    const m = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
    if(!m) return null;
    return (Number(m[1]) * 60) + Number(m[2]);
}

function lateThresholdMinutes(){
    const jam = pengaturanAbsensi?.jam_masuk || "10:00";
    const tol = Number(pengaturanAbsensi?.toleransi_menit);
    const base = parseHm(jam);
    if(base == null) return parseHm("10:15");
    return base + (Number.isFinite(tol) ? tol : 15);
}

function lateMinutesOf(jamMasuk){
    const clock = parseHm(jamMasuk);
    if(clock == null) return 0;
    return Math.max(0, clock - lateThresholdMinutes());
}

function dendaOf(menit){
    if(menit <= 0) return 0;
    const tarif = Number(pengaturanAbsensi?.tarif_denda);
    const rate = Number.isFinite(tarif) && tarif > 0 ? tarif : 1000;
    const max = Number(pengaturanAbsensi?.max_denda || 0);
    const amt = menit * rate;
    return max > 0 ? Math.min(amt, max) : amt;
}

function hasTime(value){
    if(value == null) return false;
    const s = String(value).trim();
    if(!s || s === "-" || s.toLowerCase() === "null") return false;
    return /\d{1,2}:\d{2}/.test(s);
}

function modeAbsenHariIni(){
    if(absensiHariIni && hasTime(absensiHariIni.jam_masuk) && hasTime(absensiHariIni.jam_pulang)){
        return "done";
    }
    if(absensiHariIni && hasTime(absensiHariIni.jam_masuk)){
        return "pulang";
    }
    return "masuk";
}

function formatJamWib(value){
    if(!hasTime(value)) return "—";
    const m = String(value).match(/(\d{1,2}):(\d{2})/);
    if(!m) return "—";
    return `${m[1].padStart(2, "0")}:${m[2]} WIB`;
}

function renderJamHariIni(){
    setText("jamMasukHariIni", formatJamWib(absensiHariIni?.jam_masuk));
    setText("jamPulangHariIni", formatJamWib(absensiHariIni?.jam_pulang));
}


/* =====================================
   STATE TOMBOL ABSEN MASUK / PULANG
===================================== */

function sinkronTombolAbsen(){
    const slider = document.getElementById("slider");
    if(!slider) return;

    renderJamHariIni();

    const text = slider.querySelector(".slider-text");
    const icon = slider.querySelector("#thumb i");
    const mode = modeAbsenHariIni();
    const gpsOk = gpsSiapAbsen === true;
    const aktif = !absenBusy && mode !== "done" && gpsOk;

    slider.classList.toggle("is-done", mode === "done" && !absenBusy);

    if(absenBusy){
        if(text) text.textContent = "MENYIMPAN...";
        slider.style.opacity = "0.7";
        slider.style.pointerEvents = "none";
        slider.setAttribute("aria-disabled", "true");
        return;
    }

    if(mode === "done"){
        if(text) text.textContent = "ABSENSI HARI INI SELESAI";
        if(icon) icon.className = "fas fa-check";
        slider.style.opacity = "0.55";
        slider.style.pointerEvents = "none";
        slider.setAttribute("aria-disabled", "true");
        return;
    }

    if(mode === "pulang"){
        if(text) text.textContent = "Geser untuk Absen Pulang →";
        if(icon) icon.className = "fas fa-right-from-bracket";
    }else{
        if(text) text.textContent = "Geser untuk Absen Masuk →";
        if(icon) icon.className = "fas fa-fingerprint";
    }

    slider.style.opacity = aktif ? "1" : "0.55";
    slider.style.pointerEvents = "auto";
    slider.setAttribute("aria-disabled", aktif ? "false" : "true");
}

function gpsBolehAbsen(){
    if(!navigator.geolocation){
        setStatusLokasi("Browser tidak mendukung GPS.", false);
        setInfo("Gunakan perangkat/browser yang mendukung lokasi.");
        return false;
    }

    if(!posisiTerakhir || !cabangTerdekat){
        gpsSiapAbsen = false;
        setInfo("Aktifkan GPS dan izinkan akses lokasi untuk melakukan absensi.");
        sinkronTombolAbsen();
        return false;
    }

    const accuracy = Number(posisiTerakhir.accuracy || 0);
    if(accuracy > 100){
        gpsSiapAbsen = false;
        setStatusLokasi("🟠 Akurasi GPS terlalu rendah", false);
        setInfo(
            `Akurasi GPS ±${Math.round(accuracy)} m. Tunggu GPS lebih akurat sebelum absensi.`
        );
        sinkronTombolAbsen();
        return false;
    }

    const radius = Number(cabangTerdekat.radius_meter);
    const jarak = hitungJarak(
        posisiTerakhir.latitude,
        posisiTerakhir.longitude,
        Number(cabangTerdekat.latitude),
        Number(cabangTerdekat.longitude)
    );

    if(!(Number.isFinite(radius) && radius > 0 && jarak <= radius)){
        gpsSiapAbsen = false;
        setStatusLokasi("🔴 Di luar Radius", false);
        setInfo(
            `Cabang terdekat: ${cabangTerdekat.nama_cabang}. Dekati lokasi cabang hingga maksimal ${radius} meter.`
        );
        sinkronTombolAbsen();
        return false;
    }

    gpsSiapAbsen = true;
    return true;
}


/* =====================================
   LOAD PENGATURAN + RECORD HARI INI
===================================== */

async function loadPengaturanAbsensi(){
    try{
        const { data, error } = await db
            .from("pengaturan_absensi")
            .select("jam_masuk,toleransi_menit,tarif_denda,max_denda,aktif")
            .limit(1);

        if(error){
            pengaturanAbsensi = null;
            return;
        }

        const row = Array.isArray(data) ? data[0] : data;
        pengaturanAbsensi = row || null;
    }catch(_e){
        pengaturanAbsensi = null;
    }
}

async function loadAbsensiHariIni(){
    if(!ID_KARYAWAN){
        absensiHariIni = null;
        return null;
    }

    const { tanggal } = nowWib();

    const { data, error } = await db
        .from("absensi")
        .select("id,karyawan_id,cabang_id,tanggal,jam_masuk,jam_pulang,status,terlambat_menit,denda")
        .eq("karyawan_id", ID_KARYAWAN)
        .eq("tanggal", tanggal)
        .order("id", { ascending: true })
        .limit(1);

    if(error){
        console.error("Gagal memuat absensi hari ini:", error);
        return absensiHariIni;
    }

    absensiHariIni = (data && data[0]) || null;
    renderJamHariIni();
    return absensiHariIni;
}


/* =====================================
   ABSEN MASUK / ABSEN PULANG
===================================== */

async function simpanAbsenMasuk(){
    await simpanAbsenAman("MASUK");
}
async function simpanAbsenPulang(){
    await simpanAbsenAman("PULANG");
}
async function simpanAbsenAman(action){
    const token = (typeof KaryawanSession !== "undefined" && KaryawanSession.getToken)
        ? KaryawanSession.getToken() : "";
    if(!token){ setInfo("Sesi login tidak valid. Silakan login ulang."); return; }
    if(!gpsBolehAbsen()) return;
    const lokasi = { ...posisiTerakhir };
    try{
        const { data, error } = await db.rpc("karyawan_absen_secure", {
            p_token: token, p_action: action, p_lat: lokasi.latitude,
            p_lon: lokasi.longitude, p_accuracy: lokasi.accuracy
        });
        if(error || !data || data.ok !== true){
            const reason = String(error?.message || data?.reason || "Absensi gagal disimpan.");
            console.error("Absensi aman gagal:", reason);
            setInfo(reason);
            if(/SESSION_INVALID/.test(reason) && KaryawanSession.logout){
                await KaryawanSession.logout();
            }
            await loadAbsensiHariIni();
            sinkronTombolAbsen();
            return;
        }
        absensiHariIni = data;
        sinkronTombolAbsen();
        loadRingkasan();
        const jam = action === "MASUK" ? data.jam_masuk : data.jam_pulang;
        setInfo(action === "MASUK"
            ? `Absen masuk berhasil di ${data.nama_cabang} pukul ${jam}.`
            : `Absen pulang berhasil pukul ${jam}.`);
    }catch(err){
        console.error("Absensi aman error:", err);
        setInfo("Koneksi absensi gagal. Silakan coba kembali.");
        await loadAbsensiHariIni();
    }
}

function haptic(pattern){
    try{
        if(typeof navigator === "undefined") return;
        if(typeof navigator.vibrate !== "function") return;
        navigator.vibrate(pattern);
    }catch(_e){ /* device/browser tidak mendukung */ }
}

async function jalankanAbsenSetelahSwipe(){
    if(absenBusy) return false;

    const mode = modeAbsenHariIni();
    if(mode === "done"){
        setInfo("Absensi hari ini sudah selesai.");
        return false;
    }

    if(!gpsBolehAbsen()) return false;

    absenBusy = true;
    sinkronTombolAbsen();

    try{
        if(mode === "pulang"){
            await simpanAbsenPulang();
        }else{
            await simpanAbsenMasuk();
        }
    }finally{
        absenBusy = false;
        sinkronTombolAbsen();
    }

    return modeAbsenHariIni() !== mode;
}

function bindSwipeAbsen(){
    const slider = document.getElementById("slider");
    const thumb = document.getElementById("thumb");
    if(!slider || !thumb || slider.dataset.boundSwipe === "1") return;
    slider.dataset.boundSwipe = "1";

    let dragging = false;
    let startX = 0;
    let maxX = 0;
    let currentX = 0;
    let fired = false;

    function maxTravel(){
        return Math.max(0, slider.clientWidth - thumb.offsetWidth - 8);
    }

    function setX(x){
        currentX = Math.max(0, Math.min(maxX, x));
        thumb.style.transform = `translateX(${currentX}px)`;
    }

    function resetThumb(){
        thumb.style.transition = "transform .2s ease";
        maxX = maxTravel();
        setX(0);
        window.setTimeout(() => {
            if(!dragging) thumb.style.transition = "";
        }, 220);
    }

    function pointerX(event){
        if(event.touches && event.touches[0]) return event.touches[0].clientX;
        if(event.changedTouches && event.changedTouches[0]) return event.changedTouches[0].clientX;
        return event.clientX;
    }

    function onDown(event){
        if(absenBusy || modeAbsenHariIni() === "done") return;
        dragging = true;
        fired = false;
        maxX = maxTravel();
        startX = pointerX(event);
        currentX = 0;
        thumb.style.transition = "none";
        haptic(8);
        if(event.pointerId != null && slider.setPointerCapture){
            try{ slider.setPointerCapture(event.pointerId); }catch(_e){ /* ignore */ }
        }
        event.preventDefault();
    }

    function onMove(event){
        if(!dragging || fired) return;
        setX(pointerX(event) - startX);
        if(currentX >= maxX * 0.85){
            fired = true;
            dragging = false;
            completeSwipe();
        }
    }

    function onUp(){
        if(!dragging) return;
        dragging = false;
        if(!fired && currentX >= maxX * 0.85){
            fired = true;
            completeSwipe();
            return;
        }
        if(!fired) resetThumb();
    }

    async function completeSwipe(){
        haptic(18);
        thumb.style.transition = "transform .15s ease";
        setX(maxX);
        const sukses = await jalankanAbsenSetelahSwipe();
        if(sukses){
            haptic(32);
        }else{
            haptic([10, 40, 10]);
        }
        resetThumb();
    }

    slider.addEventListener("pointerdown", onDown);
    slider.addEventListener("pointermove", onMove);
    slider.addEventListener("pointerup", onUp);
    slider.addEventListener("pointercancel", onUp);
}


/* =====================================
   RINGKASAN BULAN INI
===================================== */

function rentangBulanBerjalan(){
    const { tanggal } = nowWib();
    const [tahun, bulan] = tanggal.split("-");
    const lastDay = new Date(Number(tahun), Number(bulan), 0).getDate();
    return {
        awal: `${tahun}-${bulan}-01`,
        akhir: `${tahun}-${bulan}-${String(lastDay).padStart(2, "0")}`
    };
}

function isoTanggal(value){
    const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
}

function kodeJadwal(row){
    const sc = String(row?.status_canonical || "").trim().toUpperCase();
    const st = String(row?.status || "").trim().toUpperCase();
    if(sc === "I" || st === "I" || st === "IZIN" || st.includes("IZIN")) return "I";
    if(sc === "S" || st === "S" || st === "SAKIT" || st.includes("SAKIT")) return "S";
    if(sc === "L" || st === "L" || st === "LIBUR" || st.includes("LIBUR")) return "L";
    if(sc === "O" || st === "O" || st === "OFF") return "L";
    return "";
}

function isTerlambatRecord(row){
    const st = String(row?.status || "").trim().toLowerCase();
    const sa = String(row?.status_absensi || "").trim().toUpperCase();
    return Number(row?.terlambat_menit || 0) > 0
        || sa === "T"
        || st === "terlambat"
        || st.includes("terlambat");
}

function dendaValidRecord(row){
    const s = String(row?.status_denda || "").trim().toLowerCase();
    if(/batal|cancel|void|dibatalkan/.test(s)) return 0;
    return Number(row?.denda || 0);
}

async function loadAbsensiBulanIni(awal, akhir){
    const selects = [
        "tanggal,jam_masuk,status,status_absensi,terlambat_menit,denda,status_denda",
        "tanggal,jam_masuk,status,terlambat_menit,denda",
        "tanggal,jam_masuk,status,denda"
    ];

    for(const cols of selects){
        const { data, error } = await db
            .from("absensi")
            .select(cols)
            .eq("karyawan_id", ID_KARYAWAN)
            .gte("tanggal", awal)
            .lte("tanggal", akhir);

        if(!error) return data || [];
        if(!/column|schema cache|does not exist/i.test(error.message || "")){
            console.error("Gagal memuat ringkasan absensi:", error);
            return [];
        }
    }

    return [];
}

async function loadJadwalBulanIni(awal, akhir){
    const selects = [
        "tanggal,status,status_canonical",
        "tanggal,status"
    ];

    for(const cols of selects){
        const { data, error } = await db
            .from("jadwal_libur")
            .select(cols)
            .eq("karyawan_id", ID_KARYAWAN)
            .gte("tanggal", awal)
            .lte("tanggal", akhir);

        if(!error) return data || [];
        if(!/column|schema cache|does not exist/i.test(error.message || "")){
            console.error("Gagal memuat jadwal_libur:", error);
            return [];
        }
    }

    return [];
}

async function loadRingkasan(){

    if(!ID_KARYAWAN) return;

    const { awal, akhir } = rentangBulanBerjalan();
    const [absensiRows, jadwalRows] = await Promise.all([
        loadAbsensiBulanIni(awal, akhir),
        loadJadwalBulanIni(awal, akhir)
    ]);

    const izinDates = new Set();
    const sakitDates = new Set();
    const liburDates = new Set();

    (jadwalRows || []).forEach((row) => {
        const iso = isoTanggal(row.tanggal);
        if(!iso) return;
        const kode = kodeJadwal(row);
        if(kode === "I") izinDates.add(iso);
        if(kode === "S") sakitDates.add(iso);
        if(kode === "L") liburDates.add(iso);
    });

    const masukDates = new Set();
    const terlambatDates = new Set();
    const dendaByDate = new Map();

    (absensiRows || []).forEach((row) => {
        const iso = isoTanggal(row.tanggal);
        if(!iso) return;

        const scheduled = izinDates.has(iso) || sakitDates.has(iso) || liburDates.has(iso);
        if(!scheduled && hasTime(row.jam_masuk)){
            masukDates.add(iso);
        }
        if(!scheduled && isTerlambatRecord(row)){
            terlambatDates.add(iso);
        }

        const denda = dendaValidRecord(row);
        if(denda > 0){
            dendaByDate.set(iso, (dendaByDate.get(iso) || 0) + denda);
        }
    });

    let totalDenda = 0;
    dendaByDate.forEach((nilai) => {
        totalDenda += nilai;
    });

    setText("hadir", masukDates.size);
    setText("terlambat", terlambatDates.size);
    setText("izin", izinDates.size);
    setText("sakit", sakitDates.size);
    setText("libur", liburDates.size);
    setText("denda", "Rp" + totalDenda.toLocaleString("id-ID"));

}


/* =====================================
   INIT
===================================== */

async function initAbsensiKaryawan(){

    bindSwipeAbsen();
    renderJamHariIni();
    sinkronTombolAbsen();

    const karyawan = await KaryawanSession.requirePage();
    if(!karyawan) return;

    const okKaryawan = await loadKaryawan(karyawan);
    if(!okKaryawan) return;

    const okCabang = await loadCabangOperasional();
    if(!okCabang) return;

    await loadPengaturanAbsensi();
    await loadAbsensiHariIni();
    sinkronTombolAbsen();
    loadRingkasan();
    cekLokasi();

    if(gpsTimer){
        clearInterval(gpsTimer);
    }

    gpsTimer = setInterval(cekLokasi, 10000);

}

initAbsensiKaryawan();


/* =====================================
   AKSES PENGAJUAN — ADDITIVE UI ONLY
   Tidak mengubah GPS / swipe / Masuk-Pulang / denda.
===================================== */
(function mountPengajuanIzinShortcut(){
    function mount(){
        if(document.getElementById("btnAjukanIzinLibur")) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "btnAjukanIzinLibur";
        btn.setAttribute("aria-label", "Ajukan Izin, Libur, atau Sakit");
        btn.innerHTML = '<i class="fas fa-file-signature" aria-hidden="true"></i><span>Ajukan Izin / Libur / Sakit</span>';

        Object.assign(btn.style, {
            position:"fixed",
            zIndex:"19",
            right:"max(14px, calc((100vw - 430px) / 2 + 14px))",
            bottom:"72px",
            minHeight:"42px",
            padding:"0 14px",
            display:"flex",
            alignItems:"center",
            gap:"8px",
            borderRadius:"22px",
            border:"1px solid rgba(255,224,102,.48)",
            background:"linear-gradient(180deg,#17130a,#0c0b08)",
            color:"#ffe066",
            fontSize:"11px",
            fontWeight:"800",
            boxShadow:"0 8px 22px rgba(0,0,0,.55),0 0 13px rgba(255,224,102,.12)",
            cursor:"pointer"
        });

        btn.addEventListener("click", function(){
            try{
                if(navigator.vibrate) navigator.vibrate(12);
            }catch(_e){}
            window.location.href = "izin.html";
        });

        document.body.appendChild(btn);
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", mount, { once:true });
    }else{
        mount();
    }
})();
