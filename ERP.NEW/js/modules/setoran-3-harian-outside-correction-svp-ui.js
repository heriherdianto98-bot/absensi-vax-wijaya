/* ERP VAX — SVP correction compatibility shim.
   Stable baseline: tidak ada ikon buku merah / blink / popup decorator tambahan.
   Koreksi tetap ditangani modul setoran-3-harian-outside-correction.js melalui kolom KOREKSI.
   Tidak mengubah DailyDataEngine, SetoranMoneyEngine, rumus canonical, Cash Aktual,
   atau engine finance yang LOCK. */
"use strict";
(function bootOutsideCorrectionSvpUi(){
  if(typeof SetoranDirectFlow==="undefined"){
    setTimeout(bootOutsideCorrectionSvpUi,80);
    return;
  }
  const flow=SetoranDirectFlow;
  if(flow.__outsideCorrectionSvpUiInstalled) return;
  flow.__outsideCorrectionSvpUiInstalled=true;

  /* Sengaja tidak menambah handler klik, observer, query proof, class blink,
     atau dekorasi popup. Ikon Biaya di luar Cashout kembali ke tampilan normal.
     Aksi KIRIM ULANG tetap berasal dari modul koreksi utama. */
})();
