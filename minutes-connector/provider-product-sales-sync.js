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
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return { db: value, recapDate: `${d} ${months[Number(mo) - 1]} ${y}` };
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
    const parseMoney = value => {
      const raw = String(value || "").replace(/[^\d-]/g, "");
      return raw ? Number(raw) : 0;
    };

    for (const table of document.querySelectorAll("table")) {
      const headers = [...table.querySelectorAll("thead th")].map(h =>
        h.textContent.trim().replace(/\s+/g, " ").toLowerCase()
      );

      // Provider Product Recap di Minutes punya tepat 4 kolom:
      // Provider Name | Total | Income | Share
      if (headers.length !== 4) continue;
      if (!headers[0]?.includes("provider")) continue;
      if (!headers[1]?.includes("total")) continue;
      if (!headers[2]?.includes("income")) continue;
      if (!headers[3]?.includes("share")) continue;

      const rows = [];
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cells = [...tr.querySelectorAll("td")].map(td =>
          td.textContent.trim().replace(/\s+/g, " ")
        );
        if (cells.length < 4) continue;

        const providerName = cells[0] || "";
        const qty = parseMoney(cells[1]);
        const revenueShare = parseMoney(cells[3]);
        if (!providerName || revenueShare <= 0) continue;
        rows.push({ providerName, qty, revenueShare });
      }
      return rows;
    }

    return [];
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
      const rowsToSave = providerRows.map(r => {
        const employeeId = cariEmployee(r.providerName, cabang.id);
        const now = new Date().toISOString();
        return {
          period_start: activityDate,
          period_end: activityDate,
          cabang_id: cabang.id,
          cabang_minutes_name: cabang.nama_minutes,
          product_name: "Provider Product Recap",
          provider_name_raw: r.providerName,
          provider_name_normalized: normalisasi(r.providerName),
          provider_minutes_id: null,
          employee_id: employeeId,
          mapping_status: employeeId ? "MATCHED" : "UNMAPPED",
          qty: r.qty,
          revenue_share: r.revenueShare,
          source: "MINUTES_PROVIDER_PRODUCT_RECAP_DAILY",
          synced_at: now,
          updated_at: now
        };
      });

      const totalShare = rowsToSave.reduce((sum, r) => sum + Number(r.revenue_share || 0), 0);

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
