/* VAX ERP — Payroll dropdown keyboard navigation
   UI ONLY: ArrowUp/ArrowDown/Home/End scroll active option, Enter selects, Escape closes.
   Does not change payroll engine, formulas, data, or Supabase logic.
*/
(() => {
  const SELECTOR='.payroll-select-shell.is-enhanced';

  function enabledOptions(menu){
    return [...menu.querySelectorAll('.payroll-select-option:not(:disabled)')];
  }

  function setActive(shell,index){
    const menu=shell.querySelector('.payroll-select-menu');
    if(!menu)return;
    const options=enabledOptions(menu);
    if(!options.length)return;
    const bounded=Math.max(0,Math.min(index,options.length-1));
    options.forEach((btn,i)=>btn.classList.toggle('is-keyboard-active',i===bounded));
    const active=options[bounded];
    active.focus({preventScroll:true});
    active.scrollIntoView({block:'nearest'});
  }

  function currentIndex(menu){
    const options=enabledOptions(menu);
    const focused=document.activeElement;
    let index=options.indexOf(focused);
    if(index>=0)return index;
    index=options.findIndex(btn=>btn.classList.contains('is-selected'));
    return index>=0?index:0;
  }

  function openFromKeyboard(shell,direction){
    const trigger=shell.querySelector('.payroll-select-trigger');
    const menu=shell.querySelector('.payroll-select-menu');
    if(!trigger||!menu||trigger.disabled)return;
    if(!shell.classList.contains('is-open'))trigger.click();
    requestAnimationFrame(()=>{
      const options=enabledOptions(menu);
      if(!options.length)return;
      const selected=options.findIndex(btn=>btn.classList.contains('is-selected'));
      const base=selected>=0?selected:0;
      setActive(shell,direction>0?Math.min(base+1,options.length-1):Math.max(base-1,0));
    });
  }

  document.addEventListener('keydown',event=>{
    const shell=event.target.closest?.(SELECTOR);
    if(!shell)return;
    const trigger=shell.querySelector('.payroll-select-trigger');
    const menu=shell.querySelector('.payroll-select-menu');
    if(!trigger||!menu)return;

    if((event.key==='ArrowDown'||event.key==='ArrowUp')&&!shell.classList.contains('is-open')){
      event.preventDefault();
      openFromKeyboard(shell,event.key==='ArrowDown'?1:-1);
      return;
    }

    if(!shell.classList.contains('is-open'))return;
    const options=enabledOptions(menu);
    if(!options.length)return;
    const index=currentIndex(menu);

    if(event.key==='ArrowDown'){
      event.preventDefault();
      setActive(shell,(index+1)%options.length);
    }else if(event.key==='ArrowUp'){
      event.preventDefault();
      setActive(shell,(index-1+options.length)%options.length);
    }else if(event.key==='Home'){
      event.preventDefault();
      setActive(shell,0);
    }else if(event.key==='End'){
      event.preventDefault();
      setActive(shell,options.length-1);
    }else if(event.key==='Enter'||event.key===' '){
      if(event.target.classList?.contains('payroll-select-option')){
        event.preventDefault();
        event.target.click();
        trigger.focus();
      }
    }else if(event.key==='Escape'){
      event.preventDefault();
      shell.classList.remove('is-open');
      trigger.setAttribute('aria-expanded','false');
      menu.hidden=true;
      trigger.focus();
    }
  });

  document.addEventListener('click',event=>{
    if(event.target.closest?.('.payroll-select-option')){
      document.querySelectorAll('.payroll-select-option.is-keyboard-active').forEach(btn=>btn.classList.remove('is-keyboard-active'));
    }
  });
})();
