/*
=========================================================
ERP VAX WIJAYA
Setoran 3 Harian — Warning Panel Merge UI
Safety: UI only. Tidak mengubah engine, rumus, query, validasi, atau data.

Prioritas tampilan:
1. Warning/error aksi pengguna (mis. bukti wajib sebelum Sudah Diambil)
2. Warning ringkasan data (mis. Cash Aktual negatif / Kurang Masuk)
3. Panduan singkat SVP untuk Biaya di luar Cashout
Hanya satu panel prioritas yang terlihat pada satu waktu.
=========================================================
*/
"use strict";

(function(){
  const MESSAGE_ID="s3v2Message";
  const SUMMARY_ID="s3WarningSummary";
  const HELP_ID="s3OutsideCostHelp";
  const MERGED_CLASS="s3-warning-source-merged";
  let urgentActive=false;
  let lastSignature="";
  let observer=null;
  let summaryObserver=null;

  function ensureStyle(){
    if(document.getElementById("s3WarningMergeUiStyle")) return;
    const style=document.createElement("style");
    style.id="s3WarningMergeUiStyle";
    style.textContent=`
      #${MESSAGE_ID}.${MERGED_CLASS}{display:none!important;}
      #${SUMMARY_ID}.is-urgent-merged{display:flex!important;}
      #${SUMMARY_ID}.is-urgent-merged .s3-warning-summary-list{display:block!important;}
      #${SUMMARY_ID}.is-urgent-merged .s3-warning-summary-item{display:block!important;}
      #${HELP_ID}{display:none;align-items:flex-start;gap:10px;margin:0 0 8px;padding:9px 12px;border:1px solid rgba(216,165,59,.48);border-left:4px solid #d8a53b;border-radius:9px;background:linear-gradient(90deg,rgba(120,82,20,.18),rgba(120,82,20,.06));color:#f7e7b0;box-shadow:0 0 14px rgba(216,165,59,.06)}
      #${HELP_ID}.is-visible{display:flex}
      #${HELP_ID} .s3-outside-help-icon{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-top:1px;border-radius:50%;background:#d8a53b;color:#111827;font-size:12px;font-weight:1000;box-shadow:0 0 8px rgba(216,165,59,.35)}
      #${HELP_ID} .s3-outside-help-copy{min-width:0}
      #${HELP_ID} .s3-outside-help-copy strong{display:block;margin-bottom:3px;color:#f4c85b;font-size:10px;font-weight:1000;letter-spacing:.7px;text-transform:uppercase}
      #${HELP_ID} .s3-outside-help-copy span{display:block;color:#f7e7b0;font-size:12px;font-weight:750;line-height:1.45}
      #${HELP_ID} .s3-outside-help-copy b{color:#fff;font-weight:1000}
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

  function isSvp(){
    return typeof SetoranDirectFlow!=="undefined" && typeof SetoranDirectFlow.isSvp==="function" && SetoranDirectFlow.isSvp();
  }

  function ensureHelp(){
    let help=document.getElementById(HELP_ID);
    if(help) return help;
    const tableCard=document.querySelector('.s3sheet-table-card');
    if(!tableCard) return null;
    help=document.createElement('div');
    help.id=HELP_ID;
    help.setAttribute('role','note');
    help.innerHTML=`<span class="s3-outside-help-icon">i</span><div class="s3-outside-help-copy"><strong>Cara isi Biaya di luar Cashout</strong><span>Klik ikon <b>🧾</b> pada kolom <b>Biaya di luar Cashout</b> → isi <b>nominal</b> → isi <b>keterangan biaya</b> → upload <b>foto bukti biaya</b> → klik <b>SIMPAN</b>.</span></div>`;
    tableCard.parentNode.insertBefore(help,tableCard);
    return help;
  }

  function syncPriorityHelp(){
    const help=ensureHelp();
    if(!help) return;
    const message=document.getElementById(MESSAGE_ID);
    const summary=document.getElementById(SUMMARY_ID);
    const urgent=isUrgentMessage(message);
    const summaryVisible=Boolean(summary?.classList.contains('is-visible'));
    help.classList.toggle('is-visible',Boolean(isSvp() && !urgent && !summaryVisible));
  }

  function restoreDataWarning(){
    const summary=document.getElementById(SUMMARY_ID);
    if(!summary) return;
    urgentActive=false;
    summary.classList.remove("is-urgent-merged");
    syncPriorityHelp();
  }

  function apply(){
    ensureStyle();
    const message=document.getElementById(MESSAGE_ID);
    const summary=document.getElementById(SUMMARY_ID);
    if(!message || !summary){syncPriorityHelp();return;}

    const urgent=isUrgentMessage(message);
    const text=urgent?String(message.textContent||"").trim():"";
    const signature=`${urgent?1:0}|${text}`;
    if(signature!==lastSignature){
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
    syncPriorityHelp();
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

  function bindSummaryObserver(){
    const summary=document.getElementById(SUMMARY_ID);
    if(!summary || typeof MutationObserver==="undefined") return false;
    if(summaryObserver) summaryObserver.disconnect();
    summaryObserver=new MutationObserver(()=>syncPriorityHelp());
    summaryObserver.observe(summary,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    syncPriorityHelp();
    return true;
  }

  function bind(){
    ensureStyle();
    ensureHelp();
    const gotMessage=bindMessageObserver();
    const gotSummary=bindSummaryObserver();
    if(gotMessage&&gotSummary) return;

    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      const a=bindMessageObserver();
      const b=bindSummaryObserver();
      if((a&&b) || tries>=40) clearInterval(timer);
    },100);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
})();
