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