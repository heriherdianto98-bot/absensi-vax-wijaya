/*
=========================================================
ERP VAX WIJAYA
Setoran 3 Harian — Header Period Sync
Safety: UI/context sync only. No formula/query/engine change.
=========================================================
*/
(function(){
  function normalizePeriodLabel(text){
    return String(text || "")
      .replace(/^📅\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function syncSetoranHeaderPeriod(){
    const headerPeriod = document.getElementById("erpHeaderPeriode");
    const periodLabel = document.getElementById("s3v2PeriodLabel");
    const periodText = document.getElementById("s3PeriodText");
    if(!headerPeriod) return;

    const label = normalizePeriodLabel(periodLabel?.textContent);
    const fallback = normalizePeriodLabel(periodText?.textContent);
    const next = label && !/pilih periode/i.test(label) && label !== "—" ? label : fallback;

    if(next && next !== "—") headerPeriod.textContent = next;
  }

  function bind(){
    syncSetoranHeaderPeriod();

    const targets = [
      document.getElementById("s3v2PeriodLabel"),
      document.getElementById("s3PeriodText")
    ].filter(Boolean);

    if(typeof MutationObserver !== "undefined"){
      targets.forEach((target) => {
        const observer = new MutationObserver(syncSetoranHeaderPeriod);
        observer.observe(target, { childList:true, subtree:true, characterData:true });
      });
    }

    document.getElementById("s3v2Apply")?.addEventListener("click", () => {
      setTimeout(syncSetoranHeaderPeriod, 0);
      setTimeout(syncSetoranHeaderPeriod, 80);
    });

    document.getElementById("s3periodUse")?.addEventListener("click", () => {
      setTimeout(syncSetoranHeaderPeriod, 0);
      setTimeout(syncSetoranHeaderPeriod, 80);
    });

    document.addEventListener("erp:components-ready", () => {
      setTimeout(syncSetoranHeaderPeriod, 0);
      setTimeout(syncSetoranHeaderPeriod, 80);
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once:true });
  else bind();
})();
