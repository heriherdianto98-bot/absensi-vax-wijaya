import "dotenv/config";
import { chromium } from "playwright";

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;

if (!email || !password) {
  throw new Error("MINUTES_EMAIL / MINUTES_PASSWORD belum tersedia di environment VPS.");
}

const LOGIN_URL = "https://minutesapps.com/dashboard216a/user/login";
const DASHBOARD_URL = "https://minutesapps.com/dashboard216a/";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";

const browser = await chromium.launch({ headless: HEADLESS });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  console.log("MINUTES_LOGIN_TEST=START");
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 20000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(4000);

  if (page.url().includes("/user/login")) {
    throw new Error("Login Minutes gagal: masih berada di halaman login.");
  }

  await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);

  const roleSelectExists = await page.locator('select[name="switchrole"]').count();
  const merchantSelectExists = await page.locator('select[name="merchant"]').count();

  console.log("MINUTES_LOGIN_TEST=PASS");
  console.log(`MINUTES_CURRENT_URL=${page.url()}`);
  console.log(`MINUTES_SWITCHROLE_PRESENT=${roleSelectExists > 0 ? "YES" : "NO"}`);
  console.log(`MINUTES_MERCHANT_PRESENT=${merchantSelectExists > 0 ? "YES" : "NO"}`);
} finally {
  await browser.close();
}
