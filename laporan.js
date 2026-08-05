const params = new URLSearchParams(window.location.search);
const filterOtomatis = params.get("filter");

let dataLaporanAktif = [];

const NAMA_BULAN = [
    "Januari", "Februari", "Maret", "April",
    "Mei", "Juni", "Juli", "Agustus",
    "September", "Oktober", "November", "Desember"
];

function formatTanggalIndonesia(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
        return value || "-";
    }

    const [tahun, bulan, hari] = value.split("-");

    return `${hari} ${NAMA_BULAN[Number(bulan) - 1]} ${tahun}`;
}

function formatRupiah(value) {
    return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function tanggalHariIniJakarta() {
    return new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Jakarta"
    });
}

function initPeriode() {
    const bulanEl = document.getElementById("bulan");
    const tahunEl = document.getElementById("tahun");

    if (!bulanEl || !tahunEl) return;

    const sekarang = new Date();
    const tahunSekarang = sekarang.getFullYear();

    tahunEl.innerHTML = "";

    for (let tahun = tahunSekarang; tahun >= 2024; tahun--) {
        const option = document.createElement("option");

        option.value = String(tahun);
        option.textContent = String(tahun);

        tahunEl.appendChild(option);
    }

    bulanEl.value = String(sekarang.getMonth() + 1).padStart(2, "0");
    tahunEl.value = String(tahunSekarang);
}

async function loadCabang() {
    const select = document.getElementById("cabang");

    if (!select) return;

    const { data = [], error } = await db
        .from("cabang")
        .select("id, nama_cabang")
        .order("nama_cabang");

    if (error) {
        console.error("Gagal mengambil cabang:", error);
        return;
    }

    select.innerHTML = `
        <option value="">Semua Cabang</option>
    `;

    data.forEach(item => {
        const option = document.createElement("option");

        option.value = item.id;
        option.textContent = item.nama_cabang;

        select.appendChild(option);
    });
}

async function loadKaryawanFilter() {
    const select = document.getElementById("karyawan");

    if (!select) return;

    const { data = [], error } = await db
        .from("karyawan")
        .select("id, nama_karyawan")
        .order("nama_karyawan");

    if (error) {
        console.error("Gagal mengambil karyawan:", error);
        return;
    }

    select.innerHTML = `
        <option value="">Semua Karyawan</option>
    `;

    data.forEach(item => {
        const option = document.createElement("option");

        option.value = item.id;
        option.textContent = item.nama_karyawan;

        select.appendChild(option);
    });
}

async function loadLaporan() {
    const bulanEl = document.getElementById("bulan");
    const tahunEl = document.getElementById("tahun");
    const cabangEl = document.getElementById("cabang");
    const karyawanEl = document.getElementById("karyawan");
    const statusEl = document.getElementById("status");
    const tbody = document.querySelector("#tabelLaporan tbody");

    if (
        !bulanEl ||
        !tahunEl ||
        !cabangEl ||
        !karyawanEl ||
        !statusEl ||
        !tbody
    ) {
        console.error("Elemen laporan tidak ditemukan");
        return;
    }

    const bulan = bulanEl.value;
    const tahun = tahunEl.value;

    const tanggalAwal = `${tahun}-${bulan}-01`;

    const hariTerakhir = new Date(
        Number(tahun),
        Number(bulan),
        0
    ).getDate();

    const tanggalAkhir =
        `${tahun}-${bulan}-${String(hariTerakhir).padStart(2, "0")}`;

    const [hasilAbsensi, hasilKaryawan, hasilCabang] =
        await Promise.all([
            db
                .from("absensi")
                .select("*")
                .gte("tanggal", tanggalAwal)
                .lte("tanggal", tanggalAkhir),

            db
                .from("karyawan")
                .select("id, nama_karyawan"),

            db
                .from("cabang")
                .select("id, nama_cabang")
        ]);

    if (hasilAbsensi.error) {
        console.error(
            "Gagal mengambil absensi:",
            hasilAbsensi.error
        );

        alert("Gagal mengambil data absensi");
        return;
    }

    if (hasilKaryawan.error || hasilCabang.error) {
        console.error(
            "Gagal mengambil data referensi:",
            hasilKaryawan.error || hasilCabang.error
        );

        alert("Gagal mengambil data karyawan atau cabang");
        return;
    }

    const karyawanMap = new Map(
        (hasilKaryawan.data || []).map(item => [
            String(item.id),
            item.nama_karyawan
        ])
    );

    const cabangMap = new Map(
        (hasilCabang.data || []).map(item => [
            String(item.id),
            item.nama_cabang
        ])
    );

    const hariIni = tanggalHariIniJakarta();

    const cabangFilter = cabangEl.value;
    const karyawanFilter = karyawanEl.value;
    const statusFilter =
        String(statusEl.value || "").toLowerCase();

    dataLaporanAktif = (hasilAbsensi.data || [])
        .filter(item => {
            if (filterOtomatis === "denda-hari-ini") {
                if (
                    item.tanggal !== hariIni ||
                    Number(item.denda || 0) <= 0
                ) {
                    return false;
                }
            }

            if (
                filterOtomatis === "denda-bulan-ini" &&
                Number(item.denda || 0) <= 0
            ) {
                return false;
            }

            if (
                cabangFilter &&
                String(item.cabang_id) !== String(cabangFilter)
            ) {
                return false;
            }

            if (
                karyawanFilter &&
                String(item.karyawan_id) !== String(karyawanFilter)
            ) {
                return false;
            }

            if (
                statusFilter &&
                String(item.status || "").toLowerCase() !== statusFilter
            ) {
                return false;
            }

            return true;
        })
        .map(item => ({
            tanggal: item.tanggal || "-",

            karyawan:
                karyawanMap.get(String(item.karyawan_id)) || "-",

            cabang:
                cabangMap.get(String(item.cabang_id)) || "-",

            status: item.status || "-",

            denda: Number(item.denda || 0)
        }))
        .sort((a, b) =>
            String(a.tanggal).localeCompare(String(b.tanggal))
        );

        renderTabel();
renderRingkasanHalaman();
renderRankingDenda();
}

function hitungRingkasan() {
    return dataLaporanAktif.reduce(
        (hasil, item) => {
            hasil.totalData++;
            hasil.totalDenda += Number(item.denda || 0);

            const status =
                String(item.status || "").toLowerCase();

            if (status === "hadir") {
                hasil.hadir++;
            }

            if (status === "terlambat") {
                hasil.terlambat++;
            }

            if (status === "izin") {
                hasil.izin++;
            }

            if (status === "sakit") {
                hasil.sakit++;
            }

            if (status === "libur") {
                hasil.libur++;
            }

            return hasil;
        },
        {
            totalData: 0,
            hadir: 0,
            terlambat: 0,
            izin: 0,
            sakit: 0,
            libur: 0,
            totalDenda: 0
        }
    );
}

function renderTabel() {
    const tbody =
        document.querySelector("#tabelLaporan tbody");

    if (!tbody) return;

    if (dataLaporanAktif.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    style="
                        text-align:center;
                        padding:25px;
                    "
                >
                    Belum ada data laporan pada periode ini
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML = dataLaporanAktif
        .map(item => `
            <tr>
                <td>${item.tanggal}</td>
                <td>
    <button
        type="button"
        class="nama-karyawan-link"
        data-nama="${item.karyawan}"
        style="
            background:none;
            border:none;
            color:white;
            padding:0;
            font-size:inherit;
            font-weight:600;
            cursor:pointer;
            text-decoration:underline;
        "
    >
        ${item.karyawan}
    </button>
</td>
                <td>${item.cabang}</td>
                <td>${item.status}</td>
                <td>${formatRupiah(item.denda)}</td>
            </tr>
        `)
        .join("");
        document
    .querySelectorAll(".nama-karyawan-link")
    .forEach(button => {
        button.addEventListener("click", async () => {
            const namaKaryawan = button.dataset.nama;

            const selectKaryawan =
                document.getElementById("karyawan");

            const optionKaryawan = Array.from(
                selectKaryawan.options
            ).find(option =>
                option.textContent.trim() === namaKaryawan
            );

            if (!optionKaryawan) {
                alert("Karyawan tidak ditemukan");
                return;
            }

            selectKaryawan.value = optionKaryawan.value;

            await loadLaporan();

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    });
}

function renderRingkasanHalaman() {
    const ringkasan =
        document.getElementById("ringkasanLaporan");

    if (!ringkasan) return;

    const hasil = hitungRingkasan();

    ringkasan.innerHTML = `
        <strong>Ringkasan Laporan</strong><br>

        Total Data: ${hasil.totalData}<br>

        Hadir: ${hasil.hadir}<br>

        Terlambat: ${hasil.terlambat}<br>

        Izin: ${hasil.izin}<br>

        Sakit: ${hasil.sakit}<br>

        Libur: ${hasil.libur}<br>

        <strong>
            Total Denda:
            ${formatRupiah(hasil.totalDenda)}
        </strong>
    `;
    
}
function renderRankingDenda() {

    const container = document.getElementById("rankingDenda");

    if (!container) return;

    if (dataLaporanAktif.length === 0) {
        container.innerHTML = "";
        return;
    }

    const totalPerKaryawan = {};

    dataLaporanAktif.forEach(item => {
        const nama = item.karyawan;
        const denda = Number(item.denda || 0);

        if (!totalPerKaryawan[nama]) {
            totalPerKaryawan[nama] = 0;
        }

        totalPerKaryawan[nama] += denda;
    });

    const ranking = Object.entries(totalPerKaryawan)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // Kalau semua denda 0
    const adaDenda = ranking.some(item => item[1] > 0);

    if (!adaDenda) {

        container.innerHTML = `
            <h3 style="color:gold;margin-top:25px;">
                🏆 TOP DENDA BULAN INI
            </h3>

            <p style="
                color:#bdbdbd;
                margin-top:12px;
            ">
                Belum ada karyawan yang terkena denda pada periode ini.
            </p>
        `;

        return;
    }

    const medal = ["🥇","🥈","🥉"];

    let html = `
        <h3 style="
            color:gold;
            margin-top:25px;
            margin-bottom:15px;
        ">
            🏆 TOP DENDA BULAN INI
        </h3>
    `;

    ranking.forEach(([nama,total],index)=>{

        html += `
            <div style="
                display:flex;
                justify-content:space-between;
                padding:6px 0;
                border-bottom:1px solid rgba(255,255,255,.08);
            ">

                <div>

                    ${medal[index] ?? (index+1)+'.'}

                    <strong style="margin-left:8px;">
                        ${nama}
                    </strong>

                </div>

                <div style="color:gold;font-weight:bold;">
                    ${formatRupiah(total)}
                </div>

            </div>
        `;

    });

    container.innerHTML = html;

}
function exportExcel() {
    if (typeof XLSX === "undefined") {
        alert(
            "Library Excel belum termuat. " +
            "Refresh halaman lalu coba lagi."
        );

        return;
    }

    if (dataLaporanAktif.length === 0) {
        alert("Tidak ada data untuk dibuat Excel.");
        return;
    }
    function renderRekapKaryawan() {
        const container = document.getElementById("rekapKaryawan");
    
        if (!container) return;
    
        if (dataLaporanAktif.length === 0) {
            container.innerHTML = "";
            return;
        }
    
        const rekap = {};
    
        dataLaporanAktif.forEach(item => {
            const nama = item.karyawan || "-";
    
            if (!rekap[nama]) {
                rekap[nama] = {
                    hadir: 0,
                    terlambat: 0,
                    izin: 0,
                    sakit: 0,
                    libur: 0,
                    denda: 0
                };
            }
    
            const status = String(item.status || "").toLowerCase();
    
            if (status === "hadir") rekap[nama].hadir++;
            if (status === "terlambat") rekap[nama].terlambat++;
            if (status === "izin") rekap[nama].izin++;
            if (status === "sakit") rekap[nama].sakit++;
            if (status === "libur") rekap[nama].libur++;
    
            rekap[nama].denda += Number(item.denda || 0);
        });
    
        const baris = Object.entries(rekap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([nama, item], index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td style="text-align:left;">${nama}</td>
                    <td>${item.hadir}</td>
                    <td>${item.terlambat}</td>
                    <td>${item.izin}</td>
                    <td>${item.sakit}</td>
                    <td>${item.libur}</td>
                    <td style="text-align:right;">
                        ${formatRupiah(item.denda)}
                    </td>
                </tr>
            `)
            .join("");
    
        container.innerHTML = `
            <h3 style="
                color:gold;
                margin-bottom:15px;
            ">
                REKAP SEMUA KARYAWAN
            </h3>
    
            <div style="overflow-x:auto;">
                <table style="width:100%;">
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Karyawan</th>
                            <th>Hadir</th>
                            <th>Terlambat</th>
                            <th>Izin</th>
                            <th>Sakit</th>
                            <th>Libur</th>
                            <th>Denda</th>
                        </tr>
                    </thead>
    
                    <tbody>
                        ${baris}
                    </tbody>
                </table>
            </div>
        `;
    }

    const bulanEl = document.getElementById("bulan");
    const tahunEl = document.getElementById("tahun");
    const cabangEl = document.getElementById("cabang");
    const karyawanEl = document.getElementById("karyawan");
    const statusEl = document.getElementById("status");

    const ringkasan = hitungRingkasan();

    const namaBulan =
        bulanEl.options[bulanEl.selectedIndex].text;

    const tahun = tahunEl.value;

    const namaCabang =
        cabangEl.options[cabangEl.selectedIndex].text;

    const namaKaryawan =
        karyawanEl.options[karyawanEl.selectedIndex].text;

    const namaStatus =
        statusEl.options[statusEl.selectedIndex].text;

    const dataSheet = [
        ["VAX WIJAYA BARBERSHOP"],

        ["LAPORAN ABSENSI KARYAWAN"],

        [],

        ["Periode", `${namaBulan} ${tahun}`],

        ["Cabang", namaCabang],

        ["Karyawan", namaKaryawan],

        ["Status", namaStatus],

        [],

        [
            "No",
            "Tanggal",
            "Karyawan",
            "Cabang",
            "Status",
            "Denda"
        ],

        ...dataLaporanAktif.map((item, index) => [
            index + 1,
            formatTanggalIndonesia(item.tanggal),
            item.karyawan,
            item.cabang,
            item.status,
            item.denda
        ]),

        [],

        ["RINGKASAN LAPORAN"],

        ["Total Data", ringkasan.totalData],

        ["Hadir", ringkasan.hadir],

        ["Terlambat", ringkasan.terlambat],

        ["Izin", ringkasan.izin],

        ["Sakit", ringkasan.sakit],

        ["Libur", ringkasan.libur],

        ["Total Denda", ringkasan.totalDenda]
    ];

    const worksheet =
        XLSX.utils.aoa_to_sheet(dataSheet);

    worksheet["!cols"] = [
        { wch: 6 },
        { wch: 20 },
        { wch: 24 },
        { wch: 35 },
        { wch: 16 },
        { wch: 18 }
    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Laporan Absensi"
    );

    XLSX.writeFile(
        workbook,
        `laporan-absensi-${namaBulan}-${tahun}.xlsx`
    );
}

function exportPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert(
            "Library PDF belum termuat. " +
            "Refresh halaman lalu coba lagi."
        );

        return;
    }

    if (dataLaporanAktif.length === 0) {
        alert("Tidak ada data untuk dibuat PDF.");
        return;
    }

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
    });

    const pageWidth =
        doc.internal.pageSize.getWidth();

    const pageHeight =
        doc.internal.pageSize.getHeight();

    const bulanEl = document.getElementById("bulan");
    const tahunEl = document.getElementById("tahun");
    const cabangEl = document.getElementById("cabang");
    const karyawanEl = document.getElementById("karyawan");
    const statusEl = document.getElementById("status");

    const namaBulan =
        bulanEl.options[bulanEl.selectedIndex].text;

    const tahun = tahunEl.value;

    const namaCabang =
        cabangEl.options[cabangEl.selectedIndex].text;

    const namaKaryawan =
        karyawanEl.options[karyawanEl.selectedIndex].text;

    const namaStatus =
        statusEl.options[statusEl.selectedIndex].text;

    const ringkasan = hitungRingkasan();

    const tanggalCetak =
        new Date().toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Jakarta"
        });

    const waktuCetak =
        new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Jakarta"
        });

    // =========================
    // HEADER
    // =========================

    doc.setFillColor(18, 18, 18);

    doc.rect(
        0,
        0,
        pageWidth,
        38,
        "F"
    );

    doc.setFillColor(212, 175, 55);

    doc.rect(
        0,
        38,
        pageWidth,
        2,
        "F"
    );

    doc.setTextColor(212, 175, 55);

    doc.setFont(
        "helvetica",
        "bold"
    );

    doc.setFontSize(20);

    doc.text(
        "VAX WIJAYA BARBERSHOP",
        14,
        16
    );

    doc.setTextColor(255, 255, 255);

    doc.setFontSize(13);

    doc.text(
        "LAPORAN ABSENSI KARYAWAN",
        14,
        27
    );

    doc.setFont(
        "helvetica",
        "normal"
    );

    doc.setFontSize(8);

    doc.text(
        `Dicetak: ${tanggalCetak}`,
        pageWidth - 14,
        15,
        {
            align: "right"
        }
    );

    doc.text(
        `${waktuCetak} WIB`,
        pageWidth - 14,
        22,
        {
            align: "right"
        }
    );

    // =========================
    // INFORMASI LAPORAN
    // =========================

    doc.setFillColor(247, 247, 247);

    doc.setDrawColor(228, 228, 228);

    doc.roundedRect(
        14,
        47,
        pageWidth - 28,
        24,
        3,
        3,
        "FD"
    );

    doc.setTextColor(30, 30, 30);

    doc.setFont(
        "helvetica",
        "bold"
    );

    doc.setFontSize(10);

    doc.text(
        "INFORMASI LAPORAN",
        20,
        54
    );

    doc.setFont(
        "helvetica",
        "normal"
    );

    doc.setFontSize(9);

    doc.text(
        `Periode: ${namaBulan} ${tahun}`,
        20,
        62
    );

    doc.text(
        `Cabang: ${namaCabang}`,
        105,
        62
    );

    doc.text(
        `Karyawan: ${namaKaryawan}`,
        190,
        62
    );

    doc.text(
        `Status: ${namaStatus}`,
        20,
        68
    );

    // =========================
    // DATA TABEL
    // =========================

    const body = dataLaporanAktif.map(
        (item, index) => [
            index + 1,

            formatTanggalIndonesia(
                item.tanggal
            ),

            item.karyawan,

            item.cabang,

            item.status,

            formatRupiah(item.denda)
        ]
    );

    // =========================
    // TABEL PDF
    // =========================

    doc.autoTable({
        startY: 76,

        showHead: "everyPage",

        head: [[
            "No",
            "Tanggal",
            "Karyawan",
            "Cabang",
            "Status",
            "Denda"
        ]],

        body: body,

        theme: "grid",

        margin: {
            left: 14,
            right: 14,
            bottom: 18
        },

        styles: {
            font: "helvetica",
            fontSize: 8.5,
            cellPadding: 3,
            overflow: "linebreak",
            textColor: [35, 35, 35],
            lineColor: [220, 220, 220],
            lineWidth: 0.2,
            valign: "middle"
        },

        headStyles: {
            fillColor: [18, 18, 18],
            textColor: [212, 175, 55],
            fontStyle: "bold",
            halign: "center",
            lineColor: [212, 175, 55],
            lineWidth: 0.3
        },

        alternateRowStyles: {
            fillColor: [250, 250, 250]
        },
        didParseCell: function (data) {
            // Kolom status = index 4
            if (data.section === "body" && data.column.index === 4) {
                const status = String(data.cell.raw || "").toLowerCase();
        
                data.cell.styles.fontStyle = "bold";
                data.cell.styles.halign = "center";
        
                if (status === "hadir") {
                    data.cell.styles.textColor = [34, 139, 34];
                }
        
                if (status === "terlambat") {
                    data.cell.styles.textColor = [220, 53, 69];
                }
        
                if (status === "izin") {
                    data.cell.styles.textColor = [0, 123, 255];
                }
        
                if (status === "sakit") {
                    data.cell.styles.textColor = [255, 140, 0];
                }
        
                if (status === "libur") {
                    data.cell.styles.textColor = [108, 117, 125];
                }
            }
        },

        columnStyles: {
            0: {
                cellWidth: 18,
                halign: "center"
            },

            1: {
                cellWidth: 42,
                halign: "center"
            },

            2: {
                cellWidth: 55,
                halign: "left"
            },

            3: {
                cellWidth: 85,
                halign: "left"
            },

            4: {
                cellWidth: 38,
                halign: "center"
            },

            5: {
                cellWidth: 31,
                halign: "right"
            }
        }
    });

    // =========================
    // RINGKASAN LAPORAN
    // =========================

    const finalY =
        doc.lastAutoTable.finalY + 8;

    const boxHeight = 47;

    doc.setFillColor(247, 247, 247);

    doc.setDrawColor(220, 220, 220);

    doc.roundedRect(
        14,
        finalY,
        pageWidth - 28,
        boxHeight,
        3,
        3,
        "FD"
    );

    doc.setTextColor(25, 25, 25);

    doc.setFont(
        "helvetica",
        "bold"
    );

    doc.setFontSize(11);

    doc.text(
        "RINGKASAN LAPORAN",
        20,
        finalY + 9
    );

    doc.setDrawColor(212, 175, 55);

    doc.line(
        20,
        finalY + 12,
        67,
        finalY + 12
    );

    doc.setTextColor(45, 45, 45);

    doc.setFont(
        "helvetica",
        "normal"
    );

    doc.setFontSize(9);

    // Kolom kiri

    doc.text(
        "Total Data",
        20,
        finalY + 21
    );

    doc.text(
        `: ${ringkasan.totalData}`,
        58,
        finalY + 21
    );

    doc.text(
        "Hadir",
        20,
        finalY + 29
    );

    doc.text(
        `: ${ringkasan.hadir}`,
        58,
        finalY + 29
    );

    doc.text(
        "Terlambat",
        20,
        finalY + 37
    );

    doc.text(
        `: ${ringkasan.terlambat}`,
        58,
        finalY + 37
    );

    // Kolom kanan

    doc.text(
        "Izin",
        160,
        finalY + 21
    );

    doc.text(
        `: ${ringkasan.izin}`,
        195,
        finalY + 21
    );

    doc.text(
        "Sakit",
        160,
        finalY + 29
    );

    doc.text(
        `: ${ringkasan.sakit}`,
        195,
        finalY + 29
    );

    doc.text(
        "Libur",
        160,
        finalY + 37
    );

    doc.text(
        `: ${ringkasan.libur}`,
        195,
        finalY + 37
    );

    // Total Denda

    doc.setTextColor(190, 145, 20);

    doc.setFont(
        "helvetica",
        "bold"
    );

    doc.setFontSize(10);

    doc.text(
        `Total Denda : ${formatRupiah(
            ringkasan.totalDenda
        )}`,
        20,
        finalY + 44
    );
// =========================
// =========================
// TOP DENDA DI DALAM RINGKASAN
// =========================

const totalDendaPerKaryawan = {};

dataLaporanAktif.forEach(item => {
    const nama = item.karyawan || "-";

    if (!totalDendaPerKaryawan[nama]) {
        totalDendaPerKaryawan[nama] = 0;
    }

    totalDendaPerKaryawan[nama] += Number(item.denda || 0);
});

const rankingDenda = Object.entries(totalDendaPerKaryawan)
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

// Judul ranking di sisi kanan kotak
doc.setTextColor(25, 25, 25);
doc.setFont("helvetica", "bold");
doc.setFontSize(10);

doc.text(
    "TOP DENDA",
    220,
    finalY + 9
);

doc.setDrawColor(212, 175, 55);
doc.line(
    220,
    finalY + 12,
    260,
    finalY + 12
);

if (rankingDenda.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    doc.text(
        "Belum ada denda",
        220,
        finalY + 21
    );
} else {
    rankingDenda.forEach(([nama, total], index) => {
        const posisiY = finalY + 21 + (index * 8);

        doc.setTextColor(45, 45, 45);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);

        doc.text(
            `${index + 1}. ${nama}`,
            220,
            posisiY
        );

        doc.setTextColor(190, 145, 20);

        doc.text(
            formatRupiah(total),
            pageWidth - 20,
            posisiY,
            {
                align: "right"
            }
        );
    });

}
    // =========================
    // FOOTER SETIAP HALAMAN
    // =========================

    const totalHalaman =
        doc.internal.getNumberOfPages();

    for (
        let halaman = 1;
        halaman <= totalHalaman;
        halaman++
    ) {
        doc.setPage(halaman);

        doc.setDrawColor(212, 175, 55);

        doc.line(
            14,
            pageHeight - 14,
            pageWidth - 14,
            pageHeight - 14
        );

        doc.setTextColor(110, 110, 110);

        doc.setFont(
            "helvetica",
            "normal"
        );

        doc.setFontSize(8);

        doc.text(
            `Dicetak: ${tanggalCetak} ${waktuCetak} WIB`,
            14,
            pageHeight - 7
        );

        doc.text(
            `Halaman ${halaman} / ${totalHalaman}`,
            pageWidth - 14,
            pageHeight - 7,
            {
                align: "right"
            }
        );
    }

    // =========================
    // SIMPAN PDF
    // =========================

    doc.save(
        `laporan-absensi-${namaBulan}-${tahun}.pdf`
    );
}

async function mulaiLaporan() {
    initPeriode();

    await loadCabang();

    await loadKaryawanFilter();

    await loadLaporan();
}

const btnCari =
    document.getElementById("btnCari");

const btnExcel =
    document.getElementById("exportExcel");

const btnPDF =
    document.getElementById("exportPDF");

if (btnCari) {
    btnCari.addEventListener(
        "click",
        loadLaporan
    );
}

if (btnExcel) {
    btnExcel.addEventListener(
        "click",
        exportExcel
    );
}

if (btnPDF) {
    btnPDF.addEventListener(
        "click",
        exportPDF
    );
}

mulaiLaporan();