/* ERP VAX — Global Notification Center
   UI/read-only aggregator. Tidak mengubah engine, data, status, approval, atau transaksi.
*/
"use strict";
(function(){
  if(window.ERPGlobalNotifications) return;
  const N={
    root:null,panel:null,list:null,badge:null,button:null,items:[],timer:null,loading:false,role:"",user:null,
    esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))},
    money(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0))},
    jakartaToday(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const g=t=>(p.find(x=>x.type===t)||{}).value;return `${g("year")}-${g("month")}-${g("day")}`},
    isoAddDays(iso,n){const [y,m,d]=iso.split("-").map(Number);const x=new Date(Date.UTC(y,m-1,d));x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)},
    daysUntilMonthly(day){const today=this.jakartaToday(),[y,m,d]=today.split("-").map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();let target=new Date(Date.UTC(y,m-1,Math.min(Number(day)||1,last))),now=new Date(Date.UTC(y,m-1,d));if(target<now){const last2=new Date(Date.UTC(y,m+1,0)).getUTCDate();target=new Date(Date.UTC(y,m,Math.min(Number(day)||1,last2)))}return Math.round((target-now)/86400000)},
    ensureAssets(){if(!document.querySelector('link[data-erp-global-notif-css]')){const l=document.createElement('link');l.rel='stylesheet';l.href='../styles/erp-global-notifications.css?v=20260909-2';l.dataset.erpGlobalNotifCss='1';document.head.appendChild(l)}},
    findHelpDesk(){return [...document.querySelectorAll('a,button')].find(el=>/help\s*desk/i.test(String(el.textContent||'')))||null},
    ensureUi(){
      this.ensureAssets();const header=document.querySelector('.erp-header-vax,.top-header,.erp-header');if(!header)return false;
      let root=document.getElementById('erpGlobalNotif');
      if(!root){root=document.createElement('div');root.id='erpGlobalNotif';root.className='erp-global-notif';root.innerHTML='<button type="button" id="erpGlobalNotifBtn" class="erp-global-notif-btn" aria-label="Notifikasi penting" aria-expanded="false"><span class="erp-global-notif-icon">🔔</span><span id="erpGlobalNotifBadge" class="erp-global-notif-badge" hidden>0</span></button>';const help=this.findHelpDesk(),owner=header.querySelector('.vax-owner');if(help&&help.parentElement===header)header.insertBefore(root,help);else if(owner)header.insertBefore(root,owner);else header.appendChild(root)}
      let panel=document.getElementById('erpGlobalNotifPanel');
      if(!panel){panel=document.createElement('section');panel.id='erpGlobalNotifPanel';panel.className='erp-global-notif-panel';panel.hidden=true;panel.innerHTML='<div class="erp-global-notif-head"><div><strong>Notifikasi ERP</strong><span>Perhatian penting untuk akun aktif</span></div><button type="button" id="erpGlobalNotifRefresh" class="erp-global-notif-refresh"><span class="erp-global-notif-refresh-icon">↻</span><span>Refresh</span></button></div><div id="erpGlobalNotifList" class="erp-global-notif-list"></div><div class="erp-global-notif-foot">Read only • klik notifikasi untuk membuka modul terkait</div>';document.body.appendChild(panel)}
      this.root=root;this.panel=panel;this.list=document.getElementById('erpGlobalNotifList');this.badge=document.getElementById('erpGlobalNotifBadge');this.button=document.getElementById('erpGlobalNotifBtn');
      if(this.button&&!this.button.dataset.bound){this.button.dataset.bound='1';this.button.addEventListener('click',e=>{e.stopPropagation();this.toggle()})}
      const rf=document.getElementById('erpGlobalNotifRefresh');if(rf&&!rf.dataset.bound){rf.dataset.bound='1';rf.addEventListener('click',()=>this.refresh())}
      if(!document.body.dataset.erpNotifOutsideBound){document.body.dataset.erpNotifOutsideBound='1';document.addEventListener('click',e=>{if(!this.panel||this.panel.hidden)return;if(this.panel.contains(e.target)||this.root?.contains(e.target))return;this.close()});document.addEventListener('keydown',e=>{if(e.key==='Escape')this.close()})}
      return true;
    },
    async waitDb(){for(let i=0;i<30;i++){if(window.db&&window.db.from)return window.db;await new Promise(r=>setTimeout(r,200))}return null},
    async loadIdentity(db){
      try{const {data:s}=await db.auth.getSession();this.user=s?.session?.user||null;if(!this.user){this.role='';return}const {data:p}=await db.from('profiles').select('role,aktif').eq('id',this.user.id).maybeSingle();if(!p||p.aktif===false){this.role='';return}this.role=String(p.role||'').toLowerCase();if(this.role==='spv')this.role='svp'}catch(e){console.warn('[Notif] identity',e);this.role=''}
    },
    add(item){const x={tone:'info',icon:'•',href:'#',module:'ERP',...item};const key=x.key||`${x.module}|${x.title}|${x.detail}`;if(this.items.some(i=>i._key===key))return;x._key=key;this.items.push(x)},
    async loadInvoices(db){
      if(!['owner','svp'].includes(this.role))return;
      try{
        const {data,error}=await db.from('svp_invoices').select('id,invoice_no,title,total,status,sender_role,created_by,created_at,updated_at').order('created_at',{ascending:false}).limit(40);if(error)throw error;
        (data||[]).forEach(r=>{
          const st=String(r.status||'draft').toLowerCase();if(['paid','approved'].includes(st))return;
          const sr=String(r.sender_role||'owner').toLowerCase(),fromSvp=['svp','spv'].includes(sr);
          if(this.role==='owner'&&!fromSvp)return;
          if(this.role==='svp'&&fromSvp)return;
          const incoming=this.role==='owner'?'SVP → OWNER':'OWNER → SVP';
          const title=this.role==='owner'?'Invoice SVP menunggu ACC Owner':'Invoice Owner menunggu ACC SVP';
          this.add({key:`invoice:${r.id}:${this.role}`,tone:'urgent',icon:'▤',module:'INVOICE',href:`./master-tagihan.html?focus=invoice&invoice=${encodeURIComponent(r.id)}`,title,detail:`${r.invoice_no||'Invoice'} • ${this.money(r.total)}${r.title?` • ${r.title}`:''} • ${incoming}`});
        });
      }catch(e){console.warn('[Notif] invoice',e)}
    },
    async loadTagihan(db){
      if(!['owner','svp'].includes(this.role))return;
      try{
        const {data,error}=await db.from('master_tagihan').select('id,kategori,cabang,jatuh_tempo_hari,nominal,aktif,notify_owner,notify_svp').eq('aktif',true);if(error)throw error;
        (data||[]).forEach(r=>{
          if(this.role==='owner'&&!r.notify_owner)return;if(this.role==='svp'&&!r.notify_svp)return;
          const d=this.daysUntilMonthly(r.jatuh_tempo_hari);if(d<0||d>7)return;
          this.add({key:`tagihan:${r.id}:${this.role}`,tone:d<=1?'urgent':'warning',icon:'⏰',module:'MASTER TAGIHAN',href:`./master-tagihan.html?focus=tagihan&id=${encodeURIComponent(r.id)}`,title:`Tagihan ${String(r.kategori||'').replaceAll('_',' ')} • ${r.cabang||'—'}`,detail:`${d===0?'Jatuh tempo hari ini':`Jatuh tempo H-${d}`} • ${this.money(r.nominal)} • tanggal ${r.jatuh_tempo_hari}`});
        });
      }catch(e){console.warn('[Notif] tagihan',e)}
    },
    async loadArusKas(db){
      if(this.role!=='owner')return;
      try{const since=this.isoAddDays(this.jakartaToday(),-30),{data,error}=await db.from('arus_kas_v2_transactions').select('id,tanggal,amount,category,description,verification_status,entry_type').eq('entry_type','MANUAL').gte('tanggal',since).neq('verification_status','OWNER_VERIFIED').order('tanggal',{ascending:false}).limit(20);if(error)throw error;(data||[]).forEach(r=>this.add({tone:'warning',icon:'⇄',module:'ARUS KAS',href:'./arus-kas.html',title:'Arus Kas belum diverifikasi',detail:`${r.tanggal||'—'} • ${this.money(r.amount)} • ${r.description||r.category||'Transaksi manual'}`}))}catch(e){console.warn('[Notif] arus kas',e)}
    },
    // Read-only mirror of the LOCKED CashOutWarning rule: individual items, strictly > Rp205.000.
    async loadCashOutWarnings(db){
      if(!['owner','svp'].includes(this.role))return;
      try{
        const since=this.isoAddDays(this.jakartaToday(),-7);
        const [{data:branches,error:branchError},{data:recaps,error:recapError}]=await Promise.all([
          db.from('cabang').select('id,nama_cabang,aktif'),
          db.from('daily_recap_source').select('tanggal,cabang_id,keterangan_cash_out').gte('tanggal',since).lte('tanggal',this.jakartaToday()).order('tanggal',{ascending:false})
        ]);
        if(branchError)throw branchError;if(recapError)throw recapError;
        const active=new Map((branches||[]).filter(c=>c.aktif!==false&&!/floating/i.test(String(c.nama_cabang||''))).map(c=>[String(c.id),String(c.nama_cabang||'').replace(/\bVax\s+Wijaya\b/gi,'').trim()]));
        // The warning monitor is the only owner of parsing and the threshold; never recalculate from daily totals.
        const parser=window.CashOutWarning||(typeof CashOutWarning!=='undefined'?CashOutWarning:null);
        if(!parser||typeof parser.parseSegment!=='function')return;
        (recaps||[]).forEach(r=>{
          const cabang=active.get(String(r.cabang_id));if(!cabang)return;
          String(r.keterangan_cash_out||'').split(/\s*;\s*/).filter(Boolean).forEach((chunk,index)=>{
            const item=parser.parseSegment(chunk);
            if(!item||Number(item.nominal)<=parser.LIMIT)return;
            const date=String(r.tanggal||'').slice(0,10);
            this.add({key:`cashout:${date}:${r.cabang_id}:${index}:${chunk.trim()}`,tone:'urgent',icon:'!',module:'CASH OUT',href:'./erp-dashboard.html#cashout-warning-section',title:`Cash Out > Rp205.000 • ${cabang}`,detail:`${date} • ${this.money(item.nominal)} • ${item.keterangan} • ${item.kasir||'Kasir tidak tersedia'}`});
          });
        });
      }catch(e){console.warn('[Notif] cash out',e)}
    },
    async loadSetoran(db){
      try{const since=this.isoAddDays(this.jakartaToday(),-14),{data,error}=await db.from('setoran_3_harian').select('id,period_start,period_end,cabang_id,status,owner_verified,request_proof,proof_path,outside_correction_status,outside_correction_note').gte('period_end',since).order('period_end',{ascending:false}).limit(40);if(error)throw error;(data||[]).forEach(r=>{if(r.request_proof&&!r.proof_path)this.add({tone:'urgent',icon:'📷',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',title:'Bukti setoran diminta',detail:`Periode ${r.period_start} — ${r.period_end} • cabang ID ${r.cabang_id}`});const cs=String(r.outside_correction_status||'').toUpperCase();if(cs&&/REQUEST|KOREKSI|CORRECTION/.test(cs))this.add({tone:'urgent',icon:'!',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',title:'Koreksi setoran perlu ditindaklanjuti',detail:`Periode ${r.period_start} — ${r.period_end}${r.outside_correction_note?` • ${r.outside_correction_note}`:''}`});if(this.role==='owner'&&r.owner_verified===false&&String(r.status||'').toUpperCase()!=='CLEAR')this.add({tone:'warning',icon:'✓',module:'SETORAN 3 HARIAN',href:'./setoran-3-harian.html',title:'Setoran belum Owner Verified',detail:`Periode ${r.period_start} — ${r.period_end} • ${r.status||'menunggu review'}`})})}catch(e){console.warn('[Notif] setoran',e)}
    },
    async loadIzin(db){
      if(!['owner','svp'].includes(this.role))return;
      try{
        const status=this.role==='owner'?'MENUNGGU_OWNER':'MENUNGGU_SPV';
        const {data,error}=await db.from('pengajuan_izin')
          .select('id,tanggal,tanggal_selesai,jenis,status,karyawan_id,karyawan:karyawan_id(nama_karyawan,jabatan)')
          .eq('status',status).order('created_at',{ascending:false}).limit(100);
        if(error)throw error;
        (data||[]).forEach(r=>{
          const name=r.karyawan?.nama_karyawan||`Karyawan ID ${r.karyawan_id}`;
          const svp=/\b(spv|svp|supervisor)\b/i.test(String(r.karyawan?.jabatan||''));
          const owner=this.role==='owner';
          this.add({key:`izin:${r.id}:${this.role}`,tone:owner&&!svp?'urgent':'warning',
            icon:'!',module:'ABSENSI / IZIN',href:'./absensi.html',
            title:owner?(svp?'Pengajuan SVP menunggu keputusan Owner':'SVP belum memutus; keputusan dialihkan ke Owner'):'Pengajuan menunggu keputusan SVP (batas 13.00 WIB)',
            detail:`${name} - ${r.jenis||'izin'} - ${r.tanggal}${r.tanggal_selesai&&r.tanggal_selesai!==r.tanggal?` s.d. ${r.tanggal_selesai}`:''}`});
        });
      }catch(e){console.warn('[Notif] izin',e)}
    },
    async loadPengumuman(db){
      try{const since=new Date(Date.now()-7*86400000).toISOString(),{data,error}=await db.from('erp_pengumuman').select('id,judul,prioritas,dibuat_pada,aktif').eq('aktif',true).gte('dibuat_pada',since).order('dibuat_pada',{ascending:false}).limit(10);if(error)throw error;(data||[]).filter(r=>/PENTING|URGENT|TINGGI|HIGH/.test(String(r.prioritas||'').toUpperCase())).forEach(r=>this.add({tone:'info',icon:'📢',module:'PENGUMUMAN',href:'./erp-dashboard.html',title:r.judul||'Pengumuman penting',detail:`Prioritas ${r.prioritas||'penting'}`}))}catch(e){console.warn('[Notif] pengumuman',e)}
    },
    sortItems(){const rank={urgent:0,warning:1,info:2};this.items.sort((a,b)=>(rank[a.tone]??9)-(rank[b.tone]??9)||String(a.module).localeCompare(String(b.module)))},
    render(){if(!this.ensureUi())return;this.sortItems();const n=this.items.length;this.badge.textContent=n>99?'99+':String(n);this.badge.hidden=!n;this.button.classList.toggle('has-alert',n>0);this.button.setAttribute('aria-label',n?`${n} notifikasi penting`:'Tidak ada notifikasi penting');if(!this.list)return;if(!n){this.list.innerHTML='<div class="erp-global-notif-empty">Tidak ada notifikasi penting saat ini.</div>';return}this.list.innerHTML=this.items.slice(0,60).map(x=>`<a class="erp-global-notif-item is-${this.esc(x.tone)}" href="${this.esc(x.href)}"><span class="erp-global-notif-item-icon">${this.esc(x.icon)}</span><span class="erp-global-notif-copy"><strong>${this.esc(x.title)}</strong><p>${this.esc(x.detail)}</p><small>${this.esc(x.module)}</small></span><span class="erp-global-notif-arrow">›</span></a>`).join('')},
    focusLinkedModule(){
      if(!/master-tagihan\.html$/i.test(location.pathname))return;const q=new URLSearchParams(location.search),focus=q.get('focus');if(!focus)return;const target=focus==='invoice'?'#mtInvoiceCard':'.mt-card';let tries=0;const t=setInterval(()=>{const el=document.querySelector(target);if(el){clearInterval(t);el.scrollIntoView({behavior:'smooth',block:'center'});el.animate([{boxShadow:'0 0 0 0 rgba(68,190,235,0)'},{boxShadow:'0 0 0 3px rgba(68,190,235,.55)'},{boxShadow:'0 0 0 0 rgba(68,190,235,0)'}],{duration:1400,easing:'ease-out'})}else if(++tries>30)clearInterval(t)},180)
    },
    async refresh(){if(this.loading)return;this.loading=true;this.ensureUi();const rf=document.getElementById('erpGlobalNotifRefresh');if(rf){rf.classList.add('is-loading');rf.disabled=true}if(this.list)this.list.innerHTML='<div class="erp-global-notif-empty">Memuat notifikasi…</div>';try{const db=await this.waitDb();if(!db)throw new Error('Supabase belum siap');this.items=[];await this.loadIdentity(db);await Promise.all([this.loadInvoices(db),this.loadTagihan(db),this.loadArusKas(db),this.loadCashOutWarnings(db),this.loadSetoran(db),this.loadIzin(db),this.loadPengumuman(db)]);this.render()}catch(e){console.warn('[Notif] refresh',e);if(this.list)this.list.innerHTML='<div class="erp-global-notif-empty">Notifikasi belum dapat dimuat.</div>'}finally{if(rf){rf.classList.remove('is-loading');rf.disabled=false}this.loading=false}},
    open(){this.ensureUi();this.panel.hidden=false;this.button.setAttribute('aria-expanded','true');this.refresh()},
    close(){if(this.panel)this.panel.hidden=true;if(this.button)this.button.setAttribute('aria-expanded','false')},
    toggle(){if(!this.panel||this.panel.hidden)this.open();else this.close()},
    start(){const boot=()=>{if(!this.ensureUi())return false;this.refresh();this.focusLinkedModule();if(this.timer)clearInterval(this.timer);this.timer=setInterval(()=>this.refresh(),60000);return true};if(!boot()){let tries=0;const t=setInterval(()=>{tries++;if(boot()||tries>40)clearInterval(t)},250)}const mo=new MutationObserver(()=>{if(this.ensureUi()){const help=this.findHelpDesk();if(help&&help.parentElement&&this.root&&this.root.nextElementSibling!==help&&help.parentElement===this.root.parentElement)help.parentElement.insertBefore(this.root,help)}});mo.observe(document.documentElement,{childList:true,subtree:true})}
  };
  window.ERPGlobalNotifications=N;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>N.start(),{once:true});else N.start();
})();