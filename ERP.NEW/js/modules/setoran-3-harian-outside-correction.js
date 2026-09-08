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
    const el=document.createElement("style"); el.id="s3OutsideCorrectionStyle";
    el.textContent=`
      .s3-outside-corr{display:flex;flex-direction:column;align-items:stretch;gap:5px;margin-top:6px;min-width:126px}
      .s3-outside-corr-badge{display:inline-flex;justify-content:center;align-items:center;min-height:25px;padding:4px 7px;border-radius:7px;font-size:9px;font-weight:900;letter-spacing:.25px;line-height:1.1;text-align:center}
      .s3-outside-corr-badge.req{border:1px solid rgba(248,113,113,.55);background:rgba(127,29,29,.20);color:#fca5a5}
      .s3-outside-corr-badge.sent{border:1px solid rgba(251,191,36,.55);background:rgba(120,53,15,.18);color:#fde68a}
      .s3-outside-corr-btn{min-height:27px;padding:4px 7px;border-radius:7px;font-size:9px;font-weight:900;cursor:pointer;white-space:normal;line-height:1.15}
      .s3-outside-corr-btn.owner{border:1px solid rgba(248,113,113,.48);background:rgba(127,29,29,.16);color:#fecaca}
      .s3-outside-corr-btn.svp{border:1px solid rgba(74,222,128,.48);background:rgba(22,101,52,.18);color:#bbf7d0}
      .s3-outside-corr-note{font-size:9px;line-height:1.25;color:#fca5a5;max-width:155px;white-space:normal;word-break:break-word}
      #s3OutsideCorrectionModal .s3sheet-modal-panel{width:min(560px,calc(100vw - 32px));padding:0;overflow:hidden}
      #s3OutsideCorrectionModal .s3-corr-body{padding:16px}
      #s3OutsideCorrectionModal textarea{width:100%;min-height:120px;resize:vertical;border:1px solid rgba(216,165,59,.28);border-radius:10px;background:#0b151f;color:#eef3f7;padding:11px 12px;font:inherit;box-sizing:border-box}
      #s3OutsideCorrectionModal .s3-corr-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:12px}
      #s3OutsideCorrectionModal .s3-corr-actions button{padding:8px 12px;border-radius:8px;font-weight:900;cursor:pointer}
      #s3OutsideCorrectionModal [data-corr-send]{border:1px solid rgba(248,113,113,.5);background:rgba(127,29,29,.22);color:#fecaca}
      #s3OutsideCorrectionModal [data-corr-cancel]{border:1px solid rgba(255,255,255,.12);background:#101923;color:#b9c5d0}
    `;
    document.head.appendChild(el);
  }

  function modal(){
    let m=document.getElementById("s3OutsideCorrectionModal");
    if(m) return m;
    m=document.createElement("div"); m.className="s3sheet-modal"; m.id="s3OutsideCorrectionModal"; m.hidden=true;
    m.innerHTML=`<div class="s3sheet-modal-backdrop" data-corr-cancel></div><div class="s3sheet-modal-panel"><div class="s3sheet-modal-head"><div><strong>MINTA KOREKSI BIAYA</strong><small id="s3CorrMeta">—</small></div><button type="button" data-corr-cancel>×</button></div><div class="s3-corr-body"><div style="font-size:12px;color:#9fb0bf;margin-bottom:8px">Catatan Owner untuk koreksi Biaya di luar Cashout</div><textarea id="s3CorrNote" placeholder="Contoh: Nominal tidak sesuai bukti. Mohon cek kembali dan ganti foto bukti biaya."></textarea><div class="s3-corr-actions"><button type="button" data-corr-cancel>BATAL</button><button type="button" data-corr-send>KIRIM KE SVP</button></div></div></div>`;
    document.body.appendChild(m);
    m.querySelectorAll("[data-corr-cancel]").forEach(x=>x.addEventListener("click",()=>{m.hidden=true;m.dataset.branchId="";}));
    m.querySelector("[data-corr-send]").addEventListener("click",requestCorrection);
    return m;
  }

  function proofHasOutside(saved){
    const by=saved?._proofByKind||{};
    return Boolean(by.OUTSIDE_CASHOUT);
  }

  function decorate(){
    style(); modal();
    document.querySelectorAll("#s3sheetBody tr[data-cabang-id]").forEach(tr=>{
      tr.querySelector("[data-outside-correction-ui]")?.remove();
      const id=Number(tr.dataset.cabangId);
      const saved=flow.savedRows.get(flow.key(id))||{};
      const outside=Number(saved.outside_cashout_cost||0);
      const st=statusOf(saved);
      const cell=tr.querySelector('[data-field="outside"]')?.closest("td");
      if(!cell||!saved.id||outside<=0) return;
      const box=document.createElement("div"); box.className="s3-outside-corr"; box.setAttribute("data-outside-correction-ui","1");

      if(st==="REQUESTED"){
        const badge=document.createElement("span"); badge.className="s3-outside-corr-badge req"; badge.textContent="⚠ PERLU KOREKSI BIAYA"; box.appendChild(badge);
        if(saved.outside_correction_note){const note=document.createElement("div");note.className="s3-outside-corr-note";note.textContent=`Owner: ${saved.outside_correction_note}`;box.appendChild(note);}
        if(isSvp()){
          const btn=document.createElement("button");btn.type="button";btn.className="s3-outside-corr-btn svp";btn.textContent="↥ KIRIM ULANG";btn.dataset.corrResubmit=String(id);box.appendChild(btn);
        }
      }else if(st==="RESUBMITTED"){
        const badge=document.createElement("span"); badge.className="s3-outside-corr-badge sent"; badge.textContent="↥ SUDAH DIKIRIM ULANG"; box.appendChild(badge);
      }else if(isOwner() && saved.taken_status==="SUDAH DIAMBIL" && saved.owner_verified!==true){
        const btn=document.createElement("button");btn.type="button";btn.className="s3-outside-corr-btn owner";btn.textContent="↩ MINTA KOREKSI";btn.dataset.corrRequest=String(id);box.appendChild(btn);
      }
      if(box.childNodes.length) cell.appendChild(box);

      const verify=tr.querySelector('[data-owner-verify]');
      if(verify && st==="REQUESTED"){
        verify.disabled=true;
        verify.title="Menunggu SVP mengirim ulang koreksi Biaya di luar Cashout.";
      }
    });
  }

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){const r=baseRender(...arguments);decorate();return r;};

  function openRequest(id){
    if(!isOwner()||busy) return;
    const saved=flow.savedRows.get(flow.key(id))||{};
    if(Number(saved.outside_cashout_cost||0)<=0) return flow.fail?.("Tidak ada Biaya di luar Cashout untuk dikoreksi.");
    if(saved.owner_verified===true) return flow.fail?.("Setoran sudah Owner Verified.");
    const m=modal();m.dataset.branchId=String(id);
    const branch=flow.canonicalName(flow.branches.find(b=>Number(b.id)===id)?.nama_cabang||"");
    document.getElementById("s3CorrMeta").textContent=`${branch} · ${flow.rupiah(saved.outside_cashout_cost)}`;
    document.getElementById("s3CorrNote").value=saved.outside_correction_note||"";
    m.hidden=false;document.getElementById("s3CorrNote").focus();
  }

  async function requestCorrection(){
    if(busy||!isOwner()) return;
    const m=modal(),id=Number(m.dataset.branchId||0),note=String(document.getElementById("s3CorrNote").value||"").trim();
    if(!id) return;
    if(!note) return flow.fail?.("Catatan koreksi Owner wajib diisi.");
    const saved=flow.savedRows.get(flow.key(id)); if(!saved?.id) return flow.fail?.("Data setoran belum tersimpan.");
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
      /* simpan draft terbaru dahulu memakai flow existing supaya nominal/keterangan tetap mengikuti aturan LOCK */
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
    const req=e.target.closest?.("[data-corr-request]"); if(req){openRequest(Number(req.dataset.corrRequest));return;}
    const res=e.target.closest?.("[data-corr-resubmit]"); if(res){resubmit(Number(res.dataset.corrResubmit));}
  });

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",decorate,{once:true}); else decorate();
})();
