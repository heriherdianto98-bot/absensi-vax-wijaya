/* VAX WIJAYA — SPV Review Izin / Libur */
(function(){
    const listEl=document.getElementById('requestList');
    const loading=document.getElementById('loadingState');
    const empty=document.getElementById('emptyState');
    const search=document.getElementById('searchInput');
    const filterJenis=document.getElementById('filterJenis');
    const btnRefresh=document.getElementById('btnRefresh');
    const countWaiting=document.getElementById('countWaiting');
    const countForwarded=document.getElementById('countForwarded');
    const countRejected=document.getElementById('countRejected');
    const modal=document.getElementById('reviewModal');
    const modalTitle=document.getElementById('modalTitle');
    const modalMeta=document.getElementById('modalMeta');
    const spvNote=document.getElementById('spvNote');
    const noteCount=document.getElementById('noteCount');
    const modalMessage=document.getElementById('modalMessage');
    const btnReject=document.getElementById('btnReject');
    const btnForward=document.getElementById('btnForward');

    let rows=[];
    let current=null;
    let busy=false;

    function vibrate(ms=10){try{if(navigator.vibrate) navigator.vibrate(ms);}catch(e){}}
    function esc(v=''){return String(v??'').replace(/[&<>'\"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[s]));}
    function fmtDate(v){if(!v)return '-';const d=new Date(v+'T00:00:00');return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});}
    function setModalMessage(text,type=''){modalMessage.textContent=text||'';modalMessage.className='modal-message'+(type?' '+type:'');}

    async function requireSpv(){
        const {data:{session}}=await db.auth.getSession();
        if(!session){location.href='ERP.NEW/pages/login.html';return false;}
        const {data:profile,error}=await db.from('profiles').select('id,nama,role,aktif').eq('id',session.user.id).single();
        const role=String(profile?.role||'').trim().toLowerCase();
        if(error||!profile||profile.aktif===false||!['spv','svp'].includes(role)){
            alert('Halaman ini khusus SPV.');
            location.href='ERP.NEW/pages/erp-dashboard.html';
            return false;
        }
        return true;
    }

    async function loadCounters(){
        const statuses=['MENUNGGU_SPV','MENUNGGU_OWNER','DITOLAK_SPV'];
        const counts={MENUNGGU_SPV:0,MENUNGGU_OWNER:0,DITOLAK_SPV:0};
        await Promise.all(statuses.map(async s=>{
            const {count}=await db.from('pengajuan_izin').select('id',{count:'exact',head:true}).eq('status',s);
            counts[s]=count||0;
        }));
        countWaiting.textContent=counts.MENUNGGU_SPV;
        countForwarded.textContent=counts.MENUNGGU_OWNER;
        countRejected.textContent=counts.DITOLAK_SPV;
    }

    async function loadRows(){
        loading.hidden=false; empty.hidden=true; listEl.innerHTML='';
        const {data,error}=await db.from('pengajuan_izin').select('id,created_at,karyawan_id,cabang_id,tanggal,jenis,alasan,bukti_path,status,karyawan:karyawan_id(nama_karyawan,jabatan),cabang:cabang_id(nama_cabang)').eq('status','MENUNGGU_SPV').order('created_at',{ascending:true});
        loading.hidden=true;
        if(error){listEl.innerHTML='<div class="state-card">Gagal memuat: '+esc(error.message)+'</div>';return;}
        rows=data||[];
        render();
        loadCounters();
    }

    function filtered(){
        const q=String(search.value||'').trim().toLowerCase();
        const j=filterJenis.value;
        return rows.filter(r=>{
            if(j!=='ALL'&&r.jenis!==j)return false;
            if(!q)return true;
            const text=[r.karyawan?.nama_karyawan,r.karyawan?.jabatan,r.cabang?.nama_cabang,r.alasan,r.jenis].join(' ').toLowerCase();
            return text.includes(q);
        });
    }

    function render(){
        const data=filtered();
        empty.hidden=data.length!==0;
        listEl.innerHTML=data.map(r=>{
            const nama=esc(r.karyawan?.nama_karyawan||('Karyawan #'+r.karyawan_id));
            const cabang=esc(r.cabang?.nama_cabang||'-');
            const jabatan=esc(r.karyawan?.jabatan||'-');
            const hasProof=!!r.bukti_path;
            return `<article class="request-card" data-id="${r.id}">
                <div class="request-head"><div class="person"><h3>${nama}</h3><p>${jabatan} • ${cabang}</p></div><span class="badge ${r.jenis==='LIBUR'?'libur':'izin'}">${r.jenis==='LIBUR'?'LIBUR':'IZIN'}</span></div>
                <div class="request-meta"><div class="meta-box"><small>Tanggal</small><b>${fmtDate(r.tanggal)}</b></div><div class="meta-box"><small>Cabang</small><b>${cabang}</b></div><div class="meta-box"><small>Status</small><b>Menunggu SPV</b></div></div>
                <div class="reason">${esc(r.alasan)}</div>
                <div class="proof-row"><button class="proof-btn" type="button" data-proof="${esc(r.bukti_path||'')}" ${hasProof?'':'disabled'}><i class="fas fa-image"></i> ${hasProof?'Lihat Bukti':'Tidak Ada Bukti'}</button><button class="review-btn" type="button" data-review="${r.id}"><i class="fas fa-clipboard-check"></i> Review</button></div>
            </article>`;
        }).join('');
    }

    async function openProof(path){
        if(!path)return;
        vibrate(12);
        const {data,error}=await db.storage.from('izin-proofs').createSignedUrl(path,60);
        if(error||!data?.signedUrl){alert('Bukti tidak dapat dibuka.');return;}
        window.open(data.signedUrl,'_blank','noopener');
    }

    function openReview(id){
        current=rows.find(r=>Number(r.id)===Number(id));
        if(!current)return;
        vibrate(12);
        modalTitle.textContent=current.jenis==='LIBUR'?'Review Pengajuan Libur':'Review Pengajuan Izin';
        modalMeta.textContent=`${current.karyawan?.nama_karyawan||'Karyawan'} • ${fmtDate(current.tanggal)} • ${current.cabang?.nama_cabang||'-'}`;
        spvNote.value=''; noteCount.textContent='0/300'; setModalMessage(''); modal.hidden=false; setTimeout(()=>spvNote.focus(),40);
    }

    function closeModal(){if(busy)return;modal.hidden=true;current=null;setModalMessage('');}
    function setBusy(v){busy=v;btnReject.disabled=v;btnForward.disabled=v;btnReject.style.opacity=v?'.55':'1';btnForward.style.opacity=v?'.55':'1';}

    async function process(action){
        if(busy||!current)return;
        const note=String(spvNote.value||'').trim();
        if(note.length<3){setModalMessage('Catatan SPV wajib minimal 3 karakter.','error');spvNote.focus();return;}
        vibrate(action==='TERUSKAN'?25:18);
        setBusy(true); setModalMessage('Menyimpan keputusan...');
        const {error}=await db.rpc('review_pengajuan_izin_spv',{p_pengajuan_id:Number(current.id),p_action:action,p_catatan:note});
        if(error){setModalMessage(error.message||'Gagal memproses.','error');setBusy(false);return;}
        setModalMessage(action==='TERUSKAN'?'Berhasil diteruskan ke Owner.':'Pengajuan ditolak SPV.','success');
        setTimeout(async()=>{modal.hidden=true;current=null;setBusy(false);await loadRows();},650);
    }

    listEl.addEventListener('click',e=>{
        const proof=e.target.closest('[data-proof]'); if(proof){openProof(proof.dataset.proof);return;}
        const review=e.target.closest('[data-review]'); if(review){openReview(review.dataset.review);}
    });
    document.querySelectorAll('[data-close="1"]').forEach(el=>el.addEventListener('click',closeModal));
    spvNote.addEventListener('input',()=>noteCount.textContent=`${spvNote.value.length}/300`);
    btnReject.addEventListener('click',()=>process('TOLAK'));
    btnForward.addEventListener('click',()=>process('TERUSKAN'));
    btnRefresh.addEventListener('click',()=>{vibrate(10);loadRows();});
    search.addEventListener('input',render);
    filterJenis.addEventListener('change',()=>{vibrate(8);render();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeModal();});

    (async()=>{if(await requireSpv())await loadRows();})();
})();
