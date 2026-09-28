/* ERP VAX — Wallet Mutation Print / Email / WhatsApp UI
   Presentation/share layer only. Tidak mengubah engine, saldo, query, transaksi, atau formula Arus Kas.
*/
"use strict";
(function(){
  const EMAIL_TO="speedrangga59@gmail.com";
  const WA_NUMBER="6287837102090";
  const API=(location.hostname==="localhost"||location.hostname==="127.0.0.1")
    ?"https://erp.vaxwijaya.com/api/arus-kas/mutation/email-svp"
    :"/api/arus-kas/mutation/email-svp";

  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const text=id=>document.getElementById(id)?.textContent?.trim()||"—";

  function currentData(){
    const root=document.getElementById("ak2WalletMutationModal");
    if(!root||root.hidden) throw new Error("Buka riwayat mutasi terlebih dahulu.");
    const title=text("ak2MutTitle");
    const period=text("ak2MutPeriod");
    const balance=text("ak2MutBalance");
    const table=root.querySelector(".ak2-mut-table");
    if(!table) throw new Error("Tabel mutasi belum tersedia.");
    const clone=table.cloneNode(true);
    clone.querySelectorAll("button,[title]").forEach(el=>el.removeAttribute?.("title"));
    return {title,period,balance,table:clone};
  }

  function css(){
    return `
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      @page{size:A4 landscape;margin:9mm 10mm 13mm}
      html,body{margin:0;background:#fff;color:#171717;font-family:Arial,"Segoe UI",sans-serif;font-size:9pt}
      .sheet{width:100%;max-width:277mm;margin:0 auto}.head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
      .brand h1{margin:0;font-size:18pt;letter-spacing:.04em}.brand .doc{margin-top:2px;font-size:10pt;font-weight:900;letter-spacing:.11em}
      .brand .sys{margin-top:2px;font-size:7.5pt;color:#6b665b;letter-spacing:.1em}.mark{text-align:right;font-size:7pt;font-weight:900;letter-spacing:.1em}
      .mark strong{display:block;margin-top:3px;color:#b88b16}.rule{height:2px;margin:8px 0 10px;background:linear-gradient(90deg,#d4af37,#eadca8 58%,transparent)}
      .title h2{margin:0;font-size:15pt}.title p{margin:3px 0 0;color:#696254}.meta{display:grid;grid-template-columns:1.2fr .8fr .8fr;gap:18px;margin:10px 0;padding:8px 10px;border:1px solid #d4ccb8;border-left:4px solid #d4af37;background:#fbfaf6}
      .meta span{display:block;font-size:6.8pt;font-weight:900;letter-spacing:.08em;color:#746d52;text-transform:uppercase}.meta strong{display:block;margin-top:2px;font-size:10pt}
      table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #cfc8b8}thead{display:table-header-group}tr{break-inside:avoid}
      th{background:#111!important;color:#fff!important;padding:6px 5px;border-right:1px solid #333;border-bottom:2px solid #d4af37;font-size:6.8pt;text-transform:uppercase;letter-spacing:.03em;text-align:left}
      td{padding:5px;border-right:1px solid #d8d3c7;border-bottom:1px solid #ddd8cc;font-size:7.8pt;vertical-align:top;overflow-wrap:anywhere;background:#fff!important;color:#171717!important}
      tbody tr:nth-child(even) td{background:#fafaf8!important}.ak2-mut-kind,.ak2-mut-status{display:inline-block;padding:2px 5px;border:1px solid #bbb;border-radius:999px;font-size:6.5pt;font-weight:800;background:#f4f4f4!important;color:#222!important}
      .ak2-mut-amount,.ak2-mut-running{font-weight:900}.foot{display:flex;justify-content:space-between;gap:16px;margin-top:9px;padding-top:6px;border-top:1px solid #cfc8b8;color:#6b665b;font-size:7pt}
      .actions{margin-top:12px}.actions button{padding:8px 13px;border:1px solid #b89129;background:#f6efdc;font-weight:800;cursor:pointer}
      @media print{.actions{display:none!important}}
    `;
  }

  function documentHtml(data){
    const stamp=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date())+" WIB";
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)}</title><style>${css()}</style></head><body>
      <div class="sheet">
        <div class="head"><div class="brand"><h1>ERP VAX WIJAYA</h1><div class="doc">LAPORAN MUTASI ARUS KAS</div><div class="sys">ENTERPRISE RESOURCE PLANNING</div></div><div class="mark">DOKUMEN INTERNAL<strong>FINANCE / OWNER</strong></div></div>
        <div class="rule"></div>
        <div class="title"><h2>${esc(data.title)}</h2><p>Riwayat mutasi wallet sesuai periode aktif Arus Kas V2.</p></div>
        <div class="meta"><div><span>Periode</span><strong>${esc(data.period)}</strong></div><div><span>Saldo Saat Ini</span><strong>${esc(data.balance)}</strong></div><div><span>Status Dokumen</span><strong>READ ONLY</strong></div></div>
        ${data.table.outerHTML}
        <div class="foot"><span>ERP VAX WIJAYA · Arus Kas V2</span><span>Dicetak ${esc(stamp)}</span></div>
        <div class="actions"><button onclick="window.print()">PRINT / SIMPAN PDF</button></div>
      </div>
    </body></html>`;
  }

  function print(){
    let data;try{data=currentData();}catch(err){alert(err.message);return;}
    const w=window.open("","_blank");
    if(!w){alert("Popup print diblokir browser.");return;}
    w.document.open();w.document.write(documentHtml(data).replace("</body>","<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200));<\\/script></body>"));w.document.close();
  }

  async function email(){
    let data;try{data=currentData();}catch(err){alert(err.message);return;}
    if(!window.confirm(`Kirim PDF ${data.title} ke SVP (${EMAIL_TO})?`))return;
    const client=window.db;
    if(!client?.auth) return alert("Sesi database belum tersedia.");
    try{
      const {data:session,error}=await client.auth.getSession();if(error)throw error;
      const token=session?.session?.access_token;if(!token)throw new Error("Sesi login tidak tersedia.");
      const response=await fetch(API,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({
        title:data.title,period:data.period,balance:data.balance,html:documentHtml(data)
      })});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.sent!==true)throw new Error(result.error||`Pengiriman gagal (HTTP ${response.status})`);
      alert(`Email mutasi berhasil dikirim ke ${EMAIL_TO}.`);
    }catch(err){alert("Gagal mengirim email: "+(err?.message||String(err)));}
  }

  function whatsapp(){
    let data;try{data=currentData();}catch(err){alert(err.message);return;}
    if(!window.confirm("Simpan mutasi melalui Print / PDF terlebih dahulu, lalu lampirkan PDF secara manual di WhatsApp SVP. Buka WhatsApp sekarang?"))return;
    const message=`${data.title} · ${data.period}. Saldo saat ini ${data.balance}.`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
  }

  function mount(){
    const root=document.getElementById("ak2WalletMutationModal");
    if(!root)return;
    const right=root.querySelector(".ak2-mut-head-right");if(!right||right.querySelector(".ak2-mut-share-actions"))return;
    const group=document.createElement("div");group.className="ak2-mut-share-actions";
    group.innerHTML='<button type="button" data-mut-print>Print / PDF</button><button type="button" data-mut-email>Email SVP</button><button type="button" data-mut-wa>WhatsApp SVP</button>';
    right.insertBefore(group,right.querySelector(".ak2-mut-close"));
    group.querySelector("[data-mut-print]").addEventListener("click",e=>{e.stopPropagation();print();});
    group.querySelector("[data-mut-email]").addEventListener("click",e=>{e.stopPropagation();email();});
    group.querySelector("[data-mut-wa]").addEventListener("click",e=>{e.stopPropagation();whatsapp();});
    if(!document.getElementById("ak2MutShareStyle")){
      const s=document.createElement("style");s.id="ak2MutShareStyle";s.textContent=`
        .ak2-mut-head{padding:14px 18px!important;min-height:0!important}
        .ak2-mut-kicker{font-size:9px!important;letter-spacing:.14em!important}
        .ak2-mut-head h2{margin:3px 0 2px!important;font-size:22px!important}
        .ak2-mut-period{font-size:11px!important}
        .ak2-mut-head-right{min-width:430px!important;padding-right:44px!important;display:grid!important;grid-template-columns:auto 1fr!important;grid-template-areas:"label actions" "value actions"!important;align-items:center!important;column-gap:12px!important;row-gap:1px!important}
        .ak2-mut-balance-label{grid-area:label!important;font-size:9px!important}
        .ak2-mut-head-right>strong{grid-area:value!important;margin-top:0!important;font-size:23px!important;line-height:1.05!important}
        .ak2-mut-share-actions{grid-area:actions;display:flex;justify-content:flex-end;align-items:center;gap:6px;margin:0!important}
        .ak2-mut-share-actions button{border:1px solid #705b2b;border-radius:8px;background:#141e27;color:#e8edf1;padding:6px 9px;font-size:10px;font-weight:800;cursor:pointer;white-space:nowrap}
        .ak2-mut-share-actions button:hover{filter:brightness(1.15)}.ak2-mut-share-actions [data-mut-email]{color:#f2d276}.ak2-mut-share-actions [data-mut-wa]{color:#77e39c;border-color:#246b3e}
        .ak2-mut-close{width:36px!important;height:36px!important;font-size:22px!important}
        @media(max-width:900px){.ak2-mut-head{align-items:flex-start!important;padding:12px!important}.ak2-mut-head-right{min-width:0!important;display:block!important;padding-right:42px!important}.ak2-mut-share-actions{flex-wrap:wrap;margin-top:7px!important}.ak2-mut-share-actions button{font-size:9px;padding:5px 7px}}
      `;document.head.appendChild(s);
    }
  }

  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",mount,{once:true});
  window.ArusKasV2WalletMutationShareUI={mount,print,email,whatsapp,documentHtml};
})();