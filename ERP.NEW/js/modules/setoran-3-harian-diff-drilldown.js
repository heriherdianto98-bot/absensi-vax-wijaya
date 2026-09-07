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
      .s3sheet-total.is-red.s3-diff-clickable{cursor:pointer;outline:none;position:relative;padding-right:134px!important}
      .s3sheet-total.is-red.s3-diff-clickable:hover{transform:translateY(-2px);border-color:rgba(255,112,112,.86);box-shadow:0 13px 28px rgba(0,0,0,.3),0 0 18px rgba(239,68,68,.16)}
      .s3sheet-total.is-red.s3-diff-clickable:focus-visible{box-shadow:0 0 0 2px rgba(255,255,255,.8),0 0 0 4px rgba(239,68,68,.65)}
      .s3-diff-hint{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid rgba(255,112,112,.52);border-radius:999px;background:rgba(239,68,68,.12);box-shadow:0 0 0 1px rgba(239,68,68,.04) inset;color:#ffd4d4;font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
      .s3-diff-hint:before{content:"↗";display:inline-block;color:#ff5b5b;font-size:12px;line-height:1}

      .s3-diff-modal[hidden]{display:none!important}
      .s3-diff-modal{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:18px}
      .s3-diff-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(4px)}
      .s3-diff-panel{position:relative;width:min(1180px,calc(100vw - 42px));max-height:min(88vh,860px);overflow:hidden;border:1.5px solid rgba(216,165,59,.42);border-radius:17px;background:linear-gradient(180deg,#0c1622 0%,#08111b 100%);box-shadow:0 30px 78px rgba(0,0,0,.68),0 0 0 1px rgba(216,165,59,.06) inset;color:#f4f7fb}
      .s3-diff-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:19px 21px;border-bottom:1px solid rgba(216,165,59,.22);background:linear-gradient(180deg,#172230,#0d1722)}
      .s3-diff-head h3{margin:0 0 5px;font-size:23px;line-height:1.1}
      .s3-diff-head p{margin:0;color:#b8c5d4;font-size:14px;font-weight:700}
      .s3-diff-close{width:42px;height:42px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:#14202d;color:#fff;font-size:24px;cursor:pointer}

      .s3-diff-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:16px 18px;border-bottom:1px solid rgba(216,165,59,.18);background:rgba(8,16,26,.42)}
      .s3-diff-summary div{padding:15px 16px;border:1.6px solid rgba(216,165,59,.4);border-radius:13px;background:linear-gradient(180deg,rgba(15,25,38,.98),rgba(9,17,28,.98));box-shadow:0 10px 22px rgba(0,0,0,.22),0 0 0 1px rgba(216,165,59,.05) inset}
      .s3-diff-summary span{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#c5d1df;font-weight:900}
      .s3-diff-summary strong{display:block;margin-top:7px;font-size:27px;line-height:1.05}
      .s3-diff-summary .is-plus{border-color:rgba(74,222,128,.42)}
      .s3-diff-summary .is-minus{border-color:rgba(255,92,92,.46)}
      .s3-diff-summary .is-plus strong{color:#63e6a7}
      .s3-diff-summary .is-minus strong{color:#ff5b5b}

      .s3-diff-table-wrap{max-height:56vh;overflow:auto;background:#08111b;scrollbar-color:#b4882d #0a131d;scrollbar-width:thin}
      .s3-diff-table{width:100%;border-collapse:separate;border-spacing:0;font-size:15px;background:#08111b}
      .s3-diff-table th{position:sticky;top:0;z-index:2;padding:14px 15px;background:linear-gradient(180deg,#172331,#101b27);color:#f2bf3e;border-bottom:1.5px solid rgba(216,165,59,.46);text-align:right;font-size:12px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
      .s3-diff-table th:first-child{text-align:left}
      .s3-diff-table td{padding:15px 15px;border-bottom:1.2px solid rgba(216,165,59,.18);text-align:right;font-variant-numeric:tabular-nums;color:#eaf0f7;background:rgba(8,17,27,.96)}
      .s3-diff-table tbody tr:nth-child(even) td{background:rgba(12,23,36,.96)}
      .s3-diff-table tbody tr:hover td{background:rgba(24,38,56,.98)}
      .s3-diff-table td:first-child{text-align:left;font-weight:900;color:#fff;border-left:3px solid rgba(216,165,59,.34)}
      .s3-diff-table tbody tr:last-child td{border-bottom:none}
      .s3-diff-table tr.is-plus td:last-child{color:#63e6a7;font-weight:900}
      .s3-diff-table tr.is-minus td:last-child{color:#ff5b5b;font-weight:900}
      .s3-diff-table tr.is-zero{opacity:.74}
      .s3-diff-status{display:inline-flex;align-items:center;justify-content:center;min-width:92px;padding:6px 10px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
      .s3-diff-status.is-plus{color:#9ff0c7;background:rgba(34,197,94,.12);border:1px solid rgba(74,222,128,.36)}
      .s3-diff-status.is-minus{color:#ffd0d0;background:rgba(239,68,68,.13);border:1px solid rgba(255,92,92,.38)}
      .s3-diff-status.is-zero{color:#d4dce6;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.2)}
      .s3-diff-note{padding:13px 18px 17px;border-top:1px solid rgba(216,165,59,.13);color:#afbdcc;font-size:13px;line-height:1.5;background:#0a131d}
      .s3-diff-empty{padding:32px;text-align:center;color:#aebdcd;font-size:14px}

      .s3-diff-table-wrap::-webkit-scrollbar{width:11px;height:11px}
      .s3-diff-table-wrap::-webkit-scrollbar-track{background:#0a131d;border-radius:999px}
      .s3-diff-table-wrap::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#7d5f1e,#c89a37);border:2px solid #0a131d;border-radius:999px}
      .s3-diff-table-wrap::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#a67c26,#e0b84c)}

      @media(max-width:900px){
        .s3-diff-panel{width:calc(100vw - 24px)}
        .s3-diff-summary{grid-template-columns:1fr}
        .s3-diff-table{font-size:13px}
        .s3-diff-table th,.s3-diff-table td{padding:12px 10px}
      }
      @media(max-width:700px){
        .s3sheet-total.is-red.s3-diff-clickable{padding-right:116px!important}
        .s3-diff-hint{font-size:9px;padding:5px 7px}
        .s3-diff-head h3{font-size:19px}
        .s3-diff-summary strong{font-size:22px}
        .s3-diff-table{font-size:12px}
      }
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
    if(!el.querySelector(".s3-diff-hint")){const h=document.createElement("span");h.className="s3-diff-hint";h.textContent="Lihat rincian";el.appendChild(h);}
    if(!bound){bound=true;el.addEventListener("click",open);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});}
    return true;
  }

  function boot(){let n=0;const t=setInterval(()=>{n++;if(decorateCard()||n>80)clearInterval(t);},50);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
