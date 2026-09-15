"use strict";

/*
 * Investor Revised yearly performance presenter.
 * Presentation layer for the dedicated investor dataset.
 * Consumes dataset.yearTrend from the dedicated Minutes investor collector.
 * Does not touch DashboardEngine or canonical ERP.
 */
(() => {
  const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const compact=n=>{const v=Number(n||0);if(v>=1e9)return`${(v/1e9).toFixed(v>=1e10?0:1).replace(".0","")} M`;if(v>=1e6)return`${(v/1e6).toFixed(v>=1e7?0:1).replace(".0","")} jt`;if(v>=1e3)return`${Math.round(v/1e3)} rb`;return String(Math.round(v));};

  function findCard(host,label){
    const wanted=String(label||"").trim().toUpperCase();
    return [...host.querySelectorAll(":scope > div")].find(card=>String(card.querySelector("span")?.textContent||"").trim().toUpperCase()===wanted)||null;
  }
  function setCard(host,label,value){const strong=findCard(host,label)?.querySelector("strong");if(strong)strong.textContent=value;}

  function statusOf(growth){
    if(growth==null||!Number.isFinite(Number(growth)))return "PERLU DICEK";
    if(Number(growth)>0)return "▲ PERFORMA NAIK";
    if(Number(growth)<0)return "▼ PERFORMA TURUN";
    return "STABIL";
  }
  function growthText(growth){
    if(growth==null||!Number.isFinite(Number(growth)))return "—";
    const v=Number(growth);return `${v>0?"▲ +":v<0?"▼ ":""}${v.toFixed(1).replace(".0","")}%`;
  }

  function renderChart(trend){
    const host=document.getElementById("lbPerformanceChart");
    if(!host)return;
    const values=Array.from({length:12},(_,i)=>Number(trend?.months?.[i]?.omzet||0));
    const year=Number(trend?.year||new Date().getFullYear());
    const W=1100,H=330,L=84,R=24,T=28,B=58,plotW=W-L-R,plotH=H-T-B;
    const maxRaw=Math.max(...values,0),max=maxRaw>0?maxRaw:1;
    const points=values.map((v,i)=>({i,v,x:L+(plotW*(i/11)),y:T+plotH-(v/max)*plotH}));
    const line=points.map((p,i)=>`${i===0?"M":"L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area=`${line} L ${points[11].x.toFixed(1)} ${(T+plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(T+plotH).toFixed(1)} Z`;
    const ticks=[0,.25,.5,.75,1];
    const total=values.reduce((a,b)=>a+b,0),peak=Math.max(...values,0),peakIdx=values.findIndex(v=>v===peak);
    host.innerHTML=`
      <div class="lb-perf-chart-meta">
        <div><strong>Trend Omzet ${year}</strong><span>Jan–Des · Sumber data laporan investor</span></div>
        <div class="lb-perf-chart-chips"><span>Total Tahun <b>${money(total)}</b></span><span>Puncak <b>${peak>0?`${MONTHS[peakIdx]} · ${money(peak)}`:"—"}</b></span></div>
      </div>
      <div class="lb-perf-chart-svg-wrap">
        <svg class="lb-perf-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik omzet laporan investor ${year}">
          <defs><linearGradient id="lbPerfAreaRevised" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22d3ee" stop-opacity=".24"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>
          ${ticks.map(t=>{const y=T+plotH-(t*plotH);return`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" class="lb-perf-grid"/><text x="${L-14}" y="${y+6}" text-anchor="end" class="lb-perf-axis-y">${compact(max*t)}</text>`}).join("")}
          <path d="${area}" fill="url(#lbPerfAreaRevised)"/><path d="${line}" class="lb-perf-line"/>
          ${points.map(p=>`<g class="lb-perf-point"><circle cx="${p.x}" cy="${p.y}" r="6"/><circle class="lb-perf-hit" data-index="${p.i}" cx="${p.x}" cy="${p.y}" r="16" aria-label="${MONTHS[p.i]} ${year}: ${money(p.v)}"><title>${MONTHS[p.i]} ${year}: ${money(p.v)}</title></circle><text x="${p.x}" y="${H-18}" text-anchor="middle" class="lb-perf-axis-x">${MONTHS[p.i]}</text></g>`).join("")}
        </svg>
      </div>`;
  }

  function renderExplain(report,trend){
    const host=document.getElementById("lbPerformanceExplain");
    if(!host)return;
    const active=Math.max(1,Math.min(12,Number(trend.activeMonth||1)));
    const rows=(trend.months||[]).slice(0,active);
    let up=0,down=0;
    for(let i=1;i<rows.length;i++){
      const a=Number(rows[i-1]?.omzet||0),b=Number(rows[i]?.omzet||0);
      if(b>a)up++;else if(b<a)down++;
    }
    const activeValues=rows.map(r=>Number(r.omzet||0));
    const peak=Math.max(...activeValues,0),peakIdx=activeValues.findIndex(v=>v===peak);
    const first=activeValues[0]||0,current=Number(trend.current||0);
    const delta=current-first;
    const pct=first>0?(delta/first)*100:null;
    host.innerHTML=`
      <div class="lb-perf-explain-card is-status">
        <div><strong>Status Cabang: ${statusOf(trend.growthPct).replace(/[▲▼]\s*/,"")}</strong></div>
        <p>Omzet Jan <b>${money(first)}</b> → ${MONTHS[active-1]} <b>${money(current)}</b>${pct==null?"":` · ${pct>=0?"naik":"turun"} ${pct>=0?"+":""}${pct.toFixed(0)}% (${money(Math.abs(delta))})`}.</p>
        <p>Periode analisis Jan–${MONTHS[active-1]} ${trend.year}: <b>${up} bulan naik</b>, <b>${down} bulan turun</b>. Puncak sampai periode aktif: <b>${peakIdx>=0?MONTHS[peakIdx]:"—"} ${money(peak)}</b>.</p>
        <p>Kesimpulan dibatasi sampai periode aktif dan mengikuti dataset laporan investor periode terpilih.</p>
      </div>`;
  }

  function apply(report,dataset){
    const trend=dataset?.yearTrend;
    const host=document.getElementById("lbPerformance");
    if(!trend||!host)return;
    const growth=trend.growthPct;
    setCard(host,"GROWTH",growthText(growth));
    setCard(host,"STATUS",statusOf(growth));
    const note=document.getElementById("lbPerformanceNote");
    if(note){
      note.textContent=trend.previous>0
        ?`${MONTHS[Math.max(0,Number(trend.activeMonth||1)-2)]} ${trend.year} ${money(trend.previous)} → ${MONTHS[Math.max(0,Number(trend.activeMonth||1)-1)]} ${trend.year} ${money(trend.current)} · Growth ${growthText(growth).replace(/[▲▼]\s*/,"")}`
        :"Belum ada omzet bulan sebelumnya untuk menghitung growth.";
    }
    renderChart(trend);
    renderExplain(report,trend);
    document.body.dataset.investorYearTrend="investor-revised";
  }

  document.addEventListener("laporan-investor:revised-report-applied",ev=>{
    try{apply(ev.detail?.report,ev.detail?.dataset);}catch(err){console.error("[Investor Revised Year Performance]",err);}
  });

  window.LaporanBulananInvestorRevisedPerformanceYear={apply};
})();
