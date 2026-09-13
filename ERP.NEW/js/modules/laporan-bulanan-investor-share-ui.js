"use strict";

/* Laporan Bulanan — Pembagian Investor presenter. UI ONLY. */
(() => {
  const money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));

  function render(report){
    const host=document.getElementById("lbInvestorLines");
    const inv=report?.investor;
    if(!host||!inv?.nama) return;

    host.innerHTML=`
      <div class="lb-line"><span>Investor</span><strong>${esc(inv.nama)}</strong></div>
      <div class="lb-line"><span>Laba Bersih</span><strong>${money(report?.laba?.labaBersih)}</strong></div>
      <div class="lb-line"><span>Nett Produk</span><strong>${money(inv.nettProduk)}</strong></div>
      <div class="lb-line"><span>Modal Produk (${Number(inv.modalProdukRate||60)}% × Nett Produk)</span><strong>${money(inv.modalProduk)}</strong></div>
      <div class="lb-line total"><span>Laba Dasar Pembagian</span><strong>${money(inv.labaDasarPembagian)}</strong></div>
      <div class="lb-line"><span>Porsi Investor</span><strong>${Number(inv.porsiInvestor||0)}%</strong></div>
      <div class="lb-line"><span>Nilai Investor</span><strong>${money(inv.nilaiInvestor)}</strong></div>
      <div class="lb-line"><span>Porsi Manajemen</span><strong>${Number(inv.porsiManajemen||0)}%</strong></div>
      <div class="lb-line"><span>Nilai Manajemen</span><strong>${money(inv.nilaiManajemen)}</strong></div>
      <div class="lb-line"><span>Sewa Dibayar</span><strong>${money(inv.sewaDibayar)}</strong></div>
      <div class="lb-line total"><span>Total Hak Investor</span><strong>${money(inv.totalHakBulanIni)}</strong></div>`;
  }

  function boot(){
    document.addEventListener("laporan-bulanan:investor-share",e=>render(e.detail));
    setTimeout(()=>render(window.LaporanBulananInvestorShareBridge?.lastReport),300);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
