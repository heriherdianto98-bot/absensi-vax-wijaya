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
  if (arg) {
    const m = arg.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw new Error("Format tanggal harus YYYY-MM-DD");
    const [, y, mo, d] = m;
    return { db: arg, range: `${mo}/${d}/${y} - ${mo}/${d}/${y}` };
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  return { db: `${y}-${mo}-${d}`, range: `${mo}/${d}/${y} - ${mo}/${d}/${y}` };
}

function providerIdDariHref(href = "") {
  return String(href).match(/providersalesdetail\/(\d+)/i)?.[1] || null;
}

const { db: activityDate, range: minutesRange } = resolveDate();
console.log(`Share Produk Daily sync: ${activityDate}`);

const { data: cabangs, error: cabErr } = await sb
  .from("cabang")
  .select("id,nama_cabang,nama_minutes,urutan,aktif")
  .eq("aktif", true)
  .gte("id", 1)
  .lte("id", 10)
  .not("nama_minutes", "is", null)
  .order("urutan");
if (cabErr) throw cabErr;

const { data: karyawan, error: karErr } = await sb
  .from("karyawan")
  .select("id,nama_karyawan,cabang_id,aktif")
  .eq("aktif", true);
if (karErr) throw karErr;

const { data: providerMap, error: mapErr } = await sb
  .from("provider_sales_source")
  .select("provider_minutes_id,employee_id")
  .not("provider_minutes_id", "is", null)
  .not("employee_id", "is", null);
if (mapErr) throw mapErr;

const employeeByProviderId = new Map();
for (const row of providerMap || []) {
  employeeByProviderId.set(String(row.provider_minutes_id), row.employee_id);
}

function cariEmployee(providerMinutesId, providerName, cabangId) {
  if (providerMinutesId && employeeByProviderId.has(String(providerMinutesId))) {
    return employeeByProviderId.get(String(providerMinutesId));
  }
  const nama = normalisasi(providerName);
  const branch = (karyawan || []).find(
    k => Number(k.cabang_id) === Number(cabangId) && normalisasi(k.nama_karyawan) === nama
  );
  if (branch) return branch.id;
  const global = (karyawan || []).filter(k => normalisasi(k.nama_karyawan) === nama);
  return global.length === 1 ? global[0].id : null;
}

async function bacaProductShare(page) {
  return page.evaluate(() => {
    const parse = value => {
      const raw = String(value || "").replace(/[^\d-]/g, "");
      return raw ? Number(raw) : 0;
    };

    const hasil = [];
    for (const table of document.querySelectorAll("table")) {
      const headers = [...table.querySelectorAll("thead th")].map(h =>
        h.textContent.trim().toLowerCase()
      );
      if (!headers.length) continue;

      const idxContains = term => headers.findIndex(h => h.includes(term));
      const iProduct = idxContains("product");
      const iShare = idxContains("revenue share");
      if (iProduct < 0 || iShare < 0) continue;

      let iQty = idxContains("qty");
      if (iQty < 0) iQty = idxContains("quantity");

      for (const tr of table.querySelectorAll("tbody tr")) {
        const cells = [...tr.querySelectorAll("td")].map(td => td.textContent.trim());
        if (!cells.length || cells.length <= Math.max(iProduct, iShare)) continue;
        const productName = cells[iProduct] || "";
        const revenueShare = parse(cells[iShare]);
        const qty = iQty >= 0 && cells.length > iQty ? parse(cells[iQty]) : 0;
        if (!productName || revenueShare <= 0) continue;
        hasil.push({ productName, qty, revenueShare });
      }
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

      const summaryUrl =
        "https://minutesapps.com/dashboard216a/report/providersales/?" +
        `range=${encodeURIComponent(minutesRange)}`;
      await page.goto(summaryUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1500);

      const providers = await page.locator("table tbody tr").evaluateAll(rows => {
        const out = [];
        const seen = new Set();
        for (const tr of rows) {
          const a = tr.querySelector('a[href*="providersalesdetail"]');
          if (!a) continue;
          const cells = [...tr.querySelectorAll("td")];
          const name = cells[0]?.textContent?.trim() || a.textContent?.trim() || "";
          const href = a.getAttribute("href") || "";
          const key = `${name}|${href}`;
          if (!name || !href || seen.has(key)) continue;
          seen.add(key);
          out.push({ name, href });
        }
        return out;
      });

      const rowsToSave = [];
      for (const provider of providers) {
        const providerMinutesId = providerIdDariHref(provider.href);
        const detailUrl = new URL(provider.href, "https://minutesapps.com");
        detailUrl.searchParams.set("range", minutesRange);
        await page.goto(detailUrl.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(900);

        const products = await bacaProductShare(page);
        const employeeId = cariEmployee(providerMinutesId, provider.name, cabang.id);
        for (const p of products) {
          rowsToSave.push({
            period_start: activityDate,
            period_end: activityDate,
            cabang_id: cabang.id,
            cabang_minutes_name: cabang.nama_minutes,
            product_name: p.productName,
            provider_name_raw: provider.name,
            provider_name_normalized: normalisasi(provider.name),
            provider_minutes_id: providerMinutesId,
            employee_id: employeeId,
            mapping_status: employeeId ? "MATCHED" : "UNMAPPED",
            qty: p.qty,
            revenue_share: p.revenueShare,
            source: "MINUTES_PROVIDER_SALES_PRODUCT_DAILY",
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      const totalShare = rowsToSave.reduce((sum, r) => sum + Number(r.revenue_share || 0), 0);

      const { error: delErr } = await sb
        .from("product_sales_source")
        .delete()
        .eq("period_start", activityDate)
        .eq("period_end", activityDate)
        .eq("cabang_id", cabang.id)
        .eq("source", "MINUTES_PROVIDER_SALES_PRODUCT_DAILY");
      if (delErr) throw delErr;

      if (rowsToSave.length) {
        const { error: insErr } = await sb.from("product_sales_source").insert(rowsToSave);
        if (insErr) throw insErr;
      }

      const { data: recapRow, error: recapFindErr } = await sb
        .from("daily_recap_source")
        .select("id")
        .eq("tanggal", activityDate)
        .eq("cabang_id", cabang.id)
        .maybeSingle();
      if (recapFindErr) throw recapFindErr;
      if (!recapRow?.id) throw new Error(`daily_recap_source belum ada untuk ${activityDate}`);

      const { error: updErr } = await sb
        .from("daily_recap_source")
        .update({ share_produk: totalShare, updated_at: new Date().toISOString() })
        .eq("id", recapRow.id);
      if (updErr) throw updErr;

      hasil.push({ cabang: cabang.nama_cabang, status: "OK", rows: rowsToSave.length, share_produk: totalShare });
      console.log(`✅ ${cabang.nama_cabang}: Share Produk Rp${totalShare.toLocaleString("id-ID")} (${rowsToSave.length} row)`);
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
