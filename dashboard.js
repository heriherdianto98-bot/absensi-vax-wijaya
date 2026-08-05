

async function loadDashboard() {

    // Total Cabang
    const { data: cabang } = await db
        .from("cabang")
        .select("*");

    document.getElementById("totalCabang").innerText = cabang.length;

    // Total Karyawan
    const { data: karyawan } = await db
    .from("karyawan")

        .select("*");

    document.getElementById("totalKaryawan").innerText = karyawan.length;

    // Hari Ini
    const hariIni = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Jakarta"
    });

    // Hadir
    const { data: hadir, error: errorHadir } = await db
    .from("absensi")
    .select("*")
    .eq("tanggal", hariIni);

console.log("HARI INI =", hariIni);
console.log("DATA HADIR =", hadir);
console.log("ERROR HADIR =", errorHadir);

    document.getElementById("hadirHariIni").innerText = hadir.length;

    // Terlambat
    const { data: terlambat } = await db
        .from("absensi")
        .select("*")
        .eq("tanggal", hariIni)
        .eq("status", "Terlambat");

    document.getElementById("terlambat").innerText = terlambat.length;

    // ===============================
// TOTAL DENDA HARI INI
// ===============================

const { data: dendaHariIni, error: errorDendaHariIni } = await db
.from("absensi")
.select("denda")
.eq("tanggal", hariIni);

if (errorDendaHariIni) {
console.error("Gagal mengambil denda hari ini:", errorDendaHariIni);
}

const totalDendaHariIni = (dendaHariIni || []).reduce(
(total, item) => total + Number(item.denda || 0),
0
);

document.getElementById("totalDendaHariIni").innerText =
"Rp" + totalDendaHariIni.toLocaleString("id-ID");


// ===============================
// TOTAL DENDA BULAN INI
// ===============================

const sekarang = new Date();

const tahun = sekarang.getFullYear();
const bulan = String(sekarang.getMonth() + 1).padStart(2, "0");

const tanggalAwalBulan = `${tahun}-${bulan}-01`;

const tanggalAkhirObjek = new Date(
tahun,
sekarang.getMonth() + 1,
0
);

const tanggalAkhirBulan =
`${tahun}-${bulan}-${String(tanggalAkhirObjek.getDate()).padStart(2, "0")}`;

const { data: dendaBulanan, error: errorDendaBulanan } = await db
.from("absensi")
.select("denda")
.gte("tanggal", tanggalAwalBulan)
.lte("tanggal", tanggalAkhirBulan);

if (errorDendaBulanan) {
console.error("Gagal mengambil denda bulanan:", errorDendaBulanan);
}

const kartuDendaBulanIni = document
    .getElementById("totalDendaBulanan")
    .closest(".card");

kartuDendaBulanIni.style.cursor = "pointer";

kartuDendaBulanIni.addEventListener("click", () => {
    window.location.href = "laporan.html?filter=denda-bulan-ini";
});

// ===============================
// TOTAL LIBUR HARI INI
// ===============================
const { data: totalLiburHariIni } = await db
    .from("jadwal_libur")
    .select("id")
    .eq("tanggal", hariIni)
    .eq("status", "LIBUR");

document.getElementById("totalLiburHariIni").innerText =
    totalLiburHariIni.length;
    // ============================
    // STATUS KARYAWAN HARI INI
    // ============================

    const { data: statusHariIni } = await db
    .from("karyawan")
        .select(`
            id,
            nama_karyawan,
            cabang (
                nama_cabang
            )
        `);

        const { data: liburHariIni } = await db
        .from("jadwal_libur")
        .select("karyawan_id, status")
        .eq("tanggal", hariIni);
        const { data: absenHariIni } = await db
    .from("absensi")
    .select("karyawan_id, status")
    .eq("tanggal", hariIni);
    const totalBelumAbsen = statusHariIni.filter(karyawan => {
        const punyaJadwal = (liburHariIni || []).some(
            item => String(item.karyawan_id) === String(karyawan.id)
        );
    
        const sudahAbsen = (absenHariIni || []).some(
            item => String(item.karyawan_id) === String(karyawan.id)
        );
    
        return !punyaJadwal && !sudahAbsen;
    }).length;
    
    document.getElementById("totalBelumAbsen").innerText = totalBelumAbsen;
    const tbody = document.getElementById("statusKaryawan");

    if (tbody) {

        tbody.innerHTML = "";

        statusHariIni.forEach(karyawan => {

            const jadwal = (liburHariIni || []).find(
                item => String(item.karyawan_id) === String(karyawan.id)
            );
            
            const absen = (absenHariIni || []).find(
                item => String(item.karyawan_id) === String(karyawan.id)
            );
            
            let statusTampil = "🔴 BELUM ABSEN";
            
            if (jadwal) {
                const statusJadwal = (jadwal.status || "").toUpperCase();
            
                if (statusJadwal === "IZIN") {
                    statusTampil = "🟡 IZIN";
                } else if (statusJadwal === "LIBUR") {
                    statusTampil = "🔵 LIBUR";
                } else if (statusJadwal === "SAKIT") {
                    statusTampil = "🟣 SAKIT";
                }
            } else if (absen) {
                statusTampil =
                    absen.status === "Terlambat"
                        ? "🟠 TERLAMBAT"
                        : "🟢 MASUK";
            }
            
            tbody.innerHTML += `
                <tr>
                    <td>${karyawan.nama_karyawan}</td>
                    <td>${karyawan.cabang?.nama_cabang ?? "-"}</td>
                    <td>${statusTampil}</td>
                </tr>
            `;

        });

    }

}

// Jalankan Dashboard
function filterStatus(statusDipilih) {
    const semuaBaris = document.querySelectorAll("#statusKaryawan tr");

    semuaBaris.forEach(baris => {
        const kolomStatus = baris.cells[2];

        if (!kolomStatus) return;

        const status = kolomStatus.innerText.trim();

        baris.style.display =
            status.includes(statusDipilih) ? "" : "none";
    });

    document.querySelector(".table-area").scrollTop = 0;
}
const kartuMasukHariIni = document
    .getElementById("hadirHariIni")
    .closest(".card");

kartuMasukHariIni.style.cursor = "pointer";

kartuMasukHariIni.addEventListener("click", () => {
    filterStatus("MASUK");

    document
        .querySelector(".status-box")
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
});
const kartuTerlambat = document
    .getElementById("terlambat")
    .closest(".card");

kartuTerlambat.style.cursor = "pointer";

kartuTerlambat.addEventListener("click", () => {
    filterStatus("TERLAMBAT");

    document
        .querySelector(".status-box")
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
});
const kartuLiburHariIni = document
    .getElementById("totalLiburHariIni")
    .closest(".card");

kartuLiburHariIni.style.cursor = "pointer";

kartuLiburHariIni.addEventListener("click", () => {
    filterStatus("LIBUR");

    document
        .querySelector(".status-box")
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
});
const kartuBelumAbsen = document
    .getElementById("totalBelumAbsen")
    .closest(".card");

kartuBelumAbsen.style.cursor = "pointer";

kartuBelumAbsen.addEventListener("click", () => {

    filterStatus("BELUM ABSEN");

    document
        .querySelector(".status-box")
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

});
const kartuDendaHariIni = document
    .getElementById("totalDendaHariIni")
    .closest(".card");

kartuDendaHariIni.style.cursor = "pointer";

kartuDendaHariIni.addEventListener("click", () => {
    window.location.href = "laporan.html?filter=denda-hari-ini";
});

async function loadAktivitasTerbaru() {
    const box = document.getElementById("aktivitasTerbaru");

    const { data, error } = await db
        .from("log_aktivitas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

    if (error) {
        console.error(error);
        box.innerHTML = "<p style='padding:20px;color:#ef4444;'>Gagal memuat aktivitas.</p>";
        return;
    }

    if (!data || data.length === 0) {
        box.innerHTML = "<p style='padding:20px;color:#999;'>Belum ada aktivitas.</p>";
        return;
    }

    box.innerHTML = data.map((item) => {
        let warna = "#888";
        let icon = "📝";

        if (item.aksi === "TAMBAH") {
            warna = "#22c55e";
            icon = "➕";
        } else if (item.aksi === "EDIT") {
            warna = "#fbbf24";
            icon = "✏️";
        } else if (item.aksi === "HAPUS") {
            warna = "#ef4444";
            icon = "🗑️";
        } else if (item.aksi === "LOGIN") {
            warna = "#3b82f6";
            icon = "🔐";
        } else if (item.aksi === "LOGOUT") {
            warna = "#6b7280";
            icon = "🚪";
        }

        const waktu = new Date(item.created_at);

        return `
            <div style="
                padding:16px;
                border-bottom:1px solid #2d2d2d;
                display:flex;
                justify-content:space-between;
                gap:16px;
            ">
                <div>
                    <div style="font-size:16px;font-weight:bold;color:#fff;">
                        ${item.nama_user || "-"}
                        <span style="color:#999;font-size:13px;">
                            (${item.role_user || "-"})
                        </span>
                    </div>

                    <div style="
                        margin-top:6px;
                        color:${warna};
                        font-weight:bold;
                        font-size:14px;
                    ">
                        ${icon} ${item.aksi || "-"} ${item.tabel_target || ""}
                    </div>

                    <div style="
                        color:#bdbdbd;
                        margin-top:5px;
                        font-size:14px;
                    ">
                        ${item.keterangan || item.data_target || "-"}
                    </div>
                </div>

                <div style="
                    text-align:right;
                    color:#888;
                    font-size:12px;
                    white-space:nowrap;
                ">
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


loadDashboard();
const cariNama = document.getElementById("cariNama");

if (cariNama) {

    cariNama.addEventListener("input", function () {

        const keyword = this.value.toLowerCase();

        document.querySelectorAll("#statusKaryawan tr").forEach(row => {

            const nama = row.cells[0].innerText.toLowerCase();

            row.style.display =
                nama.includes(keyword)
                    ? ""
                    : "none";

        });

    });

}



// ===============================
// LOGOUT
// ===============================

const btnLogout = document.getElementById("btnLogout");

if (btnLogout) {

    btnLogout.addEventListener("click", async () => {

        if (!confirm("Yakin ingin logout?")) return;

        await db.auth.signOut();

        localStorage.clear();

        window.location.replace("login.html");

    });

}
const nama = localStorage.getItem("nama");
const role = localStorage.getItem("role");

let sapaan = "Selamat datang";

const jam = new Date().getHours();

if (jam >= 4 && jam < 11) {
    sapaan = "Selamat pagi";
} else if (jam >= 11 && jam < 15) {
    sapaan = "Selamat siang";
} else if (jam >= 15 && jam < 18) {
    sapaan = "Selamat sore";
} else {
    sapaan = "Selamat malam";
}

document.getElementById("infoUser").innerHTML =
`👋 ${sapaan}, <b>${nama}</b> (${role})`;
// =============================
// HAK AKSES MENU
// =============================

if (role === "svp") {
    const menuPengaturan = document.getElementById("menuPengaturan");

    if (menuPengaturan) {
        menuPengaturan.style.display = "none";
    }
}
loadAktivitasTerbaru();
// ===============================
// MOTIVASI OWNER & SPV
// ===============================

const daftarMotivasi = [
    "👑 Owner membangun arah, SPV menjaga kualitas.",
    "💰 Fokus pada pelayanan, rezeki akan mengikuti.",
    "🔥 Omzet besar dibangun dari disiplin kecil.",
    "📈 Pelanggan puas adalah promosi terbaik.",
    "🏆 Pemimpin memberi contoh, bukan hanya perintah.",
    "💎 Konsisten lebih penting daripada semangat sesaat.",
    "🚀 Hari ini harus lebih baik dari kemarin.",
    "💪 Kerja keras hari ini, hasil besar esok hari.",
    "⭐ Vax Wijaya besar karena tim yang hebat.",
    "🎯 Target hari ini adalah prioritas utama.",
    "🤝 Kerja sama tim menghasilkan kesuksesan.",
    "⚡ Kerja cepat, kualitas tetap nomor satu.",
    "💈 Setiap potongan rambut membawa nama baik Vax Wijaya.",
    "😊 Senyum pelanggan adalah bonus terbesar hari ini.",
    "📊 Angka tidak pernah bohong, tingkatkan pelayanan.",
    "💵 Omzet naik dimulai dari pelayanan terbaik.",
    "🚀 Jangan puas dengan hasil kemarin.",
    "🔥 Hari ini waktunya mencetak rekor baru.",
    "🏅 Pelanggan kembali karena kualitas, bukan harga.",
    "💪 Datang bekerja membawa solusi, bukan alasan.",
    "📈 Satu pelanggan puas bisa membawa banyak pelanggan baru.",
    "🤝 Kekompakan tim adalah kekuatan terbesar.",
    "💎 Jaga kualitas, keuntungan akan mengikuti.",
    "⚡ Kerjakan yang penting terlebih dahulu.",
    "👑 Pemimpin hebat selalu memberi teladan.",
    "💰 Setiap menit bekerja adalah peluang menghasilkan uang.",
    "🎯 Target tidak akan tercapai tanpa tindakan.",
    "🚀 Jangan berhenti sebelum target tercapai.",
    "⭐ Bangun kebiasaan baik setiap hari.",
    "💪 Disiplin mengalahkan bakat yang tidak bekerja.",
    "🏆 Hari ini kesempatan untuk menjadi lebih baik.",
    "💈 Rapikan rambut, bangun kepercayaan diri pelanggan.",
    "🤝 Layani pelanggan seperti keluarga sendiri.",
    "📊 Evaluasi hari ini adalah bekal besok.",
    "🔥 Semangat tim menentukan hasil akhir.",
    "💎 Nama baik dibangun dari pekerjaan yang rapi.",
    "⚡ Cepat boleh, asal tetap teliti.",
    "💰 Pelayanan terbaik menghasilkan keuntungan terbaik.",
    "📈 Setiap pelanggan adalah aset perusahaan.",
    "🚀 Terus belajar, terus berkembang.",
    "🏅 Kerja ikhlas selalu membawa hasil.",
    "👑 Vax Wijaya tumbuh karena orang-orang hebat.",
    "⭐ Jadilah alasan pelanggan kembali lagi.",
    "💪 Jangan hitung jam kerja, hitung hasil kerja.",
    "🤝 Saling membantu membuat pekerjaan lebih ringan.",
    "📊 Target besar dimulai dari langkah kecil.",
    "🔥 Jangan menyerah hanya karena hari ini sepi.",
    "💈 Kualitas cukuran adalah identitas kita.",
    "💰 Rezeki datang kepada mereka yang mau bergerak.",
    "🏆 Kesuksesan adalah hasil dari konsistensi."
    ];

    const motivasiOwner = document.getElementById("motivasiOwner");

    if (motivasiOwner) {
        const sekarang = new Date();
    
        const nomorHari = Math.floor(
            new Date(
                sekarang.getFullYear(),
                sekarang.getMonth(),
                sekarang.getDate()
            ).getTime() / 86400000
        );
    
        const indexMotivasi =
            nomorHari % daftarMotivasi.length;
    
        motivasiOwner.textContent =
            daftarMotivasi[indexMotivasi];
    }