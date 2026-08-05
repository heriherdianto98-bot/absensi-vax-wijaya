import "dotenv/config";
import { chromium } from "playwright";

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;

if (!email || !password) {
  console.error("MINUTES_EMAIL atau MINUTES_PASSWORD belum terbaca dari .env");
  process.exit(1);
}

const browser = await chromium.launch({
  headless: false
});

const page = await browser.newPage();

try {
  console.log("Membuka halaman login Minutes...");

  await page.goto(
    "https://minutesapps.com/dashboard216a/user/login",
    { waitUntil: "domcontentloaded" }
  );

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);

  console.log("Mengirim form login...");

  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  console.log("URL sekarang:", currentUrl);

  if (currentUrl.includes("/user/login")) {
    const errorMessage = await page
      .locator("text=Your Username or password wrong!")
      .isVisible()
      .catch(() => false);

    if (errorMessage) {
      throw new Error("Email atau password Minutes salah.");
    }

    throw new Error("Masih berada di halaman login.");
  }

  console.log("LOGIN BERHASIL");

  await page.screenshot({
    path: "login-success.png",
    fullPage: true
  });

  await page.waitForTimeout(5000);
} catch (error) {
  console.error("LOGIN GAGAL");
  console.error(error.message);

  await page.screenshot({
    path: "login-error.png",
    fullPage: true
  });
} finally {
  await browser.close();
}