/*
=========================================================
VAX ERP — Auth (Login / Logout / Session Guard)
=========================================================
Sumber kebenaran:
- Supabase Auth session → auth.uid()
- public.profiles.id = auth.uid()
- public.profiles.role = 'owner' | 'spv' | 'svp' (legacy ERP memakai 'svp')
- public.profiles.aktif = true
- Karyawan produksi: karyawan.kode_login + karyawan.pin
  (password_awal tetap diterima sebagai credential existing)
  → session canonical BIGINT (bukan profiles.id UUID)
  → dashboard-karyawan.html

Dashboard ERP: Owner ATAU SPV (komponen sama; menu/action role-based)
Finance / Setoran: Owner ATAU SPV
Owner-only: Pengaturan, Backup, User/Role/Security

Logout WAJIB: db.auth.signOut() + hapus session storage.
Jangan hanya clear localStorage custom / pindah halaman.
Jangan pakai MINUTES_EMAIL / MINUTES_PASSWORD.
=========================================================
*/

const OwnerAuth = {

    LOGIN_PAGE: "login.html",
    DASHBOARD_PAGE: "erp-dashboard.html",
    FINANCE_PAGE: "setoran-3-harian.html",
    KARYAWAN_DASHBOARD: "../../dashboard-karyawan.html",

    OWNER_ONLY_PAGES: [
        "pengaturan.html",
        "backup.html",
        "settings.html",
        "users.html",
        "user.html",
        "roles.html",
        "security.html",
        "karyawan.html",
        "cabang.html"
    ],

    session: null,
    profile: null,
    ready: false,
    _uiBound: false,
    _loggingOut: false,

    PROFILE_COLUMNS: "id, nama, role, aktif, karyawan_id",

    /** Normalisasi role dari DB (trim, case, karakter aneh). */
    normalizeRole(role){
        return String(role ?? "")
            .normalize("NFKC")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    },

    isOwnerRole(role){
        return this.normalizeRole(role) === "owner";
    },

    /**
     * SPV di ERP existing tersimpan sebagai "spv" ATAU legacy "svp"
     * (lihat dashboard-OWNER.js: role === "svp").
     */
    isSpvRole(role){
        const r = this.normalizeRole(role);
        return r === "spv" || r === "svp";
    },

    isFinanceRole(role){
        return this.isOwnerRole(role) || this.isSpvRole(role);
    },

    isKaryawanRole(role){
        return this.normalizeRole(role) === "karyawan";
    },

    isNumericId(value){
        return /^[0-9]+$/.test(String(value || "").trim());
    },

    karyawanDashboardUrl(){
        return new URL(this.KARYAWAN_DASHBOARD, window.location.href).href;
    },

    isProfileActive(profil){
        return !(profil && profil.aktif === false);
    },

    loginUrl(){
        return new URL(this.LOGIN_PAGE, window.location.href).href;
    },

    /**
     * Basename halaman tanpa ekstensi .html.
     * Cocok untuk URL production clean (/erp-dashboard) dan /erp-dashboard.html.
     */
    pageSlug(pathname){
        const raw = String(pathname || "")
            .toLowerCase()
            .replace(/\/+$/, "");
        const name = raw.split("/").pop() || "";
        return name.replace(/\.html$/i, "");
    },

    /** Cocokkan pathname ke nama file halaman (dengan/tanpa .html). */
    matchesPage(pathname, pageFile){
        const slug = this.pageSlug(pathname);
        const want = String(pageFile || "")
            .toLowerCase()
            .replace(/\.html$/i, "");
        return Boolean(slug) && slug === want;
    },

    isLoginPath(pathname){
        return this.matchesPage(pathname, this.LOGIN_PAGE);
    },

    clearLocalAuth(){
        localStorage.removeItem("login");
        localStorage.removeItem("user_id");
        localStorage.removeItem("nama");
        localStorage.removeItem("role");
        localStorage.removeItem("jabatan");
        localStorage.removeItem("cabang_id");
        localStorage.removeItem("karyawan_id");
        localStorage.removeItem("aktif");
        localStorage.removeItem("session_kind");
        localStorage.removeItem("employee_session_at");
        localStorage.removeItem("employee_session_token");
    },

    /** Hapus sisa token Supabase Auth di storage browser. */
    clearSupabaseAuthStorage(){
        try{
            const keys = [];
            for(let i = 0; i < localStorage.length; i++){
                const k = localStorage.key(i);
                if(k && /^sb-.*-auth-token/i.test(k)) keys.push(k);
            }
            keys.forEach(k => localStorage.removeItem(k));
        }catch(_e){ /* ignore */ }

        try{
            const keys = [];
            for(let i = 0; i < sessionStorage.length; i++){
                const k = sessionStorage.key(i);
                if(k && /^sb-.*-auth-token/i.test(k)) keys.push(k);
            }
            keys.forEach(k => sessionStorage.removeItem(k));
        }catch(_e){ /* ignore */ }
    },

    persistLocalAuth(profil){
        localStorage.setItem("login", "true");
        localStorage.setItem("user_id", profil.id);
        localStorage.setItem("nama", profil.nama || "");
        localStorage.setItem("role", profil.role || "");
        localStorage.setItem("jabatan", profil.role || "");
        localStorage.setItem("session_kind", this.isKaryawanRole(profil.role) ? "karyawan" : "erp");
        if(profil.karyawan_id !== undefined && profil.karyawan_id !== null){
            localStorage.setItem("karyawan_id", String(profil.karyawan_id));
        }
    },

    /**
     * Session canonical Karyawan.
     * user_id WAJIB = karyawan.id BIGINT, bukan profiles.id UUID.
     */
    persistKaryawanSession(karyawan){
        const id = String(karyawan.id);
        localStorage.setItem("login", "true");
        localStorage.setItem("user_id", id);
        localStorage.setItem("karyawan_id", id);
        localStorage.setItem("nama", karyawan.nama_karyawan || "");
        localStorage.setItem("jabatan", karyawan.jabatan || "");
        localStorage.setItem(
            "cabang_id",
            karyawan.cabang_id !== undefined && karyawan.cabang_id !== null
                ? String(karyawan.cabang_id)
                : ""
        );
        localStorage.setItem("role", "karyawan");
        localStorage.setItem("aktif", karyawan.aktif === false ? "false" : "true");
        localStorage.setItem("session_kind", "karyawan");
    },

    async fetchKaryawanById(karyawanId){
        if(!this.isNumericId(karyawanId)) return null;
        const { data, error } = await db
            .from("karyawan")
            .select("id,nama_karyawan,jabatan,cabang_id,aktif,foto")
            .eq("id", Number(karyawanId))
            .maybeSingle();
        if(error || !data) return null;
        return data;
    },

    hasLocalKaryawanSession(){
        if(!this.isKaryawanRole(localStorage.getItem("role"))) return false;
        if(localStorage.getItem("login") !== "true") return false;
        const raw = localStorage.getItem("karyawan_id") || localStorage.getItem("user_id");
        return this.isNumericId(raw);
    },

    async validateLocalKaryawanSession(){
        if(!this.hasLocalKaryawanSession()){
            return { ok: false, reason: "NO_KARYAWAN_SESSION", karyawan: null };
        }

        const raw = localStorage.getItem("karyawan_id") || localStorage.getItem("user_id");
        const karyawan = await this.fetchKaryawanById(raw);
        if(!karyawan){
            return { ok: false, reason: "KARYAWAN_NOT_FOUND", karyawan: null };
        }
        if(karyawan.aktif === false){
            return { ok: false, reason: "INACTIVE", karyawan };
        }

        this.persistKaryawanSession(karyawan);
        this.profile = {
            id: null,
            nama: karyawan.nama_karyawan,
            role: "karyawan",
            aktif: true,
            karyawan_id: karyawan.id
        };
        this.ready = true;
        return { ok: true, reason: "OK", karyawan };
    },

    async redirectIfKaryawan(){
        try{
            const session = await this.getSession();
            if(session?.user?.id){
                const profil = await this.fetchProfile(session.user.id);
                if(
                    profil &&
                    this.isProfileActive(profil) &&
                    this.isKaryawanRole(profil.role)
                ){
                    const karyawan = await this.fetchKaryawanById(profil.karyawan_id);
                    if(karyawan && karyawan.aktif !== false){
                        this.persistKaryawanSession(karyawan);
                        window.location.replace(this.karyawanDashboardUrl());
                        return true;
                    }
                }
            }
        }catch(_e){ /* lanjut cek local session */ }

        const local = await this.validateLocalKaryawanSession();
        if(local.ok){
            window.location.replace(this.karyawanDashboardUrl());
            return true;
        }
        return false;
    },

    async getSession(){
        const { data, error } = await db.auth.getSession();
        if(error) throw error;
        return data.session || null;
    },

    async fetchProfile(userId){
        const { data, error } = await db
            .from("profiles")
            .select(this.PROFILE_COLUMNS)
            .eq("id", userId)
            .single();

        if(error) throw error;
        return data;
    },

    /** Alias kompatibel */
    async fetchOwnerProfile(userId){
        return this.fetchProfile(userId);
    },

    friendlyLoginError(err){
        const raw = String(err?.message || err || "");
        const lower = raw.toLowerCase();

        if(lower.includes("invalid login credentials") || lower.includes("invalid_credentials")){
            return "Email atau password salah.";
        }
        if(lower.includes("email not confirmed")){
            return "Email belum dikonfirmasi. Hubungi admin.";
        }
        if(lower.includes("too many requests") || lower.includes("rate limit")){
            return "Terlalu banyak percobaan. Coba lagi beberapa saat.";
        }
        if(lower.includes("network") || lower.includes("fetch")){
            return "Gagal terhubung ke server Auth. Periksa koneksi.";
        }
        if(lower.includes("aktif") || lower.includes("dinonaktifkan")){
            return raw;
        }
        if(lower.includes("akses ditolak") || lower.includes("owner / spv")){
            return raw;
        }
        if(lower.includes("kode login") || lower.includes("password salah")){
            return raw;
        }
        return raw || "Login gagal.";
    },

    async validateOwnerSession(){
        return this.validateSession({ allowSpv: false });
    },

    async validateFinanceSession(){
        return this.validateSession({ allowSpv: true });
    },

    async validateSession({ allowSpv }){
        let session;
        try{
            session = await this.getSession();
        }catch(err){
            return {
                ok: false,
                reason: "SESSION_ERROR",
                message: err?.message || "Gagal membaca session",
                session: null,
                profile: null
            };
        }

        if(!session?.user?.id || !session?.access_token){
            return { ok: false, reason: "NO_SESSION", session: null, profile: null };
        }

        let profil;
        try{
            profil = await this.fetchProfile(session.user.id);
        }catch(err){
            return {
                ok: false,
                reason: "PROFILE_ERROR",
                message: err?.message || "Gagal membaca profiles",
                session,
                profile: null
            };
        }

        if(!profil){
            return { ok: false, reason: "NO_PROFILE", session, profile: null };
        }

        if(!this.isProfileActive(profil)){
            return { ok: false, reason: "INACTIVE", session, profile: profil };
        }

        if(String(profil.id) !== String(session.user.id)){
            return { ok: false, reason: "UID_MISMATCH", session, profile: profil };
        }

        const roleOk = allowSpv
            ? this.isFinanceRole(profil.role)
            : this.isOwnerRole(profil.role);

        if(!roleOk){
            return {
                ok: false,
                reason: allowSpv ? "NOT_FINANCE_ROLE" : "NOT_OWNER",
                session,
                profile: profil
            };
        }

        return { ok: true, reason: "OK", session, profile: profil };
    },

    async requireSession({ allowSpv, eventName, ownerOnlyPage }){
        const result = allowSpv
            ? await this.validateFinanceSession()
            : await this.validateOwnerSession();

        if(!result.ok){
            // SPV membuka halaman Owner-only → dashboard (jangan signOut)
            if(
                ownerOnlyPage &&
                result.reason === "NOT_OWNER" &&
                result.profile &&
                this.isSpvRole(result.profile.role)
            ){
                this.session = result.session;
                this.profile = result.profile;
                this.persistLocalAuth(result.profile);
                window.location.replace(
                    new URL(this.DASHBOARD_PAGE, window.location.href).href
                );
                return false;
            }

            // Session invalid / role salah → pastikan Auth bersih
            try{
                if(result.session){
                    await db.auth.signOut({ scope: "local" });
                }
            }catch(_e){ /* ignore */ }

            this.clearLocalAuth();
            this.clearSupabaseAuthStorage();
            this.session = null;
            this.profile = null;
            this.ready = false;

            if(!this.isLoginPath(window.location.pathname)){
                window.location.replace(this.loginUrl());
            }
            return false;
        }

        this.session = result.session;
        this.profile = result.profile;
        this.ready = true;
        this.persistLocalAuth(result.profile);
        this.syncHeader();
        this.bindUi();
        this.applyAccessControl();

        document.dispatchEvent(new CustomEvent(eventName, {
            detail: {
                uid: this.session.user.id,
                role: this.profile.role,
                nama: this.profile.nama
            }
        }));
        return true;
    },

    /** Dashboard bersama Owner + SPV */
    async requireDashboard(){
        return this.requireSession({
            allowSpv: true,
            eventName: "erp:dashboard-ready"
        });
    },

    /** Alias lama — dashboard sekarang mengizinkan SPV */
    async requireOwner(){
        return this.requireDashboard();
    },

    async requireFinance(){
        return this.requireSession({ allowSpv: true, eventName: "erp:finance-ready" });
    },

    /** Halaman sensitif hanya Owner */
    async requireOwnerOnly(){
        return this.requireSession({
            allowSpv: false,
            eventName: "erp:owner-only-ready",
            ownerOnlyPage: true
        });
    },

    /**
     * Login Karyawan via credential existing yang sudah dipakai sebelumnya.
     * Sumber produksi lama (index.html / supabase.js): kode_login + pin.
     * password_awal tetap diterima sebagai credential existing lain.
     * Tidak membuat password baru. Tidak migrasi data.
     */
    secretMatchesExisting(karyawan, secret){
        const given = String(secret ?? "");
        const pin = String(karyawan?.pin ?? "");
        const passwordAwal = String(karyawan?.password_awal ?? "");
        return (
            (pin !== "" && pin === given) ||
            (passwordAwal !== "" && passwordAwal === given)
        );
    },

    async loginKaryawanByKode(kodeLogin, password){
        const kode = String(kodeLogin || "").trim().toUpperCase();
        const cleanPassword = String(password || "");

        if(!kode){
            throw new Error("Kode login wajib diisi.");
        }
        if(!cleanPassword){
            throw new Error("Password wajib diisi.");
        }

        // Karyawan tidak memakai Supabase Auth user biasa.
        // Credential diverifikasi SERVER-SIDE oleh RPC dan menghasilkan bearer
        // session acak; browser tidak lagi membaca kolom PIN/password_awal.
        try{
            await db.auth.signOut({ scope: "local" });
        }catch(_e){ /* ignore */ }
        this.clearSupabaseAuthStorage();

        const { data, error } = await db.rpc("karyawan_login_session", {
            p_kode: kode,
            p_secret: cleanPassword
        });

        if(error){
            const raw = String(error.message || "");
            if(/LOGIN_INVALID/i.test(raw)){
                throw new Error("Kode login atau password salah.");
            }
            if(/LOGIN_INACTIVE/i.test(raw)){
                throw new Error("Akun dinonaktifkan.");
            }
            throw new Error("Gagal membuat session Karyawan. " + raw);
        }

        const result = data && typeof data === "object" ? data : {};
        const token = String(result.token || "").trim();
        const karyawan = result.karyawan && typeof result.karyawan === "object"
            ? result.karyawan
            : null;

        if(!token || !karyawan?.id){
            throw new Error("Session Karyawan tidak terbentuk.");
        }

        localStorage.setItem("employee_session_token", token);
        this.persistKaryawanSession(karyawan);
        localStorage.setItem("employee_session_at", String(Date.now()));

        this.session = null;
        this.profile = {
            id: null,
            nama: karyawan.nama_karyawan,
            role: "karyawan",
            aktif: true,
            karyawan_id: karyawan.id
        };
        this.ready = true;

        return { session: null, profile: this.profile, karyawan };
    },

    async completeKaryawanAuthLogin(session, profil){
        const karyawan = await this.fetchKaryawanById(profil.karyawan_id);
        if(!karyawan){
            await db.auth.signOut({ scope: "local" });
            throw new Error("Profil tidak terhubung ke data karyawan.");
        }
        if(karyawan.aktif === false){
            await db.auth.signOut({ scope: "local" });
            throw new Error("Akun dinonaktifkan.");
        }

        this.session = session;
        this.profile = {
            ...profil,
            role: "karyawan",
            nama: karyawan.nama_karyawan || profil.nama,
            karyawan_id: karyawan.id
        };
        this.ready = true;
        this.persistKaryawanSession(karyawan);
        return { session: this.session, profile: this.profile, karyawan };
    },

    /**
     * Login Owner/SPV via Supabase Auth, atau Karyawan via kode_login.
     */
    async loginOwner(email, password){
        const cleanIdentifier = String(email || "").trim();
        const cleanPassword = String(password || "");

        if(!cleanIdentifier){
            throw new Error("Email atau kode login wajib diisi.");
        }
        if(!cleanPassword){
            throw new Error("Password wajib diisi.");
        }

        if(!cleanIdentifier.includes("@")){
            return this.loginKaryawanByKode(cleanIdentifier, cleanPassword);
        }

        const cleanEmail = cleanIdentifier.toLowerCase();

        // JANGAN signOut() sebelum signIn — race SIGNED_OUT bisa
        // menghapus session baru / membuat fetch profiles memakai JWT salah.
        const { data, error } = await db.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword
        });

        if(error){
            throw new Error(this.friendlyLoginError(error));
        }

        const uid = data.user?.id;
        const accessToken = data.session?.access_token;
        const refreshToken = data.session?.refresh_token;
        if(!uid || !accessToken || !refreshToken){
            await db.auth.signOut({ scope: "local" });
            throw new Error("Session Auth tidak terbentuk.");
        }

        // Pastikan client memakai JWT user ini sebelum query profiles
        const { error: setErr } = await db.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
        });
        if(setErr){
            await db.auth.signOut({ scope: "local" });
            throw new Error("Gagal memasang session Auth: " + (setErr.message || setErr));
        }

        let profil;
        try{
            // Query ketat ke auth.uid() / session user id
            profil = await this.fetchProfile(uid);
        }catch(err){
            await db.auth.signOut({ scope: "local" });
            throw new Error(
                "Login Auth berhasil, tetapi profil tidak terbaca. " +
                (err?.message || "Periksa RLS profiles untuk authenticated (SELECT id = auth.uid()).")
            );
        }

        if(!profil){
            await db.auth.signOut({ scope: "local" });
            throw new Error("Profil tidak ditemukan untuk auth.uid() ini.");
        }

        if(!this.isProfileActive(profil)){
            await db.auth.signOut({ scope: "local" });
            throw new Error("Akun dinonaktifkan.");
        }

        if(this.isKaryawanRole(profil.role)){
            const sessionReady = await this.getSession();
            return this.completeKaryawanAuthLogin(sessionReady || data.session, profil);
        }

        if(!this.isFinanceRole(profil.role)){
            await db.auth.signOut({ scope: "local" });
            const rawRole = String(profil.role ?? "(kosong)");
            throw new Error(
                `Akses ditolak. Role profil: "${rawRole}". ` +
                "Hanya Owner / SPV (spv|svp) yang dapat masuk ERP."
            );
        }

        if(String(profil.id) !== String(uid)){
            await db.auth.signOut({ scope: "local" });
            throw new Error("Profil tidak tertaut dengan auth.uid().");
        }

        // Pastikan session tersimpan & bisa dibaca ulang (Ctrl+R)
        const session = await this.getSession();
        if(!session?.access_token || !session?.user?.id){
            await db.auth.signOut({ scope: "local" });
            throw new Error("JWT session tidak tersedia setelah login.");
        }

        this.session = session;
        this.profile = profil;
        this.ready = true;
        this.persistLocalAuth(profil);

        return { session: this.session, profile: this.profile };
    },

    redirectAfterLogin(){
        if(this.isKaryawanRole(this.profile?.role)){
            window.location.replace(this.karyawanDashboardUrl());
            return;
        }
        // Owner & SPV masuk dashboard yang sama
        window.location.replace(new URL(this.DASHBOARD_PAGE, window.location.href).href);
    },

    /**
     * Logout produksi: Supabase signOut → pastikan session hilang → login.html
     */
    async logout(){
        if(this._loggingOut) return;
        this._loggingOut = true;

        try{
            const { error } = await db.auth.signOut({ scope: "local" });
            if(error){
                console.warn("signOut local error:", error);
                try{
                    await db.auth.signOut({ scope: "global" });
                }catch(_e2){ /* ignore */ }
            }

            // Verifikasi session benar-benar hilang
            let still = null;
            try{
                still = await this.getSession();
            }catch(_e){ /* ignore */ }

            if(still?.access_token){
                this.clearSupabaseAuthStorage();
                try{
                    await db.auth.signOut({ scope: "local" });
                }catch(_e3){ /* ignore */ }
            }
        }catch(err){
            console.error("Logout error:", err);
            this.clearSupabaseAuthStorage();
        }finally{
            this.clearLocalAuth();
            this.clearSupabaseAuthStorage();
            this.session = null;
            this.profile = null;
            this.ready = false;
            window.location.replace(this.loginUrl());
        }
    },

    syncHeader(){
        const namaEl = document.getElementById("ownerAuthName");
        const roleEl = document.getElementById("ownerAuthRole");
        if(namaEl){
            namaEl.textContent = this.profile?.nama || "User";
        }
        if(roleEl){
            const r = this.normalizeRole(this.profile?.role);
            roleEl.textContent = (r === "svp" ? "SPV" : (r || "owner")).toUpperCase();
        }
        const avatarEl = document.getElementById("ownerAuthAvatar");
        if(avatarEl){
            const avatar = String(this.session?.user?.user_metadata?.avatar_url || "").trim();
            if(avatar){
                avatarEl.src = avatar;
                avatarEl.hidden = false;
                avatarEl.onerror = () => {
                    avatarEl.hidden = true;
                    avatarEl.removeAttribute("src");
                };
            }else{
                avatarEl.hidden = true;
                avatarEl.removeAttribute("src");
            }
        }
        this.applyAccessControl();
    },

    /**
     * Hide/disable menu & aksi Owner-only pada dashboard/component yang sama.
     * VIEW luas untuk SPV; ACTION tetap role-based.
     */
    applyAccessControl(){
        const isOwner = this.isOwnerRole(this.profile?.role);
        const isSpv = this.isSpvRole(this.profile?.role);

        document.body.dataset.erpRole = isOwner ? "owner" : (isSpv ? "spv" : "guest");
        document.body.classList.toggle("erp-role-owner", isOwner);
        document.body.classList.toggle("erp-role-spv", isSpv);

        document.querySelectorAll("[data-owner-only]").forEach((el) => {
            if(isOwner){
                el.hidden = false;
                el.removeAttribute("aria-hidden");
                if(el.tagName === "BUTTON" || el.tagName === "A"){
                    el.removeAttribute("tabindex");
                }
            }else{
                el.hidden = true;
                el.setAttribute("aria-hidden", "true");
            }
        });

        // Aksi destruktif / approval final — disable untuk SPV
        document.querySelectorAll("[data-owner-action]").forEach((el) => {
            if(isOwner){
                el.disabled = false;
                el.classList.remove("erp-action-disabled");
                el.removeAttribute("aria-disabled");
            }else{
                el.disabled = true;
                el.classList.add("erp-action-disabled");
                el.setAttribute("aria-disabled", "true");
            }
        });
    },

    /**
     * Bind sekali via event delegation — header & sidebar dinamis ikut ter-cover.
     */
    bindUi(){
        if(this._uiBound) return;
        this._uiBound = true;

        document.addEventListener("click", (e) => {
            const btn = e.target.closest(
                "#btnOwnerLogout, #btnSidebarLogout, .logout-btn, [data-erp-logout]"
            );
            if(!btn) return;
            e.preventDefault();
            e.stopPropagation();
            this.logout();
        });
    },

    async hasAuthenticatedJwt(){
        const session = await this.getSession();
        return Boolean(session?.access_token && session?.user?.id);
    }
};

// Delegation logout aktif sejak script load (sebelum komponen async)
OwnerAuth.bindUi();

// Guard otomatis halaman ERP
document.addEventListener("DOMContentLoaded", async () => {
    const path = String(window.location.pathname || "").toLowerCase();
    const slug = OwnerAuth.pageSlug(path);
    const isLogin = slug === "login";
    const isDashboard = slug === "erp-dashboard";
    const isFinance = (
        slug === "finance" ||
        slug === "cash-out" ||
        slug === "arus-kas" ||
        slug === "setoran-3-harian" ||
        slug === "tabel-harian-cabang" ||
        slug === "absensi" ||
        slug === "absensi-laporan" ||
        slug === "pengumuman"
    );

    if(isLogin){
        // Jika sudah ada session valid, langsung ke halaman sesuai role
        const result = await OwnerAuth.validateFinanceSession();
        if(result.ok){
            OwnerAuth.session = result.session;
            OwnerAuth.profile = result.profile;
            OwnerAuth.ready = true;
            OwnerAuth.persistLocalAuth(result.profile);
            OwnerAuth.redirectAfterLogin();
            return;
        }

        const sentToKaryawan = await OwnerAuth.redirectIfKaryawan();
        if(sentToKaryawan) return;
        return;
    }

    const isOwnerOnlyPage = OwnerAuth.OWNER_ONLY_PAGES.some(
        (p) => OwnerAuth.matchesPage(path, p)
    );

    if(isDashboard || isOwnerOnlyPage || isFinance){
        const sentToKaryawan = await OwnerAuth.redirectIfKaryawan();
        if(sentToKaryawan) return;
    }

    if(isDashboard){
        document.body.classList.add("owner-auth-pending");
        const ok = await OwnerAuth.requireDashboard();
        if(!ok) return;
        document.body.classList.remove("owner-auth-pending");
        return;
    }

    if(isOwnerOnlyPage){
        document.body.classList.add("owner-auth-pending");
        const ok = await OwnerAuth.requireOwnerOnly();
        if(!ok) return;
        document.body.classList.remove("owner-auth-pending");
        return;
    }

    if(isFinance){
        document.body.classList.add("owner-auth-pending");
        const ok = await OwnerAuth.requireFinance();
        if(!ok) return;
        document.body.classList.remove("owner-auth-pending");
    }
});
