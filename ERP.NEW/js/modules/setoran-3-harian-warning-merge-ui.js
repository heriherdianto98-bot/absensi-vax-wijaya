/*
=========================================================
ERP VAX WIJAYA
Setoran 3 Harian — Warning Panel Merge UI
Safety: UI only. Tidak mengubah engine, rumus, query, validasi, atau data.

Satu panel prioritas untuk semua pesan status.
Prioritas tampilan:
1. Error/warning aksi pengguna (mis. bukti wajib sebelum Sudah Diambil)
2. Warning ringkasan data (mis. Cash Aktual negatif / Kurang Masuk)
3. Info/sukses aksi pengguna (mis. Perubahan tersimpan)
4. Panduan SVP

Hanya satu isi prioritas yang terlihat pada satu waktu. Pesan aksi tidak lagi
membuat popup/toast terpisah; semuanya bergantian memakai panel yang sama.
=========================================================
*/
"use strict";

(function(){
  const MESSAGE_ID="s3v2Message";
  const SUMMARY_ID="s3WarningSummary";
  const HELP_ID="s3OutsideCostHelp";
  const MERGED_CLASS="s3-warning-source-merged";
  const ACTION_CLASS="s3-priority-action-active";
  let observer=null;
  let summaryObserver=null;
  let applying=false;

  function ensureStyle(){
    if(document.getElementById("s3WarningMergeUiStyle")) return;
    const style=document.createElement("style");
    style.id="s3WarningMergeUiStyle";
    style.textContent=`
      #${MESSAGE_ID}.${MERGED_CLASS}{display:none!important;}
      #${SUMMARY_ID}.${ACTION_CLASS}{display:flex!important;}
      #${SUMMARY_ID}.${ACTION_CLASS} .s3-warning-summary-copy{display:none!important;}
      #${SUMMARY_ID} .s3-priority-action-copy{display:none;min-width:0;flex:1;}
      #${SUMMARY_ID}.${ACTION_CLASS} .s3-priority-action-copy{display:block!important;}
      #${SUMMARY_ID} .s3-priority-action-copy strong{display:block;margin-bottom:3px;color:#ff7b7b;font-size:10px;font-weight:900;letter-spacing:.7px;text-transform:uppercase;}
      #${SUMMARY_ID} .s3-priority-action-text{color:#ffd7d7;font-size:13px;font-weight:750;line-height:1.45;}
      #${SUMMARY_ID}.is-info-priority{border-color:rgba(239,68,68,.62)!important;border-left-color:#ef4444!important;background:linear-gradient(90deg,rgba(127,29,29,.24),rgba(127,29,29,.08))!important;}
      #${HELP_ID}{display:none;align-items:flex-start;gap:10px;min-height:38px;margin:0 0 8px;padding:9px 12px;border:1px solid rgba(216,165,59,.48);border-left:4px solid #d8a53b;border-radius:9px;background:linear-gradient(90deg,rgba(120,82,20,.18),rgba(120,82,20,.06));color:#f7e7b0;box-shadow:0 0 14px rgba(216,165,59,.06)}
      #${HELP_ID}.is-visible{display:flex}
      #${HELP_ID} .s3-outside-help-icon{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-top:1px;border-radius:50%;background:#d8a53b;color:#111827;font-size:12px;font-weight:1000;box-shadow:0 0 8px rgba(216,165,59,.35)}
    `;
    document.head.appendChild(style);
  }

  function esc(v){
    if(typeof SetoranDirectFlow!=="undefined" && typeof SetoranDirectFlow.esc==="function") return SetoranDirectFlow.esc(v);
    return String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c]));
  }

  function isSvp(){
    return typeof SetoranDirectFlow!=="undefined" && typeof SetoranDirectFlow.isSvp==="function" && SetoranDirectFlow.isSvp();
  }

  function messageState(el){
    if(!el || el.hidden) return null;
    const text=String(el.textContent||"").trim();
    if(!text) return null;
    const cls=String(el.className||"").toLowerCase();
    const urgent=/error|danger|fail|warning|warn/.test(cls) || /(wajib|belum|gagal|error|selisih|biaya|bukti|tidak boleh|harus)/i.test(text);
    return {text,urgent};
  }

  function ensureActionCopy(summary){
    let copy=summary?.querySelector('.s3-priority-action-copy');
    if(copy) return copy;
    if(!summary) return null;
    copy=document.createElement('div');
    copy.className='s3-priority-action-copy';
    copy.innerHTML='<strong>Perlu Dicek</strong><div class="s3-priority-action-text"></div>';
    summary.appendChild(copy);
    return copy;
  }

  function hasDataWarning(summary){
    if(!summary) return false;
    const visible=summary.classList.contains('is-visible');
    const list=summary.querySelector('.s3-warning-summary-list');
    const text=String(list?.textContent||'').trim();
    return Boolean(visible && text);
  }

  function ensureHelp(){
    let help=document.getElementById(HELP_ID);
    if(help) return help;
    const tableCard=document.querySelector('.s3sheet-table-card');
    if(!tableCard) return null;
    help=document.createElement('div');
    help.id=HELP_ID;
    help.setAttribute('role','note');
    help.innerHTML='<span class="s3-outside-help-icon">i</span>';
    tableCard.parentNode.insertBefore(help,tableCard);
    return help;
  }

  function syncPriorityHelp(){
    const help=ensureHelp();
    if(!help) return;
    const message=messageState(document.getElementById(MESSAGE_ID));
    const summary=document.getElementById(SUMMARY_ID);
    const dataWarning=hasDataWarning(summary) && !summary?.classList.contains(ACTION_CLASS);
    help.classList.toggle('is-visible',Boolean(isSvp() && !message && !dataWarning));
  }

  function clearAction(summary){
    if(!summary) return;
    summary.classList.remove(ACTION_CLASS,'is-info-priority');
    const copy=summary.querySelector('.s3-priority-action-copy');
    if(copy) copy.style.display='none';
    /* Bila panel aslinya tidak punya warning data, jangan paksa tetap tampil. */
    if(!hasDataWarning(summary)) summary.classList.remove('is-visible');
  }

  function showAction(summary,state,label){
    if(!summary || !state) return;
    const copy=ensureActionCopy(summary);
    if(!copy) return;
    const title=copy.querySelector('strong');
    const text=copy.querySelector('.s3-priority-action-text');
    if(title) title.textContent=label;
    if(text) text.innerHTML=esc(state.text);
    copy.style.display='block';
    summary.classList.add('is-visible',ACTION_CLASS,'is-info-priority');
  }

  function apply(){
    if(applying) return;
    applying=true;
    try{
      ensureStyle();
      const message=document.getElementById(MESSAGE_ID);
      const summary=document.getElementById(SUMMARY_ID);
      if(!message || !summary){syncPriorityHelp();return;}

      const state=messageState(message);
      const dataWarning=hasDataWarning(summary) && !summary.classList.contains(ACTION_CLASS);

      /* Semua pesan sumber disembunyikan dari lokasi lama supaya tidak ada toast kedua. */
      if(state) message.classList.add(MERGED_CLASS);
      else message.classList.remove(MERGED_CLASS);

      if(state?.urgent){
        /* Prioritas 1: error/warning aksi user selalu mengalahkan warning data. */
        showAction(summary,state,'PERLU DICEK');
      }else if(dataWarning){
        /* Prioritas 2: warning data tetap tampil. Pesan sukses menunggu/hilang sendiri. */
        clearAction(summary);
        if(state) message.classList.add(MERGED_CLASS);
      }else if(state){
        /* Prioritas 3: info/sukses memakai panel merah yang sama, bukan popup. */
        showAction(summary,state,'INFO');
      }else{
        clearAction(summary);
      }

      syncPriorityHelp();
    }finally{
      applying=false;
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

  function bindSummaryObserver(){
    const summary=document.getElementById(SUMMARY_ID);
    if(!summary || typeof MutationObserver==="undefined") return false;
    if(summaryObserver) summaryObserver.disconnect();
    summaryObserver=new MutationObserver(()=>apply());
    summaryObserver.observe(summary,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    apply();
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
