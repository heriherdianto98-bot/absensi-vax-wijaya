"use strict";

/*
VAX ERP — Laporan Bulanan Performance KPI Bridge
READ ONLY consumer bridge.
- SERVICE: membaca hasil canonical DailyDataEngine yang sudah ada di report.pendapatan.services.
- KPI ULTIMATE: membaca source KPI Ultimate yang sama dengan Tabel Harian.
- Tidak mengubah DailyDataEngine / KPI Ultimate engine / source / target.

LOCK KPI Ultimate package rule:
MAX / RELAX / REGULER (REGULAR) / PLUS / ENAKIN KEPALA.
Realisasi = SUM(price_with_discount) package Ultimate pada cabang + periode aktif.
Progress = Realisasi / Target Bulanan * 100.
*/
const LaporanBulananPerformanceKpiBridge = {
  number(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; },

  isUltimatePackage(value){
    const s=String(value||"").toLowerCase();
    return /\benakin\s+kepala\b/.test(s)
      || /\bmax\b/.test(s)
      || /\brelax\b/.test(s)
      || /\breguler\b|\bregular\b/.test(s)
      || /\bplus\b/.test(s);
  },

  async loadUltimate({client,report}){
    const start=String(report?.range?.start||"").slice(0,10);
    const end=String(report?.range?.end||"").slice(0,10);
    const cabangId=Number(report?.branch?.id||0);
    const year=Number(start.slice(0,4));
    const month=Number(start.slice(5,7));
    if(!client?.from||!cabangId||!year||!month) return null;

    const [targetRes,salesRes]=await Promise.all([
      client.from("kpi_ultimate_monthly_target")
        .select("target_amount")
        .eq("year",year)
        .eq("month",month)
        .eq("cabang_id",cabangId)
        .eq("active",true)
        .maybeSingle(),
      client.from("kpi_ultimate_sales_source")
        .select("service_package,price_with_discount")
        .eq("cabang_id",cabangId)
        .gte("activity_date",start)
        .lte("activity_date",end)
    ]);

    if(targetRes?.error) throw targetRes.error;
    if(salesRes?.error) throw salesRes.error;

    const target=this.number(targetRes?.data?.target_amount);
    const rows=(salesRes?.data||[]).filter(row=>this.isUltimatePackage(row?.service_package));
    const realisasi=rows.reduce((sum,row)=>sum+this.number(row?.price_with_discount),0);
    const progress=target>0?(realisasi/target)*100:0;

    return {
      target,
      realisasi,
      progress,
      trx:rows.length,
      source:"KPI Ultimate Tabel Harian (READ ONLY)"
    };
  },

  async apply(report,client){
    if(!report) return report;
    report.performance=report.performance||{};
    report.performance.services=this.number(report?.pendapatan?.services);

    try{
      const ultimate=await this.loadUltimate({client,report});
      if(ultimate){
        report.performance.ultimate=ultimate;
        report.performance.ultimateProgress=ultimate.progress;
      }
    }catch(err){
      console.warn("[Laporan Bulanan Performance KPI]",err);
      report.performance.ultimate={target:0,realisasi:0,progress:0,trx:0,error:true};
      report.performance.ultimateProgress=0;
    }
    return report;
  }
};

if(typeof window!=="undefined") window.LaporanBulananPerformanceKpiBridge=LaporanBulananPerformanceKpiBridge;
