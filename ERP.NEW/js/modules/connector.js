/*
=========================================
VAX ERP
Supabase Connector
=========================================
*/

const SUPABASE_URL =
"https://cmtuufwzjshixivykbjf.supabase.co";

const SUPABASE_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJjbXR1dWZ3empzaGl4aXZ5a2JqZiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzg1MTc5ODA5LCJleHAiOjIxMDA3NTU4MDl9.QzfAecp9A6qxJdpE_1WH93T6--hXiqudMVUyfedLh2Q";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

/* Tabel Harian only: autoload Proteksi canonical UI without touching money logic. */
(function(){
    const path = String(window.location.pathname || "").toLowerCase();
    if(!path.endsWith("/tabel-harian-cabang.html")) return;

    const PROTEKSI_ASSET_VERSION = "20260905-proteksi3";
    const loadScript = (src) => new Promise((resolve, reject) => {
        const key = `${src}?v=${PROTEKSI_ASSET_VERSION}`;
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
            await loadScript("../js/modules/proteksi-engine.js");
            await loadScript("../js/modules/proteksi-daily-bridge.js");
            await loadScript("../js/modules/proteksi-card.js");
            await loadScript("../js/modules/proteksi-card-click-hint.js");
        }catch(err){
            console.error("Proteksi autoload gagal:", err);
        }
    }, { once: true });
})();
