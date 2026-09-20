(function(){
  'use strict';
  const toolbarStyle=document.createElement('link');
  toolbarStyle.rel='stylesheet';
  toolbarStyle.href='../styles/absensi-toolbar-layout-ui.css?v=20260921-1';
  document.head.appendChild(toolbarStyle);
  const matrixGoldStyle=document.createElement('link');
  matrixGoldStyle.rel='stylesheet';
  matrixGoldStyle.href='../styles/absensi-matrix-gold-ui.css?v=20260921-1';
  document.head.appendChild(matrixGoldStyle);
  let started=false;
  function loadManual(){
    if(started)return;
    started=true;
    const script=document.createElement('script');
    script.src='../js/modules/absensi-manual-owner.js?v=20260921-1';
    script.onerror=()=>console.error('Gagal memuat modul input manual Owner');
    script.onload=()=>{
      const picker=document.createElement('script');
      picker.src='../js/modules/absensi-manual-picker-ui.js?v=20260921-1';
      picker.onerror=()=>console.error('Gagal memuat tampilan kalender/jam Owner');
      picker.onload=()=>{
        const analog=document.createElement('script');
        analog.src='../js/modules/absensi-manual-analog-ui.js?v=20260921-1';
        analog.onerror=()=>console.error('Gagal memuat jam analog Owner');
        document.head.appendChild(analog);
      };
      document.head.appendChild(picker);
    };
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
    // Existing attendance loader fills native inputs programmatically: mirror their values in custom UI.
    const watchMessage=()=>{
      const msg=document.getElementById('vamMessage');
      if(!msg)return false;
      new MutationObserver(()=>{
        ['vamTanggal','vamMasuk','vamPulang'].forEach(id=>{
          const input=document.getElementById(id);
          const label=input?.parentElement?.querySelector('.vam-picker-text');
          if(!label)return;
          const value=input.value||'';
          const match=input.type==='date'?/^(\d{4})-(\d{2})-(\d{2})$/.exec(value):null;
          label.textContent=match?`${match[3]}/${match[2]}/${match[1]}`:(value.slice(0,5)||(input.type==='date'?'Pilih tanggal':'Pilih jam'));
        });
      }).observe(msg,{childList:true,characterData:true,subtree:true});
      return true;
    };
    if(!watchMessage()){
      const watcher=new MutationObserver(()=>{if(watchMessage())watcher.disconnect();});
      watcher.observe(document.body,{childList:true,subtree:true});
    }
  },{once:true});
})();