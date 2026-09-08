/*
=========================================================
ERP VAX — Setoran 3 Harian Cash Out Card
READ ONLY / PRESENTATION ONLY.

Source of truth:
- daily_recap_source.cash_out
- daily_recap_source.keterangan_cash_out
Parser detail:
- CashOutDetail existing module

Tidak mengubah DailyDataEngine, SetoranMoneyEngine, formula,
data Cash Out, data Setoran, status, atau workflow.
=========================================================
*/
"use strict";

(function(){
  const flow = typeof SetoranDirectFlow !== "undefined" ? SetoranDirectFlow : null;
  if(!flow) return;

  let cacheKey="";
  let cacheData=null;
  let loading=null;
  let bound=false;

  const MONTH_ID=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const esc=v=>flow.esc?flow.esc(v):String(v??"");
  const money=v=>flow.rupiah(flow.money(v));
  const canonical=name=>flow.canonicalName?flow.canonicalName(name):String(name||"");

  function dateLabel(iso){
    const s=String(iso||"").slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s||"—";
    const [y,m,d]=s.split("-").map(Number);
    return `${String(d).padStart(2,"0")} ${MONTH_ID[(m||1)-1]} ${y}`;
  }

  function ensureStyle(){
    if(document.getElementById("s3CashOutCardStyle")) return;
    const style=document.createElement("style");
    style.id="s3CashOutCardStyle";
    style.textContent=`
      .s3sheet-totals.s3-has-cashout{grid-template-columns:repeat(7,minmax(0,1fr))}
      .s3sheet-total.is-cashout{cursor:pointer;outline:none;padding-right:38px!important;border-color:rgba(255,88,88,.46)!important;box-shadow:0 9px 22px rgba(0,0,0,.24),inset 3px 0 0 #ef4444!important}
      .s3sheet-total.is-cashout strong{color:#ff6464!important}
      .s3sheet-total.is-cashout:hover{transform:translateY(-2px);border-color:rgba(255,104,104,.82)!important;box-shadow:0 13px 28px rgba(0,0,0,.3),0 0 18px rgba(239,68,68,.14)!important}
      .s3sheet-total.is-cashout:focus-visible{box-shadow:0 0 0 2px rgba(255,255,255,.84),0 0 0 4px rgba(239,68,68,.62)!important}
      .s3-cashout-card-hint{position:absolute;right:9px;bottom:8px;width:22px;height:22px;display:grid;place-items:center;border:1px solid rgba(255,102,102,.55);border-radius:7px;background:rgba(239,68,68,.12);color:#ff6565;font-size:12px;font-weight:900}

      .s3-cashout-modal[hidden]{display:none!important}
      .s3-cashout-modal{position:fixed;inset:0;z-index:100020;display:flex;align-items:stretch;justify-content:stretch;padding:8px;box-sizing:border-box}
      .s3-cashout-backdrop{position:absolute;inset:0;background:rgba(2,5,9,.88);backdrop-filter:blur(6px)}
      .s3-cashout-panel{position:relative;z-index:1;width:100%;height:calc(100vh - 16px);display:flex;flex-direction:column;overflow:hidden;border:1.5px solid rgba(216,165,59,.5);border-radius:18px;background:linear-gradient(180deg,#0d1722 0%,#071018 100%);box-shadow:0 32px 82px rgba(0,0,0,.72),0 0 0 1px rgba(216,165,59,.07) inset;color:#f4f7fb}
      .s3-cashout-head{flex:0 0 auto;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 24px;border-bottom:1px solid rgba(216,165,59,.24);background:linear-gradient(180deg,#181d24,#0e151d)}
      .s3-cashout-head .eyebrow{display:block;margin-bottom:6px;color:#ff6666;font-size:11px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      .s3-cashout-head h3{margin:0 0 6px;font-size:27px;line-height:1.08;font-weight:900}
      .s3-cashout-head p{margin:0;color:#b9c6d2;font-size:15px;font-weight:800}
      .s3-cashout-close{flex:0 0 auto;width:46px;height:46px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#131e29;color:#fff;font-size:26px;cursor:pointer}

      .s3-cashout-summary{flex:0 0 auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:17px 18px;border-bottom:1px solid rgba(216,165,59,.17);background:rgba(7,15,23,.65)}
      .s3-cashout-summary>div{padding:17px 18px;border:1.5px solid rgba(216,165,59,.36);border-radius:13px;background:linear-gradient(160deg,rgba(18,29,41,.98),rgba(9,17,26,.98));box-shadow:0 10px 24px rgba(0,0,0,.22)}
      .s3-cashout-summary>div.is-red{border-color:rgba(239,68,68,.52)}
      .s3-cashout-summary span{display:block;color:#c3ced9;font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
      .s3-cashout-summary strong{display:block;margin-top:8px;font-size:31px;line-height:1.05;font-weight:900}
      .s3-cashout-summary .is-red strong{color:#ff6262}

      .s3-cashout-backrow{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(216,165,59,.18);background:#0b141e}
      .s3-cashout-backrow button{height:34px;padding:0 13px;border:1px solid rgba(216,165,59,.45);border-radius:8px;background:rgba(216,165,59,.08);color:#f2c451;font-size:11px;font-weight:900;cursor:pointer}
      .s3-cashout-backrow strong{font-size:15px;font-weight:900}.s3-cashout-backrow span{color:#b7c3cf;font-size:14px;font-weight:700}

      .s3-cashout-body{flex:1 1 auto;min-height:0;overflow:auto;background:#071018;scrollbar-color:#b4882d #09131c;scrollbar-width:thin}
      .s3-cashout-table{width:100%;min-width:920px;border-collapse:separate;border-spacing:0;font-size:16px}
      .s3-cashout-table th{position:sticky;top:0;z-index:2;padding:15px 16px;background:linear-gradient(180deg,#182431,#101a25);color:#f2bf3e;border-bottom:1.5px solid rgba(216,165,59,.5);font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;text-align:left}
      .s3-cashout-table th.num,.s3-cashout-table td.num{text-align:right}
      .s3-cashout-table td{padding:17px 16px;border-bottom:1px solid rgba(216,165,59,.16);background:rgba(7,16,24,.97);color:#f1f5f9;vertical-align:middle;font-weight:650;line-height:1.25}
      .s3-cashout-table tbody tr:nth-child(even) td{background:rgba(11,23,35,.97)}
      .s3-cashout-table tbody tr:hover td{background:rgba(28,37,49,.98)}
      .s3-cashout-table td:first-child{font-weight:900;color:#fff;border-left:3px solid rgba(216,165,59,.34)}
      .s3-cashout-table .amount{color:#ff6666;font-weight:900;font-size:17px;font-variant-numeric:tabular-nums}
      .s3-cashout-view{height:34px;padding:0 13px;border:1px solid rgba(216,165,59,.5);border-radius:8px;background:rgba(216,165,59,.1);color:#f5c95e;font-size:11px;font-weight:900;cursor:pointer}
      .s3-cashout-zero{color:#8190a0!important;font-weight:700!important}
      .s3-cashout-user{font-weight:800}.s3-cashout-user.is-rangga{color:#f0c45d;font-weight:900}
      .s3-cashout-empty{padding:42px;text-align:center;color:#aebdca;font-size:16px;font-weight:700}
      .s3-cashout-note{flex:0 0 auto;padding:12px 18px;border-top:1px solid rgba(216,165,59,.14);background:#09131c;color:#aebbc8;font-size:13px;line-height:1.5}
      .s3-cashout-body::-webkit-scrollbar{width:11px;height:11px}.s3-cashout-body::-webkit-scrollbar-track{background:#09131c}.s3-cashout-body::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#75591d,#c79a37);border:2px solid #09131c;border-radius:999px}
      @media(max-width:1250px){.s3sheet-totals.s3-has-cashout{grid-template-columns:repeat(4,minmax(0,1fr))}}
      @media(max-width:850px){.s3sheet-totals.s3-has-cashout{grid-template-columns:repeat(2,minmax(0,1fr))}.s3-cashout-summary{grid-template-columns:1fr;gap:8px;padding:10px}.s3-cashout-summary>div{padding:11px 12px}.s3-cashout-summary strong{font-size:24px}.s3-cashout-head{padding:14px}.s3-cashout-head h3{font-size:22px}.s3-cashout-table{font-size:14px}.s3-cashout-table td{padding:14px 12px}.s3-cashout-table .amount{font-size:15px}}
    `;
    document.head.appendChild(style);
  }

  function ensureCard(){
    ensureStyle();
    const totals=document.querySelector(".s3sheet-totals");
    if(!totals) return null;
    totals.classList.add("s3-has-cashout");
    let card=document.getElementById("s3totCashOut")?.closest(".s3sheet-total");
    if(card) return card;
    card=document.createElement("div");
    card.className="s3sheet-total is-cashout";
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");
    card.title="Klik untuk melihat rincian Cash Out periode aktif";
    card.innerHTML='<span>Total Cash Out</span><strong id="s3totCashOut">Rp0</strong><span class="s3-cashout-card-hint" aria-hidden="true">↗</span>';
    totals.appendChild(card);
    return card;
  }

  function period(){try{return flow.period();}catch(_e){return null;}}
  function currentKey(){const p=period();return p?`${p.start}|${p.end}`:"";}
  function branchMap(){const map=new Map();(flow.branches||[]).forEach(b=>map.set(Number(b.id),canonical(b.nama_cabang)));return map;}

  async function loadData(force=false){
    const p=period();
    if(!p) return null;
    const key=`${p.start}|${p.end}`;
    if(!force&&cacheData&&cacheKey===key) return cacheData;
    if(loading&&cacheKey===key) return loading;
    cacheKey=key;
    loading=(async()=>{
      const ids=(flow.branches||[]).map(b=>Number(b.id)).filter(Number.isFinite);
      if(!ids.length) return {period:p,total:0,transactions:0,branches:[]};
      const {data,error}=await db.from("daily_recap_source")
        .select("tanggal,cash_out,keterangan_cash_out,cabang_id")
        .in("cabang_id",ids)
        .gte("tanggal",p.start)
        .lte("tanggal",p.end)
        .order("tanggal",{ascending:true});
      if(error) throw error;

      const names=branchMap();
      const grouped=new Map();
      ids.forEach(id=>grouped.set(id,{id,name:names.get(id)||String(id),total:0,details:[]}));

      (data||[]).forEach(day=>{
        const id=Number(day.cabang_id);
        if(!grouped.has(id)) grouped.set(id,{id,name:names.get(id)||String(id),total:0,details:[]});
        const g=grouped.get(id);
        const dayTotal=flow.money(day.cash_out);
        g.total+=dayTotal;
        let expanded={rows:[]};
        if(typeof CashOutDetail!=="undefined"&&typeof CashOutDetail.expandDetailRows==="function"){
          expanded=CashOutDetail.expandDetailRows([{
            tanggal:String(day.tanggal||"").slice(0,10),
            cash_out:dayTotal,
            keterangan_cash_out:day.keterangan_cash_out||"",
            cabang_id:id
          }])||{rows:[]};
        }
        (Array.isArray(expanded.rows)?expanded.rows:[]).forEach(r=>g.details.push({...r,cabang_id:id}));
      });

      const branches=Array.from(grouped.values()).sort((a,b)=>{
        const ai=(flow.order||[]).indexOf(a.name),bi=(flow.order||[]).indexOf(b.name);
        return (ai<0?999:ai)-(bi<0?999:bi);
      });
      cacheData={
        period:p,
        total:branches.reduce((t,b)=>t+flow.money(b.total),0),
        transactions:branches.reduce((t,b)=>t+b.details.filter(r=>r.nominal!=null&&flow.money(r.nominal)!==0).length,0),
        branches
      };
      return cacheData;
    })();
    try{return await loading;}finally{loading=null;}
  }

  async function refreshCard(force=false){
    const card=ensureCard();
    if(!card) return;
    const value=document.getElementById("s3totCashOut");
    if(value) value.textContent="Memuat…";
    try{
      const data=await loadData(force);
      if(value) value.textContent=money(data?.total||0);
      card.dataset.ready="1";
    }catch(err){
      console.error("Setoran Cash Out card:",err);
      if(value) value.textContent="Gagal memuat";
      card.dataset.ready="0";
    }
  }

  function ensureModal(){
    let modal=document.getElementById("s3CashOutModal");
    if(modal) return modal;
    modal=document.createElement("div");
    modal.id="s3CashOutModal";modal.className="s3-cashout-modal";modal.hidden=true;
    modal.innerHTML=`
      <div class="s3-cashout-backdrop" data-s3-cashout-close></div>
      <section class="s3-cashout-panel" role="dialog" aria-modal="true" aria-labelledby="s3CashOutTitle">
        <div class="s3-cashout-head"><div><span class="eyebrow">FINANCE • MINUTES</span><h3 id="s3CashOutTitle">Rincian Cash Out</h3><p id="s3CashOutPeriod">—</p></div><button type="button" class="s3-cashout-close" data-s3-cashout-close aria-label="Tutup">×</button></div>
        <div class="s3-cashout-summary"><div class="is-red"><span>Total Cash Out</span><strong id="s3CashOutSum">Rp0</strong></div><div><span>Cabang Ada Cash Out</span><strong id="s3CashOutBranchCount">0</strong></div><div><span>Jumlah Transaksi</span><strong id="s3CashOutTxnCount">0</strong></div></div>
        <div id="s3CashOutBackRow" class="s3-cashout-backrow" hidden><button type="button" data-s3-cashout-back>← SEMUA CABANG</button><strong id="s3CashOutBranchTitle">—</strong><span id="s3CashOutBranchTotal">—</span></div>
        <div class="s3-cashout-body" id="s3CashOutBody"></div>
        <div class="s3-cashout-note">Read only · sumber data sama dengan modul Cash Out: <b>daily_recap_source.cash_out</b> + rincian <b>keterangan_cash_out</b>. Tidak ada data Setoran yang diubah.</div>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener("click",e=>{
      if(e.target.closest("[data-s3-cashout-close]")) closeModal();
      if(e.target.closest("[data-s3-cashout-back]")) renderBranchList();
      const view=e.target.closest("[data-s3-cashout-branch]");
      if(view) renderBranchDetail(Number(view.dataset.s3CashoutBranch));
    });
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden) closeModal();});
    return modal;
  }

  function renderBranchList(){
    const modal=ensureModal(),data=cacheData;
    if(!data) return;
    document.getElementById("s3CashOutBackRow").hidden=true;
    const body=document.getElementById("s3CashOutBody");
    const rows=data.branches||[];
    body.innerHTML=`<table class="s3-cashout-table"><thead><tr><th>Cabang</th><th class="num">Total Cash Out</th><th class="num">Jumlah Transaksi</th><th class="num">Rincian</th></tr></thead><tbody>${rows.map(b=>{
      const count=b.details.filter(r=>r.nominal!=null&&flow.money(r.nominal)!==0).length;
      return `<tr><td>${esc(b.name)}</td><td class="num amount ${b.total?"":"s3-cashout-zero"}">${money(b.total)}</td><td class="num ${count?"":"s3-cashout-zero"}">${count}</td><td class="num"><button type="button" class="s3-cashout-view" data-s3-cashout-branch="${b.id}">LIHAT</button></td></tr>`;
    }).join("")}</tbody></table>`;
    modal.querySelector(".s3-cashout-body")?.scrollTo?.({top:0});
  }

  function renderBranchDetail(id){
    const data=cacheData;
    if(!data) return;
    const branch=(data.branches||[]).find(b=>Number(b.id)===Number(id));
    if(!branch) return;
    const back=document.getElementById("s3CashOutBackRow");
    back.hidden=false;
    document.getElementById("s3CashOutBranchTitle").textContent=branch.name;
    document.getElementById("s3CashOutBranchTotal").textContent=`Total ${money(branch.total)}`;
    const body=document.getElementById("s3CashOutBody");
    const details=(branch.details||[]).filter(r=>r.nominal!=null||String(r.keterangan||"").trim());
    if(!details.length){body.innerHTML='<div class="s3-cashout-empty">Tidak ada rincian Cash Out pada cabang ini untuk periode aktif.</div>';return;}
    body.innerHTML=`<table class="s3-cashout-table"><thead><tr><th>Tanggal</th><th class="num">Nominal</th><th>Keterangan Cash Out</th><th>Kasir / User</th></tr></thead><tbody>${details.map(r=>{
      const user=String(r.kasir||"").trim();
      const isRangga=user.toLowerCase()==="rangga";
      return `<tr><td>${esc(dateLabel(r.tanggal))}</td><td class="num amount">${r.nominal==null?"—":money(r.nominal)}</td><td>${esc(r.keterangan||"—")}</td><td class="s3-cashout-user ${isRangga?"is-rangga":""}">${esc(user||"—")}</td></tr>`;
    }).join("")}</tbody></table>`;
    body.scrollTop=0;
  }

  async function openModal(){
    const modal=ensureModal();
    try{
      const data=await loadData(false),p=data.period;
      document.getElementById("s3CashOutPeriod").textContent=`${dateLabel(p.start)} — ${dateLabel(p.end)} · ${p.days} hari`;
      document.getElementById("s3CashOutSum").textContent=money(data.total);
      document.getElementById("s3CashOutBranchCount").textContent=String(data.branches.filter(b=>Math.abs(b.total)>.5).length);
      document.getElementById("s3CashOutTxnCount").textContent=String(data.transactions);
      renderBranchList();
      modal.hidden=false;
      document.body.style.overflow="hidden";
    }catch(err){
      console.error("Setoran Cash Out drilldown:",err);
      flow.fail?.("Rincian Cash Out gagal dimuat.");
    }
  }

  function closeModal(){const modal=document.getElementById("s3CashOutModal");if(modal)modal.hidden=true;document.body.style.overflow="";}
  function bindCard(){const card=ensureCard();if(!card||bound)return;bound=true;card.addEventListener("click",openModal);card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openModal();}});}
  function hookPeriodRefresh(){const base=flow.renderTotals?.bind(flow);if(!base||flow.__cashOutCardTotalsHook)return;flow.__cashOutCardTotalsHook=true;flow.renderTotals=function(){const result=base(...arguments);const key=currentKey();setTimeout(()=>refreshCard(key!==cacheKey),0);return result;};}
  function boot(){ensureCard();bindCard();hookPeriodRefresh();refreshCard(true);}

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();