import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function tanggalWIB() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = t => parts.find(p => p.type === t)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function minutesRange(date) {
  const [y, m, d] = date.split("-");
  return `${m}/${d}/${y} - ${m}/${d}/${y}`;
}

const activityDate = tanggalWIB();

const { data: cabangs, error: cabErr } = await sb
  .from("cabang")
  .select("id,nama_cabang,nama_minutes,urutan,aktif")
  .eq("aktif", true)
  .gte("id", 1)
  .lte("id", 10)
  .not("nama_minutes", "is", null)
  .order("urutan");

if (cabErr) throw cabErr;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1500, height: 900 }
});

page.setDefaultTimeout(15000);

try {
  console.log(`Product Sales Daily: ${activityDate}`);

  await page.goto(
    "https://minutesapps.com/dashboard216a/user/login",
    { waitUntil: "domcontentloaded", timeout: 30000 }
  );

  await page.locator("input[name=email]")
    .fill(process.env.MINUTES_EMAIL);

  await page.locator("input[name=password]")
    .fill(process.env.MINUTES_PASSWORD);

  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(2500);

  if (page.url().includes("/user/login")) {
    throw new Error("Login Minutes gagal");
  }

  await page.locator("select[name=switchrole]").waitFor({
    state: "attached"
  });

  await Promise.all([
    page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 30000
    }),
    page.evaluate(() => {
      const s = document.querySelector("select[name=switchrole]");
      s.value = "3";
      s.form.submit();
    })
  ]);

  const hasil = [];

  for (const cabang of cabangs) {
    try {
      await page.goto(
        "https://minutesapps.com/dashboard216a/",
        { waitUntil: "domcontentloaded", timeout: 30000 }
      );

      const merchant = await page.evaluate(nama => {
        const s = document.querySelector("select[name=merchant]");
        if (!s) return null;

        const norm = t =>
          String(t || "").trim().replace(/\s+/g, " ").toLowerCase();

        const o = [...s.options].find(
          x => norm(x.textContent) === norm(nama)
        );

        return o ? o.value : null;
      }, cabang.nama_minutes);

      if (!merchant) {
        throw new Error(`Merchant tidak ditemukan: ${cabang.nama_minutes}`);
      }

      await Promise.all([
        page.waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 30000
        }),
        page.evaluate(v => {
          const s = document.querySelector("select[name=merchant]");
          s.value = v;
          s.form.submit();
        }, merchant)
      ]);

      const url =
        "https://minutesapps.com/dashboard216a/report/productsales/?" +
        "range=" + encodeURIComponent(minutesRange(activityDate));

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      await page.waitForTimeout(600);

      let products = await page.locator("table").evaluateAll(tables => {
        const result = [];

        for (const table of tables) {
          for (const tr of table.querySelectorAll("tbody tr")) {
            const c = [...tr.querySelectorAll("td")]
              .map(td => td.textContent.trim());

            if (c.length < 5) continue;

            const name = c[0] || "";
            const sold =
              Number(String(c[3] || "0").replace(/[^\d-]/g, "")) || 0;
            const sales =
              Number(String(c[4] || "0").replace(/[^\d-]/g, "")) || 0;

            if (!name || sold <= 0 || sales <= 0) continue;

            result.push({
              product_name: name,
              sold,
              sales
            });
          }
        }

        return result;
      });

      if (!products.length) {
        await page.waitForTimeout(700);

        products = await page.locator("table").evaluateAll(tables => {
          const result = [];

          for (const table of tables) {
            for (const tr of table.querySelectorAll("tbody tr")) {
              const c = [...tr.querySelectorAll("td")]
                .map(td => td.textContent.trim());

              if (c.length < 5) continue;

              const name = c[0] || "";
              const sold =
                Number(String(c[3] || "0").replace(/[^\d-]/g, "")) || 0;
              const sales =
                Number(String(c[4] || "0").replace(/[^\d-]/g, "")) || 0;

              if (!name || sold <= 0 || sales <= 0) continue;

              result.push({
                product_name: name,
                sold,
                sales
              });
            }
          }

          return result;
        });
      }

      const total = products.reduce(
        (sum, p) => sum + p.sales,
        0
      );

      const { error: delErr } = await sb
        .from("product_sales_daily_source")
        .delete()
        .eq("activity_date", activityDate)
        .eq("cabang_id", cabang.id);

      if (delErr) throw delErr;

      if (products.length) {
        const now = new Date().toISOString();

        const rows = products.map(p => ({
          activity_date: activityDate,
          cabang_id: cabang.id,
          cabang_minutes_name: cabang.nama_minutes,
          product_name: p.product_name,
          sku: "",
          product_price: p.sales,
          source: "MINUTES_PRODUCT_SALES_DAILY",
          synced_at: now,
          updated_at: now
        }));

        const { error: insErr } = await sb
          .from("product_sales_daily_source")
          .insert(rows);

        if (insErr) throw insErr;
      }

      console.log(
        `OK ${cabang.nama_cabang}: Rp${total.toLocaleString("id-ID")}`
      );

      hasil.push({
        cabang: cabang.nama_cabang,
        status: "OK",
        total
      });

    } catch (error) {
      console.error(
        `ERROR ${cabang.nama_cabang}: ${error.message}`
      );

      hasil.push({
        cabang: cabang.nama_cabang,
        status: "ERROR",
        error: error.message
      });
    }
  }

  console.table(hasil);

  const gagal = hasil.filter(x => x.status === "ERROR");

  if (gagal.length) {
    process.exitCode = 1;
  }

} finally {
  await browser.close();
}
