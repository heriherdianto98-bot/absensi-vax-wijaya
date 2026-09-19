/* VAX WIJAYA — Jadwal Libur Nasional / Tutup Operasional */
const JadwalTutupOperasional = (() => {
    let booted = false;
    const $ = (id) => document.getElementById(id);

    function esc(v = "") {
        return String(v ?? "").replace(/[&<>'"]/g, (s) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
        }[s]));
    }

    function todayWib() {
        return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    }

    function fmt(v) {
        if (!v) return "—";
        return new Date(`${v}T00:00:00`).toLocaleDateString("id-ID", {
            day: "2-digit", month: "short", year: "numeric"
        });
    }

    function paintCabangPicker() {
        const sel = $("tutupOpsCabang");
        const wrap = $("tutupOpsCabangWrap");
        if (!sel || !wrap) return;
        let box = $("tutupOpsCabangPicker");
        if (!box) {
            box = document.createElement("div");
            box.id = "tutupOpsCabangPicker";
            box.className = "tutup-ops-cabang-picker";
            box.setAttribute("role", "listbox");
            box.setAttribute("aria-multiselectable", "true");
            wrap.appendChild(box);
            box.addEventListener("click", (e) => {
                const item = e.target.closest("[data-cabang-id]");
                if (!item) return;
                const opt = [...sel.options].find((o) => o.value === item.getAttribute("data-cabang-id"));
                if (!opt) return;
                opt.selected = !opt.selected;
                item.classList.toggle("is-selected", opt.selected);
                item.setAttribute("aria-selected", opt.selected ? "true" : "false");
            });
        }
        box.innerHTML = [...sel.options].map((o) =>
            `<button type="button" class="tutup-ops-cabang-item${o.selected ? " is-selected" : ""}" role="option" aria-selected="${o.selected ? "true" : "false"}" data-cabang-id="${o.value}">${esc(o.textContent)}</button>`
        ).join("");
        sel.classList.add("tutup-ops-cabang-native");
        sel.setAttribute("aria-hidden", "true");
    }

    function isFloatingCabang(nama) {
        return String(nama || "").toLowerCase().includes("floating");
    }

    async function loadCabang() {
        const sel = $("tutupOpsCabang");
        if (!sel) return;
        const { data } = await db.from("cabang").select("id,nama_cabang").order("nama_cabang");
        const ops = (data || []).filter((c) => c && c.nama_cabang && !isFloatingCabang(c.nama_cabang));
        sel.innerHTML = ops.map((c) =>
            `<option value="${c.id}">${esc(c.nama_cabang)}</option>`
        ).join("");
        paintCabangPicker();
    }

    function syncScope() {
        const scope = $("tutupOpsScope")?.value || "SEMUA";
        const wrap = $("tutupOpsCabangWrap");
        if (wrap) wrap.hidden = scope !== "CABANG";
    }

    async function loadRows() {
        const list = $("tutupOpsList");
        if (!list) return;
        const { data, error } = await db
            .from("jadwal_tutup_operasional")
            .select("id,jenis,judul,keterangan,tanggal_mulai,tanggal_selesai,scope,aktif,created_role,created_at")
            .eq("aktif", true)
            .order("tanggal_mulai", { ascending: false });
        if (error) {
            list.innerHTML = `<p class="tutup-ops-state">Kalender tutup belum tersedia.</p>`;
            return;
        }
        const rows = data || [];
        if (!rows.length) {
            list.innerHTML = `<p class="tutup-ops-state">Belum ada jadwal LN/LK.</p>`;
            return;
        }
        list.innerHTML = rows.map((r) => {
            const label = String(r.jenis).toUpperCase() === "LK" ? "LK" : "LN";
            return `<article class="tutup-ops-item"><div><b>${esc(r.judul)}</b><small>${label} · ${fmt(r.tanggal_mulai)} – ${fmt(r.tanggal_selesai)} · ${esc(r.scope)}</small></div><span>${esc(r.created_role || "")}</span></article>`;
        }).join("");
    }

    async function submit() {
        const msg = $("tutupOpsMessage");
        const jenis = $("tutupOpsJenis")?.value || "LN";
        const judul = String($("tutupOpsJudul")?.value || "").trim();
        const ket = String($("tutupOpsKet")?.value || "").trim();
        const mulai = $("tutupOpsMulai")?.value;
        const selesai = $("tutupOpsSelesai")?.value;
        const scope = $("tutupOpsScope")?.value || "SEMUA";
        const cabangIds = scope === "CABANG"
            ? Array.from($("tutupOpsCabang")?.selectedOptions || []).map((o) => Number(o.value))
            : null;
        if (judul.length < 3) {
            if (msg) { msg.textContent = "Judul minimal 3 karakter."; msg.className = "tutup-ops-msg is-error"; }
            return;
        }
        const { error } = await db.rpc("upsert_jadwal_tutup_operasional", {
            p_jenis: jenis,
            p_judul: judul,
            p_keterangan: ket,
            p_tanggal_mulai: mulai,
            p_tanggal_selesai: selesai,
            p_scope: scope,
            p_cabang_ids: cabangIds,
            p_id: null
        });
        if (error) {
            if (msg) { msg.textContent = error.message || "Gagal menyimpan."; msg.className = "tutup-ops-msg is-error"; }
            return;
        }
        if (msg) { msg.textContent = "Jadwal tutup tersimpan."; msg.className = "tutup-ops-msg is-success"; }
        await loadRows();
    }

    function monthlyOpen() {
        const host = $("absensiMonthlyHost");
        return Boolean(host && !host.hidden);
    }

    function placePanel() {
        const root = $("jadwalTutupEmbed");
        if (!root) return;
        if (monthlyOpen()) {
            const mount = $("jadwalTutupMount");
            if (mount) {
                if (root.parentElement !== mount) mount.appendChild(root);
                return;
            }
            const matrix = $("ablMatrixSec") || $("ablMatrixCard")?.closest(".abl-matrix-sec");
            if (matrix?.parentElement && root.previousElementSibling !== matrix) {
                matrix.insertAdjacentElement("afterend", root);
            }
            return;
        }
        const bridge = $("absensiDailyAuditBridge");
        if (bridge?.parentElement && root.previousElementSibling !== bridge) {
            bridge.insertAdjacentElement("afterend", root);
        }
    }

    function syncButtons(open) {
        document.querySelectorAll(".js-btn-kalender-ops").forEach((btn) => {
            btn.setAttribute("aria-expanded", open ? "true" : "false");
            btn.classList.toggle("is-active", open);
            btn.textContent = open ? "Tutup Kalender" : "Kalender Operasional";
        });
    }

    function toggle() {
        const panel = $("jadwalTutupEmbed");
        if (!panel) return;
        const willOpen = panel.hidden;
        placePanel();
        panel.hidden = !willOpen;
        syncButtons(willOpen);
        if (willOpen) {
            panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function watchLayout() {
        if (watchLayout._done) return;
        watchLayout._done = true;
        const obs = new MutationObserver(() => {
            ensureMonthlyButton();
            placePanel();
        });
        const daily = $("absensiDailyView");
        const host = $("absensiMonthlyHost");
        if (daily) obs.observe(daily, { attributes: true, attributeFilter: ["hidden", "class"] });
        if (host) obs.observe(host, { attributes: true, attributeFilter: ["hidden", "class"], childList: true, subtree: true });
    }

    function ensureMonthlyButton() {
        if (!$("jadwalTutupEmbed")) return;
        if ($("btnToggleKalenderOperasionalBulan")) return;
        const right = document.querySelector(".abl-toolbar-right");
        if (!right) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "btnToggleKalenderOperasionalBulan";
        btn.className = "abl-btn-ghost absensi-btn-calendar js-btn-kalender-ops";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", "jadwalTutupEmbed");
        btn.textContent = "Kalender Operasional";
        right.insertBefore(btn, right.firstChild);
        const panel = $("jadwalTutupEmbed");
        if (panel && !panel.hidden) syncButtons(true);
    }

    function bindToggle() {
        if (bindToggle._done) return;
        bindToggle._done = true;
        document.addEventListener("click", (e) => {
            if (!e.target.closest(".js-btn-kalender-ops")) return;
            e.preventDefault();
            toggle();
        });
        watchLayout();
        ensureMonthlyButton();
        placePanel();
        syncButtons(Boolean($("jadwalTutupEmbed") && !$("jadwalTutupEmbed").hidden));
    }

    function bind() {
        $("tutupOpsScope")?.addEventListener("change", syncScope);
        $("tutupOpsSave")?.addEventListener("click", submit);
        const today = todayWib();
        if ($("tutupOpsMulai") && !$("tutupOpsMulai").value) $("tutupOpsMulai").value = today;
        if ($("tutupOpsSelesai") && !$("tutupOpsSelesai").value) $("tutupOpsSelesai").value = today;
        syncScope();
    }

    async function boot() {
        const root = $("jadwalTutupEmbed");
        if (!root || booted) return;
        booted = true;
        bindToggle();
        const { data: { session } } = await db.auth.getSession();
        if (!session) return;
        const { data } = await db.from("profiles").select("role,aktif").eq("id", session.user.id).maybeSingle();
        const role = String(data?.role || "").toLowerCase();
        if (!data || data.aktif === false || !["owner", "spv", "svp"].includes(role)) return;
        bind();
        await loadCabang();
        await loadRows();
    }

    return { boot, reload: loadRows, toggle, place: placePanel };
})();
