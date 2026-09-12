"use strict";

/*
VAX ERP — Laporan Bulanan Performance Explanation
UI / READ ONLY consumer only.
- Tidak mengubah DashboardEngine, AI Insight, DailyDataEngine, source data, atau formula.
- Memperjelas angka customer periode aktif memakai summary + previousSummary Dashboard existing.
- Membuat kesimpulan tahunan dari seri omzet Jan–Des yang sama dengan grafik Dashboard.
*/
(() => {
  const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const el=id=>document.getElementById(id);
  const idn=n=>Number(n||0).toLocaleString("id-ID");
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  let seq=0;

  function context(){
    const branchId=Number(el("lbBranch")?.value||0);
    const monthValue=String(el("lbMonth")?.value||"");
    return {branchId,year:Number(monthValue.slice(0,4)),month:Number(monthValue.slice(5,7))};
  }

  function tone(delta){ return delta>0?"is-up":delta<0?"is-down":"is-flat"; }
  function arrow(delta){ return delta>0?"▲":delta<0?"▼":"●"; }
  function signedPct(value){
    if(value==null || !Number.isFinite(Number(value))) return "—";
    const n=Number(value);
    return `${n>0?"+":""}${n}%`;
  }

  function renderCustomerDetail(){
    const host=el("lbPerformanceNote");
    if(!host || typeof DashboardEngine==="undefined") return;
    const cur=Number(DashboardEngine.summary?.customer||0);
    const prev=Number(DashboardEngine.previousSummary?.customer||0);
    const tr=DashboardEngine.trends?.customer||{};
    const delta=cur-prev;
    const pct=tr?.pct==null?null:Number(tr.pct);
    const t=tone(delta);

    host.classList.add("lb-performance-explain");
    host.innerHTML=`
      <div class="lb-perf-explain-row ${t}">
        <span class="lb-perf-explain-icon">${arrow(delta)}</span>
        <div>
          <strong>Perubahan Customer Periode Aktif</strong>
          <p>Periode sebelumnya <b>${idn(prev)}</b> customer → periode sekarang <b>${idn(cur)}</b> customer.</p>
          <small>${delta===0?"Tidak berubah":`${delta>0?"Naik":"Turun"} ${signedPct(pct)} (${delta>0?"+":""}${idn(delta)} customer)`}.</small>
        </div>
      </div>
      <div id="lbAnnualPerformanceConclusion" class="lb-perf-annual-conclusion is-loading">Menganalisis tren omzet Jan–Des…</div>
    `;
  }

  async function renderAnnualConclusion(){
    const run=++seq;
    const host=el("lbAnnualPerformanceConclusion");
    const {branchId,year}=context();
    if(!host||!branchId||!year||typeof DashboardEngine==="undefined") return;

    try{
      const rows=await DashboardEngine.fetchRecapRows(`${year}-01-01`,`${year}-12-31`,branchId);
      if(run!==seq) return;
      const sums=Array(12).fill(0),has=Array(12).fill(false);
      (rows||[]).forEach(row=>{
        const iso=String(row?.tanggal||"").slice(0,10);
        const m=Number(iso.slice(5,7));
        if(m<1||m>12) return;
        has[m-1]=true;
        const v=typeof DashboardEngine.minutesGrossOf==="function"
          ? DashboardEngine.minutesGrossOf(row)
          : Number(row?.gross_revenue ?? (Number(row?.service||0)+Number(row?.produk||0)));
        sums[m-1]+=Number.isFinite(v)?v:0;
      });

      const available=has.map((v,i)=>v?i:-1).filter(i=>i>=0);
      if(!available.length){
        host.className="lb-perf-annual-conclusion is-flat";
        host.innerHTML="<strong>Status Tahunan</strong><p>Belum ada data omzet untuk tahun ini.</p>";
        return;
      }

      const first=available[0],last=available[available.length-1];
      const start=sums[first],end=sums[last],delta=end-start;
      const pct=start>0?((delta/start)*100):null;
      let up=0,down=0;
      for(let k=1;k<available.length;k++){
        const a=sums[available[k-1]],b=sums[available[k]];
        if(b>a) up++; else if(b<a) down++;
      }
      const peakIdx=available.reduce((best,i)=>sums[i]>sums[best]?i:best,available[0]);
      let status="STABIL / FLUKTUATIF";
      if(delta>0 && up>=down) status="TREN TAHUNAN MENGUAT";
      else if(delta<0 && down>=up) status="TREN TAHUNAN MELEMAH";
      const cls=delta>0&&up>=down?"is-up":delta<0&&down>=up?"is-down":"is-flat";
      const coverage=available.length===12
        ? `Data lengkap Jan–Des ${year}.`
        : `Data tersedia ${MONTHS[first]}–${MONTHS[last]} ${year}; bulan setelah ${MONTHS[last]} belum memiliki data.`;

      host.className=`lb-perf-annual-conclusion ${cls}`;
      host.innerHTML=`
        <div class="lb-perf-annual-head"><span>${arrow(delta)}</span><strong>Status Cabang: ${status}</strong></div>
        <p>Omzet ${MONTHS[first]} <b>${money(start)}</b> → ${MONTHS[last]} <b>${money(end)}</b>${pct==null?"":` · ${delta>=0?"naik":"turun"} <b>${signedPct(Math.round(pct))}</b> (${money(Math.abs(delta))})`}.</p>
        <p>Dari bulan yang tersedia: <b>${up} bulan naik</b>, <b>${down} bulan turun</b>. Puncak omzet ada di <b>${MONTHS[peakIdx]} ${money(sums[peakIdx])}</b>.</p>
        <small>${coverage} Kesimpulan ini hanya merangkum data omzet grafik Dashboard Utama secara read only.</small>
      `;
    }catch(err){
      if(run!==seq) return;
      host.className="lb-perf-annual-conclusion is-flat";
      host.textContent=`Kesimpulan tahunan belum dapat dimuat · ${String(err?.message||"unknown error")}`;
    }
  }

  async function refresh(){
    // Beri waktu UI utama selesai merender performance dan AI bridge selesai memuat DashboardEngine.
    for(let i=0;i<20;i++){
      if(typeof DashboardEngine!=="undefined" && el("lbPerformanceNote")) break;
      await new Promise(r=>setTimeout(r,100));
    }
    renderCustomerDetail();
    await renderAnnualConclusion();
  }

  function bind(){
    const later=()=>setTimeout(refresh,250);
    el("lbBranch")?.addEventListener("change",later);
    el("lbMonth")?.addEventListener("change",later);
    el("lbRefresh")?.addEventListener("click",later);
    setTimeout(refresh,1200);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();

  window.LaporanBulananPerformanceExplain={refresh};
})();
