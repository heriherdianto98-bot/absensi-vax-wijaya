/* UI ONLY. Replaces the native picker presentation in the Owner manual attendance modal.
   The existing date/time input elements, their values and every save/validation handler remain unchanged. */
(function(){
  'use strict';
  if(window.VaxManualPickerUI)return;
  window.VaxManualPickerUI=true;
  const $=id=>document.getElementById(id);
  const pad=n=>String(n).padStart(2,'0');
  const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const css=`
    #vamPanel .vam-picker-anchor{position:relative;display:block;min-width:0}
    #vamPanel .vam-picker-source{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important;top:50%;left:12px;padding:0!important;border:0!important}
    #vamPanel .vam-picker-trigger{width:100%;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;background:#242a32;color:#f7f7f8;border:1px solid #525b69;border-radius:9px;padding:10px 13px;font:inherit;font-weight:650;cursor:pointer;box-sizing:border-box}
    #vamPanel .vam-picker-trigger:hover{border-color:#d4af37}#vamPanel .vam-picker-trigger:focus-visible{outline:2px solid #f0c84b;outline-offset:2px}
    #vamPanel .vam-picker-trigger svg{flex:none;width:18px;height:18px;fill:none;stroke:#eac34f;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    #vamPanel .vam-picker-trigger[disabled]{opacity:.48;cursor:not-allowed}
    #vamPickerLayer[hidden]{display:none!important}#vamPickerLayer{position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:14px;box-sizing:border-box}
    #vamPickerCard{width:min(390px,100%);max-height:min(580px,calc(100dvh - 28px));overflow:auto;box-sizing:border-box;background:#1a2028;border:1px solid rgba(232,190,67,.72);border-radius:16px;box-shadow:0 24px 70px #000b;color:#f7f8fa;padding:18px}
    #vamPickerCard button{font:inherit;cursor:pointer;color:#f7f8fa}#vamPickerCard button:focus-visible{outline:2px solid #f0c84b;outline-offset:2px}
    #vamPickerCard .vmp-head{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:14px}
    #vamPickerCard .vmp-head strong{font-size:15px;color:#f0c84b}#vamPickerCard .vmp-nav{display:flex;gap:6px}
    #vamPickerCard .vmp-nav button,#vamPickerCard .vmp-foot button{border:1px solid #554b31;background:#282e37;border-radius:9px;padding:7px 11px}
    #vamPickerCard .vmp-nav button:disabled,#vamPickerCard .vmp-cell:disabled{opacity:.25;cursor:not-allowed}
    #vamPickerCard .vmp-week,#vamPickerCard .vmp-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;text-align:center}
    #vamPickerCard .vmp-week{font-size:11px;color:#c1a65b;margin-bottom:7px;font-weight:750}
    #vamPickerCard .vmp-cell{height:39px;min-width:0;border:1px solid transparent;border-radius:9px;background:transparent}
    #vamPickerCard .vmp-cell:not(:disabled):hover{border-color:#bd962d;background:#34302a}
    #vamPickerCard .vmp-cell.is-selected{background:#d6ae38!important;color:#171717!important;font-weight:800}
    #vamPickerCard .vmp-cell.is-today:not(.is-selected){border-color:#9f7a24;color:#f5cd58}
    #vamPickerCard .vmp-foot{display:flex;justify-content:space-between;gap:8px;margin-top:16px}
    #vamPickerCard .vmp-foot .vmp-primary{background:#d6ae38;color:#151515;border-color:#d6ae38;font-weight:800}
    #vamPickerCard .vmp-time{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    #vamPickerCard .vmp-time-col{min-width:0}#vamPickerCard .vmp-time-col>span{display:block;color:#eac34f;font-size:12px;font-weight:750;margin-bottom:8px}
    #vamPickerCard .vmp-number-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;max-height:245px;overflow:auto;overscroll-behavior:contain;padding:3px;background:#222832;border:1px solid #3c4552;border-radius:10px}
    #vamPickerCard .vmp-number-grid button{height:37px;border:1px solid transparent;border-radius:7px;background:transparent;font-variant-numeric:tabular-nums}
    #vamPickerCard .vmp-number-grid button:hover{background:#353c48;border-color:#96782e}
    #vamPickerCard .vmp-number-grid button.is-selected{background:#d6ae38;color:#171717;font-weight:800}
    #vamPickerCard .vmp-time-preview{text-align:center;font-size:26px;font-weight:800;color:#f5cb54;font-variant-numeric:tabular-nums;margin:0 0 14px}
    @media(max-width:420px){#vamPickerCard{padding:14px}#vamPickerCard .vmp-number-grid{max-height:190px}}
  `;
  const icon=kind=>kind==='date'?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  let active=null,focusReturn=null;
  function format(input){
    if(!input.value)return input.type==='date'?'Pilih tanggal':'Pilih jam';
    if(input.type==='date'){
      const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(input.value);
      return m?`${m[3]}/${m[2]}/${m[1]}`:input.value;
    }
    return input.value.slice(0,5);
  }
  function sync(input){
    const trigger=input.parentElement?.querySelector('.vam-picker-trigger');
    if(trigger)trigger.querySelector('.vam-picker-text').textContent=format(input);
  }
  function setValue(input,value){
    input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    sync(input);
  }
  function close(){
    const layer=$('vamPickerLayer');if(!layer)return;
    layer.hidden=true;layer.replaceChildren();active=null;
    if(focusReturn?.isConnected)focusReturn.focus();focusReturn=null;
  }
  function shell(input,title){
    const layer=$('vamPickerLayer');layer.replaceChildren();layer.hidden=false;active=input;
    const card=document.createElement('section');card.id='vamPickerCard';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label',title);
    layer.appendChild(card);return card;
  }
  function node(tag,klass,text){const el=document.createElement(tag);if(klass)el.className=klass;if(text!==undefined)el.textContent=text;return el;}
  function btn(text,fn,klass){const el=node('button',klass,text);el.type='button';el.addEventListener('click',fn);return el;}
  function footer(card,extra){
    const foot=node('div','vmp-foot');foot.appendChild(btn('Batal',close));
    if(extra)foot.appendChild(extra);card.appendChild(foot);
  }
  function datePicker(input){
    const card=shell(input,'Pilih tanggal absensi');
    const max=input.max||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
    const initial=/^\d{4}-\d{2}-\d{2}$/.test(input.value)?input.value:max;
    let [year,month]=initial.split('-').map(Number);
    const head=node('div','vmp-head'),title=node('strong'),nav=node('div','vmp-nav');
    const prev=btn('‹',()=>{if(month===1){year--;month=12;}else month--;render();});
    const next=btn('›',()=>{if(month===12){year++;month=1;}else month++;render();});
    prev.setAttribute('aria-label','Bulan sebelumnya');next.setAttribute('aria-label','Bulan berikutnya');
    nav.append(prev,next);head.append(title,nav);card.appendChild(head);
    const weekdays=node('div','vmp-week');['Sen','Sel','Rab','Kam','Jum','Sab','Min'].forEach(v=>weekdays.appendChild(node('span','',v)));
    card.appendChild(weekdays);const days=node('div','vmp-days');card.appendChild(days);
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
    footer(card,btn('Hari ini',()=>{setValue(input,today<=max?today:max);close();},'vmp-primary'));
    function render(){
      title.textContent=`${months[month-1]} ${year}`;next.disabled=`${year}-${pad(month)}-01`>max.slice(0,7)+'-01';
      days.replaceChildren();const offset=(new Date(year,month-1,1).getDay()+6)%7;
      for(let i=0;i<offset;i++)days.appendChild(node('span'));
      const count=new Date(year,month,0).getDate();
      for(let d=1;d<=count;d++){
        const iso=`${year}-${pad(month)}-${pad(d)}`;
        const el=btn(String(d),()=>{setValue(input,iso);close();},'vmp-cell');
        el.disabled=iso>max||(input.min&&iso<input.min);
        if(iso===input.value){el.classList.add('is-selected');el.setAttribute('aria-current','date');}
        if(iso===today)el.classList.add('is-today');
        days.appendChild(el);
      }
    }
    render();prev.focus();
  }
  function timePicker(input){
    const card=shell(input,`Pilih ${input.id==='vamMasuk'?'jam masuk':'jam pulang'}`);
    const m=/^(\d{2}):(\d{2})/.exec(input.value||'');
    let hour=m?Number(m[1]):10,minute=m?Number(m[2]):0;
    const head=node('div','vmp-head'),title=node('strong','',input.id==='vamMasuk'?'Jam masuk (WIB)':'Jam pulang (WIB)');
    head.append(title,btn('✕',close));card.appendChild(head);
    const preview=node('div','vmp-time-preview');card.appendChild(preview);
    const grid=node('div','vmp-time');card.appendChild(grid);
    function column(label,total,get,set){
      const col=node('div','vmp-time-col');col.appendChild(node('span','',label));
      const numbers=node('div','vmp-number-grid');numbers.setAttribute('role','group');numbers.setAttribute('aria-label',label);
      for(let i=0;i<total;i++){
        const value=i;const b=btn(pad(value),()=>{set(value);paint();});b.dataset.value=String(value);numbers.appendChild(b);
      }
      col.appendChild(numbers);grid.appendChild(col);
      return {numbers,get};
    }
    const h=column('Jam',24,()=>hour,n=>{hour=n;});
    const min=column('Menit',60,()=>minute,n=>{minute=n;});
    function paint(){
      preview.textContent=`${pad(hour)}:${pad(minute)}`;
      [h,min].forEach(col=>col.numbers.querySelectorAll('button').forEach(b=>{
        const picked=Number(b.dataset.value)===col.get();b.classList.toggle('is-selected',picked);b.setAttribute('aria-pressed',String(picked));
      }));
    }
    footer(card,btn('Gunakan jam',()=>{setValue(input,`${pad(hour)}:${pad(minute)}`);close();},'vmp-primary'));
    paint();h.numbers.querySelector('.is-selected')?.scrollIntoView({block:'center'});min.numbers.querySelector('.is-selected')?.scrollIntoView({block:'center'});
  }
  function enhance(input){
    if(input.dataset.vamPickerUi)return;
    input.dataset.vamPickerUi='1';
    const anchor=node('span','vam-picker-anchor');input.parentNode.insertBefore(anchor,input);anchor.appendChild(input);input.classList.add('vam-picker-source');
    const trigger=node('button','vam-picker-trigger');trigger.type='button';trigger.setAttribute('aria-label',input.type==='date'?'Pilih tanggal':'Pilih jam');
    trigger.innerHTML=`<span class="vam-picker-text"></span>${icon(input.type)}`;
    trigger.addEventListener('click',()=>{focusReturn=trigger;(input.type==='date'?datePicker:timePicker)(input);});
    anchor.appendChild(trigger);sync(input);
    input.addEventListener('input',()=>sync(input));input.addEventListener('change',()=>sync(input));
    const observer=new MutationObserver(()=>{trigger.disabled=input.disabled;sync(input);});
    observer.observe(input,{attributes:true,attributeFilter:['disabled','value','max']});
  }
  function boot(){
    if(!$('vamOverlay'))return;
    if(!$('vamPickerLayer')){
      const style=node('style');style.textContent=css;document.head.appendChild(style);
      const layer=node('div');layer.id='vamPickerLayer';layer.hidden=true;
      layer.addEventListener('click',e=>{if(e.target===layer)close();});document.body.appendChild(layer);
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.stopImmediatePropagation();close();}},true);
    }
    ['vamTanggal','vamMasuk','vamPulang'].forEach(id=>{const input=$(id);if(input)enhance(input);});
    const form=$('vamForm');if(form&&!form.dataset.vamPickerSync){
      form.dataset.vamPickerSync='1';
      form.addEventListener('reset',()=>queueMicrotask(()=>['vamTanggal','vamMasuk','vamPulang'].forEach(id=>{const input=$(id);if(input)sync(input);}))); 
    }
    const overlay=$('vamOverlay');if(overlay&&!overlay.dataset.vamPickerWatch){
      overlay.dataset.vamPickerWatch='1';
      new MutationObserver(()=>{if(overlay.hidden&&active)close();['vamTanggal','vamMasuk','vamPulang'].forEach(id=>{const input=$(id);if(input)sync(input);});}).observe(overlay,{attributes:true,attributeFilter:['hidden']});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  new MutationObserver(()=>{if($('vamOverlay'))boot();}).observe(document.body,{childList:true});
})();