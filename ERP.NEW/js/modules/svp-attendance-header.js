/* SVP floating attendance — isolated dashboard header adapter.
   Does not call or modify locked employee attendance/geofence engine. */
(() => {
  "use strict";

  let todayState=null;
  let currentLocation=null;
  let busy=false;
  let submitLocked=false;

  const clean=(v)=>String(v||"").trim();
  const isSpv=()=>typeof OwnerAuth!=="undefined" && OwnerAuth.profile && OwnerAuth.isSpvRole(OwnerAuth.profile.role);

  function fmtTime(v){
    const m=String(v||"").match(/(\d{1,2}):(\d{2})/);
    return m ? `${String(m[1]).padStart(2,"0")}:${m[2]} WIB` : "—";
  }

  function actionMode(){
    if(todayState?.jam_masuk && todayState?.jam_pulang) return "DONE";
    if(todayState?.jam_masuk) return "PULANG";
    return "MASUK";
  }

  function ensureUi(){
    if(!isSpv()) return null;
    const header=document.querySelector("#header .erp-header-vax");
    if(!header) return null;

    let button=document.getElementById("svpAttendanceHeaderBtn");
    if(!button){
      button=document.createElement("button");
      button.type="button";
      button.id="svpAttendanceHeaderBtn";
      button.className="vax-svp-attendance is-visible";
      button.innerHTML='<span class="material-symbols-rounded" aria-hidden="true">fingerprint</span><span id="svpAttendanceHeaderLabel">Absen SVP</span>';
      const owner=header.querySelector(".vax-owner");
      if(owner) owner.insertAdjacentElement("beforebegin",button);
      else header.appendChild(button);
      button.addEventListener("click",()=>openModal());
    }

    if(!document.getElementById("svpAttendanceBackdrop")){
      const bd=document.createElement("div");
      bd.id="svpAttendanceBackdrop";
      bd.className="svp-attendance-modal-backdrop";
      bd.hidden=true;
      bd.innerHTML=`
        <section class="svp-attendance-modal" role="dialog" aria-modal="true" aria-label="Absensi SVP">
          <div class="svp-attendance-modal-head">
            <h3>Absensi SVP</h3>
            <button class="svp-attendance-close" type="button" id="svpAttendanceClose" aria-label="Tutup">×</button>
          </div>
          <div class="svp-attendance-body">
            <div class="svp-attendance-state">
              <div><small>MASUK</small><strong id="svpAttMasuk">—</strong></div>
              <div><small>PULANG</small><strong id="svpAttPulang">—</strong></div>
            </div>
            <div class="svp-attendance-location">
              <small>LOKASI GPS SAAT INI</small>
              <strong id="svpAttAddress">Belum membaca lokasi.</strong>
              <span id="svpAttAccuracy">GPS belum aktif.</span>
            </div>
            <p class="svp-attendance-msg" id="svpAttMessage">GPS wajib aktif. SVP tidak dibatasi radius cabang.</p>
            <button type="button" class="svp-attendance-action" id="svpAttAction" disabled>Memeriksa GPS…</button>
            <button type="button" class="svp-attendance-history-toggle" id="svpAttHistoryToggle">Riwayat Absensi Saya</button>
            <section class="svp-attendance-history" id="svpAttHistory" hidden>
              <div class="svp-attendance-history-head">
                <strong>Riwayat Absensi</strong>
                <span>31 data terakhir</span>
              </div>
              <div class="svp-attendance-history-list" id="svpAttHistoryList">
                <div class="svp-attendance-history-empty">Belum ada riwayat.</div>
              </div>
            </section>
            <p class="svp-attendance-note">Jam kerja fleksibel. Tidak memakai aturan terlambat/denda karyawan cabang.</p>
          </div>
        </section>`;
      document.body.appendChild(bd);
      bd.addEventListener("click",(e)=>{if(e.target===bd) closeModal();});
      document.getElementById("svpAttendanceClose")?.addEventListener("click",closeModal);
      document.getElementById("svpAttAction")?.addEventListener("click",submitAttendance);
      document.getElementById("svpAttHistoryToggle")?.addEventListener("click",toggleHistory);
    }

    paintState();
    return button;
  }

  function setMessage(text){const el=document.getElementById("svpAttMessage");if(el)el.textContent=text;}
  function paintState(){
    const mode=actionMode();
    const label=document.getElementById("svpAttendanceHeaderLabel");
    const btn=document.getElementById("svpAttendanceHeaderBtn");
    const action=document.getElementById("svpAttAction");
    const masuk=document.getElementById("svpAttMasuk");
    const pulang=document.getElementById("svpAttPulang");

    if(masuk) masuk.textContent=fmtTime(todayState?.jam_masuk);
    if(pulang) pulang.textContent=fmtTime(todayState?.jam_pulang);

    if(label) label.textContent=mode==="MASUK"?"Absen Masuk":mode==="PULANG"?"Absen Pulang":"Absensi Selesai";
    if(btn) btn.classList.toggle("is-done",mode==="DONE");

    if(action){
      action.textContent=mode==="MASUK"?"Simpan Absen Masuk":mode==="PULANG"?"Simpan Absen Pulang":"Absensi Hari Ini Selesai";
      action.disabled=busy || submitLocked || mode==="DONE" || !currentLocation || currentLocation.accuracy>300;
    }
  }

  async function loadState(){
    if(!isSpv() || typeof db==="undefined") return;
    try{
      const {data,error}=await db.rpc("svp_absensi_self_today_v1");
      if(error) throw error;
      todayState=data||null;
      ensureUi();
      paintState();
    }catch(err){
      console.error("[SVP Attendance] state:",err);
    }
  }

  function formatAddress(payload){
    const a=payload?.address||{};
    const parts=[
      a.road||a.pedestrian||a.residential,
      a.neighbourhood||a.suburb||a.village,
      a.city_district||a.district||a.municipality||a.county,
      a.city||a.town||a.regency||a.state_district,
      a.state
    ].map(clean).filter(Boolean);
    return [...new Set(parts)].slice(0,5).join(", ") || clean(payload?.display_name).split(",").slice(0,5).join(",");
  }

  async function reverseGeocode(lat,lon){
    try{
      const url=new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format","jsonv2");
      url.searchParams.set("lat",String(lat));
      url.searchParams.set("lon",String(lon));
      url.searchParams.set("zoom","18");
      url.searchParams.set("addressdetails","1");
      url.searchParams.set("accept-language","id");
      const res=await fetch(url.toString(),{headers:{Accept:"application/json"}});
      if(!res.ok) throw new Error("reverse-geocode-"+res.status);
      return formatAddress(await res.json());
    }catch(err){
      console.warn("[SVP Attendance] reverse geocode unavailable:",err);
      return "";
    }
  }

  async function readGps(){
    currentLocation=null;
    paintState();
    const address=document.getElementById("svpAttAddress");
    const accuracy=document.getElementById("svpAttAccuracy");
    if(address) address.textContent="Membaca GPS…";
    if(accuracy) accuracy.textContent="Mohon tunggu.";

    if(!navigator.geolocation){
      if(address) address.textContent="Perangkat tidak mendukung GPS.";
      setMessage("Absensi SVP memerlukan GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(async(pos)=>{
      const lat=Number(pos.coords.latitude);
      const lon=Number(pos.coords.longitude);
      const acc=Number(pos.coords.accuracy||0);
      const human=await reverseGeocode(lat,lon);
      currentLocation={lat,lon,accuracy:acc,address:human};

      if(address) address.textContent=human || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      if(accuracy) accuracy.textContent=`Akurasi ±${Math.round(acc)} meter`;
      setMessage(acc>300
        ? "Akurasi GPS terlalu rendah. Tunggu sinyal lebih akurat lalu buka ulang absensi."
        : "Lokasi siap. Alamat dan koordinat ini akan dicatat saat absen.");
      paintState();
    },(err)=>{
      if(address) address.textContent="Lokasi tidak dapat dibaca.";
      if(accuracy) accuracy.textContent="GPS belum tersedia.";
      setMessage(err?.code===1?"Izinkan akses lokasi/GPS untuk melakukan absensi.":"GPS gagal dibaca. Coba lagi.");
      paintState();
    },{
      enableHighAccuracy:true,
      timeout:15000,
      maximumAge:0
    });
  }

  async function openModal(){
    ensureUi();
    const bd=document.getElementById("svpAttendanceBackdrop");
    if(!bd) return;
    bd.hidden=false;
    submitLocked=false;
    currentLocation=null;
    paintState();

    if(actionMode()==="DONE"){
      const address=document.getElementById("svpAttAddress");
      const accuracy=document.getElementById("svpAttAccuracy");
      if(address) address.textContent=todayState?.alamat_pulang || todayState?.alamat_masuk || "Lokasi absensi hari ini sudah tersimpan.";
      if(accuracy) accuracy.textContent="Absensi hari ini sudah selesai.";
      setMessage("Absensi hari ini selesai. Riwayat tetap dapat dibuka.");
      return;
    }

    await readGps();
  }

  function formatDateId(value){
    if(!value) return "—";
    try{
      return new Intl.DateTimeFormat("id-ID",{
        timeZone:"Asia/Jakarta",
        day:"2-digit",
        month:"short",
        year:"numeric"
      }).format(new Date(String(value)+"T00:00:00+07:00"));
    }catch(_e){
      return String(value);
    }
  }

  function historyItem(row){
    const masuk=fmtTime(row?.jam_masuk);
    const pulang=fmtTime(row?.jam_pulang);
    const locMasuk=clean(row?.alamat_masuk)||"Lokasi masuk belum tersedia";
    const locPulang=clean(row?.alamat_pulang)||"Lokasi pulang belum tersedia";
    return `
      <article class="svp-attendance-history-item">
        <div class="svp-attendance-history-date">${formatDateId(row?.tanggal)}</div>
        <div class="svp-attendance-history-times">
          <span><small>MASUK</small><strong>${masuk}</strong></span>
          <span><small>PULANG</small><strong>${pulang}</strong></span>
        </div>
        <div class="svp-attendance-history-location">
          <p><b>Masuk:</b> ${locMasuk}</p>
          <p><b>Pulang:</b> ${locPulang}</p>
        </div>
      </article>`;
  }

  async function loadHistory(){
    const list=document.getElementById("svpAttHistoryList");
    if(!list || typeof db==="undefined") return;
    list.innerHTML='<div class="svp-attendance-history-empty">Memuat riwayat…</div>';
    try{
      const {data,error}=await db.rpc("svp_absensi_self_history_v1",{p_limit:31});
      if(error) throw error;
      const rows=Array.isArray(data)?data:[];
      list.innerHTML=rows.length
        ? rows.map(historyItem).join("")
        : '<div class="svp-attendance-history-empty">Belum ada riwayat absensi.</div>';
    }catch(err){
      console.error("[SVP Attendance] history:",err);
      list.innerHTML='<div class="svp-attendance-history-empty">Riwayat belum dapat dimuat.</div>';
    }
  }

  async function toggleHistory(){
    const panel=document.getElementById("svpAttHistory");
    const btn=document.getElementById("svpAttHistoryToggle");
    if(!panel || !btn) return;
    const willOpen=panel.hidden;
    panel.hidden=!willOpen;
    btn.textContent=willOpen?"Tutup Riwayat":"Riwayat Absensi Saya";
    if(willOpen) await loadHistory();
  }

  function closeModal(){
    const bd=document.getElementById("svpAttendanceBackdrop");
    if(bd) bd.hidden=true;
  }

  async function submitAttendance(){
    const mode=actionMode();
    if(busy || submitLocked || mode==="DONE" || !currentLocation || currentLocation.accuracy>300) return;
    busy=true;
    paintState();
    setMessage("Menyimpan absensi…");
    try{
      const {data,error}=await db.rpc("svp_absen_self_v1",{
        p_action:mode,
        p_lat:currentLocation.lat,
        p_lon:currentLocation.lon,
        p_accuracy:currentLocation.accuracy,
        p_address:currentLocation.address||null
      });
      if(error) throw error;
      if(!data?.ok) throw new Error("Absensi gagal disimpan.");
      todayState=data;
      submitLocked=true;
      setMessage(mode==="MASUK"?"Absen masuk berhasil dicatat. Tutup lalu buka kembali untuk Absen Pulang.":"Absen pulang berhasil dicatat.");
      paintState();
      setTimeout(closeModal,700);
    }catch(err){
      console.error("[SVP Attendance] submit:",err);
      const raw=String(err?.message||err||"");
      setMessage(
        /GPS_INVALID/i.test(raw)?"GPS belum memenuhi syarat akurasi.":
        /ABSEN_MASUK_SUDAH_TERCATAT/i.test(raw)?"Absen masuk hari ini sudah tercatat.":
        /PULANG_TOO_SOON/i.test(raw)?"Absen Pulang belum dapat dilakukan sesaat setelah Absen Masuk. Buka ulang setelah beberapa detik.":
        /ABSEN_PULANG_TIDAK_TERSEDIA/i.test(raw)?"Absen pulang belum tersedia atau sudah tercatat.":
        "Absensi gagal disimpan. Coba lagi."
      );
      await loadState();
    }finally{
      busy=false;
      paintState();
    }
  }

  async function boot(){
    if(!isSpv()) return;
    ensureUi();
    await loadState();
  }

  document.addEventListener("erp:components-ready",boot);
  document.addEventListener("erp:dashboard-ready",()=>setTimeout(boot,0));
  if(document.readyState!=="loading") setTimeout(boot,0);
})();