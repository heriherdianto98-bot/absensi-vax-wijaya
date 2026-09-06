/*
=========================================================
VAX ERP — SETORAN 3 HARIAN STATUS INDICATOR
Additive UI-only layer.

Tidak mengubah engine/rumus canonical yang sudah LOCK.
Menampilkan indikator visual per cabang:
- MERAH berkedip = perlu dicek / ada anomali faktual
- HIJAU berkedip = kondisi sudah sesuai
- TANPA indikator = data belum cukup untuk dinilai
- Jika ada warning merah, tampilkan penjelasan ringkas di atas tabel
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
      .s3-warning-summary{
        display:none;
        align-items:flex-start;
        gap:10px;
        margin:0 0 8px;
        padding:9px 12px;
        border:1px solid rgba(239,68,68,.62);
        border-left:4px solid #ef4444;
        border-radius:9px;
        background:linear-gradient(90deg,rgba(127,29,29,.24),rgba(127,29,29,.08));
        color:#ffd7d7;
        box-shadow:0 0 14px rgba(239,68,68,.08);
      }
      .s3-warning-summary.is-visible{display:flex;}
      .s3-warning-summary-icon{
        flex:0 0 auto;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:20px;
        height:20px;
        margin-top:1px;
        border-radius:50%;
        background:#ef4444;
        color:#fff;
        font-size:12px;
        font-weight:900;
        box-shadow:0 0 8px rgba(239,68,68,.8);
        animation:s3StatusDangerBlink .82s ease-in-out infinite;
      }
      .s3-warning-summary-copy{min-width:0;}
      .s3-warning-summary-copy strong{
        display:block;
        margin-bottom:3px;
        color:#ff7b7b;
        font-size:10px;
        font-weight:900;
        letter-spacing:.7px;
        text-transform:uppercase;
      }
      .s3-warning-summary-list{
        display:flex;
        flex-wrap:wrap;
        gap:4px 12px;
        color:#ffd7d7;
        font-size:11px;
        font-weight:700;
        line-height:1.35;
      }
      .s3-warning-summary-item b{color:#fff;}
      @keyframes s3StatusDangerBlink{
        0%,100%{opacity:1;transform:scale(1);filter:brightness(1)}
        50%{opacity:.34;transform:scale(.84);filter:brightness(1.45)}
      }
      @keyframes s3StatusOkBlink{
        0%,100%{opacity:1;transform:scale(1);filter:brightness(1)}
        50%{opacity:.38;transform:scale(.88);filter:brightness(1.35)}
      }
      @media (prefers-reduced-motion:reduce){
        .s3-status-indicator,.s3-warning-summary-icon{animation:none!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function branchName(id){
    const b=(flow.branches||[]).find(x=>Number(x.id)===Number(id));
    return b ? flow.canonicalName(b.nama_cabang) : `Cabang ${id}`;
  }

  function evaluate(id){
    const saved=flow.savedRows.get(flow.key(id))||{};
    const m=flow.model(id);
    const bri=flow.money(m?.bri);
    const diff=flow.money(m?.diff);
    const actual=flow.money(m?.actual);
    const verified=saved.owner_verified===true;

    const reasons=[];
    if(actual<0) reasons.push(`Cash Aktual negatif ${flow.rupiah(actual)}`);
    if(bri>0 && Math.abs(diff)>EPS) reasons.push(`Selisih Non Tunai ${flow.rupiah(diff)}`);

    if(reasons.length){
      return {type:"danger",icon:"!",reasons,title:`Perlu dicek: ${reasons.join(" · ")}`};
    }

    const reconciledOk=bri>0 && Math.abs(diff)<=EPS && actual>=0;
    const ownerOk=verified && actual>=0 && Math.abs(diff)<=EPS;
    if(reconciledOk || ownerOk){
      return {type:"ok",icon:"✓",reasons:[],title:verified?"Sesuai · sudah diverifikasi Owner":"Sesuai · rekonsiliasi tidak memiliki selisih"};
    }

    return null;
  }

  function ensureWarningSummary(){
    let panel=document.getElementById("s3WarningSummary");
    if(panel) return panel;
    const tableCard=document.querySelector(".s3sheet-table-card");
    if(!tableCard) return null;
    panel=document.createElement("div");
    panel.id="s3WarningSummary";
    panel.className="s3-warning-summary";
    panel.setAttribute("role","status");
    panel.setAttribute("aria-live","polite");
    panel.innerHTML='<span class="s3-warning-summary-icon">!</span><div class="s3-warning-summary-copy"><strong>Perlu Dicek</strong><div class="s3-warning-summary-list"></div></div>';
    tableCard.parentNode.insertBefore(panel,tableCard);
    return panel;
  }

  function renderWarningSummary(warnings){
    const panel=ensureWarningSummary();
    if(!panel) return;
    const list=panel.querySelector(".s3-warning-summary-list");
    if(!warnings.length){
      panel.classList.remove("is-visible");
      if(list) list.innerHTML="";
      return;
    }
    if(list){
      list.innerHTML=warnings.map(w=>`<span class="s3-warning-summary-item"><b>${flow.esc ? flow.esc(w.name) : w.name}</b>: ${flow.esc ? flow.esc(w.reasons.join(" · ")) : w.reasons.join(" · ")}</span>`).join("");
    }
    panel.classList.add("is-visible");
  }

  function decorateRows(){
    ensureStyle();
    const body=document.getElementById("s3sheetBody");
    if(!body) return;
    const warnings=[];
    body.querySelectorAll("tr[data-cabang-id]").forEach(tr=>{
      const cell=tr.querySelector(".s3sheet-branch");
      if(!cell) return;
      cell.querySelector("[data-s3-status-indicator]")?.remove();
      const id=Number(tr.dataset.cabangId);
      const state=evaluate(id);
      if(!state) return;
      const el=document.createElement("span");
      el.setAttribute("data-s3-status-indicator","1");
      el.className=`s3-status-indicator is-${state.type}`;
      el.textContent=state.icon;
      el.title=state.title;
      el.setAttribute("aria-label",state.title);
      cell.prepend(el);
      if(state.type==="danger") warnings.push({name:branchName(id),reasons:state.reasons});
    });
    renderWarningSummary(warnings);
  }

  const originalRenderTable=flow.renderTable.bind(flow);
  flow.renderTable=function(){
    const result=originalRenderTable(...arguments);
    decorateRows();
    return result;
  };

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
