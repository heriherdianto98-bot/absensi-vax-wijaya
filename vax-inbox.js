/* VAX internal inbox: uses only the isolated vax_inbox_self_v1 RPC.
   Employee identity is inferred from the canonical session token; staff from Supabase Auth.
   No employee ID, role, or authorization decision is trusted from the browser. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const staff=document.body.dataset.inboxMode==='staff';
  const state={active:null,contacts:[],threads:[],tab:'THREADS',busy:false,me:'',timer:null};
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
    if(!state.active)return;
    const id=state.active.id;
    try{
      const data=await rpc('MESSAGES',{p_thread_id:id});
      if(!state.active||state.active.id!==id)return;
      messages.replaceChildren();
      const rows=Array.isArray(data.items)?data.items:[];
      if(!rows.length){const p=document.createElement('p');p.className='inbox-empty';p.textContent='Belum ada pesan. Mulai percakapan di sini.';messages.appendChild(p);}
      for(const row of rows){const bubble=document.createElement('div');bubble.className='inbox-bubble'+(String(row.sender_key)===state.me?' mine':'');
        const body=document.createElement('span');body.textContent=String(row.body||'');
        const time=document.createElement('time');time.textContent=fmtDate(row.created_at);bubble.append(body,time);messages.appendChild(bubble);}
      messages.scrollTop=messages.scrollHeight;
      if(markRead||rows.some(row=>String(row.sender_key)!==state.me))await rpc('READ',{p_thread_id:id});
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
  state.timer=setInterval(()=>{if(document.hidden)return;if(state.active)void loadMessages(true);else void loadList();},15000);
  void initialize();
})();
