// =======================================
// VAX WIJAYA
// KARYAWAN.JS v1.0
// Bagian 1
// =======================================



let semuaKaryawan = [];
let editId = null;
// ============================
// RENDER TABEL
// ============================

function renderTabel(data){

    const tbody = document.querySelector("#tabelKaryawan tbody");

    if(!tbody) return;

    tbody.innerHTML = "";

    if(data.length === 0){

        tbody.innerHTML = `
        <tr>
            <td colspan="5" style="text-align:center;padding:30px;">
                Tidak ada data
            </td>
        </tr>
        `;

        return;

    }

    data.forEach(item=>{

        tbody.innerHTML += `
        <tr>

            <td>${item.nama_karyawan}</td>

            <td>${item.cabang?.nama_cabang ?? "-"}</td>

            <td>${item.jabatan}</td>

            <td>${item.aktif ? "Aktif" : "Nonaktif"}</td>

            <td>

                <button
    class="btnEdit"
    onclick="editKaryawan('${item.id}')">
    Edit
</button>

                <button
                    class="hapus"
                    data-id="${item.id}"
                    style="
                    background:#dc3545;
                    color:white;
                    ">
                    Hapus
                </button>

            </td>

        </tr>
        `;

    });

}



// ============================
// LOAD CABANG
// ============================

async function loadCabang(){

    const { data, error } = await db

        .from("cabang")

        .select("*")

        .order("nama_cabang");

    if(error){

        console.error(error);

        return;

    }

    // Dropdown tambah karyawan

    const cabang = document.getElementById("cabang");

    cabang.innerHTML = "";

    // Dropdown Filter

    const filter = document.getElementById("filterCabang");

    filter.innerHTML = `
        <option value="">
            Semua Cabang
        </option>
    `;

    data.forEach(item=>{

        cabang.innerHTML += `
            <option value="${item.id}">
                ${item.nama_cabang}
            </option>
        `;

        filter.innerHTML += `
            <option value="${item.nama_cabang}">
                ${item.nama_cabang}
            </option>
        `;

    });

}
function editKaryawan(id){

    const item = semuaKaryawan.find(k => k.id == id);

    if(!item) return;

    editId = id;

    document.getElementById("nama").value = item.nama_karyawan;
    document.getElementById("cabang").value = item.cabang_id;
    document.getElementById("jabatan").value = item.jabatan;
    document.getElementById("status").value = item.status || "Aktif";

    document.getElementById("modalTambah").style.display = "flex";

}
// ============================
// LOAD KARYAWAN
// ============================

async function loadKaryawan(){

    const { data, error } = await db

        .from("karyawan")

        .select(`
            *,
            cabang(nama_cabang)
        `)

        .order("nama_karyawan");

    if(error){

        console.error(error);

        return;

    }

    semuaKaryawan = data;

    renderTabel(semuaKaryawan);

}



// ============================
// FILTER
// ============================

function filterKaryawan(){

    let hasil = [...semuaKaryawan];

    // Cari Nama
    const keyword =
        document.getElementById("cariNama")
        .value
        .toLowerCase();

    if(keyword){

        hasil = hasil.filter(item =>

            item.nama_karyawan
                .toLowerCase()
                .includes(keyword)

        );

    }

    // Cabang
    const cabang =
        document.getElementById("filterCabang").value;

    if(cabang){

        hasil = hasil.filter(item =>

            item.cabang?.nama_cabang === cabang

        );

    }

    // Jabatan
    const jabatan =
        document.getElementById("filterJabatan").value;

    if(jabatan){

        hasil = hasil.filter(item =>

            item.jabatan === jabatan

        );

    }

    // Status
    const status =
        document.getElementById("filterStatus").value;

    if(status){

        hasil = hasil.filter(item =>

            item.status === status

        );

    }

    renderTabel(hasil);

}



// ============================
// MODAL
// ============================

document
.getElementById("btnTambah")
.addEventListener("click",()=>{

    document
    .getElementById("modalTambah")
    .style.display="flex";

});

document
.getElementById("batalTambah")
.addEventListener("click",()=>{

    document
    .getElementById("modalTambah")
    .style.display="none";

});



// ============================
// SIMPAN
// ============================

document
.getElementById("simpanKaryawan")
.addEventListener("click",async()=>{

    const nama =
        document.getElementById("nama").value;

    const cabang =
        document.getElementById("cabang").value;

    const jabatan =
        document.getElementById("jabatan").value;

    const status =
        document.getElementById("status").value;

    if(nama===""){

        alert("Nama masih kosong");

        return;

    }

    if(editId){

        const { error } = await db
            .from("karyawan")
            .update({
                nama_karyawan: nama,
                cabang_id: cabang,
                jabatan: jabatan,
                aktif: status === "Aktif"
            })
            .eq("id", editId);
    
        if(error){
            alert(error.message);
            return;
        }
    
    }else{

        const { error } = await db
            .from("karyawan")
            .insert({
                nama_karyawan: nama,
                cabang_id: cabang,
                jabatan: jabatan,
                aktif: status === "Aktif"
            });
    
        if(error){
            alert(error.message);
            return;
        }
    }
    document
    .getElementById("modalTambah")
    .style.display = "none";
    document
.getElementById("nama")
.value = "";

document.getElementById("cabang").selectedIndex = 0;
document.getElementById("jabatan").selectedIndex = 0;
document.getElementById("status").selectedIndex = 0;

editId = null;

loadKaryawan();
});

// ============================
// EVENT FILTER
// ============================

document
.getElementById("cariNama")
.addEventListener("input", filterKaryawan);

document
.getElementById("filterCabang")
.addEventListener("change", filterKaryawan);

document
.getElementById("filterJabatan")
.addEventListener("change", filterKaryawan);

document
.getElementById("filterStatus")
.addEventListener("change", filterKaryawan);



// ============================
// RESET FILTER
// ============================

document
.getElementById("resetFilter")
.addEventListener("click",()=>{

    document.getElementById("cariNama").value="";
    document.getElementById("filterCabang").value="";
    document.getElementById("filterJabatan").value="";
    document.getElementById("filterStatus").value="";

    renderTabel(semuaKaryawan);

});



// ============================
// EDIT (sementara)
// ============================

document.addEventListener("click", async (e) => {

    if (!e.target.classList.contains("hapus")) return;

    const id = e.target.dataset.id;

    const konfirmasi = confirm("Yakin ingin menghapus karyawan ini?");

    if (!konfirmasi) return;

    const { error } = await db
        .from("karyawan")
        .delete()
        .eq("id", id);

    if (error) {
        alert(error.message);
        return;
    }

    await loadKaryawan();

});



// ============================
// HAPUS (sementara)
// ============================

document.addEventListener("click",e=>{

    if(e.target.classList.contains("hapus")){

        alert("Fitur Hapus akan kita buat berikutnya.");

    }

});



// ============================
// INIT
// ============================

window.onload = async()=>{

    await loadCabang();

    await loadKaryawan();
};
// =========================
// EDIT KARYAWAN
// =========================

async function editKaryawan(id){

    editId = id;

    const dataKaryawan = semuaKaryawan.find(
        item => String(item.id) === String(id)
    );

    if (!dataKaryawan) {
        alert("Data karyawan tidak ditemukan");
        return;
    }

    document.getElementById("nama").value =
        dataKaryawan.nama_karyawan || "";

    document.getElementById("cabang").value =
        dataKaryawan.cabang_id || "";

    document.getElementById("jabatan").value =
        dataKaryawan.jabatan || "Capster";

    document.getElementById("status").value =
        dataKaryawan.aktif ? "Aktif" : "Nonaktif";

    document.querySelector("#modalTambah h2").textContent =
        "Edit Karyawan";

    document.getElementById("modalTambah").style.display = "flex";
}