/* Dashboard Ultimate KPI card — presentation-only consumer of existing monthly KPI bridge.
   No sync, write, target mutation or change to locked DashboardEngine / KPI Ultimate. */
"use strict";
(() => {
  if (!document.body.classList.contains("page-erp-dashboard") || window.__vaxDashboardUltimateCardUI) return;
  window.__vaxDashboardUltimateCardUI = true;
  let seq = 0;
  const fmt = n => "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
  const bridge = () => window.LaporanBulananPerformanceKpiBridge;
  const client = () => typeof db !== "undefined" ? db : (typeof supabaseClient !== "undefined" ? supabaseClient : null);

  const style = document.createElement("style");
  style.id = "dashboardUltimateCardUiStyle";
  style.textContent = `
    html body.page-erp-dashboard #kpi-section .kpi-ops-row:has(#kpiUltimateCard){grid-template-columns:repeat(5,minmax(0,1fr))!important}
    html body.page-erp-dashboard #kpi-section .kpi-grid:has(#kpiUltimateCard){grid-template-columns:repeat(20,minmax(0,1fr))!important}
    html body.page-erp-dashboard #kpi-section .kpi-grid:has(#kpiUltimateCard)>.kpi-card{grid-column:span 4!important;min-width:0}
    html body.page-erp-dashboard #kpi-section .kpi-grid:has(#kpiUltimateCard)>.kpi-card:nth-child(n+6){grid-column:span 5!important}
    html body.page-erp-dashboard #kpi-section #kpiUltimateCard{min-width:0;border-color:rgba(234,179,79,.32)!important;--ultimate-accent:#e8bd65}
    html body.page-erp-dashboard #kpi-section #kpiUltimateCard .kpi-label{color:#aab2bd!important}
    html body.page-erp-dashboard #kpi-section #kpiUltimateCard .kpi-value{color:#f8d17b!important;font-size:16px!important;line-height:1.1!important}
    html body.page-erp-dashboard #kpi-section #kpiUltimateCard .target-progress{height:4px!important;overflow:hidden;border-radius:5px;background:#33404d!important;margin:3px 0!important}
    html body.page-erp-dashboard #kpi-section #kpiUltimateCard .target-fill{display:block;height:100%;width:0;background:linear-gradient(90deg,#c8953e,#f4d67d)!important;transition:width .35s ease}
    html body.page-erp-dashboard #kpi-section #kpiUltimateCard .kpi-bottom{min-width:0;overflow:hidden;display:block!important;margin-top:2px!important}
    html body.page-erp-dashboard #kpi-section #kpiUltimateCard .kpi-status{position:static!important;display:block!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px!important;line-height:1.3!important;color:#e4e7ee!important;padding:0!important;background:transparent!important;border:0!important}
    @media(max-width:1050px){html body.page-erp-dashboard #kpi-section .kpi-ops-row:has(#kpiUltimateCard){grid-template-columns:repeat(3,minmax(0,1fr))!important}html body.page-erp-dashboard #kpi-section .kpi-grid:has(#kpiUltimateCard){grid-template-columns:repeat(3,minmax(0,1fr))!important}html body.page-erp-dashboard #kpi-section .kpi-grid:has(#kpiUltimateCard)>.kpi-card,html body.page-erp-dashboard #kpi-section .kpi-grid:has(#kpiUltimateCard)>.kpi-card:nth-child(n+6){grid-column:auto!important}}
    @media(max-width:640px){html body.page-erp-dashboard #kpi-section .kpi-ops-row:has(#kpiUltimateCard),html body.page-erp-dashboard #kpi-section .kpi-grid:has(#kpiUltimateCard){grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  `;
  document.head.appendChild(style);

  function mount(){
    if (document.getElementById("kpiUltimateCard")) return true;
    const growth = document.getElementById("kpiGrowth")?.closest(".kpi-card");
    if (!growth?.parentElement) return false;
    const card = document.createElement("div");
    card.id = "kpiUltimateCard";
    card.className = "kpi-card gold";
    card.setAttribute("aria-label", "Target Ultimate, menunggu data");
    card.innerHTML = `<div class="kpi-top"><span class="kpi-label">TARGET ULTIMATE</span></div><div class="kpi-value" id="kpiUltimatePct">—</div><div class="target-progress" role="progressbar" aria-label="Progress target Ultimate" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="target-fill" id="kpiUltimateBar"></span></div><div class="kpi-bottom"><span class="kpi-status" id="kpiUltimateNumbers">Menunggu data…</span></div>`;
    growth.insertAdjacentElement("afterend", card);
    return true;
  }
  function paint(pct, numbers, progress, hint){
    if(!mount()) return;
    const card = document.getElementById("kpiUltimateCard");
    document.getElementById("kpiUltimatePct").textContent = pct;
    document.getElementById("kpiUltimateNumbers").textContent = numbers;
    const bar = document.getElementById("kpiUltimateBar");
    const holder = bar.parentElement;
    const bounded = Math.max(0, Math.min(100, Number(progress) || 0));
    bar.style.width = `${bounded}%`;
    holder.setAttribute("aria-valuenow", String(Math.round(bounded)));
    card.setAttribute("aria-label", `Target Ultimate: ${hint || numbers}`);
    card.title = hint || numbers;
  }
  function scope(){
    // DashboardEngine is a global lexical const, not necessarily a window property.
    const engine = typeof DashboardEngine !== "undefined" ? DashboardEngine : window.DashboardEngine;
    const start = String(engine?.lastRange?.start || "").slice(0,10);
    const end = String(engine?.lastRange?.end || "").slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
    if(start.slice(0,7) !== end.slice(0,7)) return {differentMonths:true};
    const resolved = engine.resolveCabangId?.(engine.lastCabangId);
    const id = Number(resolved);
    if(Number.isSafeInteger(id) && id > 0) return {start,end,ids:[id]};
    const branches = typeof engine.getOperationalCabangList === "function"
      ? engine.getOperationalCabangList()
      : (engine.cabangList || []).filter(c => c.aktif !== false && !/floating/i.test(c.nama_cabang || "") && c.nama_minutes);
    return {start,end,ids:[...new Set(branches.map(c=>Number(c.id)).filter(n=>Number.isSafeInteger(n)&&n>0))]};
  }
  async function readBranch(s,id){
    // Existing bridge reads at most 1000 sales rows in a request: fail closed if that cap would truncate.
    const c = client();
    const {count,error} = await c.from("kpi_ultimate_sales_source")
      .select("cabang_id",{count:"exact",head:true}).eq("cabang_id",id)
      .gte("activity_date",s.start).lte("activity_date",s.end);
    if(error) throw error;
    if(count == null || count >= 1000) throw new Error("Sumber Ultimate terlalu banyak untuk pembacaan ringkas; periksa laporan Ultimate.");
    const result = await bridge().loadUltimate({client:c,report:{range:{start:s.start,end:s.end},branch:{id}}});
    if(!result) throw new Error("Data Ultimate belum tersedia.");
    return result;
  }
  async function refresh(){
    const current = ++seq;
    if(!mount()) return;
    const s = scope();
    if(!s){paint("—","Menunggu periode…",0);return;}
    if(s.differentMonths){paint("—","Pilih periode dalam satu bulan",0);return;}
    if(!s.ids.length){paint("—","Cabang operasional tidak tersedia",0);return;}
    if(!client()?.from || !bridge()?.loadUltimate){paint("—","Koneksi KPI Ultimate belum siap",0);return;}
    paint("…","Memuat target & transaksi…",0);
    try{
      const reports = await Promise.all(s.ids.map(id=>readBranch(s,id)));
      if(current!==seq) return;
      const missing = reports.filter(r=>!(Number(r.target)>0)).length;
      if(missing){paint("—",`Target ${missing} cabang belum diatur`,0,"Target Ultimate belum lengkap untuk periode dan cabang ini.");return;}
      const totalTarget = reports.reduce((n,r)=>n+Number(r.target),0);
      const totalSales = reports.reduce((n,r)=>n+Number(r.realisasi),0);
      const pct = totalTarget>0 ? totalSales/totalTarget*100 : 0;
      const percent = new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(pct)+"%";
      paint(percent,`${fmt(totalSales)} / ${fmt(totalTarget)}`,pct,`Realisasi Ultimate ${fmt(totalSales)} dari target ${fmt(totalTarget)} · ${s.start} s.d. ${s.end}`);
    }catch(err){
      if(current!==seq) return;
      console.warn("[Dashboard Ultimate Card UI]",err);
      paint("—","Data Ultimate belum tersedia",0,err?.message || "Gagal membaca data Ultimate");
    }
  }
  document.addEventListener("erp:components-ready",refresh);
  if(typeof DashboardEngine!=="undefined" && typeof DashboardEngine.subscribe==="function"){
    DashboardEngine.subscribe(event=>{if(event==="calculated") refresh();});
  }
  if(document.getElementById("kpiGrowth")) refresh();
})();