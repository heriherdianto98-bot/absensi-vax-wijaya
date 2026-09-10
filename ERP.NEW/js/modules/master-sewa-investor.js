(() => {
  const el=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>`Rp ${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n||0))}`;
  const pct=n=>`${new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number(n||0))}%`;
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateLabel=v=>{if(!v)return 'Awal data';const [y,m,d]=String(v).slice(0,10).split('-');return `${d}-${m}-${y}`;};
  const parseMoney=v=>Number(String(v??'').replace(/[^0-9]/g,'')||0);
  let state={sewa:[],investor:[]};

  async function load(){
    const {data,error}=await db.rpc('erp_master_finance_get');
    if(error) throw error;
    state=data||{sewa:[],investor:[]};
    render();
  }

  const activeRows=rows=>rows.filter(r=>String(r.status||'').toUpperCase()==='AKTIF'&&!r.effective_to).sort((a,b)=>String(a.branch_name).localeCompare(String(b.branch_name),'id'));
  const historyRows=rows=>rows.slice().sort((a,b)=>String(a.branch_name).localeCompare(String(b.branch_name),'id')||String(b.effective_from||'').localeCompare(String(a.effective_from||'')));

  function render(){
    const sewa=activeRows(state.sewa||[]), inv=activeRows(state.investor||[]);
    el('sewaCount').textContent=`${sewa.length} cabang`;
    el('investorCount').textContent=`${inv.length} cabang`;
    el('sewaBody').innerHTML=sewa.length?sewa.map(r=>`<tr><td><strong>${esc(r.branch_name)}</strong></td><td class="num"><strong>${money(r.monthly_rent)}</strong></td><td>${esc(r.period_type||'BULANAN')}</td><td>${esc((r.due_rule||'').replaceAll('_',' '))}</td><td>${esc((r.loss_rule||'').replaceAll('_',' '))}</td><td>${esc(dateLabel(r.effective_from))} — seterusnya</td><td><button class="msi-edit" data-edit-sewa="${esc(r.branch_code)}">Edit</button></td></tr>`).join(''):'<tr><td colspan="7" class="msi-empty">Belum ada data sewa.</td></tr>';
    el('investorBody').innerHTML=inv.length?inv.map(r=>`<tr><td><strong>${esc(r.branch_name)}</strong></td><td>${esc(r.investor_name)}</td><td class="num"><strong>${pct(r.profit_share_percent)}</strong></td><td>${r.rent_entitlement?'Ya':'Tidak'}</td><td>${esc((r.profit_basis||'').replaceAll('_',' '))}</td><td>${r.payment_day_start}–${r.payment_day_end} awal bulan</td><td>${esc(dateLabel(r.effective_from))} — seterusnya</td><td><button class="msi-edit" data-edit-investor="${esc(r.branch_code)}">Edit</button></td></tr>`).join(''):'<tr><td colspan="8" class="msi-empty">Belum ada data investor.</td></tr>';

    el('sewaHistory').innerHTML=historyRows(state.sewa||[]).map(r=>`<tr><td>${esc(r.branch_name)}</td><td class="num">${money(r.monthly_rent)}</td><td>${esc(dateLabel(r.effective_from))}</td><td>${r.effective_to?esc(dateLabel(r.effective_to)):'Seterusnya'}</td><td><span class="msi-pill">${esc(r.status)}</span></td><td>${esc(r.notes||'—')}</td></tr>`).join('');
    el('investorHistory').innerHTML=historyRows(state.investor||[]).map(r=>`<tr><td>${esc(r.branch_name)}</td><td>${esc(r.investor_name)}</td><td class="num">${pct(r.profit_share_percent)}</td><td>${esc(dateLabel(r.effective_from))}</td><td>${r.effective_to?esc(dateLabel(r.effective_to)):'Seterusnya'}</td><td><span class="msi-pill">${esc(r.status)}</span></td><td>${esc(r.notes||'—')}</td></tr>`).join('');

    document.querySelectorAll('[data-edit-sewa]').forEach(b=>b.onclick=()=>openEdit('sewa',b.dataset.editSewa));
    document.querySelectorAll('[data-edit-investor]').forEach(b=>b.onclick=()=>openEdit('investor',b.dataset.editInvestor));
  }

  function openEdit(type,code){
    const rows=type==='sewa'?state.sewa:state.investor;
    const row=activeRows(rows).find(r=>r.branch_code===code); if(!row)return;
    el('modalType').value=type; el('modalBranchCode').value=code; el('modalBranch').value=row.branch_name||code;
    el('modalEffective').value=today(); el('modalNotes').value=row.notes||''; el('modalMsg').textContent=''; el('modalMsg').className='msi-msg';
    const isSewa=type==='sewa'; el('rentField').hidden=!isSewa; el('shareField').hidden=isSewa;
    el('modalTitle').textContent=isSewa?'Ubah Biaya Sewa':'Ubah Persentase Investor'; el('modalEyebrow').textContent=isSewa?'MASTER SEWA':'MASTER INVESTOR';
    if(isSewa) el('modalRent').value=money(row.monthly_rent); else el('modalShare').value=Number(row.profit_share_percent||0);
    el('msiModal').hidden=false;
  }

  function close(){el('msiModal').hidden=true;}

  async function save(e){
    e.preventDefault(); const type=el('modalType').value,code=el('modalBranchCode').value,effective=el('modalEffective').value,notes=el('modalNotes').value||null;
    const btn=el('modalSave'),msg=el('modalMsg');
    try{
      if(!effective)throw new Error('Pilih tanggal berlaku.'); btn.disabled=true; msg.textContent='Menyimpan…'; msg.className='msi-msg';
      let result;
      if(type==='sewa'){
        const nominal=parseMoney(el('modalRent').value); if(nominal<=0)throw new Error('Nominal sewa harus lebih dari 0.');
        result=await db.rpc('erp_master_sewa_set',{p_branch_code:code,p_monthly_rent:nominal,p_effective_from:effective,p_notes:notes});
      }else{
        const share=Number(String(el('modalShare').value).replace(',','.')); if(!Number.isFinite(share)||share<0||share>100)throw new Error('Persentase harus 0–100.');
        result=await db.rpc('erp_master_investor_set',{p_branch_code:code,p_profit_share_percent:share,p_effective_from:effective,p_notes:notes});
      }
      if(result.error)throw result.error;
      msg.textContent='Perubahan tersimpan. Histori lama tetap aman.';msg.className='msi-msg ok';await load();setTimeout(close,650);
    }catch(err){msg.textContent=err?.message||'Gagal menyimpan.';msg.className='msi-msg err';}finally{btn.disabled=false;}
  }

  function bind(){
    document.querySelectorAll('.msi-tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.msi-tabs button').forEach(x=>x.classList.toggle('is-active',x===b));el('panelSewa').classList.toggle('is-active',b.dataset.tab==='sewa');el('panelInvestor').classList.toggle('is-active',b.dataset.tab==='investor');});
    document.querySelectorAll('[data-close]').forEach(x=>x.onclick=close); el('msiForm').onsubmit=save;
    el('modalRent').addEventListener('input',e=>{const n=parseMoney(e.target.value);e.target.value=money(n);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  }

  async function init(){bind();try{await load();}catch(err){el('sewaBody').innerHTML=`<tr><td colspan="7" class="msi-empty">${esc(err?.message||'Gagal memuat master.')}</td></tr>`;}}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();