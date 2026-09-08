/*
=========================================================
VAX ERP — ARUS KAS V2 CORRECTION NOTE UI
UI/runtime additive only. Tidak mengubah engine, data, formula,
query, saldo, atau workflow koreksi existing.

Tujuan:
- Saat transaksi MANUAL berstatus MINTA_KOREKSI dibuka oleh SVP,
  tampil panel CATATAN OWNER di modal Edit Arus Kas.
- Isi panel membaca correction_note yang memang sudah tersimpan.
- Setelah SVP menyimpan perubahan, flow existing mengembalikan status
  ke BELUM_DIVERIFIKASI; panel otomatis tidak tampil lagi pada edit berikutnya.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__correctionNoteUiInstalled) return;
  flow.__correctionNoteUiInstalled=true;

  const baseOpenInput=flow.openInput?.bind(flow);
  const isSvp=()=>String(flow.role||"").toLowerCase()==="svp";
  const rowById=id=>flow.ledger?.find(x=>String(x.id)===String(id))||null;

  function currentRow(){
    const id=document.getElementById("ak2EditId")?.value;
    return id?rowById(id):null;
  }

  function ensurePanel(){
    const modal=document.getElementById("ak2Modal");
    if(!modal) return null;
    let panel=document.getElementById("ak2CorrectionNotePanel");
    if(panel) return panel;

    panel=document.createElement("div");
    panel.id="ak2CorrectionNotePanel";
    panel.className="ak2-correction-note-panel";
    panel.hidden=true;
    panel.innerHTML=`
      <div class="ak2-correction-note-head">
        <span class="ak2-correction-note-icon">!</span>
        <div>
          <strong>CATATAN OWNER</strong>
          <small>Perbaiki transaksi ini lalu Simpan Perubahan</small>
        </div>
      </div>
      <div id="ak2CorrectionNoteText" class="ak2-correction-note-text"></div>`;

    const body=modal.querySelector(".ak2-modal-body")
      || modal.querySelector(".ak2-panel-body")
      || modal.querySelector("form")
      || modal.querySelector(".ak2-panel");
    if(!body) return null;
    body.insertBefore(panel,body.firstChild);
    return panel;
  }

  function syncPanel(row=currentRow()){
    const panel=ensurePanel();
    if(!panel) return;
    const note=String(row?.correction_note||"").trim();
    const show=isSvp() && row?.entry_type==="MANUAL" && String(row?.verification_status||"")==="MINTA_KOREKSI" && !!note;
    panel.hidden=!show;
    panel.classList.toggle("is-visible",show);
    const text=panel.querySelector("#ak2CorrectionNoteText");
    if(text) text.textContent=show?note:"";
  }

  if(baseOpenInput){
    flow.openInput=function(row=null){
      const result=baseOpenInput(row);
      setTimeout(()=>syncPanel(row),0);
      return result;
    };
  }

  document.addEventListener("click",e=>{
    if(e.target.closest?.("[data-ak2-close]")){
      setTimeout(()=>syncPanel(null),0);
    }
  },true);

  function installStyle(){
    if(document.getElementById("ak2CorrectionNoteUiStyle")) return;
    const s=document.createElement("style");
    s.id="ak2CorrectionNoteUiStyle";
    s.textContent=`
      body.page-arus-kas .ak2-correction-note-panel{
        margin:0 0 16px;
        padding:13px 15px;
        border:1px solid rgba(202,77,77,.72);
        border-radius:12px;
        background:linear-gradient(180deg,rgba(86,28,28,.34),rgba(53,20,20,.30));
        box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 8px 22px rgba(0,0,0,.14);
      }
      body.page-arus-kas .ak2-correction-note-panel[hidden]{display:none!important}
      body.page-arus-kas .ak2-correction-note-head{
        display:flex;
        align-items:center;
        gap:10px;
        margin-bottom:9px;
      }
      body.page-arus-kas .ak2-correction-note-icon{
        width:26px;
        height:26px;
        display:grid;
        place-items:center;
        flex:0 0 26px;
        border-radius:50%;
        border:1px solid #b94c4c;
        background:#611f1f;
        color:#ffd0d0;
        font-size:15px;
        font-weight:950;
      }
      body.page-arus-kas .ak2-correction-note-head strong{
        display:block;
        color:#ffb8b8;
        font-size:12px;
        font-weight:950;
        letter-spacing:.08em;
      }
      body.page-arus-kas .ak2-correction-note-head small{
        display:block;
        margin-top:2px;
        color:#aeb8c2;
        font-size:11px;
        font-weight:650;
      }
      body.page-arus-kas .ak2-correction-note-text{
        min-height:42px;
        display:flex;
        align-items:center;
        padding:10px 12px;
        border-radius:9px;
        background:rgba(8,14,20,.52);
        border:1px solid rgba(117,74,74,.42);
        color:#fff0f0;
        font-size:15px;
        font-weight:800;
        line-height:1.35;
        white-space:pre-wrap;
        word-break:break-word;
      }
    `;
    document.head.appendChild(s);
  }

  installStyle();
  ensurePanel();
  syncPanel();
})();
