/* VAX employee Service card: presentation only. Keep every service row rendered by the existing KPI adapter; no RPC, totals, sync, or popup. */
(() => {
  'use strict';
  const list = document.getElementById('todayService');
  if (!list || document.getElementById('employee-service-grid-style')) return;
  const style = document.createElement('style');
  style.id = 'employee-service-grid-style';
  style.textContent = `
    /* Responsive columns: up to three on wider phones; two/one when space is tight. */
    #kpiCapster.today-grid .kpi-service{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important}
    #kpiCapster.today-grid .kpi-service .service-detail-list{
      display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,112px),1fr))!important;
      column-gap:12px!important;row-gap:9px!important;align-items:start!important;
      height:auto!important;max-height:none!important;min-height:0!important;
      overflow:visible!important;scrollbar-width:none!important;margin-top:5px!important;
    }
    #kpiCapster.today-grid .kpi-service .service-detail-list::-webkit-scrollbar{display:none!important}
    #kpiCapster.today-grid .kpi-service .service-detail-item,
    #kpiCapster.today-grid .kpi-service.has-service-overflow .service-detail-item:nth-child(n+3){
      display:flex!important;align-items:baseline!important;gap:4px!important;
      width:100%!important;min-width:0!important;max-width:none!important;
      padding:0!important;margin:0!important;overflow:visible!important;
      font-size:11px!important;line-height:1.4!important;white-space:normal!important;
    }
    #kpiCapster.today-grid .kpi-service .service-name{
      min-width:0!important;flex:0 1 auto!important;overflow:visible!important;
      text-overflow:clip!important;overflow-wrap:anywhere!important;white-space:normal!important;
    }
    #kpiCapster.today-grid .kpi-service .service-dots{
      flex:1 1 auto!important;min-width:4px!important;border-bottom:1px dotted #75694d!important;
      transform:translateY(-3px)!important;
    }
    #kpiCapster.today-grid .kpi-service .service-qty{
      flex:0 0 auto!important;font-size:11px!important;white-space:nowrap!important;
      color:#e4c779!important;font-weight:700!important;
    }
    #kpiCapster .kpi-service .employee-service-open{display:none!important}
    @media(max-width:350px){
      #kpiCapster.today-grid .kpi-service .service-detail-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,105px),1fr))!important;column-gap:8px!important}
      #kpiCapster.today-grid .kpi-service .service-detail-item,#kpiCapster.today-grid .kpi-service .service-qty{font-size:10px!important}
    }
  `;
  document.head.appendChild(style);
})();
