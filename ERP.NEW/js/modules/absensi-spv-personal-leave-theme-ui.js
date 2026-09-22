/* UI ONLY: presentation for the isolated SPV personal-leave form. Never submit or change approval logic. */
(()=>{
'use strict';
const css=document.createElement('style');
css.textContent=`
#spvPersonalLeave{background:#101214!important;border-color:rgba(220,175,55,.42)!important;box-shadow:0 12px 32px rgba(0,0,0,.25)!important}
#spvPersonalLeave .spv-leave-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
#spvPersonalLeave .spv-leave-toggle{flex-shrink:0;background:#26231b!important;color:#ffda78!important;border:1px solid #82672e!important;border-radius:11px!important;padding:10px 13px!important;box-shadow:0 3px 0 #050606;cursor:pointer}
#spvPersonalLeave .spv-leave-toggle:hover,#spvPersonalLeave .spv-leave-toggle:focus-visible{border-color:#f5cc60!important;outline:2px solid rgba(245,204,96,.3)}
#spvPersonalLeave .spv-leave-content[hidden]{display:none!important}
#spvPersonalLeave .spv-date-trigger{width:100%;min-height:45px;display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;background:#181b20!important;color:#f0f2f5!important;border:1px solid #62522c!important;border-radius:10px!important;box-shadow:none!important;font-weight:600}
#spvPersonalLeave .spv-date-trigger:focus-visible{outline:2px solid #e7bc4e;outline-offset:2px}
#spvPersonalLeave input.spv-date-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
.spv-leave-cal[hidden]{display:none!important}.spv-leave-cal{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:16px}
.spv-leave-cal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.83);backdrop-filter:blur(5px)}
.spv-leave-cal-card{position:relative;width:min(100%,370px);padding:18px;border:1px solid #b38b36;border-radius:19px;background:#101214;color:#f7f3e8;box-shadow:0 22px 70px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,225,147,.1)}
.spv-leave-cal-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:17px}.spv-leave-cal-head strong{color:#f8d575;font-size:17px}.spv-leave-cal button{cursor:pointer;font:inherit}
.spv-leave-cal-nav,.spv-leave-cal-close,.spv-leave-cal-today{min-width:37px;min-height:37px;border:1px solid #6d5729;border-radius:10px;background:#26231b;color:#ffdc83;font-weight:800}
.spv-leave-cal-week,.spv-leave-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;text-align:center}.spv-leave-cal-week{color:#d2b36b;font-size:12px;margin-bottom:8px}.spv-leave-cal-grid button{height:40px;border:1px solid transparent;border-radius:10px;background:#1c2025;color:#e9edf3;font-weight:700}.spv-leave-cal-grid button:hover:not(:disabled),.spv-leave-cal-grid button:focus-visible{border-color:#c49a3e;background:#363026;outline:none}.spv-leave-cal-grid button.is-selected{color:#15120b;background:linear-gradient(135deg,#ffe69a,#d8aa31);border-color:#ffe69a}.spv-leave-cal-grid button.is-today:not(.is-selected){border-color:#a98740}.spv-leave-cal-grid button:disabled{opacity:.22;cursor:not-allowed}.spv-leave-cal-grid span{height:40px}.spv-leave-cal-foot{display:flex;justify-content:flex-end;margin-top:16px}.spv-leave-cal-today{padding:0 15px}
@media(max-width:600px){#spvPersonalLeave .spv-leave-heading{align-items:flex-start}#spvPersonalLeave .spv-leave-toggle{font-size:12px}.spv-leave-cal-card{padding:15px}.spv-leave-cal-grid button{height:38px}}
`;
document.head.appendChild(css);
const $=id=>document.getElementById(id);
const today=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const x=k=>p.find(a=>a.type===k).value;return `${x('year')}-${x('month')}-${x('day')}`};
const iso=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const pretty=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}):'Pilih tanggal';
let active=null,month=null,year=null,lastFocus=null;
function close(){const modal=$('spvLeaveCal');if(!modal)return;modal.hidden=true;active=null;lastFocus?.focus();}
function draw(){
 const modal=$('spvLeaveCal');if(!modal||!active)return;
 $('spvLeaveCalTitle').textContent=new Date(year,month,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
 const grid=$('spvLeaveCalDays');grid.replaceChildren();const start=(new Date(year,month,1).getDay()+6)%7;
 for(let i=0;i<start;i++)grid.appendChild(document.createElement('span'));
 const end=new Date(year,month+1,0).getDate();
 for(let d=1;d<=end;d++){
  const value=iso(year,month,d),b=document.createElement('button');b.type='button';b.textContent=String(d);b.setAttribute('aria-label',pretty(value));
  if(value===active.value)b.classList.add('is-selected');if(value===today())b.classList.add('is-today');
  b.disabled=Boolean((active.min&&value<active.min)||(active.max&&value>active.max));
  b.addEventListener('click',()=>{active.value=value;active.dispatchEvent(new Event('change',{bubbles:true}));syncLabels();close();});grid.appendChild(b);
 }
}
function syncLabels(){[['spvLeaveStart','spvLeaveStartTrigger'],['spvLeaveEnd','spvLeaveEndTrigger']].forEach(([id,btn])=>{const el=$(id),trigger=$(btn);if(el&&trigger)trigger.querySelector('span').textContent=pretty(el.value);});}
function open(input,trigger){active=input;lastFocus=trigger;const base=input.value||input.min||today(),p=base.split('-').map(Number);year=p[0];month=p[1]-1;$('spvLeaveCal').hidden=false;draw();$('spvLeaveCalClose').focus();}
function mount(){
 const panel=$('spvPersonalLeave');if(!panel||panel.dataset.spvThemeMounted)return Boolean(panel);
 const form=$('spvLeaveForm'),heading=panel.querySelector('h3');if(!form||!heading)return false;
 panel.dataset.spvThemeMounted='1';
 const group=document.createElement('div');group.className='spv-leave-heading';heading.before(group);group.appendChild(heading);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='spv-leave-toggle';toggle.textContent='Tutup formulir \u25b4';toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-controls','spvLeaveContent');group.appendChild(toggle);
 const content=document.createElement('div');content.id='spvLeaveContent';while(group.nextSibling)content.appendChild(group.nextSibling);panel.appendChild(content);
 toggle.addEventListener('click',()=>{content.hidden=!content.hidden;toggle.setAttribute('aria-expanded',String(!content.hidden));toggle.textContent=content.hidden?'Buka formulir \u25be':'Tutup formulir \u25b4';if(content.hidden)close();});
 const modal=document.createElement('div');modal.id='spvLeaveCal';modal.className='spv-leave-cal';modal.hidden=true;
 modal.innerHTML='<div class="spv-leave-cal-backdrop" data-spv-leave-close></div><section class="spv-leave-cal-card" role="dialog" aria-modal="true" aria-label="Pilih tanggal libur"><div class="spv-leave-cal-head"><button type="button" class="spv-leave-cal-nav" id="spvLeaveCalPrev" aria-label="Bulan sebelumnya">&#8249;</button><strong id="spvLeaveCalTitle"></strong><button type="button" class="spv-leave-cal-nav" id="spvLeaveCalNext" aria-label="Bulan berikutnya">&#8250;</button><button type="button" class="spv-leave-cal-close" id="spvLeaveCalClose" aria-label="Tutup kalender">&#215;</button></div><div class="spv-leave-cal-week"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div><div id="spvLeaveCalDays" class="spv-leave-cal-grid"></div><div class="spv-leave-cal-foot"><button type="button" id="spvLeaveCalToday" class="spv-leave-cal-today">Hari Ini</button></div></section>';
 document.body.appendChild(modal);modal.querySelector('[data-spv-leave-close]').addEventListener('click',close);$('spvLeaveCalClose').addEventListener('click',close);
 const move=delta=>{const dt=new Date(year,month+delta,1);year=dt.getFullYear();month=dt.getMonth();draw();};
 $('spvLeaveCalPrev').addEventListener('click',()=>move(-1));$('spvLeaveCalNext').addEventListener('click',()=>move(1));
 $('spvLeaveCalToday').addEventListener('click',()=>{if(!active)return;const v=today();if((active.min&&v<active.min)||(active.max&&v>active.max))return;active.value=v;active.dispatchEvent(new Event('change',{bubbles:true}));syncLabels();close();});
 document.addEventListener('keydown',e=>{if(modal.hidden)return;if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button:not(:disabled)')];if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls[controls.length-1].focus();}else if(!e.shiftKey&&document.activeElement===controls[controls.length-1]){e.preventDefault();controls[0].focus();}}});
 for(const [id,triggerId,label] of [['spvLeaveStart','spvLeaveStartTrigger','Tanggal mulai'],['spvLeaveEnd','spvLeaveEndTrigger','Tanggal selesai']]){
  const input=$(id);if(!input)continue;input.classList.add('spv-date-native');const btn=document.createElement('button');btn.type='button';btn.id=triggerId;btn.className='spv-date-trigger';btn.setAttribute('aria-label',`Pilih ${label.toLowerCase()}`);btn.innerHTML='<span>Pilih tanggal</span><span aria-hidden="true">&#128197;</span>';input.after(btn);btn.addEventListener('click',()=>open(input,btn));input.addEventListener('change',syncLabels);
 }
 syncLabels();return true;
}
function boot(){if(mount())return;let n=0;const timer=setInterval(()=>{if(mount()||++n>=120)clearInterval(timer);},250);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('erp:finance-ready',boot);
})();