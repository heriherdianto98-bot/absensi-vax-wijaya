(()=>{'use strict';

let audioCtx=null;

function haptic(){
  try{
    if('vibrate' in navigator) navigator.vibrate(35);
  }catch(_){}
}

function clickSound(){
  try{
    const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextCtor) return;
    if(!audioCtx) audioCtx=new AudioContextCtor();
    const ctx=audioCtx;
    if(ctx.state==='suspended') ctx.resume().catch(()=>{});

    const now=ctx.currentTime;
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();

    osc.type='sine';
    osc.frequency.setValueAtTime(520,now);
    osc.frequency.exponentialRampToValueAtTime(420,now+0.045);

    gain.gain.setValueAtTime(0.0001,now);
    gain.gain.exponentialRampToValueAtTime(0.055,now+0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now+0.06);
  }catch(_){}
}

function feedback(){
  haptic();
  clickSound();
}

function init(){
  const nav=document.getElementById('bottomNav');
  if(!nav||nav.dataset.feedbackReady==='1') return;
  nav.dataset.feedbackReady='1';

  let lastFeedbackAt=0;
  const trigger=(event)=>{
    const link=event.target.closest('a');
    if(!link||!nav.contains(link)) return;
    const now=Date.now();
    if(now-lastFeedbackAt<120) return;
    lastFeedbackAt=now;
    feedback();
  };

  nav.addEventListener('touchstart',trigger,{passive:true});
  nav.addEventListener('pointerdown',trigger,{passive:true});
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}
})();
