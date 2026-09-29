(() => {
  "use strict";
  const base = "employee-sop/";
  if (!document.querySelector('link[data-vax-sop]')) {
    const css=document.createElement("link");
    css.rel="stylesheet"; css.href=base+"sop-ui.css?v=20260929-9"; css.dataset.vaxSop="1";
    document.head.append(css);
  }
  const load=(src)=>new Promise((resolve,reject)=>{
    const s=document.createElement("script"); s.src=base+src; s.onload=resolve; s.onerror=reject; document.body.append(s);
  });
  (async()=>{try{await load("sop-data.js?v=20260929-3");await load("sop-module.js?v=20260929-3");}catch(e){console.error("[VAX SOP] bootstrap gagal",e);}})();
})();