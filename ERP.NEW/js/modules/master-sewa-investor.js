(() => {
  const el=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>`Rp ${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n||0))}`;
  const pct=n=>`${new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number(n||0))}%`;
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateLabel=v=>{if(!v)return 'Awal data';const [y,m,d]=String(v).slice(0,10).split('-');return `${d}-${m}-${y}`;};
  const parseMoney=v=>Number(String(v??'').replace(/[^0-9]/g,'')||0);
  const human=v=>String(v??'').replaceAll('_',' ');
  const phoneLabel=v=>{
    const raw=String(v||'').trim();
    if(!raw)return '—';
    const digits=raw.replace(/\D/g,'');
    if(!digits)return raw;
    if(digits.startsWith('62'))return `+${digits}`;
    if(digits.startsWith('0'))return `+62${digits.slice(1)}`;
    return raw;
  };
  let state={sewa:[],investor:[]};

  function normalizePayload(raw){
    let data=raw;
    if(typeof data==='string'){
      try{data=JSON.parse(data);}catch(_e){}
    }
    if(Array.isArray(data)&&data.length===1&&data[0]&&typeof data[0]==='object') data=data[0];
    if(data&&data.payload) data=data.payload;
    return {
      sewa:Array.isArray(data?.sewa)?data.sewa:[],
      investor:Array.isArray(data?.investor)?data.investor:[]
    };
  }

  function ensurePhoneUi(){
    const activeHead=el('investorBody')?.closest('table')?.querySelector('thead tr');
    if(activeHead&&!activeHead.querySelector('[data-investor-phone-head]')){
      const investorTh=activeHead.children[1];
      const th=document.createElement('th');
      th.textContent='No. WhatsApp';
      th.dataset.investorPhoneHead='1';
      investorTh?.after(th);
    }

    const historyHead=el('investorHistory')?.closest('table')?.querySelector('thead tr');
    if(historyHead&&!historyHead.querySelector('[data-investor-phone-head]')){
      const investorTh=historyHead.children[1];
      const th=document.createElement('th');
      th.textContent='No. WhatsApp';
      th.dataset.investorPhoneHead='1';
      investorTh?.after(th);
    }

    if(!el('modalInvestorPhone')){
      const nameInput=el('modalInvestorName');
      const nameLabel=nameInput?.closest('label');
      if(nameLabel){
        const phoneLabelNode=document.createElement('label');
        phoneLabelNode.className='msi-span-2';
        phoneLabelNode.textContent='No. WhatsApp';
        const input=document.createElement('input');
        input.id='modalInvestorPhone';
        input.type='tel';
        input.readOnly=true;
        input.setAttribute('aria-readonly','true');
        input.placeholder='Belum ada nomor';
        phoneLabelNode.appendChild(input);
        nameLabel.after(phoneLabelNode);
      }
    }
  }

  function setLoadState(msg='',kind=''){
    const box=el('masterLoadState');
    if(!box)return;
    box.textContent=msg;
    box.className=`msi-load-state ${kind}`.trim();
    box.hidden=!msg;
  }

  async function load(){
    setLoadState('Memuat master…','loading');
    const {data,error}=await db.rpc('erp_master_finance_get');
    if(error) throw error;
    state=normalizePayload(data);
    if(!state.sewa.length&&!state.investor.length){
      const [s,i]=await Promise.all([
        db.from('master_biaya_sewa_tempat').select('*').order('branch_name'),
        db.from('master_investor').select('*').order('branch_name')
      ]);
      if(!s.error&&Array.isArray(s.data)) state.sewa=s.data;
      if(!i.error&&Array.isArray(i.data)) state.investor=i.data;
    }
    render();
    setLoadState('');
  }

  const activeRows=rows=>rows.filter(r=>String(r.status||'').toUpperCase()==='AKTIF'&&!r.effective_to).sort((a,b)=>String(a.branch_name||'').localeCompare(String(b.branch_name||''),'id'));
  const historyRows=rows=>rows.slice().sort((a,b)=>String(a.branch_name||'').localeCompare(String(b.branch_name||''),'id')||String(b.effective_from||'').localeCompare(String(a.effective_from||'')));

  function render(){
    ensurePhoneUi();
    const sewa=activeRows(state.sewa||[]), inv=activeRows(state.investor||[]);
    el('sewaCount').textContent=`${sewa.length} cabang`;
    el('investorCount').textContent=`${inv.length} cabang`;

    el('sewaBody').innerHTML=sewa.length?sewa.map(r=>`<tr>
      <td><strong>${esc(r.branch_name)}</strong></td>
      <td class="num"><strong>${money(r.monthly_rent)}</strong></td>
      <td>${esc(human(r.period_type||'BULANAN'))}</td>
      <td>${esc(human(r.due_rule||'AKHIR_BULAN'))}</td>
      <td>${esc(human(r.loss_rule||'JADI_HUTANG_BULAN_BERIKUTNYA'))}</td>
      <td>${esc(dateLabel(r.effective_from))} — seterusnya</td>
      <td><button class="msi-edit" data-edit-sewa="${esc(r.branch_code)}">Edit</button></td>
    </tr>`).join(''):'<tr><td colspan="7" class="msi-empty">Belum ada data sewa.</td></tr>';

    el('investorBody').innerHTML=inv.length?inv.map(r=>`<tr>
      <td><strong>${esc(r.branch_name)}</strong></td>
      <td><strong>${esc(r.investor_name)}</strong></td>
      <td>${esc(phoneLabel(r.phone_number))}</td>
      <td class="num"><strong>${pct(r.profit_share_percent)}</strong></td>
      <td>${r.rent_entitlement?'Ya':'Tidak'}</td>
      <td>${esc(human(r.profit_basis||'LABA_BERSIH'))}</td>
      <td>${r.payment_day_start}–${r.payment_day_end} ${esc(human(r.payment_timing||'AWAL_BULAN').toLowerCase())}</td>
      <td>${esc(dateLabel(r.effective_from))} — seterusnya</td>
      <td><button class="msi-edit" data-edit-investor="${esc(r.branch_code)}">Edit</button></td>
    </tr>`).join(''):'<tr><td colspan="9" class="msi-empty">Belum ada data investor.</td></tr>';

    el('sewaHistory').innerHTML=historyRows(state.sewa||[]).map(r=>`<tr><td>${esc(r.branch_name)}</td><td class="num">${money(r.monthly_rent)}</td><td>${esc(dateLabel(r.effective_from))}</td><td>${r.effective_to?esc(dateLabel(r.effective_to)):'Seterusnya'}</td><td><span class="msi-pill">${esc(r.status)}</span></td><td>${esc(r.notes||'—')}</td></tr>`).join('')||'<tr><td colspan="6" class="msi-empty">Belum ada riwayat.</td></tr>';
    el('investorHistory').innerHTML=historyRows(state.investor||[]).map(r=>`<tr><td>${esc(r.branch_name)}</td><td>${esc(r.investor_name)}</td><td>${esc(phoneLabel(r.phone_number))}</td><td class="num">${pct(r.profit_share_percent)}</td><td>${esc(dateLabel(r.effective_from))}</td><td>${r.effective_to?esc(dateLabel(r.effective_to)):'Seterusnya'}</td><td><span class="msi-pill">${esc(r.status)}</span></td><td>${esc(r.notes||'—')}</td></tr>`).join('')||'<tr><td colspan="8" class="msi-empty">Belum ada riwayat.</td></tr>';

    document.querySelectorAll('[data-edit-sewa]').forEach(b=>b.onclick=()=>openEdit('sewa',b.dataset.editSewa));
    document.querySelectorAll('[data-edit-investor]').forEach(b=>b.onclick=()=>openEdit('investor',b.dataset.editInvestor));
  }

  function setSectionVisible(id,visible){const node=el(id);if(node)node.hidden=!visible;}

  function openEdit(type,code){
    const rows=type==='sewa'?state.sewa:state.investor;
    const row=activeRows(rows).find(r=>r.branch_code===code); if(!row)return;
    el('modalType').value=type;
    el('modalBranchCode').value=code;
    el('modalBranch').value=row.branch_name||code;
    el('modalEffective').value=today();
    el('modalNotes').value=row.notes||'';
    el('modalMsg').textContent='';
    el('modalMsg').className='msi-msg';

    const isSewa=type==='sewa';
    setSectionVisible('sewaEditor',isSewa);
    setSectionVisible('investorEditor',!isSewa);
    el('modalTitle').textContent=isSewa?'Edit Master Biaya Sewa':'Edit Master Investor';
    el('modalEyebrow').textContent=isSewa?'MASTER SEWA':'MASTER INVESTOR';

    if(isSewa){
      el('modalRent').value=money(row.monthly_rent);
      el('modalPeriodType').value=row.period_type||'BULANAN';
      el('modalDueRule').value=row.due_rule||'AKHIR_BULAN';
      el('modalLossRule').value=row.loss_rule||'JADI_HUTANG_BULAN_BERIKUTNYA';
    }else{
      el('modalInvestorName').value=row.investor_name||'';
      if(el('modalInvestorPhone'))el('modalInvestorPhone').value=phoneLabel(row.phone_number)==='—'?'':phoneLabel(row.phone_number);
      el('modalShare').value=Number(row.profit_share_percent||0);
      el('modalRentEntitlement').value=row.rent_entitlement?'true':'false';
      el('modalProfitBasis').value=row.profit_basis||'LABA_BERSIH';
      el('modalDeductions').value=row.deductions_before_share||'SEWA + GAJI + OPERASIONAL + BIAYA_LAIN_DISETUJUI';
      el('modalPayStart').value=Number(row.payment_day_start||10);
      el('modalPayEnd').value=Number(row.payment_day_end||15);
      el('modalPaymentTiming').value=row.payment_timing||'AWAL_BULAN';
    }
    el('msiModal').hidden=false;
  }

  function close(){el('msiModal').hidden=true;}

  async function save(e){
    e.preventDefault();
    const type=el('modalType').value;
    const code=el('modalBranchCode').value;
    const effective=el('modalEffective').value;
    const notes=el('modalNotes').value||null;
    const btn=el('modalSave'),msg=el('modalMsg');
    try{
      if(!effective)throw new Error('Pilih tanggal berlaku.');
      btn.disabled=true; msg.textContent='Menyimpan…'; msg.className='msi-msg';
      let result;
      if(type==='sewa'){
        const nominal=parseMoney(el('modalRent').value);
        if(nominal<=0)throw new Error('Nominal sewa harus lebih dari 0.');
        result=await db.rpc('erp_master_sewa_update_full',{
          p_branch_code:code,
          p_monthly_rent:nominal,
          p_period_type:el('modalPeriodType').value,
          p_due_rule:el('modalDueRule').value,
          p_loss_rule:el('modalLossRule').value,
          p_effective_from:effective,
          p_notes:notes
        });
      }else{
        const share=Number(String(el('modalShare').value).replace(',','.'));
        if(!Number.isFinite(share)||share<0||share>100)throw new Error('Persentase harus 0–100.');
        const payStart=Number(el('modalPayStart').value),payEnd=Number(el('modalPayEnd').value);
        if(payStart<1||payStart>31||payEnd<1||payEnd>31||payStart>payEnd)throw new Error('Tanggal pembayaran tidak valid.');
        result=await db.rpc('erp_master_investor_update_full',{
          p_branch_code:code,
          p_investor_name:el('modalInvestorName').value.trim(),
          p_profit_share_percent:share,
          p_rent_entitlement:el('modalRentEntitlement').value==='true',
          p_profit_basis:el('modalProfitBasis').value,
          p_deductions_before_share:el('modalDeductions').value.trim(),
          p_payment_day_start:payStart,
          p_payment_day_end:payEnd,
          p_payment_timing:el('modalPaymentTiming').value,
          p_effective_from:effective,
          p_notes:notes
        });
      }
      if(result.error)throw result.error;
      msg.textContent='Perubahan tersimpan. Histori lama tetap aman.';
      msg.className='msi-msg ok';
      await load();
      setTimeout(close,650);
    }catch(err){
      msg.textContent=err?.message||'Gagal menyimpan.';
      msg.className='msi-msg err';
    }finally{btn.disabled=false;}
  }

  function bind(){
    ensurePhoneUi();
    document.querySelectorAll('.msi-tabs button').forEach(b=>b.onclick=()=>{
      document.querySelectorAll('.msi-tabs button').forEach(x=>x.classList.toggle('is-active',x===b));
      el('panelSewa').classList.toggle('is-active',b.dataset.tab==='sewa');
      el('panelInvestor').classList.toggle('is-active',b.dataset.tab==='investor');
    });
    document.querySelectorAll('[data-close]').forEach(x=>x.onclick=close);
    el('msiForm').onsubmit=save;
    el('modalRent').addEventListener('input',e=>{const n=parseMoney(e.target.value);e.target.value=money(n);});
    el('btnMasterReload')?.addEventListener('click',()=>load().catch(showLoadError));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  }

  function showLoadError(err){
    console.error('[Master Sewa Investor]',err);
    setLoadState(err?.message||'Gagal memuat master.','error');
    el('sewaBody').innerHTML='<tr><td colspan="7" class="msi-empty">Gagal memuat data. Klik Muat Ulang.</td></tr>';
    el('investorBody').innerHTML='<tr><td colspan="9" class="msi-empty">Gagal memuat data. Klik Muat Ulang.</td></tr>';
  }

  async function init(){
    bind();
    try{await load();}catch(err){showLoadError(err);}
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();