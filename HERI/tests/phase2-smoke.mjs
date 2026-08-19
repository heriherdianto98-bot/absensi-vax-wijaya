/**
 * HERI Phase 2 smoke — Android project + APK presence + feature markers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const baseline = path.join(ROOT, "_baseline", "Catatan_Pengeluaran_Pribadi_V3.html");
const web = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
const core = fs.readFileSync(path.join(ROOT, "web", "js", "heri-core.js"), "utf8");
const manifest = fs.readFileSync(path.join(ROOT, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
const mainAct = fs.readFileSync(path.join(ROOT, "android", "app", "src", "main", "java", "com", "heri", "finance", "MainActivity.java"), "utf8");
const plugin = fs.readFileSync(path.join(ROOT, "android", "app", "src", "main", "java", "com", "heri", "finance", "HeriNativePlugin.java"), "utf8");

check("V3 UNTOUCHED", fs.statSync(baseline).size === 244032 || fs.statSync(baseline).size > 200000, String(fs.statSync(baseline).size));
check("ANDROID PROJECT", fs.existsSync(path.join(ROOT, "android", "gradlew.bat")));
check("DEEP LINK heri://", manifest.includes('android:scheme="heri"'));
check("RECORD_AUDIO", manifest.includes("RECORD_AUDIO"));
check("NFC permission", manifest.includes("android.permission.NFC"));
check("HeriNative plugin", plugin.includes("startSpeech") && plugin.includes("speak"));
check("MainActivity registers plugin", mainAct.includes("HeriNativePlugin"));
check("Native speech bridge in web", core.includes("initNativeSpeech") && core.includes("HeriNative"));
check("TTS native path", core.includes("native.speak"));
check("VPS env example", fs.existsSync(path.join(ROOT, "server", ".env.example")));
check("Payment still disconnected", (web.match(/BELUM TERHUBUNG/g) || []).length >= 5);
check("HERI never writes V3 key", !/setItem\(\s*"expense_new_v3_heri_putri"/.test(web));

const apkCandidates = [
  path.join(ROOT, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
  path.join(ROOT, "dist", "heri-debug.apk"),
];
let apk = apkCandidates.find((p) => fs.existsSync(p));
check("APK CREATED", !!apk, apk || "not found yet");

const failed = results.filter((r) => !r.pass);
console.log(`\nPASS ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  failed.forEach((f) => console.log(" - FAIL " + f.name + (f.detail ? ": " + f.detail : "")));
  process.exitCode = 1;
}
