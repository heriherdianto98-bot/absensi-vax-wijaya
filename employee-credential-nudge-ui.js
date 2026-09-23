/* Presentation only: secure server determines whether employee credentials need personalization. */
(() => {
 'use strict';
 async function mount(){
  const token=String(localStorage.getItem('employee_session_token')||'').trim();
  if(!token || typeof db==='undefined' || document.getElementById('vaxCredentialNudge')) return;
  try{
   const {data,error}=await db.rpc('karyawan_credential_profile_self',{p_token:token});
   if(error || data?.ok!==true || !data.onboarding_recommended) return;
   const anchor=document.querySelector('.profile-card');if(!anchor)return;
   const banner=document.createElement('a');banner.id='vaxCredentialNudge';banner.href='profil.html';
   banner.setAttribute('aria-label','Buka Profil untuk mengganti password dan mengisi email kontak');
   banner.style.cssText='display:block;margin:9px 0 12px;padding:12px 13px;border:1px solid #b99343;border-radius:13px;background:#272316;color:#ffe1a0;text-decoration:none;font:600 12px/1.55 system-ui,sans-serif';
   banner.textContent='Keamanan akun · Ganti password awal dengan password pribadi dan tambahkan email kontak di Profil.  ›';
   anchor.insertAdjacentElement('afterend',banner);
  }catch(_e){/* dashboard remains usable if credentials service is unavailable */}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
