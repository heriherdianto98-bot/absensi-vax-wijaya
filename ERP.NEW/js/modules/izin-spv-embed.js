/* VAX WIJAYA â€” Review Izin / Libur SPV Embed */
const IzinSpvEmbed=(()=>{
let booted=false,bound=false,rows=[],current=null,busy=false,placeTimer=null,activeJenis="ALL",galleryPaths=[],galleryIndex=0,viewerRole="spv",accAllowed=true,queueMode="inbox";
const $=id=>document.getElementById(id);
const esc=(v="")=>String(v??"").replace(/[&<>'"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[s]));
const fmtDate=v=>{if(!v)return"â€”";const d=new Date(`${v}T00:00:00`);return d.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})};
const fmtRange=(a,b)=>{const start=fmtDate(a);const end=fmtDate(b||a);return end!==start&&end!=="â€”"?`${start} â€“ ${end}`:start};
const fmtDateTime=v=>{if(!v)return"â€”";const d=new Date(v);return Number.isNaN(d.getTime())?"â€”":d.toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})};
function isReadOnly(){return viewerRole==="owner"&&queueMode!=="inbox"}
function decisionLabel(row){const st=String(row?.status||"").toUpperCase();if(st==="DITOLAK_SPV")return"Ditolak SPV";if(st==="DITOLAK_OWNER")return"Ditolak Owner";if(st==="IZIN"||st==="LIBUR"||st==="SAKIT")return`ACC â€” ${st}`;return st||"â€”"}
function statusLabel(row){if(isReadOnly())return decisionLabel(row);return viewerRole==="owner"?"Menunggu Owner":"Menunggu SPV"}
function ownerSelect(extra){return`id,created_at,karyawan_id,cabang_id,tanggal,tanggal_selesai,jenis,alasan,bukti_path,status,coverage_karyawan_id${extra?",spv_catatan,spv_reviewed_at,spv_user_id,owner_catatan,owner_reviewed_at":""},karyawan:karyawan_id(nama_karyawan,jabatan),cabang:cabang_id(nama_cabang)`}
function vibrate(ms=10){try{if(navigator.vibrate)navigator.vibrate(ms)}catch(_){}}
function normJenis(v){const k=String(v||"ALL").trim().toUpperCase();return k==="IZIN"||k==="LIBUR"||k==="SAKIT"?k:"ALL"}
function applicantIsSpv(row){return /(^|[^a-z])(spv|svp|supervisor)([^a-z]|$)/i.test(String(row?.karyawan?.jabatan||""))}
function accLabel(){return viewerRole==="owner"?"Approve":"ACC Pengajuan"}
function badgeClass(jenis){return jenis==="LIBUR"?"is-libur":jenis==="SAKIT"?"is-sakit":"is-izin"}
function setCardLabel(strongId,label){const el=$(strongId);const span=el?.previousElementSibling;if(span&&span.tagName==="SPAN")span.textContent=label}

async function resolveRole(){
    const{data:{session}}=await db.auth.getSession();
    if(!session)return"";
    const{data}=await db.from("profiles").select("role,aktif").eq("id",session.user.id).maybeSingle();
    if(!data||data.aktif===false)return"";
    return String(data.role||"").trim().toLowerCase();
}

function setModalMessage(text="",type=""){
    const el=$("izinSpvModalMessage");
    if(!el)return;
    el.textContent=text;
    el.className=`izin-spv-modal-message${type?" "+type:""}`;
}

function markOwnerCards(){
    const wait=$("izinSpvCountWaiting")?.closest(".izin-spv-summary-card");
    const done=$("izinSpvCountForwarded")?.closest(".izin-spv-summary-card");
    const reject=$("izinSpvCountRejected")?.closest(".izin-spv-summary-card");
    [wait,done,reject].forEach(el=>el&&el.classList.remove("is-queue-active"));
    if(viewerRole!=="owner")return;
    if(queueMode==="inbox"&&wait)wait.classList.add("is-queue-active");
    if(queueMode==="spv_done"&&done)done.classList.add("is-queue-active");
}

async function loadCounters(){
    if(viewerRole==="owner"){
        setCardLabel("izinSpvCountWaiting","Menunggu Owner");
        setCardLabel("izinSpvCountForwarded","Keputusan SPV");
        setCardLabel("izinSpvCountRejected","Ditolak Owner");
        const wait=await db.from("pengajuan_izin").select("id",{count:"exact",head:true}).eq("status","MENUNGGU_OWNER");
        const reject=await db.from("pengajuan_izin").select("id",{count:"exact",head:true}).eq("status","DITOLAK_OWNER");
        const spvReject=await db.from("pengajuan_izin").select("id",{count:"exact",head:true}).eq("status","DITOLAK_SPV");
        let spvAcc=0;
        const acc=await db.from("pengajuan_izin").select("id",{count:"exact",head:true}).in("status",["IZIN","LIBUR","SAKIT"]).not("spv_reviewed_at","is",null);
        if(!acc.error)spvAcc=acc.count||0;
        if($("izinSpvCountWaiting"))$("izinSpvCountWaiting").textContent=wait.count||0;
        if($("izinSpvCountRejected"))$("izinSpvCountRejected").textContent=reject.count||0;
        if($("izinSpvCountForwarded"))$("izinSpvCountForwarded").textContent=(spvReject.count||0)+spvAcc;
        markOwnerCards();
        return;
    }
    setCardLabel("izinSpvCountWaiting","Menunggu SPV");
    setCardLabel("izinSpvCountForwarded","Menunggu Owner");
    setCardLabel("izinSpvCountRejected","Ditolak SPV");
    const map={MENUNGGU_SPV:"izinSpvCountWaiting",MENUNGGU_OWNER:"izinSpvCountForwarded",DITOLAK_SPV:"izinSpvCountRejected"};
    await Promise.all(Object.entries(map).map(async([status,id])=>{
        const{count}=await db.from("pengajuan_izin").select("id",{count:"exact",head:true}).eq("status",status);
        const el=$(id);
        if(el)el.textContent=count||0;
    }));
}

function setListUi(mode){
    const loading=$("izinSpvLoading"),empty=$("izinSpvEmpty"),list=$("izinSpvList");
    if(loading)loading.hidden=mode!=="loading";
    if(empty)empty.hidden=mode!=="empty";
    if(list)list.hidden=mode!=="data";
}

async function queryInbox(){
    const status=viewerRole==="owner"?"MENUNGGU_OWNER":"MENUNGGU_SPV";
    let{data,error}=await db.from("pengajuan_izin")
        .select(ownerSelect(false))
        .eq("status",status)
        .order("created_at",{ascending:true});
    if(error && /tanggal_selesai|coverage_karyawan_id/i.test(error.message||"")){
        ({data,error}=await db.from("pengajuan_izin")
            .select("id,created_at,karyawan_id,cabang_id,tanggal,jenis,alasan,bukti_path,status,karyawan:karyawan_id(nama_karyawan,jabatan),cabang:cabang_id(nama_cabang)")
            .eq("status",status)
            .order("created_at",{ascending:true}));
    }
    return{data,error};
}

async function queryOwnerSpvDone(){
    const extra=ownerSelect(true);
    const rejected=await db.from("pengajuan_izin").select(extra).eq("status","DITOLAK_SPV").order("spv_reviewed_at",{ascending:false}).limit(80);
    if(rejected.error && /spv_catatan|spv_reviewed_at|spv_user_id|owner_catatan|owner_reviewed_at|tanggal_selesai|coverage_karyawan_id/i.test(rejected.error.message||"")){
        const fallback=await db.from("pengajuan_izin")
            .select("id,created_at,karyawan_id,cabang_id,tanggal,jenis,alasan,bukti_path,status,karyawan:karyawan_id(nama_karyawan,jabatan),cabang:cabang_id(nama_cabang)")
            .eq("status","DITOLAK_SPV")
            .order("created_at",{ascending:false})
            .limit(80);
        return fallback;
    }
    const acc=await db.from("pengajuan_izin").select(extra).in("status",["IZIN","LIBUR","SAKIT"]).not("spv_reviewed_at","is",null).order("spv_reviewed_at",{ascending:false}).limit(80);
    if(acc.error){
        return{data:rejected.data||[],error:null};
    }
    const merged=[...(acc.data||[]),...(rejected.data||[])].sort((a,b)=>{
        const ta=new Date(a.spv_reviewed_at||a.created_at||0).getTime();
        const tb=new Date(b.spv_reviewed_at||b.created_at||0).getTime();
        return tb-ta;
    });
    return{data:merged,error:null};
}

async function loadRows(){
    const list=$("izinSpvList");
    if(!list)return;
    setListUi("loading");
    list.innerHTML="";
    const res=viewerRole==="owner"&&queueMode==="spv_done"?await queryOwnerSpvDone():await queryInbox();
    if(res.error){
        setListUi("empty");
        const empty=$("izinSpvEmpty");
        if(empty)empty.textContent=`Gagal memuat pengajuan: ${res.error.message}`;
        return;
    }
    rows=res.data||[];
    render();
    await loadCounters();
}

function countsByJenis(){
    return{
        ALL:rows.length,
        IZIN:rows.filter(r=>String(r.jenis||"").toUpperCase()==="IZIN").length,
        LIBUR:rows.filter(r=>String(r.jenis||"").toUpperCase()==="LIBUR").length
    };
}

function stampFilterAttrs(){
    document.querySelectorAll(".izin-spv-filter-btn, [data-izin-kind]").forEach(btn=>{
        if(btn.getAttribute("data-izin-spv-filter"))return;
        btn.setAttribute("data-izin-spv-filter",normJenis(btn.getAttribute("data-izin-kind")||"ALL"));
    });
}

function buildQuickFilters(){
    stampFilterAttrs();
    let wrap=$("izinSpvQuickFilter");
    if(!wrap){
        wrap=document.createElement("div");
        wrap.id="izinSpvQuickFilter";
        wrap.className="izin-spv-quick-filter";
        wrap.setAttribute("role","group");
        wrap.setAttribute("aria-label","Filter jenis pengajuan");
        const toolbar=document.querySelector("#izinSpvEmbed .izin-spv-toolbar");
        if(toolbar)toolbar.appendChild(wrap);
        else return null;
    }
    if(wrap.querySelectorAll("[data-izin-spv-filter]").length===3){
        stampFilterAttrs();
        return wrap;
    }
    const c=countsByJenis();
    wrap.innerHTML=
        `<button type="button" class="izin-spv-filter-btn" data-izin-spv-filter="ALL">Semua <b>${c.ALL}</b></button>`+
        `<button type="button" class="izin-spv-filter-btn is-izin" data-izin-spv-filter="IZIN">Izin <b>${c.IZIN}</b></button>`+
        `<button type="button" class="izin-spv-filter-btn is-libur" data-izin-spv-filter="LIBUR">Libur <b>${c.LIBUR}</b></button>`;
    return wrap;
}

function updateFilterButtons(){
    const c=countsByJenis();
    document.querySelectorAll("[data-izin-spv-filter]").forEach(btn=>{
        const value=normJenis(btn.dataset.izinSpvFilter||"ALL");
        btn.classList.toggle("is-active",value===activeJenis);
        btn.setAttribute("aria-pressed",value===activeJenis?"true":"false");
        const badge=btn.querySelector("b");
        if(badge)badge.textContent=c[value]??0;
    });
}

function filteredRows(){
    const q=String(document.getElementById("izinSpvSearch")?.value||"").trim().toLowerCase();
    return rows.filter(r=>{
        const jenis=String(r.jenis||"").toUpperCase();
        if(activeJenis!=="ALL"&&jenis!==activeJenis)return false;
        if(!q)return true;
        return[
            r.karyawan?.nama_karyawan,
            r.karyawan?.jabatan,
            r.cabang?.nama_cabang,
            r.alasan,
            r.jenis
        ].join(" ").toLowerCase().includes(q);
    });
}

function render(){
    const list=$("izinSpvList"),empty=$("izinSpvEmpty");
    if(!list||!empty)return;
    buildQuickFilters();
    const data=filteredRows();
    empty.textContent=queueMode==="spv_done"
        ?(activeJenis==="IZIN"?"Tidak ada keputusan SPV untuk izin.":activeJenis==="LIBUR"?"Tidak ada keputusan SPV untuk libur.":"Belum ada keputusan final dari SPV.")
        :(activeJenis==="IZIN"?"Tidak ada pengajuan izin menunggu.":activeJenis==="LIBUR"?"Tidak ada pengajuan libur menunggu.":viewerRole==="owner"?"Tidak ada pengajuan menunggu Owner.":"Tidak ada pengajuan menunggu SPV.");
    setListUi(data.length?"data":"empty");
    list.innerHTML=data.map(r=>{
        const jenis=String(r.jenis||"IZIN").toUpperCase();
        const nama=esc(r.karyawan?.nama_karyawan||`Karyawan #${r.karyawan_id}`);
        const jabatan=esc(r.karyawan?.jabatan||"â€”");
        const cabang=esc(r.cabang?.nama_cabang||"â€”");
        const hasProof=!!r.bukti_path;
        const note=esc(r.spv_catatan||r.review_note||"");
        const decided=isReadOnly();
        const decision=decided?`<div class="izin-spv-decision"><small>Keputusan SPV</small><b>${esc(decisionLabel(r))}</b><small>Catatan SPV</small><p>${note||"â€”"}</p><small>Waktu keputusan</small><b>${esc(fmtDateTime(r.spv_reviewed_at||r.reviewed_at))}</b></div>`:"";
        return`<article class="izin-spv-request${decided?" is-readonly":""}"><div class="izin-spv-request-head"><div class="izin-spv-person"><h3>${nama}</h3><p>${jabatan} â€¢ ${cabang}</p></div><span class="izin-spv-badge ${badgeClass(jenis)}">${jenis}</span></div><div class="izin-spv-meta"><div><small>Tanggal</small><b>${fmtRange(r.tanggal,r.tanggal_selesai)}</b></div><div><small>Cabang</small><b>${cabang}</b></div><div><small>Status</small><b>${esc(statusLabel(r))}</b></div></div><div class="izin-spv-reason">${esc(r.alasan||"â€”")}</div>${decision}<div class="izin-spv-actions"><button type="button" class="izin-spv-proof" data-izin-proof="${esc(r.bukti_path||"")}" ${hasProof?"":"disabled"}>${hasProof?"Lihat Bukti":"Tidak Ada Bukti"}</button><button type="button" class="izin-spv-review" data-izin-review="${r.id}">${decided?"Lihat":"Review"}</button></div></article>`;
    }).join("");
    updateFilterButtons();
}

function parseProofPaths(raw){
    if(!raw)return[];
    if(Array.isArray(raw))return raw.map(v=>String(v||"").trim()).filter(Boolean);
    const s=String(raw).trim();
    if(!s)return[];
    if(s.startsWith("[")){
        try{
            const arr=JSON.parse(s);
            if(Array.isArray(arr))return arr.map(v=>String(v||"").trim()).filter(Boolean);
        }catch(_){}
    }
    return s.split(",").map(v=>v.trim()).filter(Boolean);
}

function ensureGallery(){
    if($("izinSpvGallery"))return;
    const box=document.createElement("div");
    box.id="izinSpvGallery";
    box.className="izin-spv-gallery";
    box.hidden=true;
    box.innerHTML=`<div class="izin-spv-gallery-backdrop" data-izin-spv-gallery-close></div><div class="izin-spv-gallery-frame" role="dialog" aria-modal="true" aria-label="Bukti Pengajuan Izin"><button type="button" class="izin-spv-gallery-close" data-izin-spv-gallery-close aria-label="Tutup">Ã—</button><p class="izin-spv-gallery-caption">Bukti Pengajuan Izin</p><img id="izinSpvGalleryImg" alt="Bukti pengajuan izin"><div id="izinSpvGalleryNav" class="izin-spv-gallery-nav" hidden><button type="button" data-izin-spv-gallery-prev aria-label="Sebelumnya">â€¹</button><span id="izinSpvGalleryCount"></span><button type="button" data-izin-spv-gallery-next aria-label="Berikutnya">â€º</button></div></div>`;
    document.body.appendChild(box);
}

function isGalleryOpen(){
    const box=$("izinSpvGallery");
    return!!(box&&!box.hidden);
}

function closeGallery(){
    const box=$("izinSpvGallery");
    if(!box||box.hidden)return;
    vibrate(8);
    box.hidden=true;
    const img=$("izinSpvGalleryImg");
    if(img){img.removeAttribute("src");img.alt="Bukti pengajuan izin"}
}

async function showGalleryImage(){
    const img=$("izinSpvGalleryImg");
    const box=$("izinSpvGallery");
    const nav=$("izinSpvGalleryNav");
    const count=$("izinSpvGalleryCount");
    if(!img||!box)return;
    const path=galleryPaths[galleryIndex];
    if(!path)return;
    img.removeAttribute("src");
    img.alt="Memuat buktiâ€¦";
    if(nav)nav.hidden=galleryPaths.length<2;
    if(count)count.textContent=`${galleryIndex+1} / ${galleryPaths.length}`;
    box.hidden=false;
    const{data,error}=await db.storage.from("izin-proofs").createSignedUrl(path,60);
    if(error||!data?.signedUrl){
        closeGallery();
        alert("Bukti tidak dapat dibuka.");
        return;
    }
    img.src=data.signedUrl;
    img.alt="Bukti pengajuan izin";
}

async function openProof(path){
    const paths=parseProofPaths(path);
    if(!paths.length)return;
    vibrate(12);
    ensureGallery();
    galleryPaths=paths;
    galleryIndex=0;
    await showGalleryImage();
}

function shiftGallery(step){
    if(galleryPaths.length<2)return;
    galleryIndex=(galleryIndex+step+galleryPaths.length)%galleryPaths.length;
    vibrate(8);
    showGalleryImage();
}

function ensureModalForm(){
    const card=document.querySelector("#izinSpvModal .izin-spv-modal-card");
    const title=$("izinSpvModalTitle");
    if(!card||!title)return;
    if(!$("izinSpvModalHead")){
        const head=document.createElement("div");
        head.id="izinSpvModalHead";
        head.className="izin-spv-modal-head";
        const badge=document.createElement("span");
        badge.id="izinSpvModalBadge";
        badge.className="izin-spv-badge is-izin";
        title.parentNode.insertBefore(head,title);
        head.appendChild(title);
        head.appendChild(badge);
    }
    if($("izinSpvModalBody"))return;
    const body=document.createElement("div");
    body.id="izinSpvModalBody";
    body.className="izin-spv-modal-body";
    body.innerHTML=`<h3 id="izinSpvModalNama" class="izin-spv-modal-nama"></h3><p id="izinSpvModalJabatan" class="izin-spv-modal-jabatan"></p><div class="izin-spv-modal-facts"><div><small>Cabang</small><b id="izinSpvModalCabang"></b></div><div><small>Tanggal</small><b id="izinSpvModalTanggal"></b></div></div><div class="izin-spv-modal-alasan"><small>Alasan pengajuan</small><p id="izinSpvModalAlasan"></p></div><div id="izinSpvDecisionBox" class="izin-spv-decision" hidden><small>Keputusan</small><b id="izinSpvDecisionStatus"></b><small>Catatan SPV</small><p id="izinSpvDecisionNote"></p><small>Waktu keputusan</small><b id="izinSpvDecisionAt"></b></div><p id="izinSpvCoverageWarn" class="izin-spv-coverage-warn" hidden></p><div id="izinSpvModalProofWrap" class="izin-spv-modal-proof" hidden><button type="button" id="izinSpvModalProof" class="izin-spv-proof" data-izin-proof="">Lihat Bukti</button></div>`;
    const meta=$("izinSpvModalMeta");
    if(meta){
        meta.hidden=true;
        meta.insertAdjacentElement("afterend",body);
    }else{
        const head=$("izinSpvModalHead")||title;
        head.insertAdjacentElement("afterend",body);
    }
}

function fillModal(row){
    ensureModalForm();
    const jenis=String(row.jenis||"IZIN").toUpperCase();
    const isLibur=jenis==="LIBUR";
    const nama=row.karyawan?.nama_karyawan||`Karyawan #${row.karyawan_id}`;
    const jabatan=row.karyawan?.jabatan||"â€”";
    const cabang=row.cabang?.nama_cabang||"â€”";
    const title=$("izinSpvModalTitle");
    const badge=$("izinSpvModalBadge");
    const card=document.querySelector("#izinSpvModal .izin-spv-modal-card");
    if(title)title.textContent=jenis==="LIBUR"?"Review Pengajuan LIBUR":jenis==="SAKIT"?"Review Pengajuan SAKIT":"Review Pengajuan IZIN";
    if(badge){
        badge.textContent=jenis;
        badge.className=`izin-spv-badge ${badgeClass(jenis)}`;
    }
    if(card){
        card.classList.toggle("is-libur",isLibur);
        card.classList.toggle("is-sakit",jenis==="SAKIT");
    }
    const readonly=isReadOnly();
    accAllowed=!readonly&&(viewerRole==="owner"||(!applicantIsSpv(row)&&String(row.status||"").toUpperCase()==="MENUNGGU_SPV"));
    const forward=$("izinSpvForward");
    const reject=$("izinSpvReject");
    const noteEl=$("izinSpvNote");
    const noteMeta=document.querySelector(".izin-spv-note-meta");
    if(forward){
        forward.hidden=!accAllowed;
        forward.textContent=accLabel();
    }
    if(reject)reject.hidden=readonly;
    if(noteEl)noteEl.hidden=readonly;
    if(noteMeta)noteMeta.hidden=readonly;
    const noteLab=document.querySelector('label[for="izinSpvNote"]');
    if(noteLab){
        noteLab.hidden=readonly;
        noteLab.innerHTML=viewerRole==="owner"?"Catatan Owner <b>*</b>":"Catatan SPV <b>*</b>";
    }
    const box=$("izinSpvDecisionBox");
    if(box){
        box.hidden=!readonly;
        if(readonly){
            if($("izinSpvDecisionStatus"))$("izinSpvDecisionStatus").textContent=decisionLabel(row);
            if($("izinSpvDecisionNote"))$("izinSpvDecisionNote").textContent=row.spv_catatan||row.review_note||"â€”";
            if($("izinSpvDecisionAt"))$("izinSpvDecisionAt").textContent=fmtDateTime(row.spv_reviewed_at||row.reviewed_at);
        }
    }
    const namaEl=$("izinSpvModalNama");
    const jabatanEl=$("izinSpvModalJabatan");
    const cabangEl=$("izinSpvModalCabang");
    const tanggalEl=$("izinSpvModalTanggal");
    const alasanEl=$("izinSpvModalAlasan");
    if(namaEl)namaEl.textContent=nama;
    if(jabatanEl)jabatanEl.textContent=jabatan;
    if(cabangEl)cabangEl.textContent=cabang;
    if(tanggalEl)tanggalEl.textContent=fmtRange(row.tanggal,row.tanggal_selesai);
    const cov=$("izinSpvCoverageWarn");
    if(cov){cov.hidden=true;cov.textContent="";}
    if(!readonly)refreshKasirCoverage(row);
    if(alasanEl)alasanEl.textContent=row.alasan||"â€”";
    const proofWrap=$("izinSpvModalProofWrap");
    const proofBtn=$("izinSpvModalProof");
    const showProof=!isLibur&&!!row.bukti_path;
    if(proofWrap)proofWrap.hidden=!showProof;
    if(proofBtn){
        proofBtn.disabled=!showProof;
        proofBtn.setAttribute("data-izin-proof",showProof?row.bukti_path:"");
    }
}

async function refreshKasirCoverage(row){
    const cov=$("izinSpvCoverageWarn");
    if(!row||String(row.jenis||"").toUpperCase()!=="LIBUR")return;
    if(!/kasir/i.test(String(row.karyawan?.jabatan||"")))return;
    try{
        const{data,error}=await db.rpc("check_kasir_coverage_pengajuan",{p_pengajuan_id:Number(row.id)});
        if(error||!data||data.needed===false)return;
        if(data.ok===false){
            if(cov){
                cov.hidden=false;
                cov.textContent=data.message||"Belum ada kasir pengganti/coverage untuk tanggal ini.";
            }
            accAllowed=false;
            setBusy(false);
            setModalMessage(data.message||"Belum ada kasir pengganti/coverage untuk tanggal ini.","is-error");
        }
    }catch(_e){}
}

function openReview(id){
    current=rows.find(r=>Number(r.id)===Number(id));
    if(!current)return;
    vibrate(12);
    fillModal(current);
    $("izinSpvNote").value="";
    $("izinSpvNoteCount").textContent="0/300";
    setModalMessage(isReadOnly()?"":(accAllowed?"":"Pengajuan SPV hanya dapat diputuskan Owner."),isReadOnly()||accAllowed?"":"is-error");
    setBusy(false);
    $("izinSpvModal").hidden=false;
    if(!isReadOnly())setTimeout(()=>$("izinSpvNote")?.focus(),40);
}

function closeModal(){
    if(busy)return;
    $("izinSpvModal").hidden=true;
    current=null;
    setModalMessage("");
    setBusy(false);
}

function setBusy(v,action=""){
    busy=!!v;
    const reject=$("izinSpvReject");
    const forward=$("izinSpvForward");
    if(reject){
        reject.hidden=isReadOnly();
        reject.disabled=busy||isReadOnly();
        reject.classList.toggle("is-busy",busy&&action==="TOLAK");
        reject.textContent=busy&&action==="TOLAK"?"Memprosesâ€¦":"Tolak";
    }
    if(forward){
        forward.disabled=busy||!accAllowed;
        forward.hidden=!accAllowed;
        const acting=busy&&action!=="TOLAK";
        forward.classList.toggle("is-busy",acting);
        forward.textContent=acting?"Memprosesâ€¦":accLabel();
    }
}

async function process(action){
    if(busy||!current||isReadOnly())return;
    const note=String($("izinSpvNote")?.value||"").trim();
    if(note.length<3){
        setModalMessage(viewerRole==="owner"?"Catatan Owner wajib minimal 3 karakter.":"Catatan SPV wajib minimal 3 karakter.","is-error");
        $("izinSpvNote")?.focus();
        return;
    }
    const isOwner=viewerRole==="owner";
    const act=action==="TOLAK"?(isOwner?"REJECT":"TOLAK"):(isOwner?"APPROVE":"ACC");
    if(!isOwner&&!accAllowed&&act!=="TOLAK"){
        setModalMessage("Pengajuan SPV hanya dapat diputuskan Owner.","is-error");
        return;
    }
    vibrate(act==="TOLAK"||act==="REJECT"?18:25);
    setBusy(true,act);
    setModalMessage("Menyimpan keputusan...");
    const rpcName=isOwner?"review_pengajuan_izin_owner":"review_pengajuan_izin_spv";
    const{error}=await db.rpc(rpcName,{p_pengajuan_id:Number(current.id),p_action:act,p_catatan:note});
    if(error){
        setModalMessage(error.message||"Gagal memproses pengajuan.","is-error");
        setBusy(false);
        return;
    }
    const jenis=String(current.jenis||"").toUpperCase();
    setModalMessage(act==="ACC"||act==="APPROVE"?`Pengajuan ditetapkan sebagai ${jenis}.`:isOwner?"Pengajuan ditolak Owner.":"Pengajuan ditolak SPV.","is-success");
    setTimeout(async()=>{
        $("izinSpvModal").hidden=true;
        current=null;
        setBusy(false);
        await loadRows();
    },650);
}

function eventEl(e){
    const t=e&&e.target;
    if(t&&typeof t.closest==="function")return t;
    return t&&t.parentElement?t.parentElement:null;
}

function onFilterClick(e){
    const el=eventEl(e);
    const btn=el&&el.closest?el.closest("[data-izin-spv-filter]"):null;
    if(!btn)return;
    e.preventDefault();
    e.stopPropagation();
    activeJenis=normJenis(btn.dataset.izinSpvFilter||"ALL");
    vibrate(8);
    render();
}

function onDocClick(e){
    if(e.target.closest("[data-izin-spv-filter]"))return;
    if(e.target.closest("[data-izin-spv-gallery-close]")){
        e.preventDefault();
        e.stopPropagation();
        closeGallery();
        return;
    }
    if(e.target.closest("[data-izin-spv-gallery-prev]")){
        e.preventDefault();
        shiftGallery(-1);
        return;
    }
    if(e.target.closest("[data-izin-spv-gallery-next]")){
        e.preventDefault();
        shiftGallery(1);
        return;
    }
    const proof=e.target.closest("[data-izin-proof]");
    if(proof){
        if(proof.disabled)return;
        e.preventDefault();
        openProof(proof.getAttribute("data-izin-proof"));
        return;
    }
    const review=e.target.closest("[data-izin-review]");
    if(review){
        e.preventDefault();
        openReview(review.getAttribute("data-izin-review"));
        return;
    }
    if(e.target.closest("[data-izin-spv-close]")){
        e.preventDefault();
        closeModal();
        return;
    }
    const card=e.target.closest(".izin-spv-summary-card");
    if(card&&viewerRole==="owner"&&$("izinSpvEmbed")?.contains(card)){
        e.preventDefault();
        const next=card.classList.contains("is-waiting")?"inbox":card.classList.contains("is-forwarded")?"spv_done":"";
        if(next){
            queueMode=next;
            vibrate(8);
            loadRows();
        }
        return;
    }
    if(e.target.closest("#izinSpvRefresh")){
        e.preventDefault();
        vibrate(10);
        loadRows();
        return;
    }
    if(e.target.closest("#izinSpvReject")){
        e.preventDefault();
        process("TOLAK");
        return;
    }
    if(e.target.closest("#izinSpvForward")){
        e.preventDefault();
        process("ACC");
        return;
    }
    if(e.target.closest("[data-absensi-mode]"))schedulePlace(120);
}

function onDocInput(e){
    if(e.target&&e.target.id==="izinSpvSearch"){render();return}
    if(e.target&&e.target.id==="izinSpvNote"){
        const counter=$("izinSpvNoteCount");
        if(counter)counter.textContent=`${e.target.value.length}/300`;
    }
}

function bindEvents(){
    if(bound)return;
    bound=true;
    document.addEventListener("click",onFilterClick,true);
    document.addEventListener("pointerdown",onFilterClick,true);
    document.addEventListener("click",onDocClick);
    document.addEventListener("input",onDocInput);
    document.addEventListener("keydown",e=>{
        if(e.key!=="Escape")return;
        if(isGalleryOpen()){
            e.preventDefault();
            e.stopPropagation();
            closeGallery();
            return;
        }
        if(!$("izinSpvModal")?.hidden)closeModal();
    });
    window.addEventListener("hashchange",()=>schedulePlace(120));
}

bindEvents();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",stampFilterAttrs);
else stampFilterAttrs();

function isStandaloneLaporan(){
    return Boolean($("absensiLaporanRoot")&&$("ablPage")&&!$("absensiDailyView"));
}

function monthlyIsVisible(){
    if(isStandaloneLaporan())return true;
    const host=$("absensiMonthlyHost");
    if(!host||host.hidden)return false;
    return getComputedStyle(host).display!=="none";
}

function findMonthlyRincianAnchor(){
    const mount=$("izinSpvMount");
    if(mount)return mount;
    const host=$("absensiMonthlyHost")||$("ablPage");
    if(!host)return null;
    const box=$("ablDetailBox");
    if(box&&host.contains(box))return box;
    const heading=[...host.querySelectorAll("h1,h2,h3,h4,h5")].find(el=>/pencarian cepat rincian/i.test(String(el.textContent||"")));
    if(!heading)return null;
    return heading.closest("section")||heading.closest("article")||heading.parentElement?.parentElement||heading.parentElement;
}

function placePanel(){
    const root=$("izinSpvEmbed");
    if(!root)return;
    if(monthlyIsVisible()){
        const mount=$("izinSpvMount");
        if(mount){
            if(root.parentElement!==mount)mount.appendChild(root);
            return;
        }
        const host=$("absensiMonthlyHost")||$("ablPage"),anchor=findMonthlyRincianAnchor();
        if(anchor&&anchor.parentElement){anchor.parentElement.insertBefore(root,anchor);return}
        if(host&&root.parentElement!==host)host.appendChild(root);
        return;
    }
    const daily=$("absensiDailyView"),kpi=daily?.querySelector(".absensi-kpi-grid");
    if(kpi&&kpi.parentElement){kpi.insertAdjacentElement("afterend",root);return}
    if(daily&&root.parentElement!==daily)daily.prepend(root);
}

function schedulePlace(delay=0){
    clearTimeout(placeTimer);
    placeTimer=setTimeout(placePanel,delay);
}

function watchLayout(){
    const host=$("absensiMonthlyHost")||$("absensiLaporanRoot")||$("ablPage");
    if(host){
        new MutationObserver(()=>schedulePlace(40)).observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden","class","style"]});
    }
    schedulePlace(0);
    setTimeout(()=>schedulePlace(200),200);
    setTimeout(()=>schedulePlace(700),700);
}

async function boot(){
    if(booted||typeof db==="undefined")return;
    const role=await resolveRole();
    if(!["spv","svp","owner"].includes(role))return;
    viewerRole=role==="owner"?"owner":"spv";
    queueMode="inbox";
    const root=$("izinSpvEmbed");
    if(!root)return;
    booted=true;
    root.hidden=false;
    root.classList.toggle("is-owner",viewerRole==="owner");
    if(viewerRole==="owner"){
        const kicker=root.querySelector(".izin-spv-kicker");
        const title=root.querySelector(".izin-spv-head h2");
        const sub=root.querySelector(".izin-spv-head p");
        if(kicker)kicker.textContent="INFORMASI / REVIEW OWNER";
        if(title)title.textContent="Review Izin / Libur";
        if(sub)sub.textContent="Antrean langsung ke Owner, plus hasil keputusan final SPV.";
        const modalKick=document.querySelector("#izinSpvModal .izin-spv-kicker");
        if(modalKick)modalKick.textContent="REVIEW OWNER";
    }
    ensureModalForm();
    ensureGallery();
    bindEvents();
    watchLayout();
    await loadRows();
    schedulePlace(80);
}

return{
    boot,
    reload:loadRows,
    get activeJenis(){return activeJenis}
};
})();

/* VAX-20260817-SPV-AUTO-REFRESH
   Setelah SPV ACC/Tolak berhasil, sinkronkan langsung
   Rincian + Matrix + card Absensi tanpa Ctrl+F5.
*/
(function installSpvAbsensiAutoRefresh(){
    if(window.__vaxSpvAbsensiAutoRefreshInstalled) return;
    window.__vaxSpvAbsensiAutoRefreshInstalled = true;

    const originalRpc = db.rpc.bind(db);

    db.rpc = function(fn, args, options){
        const result = originalRpc(fn, args, options);

        if(String(fn) !== "review_pengajuan_izin_spv"){
            return result;
        }

        const originalThen = result.then.bind(result);

        result.then = function(onFulfilled, onRejected){
            return originalThen(async function(response){
                if(!response?.error){
                    // Tunggu transaction DB benar-benar terlihat REST.
                    await new Promise(resolve => setTimeout(resolve, 180));

                    try{
                        if(
                            window.AbsensiLaporanBulanan &&
                            typeof window.AbsensiLaporanBulanan.loadAndRender === "function"
                        ){
                            await window.AbsensiLaporanBulanan.loadAndRender();
                        }
                    }catch(err){
                        console.warn("Auto refresh laporan absensi:", err);
                    }

                    try{
                        if(
                            window.AbsensiOwner &&
                            typeof window.AbsensiOwner.loadData === "function"
                        ){
                            await window.AbsensiOwner.loadData();
                        }else if(
                            window.AbsensiOwner &&
                            typeof window.AbsensiOwner.load === "function"
                        ){
                            await window.AbsensiOwner.load();
                        }
                    }catch(err){
                        console.warn("Auto refresh Absensi Owner:", err);
                    }

                    window.dispatchEvent(new CustomEvent("vax:absensi-data-changed", {
                        detail:{
                            source:"review_pengajuan_izin_spv",
                            at:Date.now()
                        }
                    }));
                }

                return typeof onFulfilled === "function"
                    ? onFulfilled(response)
                    : response;
            }, onRejected);
        };

        return result;
    };
})();

/* =========================================================
   VAX-20260817-OWNER-SPV-READONLY-PHOTO
   Owner melihat hasil keputusan SPV secara READ ONLY:
   - alasan karyawan
   - catatan SPV
   - reviewer
   - waktu review
   - foto bukti thumbnail + internal lightbox
   ========================================================= */
(function installOwnerSpvReadonlyPhotoAudit(){

    if(window.__vaxOwnerSpvReadonlyPhotoAuditInstalled) return;
    window.__vaxOwnerSpvReadonlyPhotoAuditInstalled = true;

    function roleAktif(){
        try{
            return String(
                window.OwnerAuth?.profile?.role ||
                localStorage.getItem("role") ||
                ""
            ).trim().toLowerCase();
        }catch(_e){
            return "";
        }
    }

    function isOwner(){
        return roleAktif() === "owner";
    }

    function esc(value){
        return String(value ?? "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");
    }

    function fmtDate(iso){
        if(!iso) return "—";

        const [y,m,d] = String(iso).slice(0,10).split("-");
        if(!y || !m || !d) return esc(iso);

        const bulan = [
            "Januari","Februari","Maret","April","Mei","Juni",
            "Juli","Agustus","September","Oktober","November","Desember"
        ];

        return `${Number(d)} ${bulan[Number(m)-1]} ${y}`;
    }

    function fmtRange(row){
        const start = fmtDate(row.tanggal);
        const endRaw = row.tanggal_selesai || row.tanggal;

        if(
            !endRaw ||
            String(endRaw).slice(0,10) === String(row.tanggal).slice(0,10)
        ){
            return start;
        }

        return `${start} – ${fmtDate(endRaw)}`;
    }

    function fmtDateTime(value){
        if(!value) return "—";

        try{
            return new Intl.DateTimeFormat("id-ID",{
                dateStyle:"medium",
                timeStyle:"short",
                timeZone:"Asia/Jakarta"
            }).format(new Date(value)) + " WIB";
        }catch(_e){
            return esc(value);
        }
    }

    function keputusan(row){
        const status = String(row.status || "").trim().toUpperCase();

        if(status === "DITOLAK_SPV"){
            return {
                text:"DITOLAK SPV",
                cls:"is-rejected"
            };
        }

        return {
            text:"DISETUJUI SPV",
            cls:"is-approved"
        };
    }

    async function getSignedUrl(path){
        const clean = String(path || "").trim();
        if(!clean) return null;

        const buckets = [
            "izin-proofs","izin-bukti","bukti-izin","pengajuan-izin","absensi-bukti"
        ];

        for(const bucket of buckets){
            try{
                const { data, error } = await db.storage
                    .from(bucket)
                    .createSignedUrl(clean, 900);

                if(!error && data?.signedUrl){
                    return data.signedUrl;
                }
            }catch(_e){}
        }

        return null;
    }

    function ensureLightbox(){
        let box = document.getElementById("ownerSpvPhotoLightbox");

        if(box) return box;

        box = document.createElement("div");
        box.id = "ownerSpvPhotoLightbox";
        box.className = "owner-spv-photo-lightbox";
        box.hidden = true;

        box.innerHTML = `
            <div class="owner-spv-photo-backdrop"></div>

            <div class="owner-spv-photo-dialog" role="dialog" aria-modal="true">
                <button
                    type="button"
                    class="owner-spv-photo-close"
                    aria-label="Tutup foto">×</button>

                <img
                    class="owner-spv-photo-large"
                    alt="Bukti pengajuan">
            </div>
        `;

        document.body.appendChild(box);

        function close(){
            box.hidden = true;

            const img = box.querySelector(".owner-spv-photo-large");
            if(img) img.removeAttribute("src");
        }

        box.querySelector(".owner-spv-photo-close")
            ?.addEventListener("click", close);

        box.querySelector(".owner-spv-photo-backdrop")
            ?.addEventListener("click", close);

        document.addEventListener("keydown", e => {
            if(e.key === "Escape" && !box.hidden){
                close();
            }
        });

        box.__open = function(url){
            const img = box.querySelector(".owner-spv-photo-large");
            if(!img) return;

            img.src = url;
            box.hidden = false;
        };

        return box;
    }

    async function loadLookup(rows){
        const karyawanIds = [...new Set(
            rows.map(x => Number(x.karyawan_id)).filter(Boolean)
        )];

        const spvIds = [...new Set(
            rows.map(x => String(x.spv_user_id || "")).filter(Boolean)
        )];

        const kMap = new Map();
        const cMap = new Map();
        const pMap = new Map();

        if(karyawanIds.length){
            const { data } = await db
                .from("karyawan")
                .select("id,nama_karyawan,jabatan,cabang_id")
                .in("id", karyawanIds);

            (data || []).forEach(x => {
                kMap.set(Number(x.id), x);
            });

            const cabangIds = [...new Set(
                (data || [])
                    .map(x => Number(x.cabang_id))
                    .filter(Boolean)
            )];

            if(cabangIds.length){
                const { data: cabang } = await db
                    .from("cabang")
                    .select("id,nama_cabang")
                    .in("id", cabangIds);

                (cabang || []).forEach(x => {
                    cMap.set(Number(x.id), x.nama_cabang);
                });
            }
        }

        if(spvIds.length){
            const { data } = await db
                .from("profiles")
                .select("id,nama")
                .in("id", spvIds);

            (data || []).forEach(x => {
                pMap.set(String(x.id), x.nama);
            });
        }

        return { kMap,cMap,pMap };
    }

    function ensureHost(){
        const root = document.getElementById("izinSpvEmbed");
        if(!root) return null;

        let section = document.getElementById("ownerSpvReadonlyAudit");

        if(section) return section;

        section = document.createElement("section");
        section.id = "ownerSpvReadonlyAudit";
        section.className = "owner-spv-audit";

        section.innerHTML = `
            <div class="owner-spv-audit-head">
                <div>
                    <span class="izin-spv-kicker">
                        HASIL REVIEW SPV · READ ONLY
                    </span>

                    <h3>Riwayat Keputusan SPV</h3>

                    <p>
                        Owner dapat melihat hasil keputusan,
                        catatan reviewer, dan bukti pengajuan.
                    </p>
                </div>

                <button
                    type="button"
                    id="ownerSpvAuditRefresh"
                    class="izin-spv-refresh"
                    title="Refresh hasil review SPV"
                    aria-label="Refresh hasil review SPV">?</button>
            </div>

            <div
                id="ownerSpvAuditList"
                class="owner-spv-audit-list">

                <div class="owner-spv-audit-empty">
                    Memuat hasil keputusan SPV...
                </div>
            </div>
        `;

        const toolbar = root.querySelector(".izin-spv-toolbar");
        const summary = root.querySelector(".izin-spv-summary");

        if(toolbar){
            toolbar.insertAdjacentElement("afterend", section);
        }else if(summary){
            summary.insertAdjacentElement("afterend", section);
        }else{
            root.appendChild(section);
        }

        section
            .querySelector("#ownerSpvAuditRefresh")
            ?.addEventListener("click", load);

        return section;
    }

    async function load(){
        if(!isOwner()) return;

        const section = ensureHost();
        if(!section) return;

        const host = section.querySelector("#ownerSpvAuditList");
        if(!host) return;

        host.innerHTML = `
            <div class="owner-spv-audit-empty">
                Memuat hasil keputusan SPV...
            </div>
        `;

        const { data, error } = await db
            .from("pengajuan_izin")
            .select(`
                id,
                karyawan_id,
                cabang_id,
                tanggal,
                tanggal_selesai,
                jenis,
                alasan,
                bukti_path,
                status,
                spv_user_id,
                spv_catatan,
                spv_reviewed_at
            `)
            .not("spv_reviewed_at","is",null)
            .order("spv_reviewed_at",{ ascending:false })
            .limit(50);

        if(error){
            console.error("Owner SPV audit:", error);

            host.innerHTML = `
                <div class="owner-spv-audit-empty is-error">
                    Gagal memuat hasil review SPV.
                </div>
            `;

            return;
        }

        const rows = data || [];

        if(!rows.length){
            host.innerHTML = `
                <div class="owner-spv-audit-empty">
                    Belum ada keputusan SPV.
                </div>
            `;
            return;
        }

        const { kMap,cMap,pMap } = await loadLookup(rows);

        const photoUrls = new Map();

        for(const row of rows){
            if(row.bukti_path){
                photoUrls.set(
                    row.id,
                    await getSignedUrl(row.bukti_path)
                );
            }
        }

        host.innerHTML = rows.map(row => {

            const k = kMap.get(Number(row.karyawan_id)) || {};

            const nama =
                k.nama_karyawan ||
                `Karyawan #${row.karyawan_id}`;

            const cabang =
                cMap.get(Number(k.cabang_id || row.cabang_id)) ||
                `Cabang #${row.cabang_id || "—"}`;

            const reviewer =
                pMap.get(String(row.spv_user_id || "")) ||
                "SPV";

            const decision = keputusan(row);
            const jenis = String(row.jenis || "—").toUpperCase();

            const photoUrl = photoUrls.get(row.id);

            const proof = photoUrl
                ? `
                    <button
                        type="button"
                        class="owner-spv-photo-thumb"
                        data-owner-spv-photo="${esc(photoUrl)}"
                        aria-label="Lihat foto bukti">

                        <img
                            src="${esc(photoUrl)}"
                            alt="Bukti ${esc(jenis)} ${esc(nama)}"
                            loading="lazy">

                        <span>Perbesar Foto</span>
                    </button>
                `
                : `
                    <div class="owner-spv-no-proof">
                        Tidak ada foto bukti
                    </div>
                `;

            return `
                <article class="owner-spv-audit-card">

                    <div class="owner-spv-audit-title">

                        <div>
                            <strong>${esc(nama)}</strong>

                            <span>
                                ${esc(k.jabatan || "—")}
                                ·
                                ${esc(cabang)}
                            </span>
                        </div>

                        <div class="owner-spv-audit-badges">

                            <span
                                class="owner-spv-kind is-${jenis.toLowerCase()}">
                                ${esc(jenis)}
                            </span>

                            <span
                                class="owner-spv-decision ${decision.cls}">
                                ${decision.text}
                            </span>

                        </div>
                    </div>

                    <div class="owner-spv-audit-content">

                        <div class="owner-spv-audit-main">

                            <div class="owner-spv-audit-grid">

                                <div>
                                    <span>TANGGAL</span>
                                    <b>${fmtRange(row)}</b>
                                </div>

                                <div>
                                    <span>REVIEWER SPV</span>
                                    <b>${esc(reviewer)}</b>
                                </div>

                                <div>
                                    <span>WAKTU KEPUTUSAN</span>
                                    <b>${fmtDateTime(row.spv_reviewed_at)}</b>
                                </div>

                            </div>

                            <div class="owner-spv-audit-note">

                                <span>
                                    ALASAN PENGAJUAN KARYAWAN
                                </span>

                                <p>
                                    ${esc(row.alasan || "—")}
                                </p>

                            </div>

                            <div class="owner-spv-audit-note is-spv">

                                <span>
                                    CATATAN / ALASAN KEPUTUSAN SPV
                                </span>

                                <p>
                                    ${esc(row.spv_catatan || "—")}
                                </p>

                            </div>

                        </div>

                        <div class="owner-spv-audit-proof">

                            <span class="owner-spv-proof-label">
                                BUKTI / FOTO
                            </span>

                            ${proof}

                        </div>

                    </div>

                    <div class="owner-spv-audit-foot">

                        <span>
                            READ ONLY · keputusan SPV sudah final
                        </span>

                    </div>

                </article>
            `;
        }).join("");

        const lightbox = ensureLightbox();

        host
            .querySelectorAll("[data-owner-spv-photo]")
            .forEach(btn => {

                btn.addEventListener("click", () => {

                    const url =
                        String(
                            btn.dataset.ownerSpvPhoto || ""
                        ).trim();

                    if(!url) return;

                    lightbox?.__open?.(url);
                });
            });
    }

    async function bootWhenReady(){
        if(!isOwner()) return;

        let retry = 0;

        const timer = setInterval(async () => {

            retry++;

            if(document.getElementById("izinSpvEmbed")){
                clearInterval(timer);
                await load();
            }

            if(retry >= 30){
                clearInterval(timer);
            }

        },150);
    }

    document.addEventListener(
        "erp:finance-ready",
        () => setTimeout(bootWhenReady,300)
    );

    window.addEventListener(
        "vax:absensi-data-changed",
        () => setTimeout(load,200)
    );

    document.addEventListener("click", e => {

        const refresh =
            e.target.closest("#izinSpvRefresh");

        if(refresh && isOwner()){
            setTimeout(load,300);
        }
    });

    if(document.readyState !== "loading"){
        setTimeout(bootWhenReady,500);
    }

    window.OwnerSpvReadonlyAudit = {
        refresh:load
    };

})();

/* =========================================================
   VAX-20260817-OWNER-SPV-FILTER-PAGING
   Filter + search + pagination Riwayat Keputusan SPV Owner
   READ ONLY
   ========================================================= */
(function installOwnerSpvHistoryFilter(){

    if(window.__vaxOwnerSpvHistoryFilterInstalled) return;
    window.__vaxOwnerSpvHistoryFilterInstalled = true;

    const MONTHS = [
        "Januari","Februari","Maret","April","Mei","Juni",
        "Juli","Agustus","September","Oktober","November","Desember"
    ];

    function todayIso(){
        return new Date().toLocaleDateString("en-CA",{ timeZone:"Asia/Jakarta" });
    }

    function monthRange(iso){
        const d = String(iso || todayIso()).slice(0,10);
        const y = Number(d.slice(0,4));
        const m = Number(d.slice(5,7));
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const mm = String(m).padStart(2,"0");
        return {
            start: `${y}-${mm}-01`,
            end: `${y}-${mm}-${String(last).padStart(2,"0")}`
        };
    }

    const initialMonth = monthRange(todayIso());

    const state = {
        q:"",
        jenis:"SEMUA",
        periodMode:"bulan",
        start: initialMonth.start,
        end: initialMonth.end,
        limit:10,
        step:10,
        rows:[],
        calYear:0,
        calMonth:0,
        calDraftStart:"",
        calDraftEnd:"",
        calFocus:"start"
    };

    function normalize(v){
        return String(v || "")
            .normalize("NFKC")
            .trim()
            .toLowerCase();
    }

    function isoDay(v){
        return String(v || "").slice(0,10);
    }

    function rangesOverlap(reqStart, reqEnd, filterStart, filterEnd){
        const a1 = isoDay(reqStart);
        const a2 = isoDay(reqEnd || reqStart);
        const b1 = isoDay(filterStart);
        const b2 = isoDay(filterEnd || filterStart);
        if(!b1) return true;
        if(!a1) return true;
        return a1 <= b2 && b1 <= (a2 || a1);
    }

    function formatId(iso){
        const s = isoDay(iso);
        if(!s) return "—";
        const d = new Date(`${s}T00:00:00`);
        if(Number.isNaN(d.getTime())) return s;
        return d.toLocaleDateString("id-ID",{
            day:"2-digit",
            month:"short",
            year:"numeric"
        });
    }

    function ensureToolbar(){
        const section = document.getElementById("ownerSpvReadonlyAudit");
        const list = document.getElementById("ownerSpvAuditList");

        if(!section || !list) return null;

        let toolbar = document.getElementById("ownerSpvHistoryToolbar");
        if(toolbar && !toolbar.querySelector("[data-owner-spv-period]")){
            toolbar.remove();
            toolbar = null;
        }
        if(toolbar){
            syncPeriodUi();
            return toolbar;
        }

        toolbar = document.createElement("div");
        toolbar.id = "ownerSpvHistoryToolbar";
        toolbar.className = "owner-spv-history-toolbar";

        toolbar.innerHTML = `
            <div class="owner-spv-history-search">
                <span>?</span>
                <input
                    id="ownerSpvHistorySearch"
                    type="search"
                    placeholder="Cari nama / cabang / alasan / catatan SPV..."
                    autocomplete="off">
            </div>

            <div class="owner-spv-history-period">
                <span class="owner-spv-history-period-label">Periode</span>
                <div class="owner-spv-history-period-modes" role="group" aria-label="Mode periode">
                    <button type="button" data-owner-spv-period="hari">Hari Ini</button>
                    <button type="button" data-owner-spv-period="bulan" class="is-active">Bulan Ini</button>
                    <button type="button" data-owner-spv-period="custom">Custom</button>
                </div>
                <div id="ownerSpvHistoryCustomRange" class="owner-spv-history-custom" hidden>
                    <button type="button" id="ownerSpvHistoryDari" class="owner-spv-history-datebtn" data-owner-spv-cal="start">
                        <small>Dari</small>
                        <b id="ownerSpvHistoryDariVal">—</b>
                    </button>
                    <button type="button" id="ownerSpvHistorySampai" class="owner-spv-history-datebtn" data-owner-spv-cal="end">
                        <small>Sampai</small>
                        <b id="ownerSpvHistorySampaiVal">—</b>
                    </button>
                </div>
            </div>

            <div class="owner-spv-history-types">
                <button type="button" data-owner-spv-type="SEMUA" class="is-active">
                    Semua
                </button>
                <button type="button" data-owner-spv-type="LIBUR">
                    Libur
                </button>
                <button type="button" data-owner-spv-type="IZIN">
                    Izin
                </button>
                <button type="button" data-owner-spv-type="SAKIT">
                    Sakit
                </button>
            </div>

            <button
                type="button"
                id="ownerSpvHistoryReset"
                class="owner-spv-history-reset">
                Reset
            </button>
        `;

        list.insertAdjacentElement("beforebegin",toolbar);

        if(!document.getElementById("ownerSpvHistoryFooter")){
            const footer = document.createElement("div");
            footer.id = "ownerSpvHistoryFooter";
            footer.className = "owner-spv-history-footer";

            footer.innerHTML = `
                <span id="ownerSpvHistoryInfo"></span>
                <button
                    type="button"
                    id="ownerSpvHistoryMore"
                    class="owner-spv-history-more"
                    hidden>
                    Tampilkan Lagi
                </button>
            `;

            list.insertAdjacentElement("afterend",footer);

            footer.querySelector("#ownerSpvHistoryMore")
                ?.addEventListener("click",() => {
                    state.limit += state.step;
                    apply();
                });
        }

        toolbar.querySelector("#ownerSpvHistorySearch")
            ?.addEventListener("input",e => {
                state.q = normalize(e.target.value);
                state.limit = state.step;
                apply();
            });

        toolbar.querySelectorAll("[data-owner-spv-period]")
            .forEach(btn => {
                btn.addEventListener("click",() => {
                    setPeriodMode(btn.dataset.ownerSpvPeriod || "bulan");
                });
            });

        toolbar.querySelectorAll("[data-owner-spv-cal]")
            .forEach(btn => {
                btn.addEventListener("click",e => {
                    e.preventDefault();
                    e.stopPropagation();
                    openCalendar(btn.dataset.ownerSpvCal || "start");
                });
            });

        toolbar.querySelectorAll("[data-owner-spv-type]")
            .forEach(btn => {
                btn.addEventListener("click",() => {
                    state.jenis = String(btn.dataset.ownerSpvType || "SEMUA");

                    toolbar.querySelectorAll("[data-owner-spv-type]")
                        .forEach(x => x.classList.remove("is-active"));

                    btn.classList.add("is-active");
                    state.limit = state.step;
                    apply();
                });
            });

        toolbar.querySelector("#ownerSpvHistoryReset")
            ?.addEventListener("click",() => {
                state.q = "";
                state.jenis = "SEMUA";
                state.limit = state.step;

                const search = toolbar.querySelector("#ownerSpvHistorySearch");
                if(search) search.value = "";

                toolbar.querySelectorAll("[data-owner-spv-type]")
                    .forEach(x => {
                        x.classList.toggle(
                            "is-active",
                            x.dataset.ownerSpvType === "SEMUA"
                        );
                    });

                setPeriodMode("bulan");
            });

        ensureCalendar();
        syncPeriodUi();
        return toolbar;
    }

    function setPeriodMode(mode){
        const next = mode === "hari" || mode === "custom" ? mode : "bulan";
        state.periodMode = next;
        if(next === "hari"){
            const today = todayIso();
            state.start = today;
            state.end = today;
        }else if(next === "bulan"){
            const range = monthRange(todayIso());
            state.start = range.start;
            state.end = range.end;
        }else if(!state.start){
            const range = monthRange(todayIso());
            state.start = range.start;
            state.end = range.end;
        }
        state.limit = state.step;
        syncPeriodUi();
        apply();
    }

    function syncPeriodUi(){
        const custom = document.getElementById("ownerSpvHistoryCustomRange");
        if(custom) custom.hidden = state.periodMode !== "custom";

        document.querySelectorAll("[data-owner-spv-period]").forEach(btn => {
            btn.classList.toggle("is-active", btn.dataset.ownerSpvPeriod === state.periodMode);
        });

        const dari = document.getElementById("ownerSpvHistoryDariVal");
        const sampai = document.getElementById("ownerSpvHistorySampaiVal");
        if(dari) dari.textContent = formatId(state.start);
        if(sampai) sampai.textContent = formatId(state.end || state.start);
    }

    function ensureCalendar(){
        if(document.getElementById("ownerSpvCalModal")) return;

        const box = document.createElement("div");
        box.id = "ownerSpvCalModal";
        box.className = "owner-spv-cal-modal";
        box.hidden = true;
        box.setAttribute("aria-hidden","true");
        box.innerHTML = `
            <div class="owner-spv-cal-backdrop" data-owner-spv-cal-close></div>
            <div class="owner-spv-cal-panel" role="dialog" aria-modal="true" aria-labelledby="ownerSpvCalTitle">
                <div class="owner-spv-cal-header">
                    <h3 id="ownerSpvCalTitle">Pilih Tanggal</h3>
                    <button type="button" class="owner-spv-cal-x" data-owner-spv-cal-close aria-label="Tutup">×</button>
                </div>
                <div class="owner-spv-cal-nav">
                    <button type="button" id="ownerSpvCalPrev" aria-label="Bulan sebelumnya">‹</button>
                    <strong id="ownerSpvCalMonthLabel">—</strong>
                    <button type="button" id="ownerSpvCalNext" aria-label="Bulan berikutnya">›</button>
                </div>
                <div class="owner-spv-cal-weekdays" aria-hidden="true">
                    <span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span>
                    <span>Jum</span><span>Sab</span><span>Min</span>
                </div>
                <div id="ownerSpvCalDays" class="owner-spv-cal-days"></div>
                <p id="ownerSpvCalPreview" class="owner-spv-cal-preview">Pilih 1 tanggal, atau Dari–Sampai</p>
                <div class="owner-spv-cal-actions">
                    <button type="button" id="ownerSpvCalToday">Hari Ini</button>
                    <button type="button" data-owner-spv-cal-close>Batal</button>
                    <button type="button" id="ownerSpvCalApply" class="is-apply">Terapkan</button>
                </div>
            </div>
        `;
        document.body.appendChild(box);

        box.addEventListener("click",e => {
            if(e.target.closest("[data-owner-spv-cal-close]")){
                e.preventDefault();
                closeCalendar();
                return;
            }
            const day = e.target.closest("[data-owner-spv-cal-day]");
            if(day){
                e.preventDefault();
                onCalDay(day.getAttribute("data-owner-spv-cal-day"));
                return;
            }
            if(e.target.closest("#ownerSpvCalPrev")){
                e.preventDefault();
                shiftCalMonth(-1);
                return;
            }
            if(e.target.closest("#ownerSpvCalNext")){
                e.preventDefault();
                shiftCalMonth(1);
                return;
            }
            if(e.target.closest("#ownerSpvCalToday")){
                e.preventDefault();
                const today = todayIso();
                state.calDraftStart = today;
                state.calDraftEnd = today;
                seedCalView(today);
                renderCalendar();
                return;
            }
            if(e.target.closest("#ownerSpvCalApply")){
                e.preventDefault();
                applyCalendar();
            }
        });

        document.addEventListener("keydown",e => {
            if(e.key !== "Escape") return;
            if(!isCalendarOpen()) return;
            e.preventDefault();
            e.stopPropagation();
            closeCalendar();
        });
    }

    function isCalendarOpen(){
        const box = document.getElementById("ownerSpvCalModal");
        return Boolean(box && !box.hidden);
    }

    function seedCalView(iso){
        const s = isoDay(iso || todayIso());
        state.calYear = Number(s.slice(0,4)) || new Date().getFullYear();
        state.calMonth = Math.max(0, Number(s.slice(5,7)) - 1);
    }

    function openCalendar(focus){
        ensureCalendar();
        const box = document.getElementById("ownerSpvCalModal");
        if(!box) return;
        state.periodMode = "custom";
        state.calFocus = focus === "end" ? "end" : "start";
        state.calDraftStart = state.start || todayIso();
        state.calDraftEnd = state.end || state.calDraftStart;
        seedCalView(state.calFocus === "end" ? (state.calDraftEnd || state.calDraftStart) : state.calDraftStart);
        box.hidden = false;
        box.classList.add("is-open");
        box.setAttribute("aria-hidden","false");
        document.body.classList.add("owner-spv-cal-open");
        syncPeriodUi();
        renderCalendar();
    }

    function closeCalendar(){
        const box = document.getElementById("ownerSpvCalModal");
        if(!box || box.hidden) return;
        box.hidden = true;
        box.classList.remove("is-open");
        box.setAttribute("aria-hidden","true");
        document.body.classList.remove("owner-spv-cal-open");
    }

    function shiftCalMonth(delta){
        const d = new Date(Date.UTC(state.calYear, state.calMonth + delta, 1));
        state.calYear = d.getUTCFullYear();
        state.calMonth = d.getUTCMonth();
        renderCalendar();
    }

    function onCalDay(iso){
        const day = isoDay(iso);
        if(!day) return;
        if(state.calFocus === "end"){
            if(!state.calDraftStart){
                state.calDraftStart = day;
                state.calDraftEnd = "";
            }else if(day < state.calDraftStart){
                state.calDraftEnd = state.calDraftStart;
                state.calDraftStart = day;
            }else{
                state.calDraftEnd = day;
            }
            state.calFocus = "start";
            renderCalendar();
            return;
        }
        if(!state.calDraftStart || (state.calDraftStart && state.calDraftEnd)){
            state.calDraftStart = day;
            state.calDraftEnd = "";
            state.calFocus = "end";
        }else if(day < state.calDraftStart){
            state.calDraftEnd = state.calDraftStart;
            state.calDraftStart = day;
        }else{
            state.calDraftEnd = day;
        }
        renderCalendar();
    }

    function applyCalendar(){
        const start = isoDay(state.calDraftStart);
        if(!start) return;
        const end = isoDay(state.calDraftEnd || start);
        state.periodMode = "custom";
        state.start = start <= end ? start : end;
        state.end = start <= end ? end : start;
        state.limit = state.step;
        closeCalendar();
        syncPeriodUi();
        apply();
    }

    function renderCalendar(){
        const grid = document.getElementById("ownerSpvCalDays");
        const label = document.getElementById("ownerSpvCalMonthLabel");
        const preview = document.getElementById("ownerSpvCalPreview");
        if(!grid || state.calYear == null) return;

        if(label) label.textContent = `${MONTHS[state.calMonth] || ""} ${state.calYear}`;

        const today = todayIso();
        const first = new Date(Date.UTC(state.calYear, state.calMonth, 1));
        const mondayIndex = (first.getUTCDay() + 6) % 7;
        const daysInMonth = new Date(Date.UTC(state.calYear, state.calMonth + 1, 0)).getUTCDate();
        const start = isoDay(state.calDraftStart);
        const end = isoDay(state.calDraftEnd);

        let html = "";
        for(let i = 0; i < mondayIndex; i++){
            html += `<span class="owner-spv-cal-day is-empty" aria-hidden="true"></span>`;
        }
        for(let day = 1; day <= daysInMonth; day++){
            const iso = `${state.calYear}-${String(state.calMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const classes = ["owner-spv-cal-day"];
            if(iso === today) classes.push("is-today");
            if(start && iso === start) classes.push("is-start");
            if(end && iso === end) classes.push("is-end");
            if(start && end && iso > start && iso < end) classes.push("is-in-range");
            html += `<button type="button" class="${classes.join(" ")}" data-owner-spv-cal-day="${iso}">${day}</button>`;
        }
        grid.innerHTML = html;

        if(preview){
            if(start && end && end !== start){
                preview.textContent = `${formatId(start)} – ${formatId(end)}`;
            }else if(start){
                preview.textContent = `${formatId(start)} · 1 tanggal`;
            }else{
                preview.textContent = "Pilih 1 tanggal, atau Dari–Sampai";
            }
        }
    }

    async function syncMetadata(){
        if(!document.getElementById("ownerSpvReadonlyAudit")) return;

        ensureToolbar();

        const cards = [
            ...document.querySelectorAll(
                "#ownerSpvAuditList .owner-spv-audit-card"
            )
        ];

        if(!cards.length){
            apply();
            return;
        }

        const { data,error } = await db
            .from("pengajuan_izin")
            .select(`
                id,
                karyawan_id,
                cabang_id,
                tanggal,
                tanggal_selesai,
                jenis,
                alasan,
                spv_catatan,
                spv_reviewed_at
            `)
            .not("spv_reviewed_at","is",null)
            .order("spv_reviewed_at",{ascending:false})
            .limit(50);

        if(error){
            console.warn("Owner history metadata:",error);
            return;
        }

        state.rows = data || [];

        cards.forEach((card,index) => {
            const row = state.rows[index];
            if(!row) return;

            card.dataset.historyIndex = String(index);
            card.dataset.historyJenis =
                String(row.jenis || "").toUpperCase();

            card.dataset.historyStart =
                String(row.tanggal || "").slice(0,10);

            card.dataset.historyEnd =
                String(row.tanggal_selesai || row.tanggal || "").slice(0,10);

            card.dataset.historySearch = normalize(
                [
                    card.textContent,
                    row.alasan,
                    row.spv_catatan
                ].join(" ")
            );
        });

        apply();
    }

    function apply(){
        const cards = [
            ...document.querySelectorAll(
                "#ownerSpvAuditList .owner-spv-audit-card"
            )
        ];

        if(!cards.length){
            const info = document.getElementById("ownerSpvHistoryInfo");
            const more = document.getElementById("ownerSpvHistoryMore");

            if(info) info.textContent = "";
            if(more) more.hidden = true;
            return;
        }

        const matching = cards.filter(card => {
            const jenis =
                String(card.dataset.historyJenis || "").toUpperCase();

            const text =
                normalize(
                    card.dataset.historySearch ||
                    card.textContent
                );

            const start = card.dataset.historyStart || "";
            const end = card.dataset.historyEnd || start;

            if(state.jenis !== "SEMUA" && jenis !== state.jenis){
                return false;
            }

            if(state.q && !text.includes(state.q)){
                return false;
            }

            if(
                state.start &&
                !rangesOverlap(start, end, state.start, state.end || state.start)
            ){
                return false;
            }

            return true;
        });

        cards.forEach(card => {
            card.hidden = true;
        });

        matching
            .slice(0,state.limit)
            .forEach(card => {
                card.hidden = false;
            });

        const shown = Math.min(state.limit,matching.length);

        const info = document.getElementById("ownerSpvHistoryInfo");
        const more = document.getElementById("ownerSpvHistoryMore");

        if(info){
            info.textContent = matching.length
                ? `Menampilkan ${shown} dari ${matching.length} riwayat`
                : "Tidak ada riwayat sesuai filter";
        }

        if(more){
            more.hidden = shown >= matching.length;
        }
    }

    function observe(){
        const list = document.getElementById("ownerSpvAuditList");
        if(!list) return;

        if(list.__vaxHistoryObserver) return;

        let timer = null;

        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(syncMetadata,120);
        });

        observer.observe(list,{
            childList:true,
            subtree:false
        });

        list.__vaxHistoryObserver = observer;
    }

    function boot(){
        let tries = 0;

        const timer = setInterval(() => {
            tries++;

            const section =
                document.getElementById("ownerSpvReadonlyAudit");

            if(section){
                clearInterval(timer);
                ensureToolbar();
                observe();
                setTimeout(syncMetadata,150);
            }

            if(tries > 40){
                clearInterval(timer);
            }
        },150);
    }

    window.addEventListener("vax:absensi-data-changed",() => {
        setTimeout(syncMetadata,250);
    });

    document.addEventListener("click",e => {
        if(e.target.closest("#ownerSpvAuditRefresh")){
            setTimeout(syncMetadata,350);
        }
    });

    if(document.readyState === "loading"){
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(boot,350),
            {once:true}
        );
    }else{
        setTimeout(boot,350);
    }

})();
