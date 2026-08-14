import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!email || !password || !supabaseUrl || !supabaseServiceKey) {
  console.error("ENV Minutes/Supabase belum lengkap.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function normalisasi(teks = "") {
  return String(teks).trim().replace(/\s+/g, " ").toLowerCase();
}

function tanggalWIB() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");

  return {
    db: `${year}-${month}-${day}`,
    minutesRange: `${month}/${day}/${year} - ${month}/${day}/${year}`
  };
}

function providerIdDariHref(href = "") {
  const match = String(href).match(/providersalesdetail\/(\d+)/i);
  return match?.[1] || null;
}

const { db: activityDate, minutesRange } = tanggalWIB();
console.log(`Provider Sales Daily sync: ${activityDate}`);

const { data: daftarCabang, error: cabangError } = await supabase
  .from("cabang")
  .select("id,nama_cabang,nama_minutes,urutan,aktif")
  .eq("aktif", true)
  .not("nama_minutes", "is", null)
  .order("urutan", { ascending: true });

if (cabangError) throw cabangError;

const cabangAktif = (daftarCabang || []).filter(
  (c) => Number(c.id) >= 1 && Number(c.id) <= 10 && c.nama_minutes
);

const { data: daftarKaryawan, error: karyawanError } = await supabase
  .from("karyawan")
  .select("id,nama_karyawan,cabang_id,aktif")
  .eq("aktif", true);

if (karyawanError) throw karyawanError;

const { data: mappingProviderLama, error: mappingError } = await supabase
  .from("provider_sales_source")
  .select("provider_minutes_id,employee_id")
  .not("provider_minutes_id", "is", null)
  .not("employee_id", "is", null);

if (mappingError) throw mappingError;

const employeeByProviderId = new Map();
for (const row of mappingProviderLama || []) {
  if (row.provider_minutes_id && row.employee_id) {
    employeeByProviderId.set(String(row.provider_minutes_id), row.employee_id);
  }
}

function cariEmployee(providerMinutesId, providerName, cabangId) {
  if (providerMinutesId && employeeByProviderId.has(String(providerMinutesId))) {
    return employeeByProviderId.get(String(providerMinutesId));
  }

  const nama = normalisasi(providerName);
  const branchMatch = (daftarKaryawan || []).find(
    (k) => Number(k.cabang_id) === Number(cabangId) && normalisasi(k.nama_karyawan) === nama
  );
  if (branchMatch) return branchMatch.id;

  const globalMatches = (daftarKaryawan || []).filter(
    (k) => normalisasi(k.nama_karyawan) === nama
  );
  return globalMatches.length === 1 ? globalMatches[0].id : null;
}

async function simpanProvider(row) {
  const { data: existing, error: findError } = await supabase
    .from("provider_sales_daily_source")
    .select("id")
    .eq("activity_date", row.activity_date)
    .eq("cabang_id", row.cabang_id)
    .eq("provider_name_normalized", row.provider_name_normalized)
    .maybeSingle();

  if (findError) throw findError;

  if (existing?.id) {
    const { error } = await supabase
      .from("provider_sales_daily_source")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
    return "UPDATED";
  }

  const { error } = await supabase
    .from("provider_sales_daily_source")
    .insert(row);
  if (error) throw error;
  return "INSERTED";
}

async function bacaDetailProvider(page) {
  return page.evaluate(() => {
    const parse = (value) => {
      const raw = String(value || "").replace(/[^\d-]/g, "");
      return raw ? Number(raw) : 0;
    };

    const tables = [...document.querySelectorAll("table")];

    for (const table of tables) {
      const bodyRows = [...table.querySelectorAll("tbody tr")];
      if (!bodyRows.length) continue;

      const headers = [...table.querySelectorAll("thead th")]
        .map((h) => h.textContent.trim().toLowerCase());

      const headerIndex = (name) => headers.findIndex((h) => h === name);
      const headerContains = (name) => headers.findIndex((h) => h.includes(name));

      let iService = headerIndex("service");
      let iShare = headerContains("revenue share");
      let iSub = headerContains("sub income");
      let iTotal = headerContains("total income");

      const firstCells = [...bodyRows[0].querySelectorAll("td")];

      if ((iService < 0 || iShare < 0) && firstCells.length >= 9) {
        iService = 3;
        iShare = 6;
        iSub = 7;
        iTotal = 8;
      }

      if (iService < 0 || iShare < 0) continue;

      let totalService = 0;
      let providerShare = 0;
      let subIncome = 0;
      let totalIncome = 0;
      let validRows = 0;

      for (const tr of bodyRows) {
        const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
        if (!cells.length) continue;
        if (cells.length <= Math.max(iService, iShare)) continue;

        totalService += parse(cells[iService]);
        providerShare += parse(cells[iShare]);
        subIncome += iSub >= 0 && cells.length > iSub ? parse(cells[iSub]) : 0;
        totalIncome += iTotal >= 0 && cells.length > iTotal ? parse(cells[iTotal]) : 0;
        validRows++;
      }

      if (validRows > 0) {
        return { totalService, providerShare, subIncome, totalIncome, validRows };
      }
    }

    return null;
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const hasil = [];

try {
  await page.goto("https://minutesapps.com/dashboard216a/user/login", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(3500);

  if (page.url().includes("/user/login")) {
    throw new Error("Login Minutes gagal.");
  }

  const dropdownRole = page.locator('select[name="switchrole"]');
  await dropdownRole.waitFor({ state: "attached", timeout: 20000 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.evaluate(() => {
      const select = document.querySelector('select[name="switchrole"]');
      if (!select?.form) throw new Error("Dropdown Group/Merchant tidak ditemukan.");
      select.value = "3";
      select.form.submit();
    })
  ]);

  await page.waitForTimeout(2500);

  for (const cabang of cabangAktif) {
    try {
      await page.goto("https://minutesapps.com/dashboard216a/", {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
      await page.waitForTimeout(1500);

      const merchant = await page.evaluate((namaDicari) => {
        const select = document.querySelector('select[name="merchant"]');
        if (!select) return null;
        const norm = (t) => String(t).trim().replace(/\s+/g, " ").toLowerCase();
        const option = [...select.options].find((o) => norm(o.textContent) === norm(namaDicari));
        return option ? { value: option.value, nama: option.textContent.trim() } : null;
      }, cabang.nama_minutes);

      if (!merchant) {
        throw new Error(`Merchant tidak ditemukan: ${cabang.nama_minutes}`);
      }

      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
        page.evaluate((value) => {
          const select = document.querySelector('select[name="merchant"]');
          if (!select?.form) throw new Error("Dropdown merchant tidak ditemukan.");
          select.value = value;
          select.form.submit();
        }, merchant.value)
      ]);

      await page.waitForTimeout(1800);

      const summaryUrl =
        "https://minutesapps.com/dashboard216a/report/providersales/" +
        `?range=${encodeURIComponent(minutesRange)}`;

      await page.goto(summaryUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4000);

      const providers = await page.locator("table tbody tr").evaluateAll((rows) => {
        const found = [];
        const seen = new Set();

        for (const row of rows) {
          const link = row.querySelector('a[href*="providersalesdetail"]');
          if (!link) continue;
          const cells = [...row.querySelectorAll("td")];
          const name = cells[0]?.textContent?.trim() || link.textContent?.trim() || "";
          const href = link.getAttribute("href") || "";
          if (!name || !href) continue;
          const key = `${name}|${href}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ name, href });
        }
        return found;
      });

      if (!providers.length) {
        hasil.push({ cabang: cabang.nama_cabang, status: "NO_DATA", providers: 0 });
        console.log(`ℹ️ ${cabang.nama_cabang}: tidak ada Provider Sales hari ini`);
        continue;
      }

      let saved = 0;

      for (const provider of providers) {
        const providerMinutesId = providerIdDariHref(provider.href);
        const detailUrl = new URL(provider.href, "https://minutesapps.com");
        detailUrl.searchParams.set("range", minutesRange);

        await page.goto(detailUrl.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(3000);

        const detail = await bacaDetailProvider(page);

        if (!detail) {
          console.warn(`⚠️ Detail tidak terbaca: ${provider.name}`);
          continue;
        }

        const employeeId = cariEmployee(providerMinutesId, provider.name, cabang.id);
        const now = new Date().toISOString();

        const row = {
          activity_date: activityDate,
          cabang_id: cabang.id,
          cabang_minutes_name: cabang.nama_minutes,
          provider_name_raw: provider.name,
          provider_name_normalized: normalisasi(provider.name),
          provider_minutes_id: providerMinutesId,
          employee_id: employeeId,
          mapping_status: employeeId ? "MATCHED" : "UNMAPPED",
          total_service: detail.totalService,
          provider_share: detail.providerShare,
          sub_income: detail.subIncome,
          total_income: detail.totalIncome,
          control_total_provider_income: detail.totalIncome,
          control_total_provider_share: detail.providerShare,
          control_total_service: detail.totalService,
          source: "MINUTES_PROVIDER_SALES_DAILY",
          synced_at: now,
          updated_at: now
        };

        await simpanProvider(row);
        saved++;

        console.log(`  ✅ ${provider.name}: ${detail.totalService} service | share Rp${Number(detail.providerShare).toLocaleString("id-ID")}`);
      }

      hasil.push({
        cabang: cabang.nama_cabang,
        status: saved > 0 ? "OK" : "PARSER_EMPTY",
        providers: saved
      });

      console.log(`✅ ${cabang.nama_cabang}: ${saved} provider tersimpan`);
    } catch (error) {
      hasil.push({ cabang: cabang.nama_cabang, status: "ERROR", error: error.message });
      console.error(`❌ ${cabang.nama_cabang}: ${error.message}`);
    }
  }
} finally {
  await browser.close();
}

console.table(hasil);

const gagal = hasil.filter((x) => x.status === "ERROR" || x.status === "PARSER_EMPTY");
if (gagal.length) process.exitCode = 1;
