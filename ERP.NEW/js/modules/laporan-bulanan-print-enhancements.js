"use strict";

/*
VAX ERP — Laporan Bulanan Print Enhancements
UI ONLY / READ ONLY.
- Grafik Performance berwarna ikut Print/PDF dan disatukan dengan ringkasan Performance.
- Rekonsiliasi Cash Out cetak menampilkan Gaji SVP + Gaji Capster/Protek agar angka Operasional transparan.
- Tanda tangan Manajemen + Supervisor ditempatkan di akhir isi laporan, bukan halaman tanda tangan terpisah.
- Tidak mengubah engine, formula, source data, Cash Out, Payroll, atau bridge LOCK.
*/
(() => {
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  let installed=false;

  function absoluteAsset(path){
    return new URL(path,window.location.href).href;
  }

  function performanceSnapshot(){
    const branchValue=String(document.getElementById("lbBranch")?.value||"");
    if(!branchValue || branchValue==="all") return "";
    const host=document.getElementById("lbPerformanceChart");
    if(!host?.querySelector("svg.lb-perf-chart-svg")) return "";
    return host.innerHTML;
  }

  function signatureHtml(){
    const managementSignature=absoluteAsset("../assets/owner-signature.png");
    const supervisorSignature=absoluteAsset("../assets/supervisor-signature-rangga.svg");
    return `
      <section class="lb-print-signatures">
        <div class="lb-print-sign-box supervisor-sign">
          <div class="who">Disetujui / Mengetahui,</div>
          <div class="auth-role">Otorisasi Supervisor</div>
          <div class="stage"><div class="ttd"><img src="${esc(supervisorSignature)}" alt="Tanda tangan Supervisor" onerror="this.style.display='none'"></div></div>
          <div class="name">Rangga Putra Pratama</div>
          <div class="signature-line"></div>
          <div class="job">SUPERVISOR</div>
        </div>
        <div class="lb-print-sign-box management-sign">
          <div class="who">Disetujui / Mengetahui,</div>
          <div class="auth-role">Otorisasi Manajemen</div>
          <div class="stage"><div class="ttd"><img src="${esc(managementSignature)}" alt="Tanda tangan Manajemen" onerror="this.style.display='none'"></div></div>
          <div class="name">Heri Herdianto</div>
          <div class="signature-line"></div>
          <div class="job">MANAJEMEN</div>
        </div>
      </section>`;
  }

  function enhancementCss(){return `
    .lb-print-performance-block{break-inside:avoid;page-break-inside:avoid;margin-top:1mm}
    .lb-print-performance-chart{margin-top:2mm;padding:2.5mm;border:1px solid #17313a;border-radius:2.4mm;background:#04070a;break-inside:avoid;page-break-inside:avoid;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    .lb-print-performance-chart .lb-perf-chart-meta{display:flex;align-items:flex-start;justify-content:space-between;gap:5mm;margin-bottom:2mm}
    .lb-print-performance-chart .lb-perf-chart-meta>div:first-child{display:flex;flex-direction:column;gap:.8mm}
    .lb-print-performance-chart .lb-perf-chart-meta strong{font-size:8.8pt;font-weight:900;color:#f8fafc}
    .lb-print-performance-chart .lb-perf-chart-meta span{font-size:6.3pt;font-weight:800;color:#9aa8b6}
    .lb-print-performance-chart .lb-perf-chart-chips{display:flex;gap:1.5mm;flex-wrap:wrap;justify-content:flex-end}
    .lb-print-performance-chart .lb-perf-chart-chips span{display:inline-flex;align-items:center;gap:1.2mm;padding:1.2mm 1.6mm;border-radius:1.5mm;border:1px solid rgba(45,212,191,.20);background:#070a0d;color:#93a3b5!important;font-size:6.1pt!important;font-weight:800!important}
    .lb-print-performance-chart .lb-perf-chart-chips b{font-size:6.1pt;font-weight:900;color:#e6fffb}
    .lb-print-performance-chart .lb-perf-chart-svg-wrap{position:relative;border:1px solid rgba(34,211,238,.22);border-radius:2mm;background:linear-gradient(180deg,#07090c 0%,#020405 100%);overflow:hidden}
    .lb-print-performance-chart .lb-perf-chart-svg{display:block;width:100%;height:auto;min-height:0}
    .lb-print-performance-chart .lb-perf-grid{stroke:rgba(148,163,184,.22);stroke-width:1}
    .lb-print-performance-chart .lb-perf-axis-y{fill:#a8b4c2;font-size:15px;font-weight:900}
    .lb-print-performance-chart .lb-perf-axis-x{fill:#d4dde8;font-size:15px;font-weight:900;letter-spacing:.02em}
    .lb-print-performance-chart .lb-perf-line{fill:none;stroke:#22d3ee;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none!important;stroke-dashoffset:0!important;animation:none!important}
    .lb-print-performance-chart .lb-perf-point circle:first-child{fill:#071014;stroke:#67e8f9;stroke-width:3}
    .lb-print-performance-chart .lb-perf-hit{fill:transparent;stroke:none}
    .lb-print-performance-chart .lb-perf-point-detail{display:none!important}

    .lb-print-signatures{margin-top:5mm;padding-top:3mm;border-top:1px solid #d2d2d2;display:grid;grid-template-columns:1fr 1fr;gap:20mm;align-items:end;break-inside:avoid;page-break-inside:avoid;page-break-before:avoid}
    .lb-print-sign-box{text-align:center;min-height:25mm}
    .lb-print-sign-box .who{font-size:7.2pt;font-weight:700;color:#172233}
    .lb-print-sign-box .auth-role{margin-top:.4mm;font-size:6.2pt;font-weight:800;letter-spacing:.12em;color:#697481;text-transform:uppercase}
    .lb-print-sign-box .stage{height:12mm;width:100%;margin:.2mm auto .5mm;display:flex;align-items:center;justify-content:center;overflow:visible}
    .lb-print-sign-box .ttd img{display:block;object-fit:contain;object-position:center}
    .lb-print-sign-box.supervisor-sign .ttd img{width:28mm;height:10mm}
    .lb-print-sign-box.management-sign .ttd img{max-width:34mm;max-height:12mm}
    .lb-print-sign-box .name{font-size:8.2pt;font-weight:800;color:#172233}
    .lb-print-sign-box .signature-line{height:1px;background:#333;width:38mm;margin:.5mm auto .5mm}
    .lb-print-sign-box .job{font-size:6.2pt;font-weight:900;letter-spacing:.16em;color:#697481}
  `;}

  function parseMoneyText(v){
    const digits=String(v||"").replace(/\D/g,"");
    return digits?Number(digits):0;
  }

  function makeLine(doc,label,value,cls=""){
    const row=doc.createElement("div");
    row.className=`line ${cls}`.trim();
    const span=doc.createElement("span");
    const strong=doc.createElement("strong");
    span.textContent=label;
    strong.textContent=value;
    row.append(span,strong);
    return row;
  }

  function addCashOutReconciliation(doc){
    doc.querySelectorAll(".branch-report").forEach(branch=>{
      const recon=branch.querySelector(".recon");
      const cashout=branch.querySelector("table.cashout");
      if(!recon||!cashout) return;
      if(recon.querySelector('[data-print-recon="svp"]')) return;

      let svp=0;
      let protek=0;
      cashout.querySelectorAll("tbody tr").forEach(tr=>{
        const cells=tr.cells;
        if(!cells||cells.length<4) return;
        const pos=String(cells[2]?.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
        const nominal=parseMoneyText(cells[3]?.textContent||"");
        if(pos==="gaji svp"||pos.startsWith("gaji svp ")) svp+=nominal;
        if(pos.includes("gaji capster")||pos.includes("protek")) protek+=nominal;
      });

      const finalLine=recon.querySelector(".line.total");
      if(svp>0){
        const row=makeLine(doc,"Dikeluarkan ke Gaji SVP",money(svp));
        row.dataset.printRecon="svp";
        recon.insertBefore(row,finalLine);
      }
      if(protek>0){
        const row=makeLine(doc,"Dikeluarkan ke Gaji Capster / Protek",money(protek));
        row.dataset.printRecon="protek";
        recon.insertBefore(row,finalLine);
      }
    });
  }

  function addPerformanceBlock(doc,chartHtml){
    if(!chartHtml) return;
    const branch=doc.querySelector(".branch-report");
    if(!branch) return;
    const headings=[...branch.querySelectorAll("h3")];
    const performanceHeading=headings.find(h=>String(h.textContent||"").trim()==="Ringkasan Performance");
    const completenessHeading=headings.find(h=>String(h.textContent||"").trim()==="Kelengkapan Data");
    if(!performanceHeading||!completenessHeading) return;

    const wrapper=doc.createElement("div");
    wrapper.className="lb-print-performance-block";
    branch.insertBefore(wrapper,performanceHeading);
    let node=performanceHeading;
    while(node&&node!==completenessHeading){
      const next=node.nextSibling;
      wrapper.appendChild(node);
      node=next;
    }
    const chart=doc.createElement("div");
    chart.className="lb-print-performance-chart";
    chart.innerHTML=chartHtml;
    wrapper.appendChild(chart);
  }

  function addSignaturesAtReportEnd(doc){
    const branches=[...doc.querySelectorAll(".branch-report")];
    const lastBranch=branches[branches.length-1];
    if(!lastBranch||lastBranch.querySelector(".lb-print-signatures")) return;
    const holder=doc.createElement("div");
    holder.innerHTML=signatureHtml();
    if(holder.firstElementChild) lastBranch.appendChild(holder.firstElementChild);
  }

  function transformPrintHtml(html,chartHtml){
    const source=String(html||"");
    if(!source) return source;
    const doc=new DOMParser().parseFromString(source,"text/html");
    const style=doc.createElement("style");
    style.textContent=enhancementCss();
    doc.head.appendChild(style);

    addCashOutReconciliation(doc);
    addPerformanceBlock(doc,chartHtml);
    addSignaturesAtReportEnd(doc);

    return `<!doctype html>${doc.documentElement.outerHTML}`;
  }

  async function enhancedOpen(mode){
    const baseOpen=window.LaporanBulananPrintUI?.__baseOpen || window.LaporanBulananPrintUI?.open;
    if(typeof baseOpen!=="function") return;

    const chartHtml=performanceSnapshot();
    const nativeOpen=window.open;
    window.open=function(...args){
      const popup=nativeOpen.apply(window,args);
      if(!popup?.document) return popup;
      const nativeWrite=popup.document.write.bind(popup.document);
      popup.document.write=function(html){
        return nativeWrite(transformPrintHtml(html,chartHtml));
      };
      return popup;
    };

    try{
      return await baseOpen(mode);
    }finally{
      window.open=nativeOpen;
    }
  }

  function replaceAction(id,mode){
    const current=document.getElementById(id);
    if(!current) return false;
    const fresh=current.cloneNode(true);
    current.replaceWith(fresh);
    fresh.addEventListener("click",()=>enhancedOpen(mode));
    return true;
  }

  function install(){
    if(installed) return;
    const api=window.LaporanBulananPrintUI;
    if(!api || typeof api.open!=="function") return;
    api.__baseOpen=api.__baseOpen || api.open;
    api.open=enhancedOpen;

    const a=replaceAction("lbPrintMonthly","print");
    const b=replaceAction("lbPdfMonthly","pdf");
    installed=a&&b;
  }

  function boot(){
    install();
    if(installed) return;
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      install();
      if(installed||tries>40) clearInterval(timer);
    },100);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
