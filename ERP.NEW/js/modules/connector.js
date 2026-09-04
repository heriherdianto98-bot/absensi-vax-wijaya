/*
=========================================
VAX ERP
Supabase Connector
=========================================
*/

const SUPABASE_URL =
"https://cmtuufwzjshixivykbjf.supabase.co";

const SUPABASE_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdHV1Znd6anNoaXhpdnlrYmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzk4MDksImV4cCI6MjEwMDc1NTgwOX0.QzfAecp9A6qxJdpE_1WH93T6--hXiqudMVUyfedLh2Q"

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

/* Tabel Harian only: autoload Proteksi canonical UI without touching money logic. */
(function(){
    const path = String(window.location.pathname || "").toLowerCase();
    if(!path.endsWith("/tabel-harian-cabang.html")) return;

    const loadScript = (src) => new Promise((resolve, reject) => {
        if(document.querySelector(`script[data-vax-src="${src}"]`)){
            resolve();
            return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.dataset.vaxSrc = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });

    window.addEventListener("DOMContentLoaded", async () => {
        try{
            await loadScript("../js/modules/proteksi-engine.js");
            await loadScript("../js/modules/proteksi-daily-bridge.js");
            await loadScript("../js/modules/proteksi-card.js");
        }catch(err){
            console.error("Proteksi autoload gagal:", err);
        }
    }, { once: true });
})();
