/* ERP VAX — ERP Assistant session chat state
   UI/state only. Keeps the conversation while the Help Desk stays in the same module.
   Changing module context starts a fresh conversation.
*/
"use strict";

(function(){
  const A=window.ErpAssistant;
  if(!A||A.__sessionChatInstalled)return;
  A.__sessionChatInstalled=true;

  const STORAGE_KEY="erp_vax_assistant_same_module_chat_v1";
  let booting=false;

  function contextKey(){
    return String(A.contextModule?.id||"GLOBAL");
  }

  function read(){
    try{return JSON.parse(sessionStorage.getItem(STORAGE_KEY)||"null")}catch(_e){return null}
  }

  function write(){
    if(booting||!A.refs?.log)return;
    const payload={
      context:contextKey(),
      html:A.refs.log.innerHTML,
      history:Array.isArray(A.history)?A.history:[],
      state:A.state||{},
      savedAt:Date.now()
    };
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(payload))}catch(_e){}
  }

  function clear(){
    try{sessionStorage.removeItem(STORAGE_KEY)}catch(_e){}
  }

  const originalAddBubble=A.addBubble.bind(A);
  A.addBubble=function(side,html){
    originalAddBubble(side,html);
    write();
  };

  const originalInit=A.init.bind(A);
  A.init=async function(){
    booting=true;
    await originalInit();
    booting=false;

    const current=contextKey();
    const saved=read();

    if(saved&&saved.context===current&&saved.html&&A.refs?.log){
      A.refs.log.innerHTML=saved.html;
      A.history=Array.isArray(saved.history)?saved.history:[];
      A.state=saved.state&&typeof saved.state==="object"?saved.state:{lastModuleId:null,lastFocus:null,lastIntent:null};
      A.refs.log.scrollTop=A.refs.log.scrollHeight;
    }else{
      // A module/context change intentionally discards the old conversation.
      clear();
      write();
    }

    A.refs?.input?.focus();
  };
})();
