/*======================================
 VAX WIJAYA â€” Pengumuman Karyawan
 Self-read token only. Tidak kirim employee_id.
======================================*/

(function(){
    const listView = document.getElementById("listView");
    const detailView = document.getElementById("detailView");
    const listEl = document.getElementById("listPengumuman");
    const listMeta = document.getElementById("listMeta");
    const listEmpty = document.getElementById("listEmpty");
    const btnBack = document.getElementById("btnBack");
    const btnRefresh = document.getElementById("btnRefresh");
    const pageTitle = document.getElementById("pageTitle");
    const composerForm = document.getElementById("composerForm");
    const replyInput = document.getElementById("replyInput");
    const btnKirim = document.getElementById("btnKirim");
    const diskusiClosed = document.getElementById("diskusiClosed");
    const detailMessage = document.getElementById("detailMessage");
    const lightbox = document.getElementById("photoLightbox");
    const lightboxImg = document.getElementById("lightboxImg");

    let karyawanAktif = null;
    let currentId = null;
    let currentDetail = null;
    let sending = false;
    let listCache = [];

    function token(){
        return (typeof KaryawanSession !== "undefined" && KaryawanSession.getToken)
            ? KaryawanSession.getToken()
            : "";
    }

    function escapeHtml(value){
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function unwrap(data){
        if(data == null) return null;
        if(typeof data === "string"){
            try{ data = JSON.parse(data); }catch(_e){ return null; }
        }
        if(typeof data === "number"){
            return { ok: true, pengumuman_id: data, unread: data, count: data };
        }
        if(Array.isArray(data)){
            if(data.length === 1 && data[0] && typeof data[0] === "object" && !Array.isArray(data[0])){
                const one = data[0];
                if(one.ok === false) return one;
                if(Array.isArray(one.items) || Array.isArray(one.rows) || Array.isArray(one.list)) return one;
                if(Array.isArray(one.data)) return one;
                if(one.ok === true && (one.pengumuman || one.photos || one.unread_count != null || one.unread != null)){
                    return one;
                }
            }
            return { ok: true, items: data };
        }
        return typeof data === "object" ? data : null;
    }

    function asList(payload){
        if(!payload) return [];
        if(Array.isArray(payload)) return payload;
        const list = payload.items || payload.data || payload.rows || payload.list
            || payload.pengumuman || payload.result;
        if(Array.isArray(list)) return list;
        if(list && typeof list === "object" && Array.isArray(list.items)) return list.items;
        return [];
    }

    function pick(obj, keys, fallback){
        if(!obj || typeof obj !== "object") return fallback;
        for(const key of keys){
            if(obj[key] != null && obj[key] !== "") return obj[key];
        }
        return fallback;
    }

    function numId(row){
        const raw = pick(row, ["pengumuman_id", "id", "pengumumanId"], null);
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }

    function normalizePrioritas(value){
        const key = String(value || "")
            .normalize("NFKC")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");
        if(key === "sangat_penting" || key === "sangatpenting" || key === "urgent" || key === "critical"){
            return "sangat_penting";
        }
        if(key === "penting" || key === "important" || key === "high"){
            return "penting";
        }
        return "normal";
    }

    function prioritasLabel(pri){
        if(pri === "sangat_penting") return "Sangat Penting";
        if(pri === "penting") return "Penting";
        return "Normal";
    }

    function isUnread(row){
        if(!row) return false;
        if(row.sudah_dibaca === true || row.dibaca === true || row.is_read === true || row.read === true) return false;
        if(row.unread === false || row.belum_dibaca === false) return false;
        if(row.sudah_dibaca === false || row.dibaca === false || row.is_read === false || row.read === false) return true;
        if(row.unread === true || row.belum_dibaca === true) return true;
        if(row.dibaca_at == null && ("dibaca_at" in row || "read_at" in row)) return true;
        if(row.read_at == null && ("read_at" in row)) return true;
        return false;
    }

    function diskusiOpen(row){
        if(!row) return true;
        const v = pick(row, ["diskusi_dibuka", "discussion_open", "is_open", "diskusi"], null);
        if(v === false || v === "false" || v === 0 || v === "0") return false;
        if(v === true || v === "true" || v === 1 || v === "1") return true;
        return true;
    }

    function hasPhoto(row){
        const n = Number(pick(row, ["photo_count", "jumlah_foto", "foto_count", "photos_count"], 0));
        if(Number.isFinite(n) && n > 0) return true;
        if(row?.has_foto === true || row?.has_photo === true || row?.ada_foto === true) return true;
        const photos = row?.photos || row?.foto || row?.lampiran;
        return Array.isArray(photos) && photos.length > 0;
    }

    function pesanCount(row){
        const n = Number(pick(row, ["jumlah_pesan", "reply_count", "pesan_count", "thread_count", "comments_count"], 0));
        return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    function formatWhen(value){
        if(!value) return "â€”";
        const d = new Date(value);
        if(Number.isNaN(d.getTime())){
            const m = String(value).match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
            if(m){
                const [y, mo, da] = m[1].split("-");
                return `${da}/${mo}/${y} ${m[2]}`;
            }
            return String(value);
        }
        return d.toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatJam(value){
        if(!value) return "";
        const d = new Date(value);
        if(!Number.isNaN(d.getTime())){
            return d.toLocaleTimeString("id-ID", {
                timeZone: "Asia/Jakarta",
                hour: "2-digit",
                minute: "2-digit"
            });
        }
        const m = String(value).match(/(\d{1,2}:\d{2})/);
        return m ? m[1] : "";
    }

    function previewIsi(text){
        return String(text || "").replace(/\s+/g, " ").trim();
    }

    function handleSession(reason){
        if(String(reason || "").toUpperCase() !== "SESSION_INVALID") return false;
        if(typeof KaryawanSession !== "undefined" && typeof KaryawanSession.logout === "function"){
            KaryawanSession.logout();
            return true;
        }
        return false;
    }

    function setDetailMsg(text, isError){
        if(!detailMessage) return;
        detailMessage.textContent = text || "";
        detailMessage.classList.toggle("is-error", isError === true);
    }

    function extractDetail(payload){
        if(!payload) return null;
        if(payload.pengumuman && typeof payload.pengumuman === "object" && !Array.isArray(payload.pengumuman)){
            const merged = { ...payload, ...payload.pengumuman };
            if(!merged.replies && payload.replies) merged.replies = payload.replies;
            if(!merged.photos && payload.photos) merged.photos = payload.photos;
            return merged;
        }
        if(payload.item && typeof payload.item === "object" && !Array.isArray(payload.item)){
            return { ...payload, ...payload.item };
        }
        if(payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)){
            return { ...payload, ...payload.data };
        }
        const rows = asList(payload);
        if(rows.length === 1) return rows[0];
        return payload;
    }

    function hashId(){
        const raw = String(location.hash || "").replace(/^#/, "").trim();
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function showList(){
        currentId = null;
        currentDetail = null;
        if(listView) listView.hidden = false;
        if(detailView) detailView.hidden = true;
        if(pageTitle) pageTitle.textContent = "PENGUMUMAN";
        if(btnBack) btnBack.setAttribute("href", "dashboard-karyawan.html");
        if(btnBack) btnBack.onclick = null;
    }

    function showDetailShell(){
        if(listView) listView.hidden = true;
        if(detailView) detailView.hidden = false;
        if(pageTitle) pageTitle.textContent = "DETAIL";
        if(btnBack){
            btnBack.setAttribute("href", "pengumuman.html");
            btnBack.onclick = function(e){
                e.preventDefault();
                if(location.hash) history.pushState(null, "", "pengumuman.html");
                showList();
            };
        }
    }

    async function rpc(name, args){
        const { data, error } = await db.rpc(name, args);
        if(error) throw error;
        const payload = unwrap(data);
        if(payload && payload.ok === false){
            const reason = String(payload.reason || payload.message || "RPC_DENIED");
            if(handleSession(reason)) return null;
            const err = new Error(payload.message || reason);
            err.reason = reason;
            throw err;
        }
        return payload;
    }

    async function loadList(){
        const t = token();
        if(!t){
            if(listMeta) listMeta.textContent = "Session tidak tersedia.";
            return;
        }
        if(listMeta) listMeta.textContent = "Memuat pengumuman...";
        try{
            const payload = await rpc("karyawan_pengumuman_list_self", {
                p_token: t,
                p_limit: 50
            });
            if(!payload) return;
            const rows = asList(payload).slice();
            rows.sort((a, b) => {
                const ta = new Date(pick(a, ["created_at", "tanggal", "waktu"], 0)).getTime();
                const tb = new Date(pick(b, ["created_at", "tanggal", "waktu"], 0)).getTime();
                return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
            });
            listCache = rows;
            renderList(rows);
        }catch(err){
            console.error("Pengumuman list gagal:", err);
            if(listMeta) listMeta.textContent = "Gagal memuat pengumuman.";
            if(listEmpty) listEmpty.hidden = false;
        }
    }

    function renderList(rows){
        if(!listEl) return;
        if(!rows.length){
            listEl.innerHTML = "";
            if(listEmpty) listEmpty.hidden = false;
            if(listMeta) listMeta.textContent = "0 pengumuman";
            return;
        }
        if(listEmpty) listEmpty.hidden = true;
        if(listMeta) listMeta.textContent = `${rows.length} pengumuman`;
        listEl.innerHTML = rows.map((row) => {
            const id = numId(row);
            const pri = normalizePrioritas(pick(row, ["prioritas", "priority"], "normal"));
            const unread = isUnread(row);
            const judul = escapeHtml(pick(row, ["judul", "title"], "Tanpa judul"));
            const isi = escapeHtml(previewIsi(pick(row, ["preview", "isi_preview", "excerpt", "isi"], "")));
            const pembuat = escapeHtml(pick(row, ["pembuat_nama", "nama_pembuat", "created_by_nama", "pembuat", "author_nama"], "Staff"));
            const when = escapeHtml(formatWhen(pick(row, ["created_at", "tanggal", "waktu", "published_at"], "")));
            const msgs = pesanCount(row);
            const foto = hasPhoto(row);
            const cls = ["pg-item", unread ? "is-unread" : "", `is-${pri}`].filter(Boolean).join(" ");
            return `<button type="button" class="${cls}" data-id="${id || ""}">
                <div class="pg-item-main">
                    <h3>${judul}</h3>
                    <p>${isi || "â€”"}</p>
                    <div class="pg-item-foot">
                        <span>${pembuat}</span>
                        <span>${when}</span>
                        <span class="meta-ico"><i class="fa-regular fa-comment"></i>${msgs}</span>
                        ${foto ? `<span class="meta-ico"><i class="fa-regular fa-image"></i></span>` : ""}
                    </div>
                </div>
                <div class="pg-item-side">
                    <span class="pri-badge pri-${pri}">${prioritasLabel(pri)}</span>
                    ${unread ? `<span class="unread-dot" aria-label="Belum dibaca"></span>` : ""}
                </div>
            </button>`;
        }).join("");
    }

    async function openDetail(id){
        const n = Number(id);
        if(!Number.isFinite(n) || n <= 0) return;
        currentId = n;
        showDetailShell();
        setDetailMsg("Memuat...");
        document.getElementById("detailJudul").textContent = "Memuat...";
        document.getElementById("detailIsi").textContent = "";
        document.getElementById("threadList").innerHTML = "";
        const t = token();
        if(!t) return;

        try{
            await rpc("karyawan_pengumuman_mark_read_self", {
                p_token: t,
                p_pengumuman_id: n
            });
        }catch(err){
            console.error("Mark read gagal:", err);
        }

        try{
            const payload = await rpc("karyawan_pengumuman_detail_self", {
                p_token: t,
                p_pengumuman_id: n
            });
            if(!payload) return;
            const detail = extractDetail(payload);
            currentDetail = detail;
            renderDetail(detail);
            await loadPhotos(n, detail);
            setDetailMsg("");
            const row = listCache.find((r) => numId(r) === n);
            if(row){
                row.sudah_dibaca = true;
                row.is_read = true;
                row.unread = false;
                row.belum_dibaca = false;
                renderList(listCache);
            }
        }catch(err){
            console.error("Detail pengumuman gagal:", err);
            setDetailMsg(err.message || "Gagal memuat detail.", true);
        }
    }

    function unwrapMessage(row){
        if(!row || typeof row !== "object") return row;
        const nested = [row.message, row.reply, row.item]
            .find((x) => x && typeof x === "object" && !Array.isArray(x));
        return nested ? { ...row, ...nested } : row;
    }

    function knownRole(value){
        const key = String(value ?? "")
            .normalize("NFKC")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
        if(key === "owner") return "owner";
        if(key === "spv" || key === "svp" || key === "supervisor") return "spv";
        if(key === "staff") return "staff";
        if(key === "karyawan" || key === "employee" || key === "capster" || key === "kasir") return "karyawan";
        return "";
    }

    function isRoleishKey(key){
        const k = String(key || "").toLowerCase();
        return k === "asal_pengirim" || k === "jenis_pengirim"
            || k === "pengirim_asal" || k === "pengirim_jenis"
            || k === "pengirim_role" || k === "sender_role"
            || /(^|_)(role|asal|jenis|tipe|kind|jabatan)(_|$)/.test(k);
    }

    function roleFromFields(obj){
        if(!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
        const preferred = [
            "asal_pengirim", "jenis_pengirim", "pengirim_asal", "pengirim_jenis",
            "pengirim_role", "sender_role", "actor_role", "role_pengirim",
            "tipe_pengirim", "sender_type", "sender_kind", "from_role",
            "user_role", "as_role", "asal", "jenis", "role"
        ];
        for(const key of preferred){
            const found = knownRole(obj[key]);
            if(found) return found;
        }
        for(const [key, value] of Object.entries(obj)){
            if(value == null || typeof value === "object") continue;
            if(!isRoleishKey(key)) continue;
            const found = knownRole(value);
            if(found) return found;
        }
        return "";
    }

    function senderRoleKey(row){
        row = unwrapMessage(row);
        const direct = roleFromFields(row);
        if(direct) return direct;

        const nestedPeople = [
            row?.pengirim, row?.sender, row?.actor, row?.profile,
            row?.user, row?.created_by, row?.author, row?.from
        ];
        for(const person of nestedPeople){
            const found = roleFromFields(person);
            if(found) return found;
        }

        if(row?.is_owner === true || row?.from_owner === true) return "owner";
        if(row?.is_spv === true || row?.from_spv === true) return "spv";
        return "";
    }

    function coerceThreadList(list){
        if(!list) return [];
        if(typeof list === "string"){
            try{ list = JSON.parse(list); }catch(_e){ return []; }
        }
        if(Array.isArray(list)) return list;
        if(typeof list === "object"){
            if(Array.isArray(list.messages)) return list.messages;
            if(Array.isArray(list.replies)) return list.replies;
            if(Array.isArray(list.items)) return list.items;
            if(Array.isArray(list.pesan)) return list.pesan;
        }
        return [];
    }

    function threadRows(detail){
        const candidates = [
            detail?.replies, detail?.messages, detail?.thread,
            detail?.diskusi, detail?.comments, detail?.komentar, detail?.chat,
            detail?.pesan, detail?.thread?.messages, detail?.thread?.replies,
            detail?.diskusi?.pesan, detail?.diskusi?.replies
        ];
        for(const list of candidates){
            const rows = coerceThreadList(list);
            if(rows.length) return rows.map(unwrapMessage);
        }
        return [];
    }

    function isStaffSender(row){
        const role = senderRoleKey(row);
        if(role === "owner" || role === "spv" || role === "staff") return true;
        if(row?.is_staff === true || row?.from_staff === true) return true;
        return false;
    }

    function bubbleClass(row){
        const role = senderRoleKey(row);
        if(role === "owner") return "bubble is-staff is-owner";
        if(role === "spv") return "bubble is-staff is-spv";
        if(isStaffSender(row)) return "bubble is-staff";
        return isMeSender(row) ? "bubble is-me" : "bubble is-karyawan";
    }

    function isMeSender(row){
        const kid = Number(karyawanAktif?.id);
        const sid = Number(pick(row, ["pengirim_id", "sender_id", "karyawan_id", "employee_id"], null));
        if(Number.isFinite(kid) && Number.isFinite(sid) && kid === sid && !isStaffSender(row)) return true;
        if(row?.is_me === true || row?.mine === true) return true;
        return false;
    }

    function renderDetail(detail){
        const pri = normalizePrioritas(pick(detail, ["prioritas", "priority"], "normal"));
        const judul = pick(detail, ["judul", "title"], "Tanpa judul");
        const isi = pick(detail, ["isi", "body", "konten", "content"], "");
        const pembuat = pick(detail, ["pembuat_nama", "nama_pembuat", "created_by_nama", "pembuat", "author_nama"], "Staff");
        const when = formatWhen(pick(detail, ["created_at", "tanggal", "waktu", "published_at"], ""));
        const open = diskusiOpen(detail);

        const badge = document.getElementById("detailPrioritas");
        if(badge){
            badge.className = `pri-badge pri-${pri}`;
            badge.textContent = prioritasLabel(pri);
        }
        const unreadEl = document.getElementById("detailUnread");
        if(unreadEl) unreadEl.hidden = true;
        document.getElementById("detailJudul").textContent = judul;
        document.getElementById("detailMeta").textContent = `${pembuat} Â· ${when}`;
        document.getElementById("detailIsi").textContent = isi || "â€”";

        const replies = threadRows(detail);
        const threadList = document.getElementById("threadList");
        const threadEmpty = document.getElementById("threadEmpty");
        if(threadEmpty) threadEmpty.hidden = replies.length > 0;
        if(threadList){
            threadList.innerHTML = replies.map((row) => {
                const staff = isStaffSender(row);
                const cls = bubbleClass(row);
                const senderRole = senderRoleKey(row) || "karyawan";
                const nestedPerson = [row.pengirim, row.sender, row.author].find((x) => x && typeof x === "object");
                const nama = escapeHtml(
                    pick(row, ["pengirim_nama", "sender_nama", "nama", "nama_karyawan", "created_by_nama"], "")
                    || pick(nestedPerson || {}, ["nama", "nama_karyawan", "name"], "")
                    || (staff ? "Staff" : "Karyawan")
                );
                const pesan = escapeHtml(pick(row, ["isi", "pesan", "message", "body", "text"], ""));
                const jam = escapeHtml(formatJam(pick(row, ["created_at", "waktu", "jam", "sent_at"], "")));
                return `<article class="${cls}" data-role="${senderRole}"><small class="nama">${nama}</small><p>${pesan}</p><time>${jam}</time></article>`;
            }).join("");
        }

        if(diskusiClosed) diskusiClosed.hidden = open;
        if(composerForm) composerForm.hidden = !open;
        if(replyInput){
            replyInput.disabled = !open;
            replyInput.placeholder = open ? "Tulis pesan..." : "Diskusi ditutup";
        }
        if(btnKirim) btnKirim.disabled = !open;

        const thread = document.getElementById("threadList");
        if(thread) thread.scrollTop = thread.scrollHeight;
    }

    function photoList(detail){
        const list = detail?.photos || detail?.foto || detail?.lampiran || detail?.attachments || [];
        return Array.isArray(list) ? list : [];
    }

    async function loadPhotos(id, detail){
        const host = document.getElementById("detailPhotos");
        if(!host) return;
        host.innerHTML = "";
        host.hidden = true;

        let photos = photoList(detail);
        const t = token();
        try{
            const url = `${SUPABASE_URL}/functions/v1/karyawan-pengumuman-photo-urls`;
            const resp = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`
                },
                body: JSON.stringify({ token: t, pengumuman_id: Number(id) })
            });
            if(resp.ok){
                const signed = await resp.json();
                const fromFn = Array.isArray(signed?.photos) ? signed.photos : asList(signed);
                if(Array.isArray(fromFn) && fromFn.length) photos = fromFn;
            }
        }catch(err){
            console.error("Photo URLs gagal:", err);
        }

        const usable = (photos || []).map((p) => ({
            url: p.signed_url || p.signedUrl || p.url || "",
            path: p.object_path || p.path || "",
            urutan: Number(p.urutan || 0)
        })).filter((p) => p.url && !/^https?:\/\/[^/]+\/storage\/v1\/object\/public\//i.test(p.url));

        usable.sort((a, b) => a.urutan - b.urutan);
        if(!usable.length) return;

        host.hidden = false;
        host.innerHTML = usable.map((p) => (
            `<img src="${escapeHtml(p.url)}" alt="Foto pengumuman" data-full="${escapeHtml(p.url)}">`
        )).join("");
    }

    async function sendReply(e){
        e.preventDefault();
        if(sending || !currentId) return;
        if(!diskusiOpen(currentDetail)){
            setDetailMsg("Diskusi telah ditutup.", true);
            return;
        }
        const isi = String(replyInput?.value || "").trim();
        if(isi.length < 1){
            setDetailMsg("Pesan tidak boleh kosong.", true);
            return;
        }
        const t = token();
        if(!t) return;
        sending = true;
        if(btnKirim) btnKirim.disabled = true;
        setDetailMsg("Mengirim...");
        try{
            await rpc("karyawan_pengumuman_reply_self", {
                p_token: t,
                p_pengumuman_id: currentId,
                p_isi: isi
            });
            if(replyInput) replyInput.value = "";
            const payload = await rpc("karyawan_pengumuman_detail_self", {
                p_token: t,
                p_pengumuman_id: currentId
            });
            const detail = extractDetail(payload);
            currentDetail = detail;
            renderDetail(detail);
            setDetailMsg("");
        }catch(err){
            console.error("Reply gagal:", err);
            setDetailMsg(err.message || "Gagal mengirim pesan.", true);
        }finally{
            sending = false;
            if(btnKirim && diskusiOpen(currentDetail)) btnKirim.disabled = false;
        }
    }

    function bind(){
        if(listEl){
            listEl.addEventListener("click", (e) => {
                const item = e.target.closest("[data-id]");
                if(!item) return;
                const id = item.getAttribute("data-id");
                if(!id) return;
                history.pushState(null, "", `pengumuman.html#${id}`);
                openDetail(id);
            });
        }
        if(composerForm) composerForm.addEventListener("submit", sendReply);
        if(btnRefresh){
            btnRefresh.addEventListener("click", async () => {
                if(currentId) await openDetail(currentId);
                else await loadList();
            });
        }
        const photos = document.getElementById("detailPhotos");
        if(photos){
            photos.addEventListener("click", (e) => {
                const img = e.target.closest("img");
                if(!img || !lightbox || !lightboxImg) return;
                lightboxImg.src = img.getAttribute("data-full") || img.src;
                lightbox.hidden = false;
            });
        }
        document.getElementById("lightboxClose")?.addEventListener("click", () => {
            if(lightbox) lightbox.hidden = true;
            if(lightboxImg) lightboxImg.src = "";
        });
        lightbox?.addEventListener("click", (e) => {
            if(e.target === lightbox){
                lightbox.hidden = true;
                if(lightboxImg) lightboxImg.src = "";
            }
        });
        window.addEventListener("hashchange", () => {
            const id = hashId();
            if(id) openDetail(id);
            else showList();
        });
    }

    async function init(){
        const karyawan = await KaryawanSession.requirePage();
        if(!karyawan) return;
        karyawanAktif = karyawan;
        bind();
        await loadList();
        const id = hashId();
        if(id) await openDetail(id);
        else showList();
    }

    init();
})();


