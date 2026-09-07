/*
=========================================================
VAX ERP — TABEL HARIAN CASH OUT ROW LINK
=========================================================
UI / NAVIGATION ONLY.
- Nominal Cash Out per baris dapat diklik.
- Navigasi ke modul Cash Out dengan cabang yang sama.
- Cash Out dibuka untuk 1 bulan penuh dari tanggal yang diklik.
- Tanggal asal dikirim sebagai focusDate untuk highlight presenter.
- Saat kembali dari Cash Out, cabang asal dipulihkan SEKALI dari URL,
  lalu pengelolaan filter kembali ke dashboard.js canonical.
- Panel informasi bergantian: petunjuk Cash Out, pengingat audit, dan
  motivasi usaha harian (30+ variasi, berganti setiap hari).
- Kondisi omzet untuk motivasi hanya dibaca dari DOM yang sudah dirender;
  tidak mengubah engine, formula, query, atau sumber data.
=========================================================
*/
"use strict";

(function(){
    const STYLE_ID = "thcCashOutRowLinkStyle";
    const HINT_ID = "thcCashOutHintPanel";
    const RETURN_FOCUS_CLASS = "thc-return-focus-flash";
    let observer = null;
    let bound = false;
    let refreshTimer = null;
    let returnDone = false;
    let returnBranchApplied = false;
    let hintTimer = null;
    let hintIndex = 0;

    const HINT_DURATIONS = [7000, 8000, 10000];

    const OMZET_UP = [
        "Omzet naik itu kabar baik. Catat apa yang bekerja, lalu ulangi dengan disiplin.",
        "Angka naik bukan alasan santai; itu petunjuk bahwa cara hari ini layak dipertahankan.",
        "Omzet bergerak naik. Jaga pelayanan, jaga ritme, jangan kasih kualitas ikut turun.",
        "Hari bagus harus jadi data, bukan cuma kenangan. Cari penyebab naiknya dan pertahankan.",
        "Naik sedikit tetap kemajuan. Bisnis besar tumbuh dari kenaikan kecil yang konsisten.",
        "Omzet naik, bagus. Sekarang tugasnya bikin hasil bagus ini bisa diulang besok.",
        "Kalau angka naik, jangan cuma senang—pelajari pola customer yang membuatnya terjadi.",
        "Tren naik berarti ada yang benar. Rawat prosesnya sebelum mengejar hal baru.",
        "Omzet menguat. Pertahankan standar, karena customer kembali bukan karena kebetulan.",
        "Hari ini lebih baik. Besok targetnya bukan sempurna, cukup lebih rapi dari hari ini.",
        "Angka hijau lahir dari kerja yang benar. Pastikan tim tahu apa yang harus dipertahankan.",
        "Omzet naik itu bonus; kebiasaan baik yang membuatnya naik adalah aset sebenarnya.",
        "Kinerja naik. Jangan buru-buru ubah resep yang sedang bekerja.",
        "Naik berarti pasar merespons. Dengarkan customer dan terus perbaiki pengalaman mereka.",
        "Hasil naik patut disyukuri. Sistem yang rapi membuat syukur itu lebih sering datang."
    ];

    const OMZET_DOWN = [
        "Omzet turun bukan vonis. Angka sedang menunjukkan bagian yang perlu diperbaiki.",
        "Hari sepi bukan hari gagal. Gunakan waktunya untuk cari penyebab dan rapikan eksekusi.",
        "Kalau omzet turun, jangan panik. Periksa data, pelayanan, lalu ambil satu tindakan nyata.",
        "Angka turun itu alarm, bukan akhir cerita. Cari masalahnya sebelum cari alasan.",
        "Bisnis tidak selalu naik. Yang penting, saat turun kita belajar lebih cepat dari kemarin.",
        "Omzet melemah. Fokus pada hal yang bisa dikendalikan: layanan, follow-up, dan konsistensi.",
        "Turun hari ini boleh. Menyerah memperbaiki besok yang tidak boleh.",
        "Data merah meminta perhatian, bukan kepanikan. Baca penyebabnya lalu bergerak.",
        "Saat omzet turun, kualitas jangan ikut turun. Justru itu waktu terbaik menjaga standar.",
        "Penurunan adalah bahan evaluasi. Keputusan yang tenang lebih mahal dari reaksi terburu-buru.",
        "Angka belum sesuai harapan. Tetap rapi, tetap ramah, tetap cari peluang.",
        "Omzet turun memberi satu tugas: temukan satu hal yang bisa dibuat lebih baik hari ini.",
        "Jangan lawan data dengan perasaan. Terima angkanya, cari sebabnya, perbaiki prosesnya.",
        "Hari ini kurang, besok belum tentu. Yang menentukan adalah tindakan setelah melihat datanya.",
        "Bisnis kuat bukan yang tak pernah turun, tapi yang cepat tahu kenapa turun dan segera berbenah."
    ];

    const OMZET_STABLE = [
        "Omzet stabil adalah pondasi. Naik kelas dimulai dari perbaikan kecil yang konsisten.",
        "Stabil itu aman, tapi jangan terlena. Cari satu peluang kecil untuk tumbuh hari ini.",
        "Angka relatif stabil. Pertahankan yang baik, eksperimen kecil pada yang masih lemah.",
        "Konsisten lebih berharga daripada ramai sesaat. Sekarang cari cara naik satu tingkat.",
        "Omzet stabil berarti mesin berjalan. Tugas berikutnya membuat mesin itu makin efisien.",
        "Stabil bukan berarti diam. Sedikit lebih ramah, cepat, dan rapi bisa mengubah hasil.",
        "Hari yang stabil adalah kesempatan memperkuat standar sebelum mengejar pertumbuhan.",
        "Angka tenang, kepala juga harus tenang. Evaluasi kecil hari ini bisa jadi lompatan besok.",
        "Stabil berarti ada dasar yang bisa dipercaya. Bangun pertumbuhan dari dasar itu.",
        "Jaga ritme saat stabil. Banyak bisnis jatuh bukan saat sepi, tapi saat mulai lengah.",
        "Hasil konsisten adalah modal. Gunakan modal itu untuk memperbaiki detail yang sering diabaikan.",
        "Omzet belum banyak berubah. Tidak masalah—pastikan kualitas terus bergerak naik.",
        "Stabil hari ini, lebih baik besok. Fokus pada pelayanan yang membuat customer ingin kembali.",
        "Bisnis yang sehat tidak harus heboh setiap hari. Yang penting terukur dan terus membaik.",
        "Saat angka stabil, disiplinlah yang membedakan bertahan dengan berkembang."
    ];

    const HUMOR_QUOTES = [
        "Semangat cari cuan. Tagihan selalu datang tepat waktu, masa kita kalah disiplin?",
        "Rezeki memang ada yang ngatur, tapi kasir tetap harus ngitung dengan benar.",
        "Kerja boleh capek, salah input jangan. Uang punya bakat bikin kita melek lagi.",
        "Kalau hari ini sepi, jangan ikut sepi semangatnya. Cicilan tidak ikut libur.",
        "Customer boleh PHP, laporan jangan. Angka harus tetap jelas dan jujur.",
        "Cari duit itu maraton. Kopi boleh habis, semangat jangan ikut kosong.",
        "Senyum ke customer itu gratis. Kalau bikin dia balik lagi, ROI-nya lumayan.",
        "Jangan takut lihat angka merah. Yang lebih seram itu tidak pernah lihat angka sama sekali.",
        "Bisnis memang naik turun. Yang penting saldo jangan hobi turun sendirian.",
        "Kalau omzet belum naik, minimal kualitas pelayanan jangan ikut rebahan.",
        "Hari ini kerja rapi, besok tidur lebih nyenyak. Kecuali ada chat supplier tengah malam.",
        "Uang tidak tumbuh di pohon. Makanya kita tanam pelayanan yang bikin customer kembali.",
        "Semangat kerja. Dompet punya cita-cita yang perlu kita dukung bersama.",
        "Jangan kejar cuan sampai lupa catat cuan. Yang tidak tercatat suka bikin debat.",
        "Bisnis itu romantis: tiap hari kita kejar omzet, tiap akhir bulan omzet pura-pura jual mahal."
    ];

    const GENERAL_QUOTES = [
        "Bisnis besar dibangun dari keputusan kecil yang benar, dilakukan terus-menerus.",
        "Disiplin mengalahkan semangat yang hanya datang sesekali.",
        "Yang bisa diukur bisa diperbaiki; yang diperbaiki terus akan bertumbuh.",
        "Pelayanan yang baik hari ini adalah promosi gratis untuk hari esok.",
        "Jangan hanya mengejar ramai. Bangun alasan agar customer ingin kembali.",
        "Kecepatan penting, tetapi ketelitian membuat usaha bertahan lama.",
        "Usaha yang sehat tumbuh dari data yang benar dan keputusan yang tenang.",
        "Konsistensi tidak selalu terlihat keren, tapi hasilnya selalu terasa.",
        "Setiap customer adalah kesempatan membangun reputasi, bukan sekadar satu transaksi.",
        "Hari ini mungkin biasa saja, tapi kebiasaan baik hari ini membentuk hasil luar biasa.",
        "Fokus pada proses yang bisa dikendalikan; hasil akan mengikuti kualitas prosesnya.",
        "Jangan menunggu kondisi sempurna. Perbaiki yang ada, satu langkah setiap hari.",
        "Tim yang kuat bukan yang tak pernah salah, tapi yang cepat belajar dan tidak mengulanginya.",
        "Keuntungan adalah hasil. Kepercayaan customer adalah aset yang membuat hasil itu berulang.",
        "Kerjakan yang penting dengan rapi. Bisnis menghargai konsistensi lebih dari kesibukan."
    ];

    function returnParams(){
        const q = new URLSearchParams(window.location.search || "");
        const from = String(q.get("from") || "").trim().toLowerCase();
        const focusDate = String(q.get("focusDate") || "").trim().slice(0, 10);
        const cabang = String(q.get("cabang") || "").trim();
        if(from !== "cash-out-row") return null;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(focusDate)) return null;
        return { focusDate, cabang };
    }

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #thcTable td.thc-cashout .thc-cashout-row-link{display:inline;margin:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:inherit;line-height:inherit;cursor:pointer;white-space:nowrap;text-align:inherit}
            #thcTable td.thc-cashout .thc-cashout-row-link:hover,#thcTable td.thc-cashout .thc-cashout-row-link:focus-visible{color:#ff7b82;text-decoration:underline;text-underline-offset:2px;outline:none}
            #thcTable td.thc-cashout .thc-cashout-row-link.is-zero{opacity:.58}
            #${HINT_ID}{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;margin:0;padding:11px 16px;border-top:1px solid rgba(212,175,55,.30);border-bottom:1px solid rgba(212,175,55,.34);background:linear-gradient(90deg,rgba(242,194,48,.10) 0%,rgba(23,28,35,.96) 24%,rgba(17,21,27,.98) 100%);color:#E2E8F0;box-shadow:inset 4px 0 0 #F2C230,0 6px 18px rgba(0,0,0,.18);position:relative;z-index:2;overflow:hidden}
            #${HINT_ID} .thc-cashout-hint-icon{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;border:1px solid rgba(242,194,48,.42);background:rgba(242,194,48,.10);color:#F2C230;font-size:16px;font-weight:900;line-height:1;box-shadow:0 0 12px rgba(242,194,48,.10);transition:.28s ease}
            #${HINT_ID} .thc-cashout-hint-copy{min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:5px 8px;line-height:1.35;transition:opacity .28s ease,transform .28s ease}
            #${HINT_ID}.is-changing .thc-cashout-hint-copy{opacity:0;transform:translateY(4px)}
            #${HINT_ID} .thc-cashout-hint-title{color:#F2C230;font-size:12px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
            #${HINT_ID} .thc-cashout-hint-text{margin:0;color:#E2E8F0;font-size:13.5px;font-weight:650}
            #${HINT_ID} .thc-cashout-hint-text strong{color:#FFFFFF;font-weight:900}
            #${HINT_ID}[data-hint-kind="audit"]{box-shadow:inset 4px 0 0 #38bdf8,0 6px 18px rgba(0,0,0,.18)}
            #${HINT_ID}[data-hint-kind="audit"] .thc-cashout-hint-title,#${HINT_ID}[data-hint-kind="audit"] .thc-cashout-hint-icon{color:#67d5ff;border-color:rgba(56,189,248,.42);background:rgba(56,189,248,.08)}
            #${HINT_ID}[data-hint-kind="wisdom"]{box-shadow:inset 4px 0 0 #c084fc,0 6px 18px rgba(0,0,0,.18)}
            #${HINT_ID}[data-hint-kind="wisdom"] .thc-cashout-hint-title,#${HINT_ID}[data-hint-kind="wisdom"] .thc-cashout-hint-icon{color:#d8b4fe;border-color:rgba(192,132,252,.42);background:rgba(192,132,252,.08)}
            @media (max-width:700px){#${HINT_ID}{align-items:flex-start;padding:10px 12px;gap:10px}#${HINT_ID} .thc-cashout-hint-icon{width:28px;height:28px;font-size:14px}#${HINT_ID} .thc-cashout-hint-copy{display:block}#${HINT_ID} .thc-cashout-hint-title{display:block;margin-bottom:3px}#${HINT_ID} .thc-cashout-hint-text{font-size:13px}}
            @keyframes thcReturnFocusPulse{0%,100%{background:rgba(234,179,8,.04);box-shadow:inset 3px 0 0 rgba(234,179,8,.28)}50%{background:rgba(234,179,8,.18);box-shadow:inset 4px 0 0 #facc15,0 0 16px rgba(234,179,8,.16)}}
            #thcTbody tr.${RETURN_FOCUS_CLASS}>td{animation:thcReturnFocusPulse .62s ease-in-out 7}
            #thcTbody tr.${RETURN_FOCUS_CLASS}>td:first-child,#thcTbody tr.${RETURN_FOCUS_CLASS}>td:nth-child(2){color:#facc15;font-weight:800}
        `;
        document.head.appendChild(style);
    }

    function parseMoney(text){
        const s = String(text || "").replace(/[^0-9-]/g, "");
        const n = Number(s || 0);
        return Number.isFinite(n) ? n : 0;
    }

    function getOmzetMood(){
        const trs = [...document.querySelectorAll("#thcTbody tr[data-tanggal]")];
        if(!trs.length) return "stable";
        const byDate = new Map();
        trs.forEach((tr) => {
            const date = String(tr.getAttribute("data-tanggal") || "").slice(0,10);
            if(!date) return;
            const amount = parseMoney(tr.children?.[2]?.textContent || "0");
            byDate.set(date, (byDate.get(date) || 0) + amount);
        });
        const dates = [...byDate.keys()].sort().reverse();
        if(dates.length < 2) return "stable";
        const latest = Number(byDate.get(dates[0]) || 0);
        const prev = Number(byDate.get(dates[1]) || 0);
        if(prev <= 0) return latest > 0 ? "up" : "stable";
        const change = (latest - prev) / prev;
        if(change > .02) return "up";
        if(change < -.02) return "down";
        return "stable";
    }

    function jakartaDateKey(){
        try{
            return new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
        }catch(_e){
            return new Date().toISOString().slice(0,10);
        }
    }

    function dailyIndex(){
        const key = jakartaDateKey();
        const [y,m,d] = key.split("-").map(Number);
        return Math.floor(Date.UTC(y,m-1,d) / 86400000);
    }

    function dailyWisdom(){
        const day = dailyIndex();
        const group = ((day % 3) + 3) % 3;
        const idx = Math.floor(day / 3);
        if(group === 0){
            const mood = getOmzetMood();
            const bank = mood === "up" ? OMZET_UP : mood === "down" ? OMZET_DOWN : OMZET_STABLE;
            return { title: mood === "up" ? "Catatan Omzet · Naik" : mood === "down" ? "Catatan Omzet · Turun" : "Catatan Omzet · Stabil", text: bank[((idx % bank.length) + bank.length) % bank.length] };
        }
        if(group === 1){
            return { title:"Humor Usaha", text:HUMOR_QUOTES[((idx % HUMOR_QUOTES.length) + HUMOR_QUOTES.length) % HUMOR_QUOTES.length] };
        }
        return { title:"Semangat Usaha", text:GENERAL_QUOTES[((idx % GENERAL_QUOTES.length) + GENERAL_QUOTES.length) % GENERAL_QUOTES.length] };
    }

    function hintMessages(){
        const wisdom = dailyWisdom();
        return [
            {kind:"cashout", icon:"↗", title:"Petunjuk Cash Out", html:"<strong>Klik nominal Cash Out</strong> pada tabel untuk melihat rincian pengeluaran sesuai cabang dan tanggal yang diperiksa."},
            {kind:"audit", icon:"✓", title:"Pengingat Audit Data", html:"Pastikan data <strong>Minutes asli sudah dicocokkan</strong> dengan data yang tampil. Saat mengisi <strong>BRI Merchant</strong>, periksa kembali nominal agar tidak terjadi salah input angka."},
            {kind:"wisdom", icon:"✦", title:wisdom.title, html:wisdom.text}
        ];
    }

    function renderHint(index, animate = true){
        const panel = document.getElementById(HINT_ID);
        if(!panel) return;
        const messages = hintMessages();
        const item = messages[index % messages.length];
        const apply = () => {
            panel.dataset.hintKind = item.kind;
            const icon = panel.querySelector(".thc-cashout-hint-icon");
            const title = panel.querySelector(".thc-cashout-hint-title");
            const text = panel.querySelector(".thc-cashout-hint-text");
            if(icon) icon.textContent = item.icon;
            if(title) title.textContent = item.title;
            if(text) text.innerHTML = item.html;
            panel.classList.remove("is-changing");
        };
        if(!animate){ apply(); return; }
        panel.classList.add("is-changing");
        setTimeout(apply, 260);
    }

    function scheduleNextHint(){
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => {
            hintIndex = (hintIndex + 1) % 3;
            renderHint(hintIndex, true);
            scheduleNextHint();
        }, HINT_DURATIONS[hintIndex] || 8000);
    }

    function startHintRotation(){
        if(hintTimer) return;
        renderHint(hintIndex, false);
        scheduleNextHint();
    }

    function ensureHintPanel(){
        let panel = document.getElementById(HINT_ID);
        if(!panel){
            const tableScroll = document.getElementById("thcScroll");
            if(!tableScroll || !tableScroll.parentElement) return false;
            panel = document.createElement("div");
            panel.id = HINT_ID;
            panel.setAttribute("role", "note");
            panel.setAttribute("aria-live", "polite");
            panel.setAttribute("aria-label", "Informasi pemeriksaan Tabel Harian");
            panel.innerHTML = `<span class="thc-cashout-hint-icon" aria-hidden="true">↗</span><div class="thc-cashout-hint-copy"><span class="thc-cashout-hint-title">Petunjuk Cash Out</span><p class="thc-cashout-hint-text"></p></div>`;
            tableScroll.parentElement.insertBefore(panel, tableScroll);
        }
        startHintRotation();
        return true;
    }

    function findBranchOption(select, wanted){
        if(!select || !wanted) return null;
        const target = String(wanted || "").trim().toLowerCase();
        if(!target) return null;
        return [...select.options].find((o) => {
            const value = String(o.value || "").trim().toLowerCase();
            const text = String(o.textContent || "").trim().toLowerCase();
            return value === target || text === target || value.includes(target) || target.includes(value);
        }) || null;
    }

    function applyReturnBranchOnce(){
        if(returnBranchApplied) return false;
        const p = returnParams();
        if(!p?.cabang) return false;
        const select = document.getElementById("branchFilter");
        if(!select) return false;
        const hit = findBranchOption(select, p.cabang);
        if(!hit) return false;
        returnBranchApplied = true;
        if(select.value !== hit.value){
            select.value = hit.value;
            select.dispatchEvent(new Event("change", { bubbles:true }));
        }
        return true;
    }

    function rows(){
        return (typeof TabelHarianCabang !== "undefined" && Array.isArray(TabelHarianCabang.rows)) ? TabelHarianCabang.rows : [];
    }

    function decorate(){
        const body = document.getElementById("thcTbody");
        const data = rows();
        if(!body || !data.length) return false;
        const trs = [...body.querySelectorAll("tr")];
        trs.forEach((tr, index) => {
            const meta = data[index];
            const cell = tr.querySelector("td.thc-cashout");
            if(!meta || !cell) return;
            const tanggal = String(meta.tanggal || "").slice(0, 10);
            const cabangId = Number(meta.cabang_id);
            const cabangName = String(meta.cabang_name || "").trim();
            const nominal = Number(meta.cash_out || 0);
            const existingValue = cell.querySelector(".thc-cashout-row-value")?.textContent;
            const label = String(existingValue || cell.textContent || "").trim() || "Rp 0";
            let btn = cell.querySelector(".thc-cashout-row-link");
            if(!btn){ btn = document.createElement("button"); btn.type = "button"; btn.className = "thc-cashout-row-link"; cell.replaceChildren(btn); }
            btn.classList.toggle("is-zero", !(nominal > 0));
            btn.dataset.tanggal = tanggal;
            btn.dataset.cabangId = Number.isFinite(cabangId) ? String(cabangId) : "";
            btn.dataset.cabangName = cabangName;
            btn.dataset.nominal = Number.isFinite(nominal) ? String(nominal) : "0";
            btn.setAttribute("aria-label", `Buka rincian Cash Out ${cabangName || "cabang"} tanggal ${tanggal}`);
            btn.title = `Klik nominal untuk lihat rincian Cash Out · ${cabangName || "Cabang"} · ${tanggal}`;
            btn.innerHTML = `<span class="thc-cashout-row-value"></span>`;
            btn.querySelector(".thc-cashout-row-value").textContent = label;
        });
        return true;
    }

    function focusReturnedRow(){
        if(returnDone) return true;
        const p = returnParams();
        if(!p) return false;
        const body = document.getElementById("thcTbody");
        if(!body) return false;
        const row = body.querySelector(`tr[data-tanggal="${p.focusDate}"]`) || [...body.querySelectorAll("tr[data-tanggal]")].find((tr) => String(tr.getAttribute("data-tanggal") || "").slice(0, 10) === p.focusDate);
        if(!row) return false;
        returnDone = true;
        document.querySelectorAll(`#thcTbody tr.${RETURN_FOCUS_CLASS}`).forEach((tr) => tr.classList.remove(RETURN_FOCUS_CLASS));
        row.classList.add(RETURN_FOCUS_CLASS);
        requestAnimationFrame(() => row.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" }));
        setTimeout(() => row.classList.remove(RETURN_FOCUS_CLASS), 4800);
        return true;
    }

    function scheduleDecorate(delay = 20){
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { ensureHintPanel(); decorate(); focusReturnedRow(); }, delay);
    }

    function monthRange(iso){
        const tanggal = String(iso || "").slice(0, 10);
        const m = tanggal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!m) return null;
        const year = Number(m[1]);
        const month = Number(m[2]);
        if(!year || month < 1 || month > 12) return null;
        const lastDay = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
        return { start:`${m[1]}-${m[2]}-01`, end:`${m[1]}-${m[2]}-${String(lastDay).padStart(2,"0")}` };
    }

    function openCashOut(btn){
        const tanggal = String(btn?.dataset?.tanggal || "").slice(0, 10);
        const cabangId = String(btn?.dataset?.cabangId || "").trim();
        const cabangName = String(btn?.dataset?.cabangName || "").trim();
        const range = monthRange(tanggal);
        if(!range || !cabangId) return;
        const url = new URL("./cash-out.html", window.location.href);
        url.searchParams.set("cabangId", cabangId);
        if(cabangName) url.searchParams.set("cabangName", cabangName);
        url.searchParams.set("periode", "customtanggal");
        url.searchParams.set("start", range.start);
        url.searchParams.set("end", range.end);
        url.searchParams.set("focusDate", tanggal);
        url.searchParams.set("from", "tabel-harian-row");
        window.location.href = url.href;
    }

    function bindEvents(){
        if(bound) return;
        bound = true;
        document.addEventListener("click", (e) => {
            const btn = e.target.closest?.("#thcTable .thc-cashout-row-link");
            if(!btn) return;
            e.preventDefault();
            e.stopPropagation();
            openCashOut(btn);
        });
        document.addEventListener("erp:components-ready", () => { applyReturnBranchOnce(); scheduleDecorate(0); });
    }

    function observe(){
        const body = document.getElementById("thcTbody");
        if(!body || observer) return;
        observer = new MutationObserver(() => scheduleDecorate(10));
        observer.observe(body, { childList:true, subtree:false });
    }

    function boot(){
        ensureStyle();
        ensureHintPanel();
        bindEvents();
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            ensureHintPanel();
            observe();
            const decorated = decorate();
            const focused = focusReturnedRow();
            if((decorated && (!returnParams() || focused)) || tries >= 120) clearInterval(timer);
        }, 50);
    }

    window.TabelHarianCashOutRowLink = {
        refresh: () => { const ok = decorate(); renderHint(hintIndex, false); return ok; },
        focusReturnedRow: () => focusReturnedRow(),
        refreshHint: () => renderHint(hintIndex, false)
    };

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true });
    else boot();
})();