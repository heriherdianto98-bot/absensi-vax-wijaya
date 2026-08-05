import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

// ================= ENV =================

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!email || !password) {
  console.error("Email atau password Minutes belum terbaca dari .env");
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "SUPABASE_URL atau SUPABASE_SERVICE_KEY belum terbaca dari .env"
  );
  process.exit(1);
}

// ================= SUPABASE =================

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

// ================= TANGGAL WIB =================

function nomorBulan(namaBulan) {
  const bulan = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12"
  };

  return bulan[namaBulan];
}

function ambilTanggalWIB() {
  const bagianTanggal = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  ).formatToParts(new Date());

  const hari = bagianTanggal.find(
    (item) => item.type === "day"
  )?.value;

  const bulan = bagianTanggal.find(
    (item) => item.type === "month"
  )?.value;

  const tahun = bagianTanggal.find(
    (item) => item.type === "year"
  )?.value;

  if (!hari || !bulan || !tahun) {
    throw new Error("Tanggal WIB gagal dibuat.");
  }

  return {
    tanggalDatabase:
      `${tahun}-${nomorBulan(bulan)}-${hari}`,

    tanggalMinutes:
      `${hari} ${bulan} ${tahun}`
  };
}

const {
  tanggalDatabase,
  tanggalMinutes
} = ambilTanggalWIB();

// ================= HELPER =================

function rupiahKeAngka(teks = "") {
  const angka = String(teks).replace(/[^\d-]/g, "");

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

// ================= AMBIL CABANG DARI SUPABASE =================

console.log("Mengambil daftar cabang aktif dari Supabase...");

const {
  data: daftarCabang,
  error: errorDaftarCabang
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

if (errorDaftarCabang) {
  console.error(
    `Gagal membaca tabel cabang: ${errorDaftarCabang.message}`
  );

  process.exit(1);
}

const cabangSiapSync = (daftarCabang || []).filter(
  (item) =>
    item.nama_cabang &&
    item.nama_minutes
);

if (cabangSiapSync.length === 0) {
  console.error(
    "Tidak ada cabang aktif yang memiliki nama_minutes."
  );

  process.exit(1);
}

console.log(
  `${cabangSiapSync.length} cabang aktif berhasil dibaca dari Supabase.`
);

console.table(
  cabangSiapSync.map((item) => ({
    urutan: item.urutan,
    kode: item.kode_cabang,
    namaERP: item.nama_cabang,
    namaMinutes: item.nama_minutes
  }))
);

// ================= BROWSER =================

const browser = await chromium.launch({
  headless: false,
  slowMo: 100
});

const page = await browser.newPage({
  viewport: {
    width: 1500,
    height: 900
  }
});

const hasilSync = [];

try {
  // ================= LOGIN =================

  console.log("Membuka Minutes...");

  await page.goto(
    "https://minutesapps.com/dashboard216a/user/login",
    {
      waitUntil: "domcontentloaded",
      timeout: 30000
    }
  );

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
    throw new Error("Login Minutes gagal.");
  }

  console.log("Login berhasil.");

  // ================= GROUP KE MERCHANT =================

  console.log("Mengubah Group menjadi Merchant...");

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

  console.log("Level Merchant berhasil dipilih.");

  // ================= LOOP CABANG =================

  for (
    let index = 0;
    index < cabangSiapSync.length;
    index++
  ) {
    const cabangERP = cabangSiapSync[index];

    const namaCabangERP =
      cabangERP.nama_cabang.trim();

    const namaCabangMinutes =
      cabangERP.nama_minutes.trim();

    console.log("");
    console.log("====================================");

    console.log(
      `CABANG ${index + 1} DARI ${cabangSiapSync.length}`
    );

    console.log(`ERP     : ${namaCabangERP}`);
    console.log(`Minutes : ${namaCabangMinutes}`);

    console.log("====================================");

    try {
      // ================= CARI DROPDOWN MERCHANT =================

      const merchantSelect = page.locator(
        'select[name="merchant"]'
      );

      await merchantSelect.waitFor({
        state: "attached",
        timeout: 20000
      });

      // Cari option berdasarkan nama_minutes
      const dataCabangMinutes = await page.evaluate(
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

          const option = [...select.options].find(
            (item) =>
              normalisasi(item.textContent) === target
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

      if (!dataCabangMinutes) {
        throw new Error(
          `Nama Minutes "${namaCabangMinutes}" tidak ditemukan.`
        );
      }

      console.log(
        `Memilih cabang Minutes: ${dataCabangMinutes.nama}`
      );

      // ================= PILIH CABANG =================

      await Promise.all([
        page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 30000
        }),

        page.evaluate((nilaiCabang) => {
          const select = document.querySelector(
            'select[name="merchant"]'
          );

          if (!select || !select.form) {
            throw new Error(
              "Dropdown cabang tidak ditemukan."
            );
          }

          select.value = nilaiCabang;
          select.form.submit();
        }, dataCabangMinutes.value)
      ]);

      await page.waitForTimeout(2500);

      console.log("Cabang berhasil dipilih.");

      // ================= DAILY RECAP =================

      const dailyRecapUrl =
        "https://minutesapps.com/dashboard216a/report/recap/" +
        `?date=${encodeURIComponent(tanggalMinutes)}`;

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

      const settlementTable = page.locator(
        "#settlementrecap"
      );

      await settlementTable.waitFor({
        state: "visible",
        timeout: 30000
      });

      // ================= BACA SETTLEMENT =================

      const settlementRows = await page
        .locator("#settlementrecap tbody tr")
        .evaluateAll((rows) =>
          rows.map((row) => {
            const cells = row.querySelectorAll("td");

            return {
              label:
                cells[0]?.textContent?.trim() || "",

              nilai:
                cells[1]?.textContent?.trim() || ""
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

      // ================= BACA EXPENSE =================

      const expenseTable = page.locator(
        'table[data-dt-title="Expense Data"]'
      );

      let expenseRows = [];

      if (
        await expenseTable
          .isVisible()
          .catch(() => false)
      ) {
        expenseRows = await expenseTable
          .locator("tbody tr")
          .evaluateAll((rows) =>
            rows.map((row) => {
              const cells = row.querySelectorAll("td");

              return {
                keterangan:
                  cells[0]?.textContent?.trim() || "",

                nominalText:
                  cells[1]?.textContent?.trim() || "",

                kasir:
                  cells[2]?.textContent?.trim() || ""
              };
            })
          );
      }

      const expenses = expenseRows
        .map((item) => ({
          keterangan: item.keterangan,

          nominal: rupiahKeAngka(
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

      // ================= DATA SUPABASE =================

      const dataSupabase = {
        tanggal: tanggalDatabase,

        // Nama persis sesuai merchant di Minutes
        cabang: namaCabangMinutes,

        gross_revenue:
          settlement["Gross Revenue"] || 0,

        revenue:
          settlement["Revenue"] || 0,

        cash_payment:
          settlement["Cash Payment"] || 0,

        non_cash:
          (settlement["Gopay"] || 0) +
          (settlement["QRIS"] || 0) +
          (settlement["QR / TF"] || 0) +
          (settlement["Transfer"] || 0) +
          (settlement["Visa"] || 0),

        total_payment:
          settlement["Total Payment"] || 0,

        total_share:
          settlement["Total Share"] || 0,

        cash_in:
          settlement["Cash In"] || 0,

        cash_out:
          settlement["Cash Out"] || 0,

        detail_cash_out: expenses,

        product_cost:
          settlement["Product Cost"] || 0,

        third_party_charges:
          settlement["3rd Party Charges"] || 0,

        net_revenue:
          settlement["Net Revenue"] || 0
      };

      console.log("Data yang akan disimpan:");

      console.log(dataSupabase);

      // ================= UPSERT =================

      const {
        data,
        error
      } = await supabase
        .from("minutes_daily")
        .upsert(
          dataSupabase,
          {
            onConflict: "tanggal,cabang"
          }
        )
        .select();

      if (error) {
        throw new Error(
          `Supabase gagal: ${error.message}`
        );
      }

      console.log(
        `✅ ${namaCabangERP} berhasil disimpan.`
      );

      hasilSync.push({
        cabang: namaCabangERP,
        namaMinutes: namaCabangMinutes,
        status: "BERHASIL",
        omzet: dataSupabase.gross_revenue,
        netRevenue: dataSupabase.net_revenue
      });

      // ================= SCREENSHOT =================

      const namaFile = namaFileAman(
        namaCabangERP
      );

      await page.screenshot({
        path:
          `sync-${tanggalDatabase}-${namaFile}.png`,

        fullPage: true
      });

    } catch (errorCabang) {

      console.error(`❌ ${namaCabangERP} gagal.`);
      console.error(`Minutes : ${namaCabangMinutes}`);
      console.error(`Error   : ${errorCabang.message}`);
    
      hasilSync.push({
        cabang: namaCabangERP,
        namaMinutes: namaCabangMinutes,
        status: "GAGAL",
        omzet: 0,
        netRevenue: 0,
        error: errorCabang.message
      });

      await page.screenshot({
        path:
          `sync-gagal-${index + 1}.png`,

        fullPage: true
      });

      // Kembali ke dashboard supaya dropdown merchant tersedia
      await page.goto(
        "https://minutesapps.com/dashboard216a/",
        {
          waitUntil: "domcontentloaded",
          timeout: 30000
        }
      ).catch(() => {});

      await page.waitForTimeout(2500);
    }
  }

  // ================= HASIL AKHIR =================

  console.log("");
  console.log("====================================");
  console.log("HASIL SYNC SEMUA CABANG");
  console.log("====================================");

  console.table(hasilSync);

  const berhasil = hasilSync.filter(
    (item) => item.status === "BERHASIL"
  ).length;

  const gagal = hasilSync.filter(
    (item) => item.status === "GAGAL"
  ).length;

  console.log(`Berhasil : ${berhasil} cabang`);
  console.log(`Gagal    : ${gagal} cabang`);
  console.log(`Tanggal  : ${tanggalDatabase}`);

  if (berhasil === cabangSiapSync.length) {
    console.log(
      "✅ SEMUA CABANG BERHASIL DISINKRONKAN."
    );
  } else {
    console.log(
      "⚠️ ADA CABANG YANG BELUM BERHASIL."
    );
  }
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
  waktuSync.getTime() + 10 * 60 * 1000
);

const { error: errorStatusSync } = await supabase
  .from("sync_status")
  .update({
    last_sync_at: waktuSync.toISOString(),
    status: statusSync,
    berhasil: berhasil,
    gagal: gagal,
    total_cabang: cabangSiapSync.length,
    pesan: pesanSync,
    next_sync_at: waktuBerikutnya.toISOString(),
    updated_at: waktuSync.toISOString()
  })
  .eq("id", 1);

if (errorStatusSync) {
  console.error(
    `Gagal update sync_status: ${errorStatusSync.message}`
  );
} else {
  console.log("Status sinkronisasi berhasil diperbarui.");
}
  
} catch (error) {
  console.error("SYNC UTAMA GAGAL");
  console.error(error.message);

  await page.screenshot({
    path: "sync-utama-gagal.png",
    fullPage: true
  });

} finally {
  await browser.close();
}