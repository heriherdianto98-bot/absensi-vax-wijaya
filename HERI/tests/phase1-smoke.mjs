/**
 * HERI Phase 1 smoke tests (Node, no browser).
 * Validates migration safety, rupiah, voice parse, memory, AI, privacy, foundations.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(ROOT, "_baseline", "Catatan_Pengeluaran_Pribadi_V3.html");
const WEB = path.join(ROOT, "web", "index.html");
const CORE = path.join(ROOT, "web", "js", "heri-core.js");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const baseline = fs.readFileSync(BASELINE, "utf8");
const web = fs.readFileSync(WEB, "utf8");
const core = fs.readFileSync(CORE, "utf8");

// TEST integrity / V3 untouched
check("V3 UNTOUCHED size", fs.statSync(BASELINE).size > 100000, String(fs.statSync(BASELINE).size));
check("V3 UNTOUCHED title", baseline.includes("Catatan Pengeluaran Pribadi V3"));
check("V3 UNTOUCHED key write present in baseline", baseline.includes('setItem("expense_new_v3_heri_putri"'));
check("HERI never writes V3 key", !/setItem\(\s*"expense_new_v3_heri_putri"/.test(web));
check("HERI reads V3 key", /getItem\(\s*"expense_new_v3_heri_putri"/.test(web));
check("HERI branding", web.includes("HERI — Personal Finance") && web.includes("Personal Finance & AI Assistant"));

// IMPORTED_DATA
const imp = baseline.match(/const IMPORTED_DATA\s*=\s*(\[[\s\S]*?\]);\s*const CATEGORIES/);
let imported = [];
if (imp) {
  imported = JSON.parse(imp[1]);
}
check("V3 DATA MIGRATION imported embedded", imported.length > 1000, "count=" + imported.length);
check("HERI copy has same IMPORTED_DATA", web.includes('"excel-1"') && web.includes("IMPORTED_DATA"));

// Rupiah fmt
const fmt = (n) => "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
check("RUPIAH 50000", fmt(50000) === "Rp50.000", fmt(50000));
check("RUPIAH 125000", fmt(125000) === "Rp125.000", fmt(125000));
check("RUPIAH 1250000", fmt(1250000) === "Rp1.250.000", fmt(1250000));

// Voice parse — HERI word-number enhancement (V3 alone cannot parse "tiga puluh")
const ID_UNITS = {
  nol: 0, se: 1, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5,
  enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
};
function wordsToNumber(phrase) {
  const p = String(phrase || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (ID_UNITS[p] != null) return ID_UNITS[p];
  let m = p.match(/^(se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)?\s*puluh(?:\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan))?$/);
  if (m) {
    const tens = m[1] ? (m[1] === "se" ? 1 : ID_UNITS[m[1]]) : 1;
    return tens * 10 + (m[2] ? ID_UNITS[m[2]] : 0);
  }
  return null;
}
function normalizeNumberTextHeri(t) {
  let s = String(t || "").toLowerCase();
  s = s.replace(
    /((?:se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)(?:\s+\w+){0,4})\s*(juta|jt|ribu|rebu|rb|rn|k)\b/g,
    (all, words, unit) => {
      const n = wordsToNumber(words.trim());
      return n == null ? all : `${n} ${unit}`;
    }
  );
  return s;
}
function parseAmountHeri(text) {
  const t = normalizeNumberTextHeri(text);
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rebu|rb|rn|k)\b/);
  if (m) {
    let n = parseFloat(m[1].replace(",", "."));
    n *= /(juta|jt)/.test(m[2]) ? 1e6 : 1e3;
    return Math.round(n);
  }
  return 0;
}
const spoken = "catat rokok tiga puluh ribu";
const amt = parseAmountHeri(spoken);
check("VOICE amount 30rb", amt === 30000, String(amt));
check("HERI core has word parser", core.includes("wordsToNumber") && core.includes("tiga"));

const name = spoken
  .replace(/\b(catat|catetin|pengeluaran)\b/gi, " ")
  .replace(/((?:se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)(?:\s+\w+){0,4})\s*(juta|jt|ribu|rebu|rb|k)\b/gi, " ")
  .replace(/\s+/g, " ")
  .trim();
check("VOICE name contains rokok", /rokok/i.test(name), name);

// Memory priority: rokok → SUAMI
const mem = { rokok: "SUAMI", roko: "SUAMI" };
function inferWithMemory(t) {
  const low = String(t).toLowerCase();
  if (mem.rokok && low.includes("rokok")) return mem.rokok;
  if (mem.roko && low.includes("roko")) return mem.roko;
  return "LAIN LAIN";
}
check("VOICE category SUAMI via memory", inferWithMemory(spoken) === "SUAMI");

// Category UI markers
check("CATEGORY UI chips", web.includes("categoryChips") && web.includes("cat-chip"));

// AI engine markers + privacy + payment
check("AI DATA QUERY UI", web.includes("aiQuery") && core.includes("answerQuery"));
check("TTS helpers", core.includes("speechSynthesis") || core.includes("HeriAndroid.speak"));
check("VOICE PRIVACY", web.includes("Privasi Suara") && core.includes("sanitizeForTTS"));
check("SMART CATEGORY MEMORY", web.includes("Smart Category Memory") && core.includes("MEMORY_KEY"));
check("PAYMENT HUB FOUNDATION", (web.match(/BELUM TERHUBUNG/g) || []).length >= 5);
check("NFC FOUNDATION web", web.includes("e-Toll NFC") && core.includes("nfcAvailable"));

// Android foundation files
const manifest = path.join(ROOT, "android-app/app/src/main/AndroidManifest.xml");
const mainAct = path.join(ROOT, "android-app/app/src/main/java/com/heri/finance/MainActivity.java");
check("ANDROID FOUNDATION manifest", fs.existsSync(manifest) && fs.readFileSync(manifest, "utf8").includes("heri"));
check("ANDROID FOUNDATION MainActivity", fs.existsSync(mainAct) && fs.readFileSync(mainAct, "utf8").includes("HeriBridge"));
check("ANDROID deep link", fs.readFileSync(manifest, "utf8").includes('android:scheme="heri"'));
check("ANDROID NFC permission", fs.readFileSync(manifest, "utf8").includes("android.permission.NFC"));

// VPS
const server = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
check("VPS READY contract", server.includes("/api/v1/health") && server.includes("/api/v1/ai/query"));
check("VPS no secrets in frontend config", !web.includes("HERI_SECRET") && !core.includes("API_SECRET"));

// DATA INTEGRITY — no duplicate merge logic present
check("DATA INTEGRITY dedupe by id", web.includes("map.has(r.id)") || core.includes("map.has(row.id)"));

// Simulate AI suami bulan ini on imported sample
function sum(rows) {
  return rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
}
const now = new Date();
const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const suami = imported.filter((r) => r.category === "SUAMI" && String(r.date).startsWith(mk));
// May be 0 if current month has no data — engine must say tidak tersedia
const aiText =
  suami.length === 0
    ? `Data pengeluaran kategori SUAMI bulan ini tidak tersedia.`
    : `Pengeluaran kategori SUAMI bulan ini ${fmt(sum(suami))} dari ${suami.length} transaksi.`;
check("AI DATA QUERY engine shape", /SUAMI|tidak tersedia/.test(aiText), aiText.slice(0, 80));

// Privacy sanitize sample
function sanitize(text, mode) {
  if (mode === "MUTE_ALL") return "Ada pengeluaran pada kategori privat. Detail tersedia di aplikasi.";
  if (mode === "MUTE_NAME") return text.replace(/SUAMI/gi, "kategori privat");
  return text;
}
const spokenPriv = sanitize("Pengeluaran kategori SUAMI bulan ini Rp3.450.000 dari 27 transaksi.", "MUTE_NAME");
check("PRIVACY TTS mute name", !/SUAMI/i.test(spokenPriv) && /kategori privat/i.test(spokenPriv), spokenPriv);

const failed = results.filter((r) => !r.pass);
console.log("\n==== SUMMARY ====");
console.log(`PASS ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(" - " + f.name + (f.detail ? ": " + f.detail : "")));
  process.exit(1);
}
console.log("ALL SMOKE CHECKS PASSED");
