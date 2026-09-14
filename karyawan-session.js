/* =========================================================
   VAX WIJAYA — SESSION CANONICAL KARYAWAN
   FINAL SECURE BRIDGE — 17 AGUSTUS 2026

   Canonical local keys tetap dipertahankan agar Dashboard/Absensi LOCK
   tidak berubah. Tambahan:
     employee_session_token = bearer session acak dari server

   Server-side session dipakai untuk operasi sensitif (Izin/Libur/Sakit).
   ========================================================= */

const KaryawanSession = {

    LOGIN_PAGE: "ERP.NEW/pages/login.html",
    ERP_DASHBOARD: "ERP.NEW/pages/erp-dashboard.html",
    TOKEN_KEY: "employee_session_token",

    isNumericId(value){
        return /^[0-9]+$/.test(String(value || "").trim());
    },

    isUuid(value){
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            .test(String(value || "").trim());
    },

    normalizeRole(role){
        return String(role ?? "")
            .normalize("NFKC")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    },

    isKaryawanRole(role){
        return this.normalizeRole(role) === "karyawan";
    },

    isFinanceRole(role){
        const r = this.normalizeRole(role);
        return r === "owner" || r === "spv" || r === "svp";
    },

    loginUrl(){
        return new URL(this.LOGIN_PAGE, window.location.href).href;
    },

    erpDashboardUrl(){
        return new URL(this.ERP_DASHBOARD, window.location.href).href;
    },

    getToken(){
        return String(localStorage.getItem(this.TOKEN_KEY) || "").trim();
    },

    persist(karyawan){
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

    clear(){
        [
            "login","user_id","karyawan_id","nama","jabatan","cabang_id",
            "role","aktif","session_kind","employee_session_at",
            this.TOKEN_KEY
        ].forEach((key) => localStorage.removeItem(key));
    },

    resolveKaryawanId(){
        const role = this.normalizeRole(localStorage.getItem("role"));
        if(!this.isKaryawanRole(role)) return null;
        if(localStorage.getItem("login") !== "true") return null;

        const raw = localStorage.getItem("karyawan_id") || localStorage.getItem("user_id");
        if(!this.isNumericId(raw)) return null;
        return Number(raw);
    },

    async loadKaryawan(id){
        if(!this.isNumericId(id)) return null;

        const { data, error } = await db
            .from("karyawan")
            .select("id,nama_karyawan,jabatan,cabang_id,aktif,foto")
            .eq("id", Number(id))
            .maybeSingle();

        if(error || !data) return null;
        return data;
    },

    async loadSecureSession(){
        const token = this.getToken();
        if(!token || typeof db === "undefined") return null;

        try{
            const { data, error } = await db.rpc("karyawan_session_me", {
                p_token: token
            });
            if(error || !data || data.ok !== true || !data.karyawan?.id){
                return null;
            }
            return data.karyawan;
        }catch(_e){
            return null;
        }
    },

    async logout(){
        const token = this.getToken();
        if(token && typeof db !== "undefined"){
            try{
                await db.rpc("karyawan_logout_session", { p_token: token });
            }catch(_e){ /* ignore */ }
        }

        try{
            if(typeof db !== "undefined" && db?.auth?.signOut){
                await db.auth.signOut({ scope: "local" });
            }
        }catch(_e){ /* ignore */ }

        this.clear();
        window.location.replace(this.loginUrl());
    },

    async requirePage(){
        const role = this.normalizeRole(localStorage.getItem("role"));

        if(this.isFinanceRole(role)){
            window.location.replace(this.erpDashboardUrl());
            return null;
        }

        // Prioritas source of truth session server bila token sudah tersedia.
        const secure = await this.loadSecureSession();
        if(secure){
            if(secure.aktif === false){
                await this.logout();
                return null;
            }
            this.persist(secure);
            return secure;
        }

        // Legacy fallback hanya menjaga halaman LOCK tetap tidak putus.
        // Operasi sensitif (submit Izin) tetap ditolak server bila token tidak ada.
        const id = this.resolveKaryawanId();
        if(!id){
            this.clear();
            window.location.replace(this.loginUrl());
            return null;
        }

        const karyawan = await this.loadKaryawan(id);
        if(!karyawan){
            this.clear();
            window.location.replace(this.loginUrl());
            return null;
        }

        if(karyawan.aktif === false){
            await this.logout();
            return null;
        }

        this.persist(karyawan);
        return karyawan;
    }
};

window.KaryawanSession = KaryawanSession;

/* ---------------------------------------------------------
   RPC bridge:
   izin.js existing TIDAK perlu dibongkar.
   Saat memanggil submit_pengajuan_izin, token server otomatis
   ditambahkan sebagai argumen ke overload RPC 8-arg.
   --------------------------------------------------------- */
(function installSecureIzinRpcBridge(){
    if(typeof db === "undefined" || typeof db.rpc !== "function") return;
    if(db.__vaxSecureIzinBridge === true) return;

    const originalRpc = db.rpc.bind(db);

    db.rpc = function(fn, args, options){
        if(String(fn) === "submit_pengajuan_izin"){
            const token = KaryawanSession.getToken();
            const nextArgs = {
                ...(args || {}),
                p_session_token: token || null
            };
            return originalRpc(fn, nextArgs, options);
        }
        return originalRpc(fn, args, options);
    };

    db.__vaxSecureIzinBridge = true;
})();
