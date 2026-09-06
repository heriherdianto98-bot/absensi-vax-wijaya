/*
=========================================================
VAX ERP — SETORAN 3 HARIAN STATUS INDICATOR
Additive UI-only layer.

Tidak mengubah engine/rumus canonical yang sudah LOCK.
Menampilkan indikator visual per cabang:
- MERAH berkedip = perlu dicek / ada anomali faktual
- HIJAU berkedip = kondisi sudah sesuai
- TANPA indikator = data belum cukup untuk dinilai
=========================================================
*/
"use strict";

(function(){
  if(typeof SetoranDirectFlow === "undefined") return;

  const flow = SetoranDirectFlow;
  const EPS = 0.5;

  function ensureStyle(){
    if(document.getElementById("s3StatusIndicatorStyle")) return;
    const style=document.createElement("style");
    style.id="s3StatusIndicatorStyle";
    style.textContent=`
      .s3sheet-branch{position:relative!important;}
      .s3-status-indicator{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:18px;
        height:18px;
        margin-right:7px;
        border-radius:50%;
        vertical-align:-3px;
        font-size:11px;
        font-weight:900;
        line-height:1;
        user-select:none;
        pointer-events:auto;
      }
      .s3-status-indicator.is-danger{
        color:#fff;
        background:rgba(239,68,68,.95);
        border:1px solid rgba(255,120,120,.95);
        box-shadow:0 0 7px rgba(239,68,68,.9),0 0 15px rgba(239,68,68,.55);
        animation:s3StatusDangerBlink .82s ease-in-out infinite;
      }
      .s3-status-indicator.is-ok{
        color:#07150d;
        background:rgba(74,222,128,.98);
        border:1px solid rgba(148,255,186,.95);
        box-shadow:0 0 7px rgba(74,222,128,.9),0 0 15px rgba(34,197,94,.5);
        animation:s3StatusOkBlink 1.05s ease-in-out infinite;
      }
      @keyframes s3StatusDangerBlink{
        0%,100%{opacity:1;transform:scale(1);filter:brightness(1)}
        50%{opacity:.34;transform:scale(.84);filter:brightness(1.45)}
      }
      @keyframes s3StatusOkBlink{
        0%,100%{opacity:1;transform:scale(1);filter:brightness(1)}
        50%{opacity:.38;transform:scale(.88);filter:brightness(1.35)}
      }
      @media (prefers-reduced-motion:reduce){
        .s3-status-indicator{animation:none!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function evaluate(id){
    const saved=flow.savedRows.get(flow.key(id))||{};
    const m=flow.model(id);
    const bri=flow.money(m?.bri);
    const diff=flow.money(m?.diff);
    const actual=flow.money(m?.actual);
    const verified=saved.owner_verified===true;

    const reasons=[];
    if(actual<0) reasons.push("Cash Aktual negatif");
    if(bri>0 && Math.abs(diff)>EPS) reasons.push(`Selisih Non Tunai ${flow.rupiah(diff)}`);

    if(reasons.length){
      return {type:"danger",icon:"!",title:`Perlu dicek: ${reasons.join(" · ")}`};
    }

    // Hijau hanya ketika ada dasar kuat bahwa row sudah benar.
    // BRI > 0 berarti rekonsiliasi sudah memiliki settlement; owner_verified berarti
    // pengecekan akhir Owner sudah selesai. BRI Rp0 yang belum diverifikasi dianggap pending.
    const reconciledOk=bri>0 && Math.abs(diff)<=EPS && actual>=0;
    const ownerOk=verified && actual>=0 && Math.abs(diff)<=EPS;
    if(reconciledOk || ownerOk){
      return {type:"ok",icon:"✓",title:verified?"Sesuai · sudah diverifikasi Owner":"Sesuai · rekonsiliasi tidak memiliki selisih"};
    }

    return null;
  }

  function decorateRows(){
    ensureStyle();
    const body=document.getElementById("s3sheetBody");
    if(!body) return;
    body.querySelectorAll("tr[data-cabang-id]").forEach(tr=>{
      const cell=tr.querySelector(".s3sheet-branch");
      if(!cell) return;
      cell.querySelector("[data-s3-status-indicator]")?.remove();
      const state=evaluate(Number(tr.dataset.cabangId));
      if(!state) return;
      const el=document.createElement("span");
      el.setAttribute("data-s3-status-indicator","1");
      el.className=`s3-status-indicator is-${state.type}`;
      el.textContent=state.icon;
      el.title=state.title;
      el.setAttribute("aria-label",state.title);
      cell.prepend(el);
    });
  }

  const originalRenderTable=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const result=originalRenderTable(...arguments);
    decorateRows();
    return result;
  };

  // Saat angka BRI/biaya berubah di layar, indikator ikut merespons tanpa menyentuh rumus.
  const originalOnTableInput=flow.onTableInput?.bind(flow);
  if(originalOnTableInput){
    flow.onTableInput=function(){
      const result=originalOnTableInput(...arguments);
      decorateRows();
      return result;
    };
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",decorateRows,{once:true});
  }else{
    decorateRows();
  }
})();
