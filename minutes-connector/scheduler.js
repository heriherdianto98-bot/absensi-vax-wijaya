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

function jakartaTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
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

function jalankanKpiUltimate(selesai) {
  const filePath = path.join(__dirname, "kpi-ultimate-sync.js");
  const today = jakartaTodayISO();

  console.log(
    `[${formatWaktu()}] STAGE: KPI Ultimate Service Sales Detail (DATE=${today} WIB, bukan MTD)`
  );

  const proses = spawn(
    "/usr/bin/xvfb-run",
    ["-a", process.execPath, filePath],
    {
      cwd: __dirname,
      stdio: "inherit",
      env: {
        ...process.env,
        LIVE: "true",
        DRY_RUN: "false",
        DATE: today,
        DATE_FROM: "",
        DATE_TO: "",
        CABANG: "",
        HEADLESS: process.env.HEADLESS || "true"
      }
    }
  );

  proses.on("error", error => {
    console.error(
      `[${formatWaktu()}] KPI Ultimate gagal dijalankan: ${error.message}`
    );
    selesai(1);
  });

  proses.on("close", kode => {
    if (kode === 0) {
      console.log(`[${formatWaktu()}] KPI Ultimate source refresh selesai.`);
    } else {
      console.error(
        `[${formatWaktu()}] KPI Ultimate source refresh berhenti dengan kode ${kode}.`
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
      "sync-status-interval-fix.js",
      "Sync Status Interval 1 Menit",
      () => {
        jalankanNodeFile(
          "provider-sales-sync.js",
          "Minutes Provider Sales Daily",
          () => {
            jalankanNodeFile(
              "product-sales-sync.js",
              "Minutes Product Sales Daily",
              () => {
                jalankanKpiUltimate(() => {
                  sedangBerjalan = false;
                  console.log(`[${formatWaktu()}] Siklus sync selesai.`);
                });
              }
            );
          }
        );
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
console.log("Urutan: Daily Recap (xvfb) -> Sync Status 1 Menit -> Provider Sales Daily -> Product Sales Daily -> KPI Ultimate (DATE=hari ini WIB).");
console.log("Jam aktif: 07.00–00.00 WIB.");
console.log("Jangan tutup terminal ini.");
