/*
=========================================================
VAX ERP — SETORAN 3 HARIAN SELISIH NON TUNAI DRILLDOWN
UI / PRESENTATION ONLY.

Membaca data yang SUDAH dihitung SetoranDirectFlow.
Tidak mengubah rumus, engine, data, query, penyimpanan, atau status.
=========================================================
*/
"use strict";

(function(){
  if(typeof SetoranDirectFlow === "undefined") return;
  const flow=SetoranDirectFlow;
  const EPS=.5;
  let bound=false;

  function ensureStyle(){
    if(document.getElementById("s3DiffDrilldownStyle")) return;
    const style=document.createElement("style");
    style.id="s3DiffDrilldownStyle";
    style.textContent=`
      .s3sheet-total.is-red.s3-diff-clickable{cursor:pointer;outline:none}
      .s3sheet-total.is-red.s3-diff-clickable:hover{transform:translateY(-2px);border-color:rgba(255,112,112,.75);box-shadow:0 13px 28px rgba(0,0,0,.3),0 0 18px rgba(239,68,68,.12)}
      .s3sheet-total.is-red.s3-diff-clickable:focus-visible{box-shadow:0 0 0 2px rgba(255,255,255,.8),0 0 0 4px rgba(239,68,68,.65)}
      .s3-diff-hint{position:absolute;right:10px;top:9px;font-size:9px;font-weight:900;letter-spacing:.06em;color:#ffb4b4;text-transform:uppercase}
      .s3-diff-modal[hidden]{display:none!important}.s3-diff-modal{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:18px}.s3-diff-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.76);backdrop-filter:blur(3px)}
      .s3-diff-panel{position:relative;width:min(920px,calc(100vw - 36px));max-height:min(78vh,760px);overflow:hidden;border:1px solid rgba(217,139,243,.36);border-radius:15px;background:#0d1722;box-shadow:0 26px 70px rgba(0,0,0,.62);color:#f4f7fb}
      .s3-diff-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,#151d2a,#0d1722)}.s3-diff-head h3{margin:0 0 4px;font-size:18px}.s3-diff-head p{margin:0;color:#9fb0c2;font-size:12px}.s3-diff-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:#14202d;color:#fff;font-size:22px;cursor:pointer}
      .s3-diff-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.07)}.s3-diff-summary div{padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#0a131d}.s3-diff-summary span{display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#9fb0c2;font-weight:800}.s3-diff-summary strong{display:block;margin-top:5px;font-size:18px}.s3-diff-summary .is-plus strong{color:#63e6a7}.s3-diff-summary .is-minus strong{color:#ff7070}
      .s3-diff-table-wrap{max-height:50vh;overflow:auto}.s3-diff-table{width:100%;border-collapse:collapse;font-size:13px}.s3-diff-table th{position:sticky;top:0;z-index:2;padding:10px 12px;background:#121d28;color:#f2bf3e;border-bottom:1px solid rgba(216,165,59,.35);text-align:right}.s3-diff-table th:first-child{text-align:left}.s3-diff-table td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.07);text-align:right;font-variant-numeric:tabular-nums}.s3-diff-table td:first-child{text-align:left;font-weight:800}.s3-diff-table tr.is-plus td:last-child{color:#63e6a7;font-weight:900}.s3-diff-table tr.is-minus td:last-child{color:#ff7070;font-weight:900}.s3-diff-table tr.is-zero{opacity:.55}.s3-diff-status{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}.s3-diff-status.is-plus{color:#9ff0c7;background:rgba(34,197,94,.12);border:1px solid rgba(74,222,128,.28)}.s3-diff-status.is-minus{color:#ffb3b3;background:rgba(239,68,68,.12);border:1px solid rgba(255,112,112,.28)}.s3-diff-status.is-zero{color:#cbd5e1;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.18)}
      .s3-diff-note{padding:10px 16px 14px;color:#9fb0c2;font-size:11px;line-height:1.45}.s3-diff-empty{padding:26px;text-align:center;color:#9fb0c2}
      @media(max-width:700px){.s3-diff-summary{grid-template-columns:1fr}.s3-diff-panel{width:calc(100vw - 20px)}.s3-diff-table{font-size:11px}.s3-diff-table th,.s3-diff-table td{padding:9px 8px}}
    `;
    document.head.appendChild(style);
  }

  function card(){return document.getElementById("s3totDiff")?.closest(".s3sheet-total")||null;}
  function periodText(){try{const p=flow.period();return `${p.start} — ${p.end}`;}catch(_e){return "Periode aktif";}}
  function rows(){
    return (flow.branches||[]).map(b=>{
      const m=flow.model(b.id);
      const non=flow.money(m?.s?.nonCash);
      const bri=m?.bri==null?null:flow.money(m.bri);
      const diff=m?.diff==null?null:flow.money(m.diff);
      const name=flow.canonicalName(b.nama_cabang);
      let type="zero",label="Belum dibandingkan";
      if(diff!=null){
        if(diff>EPS){type="plus";label="Lebih Masuk";}
        else if(diff<-EPS){type="minus";label="Kurang Masuk";}
        else {type="zero";label="Sesuai";}
      }
      return {name,non,bri,diff,type,label};
    }).filter(r=>r.diff!=null);
  }
  function totals(list){
    return list.reduce((a,r)=>{a.net+=flow.money(r.diff);if(r.diff>EPS)a.plus+=r.diff;else if(r.diff<-EPS)a.minus+=Math.abs(r.diff);return a;},{net:0,plus:0,minus:0});
  }
  function esc(v){return flow.esc?flow.esc(v):String(v??"");}
  function money(v){return flow.rupiah(flow.money(v));}

  function ensureModal(){
    let modal=document.getElementById("s3DiffModal");
    if(modal) return modal;
    modal=document.createElement("div");
    modal.id="s3DiffModal";modal.className="s3-diff-modal";modal.hidden=true;
    modal.innerHTML='<div class="s3-diff-backdrop" data-s3-diff-close></div><section class="s3-diff-panel" role="dialog" aria-modal="true" aria-labelledby="s3DiffTitle"><div class="s3-diff-head"><div><h3 id="s3DiffTitle">Rincian Selisih Non Tunai</h3><p id="s3DiffPeriod">—</p></div><button type="button" class="s3-diff-close" data-s3-diff-close aria-label="Tutup">×</button></div><div class="s3-diff-summary"><div><span>Total Bersih Selisih</span><strong id="s3DiffNet">Rp0</strong></div><div class="is-plus"><span>Total Lebih Masuk</span><strong id="s3DiffPlus">Rp0</strong></div><div class="is-minus"><span>Total Kurang Masuk</span><strong id="s3DiffMinus">Rp0</strong></div></div><div class="s3-diff-table-wrap" id="s3DiffBody"></div><div class="s3-diff-note">Selisih = BRI Merchant − Non Tunai Minutes. Nilai positif berarti uang yang masuk ke rekening lebih besar dari transaksi non-tunai Minutes; nilai negatif berarti uang masuk lebih kecil dan perlu diperiksa.</div></section>';
    document.body.appendChild(modal);
    modal.addEventListener("click",e=>{if(e.target.closest("[data-s3-diff-close]")) close();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden) close();});
    return modal;
  }

  function open(){
    const modal=ensureModal(),list=rows(),sum=totals(list);
    document.getElementById("s3DiffPeriod").textContent=periodText();
    document.getElementById("s3DiffNet").textContent=money(sum.net);
    document.getElementById("s3DiffPlus").textContent=money(sum.plus);
    document.getElementById("s3DiffMinus").textContent=money(sum.minus);
    const body=document.getElementById("s3DiffBody");
    if(!list.length){body.innerHTML='<div class="s3-diff-empty">Belum ada BRI Merchant yang dapat dibandingkan pada periode ini.</div>';}
    else{
      body.innerHTML=`<table class="s3-diff-table"><thead><tr><th>Cabang</th><th>Non Tunai Minutes</th><th>BRI Merchant</th><th>Status</th><th>Selisih</th></tr></thead><tbody>${list.map(r=>`<tr class="is-${r.type}"><td>${esc(r.name)}</td><td>${money(r.non)}</td><td>${money(r.bri)}</td><td><span class="s3-diff-status is-${r.type}">${esc(r.label)}</span></td><td>${r.diff>EPS?"+":""}${money(r.diff)}</td></tr>`).join("")}</tbody></table>`;
    }
    modal.hidden=false;document.body.style.overflow="hidden";
  }
  function close(){const modal=document.getElementById("s3DiffModal");if(modal)modal.hidden=true;document.body.style.overflow="";}

  function decorateCard(){
    ensureStyle();const el=card();if(!el)return false;
    el.classList.add("s3-diff-clickable");el.setAttribute("role","button");el.setAttribute("tabindex","0");el.title="Klik untuk melihat sumber Selisih Non Tunai per cabang";
    if(!el.querySelector(".s3-diff-hint")){const h=document.createElement("span");h.className="s3-diff-hint";h.textContent="Klik rincian";el.appendChild(h);}
    if(!bound){bound=true;el.addEventListener("click",open);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});}
    return true;
  }

  function boot(){let n=0;const t=setInterval(()=>{n++;if(decorateCard()||n>80)clearInterval(t);},50);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
