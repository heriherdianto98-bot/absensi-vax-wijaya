import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("SUPABASE_URL atau SUPABASE_SERVICE_KEY belum terbaca dari .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function tanggalWIB() {
  const arg = process.argv[2]?.trim();
  if (arg) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      throw new Error("Format tanggal harus YYYY-MM-DD");
    }
    return arg;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalisasi(teks = "") {
  return String(teks).trim().replace(/\s+/g, " ").toLowerCase();
}

const tanggal = tanggalWIB();
console.log(`Money Bridge Daily Recap: ${tanggal}`);

const { data: cabang, error: cabangError } = await supabase
  .from("cabang")
  .select("id,nama_cabang,nama_minutes,aktif")
  .eq("aktif", true)
  .not("nama_minutes", "is", null)
  .order("id", { ascending: true });

if (cabangError) throw cabangError;

const cabangAktif = (cabang || []).filter(
  (c) => Number(c.id) >= 1 && Number(c.id) <= 10 && c.nama_minutes
);

const { data: minutesRows, error: minutesError } = await supabase
  .from("minutes_daily")
  .select("tanggal,cabang,gross_revenue,cash_payment,non_cash,net_revenue,product_cost")
  .eq("tanggal", tanggal);

if (minutesError) throw minutesError;

const minutesByCabang = new Map(
  (minutesRows || []).map((row) => [normalisasi(row.cabang), row])
);

const hasil = [];

for (const c of cabangAktif) {
  const md = minutesByCabang.get(normalisasi(c.nama_minutes));

  if (!md) {
    hasil.push({ cabang: c.nama_cabang, status: "WAITING_MINUTES" });
    continue;
  }

  const { data: recap, error: recapError } = await supabase
    .from("daily_recap_source")
    .select("id,produk")
    .eq("cabang_id", c.id)
    .eq("tanggal", tanggal)
    .maybeSingle();

  if (recapError) throw recapError;

  if (!recap?.id) {
    hasil.push({ cabang: c.nama_cabang, status: "WAITING_RECAP_SOURCE" });
    continue;
  }

  const produk = Number(recap.produk || 0);
  const gross = Number(md.gross_revenue || 0);
  const service = gross - produk;
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("daily_recap_source")
    .update({
      service,
      cash_payment: Number(md.cash_payment || 0),
      non_cash: Number(md.non_cash || 0),
      nett_revenue: Number(md.net_revenue || 0),
      product_cost: Number(md.product_cost || 0),
      source_name: "MINUTES",
      sync_status: "SYNCED",
      synced_at: now,
      updated_at: now
    })
    .eq("id", recap.id);

  if (updateError) throw updateError;

  const { data: cek, error: cekError } = await supabase
    .from("daily_recap_source")
    .select("service,produk,cash_payment,non_cash,nett_revenue,product_cost")
    .eq("id", recap.id)
    .single();

  if (cekError) throw cekError;

  const diffGross = Number(cek.service || 0) + Number(cek.produk || 0) - gross;
  const diffCash = Number(cek.cash_payment || 0) - Number(md.cash_payment || 0);
  const diffNonCash = Number(cek.non_cash || 0) - Number(md.non_cash || 0);
  const diffNett = Number(cek.nett_revenue || 0) - Number(md.net_revenue || 0);
  const diffProductCost = Number(cek.product_cost || 0) - Number(md.product_cost || 0);

  const pass = [diffGross, diffCash, diffNonCash, diffNett, diffProductCost]
    .every((n) => n === 0);

  hasil.push({
    cabang: c.nama_cabang,
    status: pass ? "PASS_RP0" : "MISMATCH",
    diffGross,
    diffCash,
    diffNonCash,
    diffNett,
    diffProductCost
  });
}

console.table(hasil);

const mismatch = hasil.filter((x) => x.status === "MISMATCH");
if (mismatch.length) {
  console.error("Money Bridge gagal: masih ada mismatch.");
  process.exit(1);
}

console.log("✅ Money Bridge selesai. Semua row yang tersedia tervalidasi Rp0.");
