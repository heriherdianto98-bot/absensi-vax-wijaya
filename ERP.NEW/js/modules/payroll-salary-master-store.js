/*
=========================================================
VAX ERP — Payroll Salary Master Store V1
=========================================================
Fixed salary master for non-Capster employees.
- MONTHLY = fixed monthly base salary
- DAILY   = fixed salary per attended day
Capster base salary never comes from this table; it stays
canonical from Minutes provider_share.
Owner + SVP may maintain salary master through Supabase RLS.
=========================================================
*/

const PayrollSalaryMasterStore = {
    TABLE: "payroll_salary_master",

    number(value){
        const n = Number(value || 0);
        return Number.isFinite(n) ? n : 0;
    },

    normalizeDate(value){
        const s = String(value || "").trim();
        if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
        return "";
    },

    addDays(date, days){
        const [y,m,d] = this.normalizeDate(date).split("-").map(Number);
        const dt = new Date(Date.UTC(y,m-1,d));
        dt.setUTCDate(dt.getUTCDate()+Number(days||0));
        return dt.toISOString().slice(0,10);
    },

    normalizeRow(row){
        return {
            id: row.id,
            employeeId: Number(row.employee_id),
            payBasis: String(row.pay_basis || "").toUpperCase(),
            amount: this.number(row.amount),
            effectiveFrom: this.normalizeDate(row.effective_from),
            effectiveTo: row.effective_to ? this.normalizeDate(row.effective_to) : null,
            active: row.active !== false,
            note: row.note || "",
            updatedAt: row.updated_at || null
        };
    },

    async loadAll(){
        const { data,error } = await db.from(this.TABLE)
            .select("id,employee_id,pay_basis,amount,effective_from,effective_to,active,note,created_at,updated_at")
            .eq("active",true)
            .order("employee_id",{ascending:true})
            .order("effective_from",{ascending:true});
        if(error) throw error;
        const rows=(Array.isArray(data)?data:[]).map(r=>this.normalizeRow(r));
        const byEmployee={};
        rows.forEach(row=>{
            const key=String(row.employeeId);
            (byEmployee[key]||(byEmployee[key]=[])).push(row);
        });
        return { rows, byEmployee };
    },

    async loadEmployee(employeeId){
        const eid=Number(employeeId);
        if(!Number.isInteger(eid)||eid<=0) return [];
        const { data,error } = await db.from(this.TABLE)
            .select("id,employee_id,pay_basis,amount,effective_from,effective_to,active,note,created_at,updated_at")
            .eq("employee_id",eid)
            .order("effective_from",{ascending:true});
        if(error) throw error;
        return (Array.isArray(data)?data:[]).map(r=>this.normalizeRow(r));
    },

    rateAt(rowsOrMap, employeeId, date){
        const day=this.normalizeDate(date);
        const rows=Array.isArray(rowsOrMap)
            ? rowsOrMap
            : ((rowsOrMap?.byEmployee||rowsOrMap||{})[String(employeeId)]||[]);
        return (rows||[]).filter(r=>r.active!==false && r.effectiveFrom<=day && (!r.effectiveTo || r.effectiveTo>=day))
            .sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
    },

    async save({ employeeId, payBasis, amount, effectiveFrom, note=null }={}){
        const eid=Number(employeeId);
        if(!Number.isInteger(eid)||eid<=0) throw new Error("Karyawan master gaji tidak valid");
        const basis=String(payBasis||"").toUpperCase();
        if(!["MONTHLY","DAILY"].includes(basis)) throw new Error("Basis gaji harus MONTHLY atau DAILY");
        const nominal=this.number(amount);
        if(nominal<0) throw new Error("Gaji pokok tidak boleh negatif");
        const start=this.normalizeDate(effectiveFrom);
        if(!start) throw new Error("Tanggal berlaku master gaji wajib diisi");

        const rows=await this.loadEmployee(eid);
        const exact=rows.find(r=>r.effectiveFrom===start);
        const future=rows.filter(r=>r.active!==false && r.effectiveFrom>start).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom))[0]||null;
        const newEnd=future?this.addDays(future.effectiveFrom,-1):null;
        const { data:authData }=await db.auth.getUser();
        const uid=authData?.user?.id||null;
        const now=new Date().toISOString();

        if(exact){
            const {data,error}=await db.from(this.TABLE).update({
                pay_basis:basis, amount:nominal, effective_to:newEnd, active:true,
                note:note?String(note).trim():null, updated_by:uid, updated_at:now
            }).eq("id",exact.id).select("id,employee_id,pay_basis,amount,effective_from,effective_to,active,note,updated_at").single();
            if(error) throw error;
            return this.normalizeRow(data);
        }

        const prior=rows.filter(r=>r.active!==false && r.effectiveFrom<start && (!r.effectiveTo || r.effectiveTo>=start))
            .sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]||null;
        if(prior){
            const {error}=await db.from(this.TABLE).update({effective_to:this.addDays(start,-1),updated_by:uid,updated_at:now}).eq("id",prior.id);
            if(error) throw error;
        }

        const {data,error}=await db.from(this.TABLE).insert({
            employee_id:eid,pay_basis:basis,amount:nominal,effective_from:start,effective_to:newEnd,
            active:true,note:note?String(note).trim():null,created_by:uid,updated_by:uid,created_at:now,updated_at:now
        }).select("id,employee_id,pay_basis,amount,effective_from,effective_to,active,note,updated_at").single();
        if(error) throw error;
        return this.normalizeRow(data);
    }
};

window.PayrollSalaryMasterStore=PayrollSalaryMasterStore;