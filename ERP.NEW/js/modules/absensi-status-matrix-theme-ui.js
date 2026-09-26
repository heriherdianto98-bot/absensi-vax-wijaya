/* VAX ERP — presentation bridge only: map rendered Absensi status/activity to Matrix color classes. */
(()=>{
  const ACTIVITY_BOX_ID="aktivitasTerbaru";
  const STATUS_BODY_ID="statusKaryawan";
  const ALL_CLASSES=[
    "is-status-hadir","is-status-terlambat","is-status-libur",
    "is-status-izin","is-status-sakit","is-status-alfa","is-status-belum"
  ];

  function normalizeStatus(text=""){
    const s=String(text).trim().toUpperCase();
    if(s.includes("TERLAMBAT")) return "terlambat";
    if(s.includes("SAKIT")) return "sakit";
    if(s.includes("IZIN")) return "izin";
    if(s.includes("LIBUR")) return "libur";
    if(s.includes("ALFA")) return "alfa";
    if(s.includes("BELUM")) return "belum";
    if(s.includes("HADIR") || s.includes("MASUK")) return "hadir";
    return "belum";
  }

  function applyStatusClass(el,key){
    el.classList.remove(...ALL_CLASSES);
    el.classList.add("is-status-"+key);
    el.dataset.matrixStatus=key.toUpperCase();
  }

  function paintActivity(){
    const box=document.getElementById(ACTIVITY_BOX_ID);
    if(!box) return;
    box.querySelectorAll(".absensi-activity-row").forEach(row=>{
      const action=row.querySelector(".absensi-activity-aksi");
      applyStatusClass(row,normalizeStatus(action?.textContent||""));
    });
  }

  function paintStatusRows(){
    const body=document.getElementById(STATUS_BODY_ID);
    if(!body) return;
    body.querySelectorAll("tr").forEach(row=>{
      const cells=row.cells;
      const statusCell=cells?.length ? cells[cells.length-1] : null;
      applyStatusClass(row,normalizeStatus(statusCell?.textContent||""));
    });
  }

  function paintAll(){
    paintActivity();
    paintStatusRows();
  }

  function observe(id){
    const el=document.getElementById(id);
    if(!el) return;
    new MutationObserver(paintAll).observe(el,{
      childList:true,
      subtree:true,
      characterData:true
    });
  }

  function boot(){
    paintAll();
    observe(ACTIVITY_BOX_ID);
    observe(STATUS_BODY_ID);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
