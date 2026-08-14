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

function jalankanNodeFile(fileName, label, selesai) {
  const filePath = path.join(__dirname, fileName);

  console.log(`[${formatWaktu()}] Menjalankan ${label}...`);

  const proses = spawn(
    process.execPath,
    [filePath],
    {
      cwd: __dirname,
      stdio: "inherit"
    }
  );

  proses.on("error", error => {
    console.error(
      `[${formatWaktu()}] ${label} gagal dijalankan: ${error.message}`
    );
    selesai(1);
  });

  proses.on("close", kode => {
    if (kode === 0) {
      console.log(`[${formatWaktu()}] ${label} selesai.`);
    } else {
      console.error(
        `[${formatWaktu()}] ${label} berhenti dengan kode ${kode}.`
      );
    }
    selesai(kode ?? 1);
  });
}

function jalankanDailyRecap(selesai) {
  const filePath = path.join(__dirname, "sync.js");

  console.log(`[${formatWaktu()}] Menjalankan Minutes Daily Recap via xvfb-run...`);

  const proses = spawn(
    "/usr/bin/xvfb-run",
    ["-a", process.execPath, filePath],
    {
      cwd: __dirname,
      stdio: "inherit"
    }
  );

  proses.on("error", error => {
    console.error(
      `[${formatWaktu()}] Minutes Daily Recap gagal dijalankan: ${error.message}`
    );
    selesai(1);
  });

  proses.on("close", kode => {
    if (kode === 0) {
      console.log(`[${formatWaktu()}] Minutes Daily Recap selesai.`);
    } else {
      console.error(
        `[${formatWaktu()}] Minutes Daily Recap berhenti dengan kode ${kode}.`
      );
    }
    selesai(kode ?? 1);
  });
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

  jalankanDailyRecap(kodeDaily => {
    if (kodeDaily !== 0) {
      sedangBerjalan = false;
      return;
    }

    jalankanNodeFile(
      "provider-sales-sync.js",
      "Minutes Provider Sales Daily",
      () => {
        sedangBerjalan = false;
        console.log(`[${formatWaktu()}] Siklus sync selesai.`);
      }
    );
  });
}

jalankanSync();

setInterval(
  jalankanSync,
  1 * 60 * 1000
);

console.log("");
console.log("Scheduler aktif.");
console.log("Jadwal: setiap 1 menit.");
console.log("Urutan: Daily Recap (xvfb) -> Provider Sales Daily.");
console.log("Jam aktif: 07.00–00.00 WIB.");
console.log("Jangan tutup terminal ini.");
