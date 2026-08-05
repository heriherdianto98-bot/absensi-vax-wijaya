
function hitungJarak(lat1, lon1, lat2, lon2) {
    const R = 6371000;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}
async function loadCabang() {

    const { data, error } = await db
        .from("cabang")
        .select("*")
        .order("nama_cabang")

    if (error) {
        console.log(error);
        return;
    }

    const select = document.getElementById("cabang");

    select.innerHTML = "";
    console.log("Jumlah data =", data.length);
    console.table(data);

    data.forEach(cabang => {

        const option = document.createElement("option");

        option.value = cabang.id;
        option.textContent = cabang.nama_cabang;

        select.appendChild(option);

    });
    loadKaryawan(select.value);

    select.addEventListener("change", () => {
        loadKaryawan(select.value);
    });
}

if (document.getElementById("cabang")) {
    loadCabang();
}
async function loadKaryawan(cabangId) {

    const { data, error } = await db
        .from("karyawan")
        .select("*")
        .eq("cabang_id", cabangId)
        .order("nama_karyawan");
    console.log("Cabang =", cabangId);
    console.log(data);

    if (error) {
        console.log(error);
        return;
    }

    const select = document.getElementById("karyawan");
    if (!select) return;
    select.innerHTML = "";

    data.forEach(karyawan => {

        const option = document.createElement("option");

        option.value = karyawan.id;
        option.textContent = karyawan.nama_karyawan;

        select.appendChild(option);

    });

}

const btnAbsen = document.getElementById("btnAbsen");

if (btnAbsen) {

    console.log("BTN =", btnAbsen);

    btnAbsen.addEventListener("click", async () => {
        console.log("TOMBOL DIKLIK");
        const karyawanId = document.getElementById("karyawan").value;
        const cabangId = document.getElementById("cabang").value;
        const pin = document.getElementById("pin").value;


        console.log("Karyawan :", karyawanId);
        console.log("Cabang :", cabangId);
        console.log("PIN :", pin);

        const { data: user, error } = await db
            .from("karyawan")
            .select("pin")
            .eq("id", karyawanId)
            .single();

        if (error) {
            alert("Karyawan tidak ditemukan");
            return;
        }

        if (pin !== user.pin) {
            alert("PIN salah!");
            return;
        }
        // CEK JADWAL KARYAWAN HARI INI
        const hariIni = new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Jakarta"
        });

const { data: dataJadwal, error: jadwalError } = await db
    .from("jadwal_libur")
    .select("status, keterangan, jam_masuk_khusus")
    .eq("karyawan_id", karyawanId)
    .eq("tanggal", hariIni)
    .order("id", { ascending: false })
    .limit(1);

if (jadwalError) {
    console.log("ERROR JADWAL:", jadwalError);
    alert("Gagal memeriksa jadwal karyawan.");
    return;
}

const jadwalHariIni = dataJadwal?.[0];

if (jadwalHariIni) {

    const statusJadwal =
        (jadwalHariIni.status || "").toUpperCase();

    if (
        statusJadwal === "LIBUR" ||
        statusJadwal === "IZIN" ||
        statusJadwal === "SAKIT"
    ) {
        alert(
            `Anda tidak dapat melakukan absensi.\n\n` +
            `Status hari ini: ${statusJadwal}\n` +
            `Keterangan: ${jadwalHariIni.keterangan || "-"}`
        );

        return;
    }
}
        const posisi = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    enableHighAccuracy: true,
                    timeout: 10000
                }
            );
        });

        const latitude = posisi.coords.latitude;
        const longitude = posisi.coords.longitude;

        console.log("Latitude :", latitude);
        console.log("Longitude:", longitude);
        const { data: cabang, error: cabangError } = await db
            .from("cabang")
            .select("latitude, longitude, radius_meter")
            .eq("id", cabangId)
            .single();

        if (cabangError) {
            console.log(cabangError);
            alert("Data cabang tidak ditemukan");
            return;
        }

        console.log("Latitude Cabang :", cabang.latitude);
        console.log("Longitude Cabang:", cabang.longitude);
        console.log("Radius :", cabang.radius_meter);
        const jarak = hitungJarak(
            latitude,
            longitude,
            cabang.latitude,
            cabang.longitude
        );

        console.log("Jarak :", jarak);
        if (jarak > cabang.radius_meter) {
            alert("Anda berada di luar area absensi!");
            return;
        }
        

        console.log("A");
        // Ambil pengaturan absensi
        console.log("=== MASUK KE QUERY PENGATURAN ===");
        console.log("B");
        const { data: setting, error: settingError } = await db
            .from("pengaturan_absensi")
            .select("*");

        console.log("SETTING =", setting);
        console.log("ERROR =", settingError);

        if (!setting || setting.length === 0) {
            alert("Pengaturan absensi belum dibuat.");
            return;
        }

        const aturan = setting[0];
        console.log("C");
        console.log("SETTING =", setting);
        console.log("SETTING ERROR =", settingError);
        const sekarang = new Date();

        const jamMasuk = aturan.jam_masuk.split(":");

        const jamKerja = new Date();

        jamKerja.setHours(
            parseInt(jamMasuk[0]),
            parseInt(jamMasuk[1]),
            0,
            0
        );
        // Tambahkan toleransi
        jamKerja.setMinutes(
            jamKerja.getMinutes() + aturan.toleransi_menit
        );

        let terlambatMenit = 0;

        if (sekarang > jamKerja) {

            terlambatMenit = Math.floor(
                (sekarang - jamKerja) / 60000
            );

        }
        let denda = terlambatMenit * aturan.tarif_denda;


        const { data: sudahAbsen } = await db
            .from("absensi")
            .select("id")
            .eq("karyawan_id", karyawanId)
            .eq("tanggal", hariIni)
            .limit(1);

        if (sudahAbsen.length > 0) {
            alert("Anda sudah melakukan absensi hari ini.");
            return;
        }

        const { error: insertError } = await db
    .from("absensi")
    .insert({
        karyawan_id: karyawanId,
        cabang_id: cabangId,
        tanggal: hariIni,
        jam_masuk: new Date().toTimeString().slice(0, 8),

        status: terlambatMenit > 0 ? "Terlambat" : "Hadir",

        terlambat_menit: terlambatMenit,

        tarif_denda: aturan.tarif_denda,

        denda: denda,

        status_denda: "Berlaku"
    });

if (insertError) {
    console.log(insertError);
    alert("Gagal melakukan absensi");
    return;
}
        

            if (insertError) {
                console.log(insertError);
                alert("Gagal Absen Masuk");
                return;
            }

        if (terlambatMenit > 0) {

            alert(
                `⚠ ABSEN BERHASIL
    
    Anda terlambat ${terlambatMenit} menit
    
    Denda hari ini
    
    Rp ${denda.toLocaleString("id-ID")}`
            );

        } else {

            alert(
                `✅ ABSEN BERHASIL
    
    Anda datang tepat waktu
    
    Denda : Rp0`
            );

        }
        location.reload();

});

}
    


const btnRiwayat = document.getElementById("btnRiwayat");

    if (btnRiwayat) {
        btnRiwayat.addEventListener("click", () => {
            window.location.href = "riwayat.html";
        });
    }
    async function simpanLog(aksi, tabel, dataTarget, keterangan = "") {

        const { error } = await db
            .from("log_aktivitas")
            .insert([{
                user_id: localStorage.getItem("user_id"),
                nama_user: localStorage.getItem("nama"),
                role_user: localStorage.getItem("role"),
                aksi: aksi,
                tabel_target: tabel,
                data_target: dataTarget,
                keterangan: keterangan
            }]);
    
        if (error) {
            console.log(error);
            console.log(error.message);
            console.log(error.code);
            console.log(error.details);
        }
    }