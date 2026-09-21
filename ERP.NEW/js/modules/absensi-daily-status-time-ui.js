/* UI ONLY — show the complete filtered employee list and display the existing ERP clock-in time. No database requests or attendance writes. */
(function(){
  'use strict';
  if(window.__vaxDailyStatusTimeUiInstalled)return;
  window.__vaxDailyStatusTimeUiInstalled=true;

  const style=document.createElement('style');
  style.textContent=`
    /* Let the page scroll naturally so the entire filtered employee list is visible. */
    #absensiRoot #absensiDailyView #statusBox .absensi-table-wrap{
      max-height:none !important;
      overflow-y:visible !important;
    }
    #absensiRoot #absensiDailyView #statusBox .absensi-table{
      table-layout:fixed;
      min-width:610px;
    }
    #absensiRoot #absensiDailyView #statusBox .absensi-table th:nth-child(1),
    #absensiRoot #absensiDailyView #statusBox .absensi-table td:nth-child(1){width:22%}
    #absensiRoot #absensiDailyView #statusBox .absensi-table th:nth-child(2),
    #absensiRoot #absensiDailyView #statusBox .absensi-table td:nth-child(2){width:34%}
    #absensiRoot #absensiDailyView #statusBox .absensi-table th:nth-child(3),
    #absensiRoot #absensiDailyView #statusBox .absensi-table td:nth-child(3){width:22%}
    #absensiRoot #absensiDailyView #statusBox .absensi-table th:nth-child(4),
    #absensiRoot #absensiDailyView #statusBox .absensi-table td:nth-child(4){width:22%}
    #absensiRoot #absensiDailyView #statusBox .absensi-table .vax-status-time-cell{
      font-size:13px;
      font-weight:700;
      color:#f1d47c;
      font-variant-numeric:tabular-nums;
      white-space:nowrap;
    }
    #absensiRoot #absensiDailyView #statusBox .absensi-table .vax-status-time-cell.is-empty{
      color:#8f9bab;
      font-weight:500;
    }
    #absensiRoot #absensiDailyView #statusBox .absensi-table thead th{
      position:static;
    }
    @media(max-width:760px){
      #absensiRoot #absensiDailyView #statusBox .absensi-table-wrap{
        overflow-x:auto !important;
      }
    }
  `;
  document.head.appendChild(style);

  function syncStatusTimes(){
    const tbody=document.getElementById('statusKaryawan');
    const header=tbody?.closest('table')?.tHead?.rows?.[0];
    const owner=window.AbsensiOwner;
    if(!tbody||!header||!owner)return;

    if(!header.querySelector('.vax-status-time-head')){
      const th=document.createElement('th');
      th.className='vax-status-time-head';
      th.scope='col';
      th.textContent='Jam Masuk (WIB)';
      header.appendChild(th);
    }
    const byEmployee=new Map((owner._absensiDay||[]).map(record=>[String(record.karyawan_id),record]));
    tbody.querySelectorAll('tr[data-absensi-row-id]').forEach(row=>{
      let cell=row.querySelector('.vax-status-time-cell');
      if(!cell){
        cell=document.createElement('td');
        cell.className='vax-status-time-cell';
        row.appendChild(cell);
      }
      const record=byEmployee.get(String(row.getAttribute('data-absensi-row-id')));
      const raw=String(record?.jam_masuk||'');
      const match=/^(\d{1,2}):(\d{2})/.exec(raw);
      const formatted=match?`${match[1].padStart(2,'0')}:${match[2]} WIB`:'—';
      if(cell.textContent!==formatted)cell.textContent=formatted;
      cell.classList.toggle('is-empty',!match);
      cell.title=match?'Jam masuk yang tersimpan pada record absensi ERP. Input manual dapat menggunakan jam yang dikoreksi.':'Belum ada jam masuk yang tercatat pada ERP';
    });
  }

  function start(){
    const tbody=document.getElementById('statusKaryawan');
    if(!tbody)return;
    let queued=false;
    const schedule=()=>{
      if(queued)return;
      queued=true;
      queueMicrotask(()=>{queued=false;syncStatusTimes();});
    };
    new MutationObserver(schedule).observe(tbody,{childList:true});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
