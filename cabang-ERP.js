const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

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
const targetHarian = document.getElementById("targetHarian");
const targetBulanan = document.getElementById("targetBulanan");
const aktif = document.getElementById("aktif");

let semuaCabang = [];

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
    ${formatRupiah(item.target_harian)}
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

async function loadCabang() {
    tabelCabang.innerHTML = `
        <tr>
            <td colspan="9" class="loading">
                Memuat data cabang...
            </td>
        </tr>
    `;

    const { data, error } = await supabaseClient
        .from("cabang")
        .select("*")
        .order("urutan", {
            ascending: true,
            nullsFirst: false
        });

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
    targetHarian.value = item.target_harian ?? "";
    targetBulanan.value = item.target_bulanan ?? "";
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

        target_harian:
            targetHarian.value === ""
                ? null
                : Number(targetHarian.value),

        target_bulanan:
            targetBulanan.value === ""
                ? null
                : Number(targetBulanan.value),

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
    }
});

loadCabang();