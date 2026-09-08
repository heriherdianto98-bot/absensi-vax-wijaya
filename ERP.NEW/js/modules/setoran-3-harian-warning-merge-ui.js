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
  let savedSummaryHtml="";
  let urgentActive=false;
  let applying=false;

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

  function apply(){
    if(applying) return;
    applying=true;
    try{
      ensureStyle();
      const message=document.getElementById(MESSAGE_ID);
      const summary=document.getElementById(SUMMARY_ID);
      if(!message || !summary) return;

      const urgent=isUrgentMessage(message);
      if(urgent){
        if(!urgentActive) savedSummaryHtml=summary.innerHTML;
        urgentActive=true;
        message.classList.add(MERGED_CLASS);
        summary.classList.add("is-visible","is-urgent-merged");
        const text=String(message.textContent||"").trim();
        summary.innerHTML=`<span class="s3-warning-summary-icon">!</span><div class="s3-warning-summary-copy"><strong>Perlu Dicek</strong><div class="s3-warning-summary-list"><span class="s3-warning-summary-item">${esc(text)}</span></div></div>`;
      }else{
        message.classList.remove(MERGED_CLASS);
        if(urgentActive){
          urgentActive=false;
          summary.classList.remove("is-urgent-merged");
          if(savedSummaryHtml) summary.innerHTML=savedSummaryHtml;
          savedSummaryHtml="";
          /* status-indicator menentukan sendiri apakah panel perlu visible */
          const hasItems=!!summary.querySelector(".s3-warning-summary-item");
          summary.classList.toggle("is-visible",hasItems);
        }
      }
    }finally{
      applying=false;
    }
  }

  function bind(){
    ensureStyle();
    const root=document.body;
    if(typeof MutationObserver!=="undefined" && root){
      const observer=new MutationObserver(()=>queueMicrotask(apply));
      observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["hidden","class"]});
    }
    apply();
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
})();
