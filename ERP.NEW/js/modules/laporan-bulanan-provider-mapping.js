/*
=========================================================
VAX ERP — LAPORAN BULANAN PROVIDER MAPPING V1
=========================================================
Purpose:
- Manual mapping ONLY for provider rows that are still AMBIGUOUS
  in Payroll (example: "Backup" capster bantuan cabang lain).
- Does NOT modify provider_sales_daily_source / Payroll engine.
- Mapping is metadata owned by Laporan Bulanan consumer.
- Owner chooses employee home branch + employee name.
=========================================================
*/
"use strict";

const LaporanBulananProviderMapping = {
    TABLE: "laporan_bulanan_provider_mapping",

    normalizeMonth(value){
        const s = String(value || "").slice(0, 10);
        const m = s.match(/^(\d{4})-(\d{2})/);
        return m ? `${m[1]}-${m[2]}-01` : "";
    },

    number(value){
        const n = Number(value || 0);
        return Number.isFinite(n) ? n : 0;
    },

    resolveClient(client){
        const resolved = client
            || (typeof db !== "undefined" ? db : null)
            || (typeof window !== "undefined" ? window.db : null);
        if(!resolved || typeof resolved.from !== "function"){
            throw new Error("Mapping Bulanan: Supabase client tidak tersedia.");
        }
        return resolved;
    },

    async loadMonth({ client, month } = {}){
        const supabase = this.resolveClient(client);
        const periodMonth = this.normalizeMonth(month);
        if(!periodMonth) throw new Error("Mapping Bulanan: periode tidak valid.");
        const { data, error } = await supabase
            .from(this.TABLE)
            .select("*")
            .eq("period_month", periodMonth)
            .order("source_provider_row_id", { ascending: true });
        if(error) throw error;
        return Array.isArray(data) ? data : [];
    },

    async save({ client, month, providerRow, employee, branch } = {}){
        const supabase = this.resolveClient(client);
        const periodMonth = this.normalizeMonth(month || providerRow?.tanggal || providerRow?.activity_date);
        const sourceId = String(providerRow?.sourceId || providerRow?.id || providerRow?.source_provider_row_id || "").trim();
        const employeeId = Number(employee?.id || employee?.employeeId || 0);
        const employeeBranchId = Number(branch?.id || employee?.cabang_id || employee?.homeCabangId || 0);
        if(!periodMonth) throw new Error("Mapping Bulanan: periode tidak valid.");
        if(!sourceId) throw new Error("Mapping Bulanan: provider row tidak valid.");
        if(!employeeId || !employeeBranchId) throw new Error("Mapping Bulanan: cabang dan karyawan wajib dipilih.");

        let uid = null;
        try{
            const auth = await supabase.auth?.getUser?.();
            uid = auth?.data?.user?.id || null;
        }catch(_){ uid = null; }

        const payload = {
            source_provider_row_id: sourceId,
            period_month: periodMonth,
            source_cabang_id: Number(providerRow?.cabangId || providerRow?.cabang_id || 0) || null,
            source_provider_name: providerRow?.providerMinutes || providerRow?.provider_name_raw || providerRow?.provider_name_normalized || "Backup",
            source_provider_share: this.number(providerRow?.providerShare || providerRow?.provider_share),
            employee_id: employeeId,
            employee_cabang_id: employeeBranchId,
            employee_name_snapshot: employee?.nama_karyawan || employee?.namaKaryawan || employee?.name || null,
            branch_name_snapshot: branch?.nama_cabang || employee?.homeCabang || null,
            updated_by: uid,
            updated_at: new Date().toISOString()
        };

        const { data: existing, error: readError } = await supabase
            .from(this.TABLE)
            .select("id,created_by,created_at")
            .eq("source_provider_row_id", sourceId)
            .maybeSingle();
        if(readError) throw readError;

        let result;
        if(existing?.id){
            result = await supabase
                .from(this.TABLE)
                .update(payload)
                .eq("id", existing.id)
                .select("*")
                .single();
        }else{
            result = await supabase
                .from(this.TABLE)
                .insert({ ...payload, created_by: uid })
                .select("*")
                .single();
        }
        if(result.error) throw result.error;
        return result.data;
    },

    async remove({ client, sourceProviderRowId } = {}){
        const supabase = this.resolveClient(client);
        const sourceId = String(sourceProviderRowId || "").trim();
        if(!sourceId) throw new Error("Mapping Bulanan: provider row tidak valid.");
        const { error } = await supabase.from(this.TABLE).delete().eq("source_provider_row_id", sourceId);
        if(error) throw error;
        return true;
    },

    buildReview({ pendingRows = [], mappings = [], branches = [], employees = [] } = {}){
        const mapBySource = new Map((mappings || []).map((row) => [String(row.source_provider_row_id || ""), row]));
        const branchRows = (branches || []).filter((row) => !String(row?.nama_cabang || "").toLowerCase().includes("floating"));
        const employeesByBranch = new Map();
        for(const employee of (employees || [])){
            if(employee?.aktif === false) continue;
            if(String(employee?.jabatan || "").trim().toLowerCase() !== "capster") continue;
            const bid = Number(employee?.cabang_id || 0);
            if(!employeesByBranch.has(bid)) employeesByBranch.set(bid, []);
            employeesByBranch.get(bid).push(employee);
        }
        for(const list of employeesByBranch.values()){
            list.sort((a,b) => String(a.nama_karyawan || "").localeCompare(String(b.nama_karyawan || ""), "id"));
        }

        const rows = (pendingRows || []).map((row) => {
            const sourceId = String(row?.sourceId || row?.id || "").trim();
            const saved = mapBySource.get(sourceId) || null;
            return {
                sourceId,
                tanggal: row?.tanggal || row?.activity_date || "",
                sourceCabangId: Number(row?.cabangId || row?.cabang_id || 0) || null,
                sourceCabang: row?.cabang || row?.cabang_minutes_name || "—",
                provider: row?.providerMinutes || row?.provider_name_raw || row?.provider_name_normalized || "Backup",
                service: this.number(row?.service || row?.total_service),
                providerShare: this.number(row?.providerShare || row?.provider_share),
                mappingStatus: row?.mappingStatus || row?.mapping_status || "AMBIGUOUS",
                saved,
                resolved: Boolean(saved?.employee_id)
            };
        });

        return {
            rows,
            branches: branchRows,
            employeesByBranch,
            totals: {
                rows: rows.length,
                providerShare: rows.reduce((sum,row) => sum + row.providerShare, 0),
                resolvedRows: rows.filter((row) => row.resolved).length,
                resolvedShare: rows.filter((row) => row.resolved).reduce((sum,row) => sum + row.providerShare, 0),
                pendingRows: rows.filter((row) => !row.resolved).length,
                pendingShare: rows.filter((row) => !row.resolved).reduce((sum,row) => sum + row.providerShare, 0)
            }
        };
    }
};

if(typeof window !== "undefined") window.LaporanBulananProviderMapping = LaporanBulananProviderMapping;
