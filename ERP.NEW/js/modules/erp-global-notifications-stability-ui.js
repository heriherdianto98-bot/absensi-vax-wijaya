/* ERP VAX — notification stability patch. UI/read-only only.
   Purpose: only surface notifications that still represent a real active action.
   IMPORTANT: notification layer only; no approval, finance, setoran, invoice, or data engine changes.
*/
"use strict";
(function(){
  const install=()=>{
    const N=window.ERPGlobalNotifications;
    if(!N||N.__stabilityPatchInstalledV5)return false;
    N.__stabilityPatchInstalledV5=true;

    N.resolveRoleFromHeader=function(){
      const probes=[
        document.getElementById('ownerAuthRole'),
        document.querySelector('.vax-owner-role'),
        document.querySelector('[data-role-active]'),
        document.querySelector('.role-active'),
        document.querySelector('.sidebar-user-role')
      ].filter(Boolean).map(x=>String(x.textContent||x.dataset?.roleActive||'').toLowerCase()).join(' ');
      const bodyHint=String(document.querySelector('.erp-sidebar,.sidebar')?.textContent||'').toLowerCase();
      const t=`${probes} ${bodyHint}`;
      if(/\bowner\b/.test(t))return 'owner';
      if(/\bsvp\b|\bspv\b/.test(t))return 'svp';
      return '';
    };

    N.waitDb=async function(){
      const started=Date.now();
      while(Date.now()-started<6000){
        try{if(typeof db!=='undefined'&&db&&typeof db.from==='function')return db}catch(_e){}
        if(window.db&&typeof window.db.from==='function')return window.db;
        await new Promise(r=>setTimeout(r,80));
      }
      return null;
    };

    /* Obsolete legacy Arus Kas notification is intentionally disabled. */
    N.loadArusKas=async function(){ return; };

    /* Master Tagihan reminder: date-only reminder by Owner decision.
       Show ONLY H-1, for the intended role, then disappear on/after due date.
       No payment/paid status is required or inferred. */
    N.loadTagihan=async function(db){
      if(!['owner','svp'].includes(N.role))return;
      try{
        const {data,error}=await db.from('master_tagihan')
          .select('id,kategori,cabang,jatuh_tempo_hari,nominal,aktif,notify_owner,notify_svp')
          .eq('aktif',true);
        if(error)throw error;

        (data||[]).forEach(r=>{
          if(N.role==='owner'&&!r.notify_owner)return;
          if(N.role==='svp'&&!r.notify_svp)return;
          const d=N.daysUntilMonthly(r.jatuh_tempo_hari);
          if(d!==1)return;

          N.add({
            key:`tagihan-h1:${r.id}:${N.role}`,
            tone:'warning',
            icon:'⏰',
            module:'MASTER TAGIHAN',
            href:`./master-tagihan.html?focus=tagihan&id=${encodeURIComponent(r.id)}`,
            title:`Tagihan jatuh tempo besok • ${String(r.kategori||'').replaceAll('_',' ')}`,
            detail:`${r.cabang||'—'} • ${N.money(r.nominal)} • tanggal ${r.jatuh_tempo_hari}`
          });
        });
      }catch(e){
        console.warn('[Notif stability] tagihan read',e);
      }
    };

    N.loadSetoran=async function(db){
      try{
        const since=N.isoAddDays(N.jakartaToday(),-14);
        const {data,error}=await db.from('setoran_3_harian')
          .select('id,period_start,period_end,cabang_id,status,owner_verified,request_proof,proof_path')
          .gte('period_end',since)
          .order('period_end',{ascending:false})
          .limit(40);
        if(error)throw error;

        (data||[]).forEach(r=>{
          const status=String(r.status||'').toUpperCase();
          /* A CLEAR setoran is complete, so old request_proof flags must not alert. */
          if(status!=='CLEAR'&&r.request_proof&&!r.proof_path){
            N.add({
              key:`setoran-proof:${r.id}`,
              tone:'urgent',icon:'📷',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',
              title:'Bukti setoran masih diperlukan',
              detail:`Periode ${r.period_start} — ${r.period_end} • cabang ID ${r.cabang_id}`
            });
          }
          if(N.role==='owner'&&r.owner_verified===false&&status!=='CLEAR'){
            N.add({
              key:`setoran-owner-verify:${r.id}`,
              tone:'warning',icon:'✓',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',
              title:'Setoran menunggu verifikasi Owner',
              detail:`Periode ${r.period_start} — ${r.period_end} • ${r.status||'menunggu review'}`
            });
          }
        });
      }catch(e){
        console.warn('[Notif stability] setoran read',e);
      }
    };

    /* Owner Invoice notifications are disabled by Owner decision.
       SVP incoming-Invoice notifications remain unchanged. */
    N.loadInvoices=async function(db){
      if(N.role!=='svp')return;
      let data=null,error=null;
      try{
        ({data,error}=await db.from('svp_invoices')
          .select('id,invoice_no,title,total,status,sender_role,created_by,created_at')
          .order('created_at',{ascending:false})
          .limit(50));
        if(error){
          const fb=await db.from('svp_invoices').select('*').order('created_at',{ascending:false}).limit(50);
          data=fb.data;error=fb.error;
        }
        if(error)throw error;

        const myId=String(N.user?.id||'');
        (data||[]).forEach(r=>{
          const st=String(r.status||'draft').toLowerCase();
          if(['paid','approved','rejected','cancelled','canceled'].includes(st))return;

          let sender=String(r.sender_role||'').toLowerCase();
          if(sender==='spv')sender='svp';
          if(!sender){
            const createdBy=String(r.created_by||'');
            if(createdBy&&myId&&createdBy===myId)sender=N.role;
            else sender=N.role==='owner'?'svp':'owner';
          }

          const incoming=(N.role==='owner'&&sender==='svp')||(N.role==='svp'&&sender==='owner');
          if(!incoming)return;

          N.add({
            key:`invoice:${r.id}:${N.role}`,
            tone:'info',
            icon:'▤',
            module:'INVOICE',
            href:`./master-tagihan.html?focus=invoice&invoice=${encodeURIComponent(r.id)}`,
            title:N.role==='owner'?'Invoice baru dari SVP':'Invoice baru dari Owner',
            detail:`${r.invoice_no||'Invoice'} • ${N.money(r.total)}${r.title?` • ${r.title}`:''}`
          });
        });
      }catch(e){
        console.warn('[Notif stability] invoice read',e);
      }
    };

    const baseRender=N.render?.bind(N);
    N.render=function(){
      try{return baseRender?.()}catch(e){console.warn('[Notif stability] render base',e)}
      if(!N.ensureUi?.())return;
      const items=Array.isArray(N.items)?N.items:[],n=items.length;
      if(N.badge){N.badge.textContent=n>99?'99+':String(n);N.badge.hidden=!n}
      if(N.list)N.list.innerHTML=n?items.slice(0,60).map(x=>`<a class="erp-global-notif-item is-${N.esc(x.tone)}" href="${N.esc(x.href)}"><span class="erp-global-notif-item-icon">${N.esc(x.icon)}</span><span class="erp-global-notif-copy"><strong>${N.esc(x.title)}</strong><p>${N.esc(x.detail)}</p><small>${N.esc(x.module)}</small></span><span class="erp-global-notif-arrow">›</span></a>`).join(''):'<div class="erp-global-notif-empty">Tidak ada notifikasi penting saat ini.</div>';
    };

    N.refresh=async function(){
      if(N.loading)return;
      N.loading=true;
      N.ensureUi?.();
      const rf=document.getElementById('erpGlobalNotifRefresh');
      if(rf){rf.disabled=true;rf.classList.add('is-loading')}
      if(N.list)N.list.innerHTML='<div class="erp-global-notif-empty">Memuat notifikasi…</div>';
      try{
        const db=await N.waitDb();
        if(!db)throw new Error('Supabase belum siap');
        N.items=[];
        try{await N.loadIdentity(db)}catch(e){console.warn('[Notif stability] identity',e)}
        if(!['owner','svp'].includes(N.role))N.role=N.resolveRoleFromHeader();
        const jobs=[N.loadInvoices,N.loadTagihan,N.loadArusKas,N.loadSetoran,N.loadIzin,N.loadPulangAwal,N.loadPengumuman]
          .filter(fn=>typeof fn==='function')
          .map(fn=>Promise.resolve().then(()=>fn.call(N,db)));
        await Promise.allSettled(jobs);
        N.render();
      }catch(e){
        console.warn('[Notif stability] refresh',e);
        N.items=[];
        N.render();
      }finally{
        if(rf){rf.disabled=false;rf.classList.remove('is-loading')}
        N.loading=false;
      }
    };

    setTimeout(()=>N.refresh(),80);
    return true;
  };

  if(!install()){
    let i=0;
    const t=setInterval(()=>{if(install()||++i>50)clearInterval(t)},120);
  }
})();
