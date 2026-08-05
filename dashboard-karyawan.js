/*======================================
VAX WIJAYA
Dashboard Karyawan
======================================*/


/* ==============================
   LOAD DATA KARYAWAN
============================== */

const ID_KARYAWAN =
    localStorage.getItem("user_id");
async function loadKaryawan(){

    const { data, error } = await db
        .from("karyawan")
        .select("*")
        .eq("id", ID_KARYAWAN)
        .single();

    if(error){

        console.error(error);

        return;

    }

    document.getElementById("namaKaryawan").innerHTML =
        data.nama_karyawan;
        document.getElementById("jabatanKaryawan").innerHTML =
        data.jabatan;

        if(data.foto){

            document.getElementById("fotoKaryawan").src =
                data.foto;
        
        }
        
        const { data: cabang } = await db
            .from("cabang")
            .select("nama_cabang")
            .eq("id", data.cabang_id)
            .single();
        
        if(cabang){
        
            document.getElementById("cabangKaryawan").innerHTML =
                cabang.nama_cabang;
        
        }
    }




/* ==============================
   GREETING
============================== */

function greeting(){

    const jam = new Date().getHours();

    let title="";
    let pesan="";

    if(jam>=5 && jam<11){

        title="Selamat Pagi ☀️";

        pesan="Semoga hari ini penuh semangat.";

    }

    else if(jam>=11 && jam<15){

        title="Selamat Siang 🌤️";

        pesan="Tetap semangat melayani pelanggan.";

    }

    else if(jam>=15 && jam<18){

        title="Selamat Sore 🌇";

        pesan="Semoga target hari ini tercapai.";

    }

    else{

        title="Selamat Malam 🌙";

        pesan="Terima kasih atas kerja keras hari ini.";

    }

    document.getElementById("greetingTitle").innerHTML =
        title;

    document.getElementById("greetingMessage").innerHTML =
        pesan;
        
}

greeting();



/* ==============================
   TOMBOL ABSENSI
============================== */

document
.getElementById("btnAbsen")
.onclick=function(){

    window.location.href="absensi.html";

};



/* ==============================
   LOAD
============================== */

loadKaryawan();
/* ==============================
   RINGKASAN BULAN INI
============================== */

async function loadRingkasan(){

    const bulan =
        new Date().getMonth()+1;

    const tahun =
        new Date().getFullYear();

    const awal =
        `${tahun}-${String(bulan).padStart(2,"0")}-01`;

    const akhir =
        `${tahun}-${String(bulan).padStart(2,"0")}-31`;

    const { data, error } = await db
        .from("absensi")
        .select("*")
        .eq("karyawan_id", ID_KARYAWAN)
        .gte("tanggal",awal)
        .lte("tanggal",akhir);

    if(error){

        console.log(error);

        return;

    }

    let masuk=0;
    let libur=0;
    let terlambat=0;
    let denda=0;

    data.forEach(item=>{

        if(item.status=="Hadir")
            masuk++;

        if(item.status=="Libur")
            libur++;

        if(item.status=="Terlambat")
            terlambat++;

        denda += Number(item.denda || 0);

    });

    document.getElementById("totalMasuk").innerHTML =
        masuk;

    document.getElementById("totalLibur").innerHTML =
        libur;

    document.getElementById("totalTerlambat").innerHTML =
        terlambat;

    document.getElementById("totalDenda").innerHTML =
        "Rp " + denda.toLocaleString("id-ID");

}

loadRingkasan();