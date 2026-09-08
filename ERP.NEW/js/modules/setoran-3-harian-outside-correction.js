/* VAX ERP — Setoran 3 Harian: correction workflow ONLY for Biaya di luar Cashout.
   Additive workflow. Does not alter canonical money engines/formulas. */
"use strict";
(function(){
  if(typeof SetoranDirectFlow==="undefined") return;
  const flow=SetoranDirectFlow;
  let busy=false;
  const role=()=>String(flow.role||"").toLowerCase();
  const isOwner=()=>role()==="owner";
  const isSvp=()=>role()==="svp";
  const statusOf=s=>String(s?.outside_correction_status||"NONE").toUpperCase();

  function style(){
    if(document.getElementById("s3OutsideCorrectionStyle")) return;
    const el=document.createElement("style");
    el.id="s3OutsideCorrectionStyle";
    el.textContent=`
      .s3sheet-table th[data-s3-correction-head]{min-width:102px;text-align:center;color:#ffd34f}
      .s3-correction-cell{min-width:102px;text-align:center;vertical-align:middle}
      .s3-corr-empty{color:#5f6d79;font-weight:800}
      .s3-corr-alert{border:0!important;background:transparent!important;color:#ffd34f!important;padding:0!important;margin:0!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;border-radius:0!important;font-size:25px;font-weight:1000;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;text-shadow:0 0 7px rgba(255,211,79,.55);box-shadow:none!important;animation:s3CorrBlink .5s steps(2,end) infinite}
      .s3-corr-alert:hover{transform:scale(1.12);color:#ffe46f!important;background:transparent!important}
      @keyframes s3CorrBlink{0%,100%{opacity:1;filter:drop-shadow(0 0 2px rgba(255,211,79,.55))}50%{opacity:.24;filter:drop-shadow(0 0 9px rgba(255,211,79,1))}}
      .s3-corr-state{display:inline-flex;align-items:center;justify-content:center;min-height:31px;padding:5px 8px;border-radius:8px;font-size:9px;font-weight:1000;line-height:1.1;text-align:center;max-width:96px}
      .s3-corr-state.req{border:1px solid rgba(248,113,113,.58);background:rgba(127,29,29,.20);color:#fca5a5}
      .s3-corr-state.sent{border:1px solid rgba(251,191,36,.60);background:rgba(120,53,15,.18);color:#fde68a}
      .s3-corr-state.svp{border:1px solid rgba(74,222,128,.55);background:rgba(22,101,52,.18);color:#bbf7d0;cursor:pointer}

      #s3OutsideCorrectionModal .s3sheet-modal-panel{width:min(820px,calc(100vw - 36px));max-height:90vh;padding:0;overflow:auto;border:1px solid rgba(216,165,59,.48);box-shadow:0 24px 80px rgba(0,0,0,.68),0 0 34px rgba(216,165,59,.10)}
      #s3OutsideCorrectionModal .s3sheet-modal-head{padding:20px 22px;border-bottom:1px solid rgba(216,165,59,.28);background:linear-gradient(180deg,rgba(216,165,59,.09),rgba(8,17,25,.25))}
      #s3OutsideCorrectionModal .s3sheet-modal-head strong{display:block;font-size:22px;letter-spacing:.03em;color:#fff}
      #s3OutsideCorrectionModal .s3sheet-modal-head small{display:block;margin-top:5px;font-size:13px;color:#d7b85c;font-weight:800}
      #s3OutsideCorrectionModal .s3-corr-body{padding:20px 22px 22px}
      #s3OutsideCorrectionModal .s3-corr-review{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
      #s3OutsideCorrectionModal .s3-corr-card{min-height:76px;padding:13px 14px;border:1px solid rgba(255,255,255,.10);border-radius:11px;background:#0b151f}
      #s3OutsideCorrectionModal .s3-corr-card span{display:block;margin-bottom:5px;font-size:10px;font-weight:900;letter-spacing:.09em;color:#8192a2;text-transform:uppercase}
      #s3OutsideCorrectionModal .s3-corr-card strong{display:block;font-size:17px;line-height:1.3;color:#f4f7fa;word-break:break-word}
      #s3OutsideCorrectionModal .s3-corr-card.is-money strong{font-size:23px;color:#ffcf55}
      #s3OutsideCorrectionModal .s3-corr-proof-btn{width:100%;min-height:44px;border:1px solid rgba(74,222,128,.42);border-radius:10px;background:rgba(22,101,52,.16);color:#86efac;font-weight:1000;font-size:13px;cursor:pointer}
      #s3OutsideCorrectionModal .s3-corr-label{display:block;margin:4px 0 8px;font-size:12px;font-weight:1000;letter-spacing:.07em;color:#ffd34f;text-transform:uppercase}
      #s3OutsideCorrectionModal textarea{width:100%;min-height:130px;resize:vertical;border:1px solid rgba(216,165,59,.34);border-radius:11px;background:#09131c;color:#f5f7fa;padding:13px 14px;font-size:15px;font-weight:700;line-height:1.45;box-sizing:border-box;outline:none}
      #s3OutsideCorrectionModal textarea:focus{border-color:#d8a53b;box-shadow:0 0 0 2px rgba(216,165,59,.12)}
      #s3OutsideCorrectionModal .s3-corr-hint{margin-top:8px;font-size:11px;color:#8797a6;line-height:1.4}
      #s3OutsideCorrectionModal .s3-corr-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
      #s3OutsideCorrectionModal .s3-corr-actions button{min-height:42px;padding:9px 16px;border-radius:9px;font-size:12px;font-weight:1000;cursor:pointer}
      #s3OutsideCorrectionModal [data-corr-send]{border:1px solid rgba(248,113,113,.62);background:linear-gradient(180deg,rgba(185,28,28,.45),rgba(127,29,29,.30));color:#fee2e2}
      #s3OutsideCorrectionModal [data-corr-send]:disabled{opacity:.42;cursor:not-allowed}
      #s3OutsideCorrectionModal [data-corr-cancel]{border:1px solid rgba(255,255,255,.13);background:#101923;color:#c1ccd5}
      @media(max-width:680px){#s3OutsideCorrectionModal .s3-corr-review{grid-template-columns:1fr}#s3OutsideCorrectionModal .s3sheet-modal-head strong{font-size:18px}}
      @media(prefers-reduced-motion:reduce){.s3-corr-alert{animation:none!important}}
    `;
    document.head.appendChild(el);
  }

  function ensureHeader(){
    const tr=document.querySelector(".s3sheet-table thead tr");
    if(!tr) return;
    let th=tr.querySelector("[data-s3-correction-head]");
    if(!th){
      th=document.createElement("th");
      th.setAttribute("data-s3-correction-head","1");
      th.textContent="KOREKSI";
    }
    const verifyHead=tr.querySelector("[data-s3-owner-verify-head]");
    const history=tr.lastElementChild;
    const anchor=verifyHead||history||null;
    if(th.parentElement!==tr || th.nextElementSibling!==anchor) tr.insertBefore(th,anchor);
  }

  function modal(){
    let m=document.getElementById("s3OutsideCorrectionModal");
    if(m) return m;
    m=document.createElement("div");
    m.className="s3sheet-modal";
    m.id="s3OutsideCorrectionModal";
    m.hidden=true;
    m.innerHTML=`
      <div class="s3sheet-modal-backdrop" data-corr-cancel></div>
      <div class="s3sheet-modal-panel">
        <div class="s3sheet-modal-head">
          <div><strong>REVIEW BIAYA DI LUAR CASHOUT</strong><small id="s3CorrMeta">—</small></div>
          <button type="button" data-corr-cancel>×</button>
        </div>
        <div class="s3-corr-body">
          <div class="s3-corr-review">
            <div class="s3-corr-card"><span>Cabang</span><strong id="s3CorrBranch">—</strong></div>
            <div class="s3-corr-card"><span>Periode</span><strong id="s3CorrPeriod">—</strong></div>
            <div class="s3-corr-card is-money"><span>Biaya di luar Cashout</span><strong id="s3CorrAmount">Rp0</strong></div>
            <div class="s3-corr-card"><span>Keterangan SVP</span><strong id="s3CorrSvpNote">—</strong></div>
            <div class="s3-corr-card"><span>Status Setoran</span><strong id="s3CorrTaken">—</strong></div>
            <div class="s3-corr-card"><span>Bukti</span><button type="button" class="s3-corr-proof-btn" data-corr-proof>LIHAT FOTO BUKTI</button></div>
          </div>
          <label class="s3-corr-label" for="s3CorrNote">Catatan Koreksi Owner</label>
          <textarea id="s3CorrNote" placeholder="Contoh: Nominal biaya tidak sesuai bukti. Mohon cek kembali nominal, keterangan, dan foto bukti biaya."></textarea>
          <div class="s3-corr-hint" id="s3CorrHint">Koreksi ini hanya berlaku untuk Biaya di luar Cashout dan tidak mengubah data lain.</div>
          <div class="s3-corr-actions"><button type="button" data-corr-cancel>BATAL</button><button type="button" data-corr-send>KIRIM KOREKSI KE SVP</button></div>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelectorAll("[data-corr-cancel]").forEach(x=>x.addEventListener("click",()=>{m.hidden=true;m.dataset.branchId="";}));
    m.querySelector("[data-corr-send]").addEventListener("click",requestCorrection);
    m.querySelector("[data-corr-proof]").addEventListener("click",()=>{
      const id=Number(m.dataset.branchId||0);
      if(id) flow.openProof?.(id);
    });
    return m;
  }

  function branchName(id){
    return flow.canonicalName(flow.branches.find(b=>Number(b.id)===Number(id))?.nama_cabang||"");
  }

  function renderCorrectionCells(){
    ensureHeader();
    document.querySelectorAll("#s3sheetBody tr[data-cabang-id]").forEach(tr=>{
      tr.querySelector("[data-s3-correction-cell]")?.remove();
      tr.querySelector("[data-outside-correction-ui]")?.remove();

      const id=Number(tr.dataset.cabangId);
      const saved=flow.savedRows.get(flow.key(id))||{};
      const outside=Number(saved.outside_cashout_cost||0);
      const st=statusOf(saved);
      const td=document.createElement("td");
      td.className="s3-correction-cell";
      td.setAttribute("data-s3-correction-cell","1");

      if(outside<=0 || !saved.id){
        td.innerHTML='<span class="s3-corr-empty">—</span>';
      }else if(st==="REQUESTED"){
        if(isSvp()){
          const btn=document.createElement("button");
          btn.type="button";btn.className="s3-corr-state svp";btn.dataset.corrResubmit=String(id);btn.textContent="↥ KIRIM ULANG";btn.title=saved.outside_correction_note||"Koreksi diminta Owner";td.appendChild(btn);
        }else{
          const state=document.createElement("span");state.className="s3-corr-state req";state.textContent="⚠ PERLU KOREKSI";state.title=saved.outside_correction_note||"Menunggu koreksi SVP";td.appendChild(state);
        }
      }else if(st==="RESUBMITTED"){
        const state=document.createElement("span");state.className="s3-corr-state sent";state.textContent="✓ DIKIRIM ULANG";state.title="SVP sudah mengirim ulang koreksi. Siap direview Owner.";td.appendChild(state);
      }else if(isOwner()){
        const alert=document.createElement("button");
        alert.type="button";alert.className="s3-corr-alert";alert.dataset.corrRequest=String(id);alert.textContent="⚠";alert.title="Ada Biaya di luar Cashout. Klik untuk review.";td.appendChild(alert);
      }else{
        const state=document.createElement("span");state.className="s3-corr-state sent";state.textContent="BIAYA TERCATAT";td.appendChild(state);
      }

      const verifyCell=tr.querySelector("[data-s3-owner-verify-cell]");
      const historyCell=tr.lastElementChild;
      tr.insertBefore(td,verifyCell||historyCell||null);

      const verify=tr.querySelector('[data-owner-verify]');
      if(verify && st==="REQUESTED"){
        verify.disabled=true;
        verify.title="Menunggu SVP mengirim ulang koreksi Biaya di luar Cashout.";
      }
    });
  }

  function decorate(){style();modal();renderCorrectionCells();}

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){const r=baseRender(...arguments);decorate();return r;};

  function openRequest(id){
    if(!isOwner()||busy) return;
    const saved=flow.savedRows.get(flow.key(id))||{};
    if(Number(saved.outside_cashout_cost||0)<=0) return flow.fail?.("Tidak ada Biaya di luar Cashout untuk direview.");
    if(saved.owner_verified===true) return flow.fail?.("Setoran sudah Owner Verified.");

    const m=modal();
    const branch=branchName(id);
    const period=flow.period?`${flow.period.start} — ${flow.period.end}`:"—";
    const note=saved.outside_cashout_note||saved.non_cash_note||saved.spv_note||"—";
    m.dataset.branchId=String(id);
    document.getElementById("s3CorrMeta").textContent=`${branch} · REVIEW OWNER`;
    document.getElementById("s3CorrBranch").textContent=branch||"—";
    document.getElementById("s3CorrPeriod").textContent=period;
    document.getElementById("s3CorrAmount").textContent=flow.rupiah(saved.outside_cashout_cost||0);
    document.getElementById("s3CorrSvpNote").textContent=note;
    document.getElementById("s3CorrTaken").textContent=saved.taken_status||"BELUM DIAMBIL";
    document.getElementById("s3CorrNote").value=saved.outside_correction_note||"";

    const send=m.querySelector("[data-corr-send]");
    const ready=saved.taken_status==="SUDAH DIAMBIL" && !saved.owner_verified;
    send.disabled=!ready;
    document.getElementById("s3CorrHint").textContent=ready
      ? "Jika biaya/bukti tidak sesuai, isi catatan lalu kirim koreksi ke SVP."
      : "Review dapat dilihat sekarang, tetapi Minta Koreksi aktif setelah SVP menandai Sudah Diambil dan sebelum Owner Verified.";
    m.hidden=false;
    if(ready) setTimeout(()=>document.getElementById("s3CorrNote")?.focus(),40);
  }

  async function requestCorrection(){
    if(busy||!isOwner()) return;
    const m=modal();
    const id=Number(m.dataset.branchId||0);
    const note=String(document.getElementById("s3CorrNote").value||"").trim();
    if(!id) return;
    if(!note) return flow.fail?.("Catatan koreksi Owner wajib diisi.");
    const saved=flow.savedRows.get(flow.key(id));
    if(!saved?.id) return flow.fail?.("Data setoran belum tersimpan.");
    busy=true;flow.busy?.(true);
    try{
      const {data,error}=await db.rpc("vax_request_outside_cashout_correction",{p_setoran_id:saved.id,p_note:note});
      if(error) throw error;
      flow.savedRows.set(flow.key(id),Array.isArray(data)?data[0]:data);
      m.hidden=true;m.dataset.branchId="";
      flow.ok?.("Koreksi Biaya di luar Cashout dikirim ke SVP.");
    }catch(err){flow.fail?.(err?.message||String(err));}
    finally{busy=false;flow.busy?.(false);flow.renderTable();flow.renderTotals?.();}
  }

  async function resubmit(id){
    if(busy||!isSvp()) return;
    const tr=document.querySelector(`#s3sheetBody tr[data-cabang-id="${id}"]`);
    if(!tr) return;
    try{
      await flow.saveRow(tr,{taken:null,quiet:true});
      const saved=flow.savedRows.get(flow.key(id));
      if(!saved?.id) throw new Error("Data setoran belum tersimpan.");
      const proofs=await flow.getProofRows(saved.id);
      if(!proofs.some(p=>String(p.proof_kind||"").toUpperCase()==="OUTSIDE_CASHOUT")) throw new Error("Foto bukti biaya di luar Cashout wajib dilampirkan sebelum Kirim Ulang.");
      busy=true;flow.busy?.(true);
      const {data,error}=await db.rpc("vax_resubmit_outside_cashout_correction",{p_setoran_id:saved.id});
      if(error) throw error;
      flow.savedRows.set(flow.key(id),Array.isArray(data)?data[0]:data);
      flow.ok?.("Koreksi Biaya di luar Cashout sudah dikirim ulang ke Owner.");
    }catch(err){flow.fail?.(err?.message||String(err));}
    finally{busy=false;flow.busy?.(false);flow.renderTable();flow.renderTotals?.();}
  }

  document.addEventListener("click",e=>{
    const req=e.target.closest?.("[data-corr-request]");
    if(req){openRequest(Number(req.dataset.corrRequest));return;}
    const res=e.target.closest?.("[data-corr-resubmit]");
    if(res){resubmit(Number(res.dataset.corrResubmit));}
  });

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",decorate,{once:true}); else decorate();
})();
