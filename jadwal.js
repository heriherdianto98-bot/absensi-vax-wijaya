const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

let semuaJadwal = [];
let editJadwalId = null;

const tanggalInput = document.getElementById("tanggal");
const karyawanSelect = document.getElementById("karyawan");
const statusSelect = document.getElementById("status");
const jamMasukKhususInput = document.getElementById("jamMasukKhusus");
const keteranganInput = document.getElementById("keterangan");
const btnSimpan = document.getElementById("btnSimpan");
const btnBatal = document.getElementById("btnBatal");
const tbodyJadwal = document.getElementById("dataJadwal");

async function loadKaryawanJadwal() {
    const { data, error } = await db
        .from("karyawan")
        .select(`
            id,
            nama_karyawan,
            aktif,
            cabang (
                nama_cabang
            )
        `)
        .eq("aktif", true)
        .order("nama_karyawan");

    if (error) {
        console.error(error);
        alert("Gagal memuat data karyawan");
        return;
    }

    karyawanSelect.innerHTML = `
        <option value="">Pilih Karyawan</option>
    `;

    data.forEach((item) => {
        karyawanSelect.innerHTML += `
            <option value="${item.id}">
                ${item.nama_karyawan} - ${item.cabang?.nama_cabang ?? "-"}
            </option>
        `;
    });
}

async function loadJadwal() {
    const { data, error } = await db
        .from("jadwal_libur")
        .select(`
            id,
            tanggal,
            karyawan_id,
            status,
            keterangan,
            jam_masuk_khusus,
            karyawan (
                nama_karyawan,
                cabang (
                    nama_cabang
                )
            )
        `)
        .order("tanggal", { ascending: false });

    if (error) {
        console.error(error);
        alert(error.message);
        return;
    }

    semuaJadwal = data || [];
    renderJadwal(semuaJadwal);
}

function renderJadwal(data) {
    tbodyJadwal.innerHTML = "";

    if (!data || data.length === 0) {
        tbodyJadwal.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:25px;">
                    Belum ada data jadwal
                </td>
            </tr>
        `;
        return;
    }

    data.forEach((item) => {
        const nama = item.karyawan?.nama_karyawan ?? "-";
        const cabang = item.karyawan?.cabang?.nama_cabang ?? "-";
        const jamKhusus = item.jam_masuk_khusus
            ? item.jam_masuk_khusus.slice(0, 5)
            : "-";

        tbodyJadwal.innerHTML += `
            <tr>
                <td>${item.tanggal}</td>
                <td>${nama}</td>
                <td>${cabang}</td>
                <td>${item.status ?? "-"}</td>
                <td>${jamKhusus}</td>
                <td>${item.keterangan ?? "-"}</td>
                <td>
                    <button
                        class="btn-edit"
                        onclick="editJadwal('${item.id}')">
                        Edit
                    </button>

                    <button
                        class="btn-hapus"
                        onclick="hapusJadwal('${item.id}')">
                        Hapus
                    </button>
                </td>
            </tr>
        `;
    });
}

function resetForm() {
    editJadwalId = null;

    tanggalInput.value = "";
    karyawanSelect.value = "";
    statusSelect.value = "MASUK";
    jamMasukKhususInput.value = "";
    keteranganInput.value = "";

    btnSimpan.textContent = "Simpan Jadwal";
    btnBatal.style.display = "none";
}

function editJadwal(id) {
    const item = semuaJadwal.find((jadwal) => jadwal.id == id);

    if (!item) return;

    editJadwalId = id;

    tanggalInput.value = item.tanggal ?? "";
    karyawanSelect.value = item.karyawan_id ?? "";
    statusSelect.value = item.status ?? "MASUK";
    jamMasukKhususInput.value = item.jam_masuk_khusus
        ? item.jam_masuk_khusus.slice(0, 5)
        : "";
    keteranganInput.value = item.keterangan ?? "";

    btnSimpan.textContent = "Simpan Perubahan";
    btnBatal.style.display = "inline-block";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

async function simpanJadwal() {
    const tanggal = tanggalInput.value;
    const karyawanId = karyawanSelect.value;
    const status = statusSelect.value;
    const jamMasukKhusus = jamMasukKhususInput.value;
    const keterangan = keteranganInput.value.trim();

    if (!tanggal) {
        alert("Tanggal wajib dipilih");
        return;
    }

    if (!karyawanId) {
        alert("Karyawan wajib dipilih");
        return;
    }

    const dataJadwal = {
        tanggal: tanggal,
        karyawan_id: karyawanId,
        status: status,
        jam_masuk_khusus: jamMasukKhusus || null,
        keterangan: keterangan || null
    };

    let hasil;

    if (editJadwalId) {
        hasil = await db
            .from("jadwal_libur")
            .update(dataJadwal)
            .eq("id", editJadwalId);
    } else {
        hasil = await db
            .from("jadwal_libur")
            .insert(dataJadwal);
    }

    if (hasil.error) {
        console.error(hasil.error);
        alert(hasil.error.message);
        return;
    }

    alert(
        editJadwalId
            ? "Jadwal berhasil diperbarui"
            : "Jadwal berhasil disimpan"
    );

    resetForm();
    await loadJadwal();
}

async function hapusJadwal(id) {
    const yakin = confirm("Yakin ingin menghapus jadwal ini?");

    if (!yakin) return;

    const { error } = await db
        .from("jadwal_libur")
        .delete()
        .eq("id", id);

    if (error) {
        console.error(error);
        alert(error.message);
        return;
    }

    await loadJadwal();
}

btnSimpan.addEventListener("click", simpanJadwal);

btnBatal.addEventListener("click", resetForm);

document
    .getElementById("logout")
    .addEventListener("click", () => {
        localStorage.removeItem("login");
        window.location.href = "login.html";
    });

window.editJadwal = editJadwal;
window.hapusJadwal = hapusJadwal;
const inputTanggalJadwal = document.getElementById("tanggal");
const inputJamKhusus = document.getElementById("jamMasukKhusus");

inputTanggalJadwal.addEventListener("click", () => {
    if (inputTanggalJadwal.showPicker) {
        inputTanggalJadwal.showPicker();
    }
});

inputJamKhusus.addEventListener("click", () => {
    if (inputJamKhusus.showPicker) {
        inputJamKhusus.showPicker();
    }
});
loadKaryawanJadwal();
loadJadwal();