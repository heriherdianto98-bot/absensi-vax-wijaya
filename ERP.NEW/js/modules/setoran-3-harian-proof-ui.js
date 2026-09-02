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

  flow.compressProofImage=async function(file){
    if(!file||!String(file.type||"").startsWith("image/")) throw new Error("Bukti harus berupa file gambar.");
    const MAX_SIDE=1600;
    const TARGET_BYTES=350*1024;
    let bitmap=null, img=null, objectUrl="";
    try{
      if(typeof createImageBitmap==="function") bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
    }catch(_e){bitmap=null;}
    if(!bitmap){
      objectUrl=URL.createObjectURL(file);
      img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error("Gambar bukti tidak dapat dibaca."));el.src=objectUrl;});
    }
    const sw=bitmap?.width||img?.naturalWidth||img?.width||0;
    const sh=bitmap?.height||img?.naturalHeight||img?.height||0;
    if(!sw||!sh) throw new Error("Ukuran gambar bukti tidak valid.");
    const scale=Math.min(1,MAX_SIDE/Math.max(sw,sh));
    const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d",{alpha:false});
    ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap||img,0,0,w,h);
    const toBlob=(type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
    let quality=.76;
    let blob=await toBlob("image/webp",quality);
    let type="image/webp",ext="webp";
    if(!blob){type="image/jpeg";ext="jpg";blob=await toBlob(type,.78);}
    while(blob&&blob.size>TARGET_BYTES&&quality>.46){quality-=.08;const next=await toBlob(type,quality);if(!next)break;blob=next;}
    if(!blob) throw new Error("Gagal mengompres bukti foto.");
    try{bitmap?.close?.();}catch(_e){}
    if(objectUrl) URL.revokeObjectURL(objectUrl);
    return {blob,ext,contentType:type,originalBytes:file.size||0,compressedBytes:blob.size};
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
      else{saved._proofLatest=null;saved.proof_path=null;}
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
    const packed=await this.compressProofImage(file);
    const path=`${saved.id}/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${packed.ext}`;
    const {error:u}=await db.storage.from(this.PROOF_BUCKET).upload(path,packed.blob,{upsert:false,contentType:packed.contentType,cacheControl:"3600"});
    if(u) throw u;
    const proofRow={setoran_id:saved.id,request_no:saved.proof_request_no||1,storage_path:path,uploaded_by:this.user.id,proof_kind:kind};
    const {data:inserted,error:i}=await db.from(this.PROOF_TABLE).insert(proofRow).select("*").single();
    if(i){await db.storage.from(this.PROOF_BUCKET).remove([path]).catch(()=>{});throw i;}
    saved.proof_path=path;
    saved._proofLatest=inserted||proofRow;
    saved._proofCompression={originalBytes:packed.originalBytes,compressedBytes:packed.compressedBytes};
    return inserted||proofRow;
  };

  flow.deleteProofs=async function(saved){
    if(!saved?.id) return {deleted:0};
    const {data,error}=await db.from(this.PROOF_TABLE).select("id,storage_path").eq("setoran_id",saved.id);
    if(error) throw error;
    const proofs=data||[];
    const paths=proofs.map(x=>x.storage_path).filter(Boolean);
    if(paths.length){
      const {error:se}=await db.storage.from(this.PROOF_BUCKET).remove(paths);
      if(se) throw se;
    }
    if(proofs.length){
      const {error:de}=await db.from(this.PROOF_TABLE).delete().eq("setoran_id",saved.id);
      if(de) throw de;
    }
    const {data:clean,error:ue}=await db.from(this.TABLE).update({proof_path:null,proof_uploaded_by:null,proof_uploaded_at:null,updated_by:this.user.id,updated_at:new Date().toISOString()}).eq("id",saved.id).select("*").single();
    if(ue) throw ue;
    clean._proofLatest=null;clean.proof_path=null;
    this.savedRows.set(this.key(clean.cabang_id),clean);
    return {deleted:proofs.length};
  };

  const baseSaveRow=flow.saveRow.bind(flow);
  flow.saveRow=async function(tr,options={}){
    const id=Number(tr?.dataset?.cabangId||0);
    const wasTaken=id?this.model(id).taken:false;
    const result=await baseSaveRow(tr,options);
    if(options?.taken===false&&wasTaken&&id){
      const saved=this.savedRows.get(this.key(id));
      const r=await this.deleteProofs(saved);
      this.pendingFiles.delete(this.key(id));
      this.renderTable();this.renderTotals();
      if(!options.quiet) this.ok(r.deleted?"Status kembali Belum Diambil. Bukti foto lama sudah dihapus.":"Status kembali Belum Diambil.");
    }
    return result;
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
        const saved=this.savedRows.get(this.key(tr.dataset.cabangId));
        const c=saved?._proofCompression;
        const info=c&&c.originalBytes?` (${Math.round(c.originalBytes/1024)} KB → ${Math.round(c.compressedBytes/1024)} KB)`:"";
        this.ok(`Bukti foto tersimpan dan dikompres${info}.`);
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
    if(!proofs.length){
      saved._proofLatest=null;saved.proof_path=null;
      this.renderTable();
      return this.fail("Belum ada bukti tersimpan untuk cabang ini.");
    }
    const name=this.canonicalName(this.branches.find(b=>Number(b.id)===Number(branchId))?.nama_cabang||"");
    const body=document.getElementById("s3proofViewBody");
    document.getElementById("s3proofViewTitle").textContent=`BUKTI · ${name}`;
    body.innerHTML="Memuat bukti...";
    document.getElementById("s3proofViewModal").hidden=false;

    const valid=[];
    for(const pr of proofs){
      const {data:signed,error:se}=await db.storage.from(this.PROOF_BUCKET).createSignedUrl(pr.storage_path,3600);
      if(se||!signed?.signedUrl) continue;
      const ok=await new Promise(resolve=>{
        const test=new Image();
        const timer=setTimeout(()=>resolve(false),8000);
        test.onload=()=>{clearTimeout(timer);resolve(true)};
        test.onerror=()=>{clearTimeout(timer);resolve(false)};
        test.src=signed.signedUrl;
      });
      if(ok) valid.push({pr,url:signed.signedUrl});
    }

    if(!valid.length){
      saved._proofLatest=null;saved.proof_path=null;
      document.getElementById("s3proofViewMeta").textContent="0 bukti aktif";
      body.innerHTML=`<div class="s3sheet-history-item"><p>File bukti lama sudah tidak ada di Storage. Silakan upload bukti baru.</p></div>`;
      this.renderTable();
      return;
    }

    document.getElementById("s3proofViewMeta").textContent=`${valid.length} bukti tersimpan`;
    body.innerHTML=valid.map(({pr,url})=>`<div style="margin:0 0 14px"><img src="${url}" alt="Bukti setoran" style="max-width:100%;max-height:62vh;border-radius:12px;border:1px solid rgba(216,165,59,.28);object-fit:contain"><div style="margin-top:6px;color:#93a2b3;font-size:11px">${this.esc(pr.proof_kind||"BUKTI")} · ${pr.uploaded_at?new Date(pr.uploaded_at).toLocaleString("id-ID"):""}</div></div>`).join("");
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
