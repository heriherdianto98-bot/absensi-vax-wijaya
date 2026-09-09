/* ERP VAX — Invoice SVP premium UI only. No data/engine mutation. */
"use strict";
(() => {
  const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const WEEK=['MIN','SEN','SEL','RAB','KAM','JUM','SAB'];
  const pad=n=>String(n).padStart(2,'0');
  const iso=(y,m,d)=>`${y}-${pad(m+1)}-${pad(d)}`;
  const parse=v=>{if(!v)return null;const [y,m,d]=String(v).split('-').map(Number);return y&&m&&d?new Date(y,m-1,d):null};
  const label=v=>{const d=parse(v);return d?`${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`:''};

  function enhanceDate(input){
    if(!input || input.dataset.premiumDate==='1')return;
    input.dataset.premiumDate='1';
    input.type='hidden';
    const wrap=document.createElement('div');wrap.className='mt-invoice-date-wrap';
    const trigger=document.createElement('button');trigger.type='button';trigger.className='mt-invoice-date-trigger';
    trigger.innerHTML='<span class="value placeholder">Pilih tanggal</span><span class="icon">▦</span>';
    const cal=document.createElement('div');cal.className='mt-invoice-calendar';cal.hidden=true;
    wrap.append(trigger,cal);input.insertAdjacentElement('afterend',wrap);

    let cursor=parse(input.value)||new Date();
    const sync=()=>{const val=trigger.querySelector('.value');val.textContent=input.value?label(input.value):'Pilih tanggal';val.classList.toggle('placeholder',!input.value)};
    const render=()=>{
      const y=cursor.getFullYear(),m=cursor.getMonth(),first=new Date(y,m,1),start=first.getDay(),days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();
      const selected=parse(input.value),today=new Date();
      let cells='';
      for(let i=0;i<42;i++){
        let cy=y,cm=m,day=i-start+1,muted=false;
        if(day<1){cm=m-1;if(cm<0){cm=11;cy--}day=prevDays+day;muted=true}
        else if(day>days){day-=days;cm=m+1;if(cm>11){cm=0;cy++}muted=true}
        const value=iso(cy,cm,day);
        const isSel=selected&&selected.getFullYear()===cy&&selected.getMonth()===cm&&selected.getDate()===day;
        const isToday=today.getFullYear()===cy&&today.getMonth()===cm&&today.getDate()===day;
        cells+=`<button type="button" class="mt-invoice-cal-day${muted?' is-muted':''}${isSel?' is-selected':''}${isToday?' is-today':''}" data-date="${value}">${day}</button>`;
      }
      cal.innerHTML=`<div class="mt-invoice-cal-head"><button type="button" class="mt-invoice-cal-nav" data-prev>‹</button><div class="mt-invoice-cal-title">${MONTHS[m]} ${y}</div><button type="button" class="mt-invoice-cal-nav" data-next>›</button></div><div class="mt-invoice-cal-week">${WEEK.map(x=>`<span>${x}</span>`).join('')}</div><div class="mt-invoice-cal-grid">${cells}</div>${input.id==='invDue'?'<button type="button" class="mt-invoice-cal-clear" data-clear>Tanpa jatuh tempo</button>':''}`;
    };
    const close=()=>{cal.hidden=true;trigger.setAttribute('aria-expanded','false')};
    trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
    trigger.addEventListener('click',()=>{document.querySelectorAll('.mt-invoice-calendar').forEach(x=>{if(x!==cal)x.hidden=true});cursor=parse(input.value)||new Date();render();cal.hidden=!cal.hidden;trigger.setAttribute('aria-expanded',String(!cal.hidden))});
    cal.addEventListener('click',e=>{
      const prev=e.target.closest('[data-prev]'),next=e.target.closest('[data-next]'),day=e.target.closest('[data-date]'),clear=e.target.closest('[data-clear]');
      if(prev){cursor=new Date(cursor.getFullYear(),cursor.getMonth()-1,1);render();return}
      if(next){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);render();return}
      if(clear){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));sync();close();return}
      if(day){input.value=day.dataset.date;input.dispatchEvent(new Event('change',{bubbles:true}));sync();close()}
    });
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))close()});
    new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['value']});
    input.addEventListener('change',sync);sync();
  }

  function boot(){
    const modal=document.getElementById('mtInvoiceModal');if(!modal)return false;
    enhanceDate(document.getElementById('invDate'));enhanceDate(document.getElementById('invDue'));
    return true;
  }
  let tries=0;const t=setInterval(()=>{if(boot()||++tries>30)clearInterval(t)},150);
  window.addEventListener('load',()=>setTimeout(boot,900));
})();
