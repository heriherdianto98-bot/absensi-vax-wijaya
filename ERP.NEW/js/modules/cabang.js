/* LKG: cabang-ERP.js — client = ERP.NEW connector `db` */
const supabaseClient = typeof db !== "undefined"
    ? db
    : window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const tabelCabang = document.getElementById("tabelCabang");
const inputCari = document.getElementById("inputCari");
const filterStatus = document.getElementById("filterStatus");

const totalCabang = document.getElementById("totalCabang");
const totalAktif = document.getElementById("totalAktif");
const totalNonaktif = document.getElementById("totalNonaktif");
const totalMinutes = document.getElementById("totalMinutes");

const modalCabang = document.getElementById("modalCabang");
const formCabang = document.getElementById("formCabang");
const judulModal = document.getElementById("judulModal");

const btnTambahCabang = document.getElementById("btnTambahCabang");
const btnTutupModal = document.getElementById("btnTutupModal");
const btnBatal = document.getElementById("btnBatal");

const cabangId = document.getElementById("cabangId");
const kodeCabang = document.getElementById("kodeCabang");
const urutan = document.getElementById("urutan");
const namaCabang = document.getElementById("namaCabang");
const namaMinutes = document.getElementById("namaMinutes");
const alamat = document.getElementById("alamat");
const latitude = document.getElementById("latitude");
const longitude = document.getElementById("longitude");
const radiusMeter = document.getElementById("radiusMeter");
const manager = document.getElementById("manager");
const noHp = document.getElementById("noHp");
const aktif = document.getElementById("aktif");

let semuaCabang = [];

// Map<cabang_id, target> untuk kolom "Target Bulanan" di tabel Master Cabang,
// selalu bulan & tahun BERJALAN (WIB), diambil nyata dari public.target_bulanan
// (tabel yang sama dipakai fitur "Atur Target Bulanan"). Diisi lewat
// muatTargetBulananUntukTabel() yang memakai ulang ambilTargetPeriode()
// (didefinisikan di bagian TARGET BULANAN CABANG di bawah).
let mapTargetBulananAktif = new Map();

function formatRupiah(angka = 0) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(angka || 0));
}

function escapeHtml(teks = "") {
    return String(teks)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function tampilkanToast(pesan, tipe = "success") {
    const toast = document.createElement("div");

    toast.className =
        tipe === "success"
            ? "toast toast-success"
            : "toast toast-error";

    toast.textContent = pesan;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function bukaModalTambah() {
    formCabang.reset();

    cabangId.value = "";
    radiusMeter.value = 100;
    aktif.value = "true";

    const urutanTerbesar = semuaCabang.reduce(
        (hasil, item) => Math.max(hasil, Number(item.urutan || 0)),
        0
    );

    urutan.value = urutanTerbesar + 1;

    judulModal.textContent = "Tambah Cabang";
    modalCabang.classList.add("show");
}

function tutupModal() {
    modalCabang.classList.remove("show");
    formCabang.reset();
    cabangId.value = "";
}

function isiRingkasan(data) {
    totalCabang.textContent = data.length;

    const jumlahAktif = data.filter(
        item => item.aktif === true
    ).length;

    totalAktif.textContent = jumlahAktif;
    totalNonaktif.textContent = data.length - jumlahAktif;

    totalMinutes.textContent = data.filter(
        item =>
            item.nama_minutes &&
            item.nama_minutes.trim() !== ""
    ).length;
}

function renderTabel(data) {
    if (!data.length) {
        tabelCabang.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    Data cabang tidak ditemukan.
                </td>
            </tr>
        `;

        return;
    }

    tabelCabang.innerHTML = data.map(item => {
        const statusClass = item.aktif
            ? "badge badge-aktif"
            : "badge badge-nonaktif";

        const statusText = item.aktif
            ? "Aktif"
            : "Nonaktif";

        const tombolStatusText = item.aktif
            ? "Nonaktifkan"
            : "Aktifkan";

        return `
            <tr>
                <td>${item.urutan ?? "-"}</td>

                <td>
                    ${escapeHtml(item.kode_cabang || "-")}
                </td>

                <td>
                    ${escapeHtml(item.nama_cabang || "-")}
                </td>

                <td>
                    ${escapeHtml(item.nama_minutes || "-")}
                </td>

                <td>
    ${escapeHtml(item.manager || "-")}
</td>

<td>
    ${escapeHtml(item.no_hp || "-")}
</td>

<td>
    ${formatRupiah(mapTargetBulananAktif.get(Number(item.id)) ?? 0)}
</td>

                <td>
                    <span class="${statusClass}">
                        ${statusText}
                    </span>
                </td>

                <td>
                    <div class="action-group">

                        <button
                            class="btn-action btn-edit"
                            onclick="editCabang(${item.id})"
                        >
                            Edit
                        </button>

                        <button
                            class="btn-action btn-status"
                            onclick="ubahStatusCabang(
                                ${item.id},
                                ${item.aktif}
                            )"
                        >
                            ${tombolStatusText}
                        </button>

                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function filterDataCabang() {
    const kata = inputCari.value
        .trim()
        .toLowerCase();

    const status = filterStatus.value;

    const hasil = semuaCabang.filter(item => {
        const cocokKata =
            String(item.nama_cabang || "")
                .toLowerCase()
                .includes(kata) ||
            String(item.kode_cabang || "")
                .toLowerCase()
                .includes(kata) ||
            String(item.nama_minutes || "")
                .toLowerCase()
                .includes(kata);

        let cocokStatus = true;

        if (status === "aktif") {
            cocokStatus = item.aktif === true;
        }

        if (status === "nonaktif") {
            cocokStatus = item.aktif === false;
        }

        return cocokKata && cocokStatus;
    });

    renderTabel(hasil);
}

// Bulan & tahun BERJALAN dalam WIB (Asia/Jakarta), dipakai sebagai periode
// default kolom "Target Bulanan" di tabel Master Cabang - konsisten dengan
// konvensi WIB yang sudah dipakai di seluruh aplikasi ini.
function ambilBulanTahunWIBSekarang() {
    const bagian = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit"
    }).formatToParts(new Date());

    const tahun = Number(bagian.find(b => b.type === "year").value);
    const bulan = Number(bagian.find(b => b.type === "month").value);

    return { bulan, tahun };
}

// Memuat ulang mapTargetBulananAktif dari public.target_bulanan untuk
// bulan/tahun berjalan, lalu me-refresh tabel yang sedang tampil. Dipakai
// saat load awal halaman DAN setelah "Simpan Semua Target" berhasil, supaya
// tabel Master Cabang selalu menampilkan angka terbaru tanpa perlu reload
// halaman penuh.
async function muatTargetBulananUntukTabel() {
    try {
        const { bulan, tahun } = ambilBulanTahunWIBSekarang();
        mapTargetBulananAktif = await ambilTargetPeriode(bulan, tahun);
    } catch (error) {
        console.error("Gagal memuat Target Bulanan untuk tabel:", error);
        mapTargetBulananAktif = new Map();
    }
}

async function loadCabang() {
    tabelCabang.innerHTML = `
        <tr>
            <td colspan="9" class="loading">
                Memuat data cabang...
            </td>
        </tr>
    `;

    const [{ data, error }] = await Promise.all([
        supabaseClient
            .from("cabang")
            .select("*")
            .order("urutan", {
                ascending: true,
                nullsFirst: false
            }),
        muatTargetBulananUntukTabel()
    ]);

    if (error) {
        console.error(error);

        tabelCabang.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    Gagal memuat data cabang.
                </td>
            </tr>
        `;

        tampilkanToast(
            `Gagal memuat cabang: ${error.message}`,
            "error"
        );

        return;
    }

    semuaCabang = data || [];

    isiRingkasan(semuaCabang);
    filterDataCabang();
}

window.editCabang = function(id) {
    const item = semuaCabang.find(
        cabang => Number(cabang.id) === Number(id)
    );

    if (!item) {
        tampilkanToast(
            "Data cabang tidak ditemukan.",
            "error"
        );

        return;
    }

    cabangId.value = item.id;
    kodeCabang.value = item.kode_cabang || "";
    urutan.value = item.urutan || "";
    namaCabang.value = item.nama_cabang || "";
    namaMinutes.value = item.nama_minutes || "";
    alamat.value = item.alamat || "";
    latitude.value = item.latitude ?? "";
    longitude.value = item.longitude ?? "";
    radiusMeter.value = item.radius_meter ?? 100;
    manager.value = item.manager || "";
    noHp.value = item.no_hp || "";
    aktif.value = String(item.aktif === true);

    judulModal.textContent = "Edit Cabang";
    modalCabang.classList.add("show");
};

window.ubahStatusCabang = async function(id, statusSekarang) {
    const statusBaru = !statusSekarang;

    const konfirmasi = confirm(
        statusBaru
            ? "Aktifkan cabang ini?"
            : "Nonaktifkan cabang ini?"
    );

    if (!konfirmasi) {
        return;
    }

    const { error } = await supabaseClient
        .from("cabang")
        .update({
            aktif: statusBaru
        })
        .eq("id", id);

    if (error) {
        console.error(error);

        tampilkanToast(
            `Gagal mengubah status: ${error.message}`,
            "error"
        );

        return;
    }

    tampilkanToast(
        statusBaru
            ? "Cabang berhasil diaktifkan."
            : "Cabang berhasil dinonaktifkan."
    );

    await loadCabang();
};

formCabang.addEventListener("submit", async event => {
    event.preventDefault();

    const id = cabangId.value;

    const payload = {
        kode_cabang: kodeCabang.value
            .trim()
            .toUpperCase(),

        urutan: Number(urutan.value),

        nama_cabang: namaCabang.value.trim(),

        nama_minutes: namaMinutes.value.trim(),

        alamat: alamat.value.trim() || null,

        latitude:
            latitude.value === ""
                ? null
                : Number(latitude.value),

        longitude:
            longitude.value === ""
                ? null
                : Number(longitude.value),

        radius_meter:
            radiusMeter.value === ""
                ? 100
                : Number(radiusMeter.value),

        manager:
            manager.value.trim() || null,

        no_hp:
            noHp.value.trim() || null,

        aktif: aktif.value === "true"
    };

    let error;

    if (id) {
        const hasil = await supabaseClient
            .from("cabang")
            .update(payload)
            .eq("id", id);

        error = hasil.error;
    } else {
        const hasil = await supabaseClient
            .from("cabang")
            .insert(payload);

        error = hasil.error;
    }

    if (error) {
        console.error(error);

        tampilkanToast(
            `Gagal menyimpan cabang: ${error.message}`,
            "error"
        );

        return;
    }

    tampilkanToast(
        id
            ? "Cabang berhasil diperbarui."
            : "Cabang berhasil ditambahkan."
    );

    tutupModal();
    await loadCabang();
});

btnTambahCabang.addEventListener(
    "click",
    bukaModalTambah
);

btnTutupModal.addEventListener(
    "click",
    tutupModal
);

btnBatal.addEventListener(
    "click",
    tutupModal
);

inputCari.addEventListener(
    "input",
    filterDataCabang
);

filterStatus.addEventListener(
    "change",
    filterDataCabang
);

modalCabang.addEventListener("click", event => {
    if (event.target === modalCabang) {
        tutupModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        tutupModal();
        tutupModalTargetBulanan();
    }
});

// Boot setelah auth Owner siap (ERP.NEW shell)
function bootMasterCabang(){
    if(window.__masterCabangBooted) return;
    window.__masterCabangBooted = true;
    loadCabang();
}
document.addEventListener("erp:owner-only-ready", bootMasterCabang);
if(typeof OwnerAuth !== "undefined" && OwnerAuth.ready){
    bootMasterCabang();
}

/* =========================================================
   TARGET BULANAN CABANG
   Tabel: public.target_bulanan (cabang_id, bulan, tahun, target)
   Unique: cabang_id + bulan + tahun -> disimpan via UPSERT,
   tidak pernah membuat baris duplikat untuk periode yang sama.
   Data SELALU dibaca/ditulis langsung dari Supabase (client yang
   sama dipakai di seluruh file ini), tidak ada localStorage /
   hardcode.
========================================================= */

const modalTargetBulanan = document.getElementById("modalTargetBulanan");
const btnTargetBulanan = document.getElementById("btnTargetBulanan");
const btnTutupModalTarget = document.getElementById("btnTutupModalTarget");
const targetBulanSelect = document.getElementById("targetBulanSelect");
const targetTahunInput = document.getElementById("targetTahunInput");
const targetListWrapper = document.getElementById("targetListWrapper");
const totalTargetSemuaCabang = document.getElementById("totalTargetSemuaCabang");
const btnSalinTargetSebelumnya = document.getElementById("btnSalinTargetSebelumnya");
const btnSimpanSemuaTarget = document.getElementById("btnSimpanSemuaTarget");

function formatRupiahTarget(angka = 0) {
    return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

// Ambil angka murni dari teks input yang sudah diformat (mis. "Rp 30.000.000"
// -> 30000000). Dipakai saat menghitung total dan saat mengirim nilai ke
// Supabase, supaya yang tersimpan tetap numeric murni tanpa "Rp"/titik.
function parseAngkaTarget(teks) {
    return Number(String(teks || "").replace(/[^0-9]/g, "")) || 0;
}

// Format ulang isi input target saat user mengetik: ambil digit murni,
// lalu tampilkan kembali sebagai "Rp 30.000.000". Kursor diletakkan di
// akhir teks (paling aman untuk input angka yang diformat ulang setiap
// ketikan).
function formatUlangInputTarget(input) {
    const angka = parseAngkaTarget(input.value);

    input.value = angka ? formatRupiahTarget(angka) : "";

    const posisiAkhir = input.value.length;
    input.setSelectionRange(posisiAkhir, posisiAkhir);
}

function hitungPeriodeSebelumnya(bulan, tahun) {
    if (bulan <= 1) {
        return { bulan: 12, tahun: tahun - 1 };
    }

    return { bulan: bulan - 1, tahun };
}

function ambilInputTargetCabang() {
    return [...targetListWrapper.querySelectorAll(".input-target-cabang")];
}

function hitungTotalTargetTampilan() {
    const total = ambilInputTargetCabang().reduce(
        (jumlah, input) => jumlah + parseAngkaTarget(input.value),
        0
    );

    totalTargetSemuaCabang.textContent = formatRupiahTarget(total);
}

function renderDaftarTargetCabang(daftarCabangAktif, mapTarget) {
    if (!daftarCabangAktif.length) {
        targetListWrapper.innerHTML = `
            <div class="target-empty">
                Tidak ada cabang aktif.
            </div>
        `;

        totalTargetSemuaCabang.textContent = formatRupiahTarget(0);

        return;
    }

    targetListWrapper.innerHTML = daftarCabangAktif.map(cabang => {
        const nilaiTarget = mapTarget.get(Number(cabang.id)) ?? "";
        const nilaiTampil = nilaiTarget === "" ? "" : formatRupiahTarget(nilaiTarget);

        return `
            <div class="target-row">

                <div class="target-nama">
                    <strong>${escapeHtml(cabang.nama_cabang || "-")}</strong>
                    <small>${escapeHtml(cabang.kode_cabang || "-")}</small>
                </div>

                <input
                    type="text"
                    inputmode="numeric"
                    class="input-target-cabang"
                    data-cabang-id="${cabang.id}"
                    placeholder="Rp 0"
                    value="${nilaiTampil}"
                >

            </div>
        `;
    }).join("");

    ambilInputTargetCabang().forEach(input => {
        input.addEventListener("input", () => {
            formatUlangInputTarget(input);
            hitungTotalTargetTampilan();
        });
    });

    hitungTotalTargetTampilan();
}

async function ambilCabangAktifUntukTarget() {
    const { data, error } = await supabaseClient
        .from("cabang")
        .select("id,kode_cabang,nama_cabang,urutan")
        .eq("aktif", true)
        .order("urutan", { ascending: true, nullsFirst: false });

    if (error) {
        throw error;
    }

    return data || [];
}

async function ambilTargetPeriode(bulan, tahun) {
    const { data, error } = await supabaseClient
        .from("target_bulanan")
        .select("cabang_id,target")
        .eq("bulan", bulan)
        .eq("tahun", tahun);

    if (error) {
        throw error;
    }

    const map = new Map();

    (data || []).forEach(item => {
        map.set(Number(item.cabang_id), item.target);
    });

    return map;
}

async function muatTargetBulanan() {
    const bulan = Number(targetBulanSelect.value);
    const tahun = Number(targetTahunInput.value);

    targetListWrapper.innerHTML = `
        <div class="target-loading">Memuat data target...</div>
    `;

    try {
        const [daftarCabangAktif, mapTarget] = await Promise.all([
            ambilCabangAktifUntukTarget(),
            ambilTargetPeriode(bulan, tahun)
        ]);

        renderDaftarTargetCabang(daftarCabangAktif, mapTarget);

    } catch (error) {
        console.error(error);

        targetListWrapper.innerHTML = `
            <div class="target-empty">
                Gagal memuat data target: ${escapeHtml(error.message || "tidak diketahui")}
            </div>
        `;

        tampilkanToast(
            `Gagal memuat target bulanan: ${error.message}`,
            "error"
        );
    }
}

function bukaModalTargetBulanan() {
    const sekarang = new Date();

    targetBulanSelect.value = String(sekarang.getMonth() + 1);
    targetTahunInput.value = String(sekarang.getFullYear());

    modalTargetBulanan.classList.add("show");

    muatTargetBulanan();
}

function tutupModalTargetBulanan() {
    modalTargetBulanan.classList.remove("show");
}

async function salinTargetBulanSebelumnya() {
    const bulan = Number(targetBulanSelect.value);
    const tahun = Number(targetTahunInput.value);

    const periodeSebelumnya = hitungPeriodeSebelumnya(bulan, tahun);

    btnSalinTargetSebelumnya.disabled = true;

    try {
        const mapTargetSebelumnya = await ambilTargetPeriode(
            periodeSebelumnya.bulan,
            periodeSebelumnya.tahun
        );

        if (mapTargetSebelumnya.size === 0) {
            tampilkanToast(
                "Bulan sebelumnya belum punya data target untuk disalin.",
                "error"
            );

            return;
        }

        ambilInputTargetCabang().forEach(input => {
            const idCabang = Number(input.dataset.cabangId);

            if (mapTargetSebelumnya.has(idCabang)) {
                input.value = formatRupiahTarget(mapTargetSebelumnya.get(idCabang));
            }
        });

        hitungTotalTargetTampilan();

        tampilkanToast(
            "Target bulan sebelumnya berhasil disalin. Klik Simpan untuk menyimpan permanen."
        );

    } catch (error) {
        console.error(error);

        tampilkanToast(
            `Gagal menyalin target bulan sebelumnya: ${error.message}`,
            "error"
        );

    } finally {
        btnSalinTargetSebelumnya.disabled = false;
    }
}

async function simpanSemuaTargetBulanan() {
    const bulan = Number(targetBulanSelect.value);
    const tahun = Number(targetTahunInput.value);

    const baris = ambilInputTargetCabang().map(input => ({
        cabang_id: Number(input.dataset.cabangId),
        bulan,
        tahun,
        target: parseAngkaTarget(input.value)
    }));

    if (!baris.length) {
        return;
    }

    const labelAwal = btnSimpanSemuaTarget.innerHTML;

    btnSimpanSemuaTarget.disabled = true;
    btnSimpanSemuaTarget.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

    try {
        const { error } = await supabaseClient
            .from("target_bulanan")
            .upsert(baris, { onConflict: "cabang_id,bulan,tahun" });

        if (error) {
            throw error;
        }

        tampilkanToast("Target bulanan berhasil disimpan.");

        // Modal ditutup HANYA saat simpan benar-benar berhasil. Saat dibuka
        // lagi, bukaModalTargetBulanan() otomatis memuat ulang dari Supabase
        // (bukan dari nilai form), jadi nilai yang tampil selalu terbukti
        // tersimpan permanen, bukan asumsi/optimistic UI.
        tutupModalTargetBulanan();

        // Refresh kolom "Target Bulanan" di tabel Master Cabang supaya
        // langsung menampilkan angka terbaru tanpa perlu reload halaman.
        await muatTargetBulananUntukTabel();
        filterDataCabang();

    } catch (error) {
        console.error(error);

        tampilkanToast(
            `Gagal menyimpan target: ${error.message}`,
            "error"
        );

    } finally {
        btnSimpanSemuaTarget.disabled = false;
        btnSimpanSemuaTarget.innerHTML = labelAwal;
    }
}

btnTargetBulanan.addEventListener("click", bukaModalTargetBulanan);
btnTutupModalTarget.addEventListener("click", tutupModalTargetBulanan);
btnSalinTargetSebelumnya.addEventListener("click", salinTargetBulanSebelumnya);
btnSimpanSemuaTarget.addEventListener("click", simpanSemuaTargetBulanan);

targetBulanSelect.addEventListener("change", muatTargetBulanan);
targetTahunInput.addEventListener("change", muatTargetBulanan);

modalTargetBulanan.addEventListener("click", event => {
    if (event.target === modalTargetBulanan) {
        tutupModalTargetBulanan();
    }
});