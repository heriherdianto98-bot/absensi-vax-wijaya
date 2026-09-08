/*
=========================================================
ERP VAX WIJAYA
Setoran 3 Harian — Warning Panel Merge UI
Safety: UI only. Tidak mengubah engine, rumus, query, validasi, atau data.

Prioritas tampilan:
1. Warning/error aksi pengguna (mis. bukti wajib sebelum Sudah Diambil)
2. Warning ringkasan data (mis. Cash Aktual negatif / Kurang Masuk)
Hanya satu panel warning yang terlihat pada satu waktu.
=========================================================
*/
"use strict";

(function(){
  const MESSAGE_ID="s3v2Message";
  const SUMMARY_ID="s3WarningSummary";
  const MERGED_CLASS="s3-warning-source-merged";
  let urgentActive=false;
  let lastSignature="";
  let observer=null;

  function ensureStyle(){
    if(document.getElementById("s3WarningMergeUiStyle")) return;
    const style=document.createElement("style");
    style.id="s3WarningMergeUiStyle";
    style.textContent=`
      #${MESSAGE_ID}.${MERGED_CLASS}{display:none!important;}
      #${SUMMARY_ID}.is-urgent-merged{display:flex!important;}
      #${SUMMARY_ID}.is-urgent-merged .s3-warning-summary-list{display:block!important;}
      #${SUMMARY_ID}.is-urgent-merged .s3-warning-summary-item{display:block!important;}
    `;
    document.head.appendChild(style);
  }

  function isUrgentMessage(el){
    if(!el || el.hidden) return false;
    const text=String(el.textContent||"").trim();
    if(!text) return false;
    const cls=String(el.className||"").toLowerCase();
    if(/error|danger|fail|warning|warn/.test(cls)) return true;
    return /(wajib|belum|gagal|error|selisih|biaya|bukti|tidak boleh|harus)/i.test(text);
  }

  function esc(v){
    if(typeof SetoranDirectFlow!=="undefined" && typeof SetoranDirectFlow.esc==="function") return SetoranDirectFlow.esc(v);
    return String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c]));
  }

  function restoreDataWarning(){
    const summary=document.getElementById(SUMMARY_ID);
    if(!summary) return;
    urgentActive=false;
    summary.classList.remove("is-urgent-merged");
    /* Jangan menyimpan/menulis ulang HTML summary. Status indicator adalah pemilik panel data. */
    if(typeof SetoranDirectFlow!=="undefined" && typeof SetoranDirectFlow.renderTable==="function"){
      /* render berikutnya dari flow/status-indicator akan mengisi panel normal. */
    }
  }

  function apply(){
    ensureStyle();
    const message=document.getElementById(MESSAGE_ID);
    const summary=document.getElementById(SUMMARY_ID);
    if(!message || !summary) return;

    const urgent=isUrgentMessage(message);
    const text=urgent?String(message.textContent||"").trim():"";
    const signature=`${urgent?1:0}|${text}`;
    if(signature===lastSignature) return;
    lastSignature=signature;

    if(urgent){
      urgentActive=true;
      message.classList.add(MERGED_CLASS);
      summary.classList.add("is-visible","is-urgent-merged");
      summary.innerHTML=`<span class="s3-warning-summary-icon">!</span><div class="s3-warning-summary-copy"><strong>Perlu Dicek</strong><div class="s3-warning-summary-list"><span class="s3-warning-summary-item">${esc(text)}</span></div></div>`;
    }else{
      message.classList.remove(MERGED_CLASS);
      if(urgentActive) restoreDataWarning();
    }
  }

  function bindMessageObserver(){
    const message=document.getElementById(MESSAGE_ID);
    if(!message || typeof MutationObserver==="undefined") return false;
    if(observer) observer.disconnect();
    observer=new MutationObserver(()=>apply());
    observer.observe(message,{
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true,
      attributeFilter:["hidden","class"]
    });
    apply();
    return true;
  }

  function bind(){
    ensureStyle();
    if(bindMessageObserver()) return;

    /* Komponen dapat muncul sedikit setelah DOMContentLoaded. Cari sebentar tanpa mengamati seluruh body. */
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(bindMessageObserver() || tries>=40) clearInterval(timer);
    },100);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
})();
