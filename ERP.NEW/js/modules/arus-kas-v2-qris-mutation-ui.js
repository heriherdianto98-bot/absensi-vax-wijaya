/*
=========================================================
ERP VAX — ARUS KAS V2 QRIS / GOPAY MUTATION UI
UI / read-only presentation layer only.
- Klik 3 card Rekonsiliasi QRIS / GoPay membuka detail mutasi.
- Membaca data yang SUDAH dimuat ArusKasV2 (setoranRows + ledger).
- Tidak query Supabase, tidak mengubah engine, formula, transaksi, saldo,
  source of truth, atau alur rekonsiliasi.
=========================================================
*/
"use strict";
(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__qrisMutationUiInstalled) return;
  flow.__qrisMutationUiInstalled=true;

  const money=v=>flow.money?.(v)??Number(v||0);
  const rp=v=>flow.rupiah?.(v)||String(v||0);
  const esc=v=>flow.esc?.(v)||String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=v=>flow.fmtDate?.(v)||v||"—";

  const CFG={
    ak2QrisExpected:{mode:"expected",title:"Mutasi Uang Rekening",label:"UANG REKENING"},
    ak2QrisActual:{mode:"actual",title:"Mutasi Masuk Kas QRIS / GoPay",label:"SUDAH MASUK KAS"},
    ak2QrisDiff:{mode:"diff",title:"Mutasi Selisih QRIS / GoPay",label:"SELISIH SAAT INI"}
  };

  function range(){
    try{return flow.range?.()||{start:"0000-00-00",end:"9999-12-31"}}catch(_e){return{start:"0000-00-00",end:"9999-12-31"}}
  }

  function groups(){
    const r=range();
    const map=new Map();
    for(const row of flow.setoranRows||[]){
      const start=row.period_start||row.period_end||"";
      const end=row.period_end||row.period_start||"";
      if(!start||!end||end<r.start||start>r.end) continue;
      const key=`${start}|${end}`;
      if(!map.has(key)) map.set(key,{start,end,rows:[]});
      map.get(key).rows.push(row);
    }
    return [...map.values()].sort((a,b)=>String(b.end).localeCompare(String(a.end))||String(b.start).localeCompare(String(a.start)));
  }

  function qrisLedger(g){
    return (flow.ledger||[]).filter(x=>
      x.category==="QRIS_TRANSFER" &&
      x.to_wallet==="KAS_BESAR" &&
      x.source_period_start===g.start &&
      x.source_period_end===g.end
    ).sort((a,b)=>String(b.tanggal||"").localeCompare(String(a.tanggal||""))||String(b.created_at||"").localeCompare(String(a.created_at||"")));
  }

  function expected(g){return g.rows.reduce((t,r)=>t+money(r.bri_non_cash_actual),0)}
  function actual(g){return qrisLedger(g).reduce((t,r)=>t+money(r.amount),0)}
  function periodText(g){return `${fmt(g.start)} — ${fmt(g.end)}`}

  function statusText(row){
    if(row?.verification_status==="OWNER_VERIFIED") return "OWNER VERIFIED";
    if(row?.verification_status==="MINTA_KOREKSI") return "MINTA KOREKSI";
    return "BELUM DIVERIFIKASI";
  }

  function modal(){
    let root=document.getElementById("ak2QrisMutationModal");
    if(root) return root;
    root=document.createElement("div");
    root.id="ak2QrisMutationModal";
    root.className="ak2-qmut-overlay";
    root.hidden=true;
    root.innerHTML=`
      <section class="ak2-qmut-modal" role="dialog" aria-modal="true" aria-labelledby="ak2QmutTitle">
        <header class="ak2-qmut-head">
          <div>
            <div class="ak2-qmut-kicker">RIWAYAT REKONSILIASI · READ ONLY</div>
            <h2 id="ak2QmutTitle">Mutasi QRIS / GoPay</h2>
            <div id="ak2QmutPeriod" class="ak2-qmut-period"></div>
          </div>
          <div class="ak2-qmut-head-right">
            <div id="ak2QmutValueLabel" class="ak2-qmut-value-label">TOTAL</div>
            <strong id="ak2QmutValue">Rp0</strong>
            <button type="button" class="ak2-qmut-close" aria-label="Tutup">×</button>
          </div>
        </header>
        <div class="ak2-qmut-body">
          <div class="ak2-qmut-table-wrap">
            <table class="ak2-qmut-table">
              <thead id="ak2QmutHead"></thead>
              <tbody id="ak2QmutBody"></tbody>
            </table>
          </div>
        </div>
      </section>`;
    document.body.appendChild(root);
    root.addEventListener("click",e=>{if(e.target===root||e.target.closest(".ak2-qmut-close")) close()});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!root.hidden)close()});
    return root;
  }

  function renderExpected(){
    const gs=groups(),head=document.getElementById("ak2QmutHead"),body=document.getElementById("ak2QmutBody");
    head.innerHTML='<tr><th>Periode</th><th>Mutasi</th><th>Nominal</th><th>Sumber</th><th>Keterangan</th></tr>';
    if(!gs.length){body.innerHTML='<tr><td colspan="5" class="ak2-qmut-empty">Belum ada periode rekonsiliasi.</td></tr>';return}
    body.innerHTML=gs.map(g=>`<tr>
      <td>${esc(periodText(g))}</td>
      <td><span class="ak2-qmut-kind is-account">REKENING</span></td>
      <td class="ak2-qmut-amount is-account">${esc(rp(expected(g)))}</td>
      <td class="ak2-qmut-route">Data Setoran</td>
      <td>BRI / non tunai sesuai Setoran 3 Harian</td>
    </tr>`).join("");
  }

  function renderActual(){
    const gs=groups(),head=document.getElementById("ak2QmutHead"),body=document.getElementById("ak2QmutBody");
    head.innerHTML='<tr><th>Tanggal</th><th>Mutasi</th><th>Nominal</th><th>Dari / Ke</th><th>Periode</th><th>Keterangan</th><th>Status</th></tr>';
    const rows=gs.flatMap(g=>qrisLedger(g).map(row=>({g,row}))).sort((a,b)=>String(b.row.tanggal||"").localeCompare(String(a.row.tanggal||""))||String(b.row.created_at||"").localeCompare(String(a.row.created_at||"")));
    if(!rows.length){body.innerHTML='<tr><td colspan="7" class="ak2-qmut-empty">Belum ada transfer QRIS / GoPay masuk Kas pada periode aktif.</td></tr>';return}
    body.innerHTML=rows.map(({g,row})=>`<tr>
      <td>${esc(fmt(row.tanggal))}</td>
      <td><span class="ak2-qmut-kind is-in">MASUK</span></td>
      <td class="ak2-qmut-amount is-in">${esc(rp(row.amount))}</td>
      <td class="ak2-qmut-route">Rekening → Kas Besar</td>
      <td>${esc(periodText(g))}</td>
      <td>${esc(row.description||"Transfer QRIS / GoPay")}</td>
      <td><span class="ak2-qmut-status">${esc(statusText(row))}</span></td>
    </tr>`).join("");
  }

  function renderDiff(){
    const gs=groups(),head=document.getElementById("ak2QmutHead"),body=document.getElementById("ak2QmutBody");
    head.innerHTML='<tr><th>Periode</th><th>Uang Rekening</th><th>Masuk Kas</th><th>Selisih</th><th>Status</th><th>Keterangan</th></tr>';
    if(!gs.length){body.innerHTML='<tr><td colspan="6" class="ak2-qmut-empty">Belum ada periode rekonsiliasi.</td></tr>';return}
    body.innerHTML=gs.map(g=>{
      const exp=expected(g),act=actual(g),diff=exp-act;
      const state=Math.abs(diff)<.5?"SESUAI":diff>0?"BELUM MASUK":"LEBIH MASUK";
      const cls=Math.abs(diff)<.5?"is-ok":"is-alert";
      return `<tr>
        <td>${esc(periodText(g))}</td>
        <td class="ak2-qmut-money">${esc(rp(exp))}</td>
        <td class="ak2-qmut-money is-in">${esc(rp(act))}</td>
        <td class="ak2-qmut-diff ${cls}">${esc(rp(diff))}</td>
        <td><span class="ak2-qmut-status ${cls}">${state}</span></td>
        <td>${diff>0?"Dana rekening belum seluruhnya masuk Kas Besar":diff<0?"Dana masuk Kas melebihi data rekening":"Rekonsiliasi sudah sesuai"}</td>
      </tr>`;
    }).join("");
  }

  function open(cfg,value){
    const root=modal(),r=range();
    document.getElementById("ak2QmutTitle").textContent=cfg.title;
    document.getElementById("ak2QmutValueLabel").textContent=cfg.label;
    document.getElementById("ak2QmutValue").textContent=value.textContent.trim()||"Rp0";
    document.getElementById("ak2QmutPeriod").textContent=`${fmt(r.start)} — ${fmt(r.end)}`;
    if(cfg.mode==="expected")renderExpected();else if(cfg.mode==="actual")renderActual();else renderDiff();
    root.hidden=false;
    document.body.classList.add("ak2-qmut-open");
  }
  function close(){const root=document.getElementById("ak2QrisMutationModal");if(root)root.hidden=true;document.body.classList.remove("ak2-qmut-open")}

  function bind(){
    Object.entries(CFG).forEach(([id,cfg])=>{
      const value=document.getElementById(id);if(!value)return;
      const card=value.parentElement;if(!card||card.dataset.ak2QrisMutationBound==="1")return;
      card.dataset.ak2QrisMutationBound="1";
      card.classList.add("ak2-qmut-card");card.setAttribute("tabindex","0");card.setAttribute("role","button");card.title=`Klik untuk lihat ${cfg.title}`;
      const activate=e=>{if(e.type==="keydown"&&!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();open(cfg,value)};
      card.addEventListener("click",activate);card.addEventListener("keydown",activate);
    });
  }

  function style(){
    if(document.getElementById("ak2QrisMutationStyle"))return;
    const s=document.createElement("style");s.id="ak2QrisMutationStyle";s.textContent=`
      body.page-arus-kas .ak2-qmut-card{cursor:pointer;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}
      body.page-arus-kas .ak2-qmut-card:hover{transform:translateY(-1px);filter:brightness(1.06);box-shadow:0 9px 24px rgba(0,0,0,.20)}
      body.page-arus-kas .ak2-qmut-card:focus-visible{outline:2px solid #d6aa43;outline-offset:2px}
      body.ak2-qmut-open{overflow:hidden}
      .ak2-qmut-overlay{position:fixed;inset:0;z-index:12100;background:rgba(3,7,11,.82);backdrop-filter:blur(5px);display:grid;place-items:center;padding:28px}
      .ak2-qmut-overlay[hidden]{display:none!important}
      .ak2-qmut-modal{width:min(1180px,96vw);max-height:86vh;background:linear-gradient(180deg,#14202b,#0b131a);border:1px solid rgba(158,91,205,.62);border-radius:18px;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04);color:#edf3f8}
      .ak2-qmut-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px;border-bottom:1px solid #3d3150;background:linear-gradient(100deg,rgba(98,51,132,.27),rgba(18,31,42,.25))}
      .ak2-qmut-kicker{font-size:11px;letter-spacing:.16em;font-weight:900;color:#c997eb}.ak2-qmut-head h2{margin:4px 0 3px;font-size:25px;line-height:1}.ak2-qmut-period{font-size:12px;color:#91a0ad}
      .ak2-qmut-head-right{position:relative;text-align:right;padding-right:54px}.ak2-qmut-value-label{font-size:10px;letter-spacing:.12em;color:#a99ab4;font-weight:850}.ak2-qmut-head-right strong{display:block;margin-top:4px;font-size:27px;color:#ffd36b;letter-spacing:.01em}.ak2-qmut-close{position:absolute;right:0;top:0;width:40px;height:40px;border-radius:11px;border:1px solid #344553;background:#16212b;color:#dfe8ee;font-size:25px;cursor:pointer}
      .ak2-qmut-body{padding:0 0 8px}.ak2-qmut-table-wrap{max-height:65vh;overflow:auto}.ak2-qmut-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}.ak2-qmut-table th{position:sticky;top:0;z-index:2;background:#203247;color:#eef5fb;border-bottom:1px solid #466078;padding:11px 12px;text-align:left;font-size:11px;letter-spacing:.07em;text-transform:uppercase}.ak2-qmut-table td{padding:11px 12px;border-bottom:1px solid #243440;font-size:13px;vertical-align:middle;color:#dce5eb}.ak2-qmut-table tbody tr:hover td{background:rgba(44,67,84,.20)}
      .ak2-qmut-kind{display:inline-grid;place-items:center;min-width:68px;padding:5px 9px;border-radius:999px;font-size:10px;font-weight:950;letter-spacing:.05em}.ak2-qmut-kind.is-in{background:#173b29;border:1px solid #3d7d57;color:#aef0c5}.ak2-qmut-kind.is-account{background:#152e45;border:1px solid #39729d;color:#aedcff}
      .ak2-qmut-amount,.ak2-qmut-money{font-weight:950}.ak2-qmut-amount.is-in,.ak2-qmut-money.is-in{color:#8ce5ae}.ak2-qmut-amount.is-account{color:#9fd9ff}.ak2-qmut-route{font-weight:850;color:#f0f4f7}.ak2-qmut-diff{font-weight:950}.ak2-qmut-diff.is-alert{color:#ff9e99}.ak2-qmut-diff.is-ok{color:#8ce5ae}
      .ak2-qmut-status{display:inline-block;padding:5px 8px;border-radius:999px;background:#1c2933;border:1px solid #394b58;color:#c8d4dc;font-size:10px;font-weight:850;white-space:nowrap}.ak2-qmut-status.is-alert{background:#452222;border-color:#784040;color:#ffb1ad}.ak2-qmut-status.is-ok{background:#173b29;border-color:#3d7d57;color:#aef0c5}.ak2-qmut-empty{text-align:center!important;color:#91a0ad!important;padding:28px!important}
      @media(max-width:760px){.ak2-qmut-overlay{padding:12px}.ak2-qmut-modal{width:98vw}.ak2-qmut-head{padding:16px}.ak2-qmut-head h2{font-size:21px}.ak2-qmut-head-right strong{font-size:21px}.ak2-qmut-table{min-width:800px}}
    `;document.head.appendChild(s);
  }

  style();bind();
  let tries=0;const timer=setInterval(()=>{tries++;bind();if(tries>=80)clearInterval(timer)},100);
  document.addEventListener("erp:finance-ready",()=>setTimeout(bind,0));
})();
