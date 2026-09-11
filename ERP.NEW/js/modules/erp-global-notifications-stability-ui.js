/* ERP VAX — notification stability patch. UI/read-only only.
   Purpose: keep one click handler, harden role/invoice reads, never touch approval/finance engines.
*/
"use strict";
(function(){
  const install=()=>{
    const N=window.ERPGlobalNotifications;
    if(!N||N.__stabilityPatchInstalledV3)return false;
    N.__stabilityPatchInstalledV3=true;

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

    /* ERP connector.js exposes Supabase as top-level lexical `db`, not window.db.
       Notification layer resolves the existing client without touching connector/auth engines. */
    N.waitDb=async function(){
      const started=Date.now();
      while(Date.now()-started<6000){
        try{
          if(typeof db!=='undefined'&&db&&typeof db.from==='function')return db;
        }catch(_e){}
        if(window.db&&typeof window.db.from==='function')return window.db;
        await new Promise(r=>setTimeout(r,80));
      }
      return null;
    };

    /* Legacy notification paths disabled by Owner decision 2026-09-11.
       Important: this only stops obsolete notifications. No Setoran / Arus Kas engine,
       transaction, status, formula, approval, or database record is changed. */
    N.loadArusKas=async function(){
      return;
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
          if(r.request_proof&&!r.proof_path){
            N.add({
              tone:'urgent',icon:'📷',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',
              title:'Bukti setoran diminta',
              detail:`Periode ${r.period_start} — ${r.period_end} • cabang ID ${r.cabang_id}`
            });
          }
          if(N.role==='owner'&&r.owner_verified===false&&String(r.status||'').toUpperCase()!=='CLEAR'){
            N.add({
              tone:'warning',icon:'✓',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',
              title:'Setoran belum Owner Verified',
              detail:`Periode ${r.period_start} — ${r.period_end} • ${r.status||'menunggu review'}`
            });
          }
        });
      }catch(e){
        console.warn('[Notif stability] setoran read',e);
      }
    };

    /* Important: do NOT attach another bell click handler here.
       The base notification module already owns toggle/open/close. */

    N.loadInvoices=async function(db){
      if(!['owner','svp'].includes(N.role))return;
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
            tone:'urgent',
            icon:'▤',
            module:'INVOICE',
            href:`./master-tagihan.html?focus=invoice&invoice=${encodeURIComponent(r.id)}`,
            title:N.role==='owner'?'Invoice SVP menunggu ACC Owner':'Invoice Owner menunggu ACC SVP',
            detail:`${r.invoice_no||'Invoice'} • ${N.money(r.total)}${r.title?` • ${r.title}`:''}`
          });
        });
      }catch(e){
        console.warn('[Notif stability] invoice read',e);
        N.add({
          key:`invoice-read-error:${N.role}`,
          tone:'warning',
          icon:'!',
          module:'INVOICE',
          href:'./master-tagihan.html?focus=invoice',
          title:'Invoice perlu dicek',
          detail:'Data invoice belum dapat dibaca dari akun ini. Buka Master Tagihan untuk pengecekan.'
        });
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
        const jobs=[N.loadInvoices,N.loadTagihan,N.loadArusKas,N.loadSetoran,N.loadIzin,N.loadPengumuman]
          .filter(fn=>typeof fn==='function')
          .map(fn=>Promise.resolve().then(()=>fn.call(N,db)));
        await Promise.allSettled(jobs);
        N.render();
      }catch(e){
        console.warn('[Notif stability] refresh',e);
        N.items=[];
        N.add?.({tone:'warning',icon:'!',module:'NOTIFIKASI',href:'#',title:'Notifikasi belum dapat dimuat',detail:e?.message||String(e)});
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
