"use strict";

/*
VAX ERP — Laporan Bulanan AI Insight Bridge
READ ONLY consumer bridge.

Tujuan:
- Membaca AI Insight yang sama dengan Dashboard Utama.
- Tidak mengubah formula / engine AI / DashboardEngine.
- dashboard.js dimuat dinamis SETELAH DOMContentLoaded agar bootstrap dashboard
  tidak ikut berjalan di halaman Laporan Bulanan.
- Hasil hanya dipakai sebagai ringkasan singkat untuk investor.
*/
const LaporanBulananAiInsightBridge = {
  _runtimePromise:null,

  plain(value){
    return String(value ?? "")
      .replace(/<br\s*\/?>/gi," ")
      .replace(/<[^>]+>/g," ")
      .replace(/&nbsp;/gi," ")
      .replace(/\s+/g," ")
      .trim();
  },

  loadScript(src,ready){
    if(typeof ready==="function" && ready()) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>String(s.src||"").includes(src.split("?")[0]));
      if(existing){
        if(typeof ready!=="function" || ready()) return resolve();
        existing.addEventListener("load",()=>resolve(),{once:true});
        existing.addEventListener("error",()=>reject(new Error(`Gagal memuat ${src}`)),{once:true});
        return;
      }
      const script=document.createElement("script");
      script.src=src;
      script.async=true;
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error(`Gagal memuat ${src}`));
      document.head.appendChild(script);
    });
  },

  async ensureRuntime(){
    if(this._runtimePromise) return this._runtimePromise;
    this._runtimePromise=(async()=>{
      // Pastikan event DOMContentLoaded halaman Bulanan sudah selesai sebelum
      // dashboard.js dimuat, sehingga listener bootstrap Dashboard tidak aktif.
      await Promise.resolve();
      if(document.readyState==="loading"){
        await new Promise(resolve=>document.addEventListener("DOMContentLoaded",resolve,{once:true}));
      }
      await this.loadScript("../js/modules/dashboard-engine.js?v=20260912-monthly-ai",()=>typeof DashboardEngine!=="undefined");
      await this.loadScript("../js/modules/dashboard.js?v=20260912-monthly-ai",()=>typeof buildExecutiveAiInsight==="function");
      if(typeof DashboardEngine==="undefined" || typeof buildExecutiveAiInsight!=="function"){
        throw new Error("Runtime AI Insight Dashboard tidak tersedia.");
      }
    })();
    try{
      await this._runtimePromise;
    }catch(err){
      this._runtimePromise=null;
      throw err;
    }
  },

  async load({year,month,cabangId}={}){
    await this.ensureRuntime();
    if(typeof LaporanBulananEngine==="undefined") throw new Error("Engine Bulanan tidak tersedia.");

    const range=LaporanBulananEngine.monthRange(year,month);
    await DashboardEngine.load(Number(cabangId),"customtanggal",{
      start:range.start,
      end:range.end,
      mode:"month"
    });

    if(DashboardEngine.error) throw new Error(DashboardEngine.error);

    let multi=null;
    if(typeof ensureAiMultiPeriodContext==="function"){
      try{ multi=await ensureAiMultiPeriodContext(); }
      catch(err){ console.warn("[Laporan Bulanan AI] multi-period fallback",err); }
    }

    const insight=buildExecutiveAiInsight(multi || undefined);
    const summary=DashboardEngine.summary||{};
    const trends=DashboardEngine.trends||{};
    const omzetTrend=trends.omzet||{};

    // Alias presentation-only supaya monthly engine dapat membaca object Dashboard
    // tanpa mengubah object/source AI yang existing.
    return {
      ...insight,
      title:this.plain(insight?.cardSummaryHtml || insight?.summaryHtml || "Ringkasan performa cabang"),
      status:String(insight?.statusLabel || insight?.status || "").trim(),
      __monthlyInvestor:{
        status:String(insight?.statusLabel || "—").trim() || "—",
        summary:this.plain(insight?.cardSummaryHtml || insight?.summaryHtml || ""),
        priority:this.plain(insight?.cardPrimaryAction || insight?.actions?.[0] || ""),
        omzet:Number(summary.omzet||0),
        growthPct:omzetTrend?.pct == null ? null : Number(omzetTrend.pct),
        customer:Number(summary.customer||0),
        avgTicket:Number(summary.avgTicket||0),
        transaction:Number(summary.transaction||0),
        service:Number(summary.service||0),
        periodStart:range.start,
        periodEnd:range.end,
        source:"Dashboard Utama · VAX AI Insight"
      }
    };
  }
};

if(typeof window!=="undefined") window.LaporanBulananAiInsightBridge=LaporanBulananAiInsightBridge;
