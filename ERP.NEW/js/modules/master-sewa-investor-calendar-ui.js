(() => {
  const input=document.getElementById('modalEffective');
  const trigger=document.getElementById('msiDateTrigger');
  const label=document.getElementById('msiDateLabel');
  const pop=document.getElementById('msiCalendar');
  const title=document.getElementById('msiCalTitle');
  const grid=document.getElementById('msiCalGrid');
  const prev=document.getElementById('msiCalPrev');
  const next=document.getElementById('msiCalNext');
  const todayBtn=document.getElementById('msiCalToday');
  const closeBtn=document.getElementById('msiCalClose');
  const modal=document.getElementById('msiModal');
  if(!input||!trigger||!label||!pop||!title||!grid)return;

  const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parse=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));return m?new Date(+m[1],+m[2]-1,+m[3]):new Date();};
  const fmt=v=>{const d=parse(v);return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;};
  let view=parse(input.value);

  function syncLabel(){label.textContent=input.value?fmt(input.value):'Pilih tanggal';}
  function render(){
    title.textContent=`${months[view.getMonth()]} ${view.getFullYear()}`;
    grid.innerHTML='';
    const y=view.getFullYear(),m=view.getMonth();
    const first=new Date(y,m,1), start=new Date(y,m,1-first.getDay());
    const selected=input.value;
    const today=iso(new Date());
    for(let i=0;i<42;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);
      const val=iso(d);
      const b=document.createElement('button');b.type='button';b.className='msi-cal-day';b.textContent=d.getDate();b.dataset.date=val;
      if(d.getMonth()!==m)b.classList.add('is-muted');
      if(val===today)b.classList.add('is-today');
      if(val===selected)b.classList.add('is-selected');
      b.onclick=()=>{input.value=val;syncLabel();close();input.dispatchEvent(new Event('change',{bubbles:true}));};
      grid.appendChild(b);
    }
  }
  function open(){view=parse(input.value);render();pop.hidden=false;trigger.classList.add('is-open');}
  function close(){pop.hidden=true;trigger.classList.remove('is-open');}
  trigger.addEventListener('click',()=>pop.hidden?open():close());
  prev.addEventListener('click',()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);render();});
  next.addEventListener('click',()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);render();});
  todayBtn.addEventListener('click',()=>{const d=new Date();input.value=iso(d);view=d;syncLabel();render();});
  closeBtn.addEventListener('click',close);
  document.addEventListener('click',e=>{if(!pop.hidden&&!pop.contains(e.target)&&!trigger.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  new MutationObserver(()=>{if(modal&&!modal.hidden){setTimeout(()=>{syncLabel();view=parse(input.value);render();},0);}else close();}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  input.addEventListener('change',syncLabel);
  syncLabel();
})();