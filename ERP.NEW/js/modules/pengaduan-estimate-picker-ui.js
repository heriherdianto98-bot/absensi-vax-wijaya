/* ERP VAX - Pengaduan Estimate Picker UI ONLY
   Enhances #actionEstimate visually while preserving the existing datetime-local value and workflow. */
(function(){
  'use strict';
  if(window.PengaduanEstimatePickerUI)return;
  const $=id=>document.getElementById(id);
  const pad=n=>String(n).padStart(2,'0');
  const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const monthsShort=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  let activeDate=null,viewYear=null,viewMonth=null,focusReturn=null;

  function parse(v){
    const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v||'');
    return m?{y:+m[1],m:+m[2],d:+m[3],h:+m[4],min:+m[5]}:null;
  }
  function todayParts(){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
    const g=t=>+parts.find(x=>x.type===t)?.value;
    return {y:g('year'),m:g('month'),d:g('day'),h:g('hour'),min:g('minute')};
  }
  function isoDate(p){return `${p.y}-${pad(p.m)}-${pad(p.d)}`;}
  function display(v){
    const p=parse(v);if(!p)return 'Pilih tanggal & jam';
    return `${p.d} ${monthsShort[p.m-1]} ${p.y} • ${pad(p.h)}:${pad(p.min)} WIB`;
  }
  function sync(){
    const input=$('actionEstimate'),text=document.querySelector('.pgs-estimate-text');
    if(input&&text)text.textContent=display(input.value);
  }
  function setValue(v){
    const input=$('actionEstimate');if(!input)return;
    input.value=v;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    sync();
  }
  function close(){
    const layer=$('pgsEstimatePickerLayer');if(!layer)return;
    layer.hidden=true;
    if(focusReturn?.isConnected)focusReturn.focus();
    focusReturn=null;
  }
  function open(){
    const input=$('actionEstimate'),layer=$('pgsEstimatePickerLayer');if(!input||!layer)return;
    const p=parse(input.value)||todayParts();
    activeDate={...p};viewYear=p.y;viewMonth=p.m;
    layer.hidden=false;render();
    requestAnimationFrame(()=>$('pgsEstimatePickerCard')?.focus());
  }
  function render(){
    const card=$('pgsEstimatePickerCard');if(!card||!activeDate)return;
    const now=todayParts(),today=isoDate(now);
    card.innerHTML=`
      <div class="pgs-ep-head">
        <div><small>ESTIMASI SELESAI</small><strong id="pgsEpTitle"></strong></div>
        <button type="button" class="pgs-ep-close" aria-label="Tutup">×</button>
      </div>
      <div class="pgs-ep-nav">
        <button type="button" id="pgsEpPrev" aria-label="Bulan sebelumnya">‹</button>
        <span>${months[viewMonth-1]} ${viewYear}</span>
        <button type="button" id="pgsEpNext" aria-label="Bulan berikutnya">›</button>
      </div>
      <div class="pgs-ep-week">${['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map(x=>'<span>'+x+'</span>').join('')}</div>
      <div class="pgs-ep-days" id="pgsEpDays"></div>
      <div class="pgs-ep-time">
        <label><span>Jam</span><select id="pgsEpHour">${Array.from({length:24},(_,i)=>`<option value="${pad(i)}">${pad(i)}</option>`).join('')}</select></label>
        <span class="pgs-ep-colon">:</span>
        <label><span>Menit</span><select id="pgsEpMinute">${[0,5,10,15,20,25,30,35,40,45,50,55].map(i=>`<option value="${pad(i)}">${pad(i)}</option>`).join('')}</select></label>
      </div>
      <div class="pgs-ep-preview" id="pgsEpPreview"></div>
      <div class="pgs-ep-foot">
        <button type="button" class="pgs-ep-secondary" id="pgsEpCancel">Batal</button>
        <button type="button" class="pgs-ep-primary" id="pgsEpApply">Gunakan estimasi</button>
      </div>`;
    $('pgsEpTitle').textContent='Pilih tanggal dan jam';
    const days=$('pgsEpDays'),offset=(new Date(viewYear,viewMonth-1,1).getDay()+6)%7,count=new Date(viewYear,viewMonth,0).getDate();
    for(let i=0;i<offset;i++)days.appendChild(document.createElement('span'));
    for(let day=1;day<=count;day++){
      const b=document.createElement('button');b.type='button';b.textContent=day;b.className='pgs-ep-day';
      const iso=`${viewYear}-${pad(viewMonth)}-${pad(day)}`;
      if(iso===today)b.classList.add('is-today');
      if(viewYear===activeDate.y&&viewMonth===activeDate.m&&day===activeDate.d)b.classList.add('is-selected');
      if(iso<today){b.disabled=true;}
      b.addEventListener('click',()=>{activeDate.y=viewYear;activeDate.m=viewMonth;activeDate.d=day;render();});
      days.appendChild(b);
    }
    const hour=$('pgsEpHour'),minute=$('pgsEpMinute');
    hour.value=pad(activeDate.h);
    const rounded=Math.round(activeDate.min/5)*5;
    activeDate.min=rounded===60?55:rounded;
    minute.value=pad(activeDate.min);
    const paint=()=>{$('pgsEpPreview').textContent=`${activeDate.d} ${monthsShort[activeDate.m-1]} ${activeDate.y} • ${pad(activeDate.h)}:${pad(activeDate.min)} WIB`;};
    hour.addEventListener('change',()=>{activeDate.h=+hour.value;paint();});
    minute.addEventListener('change',()=>{activeDate.min=+minute.value;paint();});
    paint();
    $('pgsEpPrev').addEventListener('click',()=>{if(viewMonth===1){viewMonth=12;viewYear--;}else viewMonth--;render();});
    $('pgsEpNext').addEventListener('click',()=>{if(viewMonth===12){viewMonth=1;viewYear++;}else viewMonth++;render();});
    card.querySelector('.pgs-ep-close').addEventListener('click',close);
    $('pgsEpCancel').addEventListener('click',close);
    $('pgsEpApply').addEventListener('click',()=>{
      setValue(`${activeDate.y}-${pad(activeDate.m)}-${pad(activeDate.d)}T${pad(activeDate.h)}:${pad(activeDate.min)}`);
      close();
    });
  }
  function enhance(){
    const input=$('actionEstimate');if(!input||input.dataset.pgsEstimatePicker)return;
    input.dataset.pgsEstimatePicker='1';
    input.classList.add('pgs-estimate-source');
    const trigger=document.createElement('button');
    trigger.type='button';trigger.className='pgs-estimate-trigger';
    trigger.innerHTML='<span class="pgs-estimate-text">Pilih tanggal & jam</span><span class="pgs-estimate-icon" aria-hidden="true">▣</span>';
    input.insertAdjacentElement('afterend',trigger);
    trigger.addEventListener('click',()=>{focusReturn=trigger;open();});
    input.addEventListener('input',sync);input.addEventListener('change',sync);
    sync();

    if(!$('pgsEstimatePickerLayer')){
      const layer=document.createElement('div');layer.id='pgsEstimatePickerLayer';layer.hidden=true;
      layer.innerHTML='<section id="pgsEstimatePickerCard" tabindex="-1" role="dialog" aria-modal="true" aria-label="Pilih estimasi selesai"></section>';
      layer.addEventListener('click',e=>{if(e.target===layer)close();});
      document.body.appendChild(layer);
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!layer.hidden)close();});
    }
    window.PengaduanEstimatePickerUI={open,close,sync};
  }
  window.PengaduanEstimatePickerUI={open,close,sync};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();