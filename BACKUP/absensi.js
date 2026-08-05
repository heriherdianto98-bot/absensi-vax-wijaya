const SUPABASE_URL = "https://cmtuufwzjshixivykbjf.supabase.co";
const SUPABASE_KEY = "sb_publishable_G1YbpcwxO_pr-uYeJCgLfw_0hWMr2Ex";

const db = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


/* =====================================
   VAX WIJAYA ABSENSI
   Version 1.0
===================================== */

function updateJam(){

    const sekarang = new Date();

    const jam = String(sekarang.getHours()).padStart(2,"0");
    const menit = String(sekarang.getMinutes()).padStart(2,"0");
    const detik = String(sekarang.getSeconds()).padStart(2,"0");

    document.getElementById("jam").innerHTML =
        `${jam}:${menit}:${detik}`;

    const hari = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu"
    ];

    const bulan = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember"
    ];

    document.getElementById("tanggal").innerHTML =
        `${hari[sekarang.getDay()]},
        ${sekarang.getDate()}
        ${bulan[sekarang.getMonth()]}
        ${sekarang.getFullYear()}`;

}

setInterval(updateJam,1000);

updateJam();



/* =====================================
   GREETING
===================================== */

function greeting(){

    const h = new Date().getHours();

    let title="";
    let emoji="";
    let pesan="";

    if(h>=5 && h<11){

        title="Selamat Pagi";
        emoji="🌞";
        pesan="Semoga hari ini penuh semangat.";

    }

    else if(h>=11 && h<15){

        title="Selamat Siang";
        emoji="☀️";
        pesan="Tetap semangat melayani pelanggan.";

    }

    else if(h>=15 && h<18){

        title="Selamat Sore";
        emoji="🌤️";
        pesan="Jangan lupa tetap tersenyum.";

    }

    else{

        title="Selamat Malam";
        emoji="🌙";
        pesan="Semoga pekerjaan hari ini lancar.";

    }

    document.getElementById("greetingTitle").innerHTML=title;

    document.getElementById("greetingMessage").innerHTML=pesan;

    document.getElementById("emojiGreeting").innerHTML=emoji;

}

greeting();

/* =====================================
   GPS ABSENSI
===================================== */

// Koordinat Cabang Mekarwangi
// GANTI nanti dengan koordinat asli cabang

const LAT_CABANG = -6.9541383;
const LNG_CABANG = 107.6072449;

const RADIUS = 100; // meter

function hitungJarak(lat1, lon1, lat2, lon2){

    const R = 6371000;

    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;

    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1*Math.PI/180) *
        Math.cos(lat2*Math.PI/180) *
        Math.sin(dLon/2) *
        Math.sin(dLon/2);

    const c = 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));

    return R * c;

}

function cekLokasi(){

    if(!navigator.geolocation){

        alert("Browser tidak mendukung GPS");

        return;

    }

    navigator.geolocation.getCurrentPosition(

        function(pos){

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            const jarak = hitungJarak(
                lat,
                lng,
                LAT_CABANG,
                LNG_CABANG
            );

            document.getElementById("jarak").innerHTML =
                Math.round(jarak) + " Meter";

            if(jarak <= RADIUS){

                document.getElementById("statusLokasi").innerHTML =
                    "🟢 Dalam Radius";

                document.getElementById("infoAbsen").innerHTML =
                    "Silakan geser untuk melakukan absensi.";

            }else{

                document.getElementById("statusLokasi").innerHTML =
                    "🔴 Di luar Radius";

                document.getElementById("infoAbsen").innerHTML =
                    "Dekati lokasi cabang terlebih dahulu.";

            }

        },

        function(){

            document.getElementById("statusLokasi").innerHTML =
                "GPS tidak diizinkan.";

        },

        {
            enableHighAccuracy:true,
            timeout:10000,
            maximumAge:0
        }

    );

}

cekLokasi();

// Update lokasi setiap 10 detik
setInterval(cekLokasi,10000);

/* =====================================
   LOAD KARYAWAN
===================================== */

async function loadKaryawan(){

    const { data, error } = await db
        .from("karyawan")
        .select("*")
        .eq("id",1)
        .single();

    if(error){

        console.error(error);
        return;

    }

    document.getElementById("namaKaryawan").textContent =
        data.nama_karyawan;

    document.getElementById("jabatan").textContent =
        data.jabatan;

    document.getElementById("statusKaryawan").textContent =
        data.aktif ? "Karyawan Aktif" : "Tidak Aktif";

}

loadKaryawan();