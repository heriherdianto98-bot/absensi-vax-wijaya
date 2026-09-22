/* UI ONLY: remove platform-colored calendar emoji from SPV personal leave. */
(()=>{
  'use strict';
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
