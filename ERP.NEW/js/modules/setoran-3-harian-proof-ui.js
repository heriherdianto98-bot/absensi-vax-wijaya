/* ERP VAX — Setoran 3 Harian proof persistence + viewer */
"use strict";
(function(){
  if(typeof SetoranDirectFlow === "undefined") return;
  const flow=SetoranDirectFlow;

  flow.ensureProofModal=function(){
    if(document.getElementById("s3proofViewModal")) return;
    const wrap=document.createElement("div");
    wrap.innerHTML=`<div class="s3sheet-modal" id="s3proofViewModal" hidden>
      <div class="s3sheet-modal-backdrop" data-s3proof-close></div>
      <div class="s3sheet-modal-panel" style="width:min(920px,calc(100% - 30px));max-height:88vh;">
        <div class="s3sheet-modal-head"><div><strong id="s3proofViewTitle">BUKTI</strong><small id="s3proofViewMeta">—</small></div><button type="button" data-s3proof-close>×</button></div>
        <div id="s3proofViewBody" style="padding-top:12px;text-align:center"></div>
      </div>
    </div>`;
    document.body.appendChild(wrap.firstElementChild);
    document.querySelectorAll("[data-s3proof-close]").forEach(x=>x.addEventListener("click",()=>{document.getElementById("s3proofViewModal").hidden=true;}));
  };

  const baseLoadSavedRows=flow.loadSavedRows.bind(flow);
  flow.loadSavedRows=async function(p){
    await baseLoadSavedRows(p);
    const rows=[...this.savedRows.values()].filter(x=>x?.id);
    if(!rows.length) return;
    const ids=rows.map(x=>x.id);
    const {data,error}=await db.from(this.PROOF_TABLE).select("id,setoran_id,storage_path,proof_kind,uploaded_at,uploaded_by").in("setoran_id",ids).order("uploaded_at",{ascending:false});
    if(error) throw error;
    const latest=new Map();
    for(const pr of data||[]) if(!latest.has(String(pr.setoran_id))) latest.set(String(pr.setoran_id),pr);
    for(const saved of rows){
      const pr=latest.get(String(saved.id));
      if(pr){saved._proofLatest=pr;saved.proof_path=pr.storage_path;}
    }
  };

  const previousRowHtml=flow.rowHtml.bind(flow);
  flow.rowHtml=function(branch){
    let html=previousRowHtml(branch);
    const saved=this.savedRows.get(this.key(branch.id))||{};
    if(saved._proofLatest||saved.proof_path){
      html=html.replace(/class="s3sheet-proof-btn([^\"]*)" data-action="proof"([^>]*)>[^<]*<\/button>/,
        (m,cls,rest)=>`class="s3sheet-proof-btn${cls} has-proof" data-action="proof"${rest}>Lihat</button>`);
    }
    return html;
  };

  flow.uploadProof=async function(saved,file,kind){
    if(!saved?.id) throw new Error("Data setoran belum tersimpan.");
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`${saved.id}/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
    const {error:u}=await db.storage.from(this.PROOF_BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(u) throw u;
    const proofRow={setoran_id:saved.id,request_no:saved.proof_request_no||1,storage_path:path,uploaded_by:this.user.id,proof_kind:kind};
    const {data:inserted,error:i}=await db.from(this.PROOF_TABLE).insert(proofRow).select("*").single();
    if(i){await db.storage.from(this.PROOF_BUCKET).remove([path]).catch(()=>{});throw i;}
    saved.proof_path=path;
    saved._proofLatest=inserted||proofRow;
    return inserted||proofRow;
  };

  const baseOnChange=flow.onTableChange.bind(flow);
  flow.onTableChange=async function(e){
    const tr=e.target.closest("tr[data-cabang-id]");
    if(e.target.matches?.('[data-file-input]')){
      if(!tr||!this.isSvp()) return;
      const file=e.target.files?.[0];
      if(!file) return;
      this.pendingFiles.set(this.key(tr.dataset.cabangId),file);
      try{
        await this.saveRow(tr,{taken:null,quiet:true});
        this.ok("Bukti foto tersimpan.");
      }catch(err){
        this.pendingFiles.delete(this.key(tr.dataset.cabangId));
        this.fail(err?.message||String(err));
      }
      return;
    }
    return baseOnChange(e);
  };

  flow.openProof=async function(branchId){
    this.ensureProofModal();
    const saved=this.savedRows.get(this.key(branchId));
    if(!saved?.id) return this.fail("Belum ada bukti untuk cabang ini.");
    const {data,error}=await db.from(this.PROOF_TABLE).select("*").eq("setoran_id",saved.id).order("uploaded_at",{ascending:false}).limit(20);
    if(error) return this.fail(error.message);
    const proofs=data||[];
    if(!proofs.length) return this.fail("Belum ada bukti tersimpan untuk cabang ini.");
    const name=this.canonicalName(this.branches.find(b=>Number(b.id)===Number(branchId))?.nama_cabang||"");
    const body=document.getElementById("s3proofViewBody");
    document.getElementById("s3proofViewTitle").textContent=`BUKTI · ${name}`;
    document.getElementById("s3proofViewMeta").textContent=`${proofs.length} bukti tersimpan`;
    body.innerHTML="Memuat bukti...";
    document.getElementById("s3proofViewModal").hidden=false;
    const cards=[];
    for(const pr of proofs){
      const {data:signed,error:se}=await db.storage.from(this.PROOF_BUCKET).createSignedUrl(pr.storage_path,3600);
      if(se){cards.push(`<div class="s3sheet-history-item"><p>Gagal membuka bukti: ${this.esc(se.message)}</p></div>`);continue;}
      cards.push(`<div style="margin:0 0 14px"><img src="${signed.signedUrl}" alt="Bukti setoran" style="max-width:100%;max-height:62vh;border-radius:12px;border:1px solid rgba(216,165,59,.28);object-fit:contain"><div style="margin-top:6px;color:#93a2b3;font-size:11px">${this.esc(pr.proof_kind||"BUKTI")} · ${pr.uploaded_at?new Date(pr.uploaded_at).toLocaleString("id-ID"):""}</div></div>`);
    }
    body.innerHTML=cards.join("");
  };

  const baseOnClick=flow.onTableClick.bind(flow);
  flow.onTableClick=async function(e){
    const tr=e.target.closest("tr[data-cabang-id]");
    const action=e.target.closest("[data-action]")?.dataset?.action;
    if(action==="proof"&&tr){
      const saved=this.savedRows.get(this.key(tr.dataset.cabangId))||{};
      if(saved._proofLatest||saved.proof_path) return this.openProof(Number(tr.dataset.cabangId));
      tr.querySelector("[data-file-input]")?.click();
      return;
    }
    return baseOnClick(e);
  };
})();
