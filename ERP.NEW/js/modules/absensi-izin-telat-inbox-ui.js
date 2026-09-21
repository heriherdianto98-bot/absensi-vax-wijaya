/* Read-only employee late-arrival inbox in Absensi. Available before the employee clocks in; no attendance mutation. */
(() => {
  'use strict';
  if(window.__vaxLateNoticeInbox)return;window.__vaxLateNoticeInbox=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wibDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let busy=false,started=false;
  function mount(){
    const panel=$('vaxDendaReview');if(!panel||$('vaxLateNoticeInbox'))return Boolean(panel);
    const section=document.createElement('section');section.id='vaxLateNoticeInbox';
    section.style.cssText='border-top:1px solid #536070;margin-top:23px;padding-top:18px';
    section.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h3 style="color:#f5d075;font-size:20px;margin:0 0 5px">Pengajuan Izin Telat Masuk</h3><p style="font-size:15px;margin:0 0 10px">Alasan dan foto dikirim oleh karyawan; terlihat oleh SPV dan Owner sebelum maupun sesudah absen.</p></div><button type="button" id="vaxLateNoticeRefresh">Refresh izin telat</button></div><p id="vaxLateNoticeState" role="status"></p><div id="vaxLateNoticeList" style="display:grid;gap:10px"></div>';
    const next=$('vaxFineDecisionHistory')||$('vaxDendaReceiptHistory');
    if(next&&next.parentElement===panel)panel.insertBefore(section,next);else panel.appendChild(section);
    $('vaxLateNoticeRefresh').addEventListener('click',load);
    return true;
  }
  async function load(){
    if(busy||!mount()||typeof db==='undefined')return;
    busy=true;
    const state=$('vaxLateNoticeState');state.textContent='Memuat pengajuan…';
    try{
      const {data,error}=await db.from('absensi_izin_telat_v1').select('id,karyawan_id,tanggal,alasan,bukti_path,created_at,karyawan:karyawan_id(nama_karyawan,jabatan)').eq('tanggal',wibDay()).order('created_at',{ascending:false}).limit(100);
      if(error)throw error;
      const rows=data||[];
      state.textContent=`${rows.length} pengajuan izin telat hari ini.`;
      $('vaxLateNoticeList').innerHTML=rows.length?rows.map(row=>{
        const at=new Date(row.created_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
        return `<article style="background:#202a35;border:1px solid #485466;border-radius:11px;padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap"><div><strong>${esc(row.karyawan?.nama_karyawan||'Karyawan')}</strong><small style="display:block;font-size:14px;color:#cbd5e1">${esc(row.karyawan?.jabatan||'')} · Dikirim ${esc(at)} WIB</small><p style="white-space:pre-wrap;margin:7px 0;font-size:15px">${esc(row.alasan)}</p></div><button type="button" data-vax-fine-proof="${esc(row.bukti_path)}">Lihat foto karyawan</button></article>`;
      }).join(''):'<p>Belum ada pengajuan izin telat dari akun karyawan hari ini.</p>';
    }catch(error){state.textContent='Gagal memuat izin telat: '+(error?.message||String(error));}
    finally{busy=false;}
  }
  function start(){
    if(started)return;started=true;mount();load();
    $('vaxDendaRefresh')?.addEventListener('click',()=>setTimeout(load,150));
    setInterval(()=>{if(!document.hidden)load();},60000);
  }
  function boot(){if($('vaxDendaReview'))start();else{let count=0;const timer=setInterval(()=>{if($('vaxDendaReview')){clearInterval(timer);start();}else if(++count>90)clearInterval(timer);},250);}}
  document.addEventListener('erp:finance-ready',boot,{once:true});
  if(document.readyState==='complete'&&typeof db!=='undefined')boot();
})();
