/*
=========================================================
ERP VAX WIJAYA
Setoran 3 Harian — Header Period Sync
Safety: UI/context sync only. No formula/query/engine change.
=========================================================
*/
(function(){
  function installPeriodEmphasisStyle(){
    if(document.getElementById("s3PeriodEmphasisStrongUi")) return;
    const style = document.createElement("style");
    style.id = "s3PeriodEmphasisStrongUi";
    style.textContent = `
      body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open{
        position:relative!important;
        overflow:visible!important;
        border:2px solid #f4c542!important;
        background:linear-gradient(180deg,rgba(24,31,40,.98),rgba(14,20,28,.98))!important;
        box-shadow:
          0 0 0 1px rgba(244,197,66,.45),
          0 0 14px rgba(244,197,66,.42),
          inset 0 0 0 1px rgba(255,231,145,.08)!important;
        animation:s3PeriodStrongBlink 1s steps(2,end) infinite!important;
        will-change:box-shadow,border-color,background-color;
      }
      body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open::before{
        content:"";
        position:absolute;
        inset:-5px;
        border:2px solid rgba(255,214,70,.55);
        border-radius:inherit;
        pointer-events:none;
        opacity:.15;
        animation:s3PeriodStrongRing 1s steps(2,end) infinite!important;
      }
      body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open > span,
      body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open > b{
        position:relative;
        z-index:1;
      }
      body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open > span{
        animation:s3PeriodIconBlink 1s steps(2,end) infinite!important;
      }
      body.setoran-dark .s3sheet-period-picker-title{
        color:#ffd84d!important;
        text-shadow:0 0 8px rgba(255,216,77,.35),0 0 16px rgba(255,216,77,.18)!important;
      }
      @keyframes s3PeriodStrongBlink{
        0%,49%{
          border-color:#a77912!important;
          background:linear-gradient(180deg,rgba(22,27,34,.98),rgba(11,17,24,.98))!important;
          box-shadow:0 0 0 1px rgba(244,197,66,.18),0 0 5px rgba(244,197,66,.12),inset 0 0 0 1px rgba(255,231,145,.03)!important;
        }
        50%,100%{
          border-color:#ffe36b!important;
          background:linear-gradient(180deg,rgba(49,42,20,.98),rgba(20,24,29,.98))!important;
          box-shadow:0 0 0 3px rgba(255,215,72,.25),0 0 26px rgba(255,209,58,.82),0 0 42px rgba(255,195,30,.32),inset 0 0 0 1px rgba(255,242,184,.18)!important;
        }
      }
      @keyframes s3PeriodStrongRing{
        0%,49%{opacity:.06;transform:scale(1)}
        50%,100%{opacity:1;transform:scale(1.018)}
      }
      @keyframes s3PeriodIconBlink{
        0%,49%{filter:brightness(.82);transform:scale(.96)}
        50%,100%{filter:brightness(1.45) drop-shadow(0 0 5px rgba(255,217,75,.85));transform:scale(1.08)}
      }
      @media (prefers-reduced-motion:reduce){
        body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open,
        body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open::before,
        body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open > span{
          animation:none!important;
        }
        body.setoran-dark .s3sheet-period-picker-emphasis .s3sheet-period-open{
          border-color:#ffe36b!important;
          box-shadow:0 0 0 3px rgba(255,215,72,.22),0 0 24px rgba(255,209,58,.58)!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

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
    installPeriodEmphasisStyle();
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
