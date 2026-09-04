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

const sb = createClient(supabaseUrl, supabaseServiceKey);

function normalisasi(teks = "") {
  return String(teks).trim().replace(/\s+/g, " ").toLowerCase();
}

function resolveDate() {
  const arg = process.argv[2]?.trim();
  const parse = value => {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw new Error("Format tanggal harus YYYY-MM-DD");
    const [, y, mo, d] = m;
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthLabel = MONTHS[Number(mo) - 1];
    if (!monthLabel) throw new Error(`Bulan tidak valid: ${mo}`);
    const label = `${d} ${monthLabel} ${y}`;
    const usDate = `${mo}/${d}/${y}`;
    return {
      db: value,
      recapDate: label,
      reportRange: `${usDate} - ${usDate}`
    };
  };

  if (arg) return parse(arg);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  return parse(`${get("year")}-${get("month")}-${get("day")}`);
}

const {
  db: activityDate,
  recapDate,
  reportRange
} = resolveDate();

console.log(`Provider Product Share Daily sync: ${activityDate}`);

const { data: cabangs, error: cabErr } = await sb
  .from("cabang")
  .select("id,nama_cabang,nama_minutes,urutan,aktif")
  .eq("aktif", true)
  .gte("id", 1)
  .lte("id", 10)
  .not("nama_minutes", "is", null)
  .order("urutan");
if (cabErr) throw cabErr;

// Payroll historis harus tetap bisa menemukan karyawan yang sekarang NONAKTIF.
// Jangan filter aktif=true di source mapping.
const { data: karyawan, error: karErr } = await sb
  .from("karyawan")
  .select("id,nama_karyawan,cabang_id,aktif,jabatan");
if (karErr) throw karErr;

function cariEmployee(providerName, cabangId) {
  const nama = normalisasi(providerName);
  const branch = (karyawan || []).find(
    k => Number(k.cabang_id) === Number(cabangId) && normalisasi(k.nama_karyawan) === nama
  );
  if (branch) return branch.id;
  const global = (karyawan || []).filter(k => normalisasi(k.nama_karyawan) === nama);
  return global.length === 1 ? global[0].id : null;
}

async function bacaProviderProductReport(page) {
  return page.evaluate(({ expectedRange, expectedPeriod }) => {
    const clean = value => String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const normalize = value => clean(value).toLowerCase();

    const parseNumber = value => {
      const raw = String(value || "").replace(/[^\d-]/g, "");
      return raw ? Number(raw) : 0;
    };

    const rawBodyText = String(document.body?.innerText || "");
    const bodyText = clean(rawBodyText);
    const lines = rawBodyText
      .split(/\n+/)
      .map(clean)
      .filter(Boolean);

    const titleOk = /provider sales report by product/i.test(bodyText);
    const expectedPeriodLine = `Report Period ${expectedPeriod} - ${expectedPeriod}`;
    const actualPeriodLine = lines.find(line => /^report period\b/i.test(line)) || "";
    const periodOk =
      normalize(actualPeriodLine) === normalize(expectedPeriodLine) ||
      bodyText.includes(expectedRange);

    if (!titleOk) {
      return { ok: false, reason: "Halaman Provider Sales Report by Product tidak terbaca." };
    }

    if (!periodOk) {
      return {
        ok: false,
        reason: `Periode report tidak sesuai. Target ${expectedPeriodLine}; terbaca ${actualPeriodLine || "(kosong)"}.`
      };
    }

    let headerShare = null;

    for (let i = 0; i < lines.length; i++) {
      if (normalize(lines[i]) !== "total provider share") continue;
      const candidate = lines[i + 1] || "";
      if (/\d/.test(candidate)) {
        headerShare = parseNumber(candidate);
        break;
      }
    }

    // Fallback untuk layout Minutes yang menaruh label+nilai di elemen yang sama.
    if (headerShare == null) {
      for (const el of document.querySelectorAll("li.sparks-info, ul#sparks li, h5")) {
        const text = clean(el.textContent || "");
        if (!/total provider share/i.test(text)) continue;
        const m = text.match(/total provider share\s*(?:idr)?\s*([\d.,]+)/i);
        if (m) {
          headerShare = parseNumber(m[1]);
          break;
        }
      }
    }

    if (headerShare == null) {
      return { ok: false, reason: "TOTAL PROVIDER SHARE tidak terbaca." };
    }

    let reportTable = null;
    let headerMap = null;

    for (const table of document.querySelectorAll("table")) {
      const headers = [...table.querySelectorAll("thead th")].map(th => normalize(th.textContent));
      const idxProvider = headers.findIndex(h => h.includes("provider name"));
      const idxTotal = headers.findIndex(h => h === "total" || h.includes("total"));
      const idxRevenueShare = headers.findIndex(h => h.includes("revenue share"));
      const idxIncome = headers.findIndex(h => h === "income" || h.includes("income"));

      if (idxProvider < 0 || idxTotal < 0 || idxRevenueShare < 0 || idxIncome < 0) {
        continue;
      }

      reportTable = table;
      headerMap = { idxProvider, idxTotal, idxRevenueShare, idxIncome };
      break;
    }

    if (!reportTable || !headerMap) {
      if (headerShare === 0 && /no data available in table/i.test(bodyText)) {
        return { ok: true, headerShare: 0, rows: [] };
      }
      return { ok: false, reason: "Tabel Provider Product tidak ditemukan." };
    }

    const rows = [];

    for (const tr of reportTable.querySelectorAll("tbody tr")) {
      const cells = [...tr.querySelectorAll("td")];
      if (!cells.length) continue;

      const providerCell = cells[headerMap.idxProvider];
      const providerName = clean(providerCell?.textContent || "");
      if (!providerName || /no data available/i.test(providerName)) continue;

      const qty = parseNumber(cells[headerMap.idxTotal]?.textContent || "");
      const revenueShare = parseNumber(cells[headerMap.idxRevenueShare]?.textContent || "");
      const income = parseNumber(cells[headerMap.idxIncome]?.textContent || "");

      const providerLink = providerCell?.querySelector('a[href*="/providerreport/product/"]');
      const href = providerLink?.getAttribute("href") || "";
      const providerMinutesId = href.match(/\/providerreport\/product\/(\d+)(?:\/|\?|$)/i)?.[1] || null;

      if (revenueShare <= 0) continue;

      rows.push({
        providerName,
        providerMinutesId,
        qty,
        income,
        revenueShare,
        href
      });
    }

    const detailShare = rows.reduce(
      (sum, row) => sum + Number(row.revenueShare || 0),
      0
    );

    if (detailShare !== Number(headerShare || 0)) {
      return {
        ok: false,
        reason: `INTEGRITY GAP: header share ${headerShare}, detail share ${detailShare}.`,
        headerShare,
        detailShare,
        rows
      };
    }

    return {
      ok: true,
      headerShare: Number(headerShare || 0),
      rows
    };
  }, {
    expectedRange: reportRange,
    expectedPeriod: recapDate
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.setDefaultTimeout(25000);
const hasil = [];

try {
  await page.goto("https://minutesapps.com/dashboard216a/user/login", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(3000);
  if (page.url().includes("/user/login")) throw new Error("Login Minutes gagal.");

  await page.locator('select[name="switchrole"]').waitFor({ state: "attached" });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page.evaluate(() => {
      const s = document.querySelector('select[name="switchrole"]');
      s.value = "3";
      s.form.submit();
    })
  ]);

  for (const cabang of cabangs || []) {
    try {
      await page.goto("https://minutesapps.com/dashboard216a/", {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      const merchant = await page.evaluate(nama => {
        const s = document.querySelector('select[name="merchant"]');
        if (!s) return null;
        const norm = t => String(t || "").trim().replace(/\s+/g, " ").toLowerCase();
        return [...s.options].find(o => norm(o.textContent) === norm(nama))?.value || null;
      }, cabang.nama_minutes);
      if (!merchant) throw new Error(`Merchant tidak ditemukan: ${cabang.nama_minutes}`);

      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
        page.evaluate(value => {
          const s = document.querySelector('select[name="merchant"]');
          s.value = value;
          s.form.submit();
        }, merchant)
      ]);

      // SOURCE OF TRUTH Share Produk:
      // gunakan report resmi Provider Sales Report by Product untuk SATU HARI,
      // bukan tabel/anchor turunan Daily Recap. Ini mencegah row hilang/parsial.
      const reportUrl =
        `https://minutesapps.com/dashboard216a/providerreport/product` +
        `?range=${encodeURIComponent(reportRange)}`;

      await page.goto(reportUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
      await page.waitForTimeout(2500);

      const report = await bacaProviderProductReport(page);
      if (!report?.ok) {
        throw new Error(report?.reason || "Provider Product Report gagal dibaca.");
      }

      const providerRows = report.rows || [];
      const authoritativeShare = Number(report.headerShare || 0);
      const now = new Date().toISOString();

      const rowsToSave = providerRows.map(r => {
        const employeeId = cariEmployee(r.providerName, cabang.id);
        return {
          period_start: activityDate,
          period_end: activityDate,
          cabang_id: cabang.id,
          cabang_minutes_name: cabang.nama_minutes,
          product_name: "Provider Product Recap",
          provider_name_raw: r.providerName,
          provider_name_normalized: normalisasi(r.providerName),
          provider_minutes_id: r.providerMinutesId,
          employee_id: employeeId,
          mapping_status: employeeId ? "MATCHED" : "UNMAPPED",
          qty: r.qty,
          revenue_share: r.revenueShare,
          source: "MINUTES_PROVIDER_PRODUCT_RECAP_DAILY",
          synced_at: now,
          updated_at: now
        };
      });

      const totalShareDetail = rowsToSave.reduce(
        (sum, r) => sum + Number(r.revenue_share || 0),
        0
      );

      if (totalShareDetail !== authoritativeShare) {
        throw new Error(
          `INTEGRITY GAP ${cabang.nama_cabang}: Minutes header Rp${authoritativeShare.toLocaleString("id-ID")} != detail Rp${totalShareDetail.toLocaleString("id-ID")}. Tidak ada write.`
        );
      }

      // Pastikan row canonical tersedia sebelum mengubah source detail.
      const { data: recapRow, error: recapFindErr } = await sb
        .from("daily_recap_source")
        .select("id,share_produk")
        .eq("tanggal", activityDate)
        .eq("cabang_id", cabang.id)
        .maybeSingle();
      if (recapFindErr) throw recapFindErr;
      if (!recapRow?.id) {
        throw new Error(`daily_recap_source belum ada untuk ${activityDate}`);
      }

      // Idempotent per tanggal+cabang. Hanya source provider-product harian ini yang diganti.
      const { error: delErr } = await sb
        .from("product_sales_source")
        .delete()
        .eq("period_start", activityDate)
        .eq("period_end", activityDate)
        .eq("cabang_id", cabang.id)
        .eq("source", "MINUTES_PROVIDER_PRODUCT_RECAP_DAILY");
      if (delErr) throw delErr;

      if (rowsToSave.length) {
        const { error: insErr } = await sb.from("product_sales_source").insert(rowsToSave);
        if (insErr) throw insErr;
      }

      // AUTHORITATIVE CANONICAL WRITE:
      // Minutes Provider Sales Report by Product adalah sumber resmi Share Produk.
      // Setelah header == detail tervalidasi, sinkronkan daily_recap_source.share_produk.
      // Nett Produk tidak ditulis di sini; DailyDataEngine tetap menghitung Produk - Share Produk.
      const { error: recapUpdateErr } = await sb
        .from("daily_recap_source")
        .update({
          share_produk: authoritativeShare,
          updated_at: now
        })
        .eq("id", recapRow.id);
      if (recapUpdateErr) throw recapUpdateErr;

      const beforeShare = Number(recapRow.share_produk || 0);
      const delta = authoritativeShare - beforeShare;

      hasil.push({
        cabang: cabang.nama_cabang,
        status: "OK",
        rows: rowsToSave.length,
        minutes_share: authoritativeShare,
        before_share: beforeShare,
        delta,
        reconcile: "MATCH"
      });

      console.log(
        `✅ ${cabang.nama_cabang}: Minutes Rp${authoritativeShare.toLocaleString("id-ID")} / detail Rp${totalShareDetail.toLocaleString("id-ID")} / ERP before Rp${beforeShare.toLocaleString("id-ID")} / delta Rp${delta.toLocaleString("id-ID")}`
      );
    } catch (error) {
      hasil.push({ cabang: cabang.nama_cabang, status: "ERROR", error: error.message });
      console.error(`❌ ${cabang.nama_cabang}: ${error.message}`);
    }
  }
} finally {
  await browser.close();
}

console.table(hasil);
if (hasil.some(x => x.status === "ERROR")) process.exitCode = 1;
