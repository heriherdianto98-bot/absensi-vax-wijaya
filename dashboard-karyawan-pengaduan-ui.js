(()=>{'use strict';
async function initPengaduanCard(){
 const card=document.getElementById('cardPengaduan');if(!card)return;
 const open=()=>{window.location.href='pengaduan.html';};
 card.addEventListener('click',open);
 card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
 const badge=document.getElementById('pengaduanBadge'),preview=document.getElementById('pengaduanPreview');
 try{
   const token=window.KaryawanSession?.getToken?.()||localStorage.getItem('employee_session_token')||'';
   if(!token||typeof db==='undefined')return;
   const {data,error}=await db.rpc('karyawan_pengaduan_notifications_self',{p_token:token});
   if(error||!data?.ok)return;
   const unread=Number(data.unread||0);
   if(badge){badge.textContent=unread>99?'99+':String(unread);badge.hidden=unread<1;}
   if(preview)preview.textContent=unread>0?(unread+' update pengaduan belum dibaca.'):'Laporkan masalah kerja dan pantau penanganannya.';
 }catch(e){console.warn('Pengaduan card notification:',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPengaduanCard,{once:true});else void initPengaduanCard();
})();