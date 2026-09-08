/* VAX ERP — Setoran 3 Harian: correction workflow ONLY for Biaya di luar Cashout.
   Additive workflow. Does not alter canonical money engines/formulas. */
"use strict";
(function(){
  if(typeof SetoranDirectFlow==="undefined") return;
  const flow=SetoranDirectFlow;
  let busy=false;
  /* IMPORTANT: gunakan identity canonical halaman Setoran lebih dulu.
     OwnerAuth bisa stale dari shell/session sebelumnya (mis. sidebar masih OWNER,
     sementara flow/profile aktual adalah SPV). */
  const role=()=>String(flow.profile?.role||flow.role||window.OwnerAuth?.profile?.role||"").toLowerCase();
  const isOwner=()=>role()==="owner";
  const isSvp=()=>["svp","spv"].includes(role());
  const statusOf=s=>String(s?.outside_correction_status||"NONE").toUpperCase();

  function style(){
    if(document.getElementById("s3OutsideCorrectionStyle")) return;
    const el=document.createElement("style");
    el.id="s3OutsideCorrectionStyle";
    el.textContent=`
      .s3sheet-table th[data-s3-correction-head]{min-width:92px;text-align:center;color:#ffd34f}
      .s3-correction-cell{min-width:92px;text-align:center;vertical-align:middle}
      .s3-corr-empty{color:#5f6d79;font-weight:800}
      .s3-corr-gateway{width:30px;height:30px;border:1px solid rgba(255,211,79,.40);border-radius:8px;background:rgba(255,211,79,.08);color:#ffd34f;font-size:17px;font-weight:1000;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(255,211,79,.08)}
      .s3-corr-gateway:hover{background:rgba(255,211,79,.15);border-color:rgba(255,211,79,.72);transform:scale(1.05)}
      .s3-corr-gateway.is-requested{color:#ff8f8f;border-color:rgba(248,113,113,.58);background:rgba(127,29,29,.18);animation:s3CorrOwnerBlink .72s steps(2,end) infinite}
      .s3-corr-gateway.is-resubmitted{color:#86efac;border-color:rgba(74,222,128,.55);background:rgba(22,101,52,.14)}
      @keyframes s3CorrOwnerBlink{0%,100%{opacity:1;box-shadow:0 0 10px rgba(239,68,68,.34)}50%{opacity:.38;box-shadow:0 0 18px rgba(239,68,68,.82)}}
      .s3-corr-state{display:inline-flex;align-items:center;justify-content:center;min-height:31px;padding:5px 8px;border-radius:8px;font-size:9px;font-weight:1000;line-height:1.1;text-align:center;max-width:96px}
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
      #s3OutsideCorrectionModal .s3-corr-status.requested{color:#fca5a5}
      #s3OutsideCorrectionModal .s3-corr-status.resubmitted{color:#86efac}
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
      @media(prefers-reduced-motion:reduce){.s3-corr-gateway.is-requested{animation:none!important}}
    `;
    document.head.appendChild(el);
  }

  function ensureHeader(){
    const tr=document.querySelector(".s3sheet-table thead tr");
    if(!tr) return;
    let th=tr.querySelector("[data-s3-correction-head]");
    if(!th){th=document.createElement("th");th.dataset.s3CorrectionHead="1";th.textContent="KOREKSI";}
    const verifyHead=tr.querySelector("[data-s3-owner-verify-head]");
    const history=tr.lastElementChild;
    const anchor=verifyHead||history||null;
    if(th.parentElement!==tr||th.nextElementSibling!==anchor) tr.insertBefore(th,anchor);
  }

  function modal(){
    let m=document.getElementById("s3OutsideCorrectionModal");
    if(m) return m;
    m=document.createElement("div");
    m.className="s3sheet-modal";m.id="s3OutsideCorrectionModal";m.hidden=true;
    m.innerHTML=`
      <div class="s3sheet-modal-backdrop" data-corr-cancel></div>
      <div class="s3sheet-modal-panel">
        <div class="s3sheet-modal-head"><div><strong>REVIEW BIAYA DI LUAR CASHOUT</strong><small id="s3CorrMeta">—</small></div><button type="button" data-corr-cancel>×</button></div>
        <div class="s3-corr-body">
          <div class="s3-corr-review">
            <div class="s3-corr-card"><span>Cabang</span><strong id="s3CorrBranch">—</strong></div>
            <div class="s3-corr-card"><span>Periode</span><strong id="s3CorrPeriod">—</strong></div>
            <div class="s3-corr-card is-money"><span>Biaya di luar Cashout</span><strong id="s3CorrAmount">Rp0</strong></div>
            <div class="s3-corr-card"><span>Keterangan SVP</span><strong id="s3CorrSvpNote">—</strong></div>
            <div class="s3-corr-card"><span>Status Koreksi</span><strong id="s3CorrStatus" class="s3-corr-status">BELUM ADA KOREKSI</strong></div>
            <div class="s3-corr-card"><span>Bukti Biaya</span><button type="button" class="s3-corr-proof-btn" data-corr-proof>LIHAT FOTO BUKTI</button></div>
          </div>
          <label class="s3-corr-label" for="s3CorrNote">Catatan Koreksi Owner</label>
          <textarea id="s3CorrNote" placeholder="Tulis alasan koreksi untuk SVP..."></textarea>
          <div class="s3-corr-hint" id="s3CorrHint">Review rincian dan bukti biaya. Jika tidak sesuai, kirim koreksi ke SVP.</div>
          <div class="s3-corr-actions"><button type="button" data-corr-cancel>TUTUP</button><button type="button" data-corr-send>MINTA KOREKSI KE SVP</button></div>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelectorAll("[data-corr-cancel]").forEach(x=>x.addEventListener("click",()=>{m.hidden=true;m.dataset.branchId="";}));
    m.querySelector("[data-corr-send]").addEventListener("click",requestCorrection);
    m.querySelector("[data-corr-proof]").addEventListener("click",()=>{
      const id=Number(m.dataset.branchId||0);
      if(!id) return;
      if(typeof flow.openOutsideCashoutProof==="function") flow.openOutsideCashoutProof(id);
      else flow.openProof?.(id);
    });
    return m;
  }

  function branchName(id){return flow.canonicalName(flow.branches.find(b=>Number(b.id)===Number(id))?.nama_cabang||"");}

  function ownerGateway(td,id,saved,st){
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="s3-corr-gateway";
    btn.dataset.corrRequest=String(id);
    btn.textContent="⚠";
    if(st==="REQUESTED"){
      btn.classList.add("is-requested");
      btn.title="Koreksi sudah dikirim ke SVP. Klik untuk lihat rincian.";
    }else if(st==="RESUBMITTED"){
      btn.classList.add("is-resubmitted");
      btn.textContent="✓";
      btn.title="SVP sudah kirim ulang. Klik untuk review lagi.";
    }else{
      btn.title="Ada Biaya di luar Cashout. Klik untuk review.";
    }
    td.appendChild(btn);
  }

  function renderCorrectionCells(){
    ensureHeader();
    document.querySelectorAll("#s3sheetBody tr[data-cabang-id]").forEach(tr=>{
      tr.querySelector("[data-s3-correction-cell]")?.remove();
      const id=Number(tr.dataset.cabangId);
      const saved=flow.savedRows.get(flow.key(id))||{};
      const outside=Number(saved.outside_cashout_cost||0);
      const st=statusOf(saved);
      const td=document.createElement("td");td.className="s3-correction-cell";td.dataset.s3CorrectionCell="1";

      if(outside<=0||!saved.id){
        td.innerHTML='<span class="s3-corr-empty">—</span>';
      }else if(isOwner()){
        ownerGateway(td,id,saved,st);
      }else if(isSvp()&&st==="REQUESTED"){
        const btn=document.createElement("button");btn.type="button";btn.className="s3-corr-state svp";btn.dataset.corrResubmit=String(id);btn.textContent="↥ KIRIM ULANG";btn.title=saved.outside_correction_note||"Koreksi diminta Owner";td.appendChild(btn);
      }else if(st==="RESUBMITTED"){
        const state=document.createElement("span");state.className="s3-corr-state sent";state.textContent="✓ DIKIRIM ULANG";td.appendChild(state);
      }else{
        const state=document.createElement("span");state.className="s3-corr-state sent";state.textContent="BIAYA TERCATAT";td.appendChild(state);
      }

      const verifyCell=tr.querySelector("[data-s3-owner-verify-cell]");
      const historyCell=tr.lastElementChild;
      tr.insertBefore(td,verifyCell||historyCell||null);
      const verify=tr.querySelector('[data-owner-verify]');
      if(verify&&st==="REQUESTED"){
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
    const m=modal();
    const branch=branchName(id);
    const p=typeof flow.period==="function"?flow.period():null;
    const period=p?`${p.start} — ${p.end}`:"—";
    const st=statusOf(saved);
    m.dataset.branchId=String(id);
    document.getElementById("s3CorrMeta").textContent=`${branch} · REVIEW OWNER`;
    document.getElementById("s3CorrBranch").textContent=branch||"—";
    document.getElementById("s3CorrPeriod").textContent=period;
    document.getElementById("s3CorrAmount").textContent=flow.rupiah(saved.outside_cashout_cost||0);
    document.getElementById("s3CorrSvpNote").textContent=saved.outside_cashout_note||saved.non_cash_note||saved.spv_note||"—";
    const statusEl=document.getElementById("s3CorrStatus");
    statusEl.className="s3-corr-status";
    if(st==="REQUESTED"){
      statusEl.textContent="MENUNGGU KOREKSI SVP";statusEl.classList.add("requested");
    }else if(st==="RESUBMITTED"){
      statusEl.textContent="SVP SUDAH KIRIM ULANG";statusEl.classList.add("resubmitted");
    }else statusEl.textContent="BELUM ADA KOREKSI";
    document.getElementById("s3CorrNote").value=st==="REQUESTED"?(saved.outside_correction_note||""):"";

    const send=m.querySelector("[data-corr-send]");
    const canRequest=saved.taken_status==="SUDAH DIAMBIL"&&!saved.owner_verified&&st!=="REQUESTED";
    send.disabled=!canRequest;
    document.getElementById("s3CorrNote").disabled=st==="REQUESTED";
    document.getElementById("s3CorrHint").textContent=st==="REQUESTED"
      ? "Koreksi sudah dikirim. Menunggu SVP memperbaiki nominal, keterangan, dan foto bukti terbaru."
      : st==="RESUBMITTED"
        ? "SVP sudah mengirim ulang. Review kembali rincian dan foto. Jika masih salah, Owner dapat minta koreksi lagi."
        : "Review rincian dan bukti biaya. Jika tidak sesuai, tulis catatan lalu kirim koreksi ke SVP.";
    m.hidden=false;
    if(canRequest) setTimeout(()=>document.getElementById("s3CorrNote")?.focus(),40);
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
    if(saved.owner_verified===true) return flow.fail?.("Setoran sudah Owner Verified.");
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
    const saved=flow.savedRows.get(flow.key(id));
    if(!saved?.id) return;
    busy=true;flow.busy?.(true);
    try{
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
    const resend=e.target.closest?.("[data-corr-resubmit]");
    if(resend){resubmit(Number(resend.dataset.corrResubmit));}
  });

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",decorate,{once:true}); else decorate();
})();