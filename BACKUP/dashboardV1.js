if (localStorage.getItem("login") !== "true") {
    window.location.href = "login.html";
}
const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

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
    const hariIni = new Date().toISOString().split("T")[0];

    // Hadir
    const { data: hadir } = await db
        .from("absensi")
        .select("*")
        .eq("tanggal", hariIni);

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

const totalDendaBulanan = (dendaBulanan || []).reduce(
(total, item) => total + Number(item.denda || 0),
0
);

document.getElementById("totalDendaBulanan").innerText =
"Rp" + totalDendaBulanan.toLocaleString("id-ID");
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


document.getElementById("logout").addEventListener("click", () => {

    localStorage.removeItem("login");

    window.location.href = "login.html";

});