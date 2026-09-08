/* VAX ERP — Setoran 3 Harian: popup khusus Biaya di luar Cashout.
   Additive UI/proof workflow only. Tidak mengubah DailyDataEngine, SetoranMoneyEngine,
   rumus canonical, atau modul finance yang LOCK. */
"use strict";
(function bootOutsidePopup(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOutsidePopup,60);
    return;
  }

  const flow=SetoranDirectFlow;
  if(flow.__outsidePopupInstalled) return;
  flow.__outsidePopupInstalled=true;

  const noteDraft=new Map();
  let busy=false;

  function isSvp(){return typeof flow.isSvp==="function" && flow.isSvp();}
  function money(v){const n=Number(v);return Number.isFinite(n)?n:0;}
  function key(id){return flow.key(id);}
  function branchName(id){return flow.canonicalName(flow.branches.find(b=>Number(b.id)===Number(id))?.nama_cabang||"");}
  function outsideProofReady(saved){return Boolean(saved?._proofByKind?.OUTSIDE_CASHOUT);}
  function outsideNote(id){
    if(noteDraft.has(key(id))) return String(noteDraft.get(key(id))||"").trim();
    const saved=flow.savedRows.get(key(id))||{};
    return String(saved.outside_cashout_note||"").trim();
  }

  function ensureStyle(){
    if(document.getElementById("s3OutsidePopupStyle")) return;
    const s=document.createElement("style");
    s.id="s3OutsidePopupStyle";
    s.textContent=`
      .s3-outside-cell-ui{display:grid;grid-template-columns:minmax(76px,1fr) 30px;gap:6px;align-items:center;min-width:118px}
      .s3-outside-cell-ui>[data-field="outside"]{margin:0!important;width:100%!important;opacity:.78!important;cursor:default!important;background:rgba(9,18,27,.82)!important}
      .s3-outside-open{width:30px;height:30px;padding:0;border:1px solid rgba(216,165,59,.42);border-radius:8px;background:rgba(216,165,59,.08);color:#f4c85b;font-size:15px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
      .s3-outside-open:hover{background:rgba(216,165,59,.15);border-color:rgba(216,165,59,.72);transform:translateY(-1px)}
      .s3-outside-open.has-data{border-color:rgba(74,222,128,.38);background:rgba(22,101,52,.13);color:#78e7aa}
      #s3OutsideCostModal .s3sheet-modal-panel{width:min(720px,calc(100vw - 34px));max-height:90vh;padding:0;overflow:auto;border:1px solid rgba(216,165,59,.44);box-shadow:0 24px 80px rgba(0,0,0,.68),0 0 28px rgba(216,165,59,.10)}
      #s3OutsideCostModal .s3sheet-modal-head{padding:18px 20px;border-bottom:1px solid rgba(216,165,59,.24);background:linear-gradient(180deg,rgba(216,165,59,.08),rgba(8,17,25,.22))}
      #s3OutsideCostModal .s3sheet-modal-head strong{display:block;font-size:21px;color:#fff;letter-spacing:.02em}
      #s3OutsideCostModal .s3sheet-modal-head small{display:block;margin-top:4px;font-size:12px;font-weight:800;color:#d9b854}
      .s3-outside-modal-body{padding:20px}
      .s3-outside-form{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .s3-outside-field{display:flex;flex-direction:column;gap:7px}
      .s3-outside-field.is-note,.s3-outside-field.is-proof{grid-column:1/-1}
      .s3-outside-field label{font-size:11px;font-weight:1000;letter-spacing:.08em;color:#d8a53b;text-transform:uppercase}
      .s3-outside-field input[type="number"],.s3-outside-field textarea{width:100%;box-sizing:border-box;border:1px solid rgba(216,165,59,.30);border-radius:10px;background:#09131c;color:#f4f7fa;padding:11px 12px;font:800 14px/1.3 "Source Sans 3",sans-serif;outline:none}
      .s3-outside-field textarea{min-height:104px;resize:vertical}
      .s3-outside-field input:focus,.s3-outside-field textarea:focus{border-color:#d8a53b;box-shadow:0 0 0 2px rgba(216,165,59,.10)}
      .s3-outside-proof-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#0b151f}
      .s3-outside-proof-pick{min-height:38px;padding:8px 12px;border:1px solid rgba(216,165,59,.45);border-radius:8px;background:rgba(216,165,59,.09);color:#f4c85b;font-weight:1000;cursor:pointer}
      .s3-outside-proof-status{font-size:12px;font-weight:800;color:#91a1af}
      .s3-outside-proof-status.ok{color:#78e7aa}
      .s3-outside-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;padding-top:15px;border-top:1px solid rgba(255,255,255,.07)}
      .s3-outside-actions button{min-height:40px;padding:8px 15px;border-radius:9px;font-weight:1000;cursor:pointer}
      .s3-outside-actions [data-outside-cancel]{border:1px solid rgba(255,255,255,.13);background:#101923;color:#c3ced7}
      .s3-outside-actions [data-outside-save]{border:1px solid rgba(74,222,128,.42);background:rgba(22,101,52,.20);color:#9af0bb}
      .s3-outside-actions [data-outside-save]:disabled{opacity:.45;cursor:not-allowed}
      @media(max-width:620px){.s3-outside-form{grid-template-columns:1fr}.s3-outside-field.is-note,.s3-outside-field.is-proof{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  /* Keterangan utama tetap khusus BRI/Non Tunai. Jangan fallback ke outside_cashout_note. */
  const baseRowHtml=flow.rowHtml.bind(flow);
  flow.rowHtml=function(branch){
    const saved=this.savedRows.get(this.key(branch.id));
    if(!saved?.outside_cashout_note) return baseRowHtml(branch);
    const keep=saved.outside_cashout_note;
    saved.outside_cashout_note=null;
    try{return baseRowHtml(branch);}finally{saved.outside_cashout_note=keep;}
  };

  function ensureModal(){
    let m=document.getElementById("s3OutsideCostModal");
    if(m) return m;
    m=document.createElement("div");
    m.className="s3sheet-modal";
    m.id="s3OutsideCostModal";
    m.hidden=true;
    m.innerHTML=`
      <div class="s3sheet-modal-backdrop" data-outside-cancel></div>
      <div class="s3sheet-modal-panel">
        <div class="s3sheet-modal-head">
          <div><strong>BIAYA DI LUAR CASHOUT</strong><small id="s3OutsideMeta">—</small></div>
          <button type="button" data-outside-cancel>×</button>
        </div>
        <div class="s3-outside-modal-body">
          <div class="s3-outside-form">
            <div class="s3-outside-field">
              <label for="s3OutsideAmount">Nominal Biaya</label>
              <input id="s3OutsideAmount" type="number" min="0" step="1000" placeholder="0">
            </div>
            <div class="s3-outside-field">
              <label>Status Bukti</label>
              <div class="s3-outside-proof-row" style="height:42px;box-sizing:border-box"><span id="s3OutsideProofMini" class="s3-outside-proof-status">Belum ada bukti</span></div>
            </div>
            <div class="s3-outside-field is-note">
              <label for="s3OutsideNote">Keterangan Biaya</label>
              <textarea id="s3OutsideNote" placeholder="Jelaskan biaya di luar Cashout secara singkat dan jelas."></textarea>
            </div>
            <div class="s3-outside-field is-proof">
              <label>Foto Bukti Biaya</label>
              <div class="s3-outside-proof-row">
                <input id="s3OutsideFile" type="file" accept="image/*" hidden>
                <button type="button" class="s3-outside-proof-pick" data-outside-pick>📷 PILIH FOTO</button>
                <span id="s3OutsideProofStatus" class="s3-outside-proof-status">Belum ada foto dipilih</span>
              </div>
            </div>
          </div>
          <div class="s3-outside-actions">
            <button type="button" data-outside-cancel>BATAL</button>
            <button type="button" data-outside-save>💾 SIMPAN</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-outside-cancel]').forEach(x=>x.addEventListener('click',closeModal));
    m.querySelector('[data-outside-pick]').addEventListener('click',()=>m.querySelector('#s3OutsideFile').click());
    m.querySelector('#s3OutsideFile').addEventListener('change',syncFileLabel);
    m.querySelector('[data-outside-save]').addEventListener('click',savePopup);
    return m;
  }

  function closeModal(){
    const m=document.getElementById('s3OutsideCostModal');
    if(!m) return;
    m.hidden=true;
    m.dataset.branchId='';
    const f=m.querySelector('#s3OutsideFile');
    if(f) f.value='';
  }

  function syncFileLabel(){
    const m=ensureModal();
    const file=m.querySelector('#s3OutsideFile').files?.[0];
    const st=m.querySelector('#s3OutsideProofStatus');
    st.textContent=file?file.name:'Belum ada foto dipilih';
    st.classList.toggle('ok',Boolean(file));
  }

  function mountRow(tr){
    if(!tr||!isSvp()) return;
    const outside=tr.querySelector('[data-field="outside"]');
    if(!outside) return;
    const id=Number(tr.dataset.cabangId||0);
    const saved=flow.savedRows.get(key(id))||{};

    let wrap=outside.closest('.s3-outside-cell-ui');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='s3-outside-cell-ui';
      outside.parentNode.insertBefore(wrap,outside);
      wrap.appendChild(outside);
    }

    outside.disabled=true;
    outside.readOnly=true;
    outside.title='Klik ikon di samping untuk isi/edit Biaya di luar Cashout.';

    let btn=wrap.querySelector('[data-s3-outside-open]');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='s3-outside-open';
      btn.dataset.s3OutsideOpen=String(id);
      btn.textContent='🧾';
      wrap.appendChild(btn);
    }
    const hasData=money(saved.outside_cashout_cost)>0 || Boolean(saved.outside_cashout_note) || outsideProofReady(saved);
    btn.classList.toggle('has-data',hasData);
    btn.title=hasData?'Lihat / ubah Biaya di luar Cashout':'Isi Biaya di luar Cashout';
  }

  function decorate(){
    ensureStyle();ensureModal();
    if(!isSvp()) return;
    document.querySelectorAll('#s3sheetBody tr[data-cabang-id]').forEach(mountRow);
  }

  const baseRender=flow.renderTable.bind(flow);
  flow.renderTable=function(){const r=baseRender(...arguments);decorate();return r;};

  async function ensureSavedRow(tr){
    const id=Number(tr.dataset.cabangId||0);
    let saved=flow.savedRows.get(key(id));
    if(saved?.id) return saved;
    await baseSave(tr,{taken:null,quiet:true});
    saved=flow.savedRows.get(key(id));
    if(!saved?.id) throw new Error('Data setoran belum tersimpan.');
    return saved;
  }

  function openPopup(id){
    if(!isSvp()||busy) return;
    const saved=flow.savedRows.get(key(id))||{};
    const m=ensureModal();
    m.dataset.branchId=String(id);
    m.querySelector('#s3OutsideMeta').textContent=`${branchName(id)} · khusus biaya di luar Cashout`;
    m.querySelector('#s3OutsideAmount').value=money(saved.outside_cashout_cost)||'';
    m.querySelector('#s3OutsideNote').value=String(saved.outside_cashout_note||'');
    m.querySelector('#s3OutsideFile').value='';
    const hasProof=outsideProofReady(saved);
    const mini=m.querySelector('#s3OutsideProofMini');
    mini.textContent=hasProof?'✓ Bukti tersimpan':'Belum ada bukti';
    mini.classList.toggle('ok',hasProof);
    const st=m.querySelector('#s3OutsideProofStatus');
    st.textContent=hasProof?'Bukti lama tersedia. Pilih foto jika ingin mengganti.':'Belum ada foto dipilih';
    st.classList.toggle('ok',hasProof);
    m.hidden=false;
    setTimeout(()=>m.querySelector('#s3OutsideAmount')?.focus(),30);
  }

  /* Core save tetap dipakai. Wrapper ini hanya menjaga agar note biaya tidak menimpa note BRI. */
  const baseSave=flow.saveRow.bind(flow);
  flow.saveRow=async function(tr,options={}){
    if(!tr||!this.isSvp?.()) return baseSave(tr,options);
    const id=Number(tr.dataset.cabangId||0);
    const outside=tr.querySelector('[data-field="outside"]');
    if(!outside) return baseSave(tr,options);

    const amount=money(outside.value);
    const dedicated=outsideNote(id);
    const savedBefore=this.savedRows.get(this.key(id))||{};
    if(amount>0 && (!dedicated || !outsideProofReady(savedBefore))){
      throw new Error('Biaya di luar Cashout wajib memiliki keterangan dan foto bukti biaya.');
    }

    const shared=tr.querySelector('[data-field="note"]');
    const originalShared=String(shared?.value||'');
    let borrowed=false;
    if(amount>0 && dedicated && shared && !originalShared.trim()){
      shared.value=dedicated;
      borrowed=true;
    }

    let result;
    try{result=await baseSave(tr,options);}
    finally{if(borrowed && shared?.isConnected) shared.value=originalShared;}

    if(amount>0 && dedicated){
      const saved=this.savedRows.get(this.key(id));
      if(saved?.id){
        const now=new Date().toISOString();
        const {data,error}=await db.from(this.TABLE).update({
          outside_cashout_note:dedicated,
          non_cash_note:originalShared.trim()||null,
          updated_by:this.user.id,
          updated_at:now
        }).eq('id',saved.id).select('*').single();
        if(error) throw error;
        data._proofLatest=saved._proofLatest||null;
        data._proofByKind=saved._proofByKind||{};
        this.savedRows.set(this.key(id),data);
      }
    }
    return result;
  };

  async function savePopup(){
    if(busy||!isSvp()) return;
    const m=ensureModal();
    const id=Number(m.dataset.branchId||0);
    if(!id) return;
    const tr=document.querySelector(`#s3sheetBody tr[data-cabang-id="${id}"]`);
    if(!tr) return;

    const amount=money(m.querySelector('#s3OutsideAmount').value);
    const note=String(m.querySelector('#s3OutsideNote').value||'').trim();
    const file=m.querySelector('#s3OutsideFile').files?.[0]||null;
    if(amount<=0) return flow.fail?.('Nominal Biaya di luar Cashout wajib diisi.');
    if(!note) return flow.fail?.('Keterangan Biaya di luar Cashout wajib diisi.');

    busy=true;flow.busy?.(true);
    try{
      let saved=await ensureSavedRow(tr);
      if(file){
        await flow.uploadProof(saved,file,'OUTSIDE_CASHOUT');
        saved=flow.savedRows.get(key(id))||saved;
      }
      if(!outsideProofReady(saved)) throw new Error('Foto bukti Biaya di luar Cashout wajib dilampirkan.');

      noteDraft.set(key(id),note);
      const outside=tr.querySelector('[data-field="outside"]');
      outside.disabled=false;
      outside.readOnly=false;
      outside.value=String(amount);
      await flow.saveRow(tr,{taken:null,quiet:true});
      noteDraft.delete(key(id));

      closeModal();
      flow.renderTable();
      flow.renderTotals?.();
      flow.ok?.('Biaya di luar Cashout berhasil disimpan.');
    }catch(err){
      noteDraft.delete(key(id));
      flow.fail?.(err?.message||String(err));
      mountRow(tr);
    }finally{
      busy=false;flow.busy?.(false);
    }
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-s3-outside-open]');
    if(btn) openPopup(Number(btn.dataset.s3OutsideOpen));
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',decorate,{once:true});
  else decorate();
})();
