/*
=========================================================
VAX ERP — Kasbon List Read Fix V1
=========================================================
Scope sangat sempit:
- hanya pembacaan daftar/riwayat Kasbon pada Finance
- Owner membaca seluruh row yang diizinkan RLS
- SVP membaca seluruh row cabang operasional yang diizinkan RLS
- filter Cabang/Karyawan/Status diterapkan sesudah source periode terbaca

TIDAK mengubah:
- approval / pencairan / outstanding / pembayaran
- Arus Kas / Payroll / SetoranMoneyEngine
- schema / RLS Supabase
=========================================================
*/
(function(){
    function install(){
        if(typeof KasbonModule === "undefined" || typeof db === "undefined") return false;
        if(KasbonModule.__listReadFixV1) return true;

        KasbonModule.__listReadFixV1 = true;

        KasbonModule.loadList = async function(){
            const tbody = document.getElementById("kasbonTableBody");
            if(tbody){
                tbody.innerHTML = `<tr><td colspan="8" class="kasbon-empty">Memuat…</td></tr>`;
            }

            const cabangId = document.getElementById("kasbonFilterCabang")?.value || "";
            const karyawanId = document.getElementById("kasbonFilterKaryawan")?.value || "";
            const status = document.getElementById("kasbonFilterStatus")?.value || "";
            const start = document.getElementById("kasbonFilterStart")?.value || "";
            const end = document.getElementById("kasbonFilterEnd")?.value || "";

            // Baca source canonical berdasarkan periode dahulu. RLS tetap menjadi pagar akses.
            let q = db
                .from(this.TABLE)
                .select("*")
                .order("request_date", { ascending: false })
                .order("created_at", { ascending: false });

            if(start) q = q.gte("request_date", start);
            if(end) q = q.lte("request_date", end);

            const { data, error } = await q;
            if(error){
                const msg = error.message || String(error);
                console.error("Kasbon list read:", msg);
                this.toast("Gagal memuat kasbon: " + msg, "error");
                if(tbody){
                    tbody.innerHTML = `<tr><td colspan="8" class="kasbon-empty">Gagal memuat data.</td></tr>`;
                }
                return;
            }

            let rows = Array.isArray(data) ? data : [];

            // Filter UI sesudah source periode terbaca supaya riwayat tidak hilang lintas akun/cabang.
            if(cabangId){
                rows = rows.filter((r) => Number(r.branch_id) === Number(cabangId));
            }
            if(karyawanId){
                rows = rows.filter((r) => Number(r.employee_id) === Number(karyawanId));
            }
            if(status){
                rows = rows.filter((r) => String(r.status || "") === String(status));
            }

            this.rows = rows;
            await this.hydrateMonthIndexRows();
            this.renderSummary();
            this.renderOwnerQueue();
            this.renderTable();
        };

        // Bila komponen sudah ter-mount sebelum helper selesai dimuat, refresh sekali.
        if(document.getElementById("kasbonTableBody")){
            Promise.resolve().then(() => KasbonModule.loadList()).catch((err) => {
                console.error("Kasbon list refresh:", err);
            });
        }

        return true;
    }

    if(!install()){
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            if(install() || tries >= 40) clearInterval(timer);
        }, 100);
    }

    document.addEventListener("erp:finance-ready", () => {
        install();
    });
})();
