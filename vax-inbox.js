/* VAX internal inbox: uses only the isolated vax_inbox_self_v1 RPC.
   Employee identity is inferred from the canonical session token; staff from Supabase Auth.
   No employee ID, role, or authorization decision is trusted from the browser. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const staff=document.body.dataset.inboxMode==='staff';
  const state={active:null,contacts:[],threads:[],tab:'THREADS',busy:false,deleteBusy:false,me:'',timer:null};
  const list=$('inboxList'),search=$('inboxSearch'),view=$('inboxListView'),thread=$('inboxThread');
  const status=$('inboxThreadStatus'),messages=$('inboxMessages'),input=$('inboxText');
  const text=(el,value)=>{if(el)el.textContent=value;};
  const token=()=>staff?null:(typeof KaryawanSession!=='undefined'?KaryawanSession.getToken():null);
  async function rpc(action,params={}){
    const t=token();
    if(!staff&&!t)throw new Error('Sesi karyawan tidak tersedia.');
    const {data,error}=await db.rpc('vax_inbox_self_v1',{p_action:action,p_token:t,p_peer:null,p_thread_id:null,p_message:null,...params});
    if(error)throw error;
    const payload=Array.isArray(data)?data[0]:data;
    if(!payload||payload.ok!==true)throw new Error(payload?.reason||'Gagal memuat inbox.');
    return payload;
  }
  async function deleteThreadRpc(threadId){
    const t=token();
    if(!staff&&!t)throw new Error('Sesi karyawan tidak tersedia.');
    const {data,error}=await db.rpc('vax_inbox_delete_thread_v1',{p_token:t,p_thread_id:threadId});
    if(error)throw error;
    const payload=Array.isArray(data)?data[0]:data;
    if(!payload||payload.ok!==true)throw new Error(payload?.reason||'Gagal menghapus percakapan.');
    return payload;
  }
  function errorLabel(error){const code=String(error?.message||error||'');
    if(code==='STAFF_MUST_MESSAGE_FIRST')return 'Tunggu pesan pertama dari Owner/SPV.';
    if(code==='STAFF_AUTH_REQUIRED'||code==='SESSION_INVALID')return 'Sesi berakhir. Silakan login kembali.';
    if(code==='THREAD_FORBIDDEN')return 'Percakapan tidak tersedia untuk akun ini.';
    return code.length>120?'Koneksi gagal. Coba lagi.':code;
  }
  function empty(message){list.replaceChildren();const p=document.createElement('p');p.className='inbox-empty';p.textContent=message;list.appendChild(p);}
  function initials(name){return String(name||'?').trim().slice(0,1).toLocaleUpperCase('id-ID');}
  function itemButton(row){
    const button=document.createElement('button');button.type='button';button.className='inbox-item';
    const avatar=document.createElement('span');avatar.className='inbox-avatar';avatar.textContent=initials(row.nama);
    const copy=document.createElement('span');copy.className='inbox-copy';
    const title=document.createElement('strong');title.textContent=String(row.nama||'Karyawan');
    const caption=document.createElement('small');caption.textContent=state.tab==='CONTACTS'?[row.jabatan,row.cabang].filter(Boolean).join(' · '):String(row.last_message||[row.jabatan,row.cabang].filter(Boolean).join(' · ')||'Belum ada pesan');
    copy.append(title,caption);button.append(avatar,copy);
    if(state.tab==='THREADS'&&Number(row.unread)>0){const badge=document.createElement('span');badge.className='inbox-unread';badge.textContent=Number(row.unread)>99?'99+':String(row.unread);button.appendChild(badge);}
    button.addEventListener('click',()=>void openConversation(row));
    return button;
  }
  function renderList(){
    const q=String(search.value||'').trim().toLocaleLowerCase('id-ID');
    const rows=(state.tab==='CONTACTS'?state.contacts:state.threads).filter(row=>[row.nama,row.cabang,row.jabatan,row.last_message].some(s=>String(s||'').toLocaleLowerCase('id-ID').includes(q)));
    list.replaceChildren();if(!rows.length){empty(q?'Tidak ada nama yang cocok.':state.tab==='CONTACTS'?'Belum ada rekan kerja aktif.':'Belum ada percakapan.');return;}
    rows.forEach(row=>list.appendChild(itemButton(row)));
  }
  async function loadList(){
    if(state.busy)return;state.busy=true;
    try{
      const [chats,contacts]=await Promise.all([rpc('THREADS'),rpc('CONTACTS')]);
      state.threads=Array.isArray(chats.items)?chats.items:[];
      state.contacts=Array.isArray(contacts.items)?contacts.items:[];
      renderList();
    }catch(e){console.warn('Inbox:',e);if(!state.active)empty(errorLabel(e));}
    finally{state.busy=false;}
  }
  function setTab(next){state.tab=next;view.hidden=false;thread.hidden=true;state.active=null;
    $('inboxTabChats').setAttribute('aria-pressed',String(next==='THREADS'));
    $('inboxTabContacts').setAttribute('aria-pressed',String(next==='CONTACTS'));
    search.value='';renderList();}
  async function openConversation(row){
    if(state.active)return;
    text(status,'Membuka percakapan…');
    try{
      const threadId=state.tab==='CONTACTS'?(await rpc('START',{p_peer:row.peer_key})).thread_id:row.id;
      state.active={id:Number(threadId),peer_key:row.peer_key,nama:row.nama,jabatan:row.jabatan,cabang:row.cabang};
      view.hidden=true;thread.hidden=false;
      text($('inboxThreadName'),row.nama||'Percakapan');
      text($('inboxThreadMeta'),[row.jabatan,row.cabang].filter(Boolean).join(' · '));
      await loadMessages(true);
      input.focus();
    }catch(e){state.active=null;console.warn('Inbox open:',e);empty(errorLabel(e));}
  }
  function fmtDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';}
  async function loadMessages(markRead=false){
    if(!state.active||state.deleteBusy)return;
    const id=state.active.id;
    try{
      const data=await rpc('MESSAGES',{p_thread_id:id});
      if(!state.active||state.active.id!==id||state.deleteBusy)return;
      messages.replaceChildren();
      const rows=Array.isArray(data.items)?data.items:[];
      if(!rows.length){const p=document.createElement('p');p.className='inbox-empty';p.textContent='Belum ada pesan. Mulai percakapan di sini.';messages.appendChild(p);}
      for(const row of rows){const bubble=document.createElement('div');bubble.className='inbox-bubble'+(String(row.sender_key)===state.me?' mine':'');
        const body=document.createElement('span');body.textContent=String(row.body||'');
        const time=document.createElement('time');time.textContent=fmtDate(row.created_at);bubble.append(body,time);messages.appendChild(bubble);}
      messages.scrollTop=messages.scrollHeight;
      if(!state.deleteBusy&&state.active&&state.active.id===id&&(markRead||rows.some(row=>String(row.sender_key)!==state.me)))await rpc('READ',{p_thread_id:id});
      text(status,'');
    }catch(e){console.warn('Inbox messages:',e);text(status,errorLabel(e));}
  }
  async function send(event){event.preventDefault();if(!state.active)return;
    const body=input.value.trim();if(!body)return;
    const submit=$('inboxForm').querySelector('button[type=submit]');submit.disabled=true;
    try{await rpc('SEND',{p_thread_id:state.active.id,p_message:body});input.value='';await loadMessages(true);}
    catch(e){console.warn('Inbox send:',e);text(status,errorLabel(e));}
    finally{submit.disabled=false;}
  }
  function setupDeleteThreadButton(){
    if(staff)return;
    const header=document.querySelector('.inbox-thread-header');
    if(!header||header.querySelector('.inbox-thread-delete'))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='inbox-thread-delete';
    button.setAttribute('aria-label','Hapus percakapan permanen');
    button.title='Hapus percakapan';
    button.innerHTML='<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
    button.addEventListener('click',async()=>{
      if(!state.active||state.deleteBusy)return;
      const ok=window.confirm('Hapus percakapan ini secara permanen? Semua pesan akan hilang untuk kedua pihak dan tidak dapat dikembalikan.');
      if(!ok)return;
      const deleting=state.active;
      state.deleteBusy=true;
      state.active=null;
      button.disabled=true;
      text(status,'Menghapus percakapan…');
      try{
        await deleteThreadRpc(deleting.id);
        thread.hidden=true;
        view.hidden=false;
        state.tab='THREADS';
        $('inboxTabChats').setAttribute('aria-pressed','true');
        $('inboxTabContacts').setAttribute('aria-pressed','false');
        search.value='';
        await loadList();
        text(status,'');
      }catch(e){
        state.active=deleting;
        console.warn('Inbox delete:',e);
        text(status,errorLabel(e));
      }finally{
        state.deleteBusy=false;
        button.disabled=false;
      }
    });
    header.appendChild(button);
  }

  function setupEmojiPicker(){
    if(staff)return;
    const form=$('inboxForm');
    if(!form||form.querySelector('.inbox-emoji-toggle'))return;

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='inbox-emoji-toggle';
    toggle.setAttribute('aria-label','Pilih emoji');
    toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML='<i class="fa-regular fa-face-smile" aria-hidden="true"></i>';

    const picker=document.createElement('div');
    picker.className='inbox-emoji-picker';
    picker.hidden=true;
    picker.setAttribute('role','dialog');
    picker.setAttribute('aria-label','Pilih emoji');

    const emojis=['😀','😁','😂','😊','😍','🥰','😎','👍','🙏','👏','💪','🔥','❤️','💚','✨','🎉','✅','👌','🤝','🙌','😅','🙂','😉','🤗'];
    for(const emoji of emojis){
      const button=document.createElement('button');
      button.type='button';
      button.className='inbox-emoji-option';
      button.textContent=emoji;
      button.setAttribute('aria-label','Emoji '+emoji);
      button.addEventListener('click',()=>{
        const start=input.selectionStart??input.value.length;
        const end=input.selectionEnd??start;
        input.value=input.value.slice(0,start)+emoji+input.value.slice(end);
        const next=start+emoji.length;
        input.focus();
        input.setSelectionRange(next,next);
        picker.hidden=true;
        toggle.setAttribute('aria-expanded','false');
      });
      picker.appendChild(button);
    }

    form.insertBefore(toggle,input);
    form.appendChild(picker);

    toggle.addEventListener('click',()=>{
      const open=picker.hidden;
      picker.hidden=!open;
      toggle.setAttribute('aria-expanded',String(open));
      if(!open)input.focus();
    });

    document.addEventListener('click',event=>{
      if(picker.hidden)return;
      if(form.contains(event.target))return;
      picker.hidden=true;
      toggle.setAttribute('aria-expanded','false');
    });
  }

  async function initialize(){
    try{
      if(staff){
        const verified=await OwnerAuth.validateFinanceSession();
        if(!verified.ok){window.location.replace('login.html');return;}
        state.me='S:'+verified.session.user.id;
      }else{
        const employee=await KaryawanSession.requirePage();if(!employee)return;
        state.me='E:'+employee.id;
      }
      await loadList();
    }catch(e){console.warn('Inbox init:',e);empty(errorLabel(e));}
  }
  $('inboxTabChats').addEventListener('click',()=>setTab('THREADS'));
  $('inboxTabContacts').addEventListener('click',()=>setTab('CONTACTS'));
  $('inboxThreadBack').addEventListener('click',()=>{setTab('THREADS');void loadList();});
  $('inboxRefresh').addEventListener('click',()=>{if(state.active)void loadMessages(true);else void loadList();});
  search.addEventListener('input',renderList);
  $('inboxForm').addEventListener('submit',send);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(state.active)void loadMessages(true);else void loadList();}});
  state.timer=setInterval(()=>{if(document.hidden||state.deleteBusy)return;if(state.active)void loadMessages(true);else void loadList();},15000);
  setupDeleteThreadButton();
  setupEmojiPicker();
  void initialize();
})();
