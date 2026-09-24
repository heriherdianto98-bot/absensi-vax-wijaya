/* VAX ERP — Employee UI-only layout + read-only Owner TARGET BULAN consumer.
   All original KPI nodes, IDs, data handlers, target RPC, and sync remain unchanged. */
(() => {
  'use strict';
  const grid = document.getElementById('kpiCapster');
  const daily = grid?.closest('.today-section');
  if (!grid || !daily) return;
  const style = document.createElement('style');
  style.id = 'vax-employee-approved-layout';
  style.textContent = `
    #kpiCapster.today-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:112px auto 62px 62px!important;grid-auto-rows:auto!important;gap:9px!important}
    #kpiCapster.today-grid[hidden]{display:none!important}
    #kpiCapster .kpi-customer{grid-column:1;grid-row:1}
    #kpiCapster .kpi-share{grid-column:2;grid-row:1}
    #kpiCapster .kpi-service{grid-column:1/-1;grid-row:2}
    #kpiCapster .kpi-pay{grid-column:1/-1;grid-row:3}
    #kpiCapster .kpi-fine{grid-column:1/-1;grid-row:4}
    #kpiCapster .today-item,#kpiCapster .kpi-service{box-sizing:border-box;height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:auto!important;padding:12px 14px!important;border-radius:13px!important;background:#222422!important;border:1px solid #3b403a!important;box-shadow:inset 0 1px 0 #ffffff0d!important}
    #kpiCapster .kpi-customer,#kpiCapster .kpi-share{height:112px!important;min-height:112px!important;max-height:112px!important}
    #kpiCapster .kpi-share{background:#292820!important}
    #kpiCapster .kpi-ghost{display:none!important}
    #kpiCapster .kpi-head{gap:7px!important;align-items:center!important;min-width:0}
    #kpiCapster .kpi-ico{width:25px!important;height:25px!important;min-width:25px!important;flex:0 0 25px!important;box-shadow:none!important;background:#383831!important;border:0!important}
    #kpiCapster .kpi-ico i{font-size:12px!important}
    #kpiCapster .kpi-label{font-size:12px!important;font-weight:650!important;line-height:1.25!important}
    #kpiCapster .kpi-customer .kpi-main-value,#kpiCapster .kpi-share .kpi-main-value{font-size:clamp(22px,6vw,27px)!important;line-height:1.15!important;justify-content:center!important;align-items:center!important}
    #kpiCapster .kpi-share .kpi-main-value{color:#f0d18a!important;font-size:clamp(19px,5.2vw,25px)!important}
    #kpiCapster .kpi-service{min-height:87px!important;padding:12px 14px!important}
    #kpiCapster .kpi-service .kpi-ico{display:none!important}
    #kpiCapster .kpi-service .kpi-label{font-size:14px!important;font-weight:750!important}
    #kpiCapster .kpi-service .service-detail-list{flex:none!important;max-height:none!important;min-height:0!important;margin-top:9px!important;overflow:visible!important;font-size:13px!important}
    #kpiCapster .kpi-service .service-detail-item{font-size:13px!important;line-height:1.35!important}
    #kpiCapster .kpi-service .service-name{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    #kpiCapster .kpi-pay,#kpiCapster .kpi-fine{height:62px!important;min-height:62px!important;max-height:62px!important;display:flex!important;flex-direction:row!important;justify-content:space-between!important;align-items:center!important;padding:9px 14px!important}
    #kpiCapster .kpi-pay .kpi-head,#kpiCapster .kpi-fine .kpi-head{flex:1 1 auto!important;min-width:0!important}
    #kpiCapster .kpi-pay .kpi-ico,#kpiCapster .kpi-fine .kpi-ico{display:none!important}
    #kpiCapster .kpi-pay .kpi-label,#kpiCapster .kpi-fine .kpi-label{font-size:13px!important;font-weight:500!important}
    #kpiCapster .kpi-pay .kpi-main-value,#kpiCapster .kpi-fine .kpi-main-value{flex:0 0 auto!important;width:auto!important;align-self:center!important;justify-content:flex-end!important;max-width:46%!important;min-width:0!important;font-size:15px!important;line-height:1.3!important;text-align:right!important;padding:0!important;margin:0!important}
    #kpiCapster .kpi-fine{background:#222422!important;border-color:#3b403a!important}
    .employee-performance-date{font-size:11px;color:#bcb6a9;font-weight:500;white-space:nowrap;margin-left:auto}
    .today-section .today-title{display:flex;align-items:center;gap:8px}
    .dash-body{padding-bottom:calc(58px + env(safe-area-inset-bottom,0px))!important}
    .employee-monthly-kpi{margin:8px 0 10px;min-width:0;color:#f2ede3}
    .employee-monthly-kpi[hidden]{display:none!important}
    .employee-monthly-kpi-card{padding:10px 12px 11px;border:1px solid #80673f;border-radius:12px;background:#282720;box-shadow:inset 0 1px 0 #ffffff10}
    .employee-monthly-kpi-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:750;letter-spacing:.04em;color:#e8d09a}
    .employee-monthly-kpi-heading i{color:#e8ce91;font-size:13px}
    .employee-monthly-kpi-value{display:block;margin:8px 0 7px;color:#f5d993;font-size:28px;line-height:1.05;text-align:center;font-weight:800;font-variant-numeric:tabular-nums}
    .employee-monthly-kpi-track{height:5px;border-radius:20px;background:#535149;overflow:hidden}
    .employee-monthly-kpi-fill{display:block;height:100%;width:0;background:#e5bd65;border-radius:20px;transition:width .2s ease}
    .employee-monthly-kpi-detail{margin-top:7px;font-size:12px;line-height:1.3;color:#e9dfcb;text-align:center;font-weight:600;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    .employee-monthly-kpi-note{margin:5px 1px 0;font-size:9px;color:#a9a394;line-height:1.3}
    @media(max-width:345px){#kpiCapster .today-item,#kpiCapster .kpi-service{padding:10px!important}.employee-monthly-kpi-detail{font-size:11px}}
    @media(prefers-reduced-motion:reduce){.employee-monthly-kpi-fill{transition:none}}
  `;
  document.head.appendChild(style);
  const title = daily.querySelector('.today-title');
  const picker = document.getElementById('employeeDatePicker');
  if (title) {
    const label = document.createElement('span');
    label.className = 'employee-performance-date';
    const today = () => {
      const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const val = type => parts.find(p=>p.type===type)?.value || '';
      return `${val('year')}-${val('month')}-${val('day')}`;
    };
    const update = () => {
      const selected = picker?.value || today();
      title.textContent = selected === today() ? 'Performa Hari Ini' : 'Performa Saya';
      label.textContent = /^\d{4}-\d{2}-\d{2}$/.test(selected) ? new Intl.DateTimeFormat('id-ID',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(new Date(selected+'T12:00:00Z')) : '';
      title.appendChild(label);
    };
    update();
    picker?.addEventListener('change',update);
  }
  const section = document.createElement('section');
  section.className = 'employee-monthly-kpi';
  section.hidden = true;
  section.setAttribute('aria-label','Target omzet cabang dari ERP Owner');
  section.innerHTML = `<article class="employee-monthly-kpi-card"><div class="employee-monthly-kpi-heading"><span>TARGET OMZET · <span id="employeeTargetBranch">CABANG</span></span><i class="fa-solid fa-bullseye" aria-hidden="true"></i></div><strong class="employee-monthly-kpi-value" id="employeeOwnerTargetPct">—</strong><div class="employee-monthly-kpi-track" role="progressbar" aria-label="Pencapaian target omzet" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="employee-monthly-kpi-fill"></span></div><div class="employee-monthly-kpi-detail" id="employeeOwnerTargetDetail">— / —</div></article><p class="employee-monthly-kpi-note" id="employeeOwnerTargetNote" role="status" aria-live="polite">Memuat target omzet cabang dari ERP…</p>`;
  daily.insertAdjacentElement('beforebegin',section);
  const pct=section.querySelector('#employeeOwnerTargetPct');
  const detail=section.querySelector('#employeeOwnerTargetDetail');
  const note=section.querySelector('#employeeOwnerTargetNote');
  const track=section.querySelector('.employee-monthly-kpi-track');
  const fill=section.querySelector('.employee-monthly-kpi-fill');
  const branchEl=section.querySelector('#employeeTargetBranch');
  const branchSource=document.querySelector('.profile-branch-name')||document.getElementById('cabangKaryawan');
  const updateBranch=()=>{const name=(branchSource?.textContent||'').trim().replace(/^vax\s+wijaya\s+/i,'');branchEl.textContent=name?name.toLocaleUpperCase('id-ID'):'CABANG';};
  updateBranch();
  if(branchSource)new MutationObserver(updateBranch).observe(branchSource,{childList:true,subtree:true,characterData:true});
  const isCapster=()=>document.documentElement.dataset.homeKpi==='capster';
  const rupiah=n=>'Rp'+Math.round(n).toLocaleString('id-ID');
  let busy=false,run=0;
  function reset(message){pct.textContent='—';detail.textContent='— / —';track.setAttribute('aria-valuenow','0');track.removeAttribute('aria-valuetext');fill.style.width='0%';note.textContent=message;}
  async function refresh(){
    if(busy||document.hidden||!isCapster())return;
    const current=++run;busy=true;
    try{
      const token=typeof KaryawanSession!=='undefined'?KaryawanSession.getToken():'';
      if(!token||typeof db==='undefined')throw new Error('SESSION_UNAVAILABLE');
      const {data,error}=await db.rpc('karyawan_target_bulan_cabang_self',{p_token:token});
      if(current!==run)return;
      if(error||!data||data.ok!==true)throw error||new Error(data?.reason||'TARGET_UNAVAILABLE');
      const percent=Number(data.persen),omzet=Number(data.omzet),target=Number(data.target);
      if(![percent,omzet,target].every(Number.isFinite)||target<=0)throw new Error('TARGET_DATA_INVALID');
      pct.textContent=`${percent}%`;
      detail.textContent=`${rupiah(omzet)} / ${rupiah(target)}`;
      track.setAttribute('aria-valuenow',String(Math.min(100,Math.max(0,percent))));
      track.setAttribute('aria-valuetext',`${percent}% dari target cabang`);
      fill.style.width=`${Math.min(100,Math.max(0,percent))}%`;
      note.textContent='Target omzet cabang bulan berjalan · sumber Dashboard Owner · hanya baca.';
    }catch(error){if(current===run){reset('Target omzet belum dapat dibaca dari ERP.');console.warn('TARGET BULAN cabang read-only:',error);}}
    finally{busy=false;}
  }
  new MutationObserver(()=>{if(isCapster()){section.hidden=false;void refresh();}else{++run;section.hidden=true;}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-home-kpi']});
  if(isCapster()){section.hidden=false;void refresh();}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  setInterval(()=>{void refresh();},60000);
})();
