/* UI ONLY: theme calendar glyphs and isolated daily status presentation. */
(()=>{
  'use strict';
  // Preserve original table rows, filter logic and click handlers.
  if(!document.getElementById('vax-absensi-status-compact-css')){
    const link=document.createElement('link');
    link.id='vax-absensi-status-compact-css';
    link.rel='stylesheet';
    link.href='../styles/absensi-status-compact-panels-ui.css?v=20260922-2';
    document.head.appendChild(link);
  }
  if(!document.getElementById('vax-absensi-status-compact-time')){
    const script=document.createElement('script');
    script.id='vax-absensi-status-compact-time';
    script.src='../js/modules/absensi-status-compact-time-ui.js?v=20260922-1';
    script.defer=true;
    document.head.appendChild(script);
  }
  if(!document.getElementById('vax-absensi-kpi-review-typewriter-css')){
    const link=document.createElement('link');
    link.id='vax-absensi-kpi-review-typewriter-css';
    link.rel='stylesheet';
    link.href='../styles/absensi-kpi-review-typewriter-ui.css?v=20260922-1';
    document.head.appendChild(link);
  }
  const style=document.createElement('style');
  style.id='vax-spv-leave-calendar-icon-ui';
  style.textContent=`
    #spvPersonalLeave .spv-range-icon,
    #spvPersonalLeave .spv-leave-days-icon {
      position:relative!important;
      flex:0 0 29px!important;
      display:inline-grid!important;
      place-items:center!important;
      width:29px!important;
      height:29px!important;
      box-sizing:border-box!important;
      font-size:0!important;
      line-height:0!important;
      color:transparent!important;
      background:linear-gradient(145deg,#ffe4a0,#c2952b)!important;
      border:1px solid #d6ad52!important;
      border-radius:8px!important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 2px 5px rgba(0,0,0,.5)!important;
      overflow:hidden!important;
    }
    #spvPersonalLeave .spv-range-icon::before,
    #spvPersonalLeave .spv-leave-days-icon::before {
      content:''!important;
      position:absolute;
      inset:7px 5px 5px!important;
      border:2px solid #382808!important;
      border-radius:3px!important;
      box-sizing:border-box!important;
      pointer-events:none!important;
    }
    #spvPersonalLeave .spv-range-icon::after,
    #spvPersonalLeave .spv-leave-days-icon::after {
      content:''!important;
      position:absolute;
      top:12px!important;
      left:7px!important;
      width:15px!important;
      height:2px!important;
      background:#382808!important;
      box-shadow:0 -7px 0 -0.3px #382808!important;
      pointer-events:none!important;
    }
  `;
  document.head.appendChild(style);
})();
