/* VAX WIJAYA — Employee monthly summary consumer (READ ONLY)
   Scope: only the logged-in employee and only the six summary cards.
   Source tables: absensi, jadwal_libur, pengaturan_absensi.
   Does not write attendance, GPS, geofence, RPC attendance, or owner modules. */
(() => {
  "use strict";

  const MONTHS = [
    "Januari","Februari","Maret","April","Mei","Juni",
    "Juli","Agustus","September","Oktober","November","Desember"
  ];

  const pad2 = (n) => String(n).padStart(2, "0");
  const isoDay = (y,m,d) => `${y}-${pad2(m)}-${pad2(d)}`;
  const isoDate = (v) => {
    const m = String(v || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}` : "";
  };
  const daysInMonth = (y,m) => new Date(y, m, 0).getDate();
  const todayJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone:"Asia/Jakarta" });
  const parseHm = (v) => {
    const m = String(v || "").trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? (Number(m[1]) * 60) + Number(m[2]) : null;
  };

  function statusCode(row){
    if(!row) return "-";
    const sa = String(row.status_absensi || "").trim().toUpperCase();
    const st = String(row.status || "").trim().toLowerCase();
    const lateMin = Number(row.terlambat_menit || 0);
    const isLate = lateMin > 0 || sa === "T" || st === "terlambat" || st.includes("terlambat");
    if(sa === "L" || st === "libur") return "L";
    if(sa === "S" || st === "sakit") return "S";
    if(sa === "I" || st === "izin") return "I";
    if(sa === "O" || st === "off" || st === "o") return "L";
    if(isLate) return "T";
    if(sa === "H" || st === "hadir" || st === "masuk") return "H";
    return "-";
  }

  function jadwalCode(row){
    if(!row) return "";
    const sc = String(row.status_canonical || "").trim().toUpperCase();
    const st = String(row.status || "").trim().toUpperCase();
    if(sc === "I" || st === "I" || st === "IZIN" || st.includes("IZIN")) return "I";
    if(sc === "S" || st === "S" || st === "SAKIT" || st.includes("SAKIT")) return "S";
    if(sc === "L" || st === "L" || st === "LIBUR" || st.includes("LIBUR")) return "L";
    if(sc === "O" || st === "O" || st === "OFF") return "L";
    return "";
  }

  function lateThresholdMinutes(settings){
    const base = parseHm(settings?.jam_masuk || "10:00");
    const tol = Number(settings?.toleransi_menit);
    return (base == null ? parseHm("10:15") : base + (Number.isFinite(tol) ? tol : 15));
  }

  function lateMinutesOf(row, settings){
    const clock = parseHm(row?.jam_masuk);
    if(clock == null) return Math.max(0, Number(row?.terlambat_menit || 0));
    return Math.max(0, clock - lateThresholdMinutes(settings));
  }

  function dendaSementaraOf(row, settings){
    const menit = lateMinutesOf(row, settings);
    if(menit <= 0) return 0;
    const tarif = Number(settings?.tarif_denda);
    const rate = Number.isFinite(tarif) && tarif > 0 ? tarif : 1000;
    const max = Number(settings?.max_denda || 0);
    const amt = menit * rate;
    return max > 0 ? Math.min(amt, max) : amt;
  }

  function dendaDecision(row){
    const s = String(row?.status_denda || "").trim().toLowerCase();
    if(/batal|cancel|void|dibatalkan/.test(s)) return "cancelled";
    if(s && (/lunas|dibayar|paid|potong|payroll/.test(s)) && !/belum|berlaku/.test(s)) return "final";
    return "pending";
  }

  async function loadEmployeeId(){
    if(typeof KaryawanSession === "undefined") return null;
    const secure = await KaryawanSession.loadSecureSession();
    if(!secure || secure.aktif !== true || !secure.id) return null;
    return Number(secure.id);
  }

  async function loadSettings(){
    const { data, error } = await db
      .from("pengaturan_absensi")
      .select("jam_masuk,toleransi_menit,tarif_denda,max_denda,aktif")
      .limit(1);
    if(error) return null;
    return (data || []).find((r) => r.aktif !== false) || data?.[0] || null;
  }

  async function loadAbsensi(karyawanId, start, end){
    const tries = [
      "tanggal,jam_masuk,status,status_absensi,terlambat_menit,denda,status_denda",
      "tanggal,jam_masuk,status,terlambat_menit,denda",
      "tanggal,jam_masuk,status,denda"
    ];
    for(const cols of tries){
      const { data, error } = await db.from("absensi").select(cols)
        .eq("karyawan_id", karyawanId).gte("tanggal", start).lte("tanggal", end)
        .order("tanggal", { ascending:true });
      if(!error) return data || [];
      if(!/column|schema cache|does not exist/i.test(error.message || "")) throw error;
    }
    return [];
  }

  async function loadJadwal(karyawanId, start, end){
    const tries = [
      "tanggal,status,status_canonical",
      "tanggal,status"
    ];
    for(const cols of tries){
      const { data, error } = await db.from("jadwal_libur").select(cols)
        .eq("karyawan_id", karyawanId).gte("tanggal", start).lte("tanggal", end);
      if(!error) return data || [];
      if(!/column|schema cache|does not exist/i.test(error.message || "")) throw error;
    }
    return [];
  }

  function buildSummary(absensiRows, jadwalRows, settings, year, month){
    const byAbsensi = new Map();
    for(const row of absensiRows || []){
      const iso = isoDate(row.tanggal);
      if(!iso) continue;
      const prev = byAbsensi.get(iso);
      if(!prev){
        byAbsensi.set(iso, row);
        continue;
      }
      const prevScore = Number(prev.denda || 0) + Number(prev.terlambat_menit || 0);
      const nextScore = Number(row.denda || 0) + Number(row.terlambat_menit || 0);
      if(nextScore >= prevScore) byAbsensi.set(iso, row);
    }

    const byJadwal = new Map();
    for(const row of jadwalRows || []){
      const iso = isoDate(row.tanggal);
      if(!iso) continue;
      const prev = byJadwal.get(iso);
      if(!prev || (!jadwalCode(prev) && jadwalCode(row))) byJadwal.set(iso, row);
    }

    const todayIso = todayJakarta();
    let masuk=0, terlambat=0, izin=0, sakit=0, libur=0, denda=0;

    for(let day=1; day<=daysInMonth(year, month); day++){
      const iso = isoDay(year, month, day);
      const rec = byAbsensi.get(iso) || null;
      const jadwal = byJadwal.get(iso) || null;
      const jc = jadwalCode(jadwal);
      let code = "-";

      if(jc === "I" || jc === "S" || jc === "L") code = jc;
      else if(iso <= todayIso) code = statusCode(rec);

      if(code === "H") masuk++;
      else if(code === "T") terlambat++;
      else if(code === "I") izin++;
      else if(code === "S") sakit++;
      else if(code === "L") libur++;

      if(rec){
        const decision = dendaDecision(rec);
        if(decision !== "cancelled"){
          const sementara = dendaSementaraOf(rec, settings);
          denda += decision === "final" ? Number(rec.denda || sementara || 0) : sementara;
        }
      }
    }
    return { masuk, terlambat, izin, sakit, libur, denda };
  }

  function setCard(id, value){
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  }

  async function renderMonth(year, month){
    const karyawanId = await loadEmployeeId();
    if(!karyawanId) return;

    const start = isoDay(year, month, 1);
    const end = isoDay(year, month, daysInMonth(year, month));

    const [absensiRows, jadwalRows, settings] = await Promise.all([
      loadAbsensi(karyawanId, start, end),
      loadJadwal(karyawanId, start, end),
      loadSettings()
    ]);

    const s = buildSummary(absensiRows, jadwalRows, settings, year, month);
    setCard("hadir", s.masuk);
    setCard("terlambat", s.terlambat);
    setCard("izin", s.izin);
    setCard("sakit", s.sakit);
    setCard("libur", s.libur);
    setCard("denda", "Rp" + Number(s.denda || 0).toLocaleString("id-ID"));

    const title = document.getElementById("employeeSummaryMonthTitle");
    if(title) title.textContent = `Ringkasan ${MONTHS[month-1]} ${year}`;
  }

  function bindUi(){
    const button = document.getElementById("employeeSummaryMonthButton");
    const popup = document.getElementById("employeeSummaryMonthPopup");
    const grid = document.getElementById("employeeSummaryMonthGrid");
    const yearLabel = document.getElementById("employeeSummaryYearLabel");
    const prev = document.getElementById("employeeSummaryYearPrev");
    const next = document.getElementById("employeeSummaryYearNext");
    if(!button || !popup || !grid || !yearLabel || !prev || !next || button.dataset.bound === "1") return;

    button.dataset.bound = "1";
    const now = todayJakarta();
    const currentYear = Number(now.slice(0,4));
    const currentMonth = Number(now.slice(5,7));
    let viewYear = currentYear;
    let activeYear = currentYear;
    let activeMonth = currentMonth;

    function renderMonthGrid(){
      yearLabel.textContent = String(viewYear);
      grid.replaceChildren();
      MONTHS.forEach((name, index) => {
        const month = index + 1;
        const item = document.createElement("button");
        item.type = "button";
        item.className = "employee-summary-month-item";
        item.textContent = name.slice(0,3);
        item.dataset.month = String(month);
        item.classList.toggle("is-active", viewYear === activeYear && month === activeMonth);
        item.classList.toggle("is-current", viewYear === currentYear && month === currentMonth);
        item.addEventListener("click", async () => {
          popup.hidden = true;
          button.setAttribute("aria-expanded", "false");
          try{
            button.disabled = true;
            await renderMonth(viewYear, month);
            activeYear = viewYear;
            activeMonth = month;
            renderMonthGrid();
          }catch(err){
            console.error("[EmployeeMonthSummary] gagal memuat ringkasan:", err);
          }finally{
            button.disabled = false;
          }
        });
        grid.appendChild(item);
      });
    }

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      popup.hidden = !popup.hidden;
      button.setAttribute("aria-expanded", String(!popup.hidden));
      if(!popup.hidden) renderMonthGrid();
    });

    popup.addEventListener("click", (e) => e.stopPropagation());

    prev.addEventListener("click", () => {
      viewYear -= 1;
      renderMonthGrid();
    });

    next.addEventListener("click", () => {
      viewYear += 1;
      renderMonthGrid();
    });

    document.addEventListener("click", () => {
      popup.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });

    renderMonthGrid();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bindUi, { once:true });
  }else{
    bindUi();
  }
})();