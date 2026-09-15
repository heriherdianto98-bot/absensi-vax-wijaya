/*
=========================================
VAX ERP
Supabase Connector
=========================================
*/

const SUPABASE_URL =
"https://cmtuufwzjshixivykbjf.supabase.co";

const SUPABASE_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiY210dXVmd3pqc2hpeGl2eWtiamYiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NTE3OTgwOSwiZXhwIjoyMTAwNzU1ODA5fQ.QzfAecp9A6qxJdpE_1WH93T6--hXiqudMVUyfedLh2Q";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

/* Page-scoped helper autoload. Tidak menyentuh money engine / Minutes source. */
(function(){
    const path = String(window.location.pathname || "").toLowerCase();
    const ASSET_VERSION = "20260915-investor-realpdf3";
    const loadScript = (src) => new Promise((resolve, reject) => {
        const key = `${src}?v=${ASSET_VERSION}`;
        if(document.querySelector(`script[data-vax-src="${key}"]`)){
            resolve();
            return;
        }
        const s = document.createElement("script");
        s.src = key;
        s.async = false;
        s.dataset.vaxSrc = key;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });

    window.addEventListener("DOMContentLoaded", async () => {
        try{
            if(path.endsWith("/tabel-harian-cabang.html")){
                await loadScript("../js/modules/proteksi-engine.js");
                await loadScript("../js/modules/proteksi-daily-bridge.js");
                await loadScript("../js/modules/proteksi-card.js");
                await loadScript("../js/modules/proteksi-card-click-hint.js");
                await loadScript("../js/modules/tabel-harian-negative-values.js");
                await loadScript("../js/modules/share-cukur-card.js");
                await loadScript("../js/modules/share-cukur-popup-ui.js");
                await loadScript("../js/modules/share-cukur-provider-click-fix.js");
                await loadScript("../js/modules/tabel-harian-row-focus.js");

                // BRI Daily dipasang dengan fallback timer supaya pasti nempel
                // walau event components-ready lewat terlalu cepat.
                setTimeout(async () => {
                    try{
                        await loadScript("../js/modules/bri-merchant-daily.js");
                        await loadScript("../js/modules/tabel-harian-bri-merchant.js");
                    }catch(err){
                        console.error("BRI Merchant Daily helper gagal dimuat:", err);
                    }
                }, 500);
                return;
            }

            if(path.endsWith("/setoran-3-harian.html")){
                await loadScript("../js/modules/bri-merchant-daily.js");
                await loadScript("../js/modules/setoran-bri-daily-bridge.js");
                return;
            }

            if(path.endsWith("/laporan-bulanan-investor.html")){
                /* Real PDF helper owns the WhatsApp button. Do not load the legacy popup/print helper here. */
                await loadScript("../js/modules/laporan-bulanan-investor-pdf-download.js");
            }
        }catch(err){
            console.error("ERP helper autoload gagal:", err);
        }
    }, { once: true });
})();