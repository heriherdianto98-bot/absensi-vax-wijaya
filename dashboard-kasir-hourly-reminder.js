/* VAX WIJAYA — Kasir Hourly Routine Reminder V1
   Kasir-only operational reminder. No payroll/attendance/finance engine mutation. */
(()=>{
  'use strict';
  if(window.__vaxKasirHourlyReminderV1) return;
  window.__vaxKasirHourlyReminderV1=true;

  const TASKS=[
    {id:'review',text:'Jangan lupa customer yang sudah selesai cukur di-broadcast WhatsApp untuk isi link ulasan Google Review.'},
    {id:'towel',text:'Pastikan handuk / towel di ember tidak menumpuk.'},
    {id:'story',text:'Wajib bikin Story WhatsApp dan Instagram.'}
  ];
  const STORAGE_PREFIX='vax_kasir_hourly_routine_v1';
  const ALERT_PREFIX='vax_kasir_hourly_alerted_v1';
  const SW_URL='kasir-reminder-sw.js?v=20261005-1';
  const PANEL_ID='vaxKasirHourlyReminder';
  let mounted=false;
  let audioCtx=null;
  let swRegistration=null;
  let lastRole='';

  const isKasir=()=>document.documentElement.dataset.homeKpi==='kasir';
  const employeeKey=()=>String(
    localStorage.getItem('karyawan_id')||
    localStorage.getItem('employee_id')||
    localStorage.getItem('user_id')||
    'device'
  ).trim()||'device';

  function pad(v){return String(v).padStart(2,'0');}
  function hourKey(d=new Date()){
    return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate()),pad(d.getHours())].join('-');
  }
  function stateKey(key=hourKey()){return STORAGE_PREFIX+':'+employeeKey()+':'+key;}
  function alertKey(key=hourKey()){return ALERT_PREFIX+':'+employeeKey()+':'+key;}

  function readState(key=hourKey()){
    try{
      const raw=JSON.parse(localStorage.getItem(stateKey(key))||'{}');
      return {checked:Array.isArray(raw.checked)?raw.checked:[],complete:raw.complete===true};
    }catch(_){return {checked:[],complete:false};}
  }
  function writeState(state,key=hourKey()){
    try{localStorage.setItem(stateKey(key),JSON.stringify({...state,updatedAt:new Date().toISOString()}));}catch(_){}
  }
  function wasAlerted(key=hourKey()){
    try{return localStorage.getItem(alertKey(key))==='1';}catch(_){return false;}
  }
  function markAlerted(key=hourKey()){
    try{localStorage.setItem(alertKey(key),'1');}catch(_){}
  }
  function cleanup(){
    try{
      const keepAfter=Date.now()-72*60*60*1000;
      for(let i=localStorage.length-1;i>=0;i--){
        const k=localStorage.key(i)||'';
        if(!k.startsWith(STORAGE_PREFIX+':')&&!k.startsWith(ALERT_PREFIX+':')) continue;
        const parts=k.split(':');
        const stamp=parts[parts.length-1];
        const m=/^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/.exec(stamp);
        if(!m) continue;
        const t=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4])).getTime();
        if(Number.isFinite(t)&&t<keepAfter)localStorage.removeItem(k);
      }
    }catch(_){}
  }

  function injectCss(){
    if(document.getElementById('vaxKasirHourlyReminderStyle'))return;
    const style=document.createElement('style');
    style.id='vaxKasirHourlyReminderStyle';
    style.textContent=`
      #${PANEL_ID}[hidden]{display:none!important}
      #${PANEL_ID}{
        position:fixed;left:50%;top:70px;transform:translateX(-50%);
        width:min(330px,calc(100vw - 24px));z-index:180;
        border:1px solid rgba(25,177,153,.38);border-radius:16px;
        background:linear-gradient(180deg,#f9fffd 0%,#effbf8 100%);
        box-shadow:0 16px 36px rgba(14,91,81,.22),inset 0 1px 0 #fff;
        overflow:hidden;color:#173f3a;font-family:inherit;
      }
      #${PANEL_ID} .vax-routine-head{
        display:flex;align-items:center;gap:9px;padding:10px 11px;
        background:linear-gradient(135deg,#39d2bd 0%,#21bba5 58%,#169b88 100%);
        color:#fff;
      }
      #${PANEL_ID} .vax-routine-icon{
        width:34px;height:34px;border-radius:11px;display:grid;place-items:center;
        background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);
        flex:0 0 auto;font-size:15px;
      }
      #${PANEL_ID} .vax-routine-head div{min-width:0}
      #${PANEL_ID} .vax-routine-head strong{
        display:block;font-size:12.5px;line-height:1.15;font-weight:950;letter-spacing:.035em
      }
      #${PANEL_ID} .vax-routine-head small{
        display:block;margin-top:2px;font-size:8px;font-weight:800;opacity:.92;letter-spacing:.09em
      }
      #${PANEL_ID} .vax-routine-body{padding:9px}
      #${PANEL_ID} .vax-routine-task{
        display:grid;grid-template-columns:25px 1fr;gap:8px;align-items:start;
        margin:0 0 7px;padding:8px;border:1px solid rgba(24,159,139,.16);
        border-radius:11px;background:#fff;box-shadow:0 3px 8px rgba(23,111,99,.07);
        cursor:pointer;
      }
      #${PANEL_ID} .vax-routine-task:last-of-type{margin-bottom:0}
      #${PANEL_ID} .vax-routine-task input{
        appearance:none;width:22px;height:22px;margin:0;border-radius:7px;
        border:1.5px solid #29bda6;background:#f5fffc;display:grid;place-items:center;
      }
      #${PANEL_ID} .vax-routine-task input:checked{
        background:linear-gradient(145deg,#35d0b9,#18a990);border-color:#159780;
      }
      #${PANEL_ID} .vax-routine-task input:checked::after{
        content:'✓';color:#fff;font-size:14px;font-weight:950;line-height:1;
      }
      #${PANEL_ID} .vax-routine-task span{
        font-size:10.5px;line-height:1.38;font-weight:800;color:#294e49;
      }
      #${PANEL_ID} .vax-routine-task.is-done span{text-decoration:line-through;opacity:.58}
      #${PANEL_ID} .vax-routine-foot{
        margin:8px 1px 0;text-align:center;font-size:8.5px;line-height:1.3;
        font-weight:800;color:#6c8883;
      }
      @media(max-width:380px){
        #${PANEL_ID}{top:61px;width:calc(100vw - 18px)}
        #${PANEL_ID} .vax-routine-body{padding:8px}
      }
    `;
    document.head.appendChild(style);
  }

  function mount(){
    if(mounted||document.getElementById(PANEL_ID))return;
    injectCss();
    const panel=document.createElement('aside');
    panel.id=PANEL_ID;
    panel.hidden=true;
    panel.setAttribute('role','alertdialog');
    panel.setAttribute('aria-live','assertive');
    panel.setAttribute('aria-label','Checklist rutin Kasir per jam');
    panel.innerHTML=
      '<header class="vax-routine-head">'+
        '<span class="vax-routine-icon"><i class="fa-solid fa-bell"></i></span>'+
        '<div><strong>CHECKLIST RUTIN KASIR</strong><small>PENGINGAT OTOMATIS · SETIAP 1 JAM</small></div>'+
      '</header>'+
      '<div class="vax-routine-body">'+
        TASKS.map((t,i)=>'<label class="vax-routine-task" data-task="'+t.id+'"><input type="checkbox" value="'+t.id+'" aria-label="Tugas '+(i+1)+'"><span>'+t.text+'</span></label>').join('')+
        '<p class="vax-routine-foot">Pengingat akan hilang setelah semua tugas dicentang sudah dijalankan.</p>'+
      '</div>';
    document.body.appendChild(panel);
    panel.addEventListener('change',onChecklistChange);
    mounted=true;
  }

  function renderCurrent(){
    mount();
    const panel=document.getElementById(PANEL_ID);
    if(!panel)return;
    if(!isKasir()){panel.hidden=true;return;}
    const state=readState();
    if(state.complete){panel.hidden=true;return;}
    const done=new Set(state.checked);
    panel.querySelectorAll('input[type="checkbox"]').forEach(input=>{
      input.checked=done.has(input.value);
      input.closest('.vax-routine-task')?.classList.toggle('is-done',input.checked);
    });
    panel.hidden=false;
  }

  async function onChecklistChange(){
    if(!isKasir())return;
    const panel=document.getElementById(PANEL_ID);
    if(!panel)return;
    const checked=[...panel.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
    panel.querySelectorAll('.vax-routine-task').forEach(label=>{
      const input=label.querySelector('input');
      label.classList.toggle('is-done',!!input?.checked);
    });
    const complete=TASKS.every(t=>checked.includes(t.id));
    writeState({checked,complete});
    try{window.EmployeeHaptic?.success?.();}catch(_){}
    if(complete){
      panel.hidden=true;
      await closeSystemNotification();
    }
  }

  function unlockAudio(){
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return;
      audioCtx=audioCtx||new AC();
      if(audioCtx.state==='suspended')void audioCtx.resume();
    }catch(_){}
  }

  async function beep(){
    try{
      unlockAudio();
      if(!audioCtx||audioCtx.state!=='running')return;
      const now=audioCtx.currentTime;
      [0,0.22].forEach((offset,index)=>{
        const osc=audioCtx.createOscillator();
        const gain=audioCtx.createGain();
        osc.type='sine';
        osc.frequency.value=index===0?880:1046;
        gain.gain.setValueAtTime(0.0001,now+offset);
        gain.gain.exponentialRampToValueAtTime(0.16,now+offset+0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.16);
        osc.connect(gain);gain.connect(audioCtx.destination);
        osc.start(now+offset);osc.stop(now+offset+0.18);
      });
    }catch(_){}
  }

  async function ensureServiceWorker(){
    if(swRegistration)return swRegistration;
    if(!('serviceWorker' in navigator))return null;
    try{
      swRegistration=await navigator.serviceWorker.register(SW_URL,{scope:'./'});
      return swRegistration;
    }catch(error){
      console.warn('[Kasir Reminder] Service worker gagal:',error);
      return null;
    }
  }

  async function showSystemNotification(key){
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    const reg=await ensureServiceWorker();
    const options={
      body:'Ada 3 checklist operasional Kasir yang harus dijalankan. Buka dashboard dan centang setelah selesai.',
      tag:'vax-kasir-routine-'+key,
      renotify:true,
      requireInteraction:true,
      silent:false,
      vibrate:[300,120,300,120,500],
      data:{url:'dashboard-karyawan.html',hourKey:key}
    };
    try{
      if(reg&&typeof reg.showNotification==='function'){
        await reg.showNotification('Pengingat Kasir VAX WIJAYA',options);
      }else{
        new Notification('Pengingat Kasir VAX WIJAYA',options);
      }
    }catch(error){console.warn('[Kasir Reminder] Notifikasi sistem gagal:',error);}
  }

  async function closeSystemNotification(){
    try{
      const reg=await ensureServiceWorker();
      if(!reg?.getNotifications)return;
      const all=await reg.getNotifications();
      all.filter(n=>String(n.tag||'').startsWith('vax-kasir-routine-')).forEach(n=>n.close());
    }catch(_){}
  }

  async function alertDue(force=false){
    if(!isKasir())return;
    mount();
    const key=hourKey();
    const state=readState(key);
    if(state.complete){
      document.getElementById(PANEL_ID).hidden=true;
      return;
    }
    renderCurrent();
    if(!force&&wasAlerted(key))return;
    markAlerted(key);
    try{
      if(typeof navigator.vibrate==='function')navigator.vibrate([300,120,300,120,500]);
      else window.EmployeeHaptic?.strong?.();
    }catch(_){}
    void beep();
    void showSystemNotification(key);
  }

  function roleChanged(){
    const role=document.documentElement.dataset.homeKpi||'';
    if(role===lastRole)return;
    lastRole=role;
    if(role==='kasir')void alertDue(false);
    else{
      const panel=document.getElementById(PANEL_ID);
      if(panel)panel.hidden=true;
    }
  }

  function tick(){
    if(!isKasir())return;
    void alertDue(false);
  }

  function init(){
    cleanup();
    mount();
    document.addEventListener('pointerdown',unlockAudio,{passive:true,capture:true});
    document.addEventListener('keydown',unlockAudio,{capture:true});
    new MutationObserver(roleChanged).observe(document.documentElement,{attributes:true,attributeFilter:['data-home-kpi']});
    roleChanged();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void alertDue(false);});
    window.addEventListener('focus',()=>void alertDue(false));
    setInterval(tick,60000);
    void ensureServiceWorker();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();