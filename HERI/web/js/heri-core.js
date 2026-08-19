/**
 * HERI Phase 1 core — migration, rupiah input, category chips,
 * smart memory, voice confirm, AI query, TTS privacy, payment/NFC UI.
 * Never writes to V3 localStorage key.
 */
(function () {
  "use strict";

  const V3_KEY = "expense_new_v3_heri_putri";
  const HERI_KEY = "heri_transactions_v1";
  const HIDDEN_KEY = "heri_hidden_ids_v1";
  const MEMORY_KEY = "heri_category_memory_v1";
  const PRIVACY_KEY = "heri_voice_privacy_v1";
  const PRIVACY_LEVEL_KEY = "heri_voice_privacy_level_v1";
  const SEED_FLAG = "heri_memory_seeded_v1";

  function readJson(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readV3New() {
    return readJson(V3_KEY, []);
  }
  function readHeriNew() {
    return readJson(HERI_KEY, []);
  }
  function readHidden() {
    return new Set(readJson(HIDDEN_KEY, []));
  }

  // ---- Safe merge: IMPORTED + V3 inputs (read-only) + HERI inputs ----
  window.HERI = window.HERI || {};
  HERI.keys = { V3_KEY, HERI_KEY, MEMORY_KEY, PRIVACY_KEY };

  function mergeAll() {
    const hidden = readHidden();
    const map = new Map();
    const push = (row, sourceTag) => {
      if (!row || !row.id || hidden.has(row.id)) return;
      if (map.has(row.id)) return;
      map.set(row.id, Object.assign({}, row, { source: row.source || sourceTag }));
    };
    (typeof IMPORTED_DATA !== "undefined" ? IMPORTED_DATA : []).forEach((r) => push(r, "excel"));
    readV3New().forEach((r) => push(r, "v3"));
    readHeriNew().forEach((r) => push(r, "heri"));
    return Array.from(map.values());
  }

  // Override V3 globals safely
  window.allData = mergeAll;
  window.newData = readHeriNew();

  window.persist = function persist() {
    writeJson(HERI_KEY, window.newData);
    // NEVER touch V3_KEY
  };

  window.deleteNew = function deleteNew(id) {
    const before = window.newData.length;
    window.newData = window.newData.filter((x) => x.id !== id);
    if (window.newData.length !== before) {
      persist();
      refreshAll();
      renderRecentNew();
      toast("Transaksi HERI dihapus");
      return;
    }
    // Soft-hide V3/imported without mutating V3 storage
    const hidden = readJson(HIDDEN_KEY, []);
    if (!hidden.includes(id)) hidden.push(id);
    writeJson(HIDDEN_KEY, hidden);
    refreshAll();
    renderRecentNew();
    toast("Disembunyikan di HERI (data V3 tetap utuh)");
  };

  // ---- Rupiah helpers ----
  window.fmt = function fmt(n) {
    return "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
  };

  // Indonesian spoken numbers → digits (Voice First requirement)
  const ID_UNITS = {
    nol: 0, kosong: 0, se: 1, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5,
    enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
  };

  function wordsToNumber(phrase) {
    const p = String(phrase || "")
      .toLowerCase()
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!p) return null;
    if (/^\d+([.,]\d+)?$/.test(p)) return parseFloat(p.replace(",", "."));
    if (ID_UNITS[p] != null) return ID_UNITS[p];

    // belas
    let m = p.match(/^(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s+belas$/);
    if (m) return 10 + ID_UNITS[m[1]];

    // puluhan (+ satuan)
    m = p.match(/^(se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)?\s*puluh(?:\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan))?$/);
    if (m) {
      const tens = m[1] ? (m[1] === "se" ? 1 : ID_UNITS[m[1]]) : 1;
      return tens * 10 + (m[2] ? ID_UNITS[m[2]] : 0);
    }

    // ratusan
    m = p.match(/^(se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)\s*ratus(?:\s+(.+))?$/);
    if (m) {
      const hundreds = m[1] === "se" ? 1 : ID_UNITS[m[1]];
      const rest = m[2] ? wordsToNumber(m[2]) : 0;
      if (rest == null) return hundreds * 100;
      return hundreds * 100 + rest;
    }
    return null;
  }

  window.normalizeNumberText = function normalizeNumberTextHeri(t) {
    let s = String(t || "").toLowerCase().replace(/rupiah|rp\.?/g, "");
    // Convert "tiga puluh ribu" → "30 ribu"
    s = s.replace(
      /((?:se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)(?:\s+\w+){0,4})\s*(juta|jt|ribu|rebu|rb|rn|k)\b/g,
      (all, words, unit) => {
        const n = wordsToNumber(words.trim());
        return n == null ? all : `${n} ${unit}`;
      }
    );
    s = s.replace(/(\d)\.(?=\d{3}\b)/g, "$1");
    return s;
  };

  window.parseAmount = function parseAmountHeri(text) {
    let t = normalizeNumberText(text);
    let m = t.match(/(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rebu|rb|rn|k)\b/);
    if (m) {
      let n = parseFloat(m[1].replace(",", "."));
      n *= /(juta|jt)/.test(m[2]) ? 1e6 : 1e3;
      return Math.round(n);
    }
    m = t.match(/\b(\d{4,})\b/);
    return m ? parseInt(m[1].replace(/\D/g, ""), 10) : 0;
  };

  // cleanupName must also strip spoken amounts like "tiga puluh ribu"
  const _cleanupName = typeof cleanupName === "function" ? cleanupName : null;
  window.cleanupName = function cleanupNameHeri(t) {
    let s = String(t || "");
    s = s.replace(
      /((?:se|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)(?:\s+\w+){0,4})\s*(juta|jt|ribu|rebu|rb|k)\b/gi,
      " "
    );
    if (_cleanupName) return _cleanupName(s);
    return s.trim();
  };

  function parseRupiahInput(raw) {
    const digits = String(raw || "").replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }
  function formatRupiahInput(n) {
    const v = Math.round(Number(n) || 0);
    return v ? "Rp" + v.toLocaleString("id-ID") : "";
  }

  function bindAmountInput() {
    const el = document.getElementById("amountInput");
    if (!el) return;
    el.type = "text";
    el.inputMode = "numeric";
    el.placeholder = "Rp0";
    el.addEventListener("input", () => {
      const n = parseRupiahInput(el.value);
      el.dataset.raw = String(n || "");
      const caretAtEnd = el.selectionStart === el.value.length;
      el.value = formatRupiahInput(n);
      if (caretAtEnd) {
        try {
          el.setSelectionRange(el.value.length, el.value.length);
        } catch (e) {}
      }
      const hint = document.getElementById("amountHint");
      if (hint) hint.textContent = n ? "Nilai: " + fmt(n) : "";
    });
  }

  function getAmountValue() {
    const el = document.getElementById("amountInput");
    if (!el) return 0;
    if (el.dataset.raw) return Number(el.dataset.raw) || 0;
    return parseRupiahInput(el.value);
  }

  function setAmountValue(n) {
    const el = document.getElementById("amountInput");
    if (!el) return;
    const v = Math.round(Number(n) || 0);
    el.dataset.raw = String(v || "");
    el.value = formatRupiahInput(v);
  }

  // ---- Smart category memory ----
  function normKey(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function nameTokens(name) {
    const k = normKey(name);
    if (!k) return [];
    const parts = k.split(" ").filter(Boolean);
    const out = new Set();
    if (parts[0]) out.add(parts[0]);
    if (parts.length >= 2) out.add(parts.slice(0, 2).join(" "));
    out.add(k);
    // typo helpers
    if (parts[0] === "rokok" || parts[0] === "roko") {
      out.add("rokok");
      out.add("roko");
    }
    return Array.from(out);
  }

  function loadMemory() {
    return readJson(MEMORY_KEY, {});
  }
  function saveMemory(mem) {
    writeJson(MEMORY_KEY, mem);
  }

  function seedMemoryFromHistory() {
    if (localStorage.getItem(SEED_FLAG) === "1") return;
    const freq = {};
    mergeAll().forEach((r) => {
      nameTokens(r.name).forEach((tok) => {
        if (tok.length < 3) return;
        freq[tok] = freq[tok] || {};
        freq[tok][r.category] = (freq[tok][r.category] || 0) + 1;
      });
    });
    const mem = loadMemory();
    Object.keys(freq).forEach((tok) => {
      if (mem[tok]) return;
      const ranked = Object.entries(freq[tok]).sort((a, b) => b[1] - a[1]);
      if (ranked[0] && ranked[0][1] >= 1) mem[tok] = ranked[0][0];
    });
    // Explicit bootstrap for known habit
    if (!mem.rokok) mem.rokok = "SUAMI";
    if (!mem.roko) mem.roko = "SUAMI";
    saveMemory(mem);
    localStorage.setItem(SEED_FLAG, "1");
  }

  function rememberCategory(name, category) {
    if (!name || !category) return;
    const mem = loadMemory();
    nameTokens(name).forEach((tok) => {
      if (tok.length >= 3) mem[tok] = category;
    });
    saveMemory(mem);
  }

  const _inferCategoryBase = typeof inferCategory === "function" ? inferCategory : null;

  window.inferCategory = function inferCategorySmart(t) {
    const raw = String(t || "");
    const mem = loadMemory();
    const tokens = nameTokens(cleanupName(raw) || raw);
    for (const tok of tokens) {
      if (mem[tok] && CATEGORIES.includes(mem[tok])) return mem[tok];
    }
    // keyword scan whole utterance against memory keys
    const low = normKey(raw);
    const memKeys = Object.keys(mem).sort((a, b) => b.length - a.length);
    for (const k of memKeys) {
      if (k.length >= 3 && low.includes(k) && CATEGORIES.includes(mem[k])) return mem[k];
    }
    if (_inferCategoryBase) return _inferCategoryBase(raw);
    return "LAIN LAIN";
  };

  // ---- Category chips UI ----
  function renderCategoryChips(selected) {
    const wrap = document.getElementById("categoryChips");
    const select = document.getElementById("categoryInput");
    if (!wrap || !select) return;
    const cur = selected || select.value || CATEGORIES[0];
    select.value = cur;
    wrap.innerHTML = CATEGORIES.map(
      (c) =>
        `<button type="button" class="cat-chip${c === cur ? " active" : ""}" data-cat="${c}">${c}</button>`
    ).join("");
    wrap.querySelectorAll(".cat-chip").forEach((btn) => {
      btn.onclick = () => {
        select.value = btn.dataset.cat;
        renderCategoryChips(btn.dataset.cat);
      };
    });
  }

  const _fillCategories = typeof fillCategories === "function" ? fillCategories : null;
  window.fillCategories = function fillCategoriesHeri() {
    if (_fillCategories) _fillCategories();
    renderCategoryChips(document.getElementById("categoryInput")?.value);
  };

  // ---- Voice confirm flow ----
  let pendingVoice = null;

  function showVoiceConfirm(payload) {
    pendingVoice = payload;
    const box = document.getElementById("voiceConfirm");
    if (!box) return;
    box.classList.add("show");
    box.innerHTML =
      `<b>Konfirmasi sebelum simpan</b><br>` +
      `Nama: <b>${escHtml(payload.name || "-")}</b><br>` +
      `Nominal: <b>${fmt(payload.amount || 0)}</b><br>` +
      `Kategori: <b>${escHtml(payload.category || "-")}</b><br>` +
      `Tanggal: <b>${escHtml(payload.date || "-")}</b>` +
      (payload.note ? `<br>Catatan: ${escHtml(payload.note)}` : "") +
      `<div class="vc-actions"><button id="vcSave" class="save-btn" style="margin:0">SIMPAN</button>` +
      `<button id="vcEdit" class="secondary">EDIT DULU</button></div>`;
    document.getElementById("vcSave").onclick = () => {
      box.classList.remove("show");
      pendingVoice = null;
      saveExpense(true);
    };
    document.getElementById("vcEdit").onclick = () => {
      box.classList.remove("show");
      pendingVoice = null;
      toast("Silakan edit lalu tekan Simpan");
    };
  }

  const _applyVoiceText = typeof applyVoiceText === "function" ? applyVoiceText : null;
  window.applyVoiceText = function applyVoiceTextHeri(t) {
    document.getElementById("voiceText").value = t;
    document.getElementById("voicePreview").textContent = `Terbaca: ${t}`;
    const amt = parseAmount(t);
    const name = cleanupName(t);
    const note = parseNote(t);
    const date = parseSpokenDate(t);
    const cat = inferCategory(t);
    if (amt) setAmountValue(amt);
    if (name) document.getElementById("nameInput").value = name.replace(/\b\w/g, (c) => c.toUpperCase());
    document.getElementById("categoryInput").value = cat;
    renderCategoryChips(cat);
    document.getElementById("noteInput").value = note;
    document.getElementById("dateInput").value = date;
    showVoiceConfirm({
      name: document.getElementById("nameInput").value,
      amount: getAmountValue(),
      category: cat,
      date,
      note,
    });
  };

  // ---- Save with learning ----
  window.saveExpense = function saveExpenseHeri(fromConfirm) {
    const name = document.getElementById("nameInput").value.trim();
    const amount = getAmountValue();
    const category = document.getElementById("categoryInput").value;
    const date = document.getElementById("dateInput").value || iso(today0());
    const note = document.getElementById("noteInput").value.trim();
    if (!name || !amount) {
      toast("Nama dan nominal wajib diisi");
      return;
    }
    // If voice preview pending and user hit save without confirm path, still ok
    const prevCat = inferCategory(name);
    window.newData.push({
      id: "heri-" + Date.now(),
      date,
      time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      name,
      category,
      amount,
      note,
      source: "heri",
    });
    rememberCategory(name, category);
    if (prevCat && prevCat !== category) {
      toast("Memory: " + name.split(" ")[0].toLowerCase() + " → " + category);
    }
    persist();
    ["nameInput", "noteInput", "voiceText"].forEach((id) => (document.getElementById(id).value = ""));
    setAmountValue(0);
    document.getElementById("dateInput").value = iso(today0());
    document.getElementById("voicePreview").textContent = "Tersimpan. Siap catat berikutnya.";
    const box = document.getElementById("voiceConfirm");
    if (box) box.classList.remove("show");
    refreshAll();
    renderRecentNew();
    toast("Pengeluaran tersimpan di HERI");
  };

  // ---- Reset: only HERI inputs ----
  function bindReset() {
    const btn = document.getElementById("resetNewBtn");
    if (!btn) return;
    btn.textContent = "Hapus Input HERI";
    btn.onclick = () => {
      if (!confirm("Hapus hanya input HERI? Data V3/Excel tidak berubah.")) return;
      window.newData = [];
      persist();
      refreshAll();
      renderRecentNew();
      toast("Input HERI dihapus — V3 aman");
    };
  }

  // ---- AI query engine (data-only) ----
  function monthBounds(d) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return { start, end, key: monthKey(start) };
  }

  function filterByMonth(rows, d) {
    const key = monthKey(d);
    return rows.filter((r) => r.date && r.date.startsWith(key));
  }

  function answerQuery(q) {
    const query = String(q || "").toLowerCase().trim();
    if (!query) return { text: "Tanyakan sesuatu tentang data HERI.", categories: [] };
    const rows = mergeAll();
    const now = today0();
    const thisMonth = filterByMonth(rows, now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = filterByMonth(rows, prev);
    const todayKey = iso(now);
    const todayRows = rows.filter((r) => r.date === todayKey);
    const yearRows = rows.filter((r) => r.date && r.date.startsWith(String(now.getFullYear())));

    // Category mention
    let catHit = null;
    for (const c of CATEGORIES) {
      if (query.includes(c.toLowerCase())) {
        catHit = c;
        break;
      }
    }

    // Item name (e.g. rokok)
    const itemMatch = query.match(/\b(rokok|roko|bensin|kopi|gofood|alfagift|wifi|susu|clay)\b/);

    if (/hari ini/.test(query)) {
      const total = sum(todayRows);
      return {
        text: `Hari ini pengeluaran ${fmt(total)} dari ${todayRows.length} transaksi.`,
        categories: [...new Set(todayRows.map((r) => r.category))],
      };
    }

    if (/bandingkan|banding|vs|versus/.test(query)) {
      const a = sum(thisMonth);
      const b = sum(lastMonth);
      const diff = a - b;
      const pct = b ? Math.round((diff / b) * 100) : 0;
      const arah = diff > 0 ? "lebih tinggi" : diff < 0 ? "lebih rendah" : "sama";
      return {
        text:
          `Bulan ini ${fmt(a)} (${thisMonth.length} transaksi). ` +
          `Bulan lalu ${fmt(b)} (${lastMonth.length} transaksi). ` +
          `Bulan ini ${arah} ${fmt(Math.abs(diff))} (${pct}%).`,
        categories: [],
      };
    }

    if (/paling besar|terbesar|tertinggi/.test(query) && /kategori/.test(query)) {
      const cats = groupCategory(thisMonth);
      if (!cats.length) return { text: "Data kategori bulan ini tidak tersedia.", categories: [] };
      return {
        text: `Kategori paling besar bulan ini: ${cats[0][0]} sebesar ${fmt(cats[0][1])}.`,
        categories: [cats[0][0]],
      };
    }

    if (catHit && (/bulan ini|bulan/.test(query) || /pengeluaran|berapa|total/.test(query))) {
      const scoped = (/tahun/.test(query) ? yearRows : thisMonth).filter((r) => r.category === catHit);
      const label = /tahun/.test(query) ? "tahun ini" : "bulan ini";
      if (!scoped.length) {
        return {
          text: `Data pengeluaran kategori ${catHit} ${label} tidak tersedia.`,
          categories: [catHit],
        };
      }
      return {
        text: `Pengeluaran kategori ${catHit} ${label} ${fmt(sum(scoped))} dari ${scoped.length} transaksi.`,
        categories: [catHit],
      };
    }

    if (itemMatch) {
      const key = itemMatch[1].replace("roko", "rokok");
      const scoped = thisMonth.filter((r) => normKey(r.name).includes(key) || (key === "rokok" && normKey(r.name).includes("roko")));
      if (!scoped.length) {
        return { text: `Data "${key}" bulan ini tidak tersedia.`, categories: [] };
      }
      return {
        text: `${key[0].toUpperCase() + key.slice(1)} bulan ini habis ${fmt(sum(scoped))} dari ${scoped.length} transaksi.`,
        categories: [...new Set(scoped.map((r) => r.category))],
      };
    }

    if (/cicilan/.test(query) && /tahun/.test(query)) {
      const scoped = yearRows.filter((r) => r.category === "CICILAN");
      if (!scoped.length) return { text: "Data cicilan tahun ini tidak tersedia.", categories: ["CICILAN"] };
      return {
        text: `Total cicilan tahun ini ${fmt(sum(scoped))} dari ${scoped.length} transaksi.`,
        categories: ["CICILAN"],
      };
    }

    if (/bulan ini/.test(query) && /berapa|total|pengeluaran/.test(query)) {
      return {
        text: `Pengeluaran bulan ini ${fmt(sum(thisMonth))} dari ${thisMonth.length} transaksi.`,
        categories: [...new Set(thisMonth.map((r) => r.category))],
      };
    }

    return {
      text:
        "Pertanyaan belum dikenali atau data tidak tersedia. " +
        "Coba: pengeluaran Suami bulan ini, rokok bulan ini, hari ini, kategori paling besar, bandingkan bulan ini dengan bulan lalu, total cicilan tahun ini.",
      categories: [],
    };
  }

  // ---- Voice privacy + TTS ----
  function defaultPrivacyMap() {
    const m = {};
    CATEGORIES.forEach((c) => {
      m[c] = "ALLOW"; // ALLOW | MUTE_NAME | MUTE_NAME_AMOUNT | MUTE_ALL
    });
    return m;
  }

  function loadPrivacy() {
    return Object.assign(defaultPrivacyMap(), readJson(PRIVACY_KEY, {}));
  }
  function savePrivacy(map) {
    writeJson(PRIVACY_KEY, map);
  }
  function loadPrivacyLevel() {
    return localStorage.getItem(PRIVACY_LEVEL_KEY) || "A";
  }
  function savePrivacyLevel(lv) {
    localStorage.setItem(PRIVACY_LEVEL_KEY, lv);
  }

  function sanitizeForTTS(text, categories) {
    const level = loadPrivacyLevel();
    const map = loadPrivacy();
    let out = String(text || "");
    const cats = categories || [];

    // Global level
    if (level === "B") {
      cats.forEach((c) => {
        out = out.replace(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "kategori privat");
      });
    } else if (level === "C") {
      return "Ada pengeluaran pada kategori privat. Detail tersedia di aplikasi.";
    } else if (level === "D" && cats.length) {
      return ""; // no voice output for involved categories
    }

    // Per-category overrides
    for (const c of cats) {
      const mode = map[c] || "ALLOW";
      const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      if (mode === "MUTE_ALL") {
        return "";
      }
      if (mode === "MUTE_NAME_AMOUNT") {
        out = out.replace(re, "kategori privat").replace(/Rp[\d.]+/g, "nominal privat");
      } else if (mode === "MUTE_NAME") {
        out = out.replace(re, "kategori privat");
      }
    }
    return out;
  }

  function getHeriNative() {
    try {
      return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HeriNative;
    } catch (e) {
      return null;
    }
  }

  function speakText(text) {
    if (!text) {
      toast("TTS diblokir oleh pengaturan privasi");
      return;
    }
    const native = getHeriNative();
    if (native && typeof native.speak === "function") {
      Promise.resolve(native.speak({ text })).catch(() => toast("TTS native gagal"));
      return;
    }
    // Legacy JS interface bridge
    if (window.HeriAndroid && typeof window.HeriAndroid.speak === "function") {
      window.HeriAndroid.speak(text);
      return;
    }
    if (!window.speechSynthesis) {
      toast("TTS tidak tersedia di perangkat ini");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "id-ID";
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }

  function initNativeSpeech() {
    const btn = document.getElementById("micBtn");
    const native = getHeriNative();
    if (!btn || !native || typeof native.startSpeech !== "function") return false;
    btn.onclick = async () => {
      try {
        btn.classList.add("listening");
        document.getElementById("voicePreview").textContent = "Mendengarkan (Android)...";
        if (native.ensureMicPermission) await native.ensureMicPermission();
        const res = await native.startSpeech();
        const transcript = (res && res.transcript) || "";
        btn.classList.remove("listening");
        if (transcript) applyVoiceText(transcript);
        else toast("Tidak ada suara terdeteksi");
      } catch (e) {
        btn.classList.remove("listening");
        toast("Mic gagal: " + (e.message || e));
      }
    };
    return true;
  }

  HERI.ask = function (q) {
    const ans = answerQuery(q);
    return ans;
  };
  HERI.speakAnswer = function (q) {
    const ans = answerQuery(q);
    const spoken = sanitizeForTTS(ans.text, ans.categories);
    speakText(spoken);
    return { answer: ans.text, spoken, categories: ans.categories };
  };

  // ---- Settings panels render ----
  function renderMemoryPanel() {
    const el = document.getElementById("memoryTableBody");
    if (!el) return;
    const mem = loadMemory();
    const keys = Object.keys(mem).sort();
    if (!keys.length) {
      el.innerHTML = `<tr><td colspan="3" class="empty">Belum ada memory</td></tr>`;
      return;
    }
    el.innerHTML = keys
      .map((k) => {
        const opts = CATEGORIES.map(
          (c) => `<option value="${c}"${mem[k] === c ? " selected" : ""}>${c}</option>`
        ).join("");
        return `<tr>
          <td><code>${escHtml(k)}</code></td>
          <td><select data-mem="${escHtml(k)}">${opts}</select></td>
          <td><button class="danger" data-del-mem="${escHtml(k)}">Hapus</button></td>
        </tr>`;
      })
      .join("");
    el.querySelectorAll("select[data-mem]").forEach((sel) => {
      sel.onchange = () => {
        const mem2 = loadMemory();
        mem2[sel.dataset.mem] = sel.value;
        saveMemory(mem2);
        toast("Mapping diubah");
      };
    });
    el.querySelectorAll("[data-del-mem]").forEach((btn) => {
      btn.onclick = () => {
        const mem2 = loadMemory();
        delete mem2[btn.dataset.delMem];
        saveMemory(mem2);
        renderMemoryPanel();
        toast("Mapping dihapus");
      };
    });
  }

  function renderPrivacyPanel() {
    const el = document.getElementById("privacyRows");
    if (!el) return;
    const map = loadPrivacy();
    el.innerHTML = CATEGORIES.map((c) => {
      const mode = map[c] || "ALLOW";
      return `<div class="privacy-row">
        <div><b>${c}</b></div>
        <select data-priv="${c}">
          <option value="ALLOW"${mode === "ALLOW" ? " selected" : ""}>BOLEH DIBACAKAN</option>
          <option value="MUTE_NAME"${mode === "MUTE_NAME" ? " selected" : ""}>JANGAN SEBUT NAMA KATEGORI</option>
          <option value="MUTE_NAME_AMOUNT"${mode === "MUTE_NAME_AMOUNT" ? " selected" : ""}>JANGAN SEBUT NAMA + NOMINAL</option>
          <option value="MUTE_ALL"${mode === "MUTE_ALL" ? " selected" : ""}>JANGAN KELUARKAN SUARA</option>
        </select>
      </div>`;
    }).join("");
    el.querySelectorAll("select[data-priv]").forEach((sel) => {
      sel.onchange = () => {
        const m = loadPrivacy();
        m[sel.dataset.priv] = sel.value;
        savePrivacy(m);
        toast("Privasi kategori disimpan");
      };
    });
    const level = loadPrivacyLevel();
    document.querySelectorAll('input[name="privacyLevel"]').forEach((r) => {
      r.checked = r.value === level;
      r.onchange = () => {
        if (r.checked) {
          savePrivacyLevel(r.value);
          toast("Level privasi disimpan");
        }
      };
    });
  }

  function setSettingsTab(name) {
    document.querySelectorAll(".settings-tabs .chip").forEach((c) => c.classList.toggle("active", c.dataset.panel === name));
    document.querySelectorAll(".panel-block").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
    if (name === "memory") renderMemoryPanel();
    if (name === "privacy") renderPrivacyPanel();
    if (name === "nfc") updateNfcStatus();
  }

  function updateNfcStatus() {
    const el = document.getElementById("nfcStatus");
    if (!el) return;
    const native = getHeriNative();
    if (native && typeof native.nfcAvailable === "function") {
      Promise.resolve(native.nfcAvailable())
        .then((r) => {
          const ok = !!(r && r.available);
          el.className = "nfc-status " + (ok ? "ok" : "no");
          el.textContent = ok ? "NFC tersedia di perangkat ini." : "NFC tidak tersedia / belum diizinkan.";
        })
        .catch(() => {
          el.className = "nfc-status no";
          el.textContent = "Gagal membaca status NFC.";
        });
      return;
    }
    if (window.HeriAndroid && typeof window.HeriAndroid.nfcAvailable === "function") {
      const ok = !!window.HeriAndroid.nfcAvailable();
      el.className = "nfc-status " + (ok ? "ok" : "no");
      el.textContent = ok ? "NFC tersedia di perangkat ini." : "NFC tidak tersedia / belum diizinkan.";
      return;
    }
    el.className = "nfc-status";
    el.textContent = "Status NFC: bridge Android belum aktif (browser web).";
  }

  function bindAi() {
    const askBtn = document.getElementById("aiAskBtn");
    const speakBtn = document.getElementById("aiSpeakBtn");
    const input = document.getElementById("aiQuery");
    const out = document.getElementById("aiAnswer");
    if (!askBtn || !input || !out) return;
    const run = (withSpeak) => {
      const ans = answerQuery(input.value);
      out.textContent = ans.text;
      if (withSpeak) {
        const spoken = sanitizeForTTS(ans.text, ans.categories);
        if (!spoken) out.textContent = ans.text + "\n\n(TTS diblokir privasi)";
        speakText(spoken);
      }
    };
    askBtn.onclick = () => run(false);
    speakBtn.onclick = () => run(true);
  }

  // Deep link / App Actions entry: heri://query?q=...
  function handleDeepLink() {
    try {
      const u = new URL(location.href);
      const q = u.searchParams.get("q") || u.searchParams.get("query");
      if (q) {
        goView("settings");
        setSettingsTab("ai");
        const input = document.getElementById("aiQuery");
        if (input) input.value = q;
        const ans = HERI.speakAnswer(q);
        const out = document.getElementById("aiAnswer");
        if (out) out.textContent = ans.answer;
      }
    } catch (e) {}
    // Android intent bridge
    window.HERI_handleAssistantQuery = function (q) {
      goView("settings");
      setSettingsTab("ai");
      const input = document.getElementById("aiQuery");
      if (input) input.value = q;
      const ans = HERI.speakAnswer(q);
      const out = document.getElementById("aiAnswer");
      if (out) out.textContent = ans.answer;
      return ans;
    };
  }

  // Patch refresh badge text
  const _refreshAll = typeof refreshAll === "function" ? refreshAll : null;
  window.refreshAll = function refreshAllHeri() {
    window.newData = readHeriNew();
    if (_refreshAll) _refreshAll();
    const badge = document.getElementById("dataBadge");
    if (badge) {
      const v3n = readV3New().length;
      const heriN = readHeriNew().length;
      badge.textContent = `EXCEL ${IMPORTED_DATA.length} + V3 ${v3n} + HERI ${heriN}`;
    }
    const info = document.getElementById("importedInfo");
    if (info) {
      info.innerHTML =
        `<b>${IMPORTED_DATA.length.toLocaleString("id-ID")}</b> transaksi Excel (embedded).<br>` +
        `Input V3 (localStorage, <b>read-only</b>): <b>${readV3New().length}</b>.<br>` +
        `Input HERI: <b>${readHeriNew().length}</b>.<br>` +
        `<b>V3 tidak ditulis/diubah oleh HERI.</b> Tidak ada duplikasi id.`;
    }
  };

  // Init after V3 boot
  function bootHeri() {
    seedMemoryFromHistory();
    bindAmountInput();
    fillCategories();
    bindReset();
    bindAi();
    document.querySelectorAll(".settings-tabs .chip").forEach((c) => {
      c.onclick = () => setSettingsTab(c.dataset.panel);
    });
    const resetMem = document.getElementById("resetMemoryBtn");
    if (resetMem) {
      resetMem.onclick = () => {
        if (!confirm("Reset seluruh smart category memory?")) return;
        saveMemory({});
        localStorage.removeItem(SEED_FLAG);
        seedMemoryFromHistory();
        renderMemoryPanel();
        toast("Memory di-reset lalu di-seed ulang dari histori");
      };
    }
    // Re-bind save
    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) saveBtn.onclick = () => saveExpense(false);
    // Prefer Android native speech when Capacitor plugin exists
    const usedNative = initNativeSpeech();
    if (!usedNative && typeof initSpeech === "function") {
      // keep V3 webkit speech for browser (already bound by V3 init)
    } else if (usedNative) {
      console.info("[HERI] Native Android speech bound");
    }
    // Cap App URL open → deep link routing
    try {
      const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (App && App.addListener) {
        App.addListener("appUrlOpen", (event) => {
          try {
            const u = new URL(event.url);
            const q = u.searchParams.get("q") || u.searchParams.get("query");
            if (q && window.HERI_handleAssistantQuery) window.HERI_handleAssistantQuery(q);
          } catch (e) {}
        });
      }
    } catch (e) {}
    setSettingsTab("data");
    handleDeepLink();
    refreshAll();
    renderRecentNew();
    updateNfcStatus();
    console.info("[HERI] Phase 2 ready. V3 key read-only:", V3_KEY);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(bootHeri, 0));
  } else {
    setTimeout(bootHeri, 0);
  }
})();
