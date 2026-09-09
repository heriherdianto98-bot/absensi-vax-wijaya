/* ERP VAX — Global Notification Center
   UI/read-only aggregator. Tidak mengubah engine, data, status, approval, atau transaksi.
*/
"use strict";
(function(){
  if(window.ERPGlobalNotifications) return;
  const N={
    root:null,panel:null,list:null,badge:null,button:null,items:[],timer:null,loading:false,
    esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))},
    money(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0))},
    jakartaToday(){
      const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
      const g=t=>(p.find(x=>x.type===t)||{}).value;
      return `${g("year")}-${g("month")}-${g("day")}`;
    },
    isoAddDays(iso,n){const [y,m,d]=iso.split("-").map(Number);const x=new Date(Date.UTC(y,m-1,d));x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)},
    daysUntilMonthly(day){
      const today=this.jakartaToday(); const [y,m,d]=today.split("-").map(Number);
      const last=new Date(Date.UTC(y,m,0)).getUTCDate(); let targetDay=Math.min(Number(day)||1,last);
      let target=new Date(Date.UTC(y,m-1,targetDay)); const now=new Date(Date.UTC(y,m-1,d));
      if(target<now){const last2=new Date(Date.UTC(y,m+1,0)).getUTCDate();target=new Date(Date.UTC(y,m,Math.min(Number(day)||1,last2)))}
      return Math.round((target-now)/86400000);
    },
    ensureAssets(){
      if(!document.querySelector('link[data-erp-global-notif-css]')){
        const l=document.createElement('link');l.rel='stylesheet';l.href='../styles/erp-global-notifications.css?v=20260909-2';l.dataset.erpGlobalNotifCss='1';document.head.appendChild(l);
      }
    },
    findHelpDesk(){
      return [...document.querySelectorAll('a,button')].find(el=>/help\s*desk/i.test(String(el.textContent||'')))||null;
    },
    ensureUi(){
      this.ensureAssets();
      const header=document.querySelector('.erp-header-vax,.top-header,.erp-header'); if(!header)return false;
      let root=document.getElementById('erpGlobalNotif');
      if(!root){
        root=document.createElement('div');root.id='erpGlobalNotif';root.className='erp-global-notif';
        root.innerHTML='<button type="button" id="erpGlobalNotifBtn" class="erp-global-notif-btn" aria-label="Notifikasi penting" aria-expanded="false"><span class="erp-global-notif-icon">🔔</span><span id="erpGlobalNotifBadge" class="erp-global-notif-badge" hidden>0</span></button>';
        const help=this.findHelpDesk(), owner=header.querySelector('.vax-owner');
        if(help&&help.parentElement===header) header.insertBefore(root,help); else if(owner) header.insertBefore(root,owner); else header.appendChild(root);
      }
      let panel=document.getElementById('erpGlobalNotifPanel');
      if(!panel){
        panel=document.createElement('section');panel.id='erpGlobalNotifPanel';panel.className='erp-global-notif-panel';panel.hidden=true;
        panel.innerHTML='<div class="erp-global-notif-head"><div><strong>Notifikasi ERP</strong><span>Semua perhatian penting Owner / SVP</span></div><button type="button" id="erpGlobalNotifRefresh" class="erp-global-notif-refresh"><span class="erp-global-notif-refresh-icon">↻</span><span>Refresh</span></button></div><div id="erpGlobalNotifList" class="erp-global-notif-list"></div><div class="erp-global-notif-foot">Read only • tidak mengubah data atau status modul</div>';
        document.body.appendChild(panel);
      }
      this.root=root;this.panel=panel;this.list=document.getElementById('erpGlobalNotifList');this.badge=document.getElementById('erpGlobalNotifBadge');this.button=document.getElementById('erpGlobalNotifBtn');
      if(this.button&&!this.button.dataset.bound){this.button.dataset.bound='1';this.button.addEventListener('click',e=>{e.stopPropagation();this.toggle()})}
      const rf=document.getElementById('erpGlobalNotifRefresh');if(rf&&!rf.dataset.bound){rf.dataset.bound='1';rf.addEventListener('click',()=>this.refresh())}
      if(!document.body.dataset.erpNotifOutsideBound){document.body.dataset.erpNotifOutsideBound='1';document.addEventListener('click',e=>{if(!this.panel||this.panel.hidden)return;if(this.panel.contains(e.target)||this.root?.contains(e.target))return;this.close()});document.addEventListener('keydown',e=>{if(e.key==='Escape')this.close()})}
      return true;
    },
    async waitDb(){for(let i=0;i<30;i++){if(window.db&&window.db.from)return window.db;await new Promise(r=>setTimeout(r,200))}return null},
    add(item){this.items.push({tone:'info',icon:'•',href:'#',module:'ERP',...item})},
    async loadTagihan(db){
      try{const {data,error}=await db.from('master_tagihan').select('id,kategori,cabang,jatuh_tempo_hari,nominal,aktif,notify_owner,notify_svp').eq('aktif',true);if(error)throw error;
        (data||[]).forEach(r=>{const d=this.daysUntilMonthly(r.jatuh_tempo_hari);if(d<0||d>3)return;this.add({tone:d<=1?'urgent':'warning',icon:'⏰',module:'MASTER TAGIHAN',href:'./master-tagihan.html',title:`Tagihan ${String(r.kategori||'').replaceAll('_',' ')} • ${r.cabang||'—'}`,detail:`${d===0?'Jatuh tempo hari ini':`Jatuh tempo H-${d}`} • ${this.money(r.nominal)} • tanggal ${r.jatuh_tempo_hari}`})})
      }catch(e){console.warn('[Notif] tagihan',e)}
    },
    async loadArusKas(db){
      try{const since=this.isoAddDays(this.jakartaToday(),-30);const {data,error}=await db.from('arus_kas_v2_transactions').select('id,tanggal,amount,category,description,verification_status,entry_type').eq('entry_type','MANUAL').gte('tanggal',since).neq('verification_status','OWNER_VERIFIED').order('tanggal',{ascending:false}).limit(20);if(error)throw error;
        (data||[]).forEach(r=>this.add({tone:'warning',icon:'⇄',module:'ARUS KAS',href:'./arus-kas.html',title:'Arus Kas belum diverifikasi',detail:`${r.tanggal||'—'} • ${this.money(r.amount)} • ${r.description||r.category||'Transaksi manual'}`}))
      }catch(e){console.warn('[Notif] arus kas',e)}
    },
    async loadSetoran(db){
      try{const since=this.isoAddDays(this.jakartaToday(),-14);const {data,error}=await db.from('setoran_3_harian').select('id,period_start,period_end,cabang_id,status,owner_verified,request_proof,proof_path,outside_correction_status,outside_correction_note').gte('period_end',since).order('period_end',{ascending:false}).limit(40);if(error)throw error;
        (data||[]).forEach(r=>{
          if(r.request_proof&&!r.proof_path)this.add({tone:'urgent',icon:'📷',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',title:'Bukti setoran diminta',detail:`Periode ${r.period_start} — ${r.period_end} • cabang ID ${r.cabang_id}`});
          const cs=String(r.outside_correction_status||'').toUpperCase();if(cs&&/REQUEST|KOREKSI|CORRECTION/.test(cs))this.add({tone:'urgent',icon:'!',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',title:'Koreksi setoran perlu ditindaklanjuti',detail:`Periode ${r.period_start} — ${r.period_end}${r.outside_correction_note?` • ${r.outside_correction_note}`:''}`});
          if(r.owner_verified===false&&String(r.status||'').toUpperCase()!=='CLEAR')this.add({tone:'warning',icon:'✓',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',title:'Setoran belum Owner Verified',detail:`Periode ${r.period_start} — ${r.period_end} • ${r.status||'menunggu review'}`});
        })
      }catch(e){console.warn('[Notif] setoran',e)}
    },
    async loadIzin(db){
      try{const today=this.jakartaToday();const pending=['PENDING','MENUNGGU','DIAJUKAN','MENUNGGU_SPV','MENUNGGU_OWNER','PENDING_SPV','PENDING_OWNER'];const {data,error}=await db.from('pengajuan_izin').select('id,tanggal,tanggal_selesai,jenis,alasan,status,karyawan_id').gte('tanggal',this.isoAddDays(today,-7)).order('created_at',{ascending:false}).limit(30);if(error)throw error;
        (data||[]).filter(r=>pending.includes(String(r.status||'').toUpperCase())).forEach(r=>this.add({tone:'warning',icon:'🗓',module:'IZIN / LIBUR',href:'./erp-dashboard.html',title:`Pengajuan ${r.jenis||'izin'} menunggu review`,detail:`Karyawan ID ${r.karyawan_id} • ${r.tanggal}${r.tanggal_selesai&&r.tanggal_selesai!==r.tanggal?` s.d. ${r.tanggal_selesai}`:''}`}))
      }catch(e){console.warn('[Notif] izin',e)}
    },
    async loadPengumuman(db){
      try{const since=new Date(Date.now()-7*86400000).toISOString();const {data,error}=await db.from('erp_pengumuman').select('id,judul,prioritas,dibuat_pada,aktif').eq('aktif',true).gte('dibuat_pada',since).order('dibuat_pada',{ascending:false}).limit(10);if(error)throw error;
        (data||[]).filter(r=>/PENTING|URGENT|TINGGI|HIGH/.test(String(r.prioritas||'').toUpperCase())).forEach(r=>this.add({tone:'info',icon:'📢',module:'PENGUMUMAN',href:'./erp-dashboard.html',title:r.judul||'Pengumuman penting',detail:`Prioritas ${r.prioritas||'penting'}`}))
      }catch(e){console.warn('[Notif] pengumuman',e)}
    },
    sortItems(){const rank={urgent:0,warning:1,info:2};this.items.sort((a,b)=>(rank[a.tone]??9)-(rank[b.tone]??9)||String(a.module).localeCompare(String(b.module)))},
    render(){if(!this.ensureUi())return;this.sortItems();const n=this.items.length;this.badge.textContent=n>99?'99+':String(n);this.badge.hidden=!n;this.button.classList.toggle('has-alert',n>0);this.button.setAttribute('aria-label',n?`${n} notifikasi penting`:'Tidak ada notifikasi penting');if(!this.list)return;if(!n){this.list.innerHTML='<div class="erp-global-notif-empty">Tidak ada notifikasi penting saat ini.</div>';return}
      this.list.innerHTML=this.items.slice(0,60).map(x=>`<a class="erp-global-notif-item is-${this.esc(x.tone)}" href="${this.esc(x.href)}"><span class="erp-global-notif-item-icon">${this.esc(x.icon)}</span><span class="erp-global-notif-copy"><strong>${this.esc(x.title)}</strong><p>${this.esc(x.detail)}</p><small>${this.esc(x.module)}</small></span><span class="erp-global-notif-arrow">›</span></a>`).join('')
    },
    async refresh(){if(this.loading)return;this.loading=true;this.ensureUi();const rf=document.getElementById('erpGlobalNotifRefresh');if(rf){rf.classList.add('is-loading');rf.disabled=true}if(this.list)this.list.innerHTML='<div class="erp-global-notif-empty">Memuat notifikasi…</div>';try{const db=await this.waitDb();if(!db)throw new Error('Supabase belum siap');this.items=[];await Promise.all([this.loadTagihan(db),this.loadArusKas(db),this.loadSetoran(db),this.loadIzin(db),this.loadPengumuman(db)]);this.render()}catch(e){console.warn('[Notif] refresh',e);if(this.list)this.list.innerHTML='<div class="erp-global-notif-empty">Notifikasi belum dapat dimuat.</div>'}finally{if(rf){rf.classList.remove('is-loading');rf.disabled=false}this.loading=false}},
    open(){this.ensureUi();this.panel.hidden=false;this.button.setAttribute('aria-expanded','true');this.refresh()},
    close(){if(this.panel)this.panel.hidden=true;if(this.button)this.button.setAttribute('aria-expanded','false')},
    toggle(){if(!this.panel||this.panel.hidden)this.open();else this.close()},
    start(){
      const boot=()=>{if(!this.ensureUi())return false;this.refresh();if(this.timer)clearInterval(this.timer);this.timer=setInterval(()=>this.refresh(),60000);return true};
      if(!boot()){let tries=0;const t=setInterval(()=>{tries++;if(boot()||tries>40)clearInterval(t)},250)}
      const mo=new MutationObserver(()=>{if(this.ensureUi()){const help=this.findHelpDesk();if(help&&help.parentElement&&this.root&&this.root.nextElementSibling!==help&&help.parentElement===this.root.parentElement)help.parentElement.insertBefore(this.root,help)}});mo.observe(document.documentElement,{childList:true,subtree:true});
    }
  };
  window.ERPGlobalNotifications=N;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>N.start(),{once:true});else N.start();
})();
