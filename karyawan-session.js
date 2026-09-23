/* VAX WIJAYA — canonical employee session. Attendance, payroll and Minutes engines untouched. */
const KaryawanSession = {
    LOGIN_PAGE: "ERP.NEW/pages/login.html",
    ERP_DASHBOARD: "ERP.NEW/pages/erp-dashboard.html",
    TOKEN_KEY: "employee_session_token",
    _activeGuardStarted: false,
    isNumericId(value){ return /^[0-9]+$/.test(String(value || "").trim()); },
    isUuid(value){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim()); },
    normalizeRole(role){ return String(role ?? "").normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); },
    isKaryawanRole(role){ return this.normalizeRole(role) === "karyawan"; },
    isFinanceRole(role){ const r=this.normalizeRole(role);return r === "owner" || r === "spv" || r === "svp"; },
    loginUrl(){ return new URL(this.LOGIN_PAGE, window.location.href).href; },
    erpDashboardUrl(){ return new URL(this.ERP_DASHBOARD, window.location.href).href; },
    getToken(){ return String(localStorage.getItem(this.TOKEN_KEY) || "").trim(); },
    persist(karyawan){
        const id=String(karyawan.id);
        localStorage.setItem("login","true");
        localStorage.setItem("user_id",id);
        localStorage.setItem("karyawan_id",id);
        localStorage.setItem("nama",karyawan.nama_karyawan || "");
        localStorage.setItem("jabatan",karyawan.jabatan || "");
        localStorage.setItem("cabang_id",karyawan.cabang_id !== undefined && karyawan.cabang_id !== null ? String(karyawan.cabang_id) : "");
        localStorage.setItem("role","karyawan");
        localStorage.setItem("aktif",karyawan.aktif === false ? "false" : "true");
        localStorage.setItem("session_kind","karyawan");
    },
    clear(){ ["login","user_id","karyawan_id","nama","jabatan","cabang_id","role","aktif","session_kind","employee_session_at",this.TOKEN_KEY].forEach(key=>localStorage.removeItem(key)); },
    resolveKaryawanId(){
        const role=this.normalizeRole(localStorage.getItem("role"));
        if(!this.isKaryawanRole(role)||localStorage.getItem("login")!=="true")return null;
        const raw=localStorage.getItem("karyawan_id")||localStorage.getItem("user_id");
        return this.isNumericId(raw)?Number(raw):null;
    },
    async loadKaryawan(id){
        if(!this.isNumericId(id))return null;
        const {data,error}=await db.from("karyawan").select("id,nama_karyawan,jabatan,cabang_id,aktif,foto").eq("id",Number(id)).maybeSingle();
        return error?null:data;
    },
    async loadSecureSession(){
        const token=this.getToken();if(!token||typeof db==="undefined")return null;
        try{
            const {data,error}=await db.rpc("karyawan_session_me",{p_token:token});
            if(error||data?.ok!==true||!data?.karyawan?.id)return null;
            return data.karyawan;
        }catch(_){return null;}
    },
    async logout(){
        const token=this.getToken();
        if(token&&typeof db!=="undefined"){try{await db.rpc("karyawan_logout_session",{p_token:token});}catch(_){}}
        try{if(typeof db!=="undefined"&&db?.auth?.signOut)await db.auth.signOut({scope:"local"});}catch(_){}
        this.clear();window.location.replace(this.loginUrl());
    },
    startActiveGuard(){
        if(this._activeGuardStarted)return;
        this._activeGuardStarted=true;
        let checking=false;
        const check=async()=>{
            if(checking||document.hidden||localStorage.getItem("session_kind")!=="karyawan")return;
            const token=this.getToken();
            if(!token){this.clear();window.location.replace(this.loginUrl());return;}
            checking=true;
            try{
                const {data,error}=await db.rpc("karyawan_session_me",{p_token:token});
                // A transient network error must not be misinterpreted as deactivation.
                if(!error&&data?.ok===false&&["SESSION_INVALID","SESSION_INACTIVE"].includes(data.reason)){
                    this.clear();window.location.replace(this.loginUrl());
                }
            }catch(_){}finally{checking=false;}
        };
        window.setInterval(check,30000);
        document.addEventListener("visibilitychange",()=>{if(!document.hidden)check();});
    },
    async requirePage(){
        const role=this.normalizeRole(localStorage.getItem("role"));
        if(this.isFinanceRole(role)){window.location.replace(this.erpDashboardUrl());return null;}
        // Never trust legacy localStorage identifiers as proof of authentication.
        // Invalid/revoked sessions cannot open employee pages, even with remembered credentials.
        const secure=await this.loadSecureSession();
        if(!secure||secure.aktif!==true){this.clear();window.location.replace(this.loginUrl());return null;}
        this.persist(secure);
        this.startActiveGuard();
        return secure;
    }
};
window.KaryawanSession=KaryawanSession;
/* Inject the real employee bearer session into the existing izin RPC without modifying izin.js. */
(function installSecureIzinRpcBridge(){
    if(typeof db==="undefined"||typeof db.rpc!=="function"||db.__vaxSecureIzinBridge===true)return;
    const originalRpc=db.rpc.bind(db);
    db.rpc=function(fn,args,options){
        if(String(fn)==="submit_pengajuan_izin"){
            return originalRpc(fn,{...(args||{}),p_session_token:KaryawanSession.getToken()||null},options);
        }
        return originalRpc(fn,args,options);
    };
    db.__vaxSecureIzinBridge=true;
})();