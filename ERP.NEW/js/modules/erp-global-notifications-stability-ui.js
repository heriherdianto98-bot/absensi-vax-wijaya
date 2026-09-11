/* ERP VAX — notification stability patch. UI/read-only only. */
"use strict";
(function(){
  const install=()=>{
    const N=window.ERPGlobalNotifications;
    if(!N||N.__stabilityPatchInstalled)return false;
    N.__stabilityPatchInstalled=true;

    const oldEnsure=N.ensureUi?.bind(N);
    N.ensureUi=function(){
      try{oldEnsure?.()}catch(e){console.warn('[Notif stability] ensureUi base',e)}
      const header=document.querySelector('.erp-header-vax,.top-header,.erp-header');
      if(!header)return false;
      let root=document.getElementById('erpGlobalNotif');
      if(!root){root=document.createElement('div');root.id='erpGlobalNotif';root.className='erp-global-notif';const help=[...document.querySelectorAll('a,button')].find(el=>/help\s*desk/i.test(String(el.textContent||''))),owner=header.querySelector('.vax-owner');if(help&&help.parentElement===header)header.insertBefore(root,help);else if(owner)header.insertBefore(root,owner);else header.appendChild(root)}
      let btn=document.getElementById('erpGlobalNotifBtn');
      if(!btn){btn=document.createElement('button');btn.type='button';btn.id='erpGlobalNotifBtn';btn.className='erp-global-notif-btn';btn.setAttribute('aria-expanded','false');root.appendChild(btn)}
      let icon=btn.querySelector('.erp-global-notif-icon');if(!icon){icon=document.createElement('span');icon.className='erp-global-notif-icon';icon.textContent='🔔';btn.prepend(icon)}
      let badge=document.getElementById('erpGlobalNotifBadge');if(!badge){badge=document.createElement('span');badge.id='erpGlobalNotifBadge';badge.className='erp-global-notif-badge';badge.hidden=true;badge.textContent='0';btn.appendChild(badge)}
      let panel=document.getElementById('erpGlobalNotifPanel');
      if(!panel){panel=document.createElement('section');panel.id='erpGlobalNotifPanel';panel.className='erp-global-notif-panel';panel.hidden=true;panel.innerHTML='<div class="erp-global-notif-head"><div><strong>Notifikasi ERP</strong><span>Perhatian penting untuk akun aktif</span></div><button type="button" id="erpGlobalNotifRefresh" class="erp-global-notif-refresh"><span class="erp-global-notif-refresh-icon">↻</span><span>Refresh</span></button></div><div id="erpGlobalNotifList" class="erp-global-notif-list"></div><div class="erp-global-notif-foot">Read only • klik notifikasi untuk membuka modul terkait</div>';document.body.appendChild(panel)}
      N.root=root;N.button=btn;N.badge=badge;N.panel=panel;N.list=document.getElementById('erpGlobalNotifList');
      if(!btn.dataset.stabilityBound){btn.dataset.stabilityBound='1';btn.addEventListener('click',e=>{e.stopPropagation();if(panel.hidden){panel.hidden=false;btn.setAttribute('aria-expanded','true');N.refresh()}else{panel.hidden=true;btn.setAttribute('aria-expanded','false')}})}
      const rf=document.getElementById('erpGlobalNotifRefresh');if(rf&&!rf.dataset.stabilityBound){rf.dataset.stabilityBound='1';rf.addEventListener('click',()=>N.refresh())}
      return true;
    };

    N.resolveRoleFromHeader=function(){
      const t=String(document.getElementById('ownerAuthRole')?.textContent||'').trim().toLowerCase();
      if(/owner/.test(t))return 'owner';
      if(/svp|spv/.test(t))return 'svp';
      return '';
    };

    N.render=function(){
      if(!N.ensureUi())return;
      try{N.sortItems?.()}catch{}
      const items=Array.isArray(N.items)?N.items:[],n=items.length;
      if(N.badge){N.badge.textContent=n>99?'99+':String(n);N.badge.hidden=!n}
      if(N.button){N.button.classList.toggle('has-alert',n>0);N.button.setAttribute('aria-label',n?`${n} notifikasi penting`:'Tidak ada notifikasi penting')}
      if(!N.list)return;
      if(!n){N.list.innerHTML='<div class="erp-global-notif-empty">Tidak ada notifikasi penting saat ini.</div>';return}
      N.list.innerHTML=items.slice(0,60).map(x=>`<a class="erp-global-notif-item is-${N.esc(x.tone)}" href="${N.esc(x.href)}"><span class="erp-global-notif-item-icon">${N.esc(x.icon)}</span><span class="erp-global-notif-copy"><strong>${N.esc(x.title)}</strong><p>${N.esc(x.detail)}</p><small>${N.esc(x.module)}</small></span><span class="erp-global-notif-arrow">›</span></a>`).join('');
    };

    N.refresh=async function(){
      if(N.loading)return;N.loading=true;N.ensureUi();
      const rf=document.getElementById('erpGlobalNotifRefresh');if(rf){rf.disabled=true;rf.classList.add('is-loading')}
      if(N.list)N.list.innerHTML='<div class="erp-global-notif-empty">Memuat notifikasi…</div>';
      try{
        const db=await N.waitDb();if(!db)throw new Error('Supabase belum siap');
        N.items=[];
        try{await N.loadIdentity(db)}catch(e){console.warn('[Notif stability] identity',e)}
        if(!['owner','svp'].includes(N.role))N.role=N.resolveRoleFromHeader();
        const jobs=[N.loadInvoices,N.loadTagihan,N.loadArusKas,N.loadSetoran,N.loadIzin,N.loadPengumuman].filter(fn=>typeof fn==='function').map(fn=>Promise.resolve().then(()=>fn.call(N,db)));
        await Promise.allSettled(jobs);
        N.render();
      }catch(e){console.warn('[Notif stability] refresh',e);N.items=[];N.render()}
      finally{if(rf){rf.disabled=false;rf.classList.remove('is-loading')}N.loading=false}
    };

    setTimeout(()=>N.refresh(),50);
    return true;
  };
  if(!install()){let i=0;const t=setInterval(()=>{if(install()||++i>50)clearInterval(t)},120)}
})();
