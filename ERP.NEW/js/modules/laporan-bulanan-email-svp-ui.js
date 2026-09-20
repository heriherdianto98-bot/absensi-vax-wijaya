"use strict";
/* Tombol email laporan bulanan: memakai markup A4 yang sama dengan tombol PDF. */
(() => {
  const TO="speedrangga59@gmail.com";
  const API=(location.hostname==="localhost"||location.hostname==="127.0.0.1")?"https://erp.vaxwijaya.com/api/monthly-report/email-svp":"/api/monthly-report/email-svp";
  let busy=false;
  const el=id=>document.getElementById(id);
  const monthText=value=>{
    const [year,month]=String(value||"").split("-").map(Number);
    const names=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    return year&&month>=1&&month<=12?`${names[month-1]} ${year}`:"—";
  };
  async function embeddedLogo(html){
    const url=new URL("../assets/logo-vax-wijaya.png",location.href);
    try{
      const response=await fetch(url,{credentials:"same-origin"});
      if(!response.ok) return html;
      const blob=await response.blob();
      if(blob.size>300000||!/^image\/(png|jpeg|webp)$/.test(blob.type))return html;
      const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
      return html.replace('src="../assets/logo-vax-wijaya.png"',`src="${data}"`);
    }catch(_){return html;}
  }
  function closeModal(){if(!busy)el("lbEmailModal")?.remove();}
  function openModal(){
    if(busy||el("lbEmailModal"))return;
    const branch=el("lbBranch")?.selectedOptions?.[0]?.textContent?.trim()||"—";
    const month=el("lbMonth")?.value||"";
    const cover=document.createElement("div");cover.id="lbEmailModal";cover.className="lb-email-overlay";
    cover.innerHTML=`<section class="lb-email-dialog" role="dialog" aria-modal="true" aria-labelledby="lbEmailTitle">
      <h2 id="lbEmailTitle">Kirim PDF Laporan Bulanan</h2>
      <p>PDF memakai format tombol PDF yang sudah ada.</p>
      <label>Tujuan <strong id="lbEmailTo"></strong></label>
      <label>Cabang <strong id="lbEmailBranch"></strong></label>
      <label>Periode <strong id="lbEmailMonth"></strong></label>
      <p class="lb-email-message" id="lbEmailMessage" role="status">Periksa penerima dan periode sebelum mengirim.</p>
      <div class="lb-email-actions"><button type="button" id="lbEmailCancel">Batal</button><button type="button" id="lbEmailConfirm">Kirim Email</button></div>
    </section>`;
    document.body.appendChild(cover);
    el("lbEmailTo").textContent=TO;el("lbEmailBranch").textContent=branch;el("lbEmailMonth").textContent=monthText(month);
    el("lbEmailCancel").addEventListener("click",closeModal);
    el("lbEmailConfirm").addEventListener("click",()=>send(month,branch));
    el("lbEmailConfirm").focus();
  }
  async function send(expectedMonth,expectedBranch){
    if(busy)return;busy=true;
    const button=el("lbEmailConfirm"),cancel=el("lbEmailCancel"),message=el("lbEmailMessage");
    button.disabled=true;cancel.disabled=true;message.textContent="Menyiapkan PDF dan mengirim...";
    try{
      if(el("lbMonth")?.value!==expectedMonth||el("lbBranch")?.selectedOptions?.[0]?.textContent?.trim()!==expectedBranch)
        throw new Error("Cabang atau periode berubah. Buka kembali konfirmasi email.");
      const {data,error}=await db.auth.getSession();if(error)throw error;
      const token=data?.session?.access_token;if(!token)throw new Error("Sesi login tidak tersedia.");
      const presenter=window.LaporanBulananPrintUI;
      if(!presenter?.emailDocument)throw new Error("Format PDF laporan belum tersedia. Muat ulang halaman.");
      const documentData=await presenter.emailDocument();
      const html=await embeddedLogo(documentData.html);
      const response=await fetch(API,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({html,month:documentData.month,branch:documentData.branch})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.sent!==true)throw new Error(result.error||`Pengiriman gagal (HTTP ${response.status}). Periksa layanan email di server.`);
      message.textContent=`Email diterima server pengirim untuk ${TO}. ID: ${result.messageId||"—"}`;
      button.textContent="Terkirim";
    }catch(err){message.textContent=`Gagal: ${err?.message||String(err)}`;button.disabled=false;}
    finally{busy=false;cancel.disabled=false;}
  }
  function boot(){
    const actions=document.querySelector(".lb-toolbar .lb-actions");
    if(!actions||el("lbEmailSvpMonthly"))return;
    const style=document.createElement("style");
    style.textContent=`.lb-email-overlay{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:16px}
      .lb-email-dialog{width:min(460px,100%);border:1px solid rgba(217,180,77,.45);border-radius:16px;padding:24px;background:#0c1016;color:#f4f6fa;box-shadow:0 22px 70px #000}
      .lb-email-dialog h2{margin:0 0 12px;font-size:21px;color:#f1cb68}.lb-email-dialog p{line-height:1.45;color:#acb9c9}
      .lb-email-dialog label{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid #27303a;font-size:13px;color:#b7c2d0}
      .lb-email-dialog label strong{color:#f6f6f6;overflow-wrap:anywhere;text-align:right}.lb-email-message{font-size:12px;min-height:30px}
      .lb-email-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.lb-email-actions button{padding:10px 16px;border-radius:9px;border:1px solid #64532c;background:#151b23;color:#fff;cursor:pointer}
      #lbEmailConfirm{background:#d6ae49;color:#101010;font-weight:800}.lb-email-actions button:disabled{opacity:.5;cursor:wait}`;
    document.head.appendChild(style);
    const button=document.createElement("button");
    button.type="button";button.id="lbEmailSvpMonthly";button.className="lb-print-action";
    button.title="Kirim PDF laporan bulanan ke SVP";
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zM3 6l9 7 9-7"/></svg><span>Email SVP</span>';
    button.addEventListener("click",openModal);actions.appendChild(button);
    const wa=document.createElement("button");
    wa.type="button";wa.id="lbWhatsappSvpMonthly";wa.className="lb-print-action";
    wa.title="Buka chat SVP Rangga; lampirkan PDF laporan secara manual";
    wa.style.cssText="color:#74e5a0;border-color:rgba(37,211,102,.5);background:rgba(37,211,102,.1)";
    wa.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8.5 8.5 0 0 1-12.4 7.6L3 20l.9-4.6A8.5 8.5 0 1 1 20 11.5zM8 8c.5 4 3.5 7 7.5 8"/></svg><span>WhatsApp SVP</span>';
    wa.addEventListener("click",()=>{
      const branch=el("lbBranch")?.selectedOptions?.[0]?.textContent?.trim()||"Semua Cabang";
      const period=monthText(el("lbMonth")?.value);
      if(period==="—"){window.alert("Pilih periode laporan terlebih dahulu.");return;}
      if(!window.confirm("Simpan laporan melalui tombol PDF terlebih dahulu, lalu lampirkan PDF secara manual di WhatsApp Rangga. Buka WhatsApp sekarang?"))return;
      const message=`Laporan Bulanan ${branch} ${period}.`;
      window.open(`https://wa.me/6287837102090?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
    });
    actions.appendChild(wa);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
