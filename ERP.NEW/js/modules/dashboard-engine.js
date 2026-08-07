/*
Dashboard Engine V2 - STARTER
Catatan:
Versi final lengkap (filter 7/30 hari, chart dinamis, ranking dinamis,
last sync, auto refresh, executive summary penuh) belum termuat dalam
dokumen ini.
*/

const DashboardEngine = {
    rawData: [],
    summary: {},

    async load(cabangId=null, periode="hariini"){
        let query=db.from("daily_recap_source").select("*");

        if(cabangId){
            query=query.eq("cabang_id", Number(cabangId));
        }

        const {data,error}=await query;
        if(error){
            console.error(error);
            return;
        }

        const {data:cabang}=await db
            .from("cabang")
            .select("id,nama_cabang");

        this.rawData=(data||[]).map(r=>({
            ...r,
            nama_cabang:cabang.find(c=>c.id==r.cabang_id)?.nama_cabang||"-"
        }));

        this.calculate();
    },

    calculate(){
        const sum=f=>this.rawData.reduce((t,r)=>t+Number(r[f]||0),0);

        this.summary={
            omzet:sum("service"),
            nett:sum("nett_revenue"),
            cash:sum("real_cash"),
            qris:sum("non_cash")
        };

        if(typeof renderRanking==="function") renderRanking();
        if(typeof renderChart==="function") renderChart("hari");
    }
};