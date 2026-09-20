/* UI ONLY: analog clock presentation for Owner manual attendance time inputs.
   Retains #vamMasuk/#vamPulang and existing input/change/save handlers. */
(function(){
  'use strict';
  if(window.VaxManualAnalogUI) return;
  window.VaxManualAnalogUI=true;
  const css=`
  #vaxAnalogLayer[hidden]{display:none!important}
  #vaxAnalogLayer{position:fixed;inset:0;z-index:100005;display:grid;place-items:center;background:rgba(0,0,0,.76);padding:16px;box-sizing:border-box}
  #vaxAnalogCard{width:min(390px,100%);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;background:linear-gradient(155deg,#242a33,#171b22);border:1px solid #aa852d;border-radius:17px;padding:20px;color:#f4f5f7;box-shadow:0 20px 70px #000b;scrollbar-width:thin;scrollbar-color:#977532 #242a33}
  #vaxAnalogCard *{box-sizing:border-box}#vaxAnalogCard button{font:inherit;cursor:pointer}#vaxAnalogCard button:focus-visible{outline:2px solid #efc44e;outline-offset:2px}
  #vaxAnalogCard .va-head,#vaxAnalogCard .va-footer{display:flex;align-items:center;justify-content:space-between;gap:10px}
  #vaxAnalogCard .va-head strong{font-size:15px;color:#edc44d}#vaxAnalogCard .va-close,#vaxAnalogCard .va-footer button{border:1px solid #665430;background:#2a3039;color:#f2f3f5;border-radius:9px;padding:9px 13px}
  #vaxAnalogCard .va-display{text-align:center;font-size:34px;font-weight:800;letter-spacing:.04em;color:#f3ca54;font-variant-numeric:tabular-nums;margin:14px 0}
  #vaxAnalogCard .va-switch{display:flex;justify-content:center;gap:8px;margin-bottom:16px}#vaxAnalogCard .va-switch button{border:1px solid #665430;background:#2a3039;color:#eee;border-radius:9px;padding:8px 17px}
  #vaxAnalogCard .va-switch button[aria-pressed=true]{background:#ddba4c;border-color:#ddba4c;color:#171717;font-weight:800}
  #vaxAnalogCard .va-face{position:relative;width:min(280px,100%);aspect-ratio:1;margin:0 auto 8px;border-radius:50%;border:1px solid #9b792e;background:radial-gradient(circle at 35% 25%,#303a46,#202732 65%,#181e27);touch-action:none;user-select:none;box-shadow:inset 0 0 0 5px #ffffff08,0 9px 22px #0006}
  #vaxAnalogCard .va-hand{position:absolute;left:50%;top:50%;height:34%;width:3px;background:#e9bc43;border-radius:3px;transform-origin:50% 100%;pointer-events:none;z-index:1}
  #vaxAnalogCard .va-center{position:absolute;left:50%;top:50%;width:11px;height:11px;transform:translate(-50%,-50%);background:#f2cb54;border-radius:50%;pointer-events:none;z-index:3}
  #vaxAnalogCard .va-mark{position:absolute;width:31px;height:31px;transform:translate(-50%,-50%);border-radius:50%;border:1px solid transparent;background:transparent;color:#f4f5f7;font-size:12px;font-weight:700;display:grid;place-items:center;z-index:2;padding:0}
  #vaxAnalogCard .va-mark:hover{border-color:#a38339;background:#3b382e}#vaxAnalogCard .va-mark[aria-pressed=true]{background:#dfbb4b;color:#161616;font-weight:850;box-shadow:0 3px 12px #e0bb4b35}
  #vaxAnalogCard .va-note{text-align:center;color:#c8b477;font-size:12px;min-height:18px;margin:9px 0 17px}#vaxAnalogCard .va-footer .va-confirm{background:#dbb642;color:#171717;border-color:#dbb642;font-weight:800}
  @media(max-width:400px){#vaxAnalogCard{padding:14px}#vaxAnalogCard .va-face{width:min(244px,100%)}#vaxAnalogCard .va-mark{width:28px;height:28px;font-size:11px}}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const pad=n=>String(n).padStart(2,'0');
  let active=null, priorFocus=null, hour=10,minute=0,mode='hour',pointerStarted=false;
  const layer=document.createElement('div');layer.id='vaxAnalogLayer';layer.hidden=true;document.body.appendChild(layer);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function button(text,cb,cls){const b=el('button',cls,text);b.type='button';b.addEventListener('click',cb);return b;}
  function close(){layer.hidden=true;layer.replaceChildren();active=null;pointerStarted=false;if(priorFocus?.isConnected)priorFocus.focus();priorFocus=null;}
  layer.addEventListener('click',e=>{if(e.target===layer)close();});
  document.addEventListener('keydown',e=>{if(layer.hidden)return;if(e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();close();}else if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)){e.preventDefault();const delta=['ArrowUp','ArrowRight'].includes(e.key)?1:-1;if(mode==='hour')hour=(hour+delta+24)%24;else minute=(minute+delta+60)%60;render();}},true);
  let face,display,hourTab,minuteTab,note;
  function polar(index,outer){const rad=index*Math.PI/6-Math.PI/2;const radius=outer?40:27;return {left:`${50+radius*Math.cos(rad)}%`,top:`${50+radius*Math.sin(rad)}%`};}
  function makeMark(value,index,outer,label){const mark=button(label,()=>{if(mode==='hour'){hour=value;mode='minute';}else minute=value;render();},'va-mark');mark.style.left=polar(index,outer).left;mark.style.top=polar(index,outer).top;mark.setAttribute('aria-label',mode==='hour'?`Jam ${pad(value)}`:`Menit ${pad(value)}`);mark.setAttribute('aria-pressed',String((mode==='hour'?hour:minute)===value));face.appendChild(mark);}
  function render(){if(!active)return;display.textContent=`${pad(hour)}:${pad(minute)}`;hourTab.setAttribute('aria-pressed',String(mode==='hour'));minuteTab.setAttribute('aria-pressed',String(mode==='minute'));note.textContent=mode==='hour'?'Pilih jam 00–23, lalu pilih menit.':'Pilih menit 00–59. Klik atau geser pada jam.';face.replaceChildren();
    const hand=el('div','va-hand');const angle=(mode==='hour'?hour%12:minute/5)*30;hand.style.transform=`translate(-50%,-100%) rotate(${angle}deg)`;face.appendChild(hand);
    if(mode==='hour'){for(let i=0;i<12;i++){const outer=i===0?12:i;makeMark(outer,i,true,pad(outer));makeMark(i===0?0:i+12,i,false,pad(i===0?0:i+12));}}
    else for(let i=0;i<12;i++)makeMark(i*5,i,true,pad(i*5));
    face.appendChild(el('div','va-center'));
  }
  function pickByPointer(e){const box=face.getBoundingClientRect(),x=e.clientX-(box.left+box.width/2),y=e.clientY-(box.top+box.height/2);if(!Number.isFinite(x)||!Number.isFinite(y)||Math.hypot(x,y)<12)return;const angle=(Math.atan2(y,x)*180/Math.PI+90+360)%360;const index=Math.round(angle/30)%12;
    if(mode==='hour'){const inner=Math.hypot(x,y)<box.width*.335;hour=inner?(index===0?0:index+12):(index===0?12:index);}
    else minute=Math.round(angle/6)%60;
    render();
  }
  face=null;
  function open(input,trigger){if(!input||input.disabled)return;close();active=input;priorFocus=trigger;const match=/^(\d{2}):(\d{2})/.exec(input.value||'');hour=match?Math.min(23,Number(match[1])):10;minute=match?Math.min(59,Number(match[2])):0;mode='hour';layer.hidden=false;
    const card=el('section');card.id='vaxAnalogCard';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label',input.id==='vamMasuk'?'Jam masuk analog':'Jam pulang analog');layer.appendChild(card);
    const header=el('div','va-head');header.append(el('strong','',input.id==='vamMasuk'?'Jam masuk (WIB)':'Jam pulang (WIB)'),button('✕',close,'va-close'));card.appendChild(header);
    display=el('div','va-display');card.appendChild(display);
    const tabs=el('div','va-switch');hourTab=button('Jam',()=>{mode='hour';render();});minuteTab=button('Menit',()=>{mode='minute';render();});tabs.append(hourTab,minuteTab);card.appendChild(tabs);
    face=el('div','va-face');face.setAttribute('aria-label','Jam analog');face.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;pointerStarted=true;face.setPointerCapture(e.pointerId);pickByPointer(e);});face.addEventListener('pointermove',e=>{if(pointerStarted)pickByPointer(e);});face.addEventListener('pointerup',()=>{pointerStarted=false;});face.addEventListener('pointercancel',()=>{pointerStarted=false;});card.appendChild(face);
    note=el('div','va-note');card.appendChild(note);const footer=el('div','va-footer');footer.append(button('Batal',close),button('Gunakan jam',()=>{input.value=`${pad(hour)}:${pad(minute)}`;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();},'va-confirm'));card.appendChild(footer);render();hourTab.focus();
  }
  // Capture only manual time picker trigger clicks; original picker continues to own the date control.
  document.addEventListener('click',e=>{const trigger=e.target.closest?.('#vamPanel .vam-picker-trigger');if(!trigger)return;const anchor=trigger.closest('.vam-picker-anchor');const input=anchor?.querySelector('input');if(!input||!['vamMasuk','vamPulang'].includes(input.id))return;e.preventDefault();e.stopImmediatePropagation();open(input,trigger);},true);
  const observer=new MutationObserver(()=>{if(!layer.hidden&&(!active?.isConnected||document.getElementById('vamOverlay')?.hidden))close();});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
})();