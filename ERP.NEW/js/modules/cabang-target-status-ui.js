/* Master Cabang target popup: presentation and read-only save history only.
   No writes, formula changes or modifications to existing locked engines. */
"use strict";
(() => {
  const modal = document.getElementById("modalTargetBulanan");
  const editor = document.getElementById("dualTargetEditor");
  const nav = document.getElementById("targetCabangNav");
  const month = document.getElementById("targetBulanSelect");
  const year = document.getElementById("targetTahunInput");
  const title = document.getElementById("dualBranchTitle");
  const status = document.getElementById("dualTargetStatus");
  if (!modal || !editor || !nav || !month || !year || !title || !status || document.getElementById("dualTargetHistory")) return;

  const style = document.createElement("style");
  style.id = "dualTargetDarkHistoryStyle";
  style.textContent = `
    #modalTargetBulanan{background:rgba(1,4,9,.91)!important;--target-gold:#d2a129!important}
    #modalTargetBulanan .modal-box{background:linear-gradient(155deg,#101923,#080e16 80%)!important;border-color:#594823!important}
    #modalTargetBulanan .modal-header{background:linear-gradient(180deg,#17212b,#0e151e)!important;border-bottom-color:#493b24!important}
    #modalTargetBulanan .target-periode-row select,#modalTargetBulanan .target-periode-row input,#modalTargetBulanan #targetCabangNav{background:#101a26!important;border-color:#3b4a59!important}
    #modalTargetBulanan .dual-head{background:linear-gradient(125deg,#1b2632,#111a25)!important;border-color:#394858!important}
    #modalTargetBulanan .dual-card{background:linear-gradient(155deg,#182431,#101923)!important;border-color:#394957!important}
    #modalTargetBulanan .dual-card.ultimate{border-color:#725829!important}
    #modalTargetBulanan .dual-card select,#modalTargetBulanan .dual-card input{background:#0c1420!important;border-color:#435263!important}
    #modalTargetBulanan .dual-summary{background:#121e2b!important;border-color:#3a4a5b!important}
    #modalTargetBulanan .dual-summary-row{background:#0e1925!important;border-color:#354454!important}
    #modalTargetBulanan .dual-eyebrow,#modalTargetBulanan .dual-card h4,#modalTargetBulanan .dual-summary-toggle,#modalTargetBulanan #dualTargetStatus{color:#d2a129!important}
    #modalTargetBulanan .dual-summary-row.current{color:#d7ab40!important;border-color:#a57c26!important}
    #modalTargetBulanan #dualTargetStatus.error{color:#ffaaa7!important}
    #modalTargetBulanan #dualTargetHistory{margin:12px 0 0;padding:10px 13px;border:1px solid #655129;border-radius:9px;background:linear-gradient(120deg,#201d15,#141c25);color:#e5d4aa;font-size:12px;line-height:1.5}
    #modalTargetBulanan #dualTargetHistory[hidden]{display:none!important}
    #modalTargetBulanan #dualTargetHistory strong{display:block;margin-bottom:4px;color:#d9aa37;font-size:12px;font-weight:900}
    #modalTargetBulanan #dualTargetHistory .dual-history-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px}
    #modalTargetBulanan #dualTargetHistory .dual-history-items span{display:block;min-width:0;overflow-wrap:anywhere}
    @media(max-width:670px){#modalTargetBulanan #dualTargetHistory .dual-history-items{grid-template-columns:1fr}}

    /* Popup-only scrollbar: match the dark theme in Chromium, Firefox and WebKit. */
    #modalTargetBulanan .modal-box,#modalTargetBulanan #dualTargetEditor,#modalTargetBulanan .target-list-wrapper{scrollbar-width:thin;scrollbar-color:#665022 #0b121b;}
    #modalTargetBulanan .modal-box::-webkit-scrollbar,#modalTargetBulanan #dualTargetEditor::-webkit-scrollbar,#modalTargetBulanan .target-list-wrapper::-webkit-scrollbar{width:9px;height:9px;}
    #modalTargetBulanan .modal-box::-webkit-scrollbar-track,#modalTargetBulanan #dualTargetEditor::-webkit-scrollbar-track,#modalTargetBulanan .target-list-wrapper::-webkit-scrollbar-track{background:#0b121b;border-radius:12px;}
    #modalTargetBulanan .modal-box::-webkit-scrollbar-thumb,#modalTargetBulanan #dualTargetEditor::-webkit-scrollbar-thumb,#modalTargetBulanan .target-list-wrapper::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#78602e,#483d2a);border:2px solid #0b121b;border-radius:12px;}
    #modalTargetBulanan .modal-box::-webkit-scrollbar-thumb:hover,#modalTargetBulanan #dualTargetEditor::-webkit-scrollbar-thumb:hover{background:#947237;}

    /* Two distinct raised surfaces, with a restrained slow glow instead of flashing content. */
    #modalTargetBulanan .dual-card{position:relative;isolation:isolate;transform:translateY(0);transform-style:preserve-3d;transition:transform .24s ease,box-shadow .24s ease,border-color .24s ease;}
    #modalTargetBulanan .dual-card.omzet{border:1px solid #356879!important;border-left:3px solid #51b6c9!important;background:radial-gradient(ellipse at 6% 0%,rgba(48,152,179,.18),transparent 59%),linear-gradient(155deg,#172c38,#0b1823 78%)!important;box-shadow:inset 0 1px 0 rgba(185,232,246,.14),inset 0 -3px 5px rgba(0,0,0,.35),0 4px 0 #081017,0 10px 20px rgba(0,0,0,.38),0 0 13px rgba(54,170,196,.14);animation:vaxOmzetSoftGlow 4.5s ease-in-out infinite;}
    #modalTargetBulanan .dual-card.ultimate{border:1px solid #80612e!important;border-left:3px solid #d6a93d!important;background:radial-gradient(ellipse at 7% 0%,rgba(180,130,37,.19),transparent 61%),linear-gradient(155deg,#29251a,#171a1d 77%)!important;box-shadow:inset 0 1px 0 rgba(255,227,164,.13),inset 0 -3px 5px rgba(0,0,0,.35),0 4px 0 #120f0b,0 10px 20px rgba(0,0,0,.38),0 0 13px rgba(204,151,41,.14);animation:vaxUltimateSoftGlow 4.5s ease-in-out infinite;animation-delay:-2.25s;}
    #modalTargetBulanan .dual-card.omzet h4{color:#82d5df!important;}
    #modalTargetBulanan .dual-card.ultimate h4{color:#d7ac4d!important;}
    #modalTargetBulanan .dual-card:hover{transform:translateY(-3px);animation-play-state:paused;}
    #modalTargetBulanan .dual-card.omzet:hover{border-color:#6bb7c7!important;box-shadow:inset 0 1px 0 rgba(185,232,246,.22),0 7px 0 #081017,0 15px 24px rgba(0,0,0,.45),0 0 24px rgba(54,170,196,.27);}
    #modalTargetBulanan .dual-card.ultimate:hover{border-color:#bb9241!important;box-shadow:inset 0 1px 0 rgba(255,227,164,.22),0 7px 0 #120f0b,0 15px 24px rgba(0,0,0,.45),0 0 24px rgba(204,151,41,.27);}
    @keyframes vaxOmzetSoftGlow{0%,100%{box-shadow:inset 0 1px 0 rgba(185,232,246,.14),inset 0 -3px 5px rgba(0,0,0,.35),0 4px 0 #081017,0 10px 20px rgba(0,0,0,.38),0 0 10px rgba(54,170,196,.09);}50%{box-shadow:inset 0 1px 0 rgba(185,232,246,.19),inset 0 -3px 5px rgba(0,0,0,.35),0 4px 0 #081017,0 10px 20px rgba(0,0,0,.38),0 0 21px rgba(54,170,196,.28);}}
    @keyframes vaxUltimateSoftGlow{0%,100%{box-shadow:inset 0 1px 0 rgba(255,227,164,.13),inset 0 -3px 5px rgba(0,0,0,.35),0 4px 0 #120f0b,0 10px 20px rgba(0,0,0,.38),0 0 10px rgba(204,151,41,.09);}50%{box-shadow:inset 0 1px 0 rgba(255,227,164,.19),inset 0 -3px 5px rgba(0,0,0,.35),0 4px 0 #120f0b,0 10px 20px rgba(0,0,0,.38),0 0 21px rgba(204,151,41,.28);}}
    @media(prefers-reduced-motion:reduce){#modalTargetBulanan .dual-card.omzet,#modalTargetBulanan .dual-card.ultimate{animation:none!important;transition:none!important;}#modalTargetBulanan .dual-card:hover{transform:none!important;}}
  `;
  document.head.appendChild(style);

  const banner = document.createElement("div");
  banner.id = "dualTargetHistory";
  banner.hidden = true;
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML = '<strong>Status target tersimpan</strong><div class="dual-history-items"><span id="dualHistoryOmzet"></span><span id="dualHistoryUltimate"></span></div>';
  editor.querySelector(".dual-grid")?.after(banner);
  const omzetText = document.getElementById("dualHistoryOmzet");
  const ultimateText = document.getElementById("dualHistoryUltimate");
  const fmt = value => {
    if (!value) return "waktu penyimpanan tidak tersedia";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "waktu penyimpanan tidak tersedia";
    return new Intl.DateTimeFormat("id-ID", {
      timeZone:"Asia/Jakarta",day:"2-digit",month:"long",year:"numeric",
      hour:"2-digit",minute:"2-digit",hour12:false
    }).format(date).replace(" pukul ", " · ") + " WIB";
  };
  const label = row => {
    if (!row) return "Belum ada target tersimpan";
    const created = Date.parse(row.created_at || "");
    const updated = Date.parse(row.updated_at || "");
    const modified = Number.isFinite(created) && Number.isFinite(updated) && updated - created > 1000;
    return `${modified ? "Terakhir diperbarui" : "Disimpan"}: ${fmt(row.updated_at || row.created_at)}`;
  };
  let request = 0;
  let pending = null;
  function schedule(){
    if (pending !== null) clearTimeout(pending);
    pending = setTimeout(() => {pending=null;void render().catch(() => {
      if (!banner.hidden) {
        omzetText.textContent = "Omzet: status tidak dapat dibaca";
        ultimateText.textContent = "Ultimate: status tidak dapat dibaca";
      }
    });}, 120);
  }
  async function render(){
    const seq = ++request;
    const cabang = Number(nav.value), m = Number(month.value), y = Number(year.value);
    if (!Number.isSafeInteger(cabang) || cabang < 1 || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 2020 || y > 2100){
      banner.hidden = true;
      return;
    }
    const api = typeof db !== "undefined" ? db : (typeof supabaseClient !== "undefined" ? supabaseClient : null);
    if (!api?.from){banner.hidden=true;return;}
    banner.hidden = false;
    omzetText.textContent = "Omzet: memeriksa data tersimpan…";
    ultimateText.textContent = "Ultimate: memeriksa data tersimpan…";
    const [omzet, ultimate] = await Promise.all([
      api.from("target_bulanan").select("created_at,updated_at").eq("cabang_id",cabang).eq("bulan",m).eq("tahun",y).maybeSingle(),
      api.from("kpi_ultimate_monthly_target").select("created_at,updated_at,active").eq("cabang_id",cabang).eq("month",m).eq("year",y).maybeSingle()
    ]);
    if (seq !== request || cabang !== Number(nav.value) || m !== Number(month.value) || y !== Number(year.value)) return;
    omzetText.textContent = omzet.error ? "Omzet: status tidak dapat dibaca" : `Omzet: ${label(omzet.data)}`;
    ultimateText.textContent = ultimate.error ? "Ultimate: status tidak dapat dibaca" : `Ultimate: ${label(ultimate.data?.active === false ? null : ultimate.data)}`;
  }
  nav.addEventListener("change", schedule);
  month.addEventListener("change", schedule);
  year.addEventListener("change", schedule);
  const watchTitle = new MutationObserver(schedule);
  watchTitle.observe(title,{childList:true,characterData:true,subtree:true});
  const watchStatus = new MutationObserver(schedule);
  watchStatus.observe(status,{childList:true,characterData:true,subtree:true});
  const watchModal = new MutationObserver(() => {
    if (getComputedStyle(modal).display !== "none") schedule();
    else {++request;banner.hidden=true;}
  });
  watchModal.observe(modal,{attributes:true,attributeFilter:["class","style"]});
  if (getComputedStyle(modal).display !== "none") schedule();
})();