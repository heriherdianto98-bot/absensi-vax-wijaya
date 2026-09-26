(()=>{'use strict';

const IDS=['kategori','prioritas'];

function closeAll(except){
  document.querySelectorAll('.pd-select.is-open').forEach(el=>{
    if(el!==except){
      el.classList.remove('is-open');
      const btn=el.querySelector('.pd-select-btn');
      if(btn) btn.setAttribute('aria-expanded','false');
    }
  });
}

function selectedText(select){
  const opt=select.options[select.selectedIndex];
  return opt ? opt.textContent.trim() : '';
}

function sync(wrapper,select){
  const value=select.value;
  const text=selectedText(select);
  const valueEl=wrapper.querySelector('.pd-select-value');
  if(valueEl) valueEl.textContent=text || 'Pilih';
  wrapper.querySelectorAll('.pd-select-option').forEach(btn=>{
    const active=btn.dataset.value===value;
    btn.classList.toggle('is-selected',active);
    btn.setAttribute('aria-selected',active?'true':'false');
  });
}

function enhance(select){
  if(!select || select.dataset.customSelectReady==='1') return;
  select.dataset.customSelectReady='1';

  const wrapper=document.createElement('div');
  wrapper.className='pd-select';
  wrapper.dataset.for=select.id;

  const button=document.createElement('button');
  button.type='button';
  button.className='pd-select-btn';
  button.setAttribute('aria-haspopup','listbox');
  button.setAttribute('aria-expanded','false');

  const value=document.createElement('span');
  value.className='pd-select-value';

  const icon=document.createElement('i');
  icon.className='fa-solid fa-chevron-down';
  icon.setAttribute('aria-hidden','true');

  button.append(value,icon);

  const menu=document.createElement('div');
  menu.className='pd-select-menu';
  menu.setAttribute('role','listbox');
  menu.setAttribute('aria-label',select.closest('label')?.childNodes?.[0]?.textContent?.trim() || 'Pilihan');

  [...select.options].forEach(opt=>{
    const item=document.createElement('button');
    item.type='button';
    item.className='pd-select-option';
    item.dataset.value=opt.value;
    item.setAttribute('role','option');
    item.textContent=opt.textContent;
    item.addEventListener('click',()=>{
      select.value=opt.value;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      sync(wrapper,select);
      wrapper.classList.remove('is-open');
      button.setAttribute('aria-expanded','false');
      button.focus();
    });
    menu.appendChild(item);
  });

  wrapper.append(button,menu);
  select.insertAdjacentElement('afterend',wrapper);
  select.classList.add('pd-native-select');

  button.addEventListener('click',()=>{
    const willOpen=!wrapper.classList.contains('is-open');
    closeAll(wrapper);
    wrapper.classList.toggle('is-open',willOpen);
    button.setAttribute('aria-expanded',willOpen?'true':'false');
  });

  button.addEventListener('keydown',e=>{
    if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key) && !wrapper.classList.contains('is-open')){
      e.preventDefault();
      closeAll(wrapper);
      wrapper.classList.add('is-open');
      button.setAttribute('aria-expanded','true');
      const target=wrapper.querySelector('.pd-select-option.is-selected') || wrapper.querySelector('.pd-select-option');
      target?.focus();
    }
  });

  menu.addEventListener('keydown',e=>{
    const items=[...menu.querySelectorAll('.pd-select-option')];
    const index=items.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){
      e.preventDefault();
      items[(index+1+items.length)%items.length]?.focus();
    }else if(e.key==='ArrowUp'){
      e.preventDefault();
      items[(index-1+items.length)%items.length]?.focus();
    }else if(e.key==='Escape'){
      e.preventDefault();
      wrapper.classList.remove('is-open');
      button.setAttribute('aria-expanded','false');
      button.focus();
    }
  });

  select.addEventListener('change',()=>sync(wrapper,select));
  select.form?.addEventListener('reset',()=>setTimeout(()=>sync(wrapper,select),0));
  sync(wrapper,select);
}

function init(){
  IDS.forEach(id=>enhance(document.getElementById(id)));
  document.addEventListener('click',e=>{
    if(!e.target.closest('.pd-select')) closeAll();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') closeAll();
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();