const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const tabelKaryawan = document.getElementById("tabelKaryawan");
const inputCari = document.getElementById("inputCari");
const filterCabang = document.getElementById("filterCabang");
const filterJabatan = document.getElementById("filterJabatan");
const filterStatus = document.getElementById("filterStatus");

const totalKaryawan = document.getElementById("totalKaryawan");
const totalAktif = document.getElementById("totalAktif");
const totalNonaktif = document.getElementById("totalNonaktif");
const totalCabang = document.getElementById("totalCabang");

const modalDetail = document.getElementById("modalDetail");
const isiDetail = document.getElementById("isiDetail");
const btnTutupModal = document.getElementById("btnTutupModal");
const btnTutupDetail = document.getElementById("btnTutupDetail");

let semuaKaryawan = [];
let semuaCabang = [];

function escapeHtml(teks = "") {
    return String(teks)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatTanggal(tanggal) {
    if (!tanggal) {
        return "-";
    }

    const hasil = new Date(tanggal);

    if (Number.isNaN(hasil.getTime())) {
        return tanggal;
    }

    return hasil.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function tampilkanToast(pesan) {
    const toast = document.createElement("div");

    toast.className = "toast";
    toast.textContent = pesan;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

async function loadDataAwal() {
    tabelKaryawan.innerHTML = `
        <tr>
            <td colspan="7" class="loading">
                Memuat data karyawan...
            </td>
        </tr>
    `;

    const [
        hasilCabang,
        hasilKaryawan
    ] = await Promise.all([
        supabaseClient
            .from("cabang")
            .select("id,nama_cabang,aktif")
            .order("nama_cabang", {
                ascending: true
            }),

            supabaseClient
            .from("karyawan")
            .select("*")
            .order("nama_karyawan", {
                ascending: true
            })
    ]);

    if (hasilCabang.error) {
        console.error(hasilCabang.error);

        tampilkanToast(
            `Gagal memuat cabang: ${hasilCabang.error.message}`
        );

        return;
    }

    if (hasilKaryawan.error) {
        console.error(hasilKaryawan.error);

        tabelKaryawan.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    Gagal memuat data karyawan.
                </td>
            </tr>
        `;

        tampilkanToast(
            `Gagal memuat karyawan: ${hasilKaryawan.error.message}`
        );

        return;
    }

    semuaCabang = hasilCabang.data || [];
    semuaKaryawan = hasilKaryawan.data || [];

    isiFilterCabang();
    isiFilterJabatan();
    isiRingkasanKaryawan();
    filterDataKaryawan();
}

function isiFilterCabang() {
    filterCabang.innerHTML = `
        <option value="semua">
            Semua Cabang
        </option>
    `;

    semuaCabang.forEach(item => {
        filterCabang.innerHTML += `
            <option value="${escapeHtml(item.nama_cabang || "")}">
                ${escapeHtml(item.nama_cabang || "-")}
            </option>
        `;
    });
}

function isiFilterJabatan() {
    const daftarJabatan = [
        ...new Set(
            semuaKaryawan
                .map(item => item.jabatan)
                .filter(Boolean)
        )
    ].sort();

    filterJabatan.innerHTML = `
        <option value="semua">
            Semua Jabatan
        </option>
    `;

    daftarJabatan.forEach(jabatan => {
        filterJabatan.innerHTML += `
            <option value="${escapeHtml(jabatan)}">
                ${escapeHtml(jabatan)}
            </option>
        `;
    });
}

function isiRingkasanKaryawan() {
    totalKaryawan.textContent = semuaKaryawan.length;

    const jumlahAktif = semuaKaryawan.filter(item => {
        return item.aktif === true;
    }).length;

    totalAktif.textContent = jumlahAktif;
    totalNonaktif.textContent =
        semuaKaryawan.length - jumlahAktif;

    const cabangUnik = new Set(
        semuaKaryawan
            .map(item => item.cabang_id)
            .filter(Boolean)
    );

    totalCabang.textContent = cabangUnik.size;
}

function dapatkanNamaCabang(item) {
    if (item.nama_cabang) {
        return item.nama_cabang;
    }

    if (item.cabang) {
        return item.cabang;
    }

    if (item.cabang_id) {
        const cabang = semuaCabang.find(
            data => Number(data.id) === Number(item.cabang_id)
        );

        return cabang?.nama_cabang || "-";
    }

    return "-";
}

function renderTabelKaryawan(data) {
    if (!data.length) {
        tabelKaryawan.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    Data karyawan tidak ditemukan.
                </td>
            </tr>
        `;

        return;
    }

    tabelKaryawan.innerHTML = data.map(item => {
        const namaCabang = dapatkanNamaCabang(item);

        const statusAktif =
            item.aktif === true ||
            String(item.status || "").toLowerCase() === "aktif";

        const statusClass = statusAktif
            ? "badge badge-aktif"
            : "badge badge-nonaktif";

        const statusText = statusAktif
            ? "Aktif"
            : "Nonaktif";

        return `
            <tr>
                <td>
                    ${escapeHtml(item.nama_karyawan || "-")}
                </td>

                <td>
                    ${escapeHtml(namaCabang)}
                </td>

                <td>
                    ${escapeHtml(item.jabatan || "-")}
                </td>

                <td>
                    ${escapeHtml(
                        item.no_hp ||
                        item.telepon ||
                        item.nomor_hp ||
                        "-"
                    )}
                </td>

                <td>
                    ${formatTanggal(
                        item.tanggal_masuk ||
                        item.created_at
                    )}
                </td>

                <td>
                    <span class="${statusClass}">
                        ${statusText}
                    </span>
                </td>

                <td>
                    <button
                        class="btn-detail"
                        onclick="lihatDetailKaryawan(${item.id})"
                    >
                        Detail
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

function filterDataKaryawan() {
    const kata = inputCari.value
        .trim()
        .toLowerCase();

    const cabangDipilih = filterCabang.value;
    const jabatanDipilih = filterJabatan.value;
    const statusDipilih = filterStatus.value;

    const hasil = semuaKaryawan.filter(item => {
        const namaCabang = dapatkanNamaCabang(item);

        const statusAktif =
            item.aktif === true ||
            String(item.status || "").toLowerCase() === "aktif";

        const cocokKata =
            String(item.nama_karyawan || "")
                .toLowerCase()
                .includes(kata) ||
            String(namaCabang || "")
                .toLowerCase()
                .includes(kata) ||
            String(item.jabatan || "")
                .toLowerCase()
                .includes(kata);

        const cocokCabang =
            cabangDipilih === "semua" ||
            namaCabang === cabangDipilih;

        const cocokJabatan =
            jabatanDipilih === "semua" ||
            item.jabatan === jabatanDipilih;

        let cocokStatus = true;

        if (statusDipilih === "aktif") {
            cocokStatus = statusAktif;
        }

        if (statusDipilih === "nonaktif") {
            cocokStatus = !statusAktif;
        }

        return (
            cocokKata &&
            cocokCabang &&
            cocokJabatan &&
            cocokStatus
        );
    });

    renderTabelKaryawan(hasil);
}

window.lihatDetailKaryawan = function(id) {
    const item = semuaKaryawan.find(
        data => Number(data.id) === Number(id)
    );

    if (!item) {
        tampilkanToast("Data karyawan tidak ditemukan.");
        return;
    }

    const namaCabang = dapatkanNamaCabang(item);

    isiDetail.innerHTML = `
        <div class="detail-item">
            <span>Nama</span>
            <strong>${escapeHtml(item.nama_karyawan || "-")}</strong>
        </div>

        <div class="detail-item">
            <span>Cabang</span>
            <strong>${escapeHtml(namaCabang)}</strong>
        </div>

        <div class="detail-item">
            <span>Jabatan</span>
            <strong>${escapeHtml(item.jabatan || "-")}</strong>
        </div>

        <div class="detail-item">
            <span>No. HP</span>
            <strong>
                ${escapeHtml(
                    item.no_hp ||
                    item.telepon ||
                    item.nomor_hp ||
                    "-"
                )}
            </strong>
        </div>

        <div class="detail-item">
            <span>Email</span>
            <strong>${escapeHtml(item.email || "-")}</strong>
        </div>

        <div class="detail-item">
            <span>Tanggal Masuk</span>
            <strong>
                ${formatTanggal(
                    item.tanggal_masuk ||
                    item.created_at
                )}
            </strong>
        </div>

        <div class="detail-item">
            <span>Status</span>
            <strong>
                ${
                    item.aktif === true ||
                    String(item.status || "")
                        .toLowerCase() === "aktif"
                        ? "Aktif"
                        : "Nonaktif"
                }
            </strong>
        </div>

        <div class="detail-item">
            <span>Role</span>
            <strong>${escapeHtml(item.role || "-")}</strong>
        </div>

        <div class="detail-item full">
            <span>Alamat</span>
            <strong>${escapeHtml(item.alamat || "-")}</strong>
        </div>
    `;

    modalDetail.classList.add("show");
};

function tutupModalDetail() {
    modalDetail.classList.remove("show");
}

btnTutupModal.addEventListener(
    "click",
    tutupModalDetail
);

btnTutupDetail.addEventListener(
    "click",
    tutupModalDetail
);

modalDetail.addEventListener("click", event => {
    if (event.target === modalDetail) {
        tutupModalDetail();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        tutupModalDetail();
    }
});

inputCari.addEventListener(
    "input",
    filterDataKaryawan
);

filterCabang.addEventListener(
    "change",
    filterDataKaryawan
);

filterJabatan.addEventListener(
    "change",
    filterDataKaryawan
);

filterStatus.addEventListener(
    "change",
    filterDataKaryawan
);

// Jalankan saat halaman dibuka
loadDataAwal();

