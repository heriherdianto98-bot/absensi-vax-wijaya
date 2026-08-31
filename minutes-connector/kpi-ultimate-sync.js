/**
 * =========================================================
 * VAX ERP — Minutes Service Sales Detail → kpi_ultimate_sales_source
 * =========================================================
 * Canonical writer: Minutes Service Sales Detail (#DataTables_Table_0).
 * Dipanggil dari siklus provider-sales-sync MODE=daily yang SAMA
 * (bukan cron kedua, bukan connector paralel).
 *
 * Scheduler (scheduler.js) setelah Daily Recap:
 *   LIVE=true DRY_RUN=false DATE=<hari ini WIB>
 *   single-day replaceSet — bukan MTD 1–hari ini setiap menit.
 *   Historical days tetap di kpi_ultimate_sales_source setelah backfill.
 *
 * Range (backfill / DRY_RUN review):
 *   LIVE=true DRY_RUN=true CABANG=Kalijati DATE_FROM=... DATE_TO=...
 *
 * Writer idempotent:
 *   upsert on unique (date,cabang,invoice,package,variant,close,provider).
 *   replaceSet: delete cabang rows in [date_from,date_to] then upsert.
 *   Default DRY_RUN=true. Production write hanya jika DRY_RUN=false.
 *
 * Standalone tetap bisa: LIVE=true DRY_RUN=false node kpi-ultimate-sync.js
 *
 * Simpan SEMUA baris service Minutes (termasuk ELEGAN dll).
 * KPI Ultimate Owner tetap HANYA package MAX/RELAX/REGULER/PLUS/ENAKIN KEPALA
 * lewat filter baca — jangan ubah rumus financial.
 *
 * Kasir dinilai = kolom CLOSE. Provider = tukang cukur (Dashboard Karyawan).
 * =========================================================
 */

import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const HAS_SELFTEST_FLAG = argv.includes("--selftest");
const LIVE = String(process.env.LIVE || "").toLowerCase() === "true";
const SELFTEST = HAS_SELFTEST_FLAG || !LIVE;

const email = process.env.MINUTES_EMAIL;
const password = process.env.MINUTES_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() === "true";
const YEAR = Number(process.env.YEAR || new Date().getFullYear());
const MONTH = Number(process.env.MONTH || (new Date().getMonth() + 1));
const ONLY_CABANG = String(process.env.CABANG || "").trim();
const DATE = String(process.env.DATE || "").trim();
const DATE_FROM = String(process.env.DATE_FROM || "").trim();
const DATE_TO = String(process.env.DATE_TO || "").trim();
const DRY_RUN = String(process.env.DRY_RUN || "true").toLowerCase() !== "false";
const SOURCE_LABEL = "MINUTES_SERVICE_SALES_DETAIL";
const DEFAULT_TARGET_AMOUNT = 6000000;

const MINUTES_LOGIN_URL = "https://minutesapps.com/dashboard216a/user/login";
const MINUTES_DASHBOARD_URL = "https://minutesapps.com/dashboard216a/";
const MINUTES_DETAIL_CANDIDATES = [
  "https://minutesapps.com/dashboard216a/report/servicesalesdetail",
  "https://minutesapps.com/dashboard216a/report/servicedetail",
  "https://minutesapps.com/dashboard216a/report/servicesales/detail",
  "https://minutesapps.com/dashboard216a/reports/servicesalesdetail",
  "https://minutesapps.com/dashboard216a/transaction/data"
];

const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const ULTIMATE_PACKAGES = [
  { code: "ENAKIN KEPALA", test: (s) => /\benakin\s+kepala\b/i.test(s) },
  { code: "MAX", test: (s) => /\bmax\b/i.test(s) },
  { code: "RELAX", test: (s) => /\brelax\b/i.test(s) },
  { code: "REGULER", test: (s) => /\breguler\b|\bregular\b/i.test(s) },
  { code: "PLUS", test: (s) => /\bplus\b/i.test(s) }
];
const LOCK_PACKAGE_CODES = ["MAX", "RELAX", "REGULER", "PLUS", "ENAKIN KEPALA"];
const SOURCE_CONFLICT = "activity_date,cabang_id,invoice,service_package,variant,close_name_raw,provider_name_raw";

const REQUIRED_HEADERS = [
  "date",
  "invoice",
  "service / package",
  "price with discount",
  "close"
];

const SAMPLE_DETAIL_ROW_HTML = `<tr role="row" class="odd">
    <td class="sorting_1">2026-08-03</td>
    <td>INV-88031</td>
    <td>Budi</td>
    <td>08123456789</td>
    <td>Walk In</td>
    <td>Package Max</td>
    <td>Standard</td>
    <td style="text-align: right;">75,000</td>
    <td style="text-align: right;">70,000</td>
    <td style="text-align: right;">0</td>
    <td>Rendi</td>
    <td>Sari</td>
    <td>Dewi</td>
    <td>QRIS</td>
    <td>Paid</td>
</tr>`;

const SAMPLE_HEADERS = [
  "Date",
  "Invoice",
  "Customer",
  "Phone",
  "Job",
  "Service / Package",
  "Variant",
  "Price",
  "Price with discount",
  "Non Income",
  "Provider",
  "Open",
  "Close",
  "Payment Type",
  "Status"
];

/* ================= PARSE (Node — single source of truth) ================= */

function pad(n) {
  return String(n).padStart(2, "0");
}

function cleanText(teks = "") {
  return String(teks || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html = "") {
  return cleanText(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

function cellsFromRowHtml(trHtml) {
  const matches = [...String(trHtml || "").matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
  return matches.map((m) => stripHtml(m[1]));
}

function parseMinutesNumber(teks = "") {
  const cleaned = String(teks)
    .replace(/IDR/gi, "")
    .replace(/Rp/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeName(name = "") {
  return String(name)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeMerchantName(teks = "") {
  return String(teks)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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

function classifyUltimatePackage(teks = "") {
  const raw = cleanText(teks);
  if (!raw) return null;
  for (const pkg of ULTIMATE_PACKAGES) {
    if (pkg.test(raw)) return pkg.code;
  }
  return null;
}

function isSingleDayPeriod(period) {
  return Boolean(
    period?.activity_date
    || (period?.period_start && period?.period_start === period?.period_end)
  );
}

function summarizeLockPackages(rows) {
  const lock = (rows || []).filter((r) => LOCK_PACKAGE_CODES.includes(r.package_code));
  const by_package = {};
  for (const code of LOCK_PACKAGE_CODES) {
    by_package[code] = { trx: 0, amount: 0 };
  }
  for (const r of lock) {
    by_package[r.package_code].trx += 1;
    by_package[r.package_code].amount += Number(r.price_with_discount || 0);
  }
  return {
    trx: lock.length,
    amount: lock.reduce((s, r) => s + Number(r.price_with_discount || 0), 0),
    by_package
  };
}

function isIsoDate(teks = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(cleanText(teks));
}

function dateFromInvoice(invoice = "") {
  const m = String(invoice || "").match(/(20\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return parseActivityDate(`${m[1]}-${m[2]}-${m[3]}`);
}

function parseActivityDate(teks = "") {
  const raw = cleanText(teks);
  if (isIsoDate(raw)) return raw;

  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (m) {
    const monthMap = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
      apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
      aug: 8, august: 8, sep: 9, sept: 9, september: 9,
      oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
    };
    const mm = monthMap[m[2].toLowerCase()];
    if (mm) return `${m[3]}-${pad(mm)}-${pad(Number(m[1]))}`;
  }

  return null;
}

function isSkipLabel(teks = "") {
  const t = cleanText(teks).toLowerCase();
  return !t
    || t === "total"
    || t === "grand total"
    || /^no data/i.test(t)
    || t === "-"
    || t === "—";
}

function isCancelledStatus(teks = "") {
  return /cancel|void|refund|batal/i.test(cleanText(teks));
}

function headerIndex(headers, patterns) {
  const h = (headers || []).map((x) => cleanText(x).toLowerCase());
  for (const re of patterns) {
    const i = h.findIndex((x) => re.test(x));
    if (i >= 0) return i;
  }
  return -1;
}

function isServiceSalesDetailHeaders(headers) {
  const h = (headers || []).map((x) => cleanText(x).toLowerCase());
  if (!h.length) return false;
  const hasDate = h.some((x) => x === "date" || /\btanggal\b/.test(x));
  const hasInvoice = h.some((x) => /\binvoice\b|\binv\b/.test(x));
  const hasPackage = h.some((x) => /service\s*\/\s*package|service\/package|\bpackage\b/.test(x));
  const hasClose = h.some((x) => x === "close" || /\bkasir\b/.test(x));
  const hasPriceDisc = h.some((x) => /price with discount|harga.?diskon/.test(x));
  return hasDate && hasInvoice && hasPackage && hasClose && hasPriceDisc;
}

function columnMap(headers) {
  return {
    date: headerIndex(headers, [/^date$/, /\btanggal\b/]),
    invoice: headerIndex(headers, [/\binvoice\b/, /\binv\b/]),
    customer: headerIndex(headers, [/\bcustomer\b/, /\bpelanggan\b/]),
    phone: headerIndex(headers, [/\bphone\b/, /\btelp\b/, /\bhp\b/]),
    job: headerIndex(headers, [/^job$/, /\bpekerjaan\b/]),
    service_package: headerIndex(headers, [/service\s*\/\s*package/, /service\/package/, /\bpackage\b/, /\bservice\b/]),
    variant: headerIndex(headers, [/\bvariant\b/, /\bvarian\b/]),
    price: headerIndex(headers, [/^price$/, /^harga$/]),
    price_with_discount: headerIndex(headers, [/price with discount/, /harga.?diskon/]),
    non_income: headerIndex(headers, [/non income/, /non.?income/]),
    provider: headerIndex(headers, [/\bprovider\b/, /\bcapster\b/]),
    open: headerIndex(headers, [/^open$/]),
    close: headerIndex(headers, [/^close$/, /\bkasir\b/]),
    payment_type: headerIndex(headers, [/payment type/, /\bpembayaran\b/]),
    status: headerIndex(headers, [/^status$/])
  };
}

function parseDetailCells(headers, cells) {
  const cols = (cells || []).map(cleanText);
  if (!cols.length || isSkipLabel(cols[0])) return { kind: "skip" };
  if (cols.some((c) => /datatables_empty|no data available|no matching records/i.test(c))) {
    return { kind: "skip" };
  }

  const map = columnMap(headers);
  const required = ["date", "invoice", "service_package", "price_with_discount", "close"];
  if (required.some((k) => map[k] < 0)) {
    return { kind: "error", reason: "header map incomplete", cells: cols };
  }

  const invoice = cellToText(cols[map.invoice]);
  const activity_date = parseActivityDate(cellToText(cols[map.date])) || dateFromInvoice(invoice);
  const service_package_raw = cleanText(cols[map.service_package]);
  if (!service_package_raw) return { kind: "skip" };
  const package_code = classifyUltimatePackage(service_package_raw);

  if (map.status >= 0 && isCancelledStatus(cols[map.status])) return { kind: "skip" };

  const price = parseMinutesNumber(map.price >= 0 ? cols[map.price] : "0");
  const price_with_discount = parseMinutesNumber(cols[map.price_with_discount]);

  if (!activity_date || !invoice || !Number.isFinite(price) || !Number.isFinite(price_with_discount)) {
    return {
      kind: "error",
      reason: "invalid date/invoice/price",
      cells: cols,
      service_package: service_package_raw
    };
  }

  return {
    kind: "row",
    activity_date,
    invoice,
    service_package: service_package_raw,
    package_code,
    variant: map.variant >= 0 ? cleanText(cols[map.variant]) : "",
    price,
    price_with_discount,
    provider_name_raw: map.provider >= 0 ? cleanText(cols[map.provider]) : "",
    open_name_raw: map.open >= 0 ? cleanText(cols[map.open]) : "",
    close_name_raw: cleanText(cols[map.close]),
    payment_type: map.payment_type >= 0 ? cleanText(cols[map.payment_type]) : "",
    customer_name: map.customer >= 0 ? cleanText(cols[map.customer]) : "",
    status: map.status >= 0 ? cleanText(cols[map.status]) : ""
  };
}

function parseDetailTables(tables) {
  const rows = [];
  const errors = [];
  let headerOk = false;
  let rawCandidate = 0;

  for (const table of tables || []) {
    const headers = table.headers || [];
    if (!isServiceSalesDetailHeaders(headers)) continue;
    headerOk = true;
    for (const cells of table.rows || []) {
      rawCandidate += 1;
      const parsed = parseDetailCells(headers, cells);
      if (parsed.kind === "row") rows.push(parsed);
      else if (parsed.kind === "error") errors.push(parsed);
    }
  }

  return { rows, errors, headerOk, rawCandidate };
}

function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function resolvePeriod(year, month) {
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new Error(`YEAR tidak valid: ${year}`);
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`MONTH tidak valid: ${month}`);
  }
  const last = lastDayOfMonth(year, month);
  const period_start = `${year}-${pad(month)}-01`;
  const period_end = `${year}-${pad(month)}-${pad(last)}`;
  return {
    year,
    month,
    period_start,
    period_end,
    startDisplayMMDDYYYY: `${pad(month)}/01/${year}`,
    endDisplayMMDDYYYY: `${pad(month)}/${pad(last)}/${year}`,
    label: `01 ${MONTHS_EN[month - 1]} ${year} — ${pad(last)} ${MONTHS_EN[month - 1]} ${year}`
  };
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

function resolveLivePeriod() {
  if (DATE_FROM || DATE_TO || DATE) {
    const start = assertISODate(DATE_FROM || DATE, "DATE_FROM/DATE");
    const end = assertISODate(DATE_TO || DATE || DATE_FROM, "DATE_TO/DATE");
    if (start > end) throw new Error(`DATE_FROM (${start}) > DATE_TO (${end})`);
    const [sy, sm] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    return {
      year: sy,
      month: sm,
      period_start: start,
      period_end: end,
      activity_date: start === end ? start : undefined,
      startDisplayMMDDYYYY: `${pad(sm)}/${start.slice(8, 10)}/${sy}`,
      endDisplayMMDDYYYY: `${pad(em)}/${pad(ed)}/${ey}`,
      label: `${start} — ${end}`
    };
  }
  return resolvePeriod(YEAR, MONTH);
}

function extractReportPeriodDates(text = "") {
  const blob = String(text || "");
  const iso = [...blob.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  if (iso.length >= 2) return { start: iso[0], end: iso[1] };

  const mdY = [...blob.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
  if (mdY.length >= 2) {
    const a = mdY[0];
    const b = mdY[1];
    return {
      start: `${a[3]}-${pad(Number(a[1]))}-${pad(Number(a[2]))}`,
      end: `${b[3]}-${pad(Number(b[1]))}-${pad(Number(b[2]))}`
    };
  }
  return null;
}

function periodOverlaps(found, expected) {
  if (!found?.start || !found?.end) return false;
  return found.start <= expected.period_end && found.end >= expected.period_start;
}

function mapCloseToEmployee(closeNameRaw, cabangId, karyawanList) {
  const norm = normalizeName(closeNameRaw);
  if (!norm) return { cashier_employee_id: null, mapping_status: "UNMAPPED" };

  const sameName = (karyawanList || []).filter((k) =>
    k.aktif !== false && normalizeName(k.nama_karyawan) === norm
  );
  if (sameName.length === 0) {
    return { cashier_employee_id: null, mapping_status: "UNMAPPED" };
  }

  const sameCabang = sameName.filter((k) => Number(k.cabang_id) === Number(cabangId));
  if (sameCabang.length === 1) {
    return { cashier_employee_id: Number(sameCabang[0].id), mapping_status: "MATCHED" };
  }
  if (sameCabang.length > 1) {
    return { cashier_employee_id: null, mapping_status: "AMBIGUOUS" };
  }
  return { cashier_employee_id: null, mapping_status: "UNMAPPED" };
}

function buildSourceRows(period, cabang, parsedRows, karyawanList) {
  const syncedAt = new Date().toISOString();
  return (parsedRows || [])
    .filter((r) => r.activity_date >= period.period_start && r.activity_date <= period.period_end)
    .map((r) => {
      const mapping = mapCloseToEmployee(r.close_name_raw, cabang.id, karyawanList);
      return {
        activity_date: r.activity_date,
        cabang_id: cabang.id,
        cabang_minutes_name: cabang.nama_minutes,
        invoice: r.invoice,
        service_package: r.service_package,
        variant: r.variant || "",
        price: r.price,
        price_with_discount: r.price_with_discount,
        provider_name_raw: r.provider_name_raw || "",
        open_name_raw: r.open_name_raw || "",
        close_name_raw: r.close_name_raw || "",
        cashier_employee_id: mapping.cashier_employee_id,
        mapping_status: mapping.mapping_status,
        payment_type: r.payment_type || "",
        source: SOURCE_LABEL,
        synced_at: syncedAt,
        updated_at: syncedAt,
        package_code: r.package_code
      };
    });
}

function sourceConflictKey(row) {
  return [
    row.activity_date,
    row.cabang_id,
    row.invoice,
    row.service_package,
    row.variant || "",
    row.close_name_raw || "",
    row.provider_name_raw || ""
  ].join("\u0001");
}

function uniquifySourceRows(rows) {
  const seen = new Set();
  const out = [];
  let collapsed = 0;
  for (const row of rows || []) {
    const baseVariant = row.variant || "";
    let variant = baseVariant;
    let n = 1;
    let key = sourceConflictKey({ ...row, variant });
    while (seen.has(key)) {
      collapsed += 1;
      n += 1;
      variant = baseVariant ? `${baseVariant}#${n}` : `#${n}`;
      key = sourceConflictKey({ ...row, variant });
    }
    seen.add(key);
    out.push({ ...row, variant });
  }
  return { rows: out, collapsed };
}

function dedupeSourceRows(rows) {
  return uniquifySourceRows(rows);
}

function plannedTargets(period, cabangList) {
  return (cabangList || []).map((c) => ({
    year: period.year,
    month: period.month,
    cabang_id: c.id,
    target_amount: DEFAULT_TARGET_AMOUNT,
    active: true
  }));
}

/* ================= SELFTEST (no browser, no DB) ================= */

function assertEqual(name, actual, expected) {
  const ok = Object.is(actual, expected) || actual === expected;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[KPI ULTIMATE][SELFTEST] ${mark} ${name}: got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  return ok;
}

function runSelfTest() {
  console.log("[KPI ULTIMATE] SELFTEST start — no browser, no DB write");
  const results = [];

  const cells = cellsFromRowHtml(SAMPLE_DETAIL_ROW_HTML);
  results.push(assertEqual("sample cell count", cells.length, 15));
  const parsed = parseDetailCells(SAMPLE_HEADERS, cells);
  results.push(assertEqual("sample kind", parsed.kind, "row"));
  results.push(assertEqual("sample date", parsed.activity_date, "2026-08-03"));
  results.push(assertEqual("sample invoice", parsed.invoice, "INV-88031"));
  results.push(assertEqual("sample package raw", parsed.service_package, "Package Max"));
  results.push(assertEqual("sample package code", parsed.package_code, "MAX"));
  results.push(assertEqual("sample price", parsed.price, 75000));
  results.push(assertEqual("sample price_with_discount", parsed.price_with_discount, 70000));
  results.push(assertEqual("sample provider", parsed.provider_name_raw, "Rendi"));
  results.push(assertEqual("sample open", parsed.open_name_raw, "Sari"));
  results.push(assertEqual("sample close", parsed.close_name_raw, "Dewi"));
  results.push(assertEqual("sample payment", parsed.payment_type, "QRIS"));

  results.push(assertEqual("pkg MAX", classifyUltimatePackage("Package Max"), "MAX"));
  results.push(assertEqual("pkg RELAX", classifyUltimatePackage("Relax"), "RELAX"));
  results.push(assertEqual("pkg REGULER", classifyUltimatePackage("Cukur Reguler"), "REGULER"));
  results.push(assertEqual("pkg REGULAR alias", classifyUltimatePackage("Regular"), "REGULER"));
  results.push(assertEqual("pkg PLUS", classifyUltimatePackage("Plus"), "PLUS"));
  results.push(assertEqual("pkg ENAKIN", classifyUltimatePackage("Enakin Kepala"), "ENAKIN KEPALA"));
  results.push(assertEqual("pkg other cukur", classifyUltimatePackage("Cukur"), null));
  results.push(assertEqual("pkg other elegan", classifyUltimatePackage("ELEGAN"), null));
  results.push(assertEqual("pkg skip maximum word", classifyUltimatePackage("Maximum Cool"), null));

  const five = parseDetailTables([{
    headers: SAMPLE_HEADERS,
    rows: [
      ["2026-08-01", "A1", "C1", "0", "Walk In", "Max", "", "80,000", "80,000", "0", "P", "O1", "Kasir A", "Cash", "Paid"],
      ["2026-08-02", "A2", "C2", "0", "Walk In", "Relax", "", "90,000", "85,000", "0", "P", "O1", "Kasir A", "QRIS", "Paid"],
      ["2026-08-03", "A3", "C3", "0", "Walk In", "Reguler", "", "50,000", "50,000", "0", "P", "O1", "Kasir B", "Cash", "Paid"],
      ["2026-08-04", "A4", "C4", "0", "Walk In", "Plus", "", "60,000", "60,000", "0", "P", "O1", "Kasir B", "QRIS", "Paid"],
      ["2026-08-05", "A5", "C5", "0", "Walk In", "Enakin Kepala", "", "25,000", "25,000", "0", "P", "O1", "Kasir A", "Cash", "Paid"],
      ["2026-08-06", "A6", "C6", "0", "Walk In", "Cukur", "", "20,000", "20,000", "0", "P", "O1", "Kasir A", "Cash", "Paid"],
      ["2026-08-17", "A9", "C9", "0", "Walk In", "ELEGAN", "", "40,000", "40,000", "0", "Maulana", "O1", "Kasir A", "Cash", "Paid"]
    ]
  }]);
  results.push(assertEqual("all paid service rows kept", five.rows.length, 7));
  results.push(assertEqual("non-ultimate stored", five.rows.filter((r) => r.package_code === null).length, 2));
  results.push(assertEqual("elegan stored raw", five.rows.some((r) => r.service_package === "ELEGAN"), true));
  results.push(assertEqual("parse errors 5 paket", five.errors.length, 0));
  results.push(assertEqual("codes unique", [...new Set(five.rows.map((r) => r.package_code).filter(Boolean))].sort().join("|"),
    "ENAKIN KEPALA|MAX|PLUS|REGULER|RELAX"));

  const cancelRow = parseDetailCells(SAMPLE_HEADERS, [
    "2026-08-07", "A7", "C7", "0", "Walk In", "Max", "", "80,000", "80,000", "0", "P", "O1", "Kasir A", "Cash", "Cancel"
  ]);
  results.push(assertEqual("cancel skipped", cancelRow.kind, "skip"));

  const bad = parseDetailCells(SAMPLE_HEADERS, [
    "bukan-tanggal", "A8", "C8", "0", "Walk In", "Max", "", "x", "y", "0", "P", "O1", "Kasir A", "Cash", "Paid"
  ]);
  results.push(assertEqual("bad row is error", bad.kind, "error"));

  const karyawan = [
    { id: 11, nama_karyawan: "Dewi", cabang_id: 1, aktif: true },
    { id: 12, nama_karyawan: "Dewi", cabang_id: 2, aktif: true },
    { id: 13, nama_karyawan: "Sari", cabang_id: 9, aktif: true }
  ];
  const matched = mapCloseToEmployee("Dewi", 1, karyawan);
  results.push(assertEqual("map CLOSE same cabang", matched.mapping_status, "MATCHED"));
  results.push(assertEqual("map CLOSE employee_id", matched.cashier_employee_id, 11));
  const cross = mapCloseToEmployee("Dewi", 3, karyawan);
  results.push(assertEqual("map CLOSE other cabang UNMAPPED", cross.mapping_status, "UNMAPPED"));
  results.push(assertEqual("map CLOSE other cabang no id", cross.cashier_employee_id, null));
  const openNotUsed = mapCloseToEmployee("Sari", 1, karyawan);
  results.push(assertEqual("OPEN name is not auto-matched on other cabang", openNotUsed.mapping_status, "UNMAPPED"));

  results.push(assertEqual("header detect", isServiceSalesDetailHeaders(SAMPLE_HEADERS), true));
  results.push(assertEqual("header reject product", isServiceSalesDetailHeaders(["Product", "Provider", "Qty", "Share"]), false));
  results.push(assertEqual("default target", DEFAULT_TARGET_AMOUNT, 6000000));
  results.push(assertEqual("object date unwrap empty", cellToText({ display: "2026-08-12" }), "2026-08-12"));
  results.push(assertEqual("invoice date fallback", dateFromInvoice("VWK2026081219"), "2026-08-12"));
  results.push(assertEqual("dry-run default", DRY_RUN, true));
  const duped = dedupeSourceRows([
    { activity_date: "2026-08-14", cabang_id: 2, invoice: "A", service_package: "ELEGAN", variant: "", close_name_raw: "X", provider_name_raw: "Maulana" },
    { activity_date: "2026-08-14", cabang_id: 2, invoice: "A", service_package: "ELEGAN", variant: "", close_name_raw: "X", provider_name_raw: "Maulana" },
    { activity_date: "2026-08-14", cabang_id: 2, invoice: "B", service_package: "ELEGAN", variant: "", close_name_raw: "X", provider_name_raw: "Maulana" }
  ]);
  results.push(assertEqual("same-invoice lines kept", duped.rows.length, 3));
  results.push(assertEqual("collision suffix applied", duped.collapsed, 1));
  results.push(assertEqual("second line variant suffix", duped.rows[1].variant, "#2"));

  const lock = summarizeLockPackages([
    { package_code: "MAX", price_with_discount: 70000 },
    { package_code: "RELAX", price_with_discount: 75000 },
    { package_code: "RELAX", price_with_discount: 75000 },
    { package_code: null, price_with_discount: 60000 }
  ]);
  results.push(assertEqual("lock trx ignores other", lock.trx, 3));
  results.push(assertEqual("lock amount", lock.amount, 220000));
  results.push(assertEqual("lock max trx", lock.by_package.MAX.trx, 1));
  results.push(assertEqual("lock relax trx", lock.by_package.RELAX.trx, 2));
  results.push(assertEqual("lock plus trx", lock.by_package.PLUS.trx, 0));
  results.push(assertEqual(
    "single-day period",
    isSingleDayPeriod({ period_start: "2026-08-31", period_end: "2026-08-31" }),
    true
  ));
  results.push(assertEqual(
    "range period not single-day",
    isSingleDayPeriod({ period_start: "2026-08-19", period_end: "2026-08-31" }),
    false
  ));

  const pass = results.every(Boolean);
  console.log(`[KPI ULTIMATE] SELFTEST ${pass ? "PASS" : "FAIL"} (${results.filter(Boolean).length}/${results.length})`);
  return pass;
}

/* ================= LIVE SCRAPE (manual, default DRY_RUN) ================= */

function requireLiveCredentials() {
  if (!email || !password) {
    throw new Error("LIVE mode butuh MINUTES_EMAIL / MINUTES_PASSWORD di .env");
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("LIVE mode butuh SUPABASE_URL / SUPABASE_SERVICE_KEY di .env");
  }
}

function getSupabase() {
  requireLiveCredentials();
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function loadOperationalCabang(supabase) {
  const { data, error } = await supabase
    .from("cabang")
    .select("id,nama_cabang,nama_minutes,aktif,urutan")
    .eq("aktif", true)
    .not("nama_minutes", "is", null)
    .order("urutan", { ascending: true, nullsFirst: false });

  if (error) throw error;
  let list = filterOperationalCabang(data || []);
  if (ONLY_CABANG) {
    const target = normalizeMerchantName(ONLY_CABANG);
    list = list.filter((c) =>
      normalizeMerchantName(c.nama_minutes) === target
      || normalizeMerchantName(c.nama_cabang) === target
      || normalizeMerchantName(c.nama_minutes).includes(target)
      || normalizeMerchantName(c.nama_cabang).includes(target)
    );
  }
  return list;
}

async function loadKaryawanForMapping(supabase) {
  const { data, error } = await supabase
    .from("karyawan")
    .select("id,nama_karyawan,cabang_id,aktif");
  if (error) {
    console.warn(`[KPI ULTIMATE] karyawan load: ${error.message} — cashier_employee_id = NULL`);
    return [];
  }
  return data || [];
}

async function loginMinutes(page) {
  console.log("[KPI ULTIMATE] login Minutes");
  await page.goto(MINUTES_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator('input[name="email"]').waitFor({ state: "visible", timeout: 20000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(4000);
  if (page.url().includes("/user/login")) {
    throw new Error("Login Minutes gagal");
  }
}

async function ubahKeMerchant(page) {
  await page.locator('select[name="switchrole"]').waitFor({ state: "attached", timeout: 20000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
    page.evaluate(() => {
      const select = document.querySelector('select[name="switchrole"]');
      if (!select?.form) throw new Error("switchrole tidak ditemukan");
      select.value = "3";
      select.form.submit();
    })
  ]);
  await page.waitForTimeout(3000);
}

async function cariMerchant(page, namaCabangMinutes) {
  await page.locator('select[name="merchant"]').waitFor({ state: "attached", timeout: 20000 });
  return page.evaluate((namaDicari) => {
    const select = document.querySelector('select[name="merchant"]');
    if (!select) return null;
    const norm = (t) => String(t || "").trim().replace(/\s+/g, " ").toLowerCase();
    const target = norm(namaDicari);
    const option = [...select.options].find((o) => norm(o.textContent) === target);
    if (!option) return null;
    return { value: option.value, nama: option.textContent.trim() };
  }, namaCabangMinutes);
}

async function pilihMerchant(page, nilaiCabang) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
    page.evaluate((nilai) => {
      const select = document.querySelector('select[name="merchant"]');
      if (!select?.form) throw new Error("merchant select tidak ditemukan");
      select.value = nilai;
      select.form.submit();
    }, nilaiCabang)
  ]);
  await page.waitForTimeout(2500);
}

async function readSelectedMerchant(page) {
  return page.evaluate(() => {
    const sel = document.querySelector('select[name="merchant"]');
    if (!sel) return null;
    const opt = sel.options[sel.selectedIndex];
    return {
      value: String(sel.value || ""),
      nama: String(opt?.textContent || "").replace(/\s+/g, " ").trim()
    };
  });
}

function merchantTextMatches(actual, expected) {
  const a = normalizeMerchantName(actual);
  const b = normalizeMerchantName(expected);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

async function assertMerchantSelected(page, expectedName) {
  await page.locator('select[name="merchant"]').waitFor({ state: "attached", timeout: 20000 });
  const selected = await readSelectedMerchant(page);
  if (!selected?.nama || !merchantTextMatches(selected.nama, expectedName)) {
    throw new Error(
      `[ABORT] Merchant dropdown mismatch. expected="${expectedName}" selected="${selected?.nama || ""}"`
    );
  }
  console.log("[KPI ULTIMATE] selected merchant", selected.nama);
  return selected;
}

function assertNotLogin(page) {
  if (String(page.url() || "").includes("/user/login")) {
    throw new Error("[ABORT] Login redirect — scrape failure, no write");
  }
}

async function findServiceSalesDetailHref(page) {
  return page.evaluate(() => {
    const norm = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
    const links = [...document.querySelectorAll("a[href]")].map((a) => ({
      href: a.href,
      text: norm(a.textContent),
      title: norm(a.getAttribute("title"))
    }));
    const hit = links.find((l) =>
      l.title === "service sales detail"
      || l.text === "service sales detail"
      || (l.text.includes("service sales") && l.text.includes("detail"))
      || (l.title.includes("service sales") && l.title.includes("detail"))
    );
    return hit?.href || null;
  });
}

function buildDetailUrl(base, period) {
  const range = `${period.startDisplayMMDDYYYY} - ${period.endDisplayMMDDYYYY}`;
  const url = new URL(base);
  url.searchParams.set("range", range);
  return url.toString();
}

async function waitTable0(page, timeout = 25000) {
  await page.locator("#DataTables_Table_0").waitFor({ state: "attached", timeout }).catch(() => {});
}

async function waitTable0Processing(page, timeout = 20000) {
  await page.locator("#DataTables_Table_0_processing").waitFor({
    state: "hidden",
    timeout: Math.min(timeout, 15000)
  }).catch(() => {});
}

async function expandTable0(page) {
  await page.evaluate(() => {
    const table = document.querySelector("#DataTables_Table_0");
    const $ = window.jQuery || window.$;
    if ($ && table && $.fn?.dataTable?.isDataTable && $.fn.dataTable.isDataTable(table)) {
      try { $(table).DataTable().page.len(-1).draw(); } catch (_e) { /* ignore */ }
    }
    const len = document.querySelector("select[name='DataTables_Table_0_length']");
    if (len) {
      const all = [...len.options].find((o) => o.value === "-1" || /all/i.test(o.textContent || ""));
      len.value = all ? all.value : String(Math.max(0, ...[...len.options].map((o) => Number(o.value) || 0)));
      len.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }).catch(() => {});
  await page.waitForTimeout(800);
  await waitTable0Processing(page);
}

function cellToText(value) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const t = cleanText(value);
    return t === "[object Object]" ? "" : t;
  }
  if (typeof value === "object") {
    if (value.display != null) return cellToText(value.display);
    if (value.text != null) return cellToText(value.text);
    if (value.label != null) return cellToText(value.label);
    if (value.date != null) return cellToText(value.date);
    if (value.value != null && typeof value.value !== "object") return cellToText(value.value);
    if (typeof value.nodeType === "number") return cleanText(value.textContent || "");
  }
  const s = cleanText(String(value));
  return s === "[object Object]" ? "" : s;
}

async function extractTable0ViaApi(page) {
  return page.evaluate(() => {
    const bersihkan = (t) => String(t || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const strip = (html) => bersihkan(String(html || "").replace(/<[^>]+>/g, " "));
    const cellText = (v) => {
      if (v == null) return "";
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
      if (typeof v === "object") {
        if (v.display != null) return cellText(v.display);
        if (v.text != null) return cellText(v.text);
        if (v.label != null) return cellText(v.label);
        if (v.date != null) return cellText(v.date);
        if (typeof v.nodeType === "number") return bersihkan(v.textContent || "");
        if (v.jquery && v[0]) return bersihkan(v[0].textContent || "");
      }
      const s = strip(v);
      return s === "[object Object]" ? "" : s;
    };
    const table = document.querySelector("#DataTables_Table_0");
    if (!table) return { found: false, headers: [], rows: [], serverSide: false, pages: 0 };
    const headers = [...table.querySelectorAll("thead th, thead td")].map((el) => bersihkan(el.textContent));
    const domRows = [...table.querySelectorAll("tbody tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => bersihkan(td.textContent))
    );
    const $ = window.jQuery || window.$;
    if ($ && $.fn?.dataTable?.isDataTable && $.fn.dataTable.isDataTable(table)) {
      try {
        const dt = $(table).DataTable();
        const settings = dt.settings()[0] || {};
        const apiRows = [];
        dt.rows({ page: "all" }).every(function everyRow() {
          const data = this.data();
          const nodes = this.nodes && this.node ? [this.node()] : [];
          if (Array.isArray(data)) apiRows.push(data.map(cellText));
          else if (data && typeof data === "object") {
            apiRows.push(headers.map((_, i) => cellText(data[i] ?? "")));
          }
          if (nodes[0] && apiRows.length) {
            const tds = [...nodes[0].querySelectorAll("td")].map((td) => bersihkan(td.textContent));
            if (tds[0] && apiRows[apiRows.length - 1][0] === "") {
              apiRows[apiRows.length - 1][0] = tds[0];
            }
          }
        });
        const apiBroken = apiRows.some((r) => !r[0] || r[0] === "[object Object]");
        const rows = (!apiBroken && apiRows.length >= domRows.length) ? apiRows : (domRows.length ? domRows : apiRows);
        return {
          found: true,
          headers,
          rows,
          serverSide: Boolean(settings.oFeatures?.bServerSide),
          pages: dt.page.info()?.pages || 1,
          records: dt.page.info()?.recordsDisplay || rows.length,
          via: rows === domRows ? "dom" : "api"
        };
      } catch (_e) { /* DOM fallback */ }
    }
    return { found: true, headers, rows: domRows, serverSide: false, pages: 1, records: domRows.length, via: "dom" };
  });
}

async function extractTable0Paged(page, pages) {
  const all = [];
  let headers = [];
  const maxPages = Math.min(Number(pages) || 1, 200);
  for (let i = 0; i < maxPages; i++) {
    await page.evaluate((idx) => {
      const table = document.querySelector("#DataTables_Table_0");
      const $ = window.jQuery || window.$;
      if ($ && table && $.fn?.dataTable?.isDataTable && $.fn.dataTable.isDataTable(table)) {
        $(table).DataTable().page(idx).draw(false);
      }
    }, i);
    await page.waitForTimeout(400);
    await waitTable0Processing(page);
    const snap = await page.evaluate(() => {
      const bersihkan = (t) => String(t || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      const table = document.querySelector("#DataTables_Table_0");
      if (!table) return { headers: [], rows: [] };
      return {
        headers: [...table.querySelectorAll("thead th, thead td")].map((el) => bersihkan(el.textContent)),
        rows: [...table.querySelectorAll("tbody tr")].map((tr) =>
          [...tr.querySelectorAll("td")].map((td) => bersihkan(td.textContent))
        )
      };
    });
    headers = snap.headers;
    all.push(...(snap.rows || []));
  }
  return { found: true, headers, rows: all, serverSide: true, pages: maxPages, records: all.length };
}

async function setReportPeriod(page, period) {
  const range = page.locator("#reportrange");
  if (!(await range.count())) return { mode: "none", label: null };
  await range.first().click();
  await page.waitForTimeout(400);

  const applied = await page.evaluate(({ start, end }) => {
    const $ = window.jQuery || window.$;
    if ($ && $("#reportrange").data("daterangepicker")) {
      const drp = $("#reportrange").data("daterangepicker");
      if (window.moment) {
        drp.setStartDate(window.moment(start, "MM/DD/YYYY"));
        drp.setEndDate(window.moment(end, "MM/DD/YYYY"));
      } else {
        drp.setStartDate(start);
        drp.setEndDate(end);
      }
      const label = `${start} - ${end}`;
      const span = document.querySelector("#reportrange span");
      if (span) span.textContent = label;
      return { mode: "daterangepicker-api", label };
    }
    return { mode: "none", label: null };
  }, {
    start: period.startDisplayMMDDYYYY,
    end: period.endDisplayMMDDYYYY
  });

  const applyBtn = page.locator("button.applyBtn, .applyBtn");
  const nav = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
  if (await applyBtn.count()) await applyBtn.first().click();
  else await range.first().press("Enter").catch(() => {});
  await nav;
  await waitTable0(page);
  return applied;
}

async function readPageAudit(page) {
  return page.evaluate(() => {
    const text = String(document.body?.innerText || "");
    const headings = [...document.querySelectorAll("h1, h2, h3, .page-title, .jarviswidget-caption, legend")]
      .map((el) => String(el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const nav = [...document.querySelectorAll("#left-panel a, nav a")]
      .map((a) => String(a.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 80);
    return {
      url: location.href,
      title: document.title,
      headings,
      headingBlob: headings.join(" | "),
      rangeLabel: String(
        document.querySelector("#reportrange span")?.textContent
        || document.querySelector("#reportrange")?.value
        || ""
      ).trim(),
      nav,
      textBlob: text.slice(0, 8000)
    };
  });
}

function isDetailHeading(blob = "") {
  return /service\s*sales\s*detail/i.test(blob) || /sales\s*detail/i.test(blob);
}

async function openServiceSalesDetail(page, period, options = {}) {
  if (!options.reuseSession) {
    await page.goto(MINUTES_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
  }
  assertNotLogin(page);

  const menuHref = await findServiceSalesDetailHref(page).catch(() => null);
  const candidates = [
    menuHref,
    ...MINUTES_DETAIL_CANDIDATES
  ].filter(Boolean);

  let lastAudit = null;
  for (const base of candidates) {
    const url = buildDetailUrl(base, period);
    console.log("[KPI ULTIMATE] try URL", url);
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    if (!res || res.status() >= 400) continue;
    assertNotLogin(page);
    await setReportPeriod(page, period);
    await waitTable0(page, 15000);
    await expandTable0(page);
    const snap = await extractTable0ViaApi(page);
    const audit = await readPageAudit(page);
    lastAudit = { ...audit, headers: snap.headers, found: snap.found };
    if (snap.found && isServiceSalesDetailHeaders(snap.headers)) {
      return { url: page.url(), snap, audit, via: base };
    }
    if (isDetailHeading(`${audit.headingBlob} ${audit.title}`) && snap.found) {
      return { url: page.url(), snap, audit, via: base };
    }
  }

  throw new Error(
    `[ABORT] Service Sales Detail #DataTables_Table_0 tidak ditemukan. ` +
    `last=${lastAudit?.url || "-"} headers=${JSON.stringify(lastAudit?.headers || [])} ` +
    `nav=${(lastAudit?.nav || []).join(" | ")}`
  );
}

async function harvestDetailRows(page, opened) {
  let snap = opened.snap;
  if (snap.serverSide && Number(snap.pages) > 1 && (snap.rows || []).length < Number(snap.records || 0)) {
    console.log("[KPI ULTIMATE] server-side pages", snap.pages, "records", snap.records);
    snap = await extractTable0Paged(page, snap.pages);
  } else if ((snap.rows || []).length < 20) {
    await expandTable0(page);
    snap = await extractTable0ViaApi(page);
  }

  const parsed = parseDetailTables([{ headers: snap.headers, rows: snap.rows }]);
  return { snap, parsed };
}

async function tableReady(supabase, table) {
  const { error } = await supabase.from(table).select("id").limit(1);
  if (!error) return true;
  if (/does not exist|schema cache/i.test(error.message || "")) return false;
  throw error;
}

async function upsertSourceRows(supabase, rows, options = {}) {
  const dryRun = options.dryRun ?? DRY_RUN;
  const replaceSet = options.replaceSet === true;
  const dateFrom = options.date_from || options.activity_date;
  const dateTo = options.date_to || options.activity_date || dateFrom;
  const cabangId = options.cabang_id;
  if (dryRun) {
    console.log(`[KPI ULTIMATE] DRY_RUN skip source upsert (${rows.length})`);
    return { upserted: 0, dryRun: true };
  }
  const ready = await tableReady(supabase, "kpi_ultimate_sales_source");
  if (!ready) {
    throw new Error("[ABORT] Tabel public.kpi_ultimate_sales_source belum ada. JANGAN delete. Review migration dulu.");
  }
  const deduped = dedupeSourceRows(rows);
  if (deduped.collapsed) {
    console.warn(`[KPI ULTIMATE] collapsed ${deduped.collapsed} duplicate conflict-key rows before write`);
  }
  const payload = deduped.rows.map(({ package_code, ...row }) => row);

  if (replaceSet && dateFrom && dateTo && cabangId != null) {
    const { error: delErr } = await supabase
      .from("kpi_ultimate_sales_source")
      .delete()
      .eq("cabang_id", cabangId)
      .gte("activity_date", dateFrom)
      .lte("activity_date", dateTo);
    if (delErr) throw new Error(`[ABORT] source replace delete failed: ${delErr.message}`);
    if (!payload.length) return { upserted: 0, collapsed: deduped.collapsed, replaced: true };
    const { error: insErr } = await supabase
      .from("kpi_ultimate_sales_source")
      .upsert(payload, { onConflict: SOURCE_CONFLICT });
    if (insErr) throw new Error(`[ABORT] source replace upsert failed: ${insErr.message}`);
    return { upserted: payload.length, collapsed: deduped.collapsed, replaced: true };
  }

  if (!payload.length) return { upserted: 0, collapsed: deduped.collapsed };
  const { error } = await supabase
    .from("kpi_ultimate_sales_source")
    .upsert(payload, { onConflict: SOURCE_CONFLICT });
  if (error) throw new Error(`[ABORT] source upsert failed: ${error.message}`);
  return { upserted: payload.length, collapsed: deduped.collapsed };
}

async function seedTargets(supabase, period) {
  if (DRY_RUN) {
    console.log("[KPI ULTIMATE] DRY_RUN skip target seed");
    return { inserted: 0, dryRun: true, default_amount: DEFAULT_TARGET_AMOUNT };
  }
  const { data, error } = await supabase.rpc("seed_kpi_ultimate_monthly_targets", {
    p_year: period.year,
    p_month: period.month
  });
  if (error) throw new Error(`[ABORT] target seed failed: ${error.message}`);
  return data;
}

async function prosesCabang(page, supabase, cabang, period, karyawanList, index, total, options = {}) {
  const dryRun = options.dryRun ?? DRY_RUN;
  const reuseSession = options.reuseSession === true;
  console.log("");
  console.log("[KPI ULTIMATE] branch", `${index + 1}/${total}`, cabang.nama_cabang, "←", cabang.nama_minutes);
  console.log("[KPI ULTIMATE] period", period.label);
  console.log("[KPI ULTIMATE] dryRun", dryRun);

  assertNotLogin(page);
  if (!reuseSession) {
    await page.goto(MINUTES_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    assertNotLogin(page);
  }

  let merchant = await cariMerchant(page, cabang.nama_minutes).catch(() => null);
  if (!merchant) {
    await page.goto(MINUTES_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    assertNotLogin(page);
    merchant = await cariMerchant(page, cabang.nama_minutes);
  }
  if (!merchant) throw new Error(`[ABORT] Merchant tidak ditemukan: ${cabang.nama_minutes}`);
  try {
    await assertMerchantSelected(page, cabang.nama_minutes);
  } catch (_err) {
    await pilihMerchant(page, merchant.value);
    await assertMerchantSelected(page, cabang.nama_minutes);
  }
  const selectedMerchant = await readSelectedMerchant(page);

  const opened = await openServiceSalesDetail(page, period, { reuseSession });
  await assertMerchantSelected(page, cabang.nama_minutes);
  const harvested = await harvestDetailRows(page, opened);
  const parsed = harvested.parsed;

  console.log("[KPI ULTIMATE] final URL", opened.url);
  console.log("[KPI ULTIMATE] headers", harvested.snap.headers);
  console.log("[KPI ULTIMATE] raw rows", harvested.snap.rows.length);
  console.log("[KPI ULTIMATE] detail rows", parsed.rows.length);
  console.log("[KPI ULTIMATE] parse errors", parsed.errors.length);
  console.log("[KPI ULTIMATE] unique packages", [...new Set((harvested.snap.rows || []).map((r) => {
    const i = harvested.snap.headers.findIndex((h) => /service\s*\/\s*package|package/i.test(h));
    return i >= 0 ? r[i] : "";
  }).filter(Boolean))].sort());

  const sourceRows = buildSourceRows(period, cabang, parsed.rows, karyawanList);
  const mapping = sourceRows.reduce((acc, r) => {
    acc[r.mapping_status] = (acc[r.mapping_status] || 0) + 1;
    return acc;
  }, { MATCHED: 0, UNMAPPED: 0, AMBIGUOUS: 0 });

  const byPackage = sourceRows.reduce((acc, r) => {
    const key = r.package_code || classifyUltimatePackage(r.service_package) || "OTHER";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const realization = sourceRows.reduce((s, r) => s + Number(r.price_with_discount || 0), 0);
  const lock = summarizeLockPackages(sourceRows);
  const replaceSet = options.replaceSet ?? isSingleDayPeriod(period);
  const saved = await upsertSourceRows(supabase, sourceRows, {
    dryRun,
    replaceSet,
    activity_date: period.activity_date || (period.period_start === period.period_end ? period.period_start : undefined),
    date_from: period.period_start,
    date_to: period.period_end,
    cabang_id: cabang.id
  });
  console.log("[KPI ULTIMATE] lock trx", lock.trx, "amount", lock.amount);
  console.log("[KPI ULTIMATE] lock by package", JSON.stringify(lock.by_package));

  return {
    cabang_id: cabang.id,
    cabang: cabang.nama_cabang,
    minutes: cabang.nama_minutes,
    selected_merchant: selectedMerchant?.nama || cabang.nama_minutes,
    final_url: opened.url,
    headers: harvested.snap.headers,
    raw_rows: harvested.snap.rows.length,
    ultimate_rows: sourceRows.length,
    parse_errors: parsed.errors.length,
    unique_packages: [...new Set((harvested.snap.rows || []).map((r) => {
      const i = harvested.snap.headers.findIndex((h) => /service\s*\/\s*package|package/i.test(h));
      return i >= 0 ? r[i] : "";
    }).filter(Boolean))].sort(),
    parse_error_samples: parsed.errors.slice(0, 5),
    mapping,
    by_package: byPackage,
    lock,
    realization,
    sample: sourceRows.slice(0, 8).map((r) => ({
      date: r.activity_date,
      invoice: r.invoice,
      package: r.service_package,
      code: r.package_code,
      price_with_discount: r.price_with_discount,
      close: r.close_name_raw,
      open: r.open_name_raw,
      provider: r.provider_name_raw,
      mapping: r.mapping_status,
      cashier_employee_id: r.cashier_employee_id
    })),
    upsert: saved
  };
}

async function runLive() {
  requireLiveCredentials();
  const supabase = getSupabase();
  const period = resolveLivePeriod();
  const cabangList = await loadOperationalCabang(supabase);
  if (!cabangList.length) {
    throw new Error("Tidak ada cabang operasional (nama_minutes + aktif, non-Floating)");
  }

  console.log("[KPI ULTIMATE] LIVE start");
  console.log("[KPI ULTIMATE] period", period.label);
  console.log("[KPI ULTIMATE] DRY_RUN", DRY_RUN);
  console.log("[KPI ULTIMATE] cabang", cabangList.length);
  cabangList.forEach((c, i) =>
    console.log(`  ${i + 1}. ${c.nama_cabang} ← ${c.nama_minutes}`)
  );

  const karyawanList = await loadKaryawanForMapping(supabase);
  const launchOpts = { headless: HEADLESS, slowMo: HEADLESS ? 0 : 50 };
  const channel = String(process.env.PLAYWRIGHT_CHANNEL || "").trim();
  if (channel) launchOpts.channel = channel;
  let browser;
  try {
    browser = await chromium.launch(launchOpts);
  } catch (err) {
    if (channel) throw err;
    browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
  }
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);

  const results = [];
  try {
    await loginMinutes(page);
    await ubahKeMerchant(page);
    for (let i = 0; i < cabangList.length; i++) {
      const cabang = cabangList[i];
      try {
        const r = await prosesCabang(
          page, supabase, cabang, period, karyawanList, i, cabangList.length, { dryRun: DRY_RUN }
        );
        results.push({ ok: true, ...r });
      } catch (err) {
        console.error(`[KPI ULTIMATE] FAIL ${cabang.nama_cabang}: ${err.message}`);
        results.push({
          ok: false,
          cabang: cabang.nama_cabang,
          minutes: cabang.nama_minutes,
          error: err.message
        });
      }
    }
  } finally {
    await browser.close();
  }

  const targetPlan = plannedTargets(period, cabangList);
  const targetSeed = await seedTargets(supabase, period);
  const report = {
    source: SOURCE_LABEL,
    dryRun: DRY_RUN,
    period,
    default_target: DEFAULT_TARGET_AMOUNT,
    target_plan: targetPlan,
    target_seed: targetSeed,
    processed: results.filter((r) => r.ok).length,
    total: cabangList.length,
    results
  };
  const outFile = `kpi-ultimate-${period.period_start}_${period.period_end}.json`;
  writeFileSync(outFile, JSON.stringify(report, null, 2));

  const ok = results.find((r) => r.ok);
  const row = ok || results[0] || {};
  const ultimateRows = Number(row.ultimate_rows || 0);
  const parseErrors = Number(row.parse_errors || 0);
  const mapped = Number(row.mapping?.MATCHED || 0);
  const unmapped = Number(row.mapping?.UNMAPPED || 0) + Number(row.mapping?.AMBIGUOUS || 0);
  const lock = row.lock || { trx: 0, amount: 0, by_package: {} };
  const ready = Boolean(ok) && parseErrors === 0 && lock.trx > 0;

  console.log("FILES CREATED = ERP.NEW/migrations/20260832_kpi_ultimate_sources.sql ; minutes-connector/kpi-ultimate-sync.js ; minutes-connector/scheduler.js");
  console.log("DRY-RUN CABANG =", row.cabang || ONLY_CABANG || "-");
  console.log("ULTIMATE ROWS =", ultimateRows);
  console.log("LOCK ROWS =", lock.trx);
  console.log("MAPPED CASHIER =", mapped);
  console.log("UNMAPPED =", unmapped);
  console.log("PARSE ERRORS =", parseErrors);
  console.log("BY PACKAGE =", JSON.stringify(row.by_package || {}));
  console.log("LOCK BY PACKAGE =", JSON.stringify(lock.by_package || {}));
  console.log("REALISASI SUM =", row.realization || 0);
  console.log("LOCK REALISASI =", lock.amount || 0);
  console.log("PRODUCTION WRITE =", DRY_RUN ? "NO" : "YES");
  console.log("SQL APPLIED = NO");
  console.log("LOCKED ENGINE CHANGED = NO");
  console.log("READY FOR REVIEW =", ready ? "YES" : "NO");
  console.log("[KPI ULTIMATE] saved", outFile);
  return report;
}

async function main() {
  let selfPass = true;
  if (SELFTEST) {
    selfPass = runSelfTest();
    if (!selfPass) process.exitCode = 1;
    if (!LIVE) return;
    console.log("[KPI ULTIMATE] SELFTEST done — lanjut LIVE karena LIVE=true");
  }

  const report = await runLive();
  const okCount = report.processed;
  if (okCount < report.total) process.exitCode = 1;
}

export async function syncServiceDetailForPeriod({
  page,
  supabase,
  cabang,
  period,
  karyawanList,
  dryRun = false,
  index = 0,
  total = 1,
  replaceSet,
  reuseSession = true
}) {
  const singleDay = isSingleDayPeriod(period);
  return prosesCabang(page, supabase, cabang, period, karyawanList, index, total, {
    dryRun,
    reuseSession,
    replaceSet: replaceSet ?? singleDay
  });
}

const isDirectRun = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
);

if (isDirectRun) {
  main().catch((err) => {
    console.error("[KPI ULTIMATE]", err?.message || err);
    process.exit(1);
  });
}
