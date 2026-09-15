"use strict";

/*
 * Investor Revised print/PDF patch — UI ONLY.
 * Keeps Investor-specific PDF cleanup, chart sizing, and final-page signature placement.
 * No engine/source/formula changes.
 *
 * IMPORTANT:
 * Wrap LaporanBulananPrintUI.open itself, not only the current Print/PDF buttons.
 * This prevents later UI bridges (for example Free Point) from bypassing the
 * Investor-specific print layout patch.
 */
(() => {
  const PATCH_CSS=`
    .lb-print-performance-chart{
      margin-top:1.2mm!important;
      padding:1.8mm!important;
      break-inside:avoid!important;
      page-break-inside:avoid!important;
    }
    .lb-print-performance-chart .lb-perf-chart-svg-wrap{
      min-height:0!important;
    }
    .lb-print-performance-chart .lb-perf-chart-svg{
      display:block!important;
      width:100%!important;
      height:49mm!important;
      min-height:0!important;
      max-height:none!important;
      object-fit:fill!important;
    }
    .lb-print-performance-chart .lb-perf-axis-y,
    .lb-print-performance-chart .lb-perf-axis-x{
      font-size:15px!important;
    }

    /* Investor PDF only.
       A4 portrait = 297mm.
       Printable final-page body = page height - page margins (16mm)
       - repeated header reserve (24mm) - repeated footer reserve (18mm) = 239mm.
       This keeps the existing footer untouched and pushes signatures to the
       true bottom of the content area immediately above the footer reserve. */
    .lb-print-final-page{
      min-height:239mm!important;
      height:239mm!important;
      display:flex!important;
      flex-direction:column!important;
      box-sizing:border-box!important;
    }
    .lb-print-signatures{
      margin-top:auto!important;
      margin-bottom:0!important;
      border-top:0!important;
      flex:0 0 auto!important;
    }
  `;

  function cleanInvestorPdfText(html){
    return String(html||"")
      .replace(/[ \t]*[·•|\-]?[ \t]*READ[ \t]+ONLY/gi,"")
      .replace(/[ \t]*[·•|\-]?[ \t]*READ-ONLY/gi,"");
  }

  function injectCss(html){
    const source=cleanInvestorPdfText(html);
    if(!source)return source;
    const style=`<style id="investor-print-layout-fix">${PATCH_CSS}</style>`;
    return source.includes("</head>")
      ? source.replace("</head>",`${style}</head>`)
      : `${style}${source}`;
  }

  function installApiPatch(){
    if(!document.body.classList.contains("laporan-bulanan-investor-page"))return false;
    const api=window.LaporanBulananPrintUI;
    if(!api||typeof api.open!=="function")return false;
    if(api.__investorPrintLayoutPatched===true)return true;

    const baseOpen=api.open;
    api.open=async function investorPrintLayoutOpen(mode){
      const nativeOpen=window.open;
      window.open=function(...args){
        const popup=nativeOpen.apply(window,args);
        if(!popup?.document)return popup;
        const nativeWrite=popup.document.write.bind(popup.document);
        popup.document.write=function(html){
          return nativeWrite(injectCss(html));
        };
        return popup;
      };
      try{
        return await baseOpen(mode);
      }finally{
        window.open=nativeOpen;
      }
    };
    api.__investorPrintLayoutPatched=true;
    return true;
  }

  function replace(id,mode){
    const current=document.getElementById(id);
    if(!current)return false;
    const fresh=current.cloneNode(true);
    current.replaceWith(fresh);
    fresh.addEventListener("click",()=>window.LaporanBulananPrintUI?.open?.(mode));
    return true;
  }

  function install(){
    if(!installApiPatch())return false;
    const a=replace("lbPrintMonthly","print");
    const b=replace("lbPdfMonthly","pdf");
    return a&&b;
  }

  function boot(){
    if(install())return;
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(install()||tries>50)clearInterval(timer);
    },120);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
