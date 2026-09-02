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
    const date = new Date(`${y}-${mo}-${d}T00:00:00+07:00`);
    const label = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
    return { db: value, recapDate: label };
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

const { db: activityDate, recapDate } = resolveDate();
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

async function bacaProviderProductRecap(page) {
  return page.evaluate(() => {
    const parseNumber = value => {
      const raw = String(value || "").replace(/[^\d-]/g, "");
      return raw ? Number(raw) : 0;
    };

    const hasil = [];
    const anchors = [...document.querySelectorAll('a[href*="/providerreport/product/"]')];

    for (const a of anchors) {
      const tr = a.closest("tr");
      if (!tr) continue;

      const cells = [...tr.querySelectorAll("td")].map(td => td.textContent.trim());
      if (cells.length < 4) continue;

      const href = a.getAttribute("href") || "";
      const providerMinutesId = href.match(/\/providerreport\/product\/(\d+)\//i)?.[1] || null;
      const providerName = (a.textContent || cells[0] || "").trim();
      const qty = parseNumber(cells[1]);
      const income = parseNumber(cells[2]);
      const revenueShare = parseNumber(cells[3]);

      if (!providerName || revenueShare <= 0) continue;
      hasil.push({ providerName, providerMinutesId, qty, income, revenueShare, href });
    }

    return hasil;
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.setDefaultTimeout(20000);
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

      const recapUrl = `https://minutesapps.com/dashboard216a/report/recap/?date=${encodeURIComponent(recapDate)}`;
      await page.goto(recapUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);

      const providerRows = await bacaProviderProductRecap(page);
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

      // Idempotent per tanggal+cabang. Source historis/snapshot lama tidak disentuh.
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

      // CANONICAL PROTECTION:
      // share_produk pada daily_recap_source adalah source-of-truth harian.
      // Presenter provider hanya RECONCILE, tidak boleh overwrite canonical.
      const { data: recapRow, error: recapFindErr } = await sb
        .from("daily_recap_source")
        .select("id,share_produk")
        .eq("tanggal", activityDate)
        .eq("cabang_id", cabang.id)
        .maybeSingle();
      if (recapFindErr) throw recapFindErr;
      if (!recapRow?.id) throw new Error(`daily_recap_source belum ada untuk ${activityDate}`);

      const canonicalShare = Number(recapRow.share_produk || 0);
      const selisih = canonicalShare - totalShareDetail;
      const reconcileStatus = selisih === 0 ? "MATCH" : "GAP";

      hasil.push({
        cabang: cabang.nama_cabang,
        status: "OK",
        rows: rowsToSave.length,
        detail_share: totalShareDetail,
        canonical_share: canonicalShare,
        selisih,
        reconcile: reconcileStatus
      });

      const prefix = reconcileStatus === "MATCH" ? "✅" : "⚠️";
      console.log(
        `${prefix} ${cabang.nama_cabang}: detail Rp${totalShareDetail.toLocaleString("id-ID")} / canonical Rp${canonicalShare.toLocaleString("id-ID")} / selisih Rp${selisih.toLocaleString("id-ID")} (${rowsToSave.length} row)`
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
