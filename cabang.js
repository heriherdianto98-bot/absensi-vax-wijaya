
let semuaCabang = [];
let editCabangId = null;

const tbodyCabang = document.getElementById("tbodyCabang");
const modalCabang = document.getElementById("modalCabang");
const judulModal = document.getElementById("judulModal");

function renderCabang(data) {
    tbodyCabang.innerHTML = "";

    if (!data || data.length === 0) {
        tbodyCabang.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:25px;">
                    Belum ada data cabang
                </td>
            </tr>
        `;
        return;
    }

    data.forEach((item) => {
        tbodyCabang.innerHTML += `
            <tr>
                <td>${item.nama_cabang ?? "-"}</td>
                <td>${item.alamat ?? "-"}</td>
                <td>${item.radius_meter ?? 0} meter</td>
                <td>${item.aktif === false ? "Nonaktif" : "Aktif"}</td>
               <td>
    <div class="aksi">
        <button onclick="editCabang('${item.id}')">
            Edit
        </button>

        <button
            class="btn-hapus"
            onclick="hapusCabang('${item.id}', '${item.nama_cabang}')">
            Hapus
        </button>
    </div>
</td>
            </tr>
        `;
    });
}

async function loadCabang() {
    const { data, error } = await db
        .from("cabang")
        .select("*")
        .order("nama_cabang");
        console.log("DATA =", data);
        console.log("ERROR =", error);
    if (error) {
        console.error(error);
        alert("Gagal memuat data cabang");
        return;
    }

    semuaCabang = data || [];
    renderCabang(semuaCabang);
}

function bukaModalTambah() {
    editCabangId = null;
    judulModal.textContent = "Tambah Cabang";

    document.getElementById("namaCabang").value = "";
    document.getElementById("alamatCabang").value = "";
    document.getElementById("latitudeCabang").value = "";
    document.getElementById("longitudeCabang").value = "";
    document.getElementById("radiusCabang").value = "100";
    document.getElementById("statusCabang").value = "true";

    modalCabang.style.display = "flex";
}

function tutupModal() {
    modalCabang.style.display = "none";
    editCabangId = null;
}

function editCabang(id) {
    const item = semuaCabang.find((cabang) => cabang.id == id);

    if (!item) return;

    editCabangId = id;
    judulModal.textContent = "Edit Cabang";

    document.getElementById("namaCabang").value =
        item.nama_cabang ?? "";

    document.getElementById("alamatCabang").value =
        item.alamat ?? "";

    document.getElementById("latitudeCabang").value =
        item.latitude ?? "";

    document.getElementById("longitudeCabang").value =
        item.longitude ?? "";

    document.getElementById("radiusCabang").value =
        item.radius_meter ?? 100;

    document.getElementById("statusCabang").value =
        item.aktif === false ? "false" : "true";

    modalCabang.style.display = "flex";
}

async function simpanCabang() {
    const namaCabang =
        document.getElementById("namaCabang").value.trim();

    const alamat =
        document.getElementById("alamatCabang").value.trim();

    const latitude =
        document.getElementById("latitudeCabang").value;

    const longitude =
        document.getElementById("longitudeCabang").value;

    const radius =
        document.getElementById("radiusCabang").value;

    const aktif =
        document.getElementById("statusCabang").value === "true";

    if (!namaCabang) {
        alert("Nama cabang wajib diisi");
        return;
    }

    const dataCabang = {
        nama_cabang: namaCabang,
        alamat: alamat || null,
        latitude: latitude === "" ? null : Number(latitude),
        longitude: longitude === "" ? null : Number(longitude),
        radius_meter: radius === "" ? 100 : Number(radius),
        aktif: aktif
    };

    let error;

    if (editCabangId) {
        const hasil = await db
            .from("cabang")
            .update(dataCabang)
            .eq("id", editCabangId);

        error = hasil.error;
    } else {
        const hasil = await db
            .from("cabang")
            .insert(dataCabang);

        error = hasil.error;
    }

    if (error) {
        console.error(error);
        alert(error.message);
        return;
    }
    if (editCabangId) {
        await simpanLog(
            "EDIT",
            "Cabang",
            namaCabang,
            `Cabang ${namaCabang} diedit`
        );
    } else {
        await simpanLog(
            "TAMBAH",
            "Cabang",
            namaCabang,
            `Cabang ${namaCabang} ditambahkan`
        );
    }
    tutupModal();
    await loadCabang();
}

async function hapusCabang(id, namaCabang) {
    const yakin = confirm(
        `Yakin ingin menghapus cabang ${namaCabang}?`
    );

    if (!yakin) return;

    const { error } = await db
    .from("cabang")
    .delete()
    .eq("id", id);

if (error) {
    console.error(error);
    alert(error.message);
    return;
}

await simpanLog(
    "HAPUS",
    "Cabang",
    namaCabang,
    `Cabang ${namaCabang} dihapus`
);

await loadCabang();

}
function filterCabang() {
    const keyword =
        document.getElementById("cariCabang")
            .value
            .trim()
            .toLowerCase();

    const hasil = semuaCabang.filter((item) =>
        (item.nama_cabang ?? "")
            .toLowerCase()
            .includes(keyword)
    );

    renderCabang(hasil);
}

document
    .getElementById("btnTambahCabang")
    .addEventListener("click", bukaModalTambah);

document
    .getElementById("batalCabang")
    .addEventListener("click", tutupModal);

document
    .getElementById("simpanCabang")
    .addEventListener("click", simpanCabang);

document
    .getElementById("cariCabang")
    .addEventListener("input", filterCabang);

document
    .getElementById("logout")
    .addEventListener("click", () => {
        localStorage.removeItem("login");
        window.location.href = "login.html";
    });

window.editCabang = editCabang;
window.hapusCabang = hapusCabang;

loadCabang();