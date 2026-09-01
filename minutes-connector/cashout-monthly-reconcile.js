/**
 * =========================================================
 * VAX ERP — Cash Out Monthly Reconciliation V1
 * =========================================================
 * Minutes = source of truth Cash Out (Expense Data).
 * Recheck tanggal 1 s.d. hari ini WIB pada bulan aktif.
 * Login Minutes SATU KALI, pilih merchant, loop tanggal.
 *
 * PATCH existing rows only. JANGAN insert.
 * JANGAN sentuh Product Sales / KPI Ultimate / Provider Sales /
 * UI Cash Out LOCK / formula finance lain / sync.js.
 *
 * Update diizinkan:
 *   minutes_daily        : cash_out, detail_cash_out, net_revenue
 *   daily_recap_source   : cash_out, keterangan_cash_out, nett_revenue,
 *                          sync_status=SYNCED, synced_at, updated_at
 *
 * net_revenue / nett_revenue:
 *   delta = newCashOut - oldCashOut
 *   newNet = oldNet - delta
 *
 * Usage:
 *   DRY_RUN=true CABANG="Vax wijaya kalijati" DATE_FROM=2026-08-01 DATE_TO=2026-08-31 node cashout-monthly-reconcile.js
 *   LIVE=true DRY_RUN=false HEADLESS=true node cashout-monthly-reconcile.js
 *
 * Default: bulan aktif tgl 1 s.d. hari ini WIB, semua cabang aktif.
 * DRY_RUN default TRUE jika dijalankan manual tanpa LIVE=true.
 * Production write hanya jika DRY_RUN=false.
 * =========================================================
 */

import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const LIVE = String(process.env.LIVE || "").toLowerCase() === "true";
const DRY_RUN = String(process.env.DRY_RUN || "true").toLowerCase() !== "false";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() === "true";
const ONLY_CABANG = String(process.env.CABANG || "").trim();
const DATE_FROM_ENV = String(process.env.DATE_FROM || "").trim();
const DATE_TO_ENV = String(process.env.DATE_TO || "").trim();

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const MINUTES_LOGIN_URL = "https://minutesapps.com/dashboard216a/user/login";
const MINUTES_DASHBOARD_URL = "https://minutesapps.com/dashboard216a/";
const MINUTES_DAILY_RECAP_URL =
  "https://minutesapps.com/dashboard216a/report/recap/";

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function jakartaTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function assertISODate(value, label) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`${label} harus YYYY-MM-DD, didapat: ${value}`);
  }
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const iso = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  if (iso !== s) throw new Error(`${label} tanggal tidak valid: ${value}`);
  return s;
}

function isoDateOnly(value) {
  return String(value || "").slice(0, 10);
}

function firstOfMonthISO(iso) {
  const s = assertISODate(iso, "tanggal");
  return `${s.slice(0, 7)}-01`;
}

function enumerateDates(startISO, endISO) {
  const start = assertISODate(startISO, "DATE_FROM");
  const end = assertISODate(endISO, "DATE_TO");
  if (start > end) throw new Error(`DATE_FROM (${start}) > DATE_TO (${end})`);
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + 1);
    cur = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  return out;
}

function toMinutesDate(iso) {
  const [y, m, d] = assertISODate(iso, "tanggal").split("-");
  return `${d} ${MONTHS_EN[Number(m) - 1]} ${y}`;
}

function resolveRange() {
  const today = jakartaTodayISO();
  const monthStart = firstOfMonthISO(today);
  const from = DATE_FROM_ENV ? assertISODate(DATE_FROM_ENV, "DATE_FROM") : monthStart;
  let to = DATE_TO_ENV ? assertISODate(DATE_TO_ENV, "DATE_TO") : today;
  if (to > today) to = today;

  if (!DRY_RUN && process.env.ALLOW_HISTORICAL_CASHOUT_REPAIR !== "true") {
    if (from < monthStart) {
      throw new Error(
        `LIVE write diblok: DATE_FROM ${from} di luar bulan aktif (mulai ${monthStart}). Historical month jangan disentuh.`
      );
    }
    if (to.slice(0, 7) !== today.slice(0, 7)) {
      throw new Error(
        `LIVE write diblok: DATE_TO ${to} bukan bulan aktif ${today.slice(0, 7)}.`
      );
    }
  }

  return { from, to, today, monthStart, dates: enumerateDates(from, to) };
}

function rupiahKeAngka(teks = "") {
  const angka = String(teks).replace(/[^\d-]/g, "");
  return angka ? Number(angka) : 0;
}

function formatRupiah(nilai = 0) {
  return `Rp${Number(nilai || 0).toLocaleString("id-ID")}`;
}

function normalisasiNama(teks = "") {
  return String(teks || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeMerchantName(teks = "") {
  return normalisasiNama(teks);
}

function isFloatingCabang(c) {
  return String(c?.nama_cabang || "").toLowerCase().includes("floating");
}

function filterOperationalCabang(rows) {
  return (rows || []).filter((c) => {
    if (!c?.id || !c?.nama_cabang) return false;
    if (c.aktif === false) return false;
    if (isFloatingCabang(c)) return false;
    const minutesName = String(c.nama_minutes ?? "").trim();
    if (!minutesName) return false;
    return true;
  });
}

function filterExpenses(rawRows) {
  return (rawRows || [])
    .map((item) => ({
      keterangan: String(item.keterangan || "").trim(),
      nominal: rupiahKeAngka(item.nominalText),
      kasir: String(item.kasir || "").trim()
    }))
    .filter((item) => {
      const nama = normalisasiNama(item.keterangan);
      return (
        item.keterangan &&
        !nama.includes("opening cash") &&
        item.nominal > 0
      );
    });
}

function formatKeteranganCashOut(expenses) {
  return (expenses || [])
    .map((item) => {
      const nominal = Number(item.nominal || 0).toLocaleString("id-ID");
      const kasir = item.kasir ? ` - Kasir: ${item.kasir}` : "";
      return `${item.keterangan} Rp${nominal}${kasir}`;
    })
    .join("; ");
}

function moneyEq(a, b) {
  return Math.round(Number(a || 0)) === Math.round(Number(b || 0));
}

function requireCredentials() {
  if (!email || !password) {
    throw new Error("MINUTES_EMAIL / MINUTES_PASSWORD belum ada di .env");
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY belum ada di .env");
  }
}

async function loadOperationalCabang(supabase) {
  const { data, error } = await supabase
    .from("cabang")
    .select("id,nama_cabang,nama_minutes,aktif,urutan")
    .eq("aktif", true)
    .not("nama_minutes", "is", null)
    .order("urutan", { ascending: true, nullsFirst: false });

  if (error) throw new Error(`Gagal membaca cabang: ${error.message}`);

  let list = filterOperationalCabang(data || []);
  if (ONLY_CABANG) {
    const target = normalizeMerchantName(ONLY_CABANG);
    list = list.filter(
      (c) =>
        normalizeMerchantName(c.nama_minutes) === target ||
        normalizeMerchantName(c.nama_cabang) === target ||
        normalizeMerchantName(c.nama_minutes).includes(target) ||
        normalizeMerchantName(c.nama_cabang).includes(target)
    );
    if (!list.length) {
      throw new Error(`Tidak ada cabang yang cocok dengan CABANG="${ONLY_CABANG}"`);
    }
  }
  return list;
}

async function loadExistingRows(supabase, cabangList, from, to) {
  const ids = cabangList.map((c) => c.id);
  const names = cabangList.map((c) => String(c.nama_minutes || "").trim());

  const recapByKey = new Map();
  const minutesByKey = new Map();

  if (ids.length) {
    const { data, error } = await supabase
      .from("daily_recap_source")
      .select("cabang_id,tanggal,cash_out,nett_revenue,keterangan_cash_out")
      .in("cabang_id", ids)
      .gte("tanggal", from)
      .lte("tanggal", to);

    if (error) {
      throw new Error(`Gagal baca daily_recap_source: ${error.message}`);
    }
    for (const row of data || []) {
      recapByKey.set(
        `${row.cabang_id}|${isoDateOnly(row.tanggal)}`,
        row
      );
    }
  }

  if (names.length) {
    const { data, error } = await supabase
      .from("minutes_daily")
      .select("tanggal,cabang,cash_out,net_revenue,detail_cash_out")
      .in("cabang", names)
      .gte("tanggal", from)
      .lte("tanggal", to);

    if (error) {
      throw new Error(`Gagal baca minutes_daily: ${error.message}`);
    }
    for (const row of data || []) {
      minutesByKey.set(
        `${normalisasiNama(row.cabang)}|${isoDateOnly(row.tanggal)}`,
        row
      );
    }
  }

  return { recapByKey, minutesByKey };
}

async function loginMinutes(page) {
  console.log("[CASHOUT RECONCILE] login Minutes (sekali)");
  await page.goto(MINUTES_LOGIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.locator('input[name="email"]').waitFor({
    state: "visible",
    timeout: 20000
  });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(4000);
  if (page.url().includes("/user/login")) {
    throw new Error("Login Minutes gagal. Periksa email dan password.");
  }
  console.log("[CASHOUT RECONCILE] login OK");
}

async function ubahKeMerchant(page) {
  const dropdownRole = page.locator('select[name="switchrole"]');
  await dropdownRole.waitFor({ state: "attached", timeout: 20000 });
  await Promise.all([
    page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 30000
    }).catch(() => {}),
    page.evaluate(() => {
      const select = document.querySelector('select[name="switchrole"]');
      if (!select || !select.form) {
        throw new Error("Dropdown Group/Merchant tidak ditemukan.");
      }
      select.value = "3";
      select.form.submit();
    })
  ]);
  await page.waitForTimeout(3000);
}

async function cariMerchant(page, namaCabangMinutes) {
  await page.locator('select[name="merchant"]').waitFor({
    state: "attached",
    timeout: 20000
  });
  return page.evaluate((namaDicari) => {
    const select = document.querySelector('select[name="merchant"]');
    if (!select) return null;
    const norm = (t) =>
      String(t || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
    const target = norm(namaDicari);
    const option = [...select.options].find(
      (item) => norm(item.textContent) === target
    );
    if (!option) return null;
    return { value: option.value, nama: option.textContent.trim() };
  }, namaCabangMinutes);
}

async function pilihMerchant(page, nilaiCabang) {
  await Promise.all([
    page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 30000
    }).catch(() => {}),
    page.evaluate((nilai) => {
      const select = document.querySelector('select[name="merchant"]');
      if (!select || !select.form) {
        throw new Error("Dropdown merchant tidak ditemukan.");
      }
      select.value = nilai;
      select.form.submit();
    }, nilaiCabang)
  ]);
  await page.waitForTimeout(2500);
}

async function bacaExpenses(page) {
  const rawRows = await page.evaluate(() => {
    const table = document.querySelector(
      'table[data-dt-title="Expense Data"]'
    );
    if (!table) return [];
    return [...table.querySelectorAll("tbody tr")].map((row) => {
      const cells = row.querySelectorAll("td");
      return {
        keterangan: cells[0]?.textContent?.trim() || "",
        nominalText: cells[1]?.textContent?.trim() || "",
        kasir: cells[2]?.textContent?.trim() || ""
      };
    });
  });
  return filterExpenses(rawRows);
}

async function bukaDailyRecap(page, tanggalMinutes) {
  const url =
    `${MINUTES_DAILY_RECAP_URL}?date=${encodeURIComponent(tanggalMinutes)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page
    .locator("#settlementrecap")
    .waitFor({ state: "visible", timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
}


function isoKeMinutesRange(tanggal) {
  const [y, m, d] = String(tanggal).split("-");
  return `${m}/${d}/${y}`;
}

async function bacaTotalExpenseBulanan(page, dates) {
  const dari = isoKeMinutesRange(dates[0]);
  const sampai = isoKeMinutesRange(dates[dates.length - 1]);

  const base = MINUTES_DAILY_RECAP_URL.split("/report/recap/")[0];
  const url = `${base}/expensemanagement/data?range=${dari}%20-%20${sampai}`;

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  await page.waitForTimeout(1500);

  let total = 0;
  let halaman = 0;

  while (halaman < 100) {
    halaman++;

    const rows = page.locator("table tbody tr");
    const jumlah = await rows.count();

    for (let i = 0; i < jumlah; i++) {
      const cells = rows.nth(i).locator("td");
      if (await cells.count() < 4) continue;

      const debitText = await cells.nth(3).innerText().catch(() => "");
      const debit = Number(String(debitText).replace(/[^0-9.-]/g, "")) || 0;
      total += debit;
    }

    const next = page.locator(
      'a:has-text("Next"), li.next a, .paginate_button.next'
    ).last();

    if (!(await next.count())) break;

    const cls = await next.getAttribute("class").catch(() => "");
    const parentCls = await next.locator("..").getAttribute("class").catch(() => "");

    if (
      String(cls).includes("disabled") ||
      String(parentCls).includes("disabled")
    ) break;

    await next.click();
    await page.waitForTimeout(500);
  }

  return total;
}

async function patchMinutesDaily(supabase, namaMinutes, tanggal, payload) {
  const { data, error } = await supabase
    .from("minutes_daily")
    .update({
      cash_out: payload.cash_out,
      detail_cash_out: payload.detail_cash_out,
      net_revenue: payload.net_revenue
    })
    .eq("tanggal", tanggal)
    .eq("cabang", namaMinutes)
    .select("tanggal,cabang");

  if (error) {
    throw new Error(`minutes_daily update gagal: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `minutes_daily update 0 row (${namaMinutes} ${tanggal}) — abort, no insert`
    );
  }
}

async function patchDailyRecap(supabase, cabangId, tanggal, payload) {
  const { data, error } = await supabase
    .from("daily_recap_source")
    .update({
      cash_out: payload.cash_out,
      keterangan_cash_out: payload.keterangan_cash_out,
      nett_revenue: payload.nett_revenue,
      sync_status: "SYNCED",
      synced_at: payload.synced_at,
      updated_at: payload.updated_at
    })
    .eq("cabang_id", cabangId)
    .eq("tanggal", tanggal)
    .select("cabang_id,tanggal");

  if (error) {
    throw new Error(`daily_recap_source update gagal: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `daily_recap_source update 0 row (cabang_id=${cabangId} ${tanggal}) — abort, no insert`
    );
  }
}

async function prosesCabang({
  page,
  supabase,
  cabang,
  dates,
  recapByKey,
  minutesByKey,
  index,
  total
}) {
  const namaCabangERP = String(cabang.nama_cabang || "").trim();
  const namaCabangMinutes = String(cabang.nama_minutes || "").trim();

  console.log("");
  console.log("====================================");
  console.log(`CABANG ${index + 1}/${total}: ${namaCabangERP}`);
  console.log(`Minutes : ${namaCabangMinutes}`);
  console.log("====================================");

  await page.goto(MINUTES_DASHBOARD_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.waitForTimeout(2000);

  const dataMerchant = await cariMerchant(page, namaCabangMinutes);
  if (!dataMerchant) {
    throw new Error(`Merchant "${namaCabangMinutes}" tidak ditemukan.`);
  }

  await pilihMerchant(page, dataMerchant.value);
  console.log(`[CASHOUT RECONCILE] merchant dipilih: ${dataMerchant.nama}`);

  const hasil = [];

  const erpTotalBulanan = dates.reduce((sum, tanggal) => {
    const recap = recapByKey.get(`${cabang.id}|${tanggal}`);
    return sum + Number(recap?.cash_out || 0);
  }, 0);

  const minutesTotalBulanan = await bacaTotalExpenseBulanan(page, dates);
  const deltaBulanan = minutesTotalBulanan - erpTotalBulanan;

  console.log(
    `[CASHOUT MONTHLY GATE] ${namaCabangERP} | ERP ${formatRupiah(erpTotalBulanan)} | Minutes ${formatRupiah(minutesTotalBulanan)} | delta ${formatRupiah(deltaBulanan)}`
  );

  if (moneyEq(erpTotalBulanan, minutesTotalBulanan)) {
    console.log(
      `[CASHOUT MONTHLY GATE] MATCH ${namaCabangERP} — skip scan harian`
    );

    return [{
      cabang: namaCabangERP,
      tanggal: null,
      status: "MONTHLY_MATCH",
      minutes: minutesTotalBulanan,
      supabase: erpTotalBulanan,
      delta: 0
    }];
  }

  console.log(
    `[CASHOUT MONTHLY GATE] MISMATCH ${namaCabangERP} — lanjut scan harian`
  );

  for (const tanggal of dates) {
    const tanggalMinutes = toMinutesDate(tanggal);
    await bukaDailyRecap(page, tanggalMinutes);
    const expenses = await bacaExpenses(page);
    const minutesTotal = expenses.reduce(
      (sum, item) => sum + Number(item.nominal || 0),
      0
    );

    const recap = recapByKey.get(`${cabang.id}|${tanggal}`) || null;
    const minutesRow =
      minutesByKey.get(`${normalisasiNama(namaCabangMinutes)}|${tanggal}`) ||
      null;

    const supabaseCashOut = recap
      ? Number(recap.cash_out || 0)
      : minutesRow
        ? Number(minutesRow.cash_out || 0)
        : null;

    const recapMatch = recap ? moneyEq(minutesTotal, recap.cash_out) : null;
    const minutesMatch = minutesRow
      ? moneyEq(minutesTotal, minutesRow.cash_out)
      : null;

    if (!recap && !minutesRow) {
      console.warn(
        `[CASHOUT RECONCILE] WARNING SKIP insert: row existing tidak ditemukan | ${namaCabangERP} ${tanggal}`
      );
      hasil.push({
        cabang: namaCabangERP,
        tanggal,
        status: "SKIP",
        minutes: minutesTotal,
        supabase: null,
        delta: null,
        reason: "existing row not found"
      });
      continue;
    }

    const recapDiffers = recap && recapMatch === false;
    const minutesDiffers = minutesRow && minutesMatch === false;
    const differs = Boolean(recapDiffers || minutesDiffers);

    if (!differs) {
      console.log(
        `${tanggal} | MATCH | ${namaCabangERP} | ${formatRupiah(minutesTotal)}`
      );
      hasil.push({
        cabang: namaCabangERP,
        tanggal,
        status: "MATCH",
        minutes: minutesTotal,
        supabase: supabaseCashOut,
        delta: 0
      });
      continue;
    }

    const oldRecapCash = recap ? Number(recap.cash_out || 0) : minutesTotal;
    const oldMinutesCash = minutesRow
      ? Number(minutesRow.cash_out || 0)
      : minutesTotal;
    const deltaRecap = minutesTotal - oldRecapCash;
    const deltaMinutes = minutesTotal - oldMinutesCash;
    const reportOld = recap ? oldRecapCash : oldMinutesCash;
    const reportDelta = minutesTotal - reportOld;

    console.log(
      `${tanggal} | MISMATCH | ${namaCabangERP} | Minutes ${formatRupiah(minutesTotal)} | Supabase ${formatRupiah(reportOld)} | delta ${formatRupiah(reportDelta)}`
    );

    if (DRY_RUN) {
      hasil.push({
        cabang: namaCabangERP,
        tanggal,
        status: "MISMATCH",
        minutes: minutesTotal,
        supabase: reportOld,
        delta: reportDelta,
        would_write: {
          minutes_daily: Boolean(minutesDiffers),
          daily_recap_source: Boolean(recapDiffers)
        }
      });
      continue;
    }

    const nowIso = new Date().toISOString();

    if (minutesDiffers) {
      const oldNet = Number(minutesRow.net_revenue || 0);
      await patchMinutesDaily(supabase, namaCabangMinutes, tanggal, {
        cash_out: minutesTotal,
        detail_cash_out: expenses,
        net_revenue: oldNet - deltaMinutes
      });
    } else if (!minutesRow) {
      console.warn(
        `[CASHOUT RECONCILE] WARNING SKIP minutes_daily (row tidak ada) | ${namaCabangERP} ${tanggal}`
      );
    }

    if (recapDiffers) {
      const oldNett = Number(recap.nett_revenue || 0);
      await patchDailyRecap(supabase, cabang.id, tanggal, {
        cash_out: minutesTotal,
        keterangan_cash_out: formatKeteranganCashOut(expenses),
        nett_revenue: oldNett - deltaRecap,
        synced_at: nowIso,
        updated_at: nowIso
      });
    } else if (!recap) {
      console.warn(
        `[CASHOUT RECONCILE] WARNING SKIP daily_recap_source (row tidak ada) | ${namaCabangERP} ${tanggal}`
      );
    }

    hasil.push({
      cabang: namaCabangERP,
      tanggal,
      status: "PATCHED",
      minutes: minutesTotal,
      supabase: reportOld,
      delta: reportDelta
    });
  }

  return hasil;
}

function printSummary(hasil, range, cabangList) {
  const checked = hasil.length;
  const match = hasil.filter((r) => r.status === "MATCH").length;
  const mismatch = hasil.filter(
    (r) => r.status === "MISMATCH" || r.status === "PATCHED"
  ).length;
  const skip = hasil.filter((r) => r.status === "SKIP").length;
  const writes = hasil.filter((r) => r.status === "PATCHED").length;

  console.log("");
  console.log("========================================");
  console.log("CASH OUT MONTHLY RECONCILIATION SUMMARY");
  console.log("========================================");
  console.log(`RANGE        : ${range.from} → ${range.to}`);
  console.log(`CABANG       : ${cabangList.length}`);
  console.log(`CHECKED      : ${checked} date×branch`);
  console.log(`MATCH        : ${match}`);
  console.log(`MISMATCH     : ${mismatch}`);
  console.log(`SKIP         : ${skip}`);
  console.log(`DRY_RUN      : ${DRY_RUN}`);
  console.log(`WRITES       : ${DRY_RUN ? 0 : writes}`);
  console.log(`PRODUCTION WRITE : ${DRY_RUN ? "NO" : "YES"}`);

  const mismatches = hasil.filter(
    (r) => r.status === "MISMATCH" || r.status === "PATCHED"
  );
  if (mismatches.length) {
    console.log("");
    console.log("MISMATCH DETAIL:");
    for (const row of mismatches) {
      console.log(
        `  ${row.cabang} | ${row.tanggal} | Minutes ${formatRupiah(row.minutes)} | Supabase ${formatRupiah(row.supabase)} | delta ${formatRupiah(row.delta)}`
      );
    }
  }

  if (DRY_RUN) {
    console.log("");
    console.log("ZERO WRITE (DRY_RUN).");
  }
}

async function launchBrowser() {
  const launchOpts = { headless: HEADLESS, slowMo: HEADLESS ? 0 : 50 };
  const channel = String(process.env.PLAYWRIGHT_CHANNEL || "").trim();
  if (channel) launchOpts.channel = channel;
  try {
    return await chromium.launch(launchOpts);
  } catch (err) {
    if (channel) throw err;
    return await chromium.launch({ ...launchOpts, channel: "chrome" });
  }
}

async function main() {
  requireCredentials();
  const range = resolveRange();
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const cabangList = await loadOperationalCabang(supabase);

  if (!cabangList.length) {
    throw new Error("Tidak ada cabang aktif yang memiliki nama_minutes.");
  }

  console.log("[CASHOUT RECONCILE] start");
  console.log(`[CASHOUT RECONCILE] LIVE=${LIVE} DRY_RUN=${DRY_RUN} HEADLESS=${HEADLESS}`);
  console.log(`[CASHOUT RECONCILE] range ${range.from} → ${range.to} (${range.dates.length} hari)`);
  console.log(`[CASHOUT RECONCILE] cabang ${cabangList.length}`);
  cabangList.forEach((c, i) =>
    console.log(`  ${i + 1}. ${c.nama_cabang} ← ${c.nama_minutes}`)
  );
  console.log(`[CASHOUT RECONCILE] PRODUCTION WRITE = ${DRY_RUN ? "NO" : "YES"}`);

  const { recapByKey, minutesByKey } = await loadExistingRows(
    supabase,
    cabangList,
    range.from,
    range.to
  );

  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);

  const hasil = [];
  try {
    await loginMinutes(page);
    await ubahKeMerchant(page);

    for (let i = 0; i < cabangList.length; i++) {
      const cabang = cabangList[i];
      try {
        const rows = await prosesCabang({
          page,
          supabase,
          cabang,
          dates: range.dates,
          recapByKey,
          minutesByKey,
          index: i,
          total: cabangList.length
        });
        hasil.push(...rows);
      } catch (err) {
        console.error(
          `[CASHOUT RECONCILE] FAIL ${cabang.nama_cabang}: ${err.message}`
        );
        for (const tanggal of range.dates) {
          hasil.push({
            cabang: cabang.nama_cabang,
            tanggal,
            status: "SKIP",
            minutes: null,
            supabase: null,
            delta: null,
            reason: err.message
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  printSummary(hasil, range, cabangList);
}

main().catch((err) => {
  console.error(`[CASHOUT RECONCILE] FATAL: ${err.message}`);
  process.exit(1);
});
