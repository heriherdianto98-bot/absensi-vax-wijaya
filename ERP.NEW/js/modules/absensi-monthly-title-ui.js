(function(){
  'use strict';
  const toolbarStyle=document.createElement('link');
  toolbarStyle.rel='stylesheet';
  toolbarStyle.href='../styles/absensi-toolbar-layout-ui.css?v=20260921-1';
  document.head.appendChild(toolbarStyle);
  let started=false;
  function loadManual(){
    if(started)return;
    started=true;
    const script=document.createElement('script');
    script.src='../js/modules/absensi-manual-owner.js?v=20260921-1';
    script.onerror=()=>console.error('Gagal memuat modul input manual Owner');
    document.head.appendChild(script);
  }
  document.addEventListener('erp:finance-ready',loadManual,{once:true});
  if(typeof db!=='undefined' && document.readyState==='complete')loadManual();
  function dailyButton(){
    const monthly=document.querySelector('#absensiMonthlyHost #vamOpen');
    const daily=document.querySelector('#absensiDailyView .toolbar-right');
    if(!monthly||!daily||daily.querySelector('#vamDailyOpen'))return;
    const btn=document.createElement('button');
    btn.id='vamDailyOpen';btn.type='button';btn.className='absensi-btn-primary';btn.textContent='Input / Edit Manual';
    btn.addEventListener('click',()=>monthly.click());
    daily.appendChild(btn);
  }
  document.addEventListener('erp:finance-ready',()=>{
    dailyButton();
    const root=document.getElementById('absensiRoot');
    if(root)new MutationObserver(dailyButton).observe(root,{childList:true,subtree:true});
  },{once:true});
})();