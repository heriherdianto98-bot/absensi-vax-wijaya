import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

// ======================================================
// VAX ERP - SYNC MINUTES
// Minutes -> minutes_daily -> daily_recap_source
// ======================================================

// ================= ENV =================

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY;

if (!email || !password) {
  console.error(
    "MINUTES_EMAIL atau MINUTES_PASSWORD belum terbaca dari .env"
  );

  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "SUPABASE_URL atau SUPABASE_SERVICE_KEY belum terbaca dari .env"
  );

  process.exit(1);
}

// ================= CONFIG =================

const MINUTES_LOGIN_URL =
  "https://minutesapps.com/dashboard216a/user/login";

const MINUTES_DASHBOARD_URL =
  "https://minutesapps.com/dashboard216a/";

const MINUTES_DAILY_RECAP_URL =
  "https://minutesapps.com/dashboard216a/report/recap/";

const MINUTES_SALES_SUMMARY_URL =
  "https://minutesapps.com/dashboard216a/report/salessummary";

const HEADLESS =
  String(process.env.HEADLESS || "false")
    .toLowerCase() === "true";

const SLOW_MO = HEADLESS ? 0 : 100;

// ================= SUPABASE =================

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

// ================= TANGGAL WIB =================

function nomorBulan(namaBulan) {
  const daftarBulan = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Sept: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12"
  };

  return daftarBulan[namaBulan];
}

function ambilTanggalWIB() {
  const bagianTanggal =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).formatToParts(new Date());

  const hari = bagianTanggal.find(
    (item) => item.type === "day"
  )?.value;

  let bulan = bagianTanggal.find(
    (item) => item.type === "month"
  )?.value;

  if (bulan === "Sept") bulan = "Sep";

  const tahun = bagianTanggal.find(
    (item) => item.type === "year"
  )?.value;

  if (!hari || !bulan || !tahun) {
    throw new Error(
      "Tanggal WIB gagal dibuat."
    );
  }

  const bulanAngka = nomorBulan(bulan);

  if (!bulanAngka) {
    throw new Error(
      `Nama bulan tidak dikenali: ${bulan}`
    );
  }

  return {
    tanggalDatabase:
      `${tahun}-${bulanAngka}-${hari}`,

    tanggalMinutes:
      `${hari} ${bulan} ${tahun}`
  };
}

// Override tanggal opsional untuk keperluan BACKFILL data historis
// (mis. mengisi ulang tanggal yang row-nya masih 0 karena sync harian
// belum sempat jalan). Dipicu HANYA lewat env BACKFILL_TANGGAL
// ("YYYY-MM-DD"); jika tidak diisi, perilaku tetap sama seperti
// sebelumnya (selalu tanggal hari ini WIB) - tidak ada perubahan
// untuk scheduler.js / server.js / tombol Sync Minutes yang sudah ada.
function tanggalDariAngka(tanggalYMD) {
  const [tahun, bulanAngka, hari] = tanggalYMD.split("-");

  const namaBulanArr = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const bulan = namaBulanArr[Number(bulanAngka) - 1];

  if (!tahun || !bulan || !hari) {
    throw new Error(
      `BACKFILL_TANGGAL tidak valid: "${tanggalYMD}" (format harus YYYY-MM-DD).`
    );
  }

  return {
    tanggalDatabase: tanggalYMD,
    tanggalMinutes: `${hari} ${bulan} ${tahun}`
  };
}

const BACKFILL_TANGGAL = process.env.BACKFILL_TANGGAL || null;

// Guard eksplisit untuk one-time historical repair.
// Scheduler/live sync TIDAK akan menulis tanggal < LIVE_START.
// Historical hanya boleh ditulis jika:
// 1) BACKFILL_TANGGAL diisi, DAN
// 2) ALLOW_HISTORICAL_DAILY_RECAP_BACKFILL=true.
const ALLOW_HISTORICAL_DAILY_RECAP_BACKFILL =
  String(
    process.env.ALLOW_HISTORICAL_DAILY_RECAP_BACKFILL || "false"
  ).toLowerCase() === "true";

// Live write-path untuk daily_recap_source. Historical < tanggal ini LOCK.
const LIVE_START = "2026-08-13";

function bolehTulisDailyRecap(tanggalYmd) {
  const tanggal = String(tanggalYmd || "");

  if (tanggal >= LIVE_START) {
    return true;
  }

  return Boolean(
    BACKFILL_TANGGAL &&
    ALLOW_HISTORICAL_DAILY_RECAP_BACKFILL &&
    tanggal === BACKFILL_TANGGAL
  );
}

const {
  tanggalDatabase,
  tanggalMinutes
} = BACKFILL_TANGGAL
  ? tanggalDariAngka(BACKFILL_TANGGAL)
  : ambilTanggalWIB();

if (BACKFILL_TANGGAL) {
  console.log(
    `⚠️  MODE BACKFILL: mengambil recap Minutes untuk tanggal ${tanggalDatabase} (bukan hari ini).`
  );

  if (
    tanggalDatabase < LIVE_START &&
    !ALLOW_HISTORICAL_DAILY_RECAP_BACKFILL
  ) {
    console.log(
      `🔒 Historical daily_recap_source tetap LOCK. Untuk repair terkontrol tanggal ${tanggalDatabase}, set ALLOW_HISTORICAL_DAILY_RECAP_BACKFILL=true.`
    );
  }

  if (
    tanggalDatabase < LIVE_START &&
    ALLOW_HISTORICAL_DAILY_RECAP_BACKFILL
  ) {
    console.log(
      `⚠️  HISTORICAL REPAIR DIIZINKAN HANYA untuk ${tanggalDatabase}.`
    );
  }
}

// ================= HELPER =================

function rupiahKeAngka(teks = "") {
  const angka = String(teks)
    .replace(/[^\d-]/g, "");

  return angka ? Number(angka) : 0;
}

function normalisasiNama(teks = "") {
  return String(teks)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function namaFileAman(teks = "") {
  return String(teks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatRupiah(nilai = 0) {
  return `Rp ${Number(nilai || 0)
    .toLocaleString("id-ID")}`;
}

async function simpanScreenshot(
  page,
  namaFile
) {
  try {
    await page.screenshot({
      path: namaFile,
      fullPage: true
    });
  } catch (error) {
    console.error(
      `Screenshot gagal: ${error.message}`
    );
  }
}

// ================= CABANG SUPABASE =================

async function ambilCabangAktif() {
  console.log(
    "Mengambil daftar cabang aktif..."
  );

  const {
    data,
    error
  } = await supabase
    .from("cabang")
    .select(`
      id,
      kode_cabang,
      nama_cabang,
      nama_minutes,
      urutan,
      aktif
    `)
    .eq("aktif", true)
    .not("nama_minutes", "is", null)
    .order("urutan", {
      ascending: true
    });

  if (error) {
    throw new Error(
      `Gagal membaca cabang: ${error.message}`
    );
  }

  const daftarCabang = (data || [])
    .filter((item) =>
      item.id &&
      item.nama_cabang &&
      item.nama_minutes
    );

  if (daftarCabang.length === 0) {
    throw new Error(
      "Tidak ada cabang aktif yang memiliki nama_minutes."
    );
  }

  console.log(
    `${daftarCabang.length} cabang siap disinkronkan.`
  );

  console.table(
    daftarCabang.map((item) => ({
      urutan: item.urutan,
      kode: item.kode_cabang,
      namaERP: item.nama_cabang,
      namaMinutes: item.nama_minutes
    }))
  );

  return daftarCabang;
}

// ================= LOGIN MINUTES =================

async function loginMinutes(page) {
  console.log("Membuka Minutes...");

  await page.goto(
    MINUTES_LOGIN_URL,
    {
      waitUntil: "domcontentloaded",
      timeout: 30000
    }
  );

  await page
    .locator('input[name="email"]')
    .waitFor({
      state: "visible",
      timeout: 20000
    });

  await page
    .locator('input[name="email"]')
    .fill(email);

  await page
    .locator('input[name="password"]')
    .fill(password);

  await page
    .getByRole("button", {
      name: /sign in/i
    })
    .click();

  await page.waitForTimeout(4000);

  if (page.url().includes("/user/login")) {
    throw new Error(
      "Login Minutes gagal. Periksa email dan password."
    );
  }

  console.log("✅ Login Minutes berhasil.");
}

// ================= UBAH KE MERCHANT =================

async function ubahKeMerchant(page) {
  console.log(
    "Mengubah Group menjadi Merchant..."
  );

  const dropdownRole = page.locator(
    'select[name="switchrole"]'
  );

  await dropdownRole.waitFor({
    state: "attached",
    timeout: 20000
  });

  await Promise.all([
    page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 30000
    }),

    page.evaluate(() => {
      const select = document.querySelector(
        'select[name="switchrole"]'
      );

      if (!select || !select.form) {
        throw new Error(
          "Dropdown Group/Merchant tidak ditemukan."
        );
      }

      select.value = "3";
      select.form.submit();
    })
  ]);

  await page.waitForTimeout(4000);

  console.log(
    "✅ Level Merchant berhasil dipilih."
  );
}

// ================= PILIH MERCHANT =================

async function cariMerchant(
  page,
  namaCabangMinutes
) {
  const merchantSelect = page.locator(
    'select[name="merchant"]'
  );

  await merchantSelect.waitFor({
    state: "attached",
    timeout: 20000
  });

  return page.evaluate(
    (namaDicari) => {
      const select = document.querySelector(
        'select[name="merchant"]'
      );

      if (!select) {
        return null;
      }

      const normalisasi = (teks) =>
        String(teks)
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();

      const target = normalisasi(namaDicari);

      const option = [...select.options]
        .find((item) =>
          normalisasi(item.textContent) ===
          target
        );

      if (!option) {
        return null;
      }

      return {
        value: option.value,
        nama: option.textContent.trim()
      };
    },
    namaCabangMinutes
  );
}

async function pilihMerchant(
  page,
  nilaiCabang
) {
  // Selector & cara submit TIDAK diubah (sama seperti sebelumnya).
  // Ditambahkan retry karena navigasi setelah submit sesekali timeout
  // secara transient (mis. cabang pertama tepat setelah login), agar
  // sync tidak langsung gagal pada kegagalan navigasi yang bersifat
  // sementara.
  const percobaanMaksimal = 2;

  for (
    let percobaan = 1;
    percobaan <= percobaanMaksimal;
    percobaan++
  ) {
    try {
      await Promise.all([
        page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 30000
        }),

        page.evaluate((nilai) => {
          const select = document.querySelector(
            'select[name="merchant"]'
          );

          if (!select || !select.form) {
            throw new Error(
              "Dropdown merchant tidak ditemukan."
            );
          }

          select.value = nilai;
          select.form.submit();
        }, nilaiCabang)
      ]);

      await page.waitForTimeout(2500);

      return;

    } catch (error) {
      if (percobaan === percobaanMaksimal) {
        throw error;
      }

      console.log(
        `⚠️ Navigasi pilih merchant timeout, mencoba ulang (percobaan ${percobaan + 1}/${percobaanMaksimal})...`
      );

      await page.waitForTimeout(2000);
    }
  }
}

// ================= BACA SERVICES =================
// ROOT-FIX: baca CUSTOMER / TRANSACTION / SERVICES HANYA dari kartu KPI
// Daily Recap (#sparks). Dilarang parse body global / URL / tenant chrome
// (dashboard216a) agar angka 216 tidak pernah masuk sebagai KPI.

async function bacaRingkasanDaily(page) {
  const percobaanMaksimal = 5;

  for (
    let percobaan = 1;
    percobaan <= percobaanMaksimal;
    percobaan++
  ) {
    const hasil = await page.evaluate(() => {
      const bersihkan = (teks = "") =>
        String(teks)
          .trim()
          .replace(/\s+/g, " ");

      const normalisasi = (teks = "") =>
        bersihkan(teks).toUpperCase();

      function ambilNilaiDariKartu(scope, label) {
        if (!scope) return null;

        const target = normalisasi(label);
        const baris = String(scope.innerText || "")
          .split(/\n+/)
          .map(bersihkan)
          .filter(Boolean);

        const index = baris.findIndex(
          (teks) => normalisasi(teks) === target
        );

        if (index === -1) return null;

        const nilaiTeks = baris[index + 1];
        if (!/^\d{1,6}$/.test(nilaiTeks || "")) {
          return null;
        }

        return Number(nilaiTeks);
      }

      // Kartu KPI resmi Daily Recap — bukan #content / body / modal / tabel.
      const scope =
        document.querySelector("ul#sparks") ||
        document.querySelector(".col-sm-10.on-mobile");

      if (!scope) {
        return { ok: false, transaction: 0, customer: 0, services: 0 };
      }

      // Scope harus memuat ketiga label KPI (bukan elemen lain yang kebetulan
      // mengandung salah satu kata).
      const teksScope = normalisasi(scope.innerText || "");
      const punyaKartu =
        /\bTRANSACTION\b/.test(teksScope) &&
        /\bCUSTOMER\b/.test(teksScope) &&
        /\bSERVICES\b/.test(teksScope);

      if (!punyaKartu) {
        return { ok: false, transaction: 0, customer: 0, services: 0 };
      }

      const transaction = ambilNilaiDariKartu(scope, "TRANSACTION");
      const customer = ambilNilaiDariKartu(scope, "CUSTOMER");
      const services = ambilNilaiDariKartu(scope, "SERVICES");

      if (
        transaction == null ||
        customer == null ||
        services == null
      ) {
        return { ok: false, transaction: 0, customer: 0, services: 0 };
      }

      return {
        ok: true,
        transaction,
        customer,
        services
      };
    });

    if (hasil?.ok) {
      return {
        transaction: Number(hasil.transaction || 0),
        customer: Number(hasil.customer || 0),
        services: Number(hasil.services || 0)
      };
    }

    if (percobaan < percobaanMaksimal) {
      await page.waitForTimeout(1500);
    }
  }

  // Fail-safe: contract existing — jangan isi KPI dari bagian halaman lain.
  return {
    transaction: 0,
    customer: 0,
    services: 0
  };
}

// ================= BACA HEADER KPI DAILY RECAP =================
// Label-based (bukan index posisi). Header Daily Recap memuat
// NET SERVICES SALES / NET PRODUCTS SALES / TRANSACTION / CUSTOMER / SERVICES.

async function bacaHeaderKpiDaily(page) {
  return page.evaluate(() => {
    const bersihkan = (teks = "") =>
      String(teks).trim().replace(/\s+/g, " ");

    const normalisasi = (teks = "") =>
      bersihkan(teks).toUpperCase();

    const rupiahKeAngka = (teks = "") => {
      const angka = String(teks).replace(/[^\d-]/g, "");
      return angka ? Number(angka) : 0;
    };

    const baris = String(
      document.querySelector("#content")?.innerText
      || document.querySelector(".page-content")?.innerText
      || document.body?.innerText
      || ""
    )
      .split(/\n+/)
      .map(bersihkan)
      .filter(Boolean);

    function sisaSetelahLabel(teks, label) {
      const nTeks = normalisasi(teks);
      const nLabel = normalisasi(label);
      if (nTeks === nLabel) return "";
      if (nTeks.startsWith(nLabel + " ") || nTeks.startsWith(nLabel + ":")) {
        return bersihkan(teks.slice(label.length));
      }
      return null;
    }

    function parseCount(teks) {
      const m = String(teks || "").replace(/[^\d]/g, "");
      if (!/^\d{1,6}$/.test(m)) return null;
      return Number(m);
    }

    function nilaiByLabel(label, mode) {
      for (let i = 0; i < baris.length; i++) {
        const sisa = sisaSetelahLabel(baris[i], label);
        if (sisa === null) continue;
        const kandidat = sisa || baris[i + 1] || "";
        if (mode === "rupiah") {
          if (!/\d/.test(kandidat)) return null;
          return rupiahKeAngka(kandidat);
        }
        return parseCount(kandidat);
      }
      return null;
    }

    return {
      netServicesSales: nilaiByLabel("NET SERVICES SALES", "rupiah"),
      netProductsSales: nilaiByLabel("NET PRODUCTS SALES", "rupiah"),
      transaction: nilaiByLabel("TRANSACTION", "count"),
      customer: nilaiByLabel("CUSTOMER", "count"),
      services: nilaiByLabel("SERVICES", "count")
    };
  });
}

// ================= BACA SETTLEMENT =================

async function bacaSettlement(page) {
  const settlementTable = page.locator(
    "#settlementrecap"
  );

  await settlementTable.waitFor({
    state: "visible",
    timeout: 30000
  });

  const settlementRows = await page
    .locator("#settlementrecap tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => {
        const cells =
          row.querySelectorAll("td");

        return {
          label:
            cells[0]?.textContent
              ?.trim() || "",

          nilai:
            cells[1]?.textContent
              ?.trim() || ""
        };
      })
    );

  const settlement = {};

  for (const row of settlementRows) {
    if (!row.label) {
      continue;
    }

    settlement[row.label] =
      rupiahKeAngka(row.nilai);
  }

  return settlement;
}

// ================= BACA EXPENSE =================

async function bacaExpenses(page) {
  const expenseTable = page.locator(
    'table[data-dt-title="Expense Data"]'
  );

  const terlihat = await expenseTable
    .isVisible()
    .catch(() => false);

  if (!terlihat) {
    return [];
  }

  const expenseRows = await expenseTable
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => {
        const cells =
          row.querySelectorAll("td");

        return {
          keterangan:
            cells[0]?.textContent
              ?.trim() || "",

          nominalText:
            cells[1]?.textContent
              ?.trim() || "",

          kasir:
            cells[2]?.textContent
              ?.trim() || ""
        };
      })
    );

  return expenseRows
    .map((item) => ({
      keterangan: item.keterangan,

      nominal:
        rupiahKeAngka(
          item.nominalText
        ),

      kasir: item.kasir
    }))
    .filter((item) => {
      const nama =
        normalisasiNama(item.keterangan);

      return (
        item.keterangan &&
        !nama.includes("opening cash") &&
        item.nominal > 0
      );
    });
}
async function bacaTransactionSalesSummary(
  page,
  tanggalYmd,
  tanggalMinutes
) {
  const [tahun, bulan, hari] =
    String(tanggalYmd || "").split("-");

  const range = `${bulan}/${hari}/${tahun}`;
  const rangeLabel = `${range} - ${range}`;

  const url =
    `${MINUTES_SALES_SUMMARY_URL}` +
    `?range=${encodeURIComponent(rangeLabel)}`;

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForTimeout(3500);

    const hasil = await page.evaluate(
      ({ tanggalMinutes, rangeLabel }) => {
        const clean = (teks = "") =>
          String(teks)
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const normal = (teks = "") =>
          clean(teks).toUpperCase();

        const bodyText =
          clean(document.body?.innerText || "");

        const periodExact =
          `(${tanggalMinutes} - ${tanggalMinutes})`;

        const rangeNow = clean(
          document.querySelector("#reportrange span")
            ?.textContent ||
          document.querySelector("#reportrange")
            ?.value ||
          ""
        );

        if (
          !bodyText.includes(periodExact) &&
          rangeNow !== rangeLabel &&
          !rangeNow.includes(rangeLabel)
        ) {
          return {
            ok: false,
            reason: `periode tidak sesuai: ${rangeNow || "-"}`
          };
        }

        const scope =
          document.querySelector("ul#sparks");

        if (!scope) {
          return {
            ok: false,
            reason: "ul#sparks tidak ditemukan"
          };
        }

        function parseCount(teks) {
          const angka =
            String(teks || "").replace(/[^\d]/g, "");

          if (!/^\d{1,6}$/.test(angka)) {
            return null;
          }

          return Number(angka);
        }

        function ambil(label) {
          const target = normal(label);

          for (
            const item of
            scope.querySelectorAll("li.sparks-info")
          ) {
            const h5 = item.querySelector("h5");

            if (!h5) continue;

            const clone = h5.cloneNode(true);

            clone
              .querySelectorAll("span")
              .forEach((span) => span.remove());

            if (
              normal(clone.textContent) !== target
            ) {
              continue;
            }

            return parseCount(
              h5.querySelector("span")
                ?.textContent || ""
            );
          }

          return null;
        }

        const customerTransactions =
          ambil("CUSTOMER TRANSACTIONS");

        const guestTransactions =
          ambil("GUEST TRANSACTIONS");

        if (
          customerTransactions == null ||
          guestTransactions == null
        ) {
          return {
            ok: false,
            reason:
              "CUSTOMER/GUEST TRANSACTIONS tidak terbaca"
          };
        }

        return {
          ok: true,
          customerTransactions,
          guestTransactions,
          transactionMinutes:
            customerTransactions +
            guestTransactions
        };
      },
      {
        tanggalMinutes,
        rangeLabel
      }
    );

    if (!hasil?.ok) {
      console.warn(
        `⚠️ Sales Summary TRX gagal: ${hasil?.reason || "unknown"}`
      );

      return null;
    }

    return hasil;

  } catch (error) {
    console.warn(
      `⚠️ Sales Summary TRX gagal: ${error.message}`
    );

    return null;
  }
}
// ================= PROSES SATU CABANG =================

async function prosesCabang(
  page,
  cabangERP,
  index,
  totalCabang
) {
  const namaCabangERP =
    cabangERP.nama_cabang.trim();

  const namaCabangMinutes =
    cabangERP.nama_minutes.trim();

  console.log("");
  console.log(
    "===================================="
  );

  console.log(
    `CABANG ${index + 1} DARI ${totalCabang}`
  );

  console.log(
    `ERP     : ${namaCabangERP}`
  );

  console.log(
    `Minutes : ${namaCabangMinutes}`
  );

  console.log(
    "===================================="
  );

  // Kembali ke dashboard agar dropdown merchant tersedia
  await page.goto(
    MINUTES_DASHBOARD_URL,
    {
      waitUntil: "domcontentloaded",
      timeout: 30000
    }
  );

  await page.waitForTimeout(2500);

  const dataMerchant =
    await cariMerchant(
      page,
      namaCabangMinutes
    );

  if (!dataMerchant) {
    throw new Error(
      `Merchant "${namaCabangMinutes}" tidak ditemukan.`
    );
  }

  console.log(
    `Memilih merchant: ${dataMerchant.nama}`
  );

  await pilihMerchant(
    page,
    dataMerchant.value
  );

  console.log(
    `✅ Merchant ${namaCabangERP} berhasil dipilih.`
  );

  // ================= BUKA DAILY RECAP =================

  const dailyRecapUrl =
    `${MINUTES_DAILY_RECAP_URL}` +
    `?date=${encodeURIComponent(
      tanggalMinutes
    )}`;

  console.log(
    `Membuka Daily Recap ${tanggalMinutes}...`
  );

  await page.goto(
    dailyRecapUrl,
    {
      waitUntil: "domcontentloaded",
      timeout: 30000
    }
  );

  await page.waitForTimeout(7000);

  // ================= AMBIL DATA =================

  const ringkasan =
    await bacaRingkasanDaily(page);

  const headerKpi =
    await bacaHeaderKpiDaily(page);

  const settlement =
    await bacaSettlement(page);

  const expenses =
    await bacaExpenses(page);

  // SOURCE OF TRUTH count KPI:
  // gunakan kartu resmi Daily Recap (#sparks) dari bacaRingkasanDaily().
  // bacaHeaderKpiDaily() tetap dipakai untuk NET SERVICES / NET PRODUCTS
  // dan sebagai diagnostic compare saja. Jangan override count KPI dengan
  // hasil scan #content/body karena halaman dapat memuat label serupa.
  const dailyRecapTransactionMinutes = Number(
    ringkasan.transaction || 0
  );

  // OWNER PASS rule 2026-09-05:
// TRANSACTION canonical wajib mengikuti angka TRANSACTION resmi
// pada Daily Recap Minutes. Customer/Guest adalah visitor breakdown,
// bukan rumus jumlah transaksi; satu visitor bisa membuat >1 transaksi
// (mis. transaksi produk/minuman terpisah).
const transactionMinutes =
  dailyRecapTransactionMinutes;

console.log(
  `TRX Daily Recap canonical = ${transactionMinutes}`
);
const customerMinutes = Number(
    ringkasan.customer || 0
  );
  const servicesMinutes = Number(
    ringkasan.services || 0
  );

  const headerCountDiagnostic = {
    transaction: headerKpi.transaction,
    customer: headerKpi.customer,
    services: headerKpi.services
  };

  if (
    headerCountDiagnostic.transaction != null &&
    Number(headerCountDiagnostic.transaction) !== dailyRecapTransactionMinutes
  ) {
    console.warn(
      `⚠️ Diagnostic TRANSACTION berbeda: card=${dailyRecapTransactionMinutes}, header=${headerCountDiagnostic.transaction}. Card Daily Recap dipakai.`
    );
  }

  if (
    headerCountDiagnostic.customer != null &&
    Number(headerCountDiagnostic.customer) !== customerMinutes
  ) {
    console.warn(
      `⚠️ Diagnostic CUSTOMER berbeda: card=${customerMinutes}, header=${headerCountDiagnostic.customer}. Card Daily Recap dipakai.`
    );
  }

  if (
    headerCountDiagnostic.services != null &&
    Number(headerCountDiagnostic.services) !== servicesMinutes
  ) {
    console.warn(
      `⚠️ Diagnostic SERVICES berbeda: card=${servicesMinutes}, header=${headerCountDiagnostic.services}. Card Daily Recap dipakai.`
    );
  }

  if (
    headerKpi.netServicesSales == null ||
    headerKpi.netProductsSales == null
  ) {
    throw new Error(
      "Header KPI NET SERVICES SALES / NET PRODUCTS SALES tidak terbaca."
    );
  }

  const netServicesSales =
    Number(headerKpi.netServicesSales || 0);
  const netProductsSales =
    Number(headerKpi.netProductsSales || 0);

  if (
    netServicesSales > 0 &&
    customerMinutes === 0 &&
    transactionMinutes === 0 &&
    servicesMinutes === 0
  ) {
    throw new Error(
      "KPI TRANSACTION / CUSTOMER / SERVICES tidak terbaca."
    );
  }

  console.log(
    "Ringkasan Daily Recap:"
  );

  console.log({
    netServicesSales,
    netProductsSales,
    transaction: transactionMinutes,
    customer: customerMinutes,
    services: servicesMinutes
  });

  // ================= HITUNG NILAI =================

  const grossRevenue =
    settlement["Gross Revenue"] || 0;

  // Guard integritas Minutes:
  // Dashboard mendefinisikan omzet = service + produk.
  // Jangan simpan split service/product jika jumlahnya tidak sama dengan
  // Gross Revenue Minutes untuk tanggal+cabang yang sama.
  const splitRevenue =
    Number(netServicesSales || 0) +
    Number(netProductsSales || 0);

  if (
    Math.round(splitRevenue) !==
    Math.round(Number(grossRevenue || 0))
  ) {
    throw new Error(
      `REVENUE SPLIT MISMATCH: Net Services (${formatRupiah(netServicesSales)}) + Net Products (${formatRupiah(netProductsSales)}) = ${formatRupiah(splitRevenue)}, tetapi Gross Revenue Minutes = ${formatRupiah(grossRevenue)}. Data tidak disimpan.`
    );
  }

  const revenue =
    settlement["Revenue"] || 0;

  const cashPayment =
    settlement["Cash Payment"] || 0;

  const nonCash =
    (settlement["Gopay"] || 0) +
    (settlement["QRIS"] || 0) +
    (settlement["QR / TF"] || 0) +
    (settlement["Transfer"] || 0) +
    (settlement["Visa"] || 0);

  const totalPayment =
    settlement["Total Payment"] || 0;

  const totalShare =
    settlement["Total Share"] || 0;

  const cashIn =
    settlement["Cash In"] || 0;

  const cashOut =
    settlement["Cash Out"] || 0;

  // Product Cost / Net Revenue: Minutes source-of-truth with original sign.
  // Do NOT Math.abs / clamp product_cost. NETT ERP = nett + product_cost.
  const productCost =
    settlement["Product Cost"] || 0;

  const thirdPartyCharges =
    settlement["3rd Party Charges"] || 0;

  const netRevenue =
    settlement["Net Revenue"] || 0;

  // Prinsip foundation ERP:
  // - nett_revenue / product_cost / cash_payment dari Minutes apa adanya.
  // - NETT ERP (dashboard) = nett_revenue + product_cost (once).
  // - non_cash = jumlah metode non-tunai resmi Minutes
  //   (Gopay + QRIS + QR/TF + Transfer + Visa) karena Minutes tidak
  //   punya satu field "Non Cash" tunggal.
  // - Kolom real_cash tetap ada di schema untuk kompatibilitas modul
  //   lama, tetapi sync TIDAK mengisi / men-derive / menaruh
  //   Cash Payment ke real_cash.

  const keteranganCashOut = expenses
    .map((item) => {
      const nominal =
        Number(item.nominal || 0)
          .toLocaleString("id-ID");

      const kasir = item.kasir
        ? ` - Kasir: ${item.kasir}`
        : "";

      return (
        `${item.keterangan}` +
        ` Rp${nominal}${kasir}`
      );
    })
    .join("; ");

  // ================= SIMPAN MINUTES_DAILY =================

  const dataMinutesDaily = {
    tanggal: tanggalDatabase,

    // Nama cabang persis seperti di Minutes
    cabang: namaCabangMinutes,

    gross_revenue: grossRevenue,

    revenue: revenue,

    cash_payment: cashPayment,

    non_cash: nonCash,

    total_payment: totalPayment,

    total_share: totalShare,

    cash_in: cashIn,

    cash_out: cashOut,

    detail_cash_out: expenses,

    product_cost: productCost,

    third_party_charges:
      thirdPartyCharges,

    net_revenue: netRevenue
  };

  console.log(
    "Data minutes_daily:"
  );

  console.log(dataMinutesDaily);

  const {
    error: errorMinutesDaily
  } = await supabase
    .from("minutes_daily")
    .upsert(
      dataMinutesDaily,
      {
        onConflict: "tanggal,cabang"
      }
    );

  if (errorMinutesDaily) {
    throw new Error(
      `minutes_daily gagal: ${errorMinutesDaily.message}`
    );
  }

  // ================= SIMPAN DAILY_RECAP_SOURCE =================
  // Partial upsert saja. JANGAN kirim field LOCK:
  // real_cash, share_produk, nett_produk, share_cukur, sales.

  if (!bolehTulisDailyRecap(tanggalDatabase)) {
    console.log(
      `SKIP daily_recap_source: ${tanggalDatabase} < LIVE_START ${LIVE_START} (historical LOCK).`
    );
  } else {
    const dataDailyRecapSource = {
      cabang_id: cabangERP.id,
      tanggal: tanggalDatabase,
      service: netServicesSales,
      produk: netProductsSales,
      nett_revenue: Number(netRevenue || 0),
      cash_payment: Number(cashPayment || 0),
      non_cash: Number(nonCash || 0),
      cash_out: Number(cashOut || 0),
      keterangan_cash_out: keteranganCashOut,
      product_cost: Number(productCost || 0),
      customer_minutes: customerMinutes,
      ...(transactionMinutes == null ? {} : { transaction_minutes: transactionMinutes }),
      services_minutes: servicesMinutes,
      synced_at: new Date().toISOString()
    };

    console.log(
      "Data daily_recap_source (partial):"
    );

    console.log(dataDailyRecapSource);

    const {
      error: errorDailyRecap
    } = await supabase
      .from("daily_recap_source")
      .upsert(
        dataDailyRecapSource,
        {
          onConflict: "cabang_id,tanggal"
        }
      );

    if (errorDailyRecap) {
      throw new Error(
        `daily_recap_source gagal: ${errorDailyRecap.message}`
      );
    }
  }

  console.log("");
  console.log(
    `✅ ${namaCabangERP} berhasil disinkronkan.`
  );

  console.log(
    `Services     : ${servicesMinutes}`
  );

  console.log(
    `Net Services : ${formatRupiah(
      netServicesSales
    )}`
  );

  console.log(
    `Net Products : ${formatRupiah(
      netProductsSales
    )}`
  );

  console.log(
    `Gross Revenue: ${formatRupiah(
      grossRevenue
    )}`
  );

  console.log(
    `Share Cukur  : ${formatRupiah(
      totalShare
    )}`
  );

  console.log(
    `Cash Out     : ${formatRupiah(
      cashOut
    )}`
  );

  console.log(
    `Net Revenue  : ${formatRupiah(
      netRevenue
    )}`
  );

  console.log(
    `Non Cash     : ${formatRupiah(
      nonCash
    )}`
  );

  console.log(
    `Cash Payment : ${formatRupiah(
      cashPayment
    )}`
  );

  console.log(
    `Product Cost : ${formatRupiah(
      productCost
    )}`
  );

  // Screenshot untuk pemeriksaan
  await simpanScreenshot(
    page,
    `sync-${tanggalDatabase}-${namaFileAman(
      namaCabangERP
    )}.png`
  );

  return {
    cabang: namaCabangERP,
    namaMinutes: namaCabangMinutes,
    status: "BERHASIL",
    services: servicesMinutes,
    omzet: grossRevenue,
    netRevenue: netRevenue,
    cashPayment: cashPayment,
    productCost: productCost
  };
}

// ================= UPDATE STATUS SYNC =================

async function updateStatusSync(
  hasilSync
) {
  const berhasil = hasilSync.filter(
    (item) =>
      item.status === "BERHASIL"
  ).length;

  const gagal = hasilSync.filter(
    (item) =>
      item.status === "GAGAL"
  ).length;

  const statusSync =
    gagal === 0
      ? "berhasil"
      : berhasil > 0
        ? "sebagian_gagal"
        : "gagal";

  const pesanSync =
    gagal === 0
      ? `Semua ${berhasil} cabang berhasil disinkronkan.`
      : `${berhasil} cabang berhasil dan ${gagal} cabang gagal.`;

  const waktuSync = new Date();

  const waktuBerikutnya = new Date(
    waktuSync.getTime() +
    10 * 60 * 1000
  );

  const {
    error
  } = await supabase
    .from("sync_status")
    .update({
      last_sync_at:
        waktuSync.toISOString(),

      status: statusSync,

      berhasil: berhasil,

      gagal: gagal,

      total_cabang:
        hasilSync.length,

      pesan: pesanSync,

      next_sync_at:
        waktuBerikutnya.toISOString(),

      updated_at:
        waktuSync.toISOString()
    })
    .eq("id", 1);

  if (error) {
    console.error(
      `Gagal update sync_status: ${error.message}`
    );

    return;
  }

  console.log(
    "✅ Status sinkronisasi diperbarui."
  );
}

// ================= MAIN =================

const browser = await chromium.launch({
  headless: HEADLESS,
  slowMo: SLOW_MO
});

const context =
  await browser.newContext({
    viewport: {
      width: 1500,
      height: 900
    }
  });

const page =
  await context.newPage();

const hasilSync = [];

try {
  console.log("");
  console.log(
    "===================================="
  );

  console.log(
    "SYNC MINUTES VAX ERP DIMULAI"
  );

  console.log(
    `Tanggal: ${tanggalDatabase}`
  );

  console.log(
    "===================================="
  );

  const daftarCabang =
    await ambilCabangAktif();

  await loginMinutes(page);

  await ubahKeMerchant(page);

  for (
    let index = 0;
    index < daftarCabang.length;
    index++
  ) {
    const cabang =
      daftarCabang[index];

    try {
      const hasil =
        await prosesCabang(
          page,
          cabang,
          index,
          daftarCabang.length
        );

      hasilSync.push(hasil);

    } catch (errorCabang) {
      console.error("");
      console.error(
        `❌ ${cabang.nama_cabang} gagal.`
      );

      console.error(
        errorCabang.message
      );

      hasilSync.push({
        cabang:
          cabang.nama_cabang,

        namaMinutes:
          cabang.nama_minutes,

        status: "GAGAL",

        services: 0,

        omzet: 0,

        netRevenue: 0,

        cashPayment: 0,

        productCost: 0,

        error:
          errorCabang.message
      });

      await simpanScreenshot(
        page,
        `sync-gagal-${index + 1}-${namaFileAman(
          cabang.nama_cabang
        )}.png`
      );

      // Kembali ke dashboard agar
      // cabang berikutnya tetap bisa diproses
      await page.goto(
        MINUTES_DASHBOARD_URL,
        {
          waitUntil:
            "domcontentloaded",

          timeout: 30000
        }
      ).catch(() => {});

      await page.waitForTimeout(2500);
    }
  }

  console.log("");
  console.log(
    "===================================="
  );

  console.log(
    "HASIL SYNC SEMUA CABANG"
  );

  console.log(
    "===================================="
  );

  console.table(hasilSync);

  const berhasil =
    hasilSync.filter(
      (item) =>
        item.status === "BERHASIL"
    ).length;

  const gagal =
    hasilSync.filter(
      (item) =>
        item.status === "GAGAL"
    ).length;

  console.log(
    `Berhasil : ${berhasil} cabang`
  );

  console.log(
    `Gagal    : ${gagal} cabang`
  );

  console.log(
    `Tanggal  : ${tanggalDatabase}`
  );

  await updateStatusSync(
    hasilSync
  );

  if (gagal === 0) {
    console.log(
      "✅ SEMUA CABANG BERHASIL DISINKRONKAN."
    );
  } else {
    console.log(
      "⚠️ SYNC SELESAI, TETAPI ADA CABANG YANG GAGAL."
    );
  }

} catch (error) {
  console.error("");
  console.error(
    "❌ SYNC UTAMA GAGAL"
  );

  console.error(
    error.message
  );

  await simpanScreenshot(
    page,
    "sync-utama-gagal.png"
  );

  process.exitCode = 1;

} finally {
  await browser.close();
}
