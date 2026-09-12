"use strict";

/*
VAX ERP — Laporan Bulanan Investor Performance Chart
READ ONLY UI consumer.
Sumber angka sama dengan grafik Dashboard Utama: DashboardEngine.minutesGrossOf(row)
atas daily recap yang dibaca melalui DashboardEngine.fetchRecapRows().
Tidak mengubah DashboardEngine, AI Insight, atau source data.
*/
(() => {
  const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  let requestSeq=0;

  const el=id=>document.getElementById(id);
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const compact=n=>{
    const v=Number(n||0);
    if(v>=1e9) return `${(v/1e9).toFixed(v>=1e10?0:1).replace(".0","")} M`;
    if(v>=1e6) return `${(v/1e6).toFixed(v>=1e7?0:1).replace(".0","")} jt`;
    if(v>=1e3) return `${Math.round(v/1e3)} rb`;
    return String(Math.round(v));
  };

  async function ensureDashboardRuntime(){
    if(typeof DashboardEngine!=="undefined") return;
    if(typeof LaporanBulananAiInsightBridge!=="undefined" && typeof LaporanBulananAiInsightBridge.ensureRuntime==="function"){
      await LaporanBulananAiInsightBridge.ensureRuntime();
    }
    if(typeof DashboardEngine==="undefined") throw new Error("DashboardEngine belum tersedia.");
  }

  function activeContext(){
    const branchId=Number(el("lbBranch")?.value||0);
    const raw=String(el("lbMonth")?.value||"");
    const year=Number(raw.slice(0,4));
    return {branchId,year};
  }

  async function loadSeries(){
    const seq=++requestSeq;
    const host=el("lbPerformanceChart");
    if(!host) return;
    const {branchId,year}=activeContext();
    if(!branchId||!year){
      host.innerHTML='<div class="lb-perf-chart-state">Pilih cabang dan periode untuk melihat grafik tahunan.</div>';
      return;
    }

    host.innerHTML='<div class="lb-perf-chart-state is-loading"><i></i> Memuat grafik Jan–Des...</div>';
    try{
      await ensureDashboardRuntime();
      const rows=await DashboardEngine.fetchRecapRows(`${year}-01-01`,`${year}-12-31`,branchId);
      if(seq!==requestSeq) return;

      const values=Array(12).fill(0);
      (rows||[]).forEach(row=>{
        const iso=String(row?.tanggal||"").slice(0,10);
        const month=Number(iso.slice(5,7));
        if(month>=1&&month<=12){
          const gross=typeof DashboardEngine.minutesGrossOf==="function"
            ? DashboardEngine.minutesGrossOf(row)
            : Number(row?.gross_revenue ?? (Number(row?.service||0)+Number(row?.produk||0)));
          values[month-1]+=Number.isFinite(gross)?gross:0;
        }
      });
      renderChart(host,{year,values});
    }catch(err){
      console.warn("[Laporan Bulanan Performance Chart]",err);
      if(seq!==requestSeq) return;
      host.innerHTML=`<div class="lb-perf-chart-state is-error">Grafik belum dapat dimuat · ${String(err?.message||"unknown error")}</div>`;
    }
  }

  function showPointDetail(host,point,year){
    const detail=host.querySelector(".lb-perf-point-detail");
    if(!detail) return;
    host.querySelectorAll(".lb-perf-point").forEach(node=>node.classList.toggle("is-active",Number(node.dataset.index)===point.i));

    const leftPct=Math.max(10,Math.min(90,(point.x/1100)*100));
    const topPct=Math.max(12,Math.min(76,(point.y/330)*100));
    detail.style.left=`${leftPct}%`;
    detail.style.top=`${topPct}%`;
    detail.innerHTML=`<span>${MONTHS[point.i]} ${year}</span><strong>${money(point.v)}</strong><small>Omzet</small>`;
    detail.classList.remove("is-show");
    void detail.offsetWidth;
    detail.classList.add("is-show");
  }

  function bindPointInteraction(host,points,year){
    host.querySelectorAll(".lb-perf-hit[data-index]").forEach(hit=>{
      const activate=()=>{
        const idx=Number(hit.dataset.index);
        const point=points[idx];
        if(point) showPointDetail(host,point,year);
      };
      hit.addEventListener("click",activate);
      hit.addEventListener("keydown",event=>{
        if(event.key==="Enter"||event.key===" "){
          event.preventDefault();
          activate();
        }
      });
    });
  }

  function renderChart(host,{year,values}){
    const W=1100,H=330,L=84,R=24,T=28,B=58;
    const plotW=W-L-R,plotH=H-T-B;
    const maxRaw=Math.max(...values,0);
    const max=maxRaw>0?maxRaw:1;
    const points=values.map((v,i)=>{
      const x=L+(plotW*(i/11));
      const y=T+plotH-(Number(v||0)/max)*plotH;
      return {x,y,v:Number(v||0),i};
    });
    const line=points.map((p,i)=>`${i===0?"M":"L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area=`${line} L ${points[11].x.toFixed(1)} ${(T+plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(T+plotH).toFixed(1)} Z`;
    const ticks=[0,.25,.5,.75,1];
    const total=values.reduce((a,b)=>a+Number(b||0),0);
    const peak=Math.max(...values);
    const peakIdx=values.findIndex(v=>v===peak);

    host.innerHTML=`
      <div class="lb-perf-chart-meta">
        <div><strong>Trend Omzet ${year}</strong><span>Jan–Des · sumber grafik Dashboard Utama · read only</span></div>
        <div class="lb-perf-chart-chips"><span>Total Tahun <b>${money(total)}</b></span><span>Puncak <b>${peak>0?`${MONTHS[peakIdx]} · ${money(peak)}`:"—"}</b></span></div>
      </div>
      <div class="lb-perf-chart-svg-wrap">
        <svg class="lb-perf-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik omzet bulanan ${year}">
          <defs>
            <linearGradient id="lbPerfArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#22d3ee" stop-opacity=".24"/>
              <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
            </linearGradient>
            <filter id="lbPerfGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          ${ticks.map(t=>{const y=T+plotH-(t*plotH);return `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" class="lb-perf-grid"/><text x="${L-14}" y="${y+6}" text-anchor="end" class="lb-perf-axis-y">${compact(max*t)}</text>`}).join("")}
          <path d="${area}" fill="url(#lbPerfArea)"/>
          <path d="${line}" class="lb-perf-line" filter="url(#lbPerfGlow)"/>
          ${points.map(p=>`<g class="lb-perf-point" data-index="${p.i}"><circle cx="${p.x}" cy="${p.y}" r="6"/><circle cx="${p.x}" cy="${p.y}" r="18" class="lb-perf-hit" data-index="${p.i}" tabindex="0" role="button" aria-label="${MONTHS[p.i]} ${year}: ${money(p.v)}"><title>${MONTHS[p.i]} ${year}: ${money(p.v)}</title></circle><text x="${p.x}" y="${H-18}" text-anchor="middle" class="lb-perf-axis-x">${MONTHS[p.i]}</text></g>`).join("")}
        </svg>
        <div class="lb-perf-point-detail" aria-live="polite"></div>
      </div>
    `;
    bindPointInteraction(host,points,year);
  }

  function bind(){
    const branch=el("lbBranch"),month=el("lbMonth"),refresh=el("lbRefresh");
    branch?.addEventListener("change",()=>setTimeout(loadSeries,0));
    month?.addEventListener("change",()=>setTimeout(loadSeries,0));
    refresh?.addEventListener("click",()=>setTimeout(loadSeries,0));

    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(Number(el("lbBranch")?.value||0)>0){clearInterval(timer);loadSeries();}
      else if(tries>30) clearInterval(timer);
    },250);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();

  window.LaporanBulananPerformanceChart={load:loadSeries};
})();
