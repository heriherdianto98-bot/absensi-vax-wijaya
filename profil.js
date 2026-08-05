/* =====================================
   PROFIL KARYAWAN
===================================== */

const ID_KARYAWAN = 1; // sementara, nanti otomatis dari login

async function loadFoto(){

    const { data } = await db
        .from("karyawan")
        .select("foto")
        .eq("id", ID_KARYAWAN)
        .single();

    if(data && data.foto){

        document.getElementById("fotoProfil").src =
            data.foto;

    }

}

loadFoto();



/* =====================================
   UPLOAD FOTO
===================================== */

document
.getElementById("btnUpload")
.onclick = async function(){

    const file =
        document
        .getElementById("uploadFoto")
        .files[0];

    if(!file){

        alert("Pilih foto terlebih dahulu.");

        return;

    }
    const { data: lama } = await db
    .from("karyawan")
    .select("foto")
    .eq("id", ID_KARYAWAN)
    .single();

if (lama && lama.foto) {

    const namaLama =
        lama.foto.split("/foto-karyawan/")[1];

    if (namaLama) {
        await db.storage
            .from("foto-karyawan")
            .remove([namaLama]);
    }

}

const namaFile =
Date.now() + "-" + file.name;

const { error } = await db.storage
.from("foto-karyawan")
.upload(namaFile,file);

if(error){

        alert("Upload gagal");

        console.log(error);

        return;

    }

    const { data } =
        db.storage
        .from("foto-karyawan")
        .getPublicUrl(namaFile);

    await db
        .from("karyawan")
        .update({
            foto:data.publicUrl
        })
        .eq("id",ID_KARYAWAN);

    alert("Foto berhasil diupload.");

    loadFoto();

}
document
.getElementById("btnHapusFoto")
.onclick = async function(){

    const konfirmasi = confirm("Yakin ingin menghapus foto?");

    if(!konfirmasi) return;
    const { data: lama } = await db
    .from("karyawan")
    .select("foto")
    .eq("id", ID_KARYAWAN)
    .single();

if (lama && lama.foto) {

    const namaLama =
        lama.foto.split("/foto-karyawan/")[1];

    if (namaLama) {
        await db.storage
            .from("foto-karyawan")
            .remove([namaLama]);
    }

}
    const { error } = await db
        .from("karyawan")
        .update({
            foto: null
        })
        .eq("id", ID_KARYAWAN);

    if(error){

        alert("Gagal menghapus foto");

        return;

    }

    document.getElementById("fotoProfil").src = "";

    alert("Foto berhasil dihapus.");

}

const btnLogout = document.getElementById("btnLogout");

if (btnLogout) {

    btnLogout.addEventListener("click", async () => {

        if (!confirm("Yakin ingin logout?")) return;

        // Logout Supabase (aman untuk owner & svp)
        try {
            await db.auth.signOut();
        } catch (e) {}

        // Hapus semua session
        localStorage.clear();

        // Kembali ke login
        window.location.href = "login.html";

    });

}