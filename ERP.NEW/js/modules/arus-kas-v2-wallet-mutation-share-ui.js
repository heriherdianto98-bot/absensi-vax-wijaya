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

  async function dataUrl(paths){
    for(const rel of paths){
      try{
        const r=await fetch(rel,{cache:"force-cache"});
        if(!r.ok) continue;
        const b=await r.blob();
        if(!b||b.size<100) continue;
        const u=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result||""));fr.onerror=no;fr.readAsDataURL(b)});
        if(u) return u;
      }catch(_e){}
    }
    return "";
  }

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

    /* Print only: tandai awal setiap tanggal agar mutasi terbaca seperti rekening koran/bank.
       Tidak mengubah data, urutan, saldo, atau renderer layar. */
    let lastDate="";
    clone.querySelectorAll("tbody tr").forEach(tr=>{
      const date=String(tr.children?.[0]?.textContent||"").replace(/\s+/g," ").trim();
      if(date && date!=="—" && date!==lastDate){
        tr.classList.add("ak2-mut-date-start");
        lastDate=date;
      }
    });

    return {title,period,balance,table:clone};
  }

  function css(){
    return `
      :root{--ink:#151515;--muted:#6a6454;--line:#d3ccb8;--gold:#c9a227;--gold-line:#d4af37;--head:#111}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      @page{size:A4 landscape;margin:8mm 9mm 13mm 9mm}
      html,body{margin:0;background:#fff;color:var(--ink);font-family:Arial,"Segoe UI",sans-serif;font-size:10pt;line-height:1.38}
      .sheet{width:100%;max-width:279mm;margin:0 auto}
      .head{display:flex;justify-content:space-between;align-items:center;gap:14px}
      .brand{display:flex;align-items:center;gap:14px}.brand img{width:68px;height:68px;object-fit:contain}
      .brand h1{margin:0;font-size:18pt;letter-spacing:.04em}.brand .doc{font-size:12pt;font-weight:800;letter-spacing:.08em}.brand .sys{font-size:8.5pt;color:var(--muted);letter-spacing:.1em}
      .right{text-align:right}.right .mark{font-size:7.5pt;font-weight:800;letter-spacing:.12em}.right .mark em{display:block;color:var(--gold);font-style:normal}
      .rule{height:2px;margin:8px 0 10px;background:linear-gradient(90deg,var(--gold-line),#e7d7a4 58%,transparent)}
      .title{margin-bottom:9px}.title h2{margin:0;font-size:16pt}.title p{margin:3px 0 0;color:#665f50;font-size:9pt}
      .meta{display:grid;grid-template-columns:1.3fr .8fr .8fr;gap:2px 20px;padding:8px 10px;margin-bottom:10px;border:1px solid var(--line);border-left:4px solid var(--gold-line);background:#fbfaf6}
      .meta span{display:block;font-size:7pt;font-weight:800;letter-spacing:.09em;color:#746d52;text-transform:uppercase}.meta strong{font-size:10pt}
      table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid var(--line)}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
      th{background:var(--head)!important;color:#fff!important;padding:6px 5px;border-right:1px solid #333;border-bottom:2px solid var(--gold-line);font-size:6.9pt;text-transform:uppercase;letter-spacing:.028em;text-align:left;line-height:1.12}
      td{padding:5px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-size:7.9pt;vertical-align:top;overflow-wrap:anywhere;background:#fff!important;color:#181818!important;line-height:1.18}
      tbody tr:nth-child(even) td{background:#fafaf8!important}
      tbody tr.ak2-mut-date-start td{border-top:5px solid #e3e5e8!important;background:#f1f2f4!important}
      tbody tr.ak2-mut-date-start td:first-child{font-weight:900!important;color:#30343a!important}
      .ak2-mut-kind,.ak2-mut-status{display:inline-block;padding:2px 5px;border:1px solid #bbb;border-radius:999px;font-size:6.5pt;font-weight:800;background:#f4f4f4!important;color:#222!important}
      .ak2-mut-amount,.ak2-mut-running{font-weight:900}
      .foot{display:flex;justify-content:space-between;gap:16px;margin-top:10px;padding-top:7px;border-top:1px solid var(--line);font-size:7.5pt;color:#666}
      .no-print{margin:12px 0}.no-print button{display:inline-block!important;border:1px solid var(--gold);background:#f7f1de;color:#111;font-weight:800;padding:8px 13px;border-radius:6px;cursor:pointer}
      @media print{.no-print{display:none!important}}
    `;
  }

  async function documentHtml(data){
    const logo=await dataUrl(["../assets/brand/erp-vax-wijaya.png","../assets/logo/erp-vax-wijaya.png"]);
    const stamp=new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date())+" WIB";
    const owner=document.getElementById("ak2User")?.textContent?.trim()||"Owner";
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.title)}</title><style>${css()}</style></head><body>
      <div class="sheet">
        <div class="head">
          <div class="brand">${logo?`<img src="${logo}">`:''}<div><h1>ERP VAX WIJAYA</h1><div class="doc">LAPORAN ARUS KAS</div><div class="sys">ENTERPRISE RESOURCE PLANNING</div></div></div>
          <div class="right"><div class="mark">DOKUMEN INTERNAL<em>FINANCE / OWNER</em></div></div>
        </div>
        <div class="rule"></div>
        <div class="title"><h2>${esc(data.title)}</h2><p>Riwayat mutasi wallet sesuai periode aktif Arus Kas V2.</p></div>
        <div class="meta"><div><span>Periode</span><strong>${esc(data.period)}</strong></div><div><span>Saldo Saat Ini</span><strong>${esc(data.balance)}</strong></div><div><span>Status Dokumen</span><strong>READ ONLY</strong></div></div>
        ${data.table.outerHTML}
        <div class="foot"><span>ERP VAX WIJAYA · Arus Kas V2 · Owner verified</span><span>Dicetak ${esc(stamp)} · ${esc(owner)}</span></div>
        <div class="no-print"><button onclick="window.print()">PRINT / SIMPAN PDF</button></div>
      </div>
    </body></html>`;
  }

  async function print(){
    let data;try{data=currentData();}catch(err){alert(err.message);return;}
    const w=window.open("","_blank");
    if(!w){alert("Popup print diblokir browser.");return;}
    try{
      w.document.open();w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Menyiapkan Print...</title></head><body style="font-family:Arial,sans-serif;padding:32px">Menyiapkan laporan mutasi Arus Kas...</body></html>');w.document.close();
      const html=await documentHtml(data);
      if(w.closed)return;
      w.document.open();w.document.write(html.replace("</body>","<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\\/script></body>"));w.document.close();
    }catch(err){try{if(!w.closed)w.close();}catch(_e){}alert(err?.message||"Gagal menyiapkan print mutasi.");}
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
        title:data.title,period:data.period,balance:data.balance,html:await documentHtml(data)
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