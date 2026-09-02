/*
=========================================================
VAX ERP — Payroll Manual Adjustment Store V1
=========================================================
Manual components only:
- Bonus Insentif
- Bonus Target KPI

Canonical sources are NOT written here:
- Gaji Kotor = provider_sales_daily_source.provider_share
- Bonus Produk = product_sales_source.revenue_share
=========================================================
*/

const PayrollManualAdjustmentStore = {
    TABLE: "payroll_manual_adjustments",

    number(value){
        const n = Number(value || 0);
        return Number.isFinite(n) ? n : 0;
    },

    monthStart(value){
        const s = String(value || "").trim();
        const m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
        if(!m) throw new Error("Bulan payroll wajib format YYYY-MM atau YYYY-MM-DD");
        return `${m[1]}-${m[2]}-01`;
    },

    async loadMonth(periodMonth){
        const month = this.monthStart(periodMonth);
        const { data, error } = await db
            .from(this.TABLE)
            .select("id,employee_id,period_month,bonus_insentif,bonus_kpi,note,created_by,updated_by,created_at,updated_at")
            .eq("period_month", month)
            .order("employee_id", { ascending: true });
        if(error) throw error;

        const rows = Array.isArray(data) ? data : [];
        const byEmployee = {};
        rows.forEach(row => {
            byEmployee[String(row.employee_id)] = {
                id: row.id,
                employeeId: Number(row.employee_id),
                periodMonth: row.period_month,
                bonusInsentif: this.number(row.bonus_insentif),
                bonusKpi: this.number(row.bonus_kpi),
                note: row.note || "",
                updatedAt: row.updated_at || null
            };
        });

        return { periodMonth: month, rows, byEmployee };
    },

    async save({ employeeId, periodMonth, bonusInsentif = 0, bonusKpi = 0, note = null } = {}){
        const eid = Number(employeeId);
        if(!Number.isInteger(eid) || eid <= 0) throw new Error("employeeId payroll tidak valid");

        const month = this.monthStart(periodMonth);
        const insentif = this.number(bonusInsentif);
        const kpi = this.number(bonusKpi);
        if(insentif < 0 || kpi < 0) throw new Error("Bonus payroll tidak boleh negatif");

        const { data: authData } = await db.auth.getUser();
        const uid = authData?.user?.id || null;
        const payload = {
            employee_id: eid,
            period_month: month,
            bonus_insentif: insentif,
            bonus_kpi: kpi,
            note: note ? String(note).trim() : null,
            updated_by: uid,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await db
            .from(this.TABLE)
            .upsert(payload, { onConflict: "employee_id,period_month" })
            .select("id,employee_id,period_month,bonus_insentif,bonus_kpi,note,updated_at")
            .single();
        if(error) throw error;
        return data;
    },

    toEngineAdjustments(loadResult, base = {}){
        const result = { ...(base || {}) };
        const map = loadResult?.byEmployee || {};
        Object.entries(map).forEach(([employeeId, row]) => {
            const old = result[employeeId] || {};
            result[employeeId] = {
                ...old,
                bonusInsentif: this.number(row.bonusInsentif),
                bonusKpi: this.number(row.bonusKpi)
            };
        });
        return result;
    }
};

window.PayrollManualAdjustmentStore = PayrollManualAdjustmentStore;
