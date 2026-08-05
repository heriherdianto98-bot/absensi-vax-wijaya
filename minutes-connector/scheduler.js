import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sedangBerjalan = false;

function sekarangWIB() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "Asia/Jakarta"
    })
  );
}

function dalamJamOperasional() {
  const sekarang = sekarangWIB();
  const jam = sekarang.getHours();

  return jam >= 7 && jam <= 23;
}

function formatWaktu() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "medium"
  }).format(new Date());
}

function jalankanSync() {
  if (sedangBerjalan) {
    console.log(
      `[${formatWaktu()}] Sync sebelumnya masih berjalan. Dilewati.`
    );
    return;
  }

  if (!dalamJamOperasional()) {
    console.log(
      `[${formatWaktu()}] Di luar jam sync 07.00–00.00 WIB.`
    );
    return;
  }

  sedangBerjalan = true;

  console.log("");
  console.log("========================================");
  console.log(`[${formatWaktu()}] MEMULAI SYNC`);
  console.log("========================================");

  const fileSync = path.join(__dirname, "sync.js");

  const proses = spawn(
    process.execPath,
    [fileSync],
    {
      cwd: __dirname,
      stdio: "inherit"
    }
  );

  proses.on("error", error => {
    console.error(
      `[${formatWaktu()}] Gagal menjalankan sync: ${error.message}`
    );

    sedangBerjalan = false;
  });

  proses.on("close", kode => {
    sedangBerjalan = false;

    if (kode === 0) {
      console.log(
        `[${formatWaktu()}] Sync selesai.`
      );
    } else {
      console.error(
        `[${formatWaktu()}] Sync berhenti dengan kode ${kode}.`
      );
    }
  });
}

jalankanSync();

setInterval(
  jalankanSync,
  10 * 60 * 1000
);

console.log("");
console.log("Scheduler aktif.");
console.log("Jadwal: setiap 10 menit.");
console.log("Jam aktif: 07.00–00.00 WIB.");
console.log("Jangan tutup terminal ini.");