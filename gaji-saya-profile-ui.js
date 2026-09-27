/* VAX WIJAYA — Gaji Saya profile presentation adapter
   READ ONLY. Reuses the canonical employee session; no payroll calculations or writes. */
(() => {
  "use strict";
  const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='32' fill='%23e5f5f2'/%3E%3Ccircle cx='32' cy='24' r='10' fill='%232fc8b4'/%3E%3Cpath d='M14 56c2.4-12 12.2-18 18-18s15.6 6 18 18' fill='%232fc8b4'/%3E%3C/svg%3E";

  function greeting(){
    const hour = Number(new Intl.DateTimeFormat("en-US", {
      timeZone:"Asia/Jakarta", hour:"2-digit", hour12:false
    }).format(new Date()));
    if(hour >= 5 && hour < 11) return ["Selamat Pagi,","Semoga hari ini penuh semangat."];
    if(hour >= 11 && hour < 15) return ["Selamat Siang,","Tetap semangat melayani pelanggan."];
    if(hour >= 15 && hour < 18) return ["Selamat Sore,","Semoga target hari ini tercapai."];
    return ["Selamat Malam,","Terima kasih atas kerja keras hari ini."];
  }

  function applyPhoto(url){
    const img=document.getElementById("fotoGaji");
    if(!img) return;
    const src=String(url||"").trim();
    img.onerror=()=>{img.onerror=null;img.src=PLACEHOLDER;};
    img.src=src||PLACEHOLDER;
  }

  async function init(){
    if(typeof KaryawanSession==="undefined") return;
    const employee=await KaryawanSession.requirePage();
    if(!employee) return;

    const [title,message]=greeting();
    const t=document.getElementById("gajiGreetingTitle");
    const m=document.getElementById("gajiGreetingMessage");
    if(t) t.textContent=title;
    if(m) m.textContent=message;
    applyPhoto(employee.foto);

    const address=document.getElementById("gajiCabangAddress");
    const locationLine=document.getElementById("gajiProfileLocationLine");
    if(!address) return;
    if(!employee.cabang_id || typeof db==="undefined"){
      address.textContent="Alamat cabang belum tersedia";
      if(locationLine) locationLine.textContent="Cabang belum tersedia";
      return;
    }
    try{
      const {data,error}=await db.from("cabang").select("nama_cabang,alamat").eq("id",employee.cabang_id).maybeSingle();
      const branchName=!error && data ? (String(data.nama_cabang||"").trim() || "Cabang belum tersedia") : "Cabang belum tersedia";
      address.textContent=!error && data ? (String(data.alamat||"").trim() || "Alamat belum diisi di Master Cabang") : "Alamat cabang belum tersedia";
      if(locationLine) locationLine.textContent=branchName;
    }catch(_error){
      address.textContent="Alamat cabang belum tersedia";
      if(locationLine) locationLine.textContent="Cabang belum tersedia";
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>void init(),{once:true});
  }else{
    void init();
  }
})();