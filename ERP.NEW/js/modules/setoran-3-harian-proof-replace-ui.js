/* ERP VAX — Setoran 3 Harian proof replace UX
   UI/proof layer only: staged preview + explicit SIMPAN FOTO.
   Tidak mengubah engine, rumus, query canonical, atau status flow. */
"use strict";
(function(){
  if(typeof SetoranDirectFlow==="undefined") return;
  const flow=SetoranDirectFlow;
  const pending=new Map();

  function esc(v){
    if(typeof flow.esc==="function") return flow.esc(v);
    return String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c]));
  }

  async function uploadReplacement(saved,file,kind){
    if(!saved?.id) throw new Error("Data setoran belum tersimpan.");
    const packed=await flow.compressProofImage(file);
    const path=`${saved.id}/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${packed.ext}`;
    const {error:u}=await db.storage.from(flow.PROOF_BUCKET).upload(path,packed.blob,{upsert:false,contentType:packed.contentType,cacheControl:"3600"});
    if(u) throw u;

    /* Pakai jalur INSERT yang sama dengan upload bukti normal.
       Tidak menghapus/mengubah record lama agar tidak terbentur policy delete/update SVP.
       UI hanya menampilkan record terbaru per jenis. */
    const proofRow={
      setoran_id:saved.id,
      request_no:saved.proof_request_no||1,
      storage_path:path,
      uploaded_by:flow.user.id,
      proof_kind:kind
    };
    const {data:inserted,error:i}=await db.from(flow.PROOF_TABLE).insert(proofRow).select("*").single();
    if(i){
      await db.storage.from(flow.PROOF_BUCKET).remove([path]).catch(()=>{});
      throw i;
    }

    const row=inserted||proofRow;
    saved.proof_path=row.storage_path;
    saved._proofLatest=row;
    saved._proofByKind=saved._proofByKind||{};
    saved._proofByKind[kind]=row;
    saved._proofCompression={originalBytes:packed.originalBytes,compressedBytes:packed.compressedBytes};
    return row;
  }

  function kindLabel(kind){
    const k=String(kind||"SETORAN").toUpperCase();
    if(k==="NON_CASH_DIFF") return "BUKTI UANG MASUK BRI MERCHANT";
    if(k==="OUTSIDE_CASHOUT") return "BUKTI BIAYA DI LUAR CASH OUT";
    return "BUKTI SETORAN";
  }

  function ensureReplaceInput(){
    let input=document.getElementById("s3proofReplaceFile");
    if(input) return input;
    input=document.createElement("input");
    input.type="file";
    input.accept="image/*";
    input.id="s3proofReplaceFile";
    input.hidden=true;
    document.body.appendChild(input);
    input.addEventListener("change",()=>{
      const meta=input._replaceMeta;
      const file=input.files?.[0];
      if(!meta||!file) return;
      const token=`${meta.branchId}:${meta.kind}`;
      pending.set(token,file);

      const current=document.querySelector(`[data-s3replace-current="${CSS.escape(token)}"]`);
      const preview=document.querySelector(`[data-s3replace-preview="${CSS.escape(token)}"]`);
      if(current) current.hidden=true;
      if(preview){
        const old=preview.dataset.objectUrl;
        if(old) URL.revokeObjectURL(old);
        const url=URL.createObjectURL(file);
        preview.dataset.objectUrl=url;
        preview.hidden=false;
        preview.innerHTML=`<img src="${url}" alt="Preview foto baru" style="max-width:100%;max-height:52vh;border-radius:12px;border:2px solid rgba(216,165,59,.72);object-fit:contain"><div style="margin-top:7px;color:#f4c85b;font-size:12px;font-weight:900">Foto baru siap disimpan</div>`;
        const save=document.querySelector(`[data-s3replace-save="${CSS.escape(token)}"]`);
        if(save) save.hidden=false;
      }
      input.value="";
      input._replaceMeta=null;
    });
    return input;
  }

  flow.openProof=async function(branchId){
    this.ensureProofModal();
    const saved=this.savedRows.get(this.key(branchId));
    if(!saved?.id) return this.fail("Belum ada bukti untuk cabang ini.");
    const {data,error}=await db.from(this.PROOF_TABLE).select("*").eq("setoran_id",saved.id).order("uploaded_at",{ascending:false}).limit(50);
    if(error) return this.fail(error.message);
    const all=data||[];
    if(!all.length){
      saved._proofLatest=null;saved.proof_path=null;this.renderTable();
      return this.fail("Belum ada bukti tersimpan untuk cabang ini.");
    }

    const latestByKind=new Map();
    for(const pr of all){
      const k=String(pr.proof_kind||"SETORAN").toUpperCase();
      if(!latestByKind.has(k)) latestByKind.set(k,pr);
    }

    const name=this.canonicalName(this.branches.find(b=>Number(b.id)===Number(branchId))?.nama_cabang||"");
    const body=document.getElementById("s3proofViewBody");
    document.getElementById("s3proofViewTitle").textContent=`BUKTI · ${name}`;
    body.innerHTML="Memuat bukti...";
    document.getElementById("s3proofViewModal").hidden=false;

    const valid=[];
    for(const pr of latestByKind.values()){
      const {data:signed,error:se}=await db.storage.from(this.PROOF_BUCKET).createSignedUrl(pr.storage_path,3600);
      if(se||!signed?.signedUrl) continue;
      valid.push({pr,url:signed.signedUrl});
    }
    document.getElementById("s3proofViewMeta").textContent=`${valid.length} bukti aktif`;
    if(!valid.length){
      body.innerHTML=`<div class="s3sheet-history-item"><p>Bukti tidak dapat ditampilkan. Silakan upload bukti baru.</p></div>`;
      return;
    }

    body.innerHTML=valid.map(({pr,url})=>{
      const kind=String(pr.proof_kind||"SETORAN").toUpperCase();
      const token=`${branchId}:${kind}`;
      return `<div style="margin:0 0 18px;padding:12px;border:1px solid rgba(216,165,59,.18);border-radius:13px;background:rgba(7,15,23,.42)">
        <div style="margin-bottom:8px;color:#f4c85b;font-size:11px;font-weight:900;letter-spacing:.06em">${esc(kindLabel(kind))}</div>
        <div data-s3replace-current="${esc(token)}">
          <img src="${url}" alt="Bukti setoran" style="max-width:100%;max-height:52vh;border-radius:12px;border:1px solid rgba(216,165,59,.28);object-fit:contain">
          <div style="margin-top:6px;color:#93a2b3;font-size:11px">${esc(kind)} · ${pr.uploaded_at?new Date(pr.uploaded_at).toLocaleString("id-ID"):""}</div>
        </div>
        <div data-s3replace-preview="${esc(token)}" hidden style="margin-top:0"></div>
        <div style="display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin-top:10px">
          <button type="button" data-s3replace-pick="${esc(token)}" data-branch-id="${branchId}" data-kind="${esc(kind)}" style="padding:8px 13px;border:1px solid rgba(216,165,59,.52);border-radius:8px;background:rgba(216,165,59,.12);color:#f4c85b;font-weight:800;cursor:pointer">GANTI FOTO</button>
          <button type="button" data-s3replace-save="${esc(token)}" data-branch-id="${branchId}" data-kind="${esc(kind)}" hidden style="padding:8px 14px;border:1px solid rgba(74,222,128,.58);border-radius:8px;background:rgba(22,101,52,.35);color:#86efac;font-weight:900;cursor:pointer">💾 SIMPAN FOTO</button>
        </div>
      </div>`;
    }).join("");

    body.querySelectorAll("[data-s3replace-pick]").forEach(btn=>btn.addEventListener("click",()=>{
      const input=ensureReplaceInput();
      input._replaceMeta={branchId:Number(btn.dataset.branchId),kind:String(btn.dataset.kind||"SETORAN").toUpperCase()};
      input.click();
    }));

    body.querySelectorAll("[data-s3replace-save]").forEach(btn=>btn.addEventListener("click",async()=>{
      const branch=Number(btn.dataset.branchId);
      const kind=String(btn.dataset.kind||"SETORAN").toUpperCase();
      const token=`${branch}:${kind}`;
      const file=pending.get(token);
      if(!file) return this.fail("Pilih foto baru terlebih dahulu.");
      const currentSaved=this.savedRows.get(this.key(branch));
      if(!currentSaved?.id) return this.fail("Data setoran belum tersimpan.");
      btn.disabled=true;
      btn.textContent="MENYIMPAN...";
      try{
        await uploadReplacement(currentSaved,file,kind);
        pending.delete(token);
        const preview=document.querySelector(`[data-s3replace-preview="${CSS.escape(token)}"]`);
        if(preview?.dataset?.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
        this.renderTable();
        const modal=document.getElementById("s3proofViewModal");
        if(modal) modal.hidden=true;
        this.ok("Foto bukti baru berhasil disimpan.");
      }catch(err){
        btn.disabled=false;
        btn.textContent="💾 SIMPAN FOTO";
        const old=document.querySelector(`[data-s3replace-current="${CSS.escape(token)}"]`);
        const preview=document.querySelector(`[data-s3replace-preview="${CSS.escape(token)}"]`);
        if(old) old.hidden=false;
        if(preview) preview.hidden=true;
        this.fail(err?.message||String(err));
      }
    }));
  };
})();
