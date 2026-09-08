/*
=========================================================
ERP VAX — ARUS KAS V2 WALLET MUTATION UI
UI / read-only presentation layer only.
- Klik 5 card saldo membuka riwayat mutasi per wallet.
- Tidak mengubah engine, query, transaksi, saldo, formula, atau source of truth.
=========================================================
*/
"use strict";
(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__walletMutationUiInstalled) return;
  flow.__walletMutationUiInstalled=true;

  const CFG={
    ak2KasBesar:{wallet:"KAS_BESAR",title:"Mutasi Kas Besar"},
    ak2DanaProduk:{wallet:"DANA_PRODUK",title:"Mutasi Dana Produk"},
    ak2KasDenda:{wallet:"KAS_DENDA",title:"Mutasi Kas Denda"},
    ak2PiutangSetoran:{wallet:"PIUTANG_SETORAN",title:"Mutasi Piutang Setoran",setoran:true},
    ak2PiutangDenda:{wallet:"PIUTANG_DENDA",title:"Mutasi Piutang Denda"}
  };
  const WALLET={
    KAS_BESAR:"Kas Besar",DANA_PRODUK:"Dana Produk",KAS_DENDA:"Kas Denda",
    PIUTANG_SETORAN:"Piutang Setoran",PIUTANG_DENDA:"Piutang Denda",EXTERNAL:"Eksternal"
  };
  const money=v=>flow.money?.(v)??Number(v||0);
  const rp=v=>flow.rupiah?.(v)||String(v||0);
  const esc=v=>flow.esc?.(v)||String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=v=>flow.fmtDate?.(v)||v||"—";
  const walletName=v=>WALLET[String(v||"").toUpperCase()]||String(v||"—").replaceAll("_"," ");
  const isInactive=row=>typeof flow.isDeleteInactive==="function"&&flow.isDeleteInactive(row);

  function statusText(row){
    const del=String(row?.metadata?.delete_status||"");
    if(del==="OWNER_VERIFIED") return "HAPUS · OWNER VERIFIED";
    if(del==="PENDING_OWNER") return "HAPUS · MENUNGGU OWNER";
    if(row?.verification_status==="OWNER_VERIFIED") return "OWNER VERIFIED";
    if(row?.verification_status==="MINTA_KOREKSI") return "MINTA KOREKSI";
    return "BELUM DIVERIFIKASI";
  }

  function period(){
    try{return flow.range?.()||{start:"0000-00-00",end:"9999-12-31"}}catch(_e){return{start:"0000-00-00",end:"9999-12-31"}}
  }

  function buildLedgerRows(wallet){
    const range=period();
    let running=0;
    const withBalance=[];
    for(const row of flow.ledger||[]){
      const touches=row.from_wallet===wallet||row.to_wallet===wallet;
      if(!touches) continue;
      const inactive=isInactive(row);
      const amount=money(row.amount);
      const incoming=row.to_wallet===wallet;
      if(!inactive) running+=incoming?amount:-amount;
      withBalance.push({row,incoming,amount,balance:running,inactive});
    }
    return withBalance
      .filter(x=>x.row.tanggal>=range.start&&x.row.tanggal<=range.end)
      .sort((a,b)=>String(b.row.tanggal).localeCompare(String(a.row.tanggal))||String(b.row.created_at||"").localeCompare(String(a.row.created_at||"")));
  }

  function setoranAmount(r){return money(r.total_setoran??r.setoran_cash_actual)}
  function branchLabel(r){return r.cabang_name||r.branch_name||r.nama_cabang||r.cabang||r.cabang_id||"Cabang"}
  function periodLabel(r){
    const a=r.period_start||r.tanggal||"";const b=r.period_end||a;
    if(!a) return "";
    return a===b?fmt(a):`${fmt(a)} — ${fmt(b)}`;
  }
  function buildPiutangSetoranRows(){
    const range=period();
    return (flow.setoranRows||[])
      .filter(r=>(r.period_end||r.period_start||"")>=range.start&&(r.period_start||r.period_end||"")<=range.end)
      .map(r=>{
        const taken=String(r.taken_status||"").toUpperCase()==="SUDAH DIAMBIL";
        return {row:r,incoming:!taken,amount:setoranAmount(r),balance:null,inactive:false,taken};
      })
      .sort((a,b)=>String(b.row.period_end||b.row.period_start||"").localeCompare(String(a.row.period_end||a.row.period_start||""))||String(branchLabel(a.row)).localeCompare(String(branchLabel(b.row))));
  }

  function modal(){
    let root=document.getElementById("ak2WalletMutationModal");
    if(root) return root;
    root=document.createElement("div");
    root.id="ak2WalletMutationModal";
    root.className="ak2-mut-overlay";
    root.hidden=true;
    root.innerHTML=`
      <section class="ak2-mut-modal" role="dialog" aria-modal="true" aria-labelledby="ak2MutTitle">
        <header class="ak2-mut-head">
          <div>
            <div class="ak2-mut-kicker">RIWAYAT MUTASI · READ ONLY</div>
            <h2 id="ak2MutTitle">Mutasi</h2>
            <div id="ak2MutPeriod" class="ak2-mut-period"></div>
          </div>
          <div class="ak2-mut-head-right">
            <div class="ak2-mut-balance-label">SALDO SAAT INI</div>
            <strong id="ak2MutBalance">Rp0</strong>
            <button type="button" class="ak2-mut-close" aria-label="Tutup">×</button>
          </div>
        </header>
        <div class="ak2-mut-body">
          <div class="ak2-mut-table-wrap">
            <table class="ak2-mut-table">
              <thead><tr><th>Tanggal</th><th>Mutasi</th><th>Nominal</th><th>Dari / Ke</th><th>Keterangan</th><th>Saldo</th><th>Status</th></tr></thead>
              <tbody id="ak2MutBody"></tbody>
            </table>
          </div>
        </div>
      </section>`;
    document.body.appendChild(root);
    root.addEventListener("click",e=>{if(e.target===root||e.target.closest(".ak2-mut-close")) close();});
    return root;
  }

  function renderLedger(cfg,card){
    const rows=buildLedgerRows(cfg.wallet);
    const body=document.getElementById("ak2MutBody");
    if(!rows.length){body.innerHTML='<tr><td colspan="7" class="ak2-mut-empty">Belum ada mutasi pada periode aktif.</td></tr>';return;}
    body.innerHTML=rows.map(x=>{
      const r=x.row;
      const other=x.incoming?r.from_wallet:r.to_wallet;
      const route=`${x.incoming?"Dari":"Ke"} ${walletName(other)}`;
      const cls=x.inactive?" is-deleted":"";
      return `<tr class="${cls.trim()}">
        <td>${esc(fmt(r.tanggal))}</td>
        <td><span class="ak2-mut-kind ${x.incoming?"is-in":"is-out"}">${x.incoming?"MASUK":"KELUAR"}</span></td>
        <td class="ak2-mut-amount ${x.incoming?"is-in":"is-out"}">${esc(rp(x.amount))}</td>
        <td class="ak2-mut-route">${esc(route)}</td>
        <td>${esc(r.description||flow.categoryName?.(r.category)||"Transaksi")}</td>
        <td class="ak2-mut-running">${esc(rp(x.balance))}</td>
        <td><span class="ak2-mut-status">${esc(statusText(r))}</span></td>
      </tr>`;
    }).join("");
  }

  function renderPiutangSetoran(){
    const rows=buildPiutangSetoranRows();
    const body=document.getElementById("ak2MutBody");
    if(!rows.length){body.innerHTML='<tr><td colspan="7" class="ak2-mut-empty">Belum ada riwayat Piutang Setoran pada periode aktif.</td></tr>';return;}
    body.innerHTML=rows.map(x=>{
      const r=x.row;const branch=branchLabel(r);const taken=x.taken;
      return `<tr>
        <td>${esc(fmt(r.period_end||r.period_start))}</td>
        <td><span class="ak2-mut-kind ${taken?"is-out":"is-in"}">${taken?"KELUAR":"MASUK"}</span></td>
        <td class="ak2-mut-amount ${taken?"is-out":"is-in"}">${esc(rp(x.amount))}</td>
        <td class="ak2-mut-route">${esc(taken?"Ke Kas Besar":`Dari ${branch}`)}</td>
        <td>${esc(`Setoran ${periodLabel(r)}`)}</td>
        <td class="ak2-mut-running">—</td>
        <td><span class="ak2-mut-status">${esc(r.taken_status||"BELUM DIAMBIL")}</span></td>
      </tr>`;
    }).join("");
  }

  function open(cfg,card){
    const root=modal();
    document.getElementById("ak2MutTitle").textContent=cfg.title;
    document.getElementById("ak2MutBalance").textContent=card.textContent.trim()||"Rp0";
    const r=period();
    document.getElementById("ak2MutPeriod").textContent=`${fmt(r.start)} — ${fmt(r.end)}`;
    cfg.setoran?renderPiutangSetoran():renderLedger(cfg,card);
    root.hidden=false;
    document.body.classList.add("ak2-mut-open");
  }
  function close(){const root=document.getElementById("ak2WalletMutationModal");if(root)root.hidden=true;document.body.classList.remove("ak2-mut-open")}

  function bindCards(){
    Object.entries(CFG).forEach(([id,cfg])=>{
      const value=document.getElementById(id);if(!value)return;
      const card=value.closest(".ak2-card")||value.parentElement;if(!card||card.dataset.ak2MutationBound==="1")return;
      card.dataset.ak2MutationBound="1";card.classList.add("ak2-mut-card");card.setAttribute("tabindex","0");card.setAttribute("role","button");
      card.title=`Klik untuk lihat ${cfg.title}`;
      const activate=e=>{if(e.type==="keydown"&&!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();open(cfg,value)};
      card.addEventListener("click",activate);card.addEventListener("keydown",activate);
    });
  }

  function installStyle(){
    if(document.getElementById("ak2WalletMutationStyle"))return;
    const s=document.createElement("style");s.id="ak2WalletMutationStyle";
    s.textContent=`
      body.page-arus-kas .ak2-mut-card{cursor:pointer;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}
      body.page-arus-kas .ak2-mut-card:hover{transform:translateY(-1px);filter:brightness(1.05);box-shadow:0 9px 24px rgba(0,0,0,.22)}
      body.page-arus-kas .ak2-mut-card:focus-visible{outline:2px solid #d6aa43;outline-offset:2px}
      body.ak2-mut-open{overflow:hidden}
      .ak2-mut-overlay{position:fixed;inset:0;z-index:12000;background:rgba(3,7,11,.82);backdrop-filter:blur(5px);display:grid;place-items:center;padding:28px}
      .ak2-mut-overlay[hidden]{display:none!important}
      .ak2-mut-modal{width:min(1180px,96vw);max-height:86vh;background:linear-gradient(180deg,#14202b,#0b131a);border:1px solid rgba(205,157,62,.55);border-radius:18px;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04);color:#edf3f8}
      .ak2-mut-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px;border-bottom:1px solid #2b3a47;background:linear-gradient(100deg,rgba(98,69,21,.24),rgba(18,31,42,.25))}
      .ak2-mut-kicker{font-size:11px;letter-spacing:.16em;font-weight:900;color:#d9ad55}.ak2-mut-head h2{margin:4px 0 3px;font-size:25px;line-height:1}.ak2-mut-period{font-size:12px;color:#91a0ad}
      .ak2-mut-head-right{position:relative;text-align:right;padding-right:54px}.ak2-mut-balance-label{font-size:10px;letter-spacing:.12em;color:#8fa0ad;font-weight:850}.ak2-mut-head-right strong{display:block;margin-top:4px;font-size:27px;color:#ffd36b;letter-spacing:.01em}.ak2-mut-close{position:absolute;right:0;top:0;width:40px;height:40px;border-radius:11px;border:1px solid #344553;background:#16212b;color:#dfe8ee;font-size:25px;cursor:pointer}
      .ak2-mut-body{padding:0 0 8px}.ak2-mut-table-wrap{max-height:65vh;overflow:auto}.ak2-mut-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}.ak2-mut-table th{position:sticky;top:0;z-index:2;background:#203247;color:#eef5fb;border-bottom:1px solid #466078;padding:11px 12px;text-align:left;font-size:11px;letter-spacing:.07em;text-transform:uppercase}.ak2-mut-table td{padding:10px 12px;border-bottom:1px solid #243440;font-size:13px;vertical-align:middle;color:#dce5eb;overflow:hidden;text-overflow:ellipsis}.ak2-mut-table tbody tr:hover td{background:rgba(44,67,84,.20)}
      .ak2-mut-table th:nth-child(1){width:11%}.ak2-mut-table th:nth-child(2){width:9%}.ak2-mut-table th:nth-child(3){width:13%}.ak2-mut-table th:nth-child(4){width:15%}.ak2-mut-table th:nth-child(5){width:25%}.ak2-mut-table th:nth-child(6){width:13%}.ak2-mut-table th:nth-child(7){width:14%}
      .ak2-mut-kind{display:inline-grid;place-items:center;min-width:64px;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:950;letter-spacing:.06em}.ak2-mut-kind.is-in{background:#173b29;border:1px solid #3d7d57;color:#aef0c5}.ak2-mut-kind.is-out{background:#4a2020;border:1px solid #8a4141;color:#ffb1ad}.ak2-mut-amount{font-weight:950;font-size:14px!important}.ak2-mut-amount.is-in{color:#8ce5ae!important}.ak2-mut-amount.is-out{color:#ff9e99!important}.ak2-mut-route{font-weight:850;color:#f0f4f7!important}.ak2-mut-running{font-weight:900;color:#ffd36b!important}.ak2-mut-status{display:inline-block;padding:5px 8px;border-radius:999px;background:#1c2933;border:1px solid #394b58;color:#c8d4dc;font-size:10px;font-weight:850;white-space:nowrap}.ak2-mut-table tr.is-deleted td{text-decoration:line-through;text-decoration-color:#ff4949;text-decoration-thickness:2px;opacity:.68}.ak2-mut-empty{text-align:center!important;color:#8293a0!important;padding:30px!important}
      @media(max-width:900px){.ak2-mut-overlay{padding:10px}.ak2-mut-head{padding:17px}.ak2-mut-head h2{font-size:21px}.ak2-mut-head-right strong{font-size:21px}.ak2-mut-table{min-width:900px}}
    `;document.head.appendChild(s);
  }

  installStyle();bindCards();
  const cards=document.querySelector(".ak2-cards");if(cards)new MutationObserver(bindCards).observe(cards,{childList:true,subtree:true});
  document.addEventListener("erp:finance-ready",()=>setTimeout(bindCards,0));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
  window.ArusKasV2WalletMutationUI={open,close,bind:bindCards};
})();