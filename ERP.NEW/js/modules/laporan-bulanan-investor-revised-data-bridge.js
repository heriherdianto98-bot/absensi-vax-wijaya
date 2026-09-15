(function(){
  'use strict';

  const num=v=>{const n=Number(v||0);return Number.isFinite(n)?n:0;};
  const money=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(num(v));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()
    .replace(/\bsaeful\b/g,'saepul').replace(/\bsaepull\b/g,'saepul');
  const clone=v=>JSON.parse(JSON.stringify(v||{}));
  const el=id=>document.getElementById(id);

  function samePerson(a,b){
    const x=norm(a),y=norm(b);
    if(!x||!y)return false;
    if(x===y)return true;
    const xf=x.split(' ')[0],yf=y.split(' ')[0];
    return xf.length>=3&&xf===yf;
  }

  function providerMatch(detail,name){
    return (detail||[]).find(r=>samePerson(r?.provider,name))||null;
  }

  function revisedCashRows(dataset,branchId){
    return (dataset?.dailyRecap?.rows||[]).map(r=>({
      tanggal:r.tanggal,
      cabang_id:Number(branchId)||null,
      cash_out:num(r.cash_out??r.cashOut),
      keterangan_cash_out:String(r.keterangan_cash_out||'')
    }));
  }

  function payrollClassifierRows(report){
    const out=[];
    for(const r of report?.gaji?.capsterDetail||[])out.push({namaKaryawan:r?.nama||'',nama_karyawan:r?.nama||'',isCapster:true});
    for(const r of report?.gaji?.nonCapsterDetail||[])out.push({namaKaryawan:r?.nama||'',nama_karyawan:r?.nama||'',isCapster:false});
    return out;
  }

  function findOrCreateCapster(rows,name){
    let row=rows.find(r=>samePerson(r?.nama,name));
    if(!row){
      row={employeeId:null,nama:name||'Capster',payroll:0,mapped:0,protek:0,freePoint:0,total:0,isBackup:false,revisedMinutes:true};
      rows.push(row);
    }
    return row;
  }

  function applyProviderShares(report,dataset){
    const providerDetail=dataset?.provider?.detail||[];
    const rows=(report?.gaji?.capsterDetail||[]).map(r=>({...r,payroll:0,mapped:0,protek:0,freePoint:0,total:0}));
    const used=new Set();

    for(const row of rows){
      const hit=providerMatch(providerDetail,row?.nama);
      if(hit){
        row.payroll=num(hit.providerShare);
        row.total=row.payroll;
        used.add(hit);
      }
    }
    for(const p of providerDetail){
      if(used.has(p))continue;
      const row=findOrCreateCapster(rows,p.provider);
      row.payroll+=num(p.providerShare);
      row.total+=num(p.providerShare);
    }
    report.gaji.capsterDetail=rows;
    report.gaji.payrollCapster=rows.reduce((s,r)=>s+num(r.payroll)+num(r.mapped),0);
  }

  function applyRevisedCashClassification(report,dataset){
    const engine=window.LaporanBulananEngine;
    if(!engine?.classifyCashOutItems)throw new Error('Classifier Laporan Bulanan tidak tersedia.');
    const sourceRows=revisedCashRows(dataset,report?.branch?.id);
    const classified=engine.classifyCashOutItems(sourceRows,payrollClassifierRows(report));
    report.pengeluaran=report.pengeluaran||{};
    report.pengeluaran.detail=classified.detail;
    report.pengeluaran.cashOutOfficial=num(classified.totals.officialCashOut);
    report.pengeluaran.operasional=num(classified.totals.operational);

    report.gaji=report.gaji||{};
    report.gaji.svp=num(classified.totals.svpSalary);

    let backup=0;
    for(const item of classified.detail){
      if(engine.isBackupSalary?.(item))backup+=num(item.nominal);
    }
    report.gaji.backupNamedSupplement=backup;

    const capsters=report.gaji.capsterDetail||[];
    let unassignedProtek=0;
    for(const item of classified.detail.filter(x=>x.category==='GAJI_CAPSTER_PROTEK')){
      const person=String(item.label||'').replace(/\b(protek(?:si)?|protect|proteck)\b/ig,' ').replace(/\s+/g,' ').trim();
      const target=capsters.find(r=>samePerson(r?.nama,person));
      if(target){target.protek=num(target.protek)+num(item.nominal);target.total=num(target.total)+num(item.nominal);}
      else unassignedProtek+=num(item.nominal);
    }
    if(unassignedProtek>0){
      const row=findOrCreateCapster(capsters,'Protek belum terpetakan');
      row.protek+=unassignedProtek;row.total+=unassignedProtek;
    }
    report.gaji.protek=classified.detail.filter(x=>x.category==='GAJI_CAPSTER_PROTEK').reduce((s,x)=>s+num(x.nominal),0);

    // Bonus KPI/Kasir true dedup: sudah masuk payroll, jangan dihitung lagi sebagai operasional.
    if(window.LaporanBulananOperasionalPayrollDedupBridge){
      const bridge=window.LaporanBulananOperasionalPayrollDedupBridge;
      const cashBonus=bridge.cashOutBonusKpi?.(report)||{total:0};
      const dedup=Math.min(num(cashBonus.total),num(report.gaji.bonusKpi));
      report.pengeluaran.operasional=Math.max(0,num(report.pengeluaran.operasional)-dedup);
      report.diagnostics=report.diagnostics||{};
      report.diagnostics.revisedCashOutDedup={cashOutBonusKpi:num(cashBonus.total),payrollBonusKpi:num(report.gaji.bonusKpi),deducted:dedup};

      const mess=bridge.cashOutTunjanganMess?.(report)||{total:0};
      if(num(mess.total)>0){
        report.pengeluaran.operasional=Math.max(0,num(report.pengeluaran.operasional)-num(mess.total));
        report.pengeluaran.tunjanganMess=num(mess.total);
      }

      const freeRows=(report.pengeluaran.detail||[]).filter(r=>/^OPERASIONAL/.test(String(r.category||''))&&/^free\s+(point|poin)\b/i.test(String(r.label||r.raw||'')));
      for(const item of freeRows){
        const person=bridge.freePointName?.(item.label||item.raw)||'Capster';
        const target=findOrCreateCapster(capsters,person);
        target.freePoint=num(target.freePoint)+num(item.nominal);
        target.total=num(target.total)+num(item.nominal);
        report.pengeluaran.operasional=Math.max(0,num(report.pengeluaran.operasional)-num(item.nominal));
      }
    }
  }

  function applyProviderProduct(report,dataset){
    const details=dataset?.providerProduct?.detail||[];
    const non=report?.gaji?.nonCapsterDetail||[];
    for(const row of non){
      const hit=(details||[]).find(p=>samePerson(p?.provider,row?.nama));
      if(hit){
        const before=num(row.bonusProduk);
        row.bonusProduk=num(hit.share);
        row.amount=num(row.amount)-before+row.bonusProduk;
      }
    }
  }

  function rebuildTotals(report,dataset){
    report.pendapatan=report.pendapatan||{};
    const service=num(dataset?.provider?.totalIncome)||num(dataset?.dailyRecap?.netServicesSales);
    const product=num(dataset?.product?.sales);
    report.pendapatan.cukur=service;
    report.pendapatan.produkGross=product;
    report.pendapatan.total=service+product;
    report.pendapatan.customer=num(dataset?.dailyRecap?.customer);
    report.pendapatan.transaction=num(dataset?.dailyRecap?.transaction);

    const capTotal=(report.gaji?.capsterDetail||[]).reduce((s,r)=>s+num(r.total),0);
    const nonTotal=(report.gaji?.nonCapsterDetail||[]).reduce((s,r)=>s+num(r.amount),0);
    report.gaji.capsterDetailTotal=capTotal;
    report.gaji.total=capTotal+nonTotal+num(report.gaji.svp)+num(report.gaji.backupNamedSupplement);

    report.pengeluaran.sewa=num(report.pengeluaran.sewa);
    report.pengeluaran.total=num(report.pengeluaran.operasional)+num(report.pengeluaran.tunjanganMess)+num(report.pengeluaran.sewa);

    report.laba=report.laba||{};
    report.laba.totalPendapatan=report.pendapatan.total;
    report.laba.totalBiaya=num(report.gaji.total)+num(report.pengeluaran.total);
    report.laba.labaBersih=report.laba.totalPendapatan-report.laba.totalBiaya;

    report.performance=report.performance||{};
    report.performance.omzet=report.pendapatan.total;
    report.performance.customer=report.pendapatan.customer;
    report.performance.avgTicket=report.pendapatan.transaction>0?Math.round(report.pendapatan.total/report.pendapatan.transaction):0;

    if(report.investor&&window.LaporanBulananInvestorShareBridge?.apply){
      window.LaporanBulananInvestorShareBridge.apply(report);
      window.LaporanBulananInvestorShareBridge.emit?.(report);
    }
  }

  function salaryHtml(g){
    const cap=(g?.capsterDetail||[]).map(row=>{
      const parts=[];
      if(num(row.payroll))parts.push(`Share Cukur ${money(row.payroll)}`);
      if(num(row.mapped))parts.push(`Backup Capster ${money(row.mapped)}`);
      if(num(row.protek))parts.push(`Protek ${money(row.protek)}`);
      if(num(row.freePoint))parts.push(`Free Point ${money(row.freePoint)}`);
      return `<div class="lb-line"><span>${esc(row.nama||'Capster')}${parts.length?` · ${esc(parts.join(' + '))}`:''}</span><strong>${money(row.total)}</strong></div>`;
    }).join('');
    const non=(g?.nonCapsterDetail||[]).map(row=>{
      const parts=[`Gaji Pokok ${money(row.gajiPokok)}`];
      if(num(row.bonusInsentif))parts.push(`Bonus Insentif ${money(row.bonusInsentif)}`);
      if(num(row.bonusKpi))parts.push(`Bonus KPI ${money(row.bonusKpi)}`);
      if(num(row.bonusProduk))parts.push(`Bonus Produk ${money(row.bonusProduk)}`);
      return `<div class="lb-line"><span>${esc(row.jabatan||'Karyawan')} — ${esc(row.nama||'Karyawan')} · ${esc(parts.join(' + '))}</span><strong>${money(row.amount)}</strong></div>`;
    }).join('');
    return `${cap}${non}<div class="lb-line"><span>Gaji SVP</span><strong>${money(g?.svp)}</strong></div><div class="lb-line"><span>Gaji Backup Kasir</span><strong>${money(g?.backupNamedSupplement)}</strong></div><div class="lb-line total"><span>Total Biaya Gaji</span><strong>${money(g?.total)}</strong></div>`;
  }

  function render(report,dataset){
    if(el('lbRevenue'))el('lbRevenue').textContent=money(report.pendapatan.total);
    if(el('lbServiceRevenue'))el('lbServiceRevenue').textContent=money(report.pendapatan.cukur);
    if(el('lbProductGross'))el('lbProductGross').textContent=money(report.pendapatan.produkGross);
    if(el('lbPayroll'))el('lbPayroll').textContent=money(report.gaji.total);
    if(el('lbOpex'))el('lbOpex').textContent=money(report.pengeluaran.operasional);
    if(el('lbRent'))el('lbRent').textContent=money(report.pengeluaran.sewa);
    if(el('lbProfit'))el('lbProfit').textContent=money(report.laba.labaBersih);
    if(el('lbCustomer'))el('lbCustomer').textContent=`${num(report.pendapatan.customer).toLocaleString('id-ID')} customer`;
    if(el('lbTransactions'))el('lbTransactions').textContent=`${num(report.pendapatan.transaction).toLocaleString('id-ID')} transaksi`;

    if(el('lbIncomeLines'))el('lbIncomeLines').innerHTML=`<div class="lb-line"><span>Pendapatan Cukur</span><strong>${money(report.pendapatan.cukur)}</strong></div><div class="lb-line"><span>Pendapatan Produk (Gross)</span><strong>${money(report.pendapatan.produkGross)}</strong></div><div class="lb-line total"><span>Total Pendapatan</span><strong>${money(report.pendapatan.total)}</strong></div>`;
    if(el('lbSalaryLines'))el('lbSalaryLines').innerHTML=salaryHtml(report.gaji);
    if(el('lbExpenseLines'))el('lbExpenseLines').innerHTML=`<div class="lb-line"><span>Cash Out Minutes Revised</span><strong>${money(dataset?.dailyRecap?.cashOut)}</strong></div><div class="lb-line"><span>Biaya Operasional</span><strong>${money(report.pengeluaran.operasional)}</strong></div>${num(report.pengeluaran.tunjanganMess)>0?`<div class="lb-line"><span>Tj. Mess</span><strong>${money(report.pengeluaran.tunjanganMess)}</strong></div>`:''}<div class="lb-line"><span>Sewa Tempat</span><strong>${money(report.pengeluaran.sewa)}</strong></div><div class="lb-line total"><span>Total Pengeluaran Non-Gaji</span><strong>${money(report.pengeluaran.total)}</strong></div>`;
    if(el('lbResultLines'))el('lbResultLines').innerHTML=`<div class="lb-line"><span>Total Pendapatan</span><strong>${money(report.laba.totalPendapatan)}</strong></div><div class="lb-line"><span>Total Biaya</span><strong>${money(report.laba.totalBiaya)}</strong></div><div class="lb-line total"><span>Laba Bersih</span><strong>${money(report.laba.labaBersih)}</strong></div>`;

    const load=el('lbLoadState');
    if(load)load.textContent=`${report?.branch?.name||'Cabang'} · Investor Revised · Minutes LIVE diterapkan ke laporan`;
    document.body.dataset.investorRevisedApplied='true';
    window.InvestorRevisedReport=report;
    document.dispatchEvent(new CustomEvent('laporan-investor:revised-report-applied',{detail:{report,dataset}}));
  }

  async function applyPayload(payload){
    const dataset=payload?.data||payload;
    if(dataset?.schema!=='INVESTOR_REVISED_DATASET_V1'){
      throw new Error('Dataset structured Investor Revised belum tersedia. Jalankan collector structured terbaru.');
    }
    const select=el('lbBranch');
    const branchId=Number(select?.value||0);
    const month=el('lbMonth')?.value||'';
    if(!branchId||!month)throw new Error('Cabang/periode tidak valid.');
    const [year,mon]=month.split('-').map(Number);
    const base=await window.LaporanBulananConsumer.loadMonth({client:window.db,year,month:mon,cabangId:branchId});
    const report=clone(base);
    applyProviderShares(report,dataset);
    applyRevisedCashClassification(report,dataset);
    applyProviderProduct(report,dataset);
    rebuildTotals(report,dataset);
    report.diagnostics=report.diagnostics||{};
    report.diagnostics.investorRevised={applied:true,schema:dataset.schema,source:'MINUTES_LIVE_READ_ONLY',capturedAt:payload?.finishedAt||new Date().toISOString(),mainSyncTouched:false};
    render(report,dataset);
    return report;
  }

  document.addEventListener('laporan-investor:minutes-revised-ready',ev=>{
    applyPayload(ev.detail).catch(err=>{
      console.error('[Investor Revised Bridge]',err);
      const meta=el('lbInvestorSourceMeta');
      const badge=el('lbInvestorSourceBadge');
      if(meta)meta.textContent=`Dataset terbaca tetapi gagal diterapkan ke laporan · ${err?.message||err}`;
      if(badge)badge.textContent='APPLY GAGAL';
    });
  });

  window.LaporanBulananInvestorRevisedDataBridge={applyPayload};
})();
