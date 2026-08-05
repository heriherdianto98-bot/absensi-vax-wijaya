const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let semuaKaryawan = [];
async function loadCabang() {

    const { data } = await db
        .from("cabang")
        .select("*")
        .order("nama_cabang");

    const select = document.getElementById("cabang");
    if (!select) return;

    select.innerHTML = "";

    data.forEach(item => {

        select.innerHTML += `
            <option value="${item.id}">
                ${item.nama_cabang}
            </option>
        `;

    });

}
function renderTabel(data){

    const tbody = document.querySelector("#tabelKaryawan tbody");

    if(!tbody) return;

    tbody.innerHTML = "";

    data.forEach(item=>{

        tbody.innerHTML += `
        <tr>
            <td>${item.nama_karyawan}</td>
            <td>${item.cabang?.nama_cabang ?? "-"}</td>
            <td>${item.jabatan}</td>
            <td>${item.status ?? "Aktif"}</td>
            <td>
                <button>Edit</button>
                <button style="background:#dc3545;color:white;">
                    Hapus
                </button>
            </td>
        </tr>
        `;

    });

}
async function loadKaryawan() {

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

document.getElementById("btnTambah")?.addEventListener("click", () => {
    document.getElementById("modalTambah").style.display = "flex";
});

document.getElementById("batalTambah")?.addEventListener("click", () => {
    document.getElementById("modalTambah").style.display = "none";
});

document.getElementById("simpanKaryawan")?.addEventListener("click", async () => {

    const nama = document.getElementById("nama").value;
    const cabang = document.getElementById("cabang").value;
    const jabatan = document.getElementById("jabatan").value;
    const status = document.getElementById("status").value;

    await db
        .from("karyawan")
        .insert({
            nama_karyawan: nama,
            cabang_id: cabang,
            jabatan: jabatan,
            status: status
        });

    document.getElementById("modalTambah").style.display = "none";

    document.getElementById("nama").value = "";
    document.getElementById("cabang").selectedIndex = 0;
    document.getElementById("jabatan").selectedIndex = 0;
    document.getElementById("status").selectedIndex = 0;

    loadKaryawan();

});
function filterKaryawan(){

}
// Event Filter
document.getElementById("cariNama")?.addEventListener("input", filterKaryawan);

document.getElementById("filterCabang")?.addEventListener("change", filterKaryawan);

document.getElementById("filterJabatan")?.addEventListener("change", filterKaryawan);

document.getElementById("filterStatus")?.addEventListener("change", filterKaryawan);

// Reset Filter
document.getElementById("resetFilter")?.addEventListener("click", () => {

    document.getElementById("cariNama").value = "";
    document.getElementById("filterCabang").value = "";
    document.getElementById("filterJabatan").value = "";
    document.getElementById("filterStatus").value = "";

    renderTabel(semuaKaryawan);

});
window.onload = () => {

    loadCabang();
    loadKaryawan();

}
window.onload = () => {
    
        // Filter Cabang
        const cabang = document.getElementById("filterCabang")?.value || "";
    
        if(cabang){
            hasil = hasil.filter(item =>
                item.cabang?.nama_cabang === cabang
            );
        }
    
        // Filter Jabatan
        const jabatan = document.getElementById("filterJabatan")?.value || "";
    
        if(jabatan){
            hasil = hasil.filter(item =>
                item.jabatan === jabatan
            );
        }
    
        // Filter Status
        const status = document.getElementById("filterStatus")?.value || "";
    
        if(status){
            hasil = hasil.filter(item =>
                item.status === status
            );
        }
    
        renderTabel(hasil);
    
    }
    loadCabang();
    loadKaryawan();
};