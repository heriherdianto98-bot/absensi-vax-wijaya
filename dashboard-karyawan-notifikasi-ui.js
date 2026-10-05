/* 🔒 OWNER LOCK — DASHBOARD KARYAWAN HEADER NOTIFICATION
   PASS by Owner on 2026-09-26.
   Do not modify bell badge/popup presentation or header notification behavior without explicit Owner approval.
*/

/* Employee dashboard notification UI. Merges legacy employee notifications with
   employee-scoped Pengaduan notifications; no owner, attendance or payroll engine is modified here. */
(() => {
  'use strict';
  if (window.__vaxEmployeeNotifBellV1) return;
  window.__vaxEmployeeNotifBellV1 = true;
  const header = document.querySelector('.app .topbar');
  if (!header) return;
  const css = document.createElement('style');
  css.textContent = `
    .app .topbar .topbar-meta{display:none!important}
    .vax-employee-notif{position:relative;margin-left:auto;flex:0 0 auto;z-index:51}
    .vax-employee-notif-toggle{position:relative;width:39px;height:39px;display:flex;align-items:center;justify-content:center;border:0!important;border-radius:0!important;background:transparent!important;color:#efce82;cursor:pointer;box-shadow:none!important;padding:0!important;appearance:none!important}
    .vax-employee-notif-toggle:hover{color:#ffe3a0}
    .vax-employee-notif-toggle i{font-size:22px}
    .vax-employee-notif-count{position:absolute;right:-5px;top:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:99px;background:#df3c3c;color:#fff;font-size:10px;font-weight:800;line-height:18px;text-align:center;border:2px solid #131413;box-sizing:content-box}
    .vax-employee-notif-count[hidden],.vax-employee-notif-panel[hidden]{display:none!important}
    .vax-employee-notif-panel{position:absolute;right:0;top:calc(100% + 9px);width:min(340px,calc(100vw - 38px));max-height:min(440px,65dvh);overflow-y:auto;background:#191a19;color:#f4f0e7;border:1px solid #80663c;border-radius:13px;box-shadow:0 14px 35px #000b;padding:10px;z-index:52}
    .vax-employee-notif-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:13px;font-weight:800;color:#f2d590}
    .vax-employee-notif-refresh{border:1px solid #57472f;border-radius:7px;background:#28261f;color:#f2d590;padding:5px 8px;cursor:pointer;font-size:11px}
    .vax-employee-notif-item{display:flex;flex-direction:column;gap:4px;width:100%;padding:10px 8px;margin:0 0 6px;border-radius:9px;border:1px solid #38352c;background:#232421;color:#f2efe7;text-align:left;cursor:pointer}
    .vax-employee-notif-item strong{font-size:12px;line-height:1.3}.vax-employee-notif-item small{font-size:10px;color:#c7bb9f;line-height:1.4}
    .vax-employee-notif-item.is-pengaduan{border-color:#2e7280;background:linear-gradient(145deg,#16262a,#202421)}
    .vax-employee-notif-item.is-pengaduan strong{color:#8fdee6}
    .vax-employee-notif-item.is-kasbon{border-color:#2a8d78;background:linear-gradient(145deg,#112a25,#202421)}
    .vax-employee-notif-item.is-kasbon strong{color:#73e1c8}
    .vax-employee-notif-empty{font-size:11px;color:#beb8a9;line-height:1.5;margin:7px 2px}
    .vax-employee-notif-item:focus-visible,.vax-employee-notif-toggle:focus-visible{outline:2px solid #e9c776;outline-offset:2px}
    @media(max-width:350px){.vax-employee-notif-panel{width:calc(100vw - 26px)}}
  `;
  document.head.appendChild(css);
  const wrap = document.createElement('div');
  wrap.className = 'vax-employee-notif';
  wrap.innerHTML = '<button type="button" class="vax-employee-notif-toggle" aria-label="Buka pemberitahuan" aria-expanded="false" aria-controls="vaxEmployeeNotifPanel"><i class="fa-regular fa-bell" aria-hidden="true"></i><span class="vax-employee-notif-count" hidden></span></button><section class="vax-employee-notif-panel" id="vaxEmployeeNotifPanel" aria-label="Pemberitahuan karyawan" hidden><div class="vax-employee-notif-panel-head"><span>Pemberitahuan</span><button type="button" class="vax-employee-notif-refresh">Refresh</button></div><div class="vax-employee-notif-list"><p class="vax-employee-notif-empty">Memuat pemberitahuan…</p></div></section>';
  header.appendChild(wrap);
  const toggle=wrap.querySelector('.vax-employee-notif-toggle');
  const count=wrap.querySelector('.vax-employee-notif-count');
  const panel=wrap.querySelector('.vax-employee-notif-panel');
  const list=wrap.querySelector('.vax-employee-notif-list');
  let items=[],loading=false;
  const token=()=>typeof KaryawanSession!=='undefined'&&typeof KaryawanSession.getToken==='function'?KaryawanSession.getToken():'';
  function showMessage(message){list.replaceChildren();const p=document.createElement('p');p.className='vax-employee-notif-empty';p.textContent=message;list.appendChild(p);}
  function render(){
    count.hidden=items.length===0;
    count.textContent=items.length>99?'99+':String(items.length);
    toggle.setAttribute('aria-label',items.length?`Pemberitahuan baru: ${items.length}`:'Buka pemberitahuan');
    if(!items.length){showMessage('Belum ada pemberitahuan baru.');return;}
    list.replaceChildren();
    const visibleItems=items.slice(0,7);
    for(const row of visibleItems){
      const button=document.createElement('button');button.type='button';button.className='vax-employee-notif-item'+(row.jenis==='PENGADUAN'?' is-pengaduan':'')+' is-'+String(row.jenis||'info').toLowerCase();
      const heading=document.createElement('strong');heading.textContent=String(row.judul||'Pemberitahuan');
      const description=document.createElement('small');description.textContent=String(row.ringkasan||'');
      button.append(heading,description);button.addEventListener('click',()=>openItem(row,button));list.appendChild(button);
    }
  }
  async function rpc(name,params){
    if(typeof db==='undefined'||!token())throw new Error('Sesi karyawan belum tersedia.');
    const {data,error}=await db.rpc(name,{p_token:token(),...params});
    if(error)throw error;
    const payload=Array.isArray(data)?data[0]:data;
    if(!payload||payload.ok!==true)throw new Error(payload?.reason||'Data pemberitahuan belum tersedia.');
    return payload;
  }
  async function refresh(){
    if(loading||document.hidden)return;
    loading=true;
    let merged=[],loaded=false;
    try{
      const data=await rpc('karyawan_dashboard_notifikasi_self_v1',{});
      const legacy=Array.isArray(data.items)?data.items.filter(x=>x&&['PENGUMUMAN','IZIN','DENDA','SP','INBOX','GAJI'].includes(x.jenis)&&Number.isSafeInteger(Number(x.id))).map(x=>({...x,created_at:x.created_at||x.waktu||null})):[];
      merged.push(...legacy);loaded=true;
    }catch(error){console.warn('Notifikasi Karyawan:',error);}
    try{
      const data=await rpc('karyawan_pengaduan_notifications_self',{});
      const complaints=Array.isArray(data.items)?data.items.filter(x=>x&&!x.read_at&&Number.isSafeInteger(Number(x.id))&&Number.isSafeInteger(Number(x.ticket_id))).map(x=>({
        jenis:'PENGADUAN',
        id:Number(x.id),
        ticket_id:Number(x.ticket_id),
        judul:String(x.title||'Update pengaduan'),
        ringkasan:String(x.body||''),
        created_at:x.created_at||null,
        level:x.level||'INFO'
      })):[];
      merged.push(...complaints);loaded=true;
    }catch(error){console.warn('Notifikasi Pengaduan Karyawan:',error);}
    try{
      const data=await rpc('employee_kasbon_notifications_self',{});
      const kasbon=Array.isArray(data.items)?data.items.filter(x=>x&&x.request_id&&x.notification_id).map(x=>({
        jenis:'KASBON',
        id:Number(x.notification_id),
        notification_id:Number(x.notification_id),
        request_id:String(x.request_id),
        event_type:String(x.event_type||'INFO'),
        judul:String(x.judul||'Update kasbon'),
        ringkasan:String(x.ringkasan||'Status pengajuan kasbon Anda diperbarui.'),
        created_at:x.created_at||null
      })):[];
      merged.push(...kasbon);loaded=true;
    }catch(error){console.warn('Notifikasi Kasbon Karyawan:',error);}
    items=merged.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    if(loaded)render();else if(!items.length)showMessage('Pemberitahuan belum bisa dimuat. Coba refresh.');
    loading=false;
  }
  function destination(row){
    const id=Number(row.id);
    if(row.jenis==='PENGADUAN')return 'pengaduan.html?ticket='+encodeURIComponent(Number(row.ticket_id));
    if(row.jenis==='KASBON')return 'kasbon-karyawan.html';
    if(row.jenis==='SP')return 'surat-peringatan-saya.html?id='+encodeURIComponent(id);
    if(row.jenis==='INBOX')return 'pesan-karyawan.html';
    if(row.jenis==='GAJI')return 'gaji-saya.html';
    if(row.jenis==='PENGUMUMAN')return 'pengumuman.html#'+id;
    if(row.jenis==='IZIN')return 'riwayat.html';
    return 'absensi.html';
  }
  async function openItem(row,button){
    if(button.disabled)return;
    button.disabled=true;
    try{
      if(row.jenis==='PENGADUAN'){
        await rpc('karyawan_pengaduan_notification_read',{p_notification_id:Number(row.id)});
      }else if(row.jenis==='KASBON'){
        await rpc('employee_kasbon_notification_read',{p_notification_id:Number(row.notification_id||row.id)});
      }else{
        await rpc('karyawan_dashboard_notifikasi_baca_self_v1',{p_jenis:row.jenis,p_id:Number(row.id)});
      }
      items=items.filter(x=>!(x.jenis===row.jenis&&String(x.id)===String(row.id)));
      render();
      window.location.assign(destination(row));
    }catch(error){button.disabled=false;console.warn('Mark read Karyawan:',error);showMessage('Gagal menandai dibaca. Coba lagi melalui Refresh.');}
  }
  toggle.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)void refresh();});
  wrap.querySelector('.vax-employee-notif-refresh').addEventListener('click',()=>void refresh());
  document.addEventListener('click',event=>{if(!wrap.contains(event.target)){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}});
  wrap.hidden=false;
  void refresh();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  setInterval(()=>{if(!document.hidden)void refresh();},60000);
})();