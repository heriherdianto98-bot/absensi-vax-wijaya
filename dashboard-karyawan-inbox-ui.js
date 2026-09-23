/* Employee-only inbox shortcut. Reads own chat and private SP receipts only. */
(() => {
 'use strict';
 if(window.__vaxInboxShortcutV1)return;window.__vaxInboxShortcutV1=true;
 const header=document.querySelector('.app .topbar');if(!header)return;
 const style=document.createElement('style');style.textContent=`
 .app .vax-inbox-shortcut{position:relative;display:flex;align-items:center;justify-content:center;width:39px;height:39px;flex:0 0 39px;margin-left:5px;border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;color:#efce82;cursor:pointer}
 .app .vax-inbox-shortcut i{font-size:22px}.app .vax-inbox-shortcut:hover{color:#ffe6ad}
 .app .vax-inbox-shortcut:focus-visible{outline:2px solid #e9c776;outline-offset:2px}
 .app .vax-inbox-badge{position:absolute;right:-4px;top:-4px;min-width:19px;height:19px;padding:0 4px;border:2px solid #131413;border-radius:99px;background:#dc3e3e;color:#fff;font-size:10px;font-weight:800;line-height:16px;text-align:center}
 .app .vax-inbox-badge[hidden],.app .vax-inbox-shortcut[hidden]{display:none!important}
 `;document.head.appendChild(style);
 const button=document.createElement('button');button.type='button';button.className='vax-inbox-shortcut';button.setAttribute('aria-label','Buka Inbox');
 button.innerHTML='<i class="fa-regular fa-envelope" aria-hidden="true"></i><span class="vax-inbox-badge" hidden></span>';
 header.appendChild(button);const badge=button.querySelector('.vax-inbox-badge');
 button.addEventListener('click',()=>{window.location.assign('pesan-karyawan.html');});
 const token=()=>typeof KaryawanSession!=='undefined'&&typeof KaryawanSession.getToken==='function'?KaryawanSession.getToken():'';
 let busy=false;
 async function update(){
   if(busy||document.hidden||document.documentElement.dataset.homeKpi==='pending')return;
   const t=token();if(!t||typeof db==='undefined')return;
   busy=true;
   try{
      const [chat,letters]=await Promise.allSettled([
        db.rpc('vax_inbox_self_v1',{p_action:'THREADS',p_token:t,p_peer:null,p_thread_id:null,p_message:null}),
        db.rpc('vax_sp_karyawan_self_v1',{p_token:t,p_action:'LIST',p_id:null,p_setuju:null,p_tanggapan:null})
      ]);
      const chats=chat.status==='fulfilled'&&!chat.value.error&&chat.value.data?.ok===true
        ?(Array.isArray(chat.value.data.items)?chat.value.data.items:[]):[];
      const unreadChat=chats.reduce((sum,row)=>sum+Math.max(0,Number(row.unread)||0),0);
      const spRows=letters.status==='fulfilled'&&!letters.value.error&&letters.value.data?.ok===true
        ?(Array.isArray(letters.value.data.items)?letters.value.data.items:[]):[];
      const unreadSp=spRows.filter(row=>row.status==='TERBIT'&&!row.diterima_pada).length;
      if(chat.status==='rejected'||letters.status==='rejected')console.warn('Sebagian sumber inbox belum tersedia');
      if(chat.status==='fulfilled'&&chat.value.error)console.warn('Inbox chat:',chat.value.error);
      if(letters.status==='fulfilled'&&letters.value.error)console.warn('Inbox surat:',letters.value.error);
      const unread=unreadChat+unreadSp;
      badge.hidden=unread===0;badge.textContent=unread>99?'99+':String(unread);
      button.setAttribute('aria-label',unread?`Inbox: ${unreadChat} pesan dan ${unreadSp} surat SP belum dikonfirmasi`:'Buka Inbox');
   }catch(error){console.warn('Inbox unread:',error);}finally{busy=false;}
 }
 const roleObserver=new MutationObserver(()=>{button.hidden=document.documentElement.dataset.homeKpi==='pending';if(!button.hidden)void update();});
 roleObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-home-kpi']});
 button.hidden=document.documentElement.dataset.homeKpi==='pending';if(!button.hidden)void update();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void update();});
 setInterval(()=>{void update();},30000);
})();
