/* Employee Dashboard motivation/typing presentation layer.
   UI-only: preserves canonical employee/branch values and reads existing DOM output. */
(() => {
  'use strict';

  const QUOTES = [
    "Omzet stabil adalah pondasi. Naik kelas dimulai dari perbaikan kecil yang konsisten.",
    "Stabil itu aman, tapi jangan terlena. Cari satu peluang kecil untuk tumbuh hari ini.",
    "Angka relatif stabil. Pertahankan yang baik, eksperimen kecil pada yang masih lemah.",
    "Konsisten lebih berharga daripada ramai sesaat. Sekarang cari cara naik satu tingkat.",
    "Omzet stabil berarti mesin berjalan. Tugas berikutnya membuat mesin itu makin efisien.",
    "Stabil bukan berarti diam. Sedikit lebih ramah, cepat, dan rapi bisa mengubah hasil.",
    "Hari yang stabil adalah kesempatan memperkuat standar sebelum mengejar pertumbuhan.",
    "Angka tenang, kepala juga harus tenang. Evaluasi kecil hari ini bisa jadi lompatan besok.",
    "Stabil berarti ada dasar yang bisa dipercaya. Bangun pertumbuhan dari dasar itu.",
    "Jaga ritme saat stabil. Banyak bisnis jatuh bukan saat sepi, tapi saat mulai lengah.",
    "Hasil konsisten adalah modal. Gunakan modal itu untuk memperbaiki detail yang sering diabaikan.",
    "Omzet belum banyak berubah. Tidak masalah—pastikan kualitas terus bergerak naik.",
    "Stabil hari ini, lebih baik besok. Fokus pada pelayanan yang membuat customer ingin kembali.",
    "Bisnis yang sehat tidak harus heboh setiap hari. Yang penting terukur dan terus membaik.",
    "Saat angka stabil, disiplinlah yang membedakan bertahan dengan berkembang.",
    "Bisnis besar dibangun dari keputusan kecil yang benar, dilakukan terus-menerus.",
    "Disiplin mengalahkan semangat yang hanya datang sesekali.",
    "Yang bisa diukur bisa diperbaiki; yang diperbaiki terus akan bertumbuh.",
    "Pelayanan yang baik hari ini adalah promosi gratis untuk hari esok.",
    "Jangan hanya mengejar ramai. Bangun alasan agar customer ingin kembali.",
    "Kecepatan penting, tetapi ketelitian membuat usaha bertahan lama.",
    "Usaha yang sehat tumbuh dari data yang benar dan keputusan yang tenang.",
    "Konsistensi tidak selalu terlihat keren, tapi hasilnya selalu terasa.",
    "Setiap customer adalah kesempatan membangun reputasi, bukan sekadar satu transaksi.",
    "Hari ini mungkin biasa saja, tapi kebiasaan baik hari ini membentuk hasil luar biasa.",
    "Fokus pada proses yang bisa dikendalikan; hasil akan mengikuti kualitas prosesnya.",
    "Jangan menunggu kondisi sempurna. Perbaiki yang ada, satu langkah setiap hari.",
    "Tim yang kuat bukan yang tak pernah salah, tapi yang cepat belajar dan tidak mengulanginya.",
    "Keuntungan adalah hasil. Kepercayaan customer adalah aset yang membuat hasil itu berulang.",
    "Kerjakan yang penting dengan rapi. Bisnis menghargai konsistensi lebih dari kesibukan."
  ];

  const wibParts = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => Number(parts.find(p => p.type === type)?.value || 0);
    return { year:get('year'), month:get('month'), day:get('day') };
  };

  const dailyQuote = () => {
    const { year, month, day } = wibParts();
    const utc = Date.UTC(year, month - 1, day);
    const start = Date.UTC(year, 0, 1);
    const dayOfYear = Math.floor((utc - start) / 86400000);
    return QUOTES[((dayOfYear % QUOTES.length) + QUOTES.length) % QUOTES.length];
  };

  const setupGreeting = () => {
    const title = document.getElementById('greetingTitle');
    const source = document.getElementById('greetingMessage');
    if (!title || !source) return;
    let motivation = title.parentElement?.querySelector('.employee-greeting-motivation');
    if (!motivation) {
      motivation = document.createElement('span');
      motivation.className = 'employee-greeting-motivation';
      title.insertAdjacentElement('afterend', motivation);
    }
    const sync = () => {
      motivation.textContent = String(source.textContent || '').trim() || 'Tetap semangat memberikan pelayanan terbaik hari ini.';
    };
    sync();
    new MutationObserver(sync).observe(source, { childList:true, subtree:true, characterData:true });
  };

  const setupNameTyping = () => {
    const name = document.getElementById('namaKaryawan');
    if (!name) return;
    let timer = 0;
    let lastSource = '';
    const run = () => {
      const source = String(name.textContent || '').trim();
      if (!source || source === 'Loading...') return;
      if (source !== lastSource) lastSource = source;
      window.clearTimeout(timer);
      let i = 0;
      let deleting = false;
      const tick = () => {
        if (!lastSource) return;
        if (!deleting) {
          i = Math.min(lastSource.length, i + 1);
          name.dataset.typingName = lastSource.slice(0, i);
          name.style.setProperty('--employee-name-chars', String(i));
          if (i >= lastSource.length) {
            deleting = true;
            timer = window.setTimeout(tick, 2100);
            return;
          }
          timer = window.setTimeout(tick, 105);
        } else {
          i = Math.max(0, i - 1);
          name.dataset.typingName = lastSource.slice(0, i);
          name.style.setProperty('--employee-name-chars', String(i));
          if (i <= 0) {
            deleting = false;
            timer = window.setTimeout(tick, 520);
            return;
          }
          timer = window.setTimeout(tick, 62);
        }
      };
      tick();
    };
    run();
    new MutationObserver(() => {
      const current = String(name.textContent || '').trim();
      if (current && current !== lastSource) run();
    }).observe(name, { childList:true, subtree:true, characterData:true });
  };

  const setupBranchQuote = () => {
    const branch = document.querySelector('.profile-card:not(.tutup-ops-banner) .profile-branch');
    if (!branch) return;
    const source = branch.querySelector(':scope > div');
    if (!source) return;
    source.classList.add('employee-branch-source');

    const quote = document.createElement('div');
    quote.className = 'employee-branch-quote';
    quote.innerHTML = '<span class="employee-branch-quote-label">SEMANGAT HARI INI</span><span class="employee-branch-quote-text"></span>';
    quote.querySelector('.employee-branch-quote-text').textContent = dailyQuote();
    branch.appendChild(quote);

    /* UI only: panel ini hanya bergantian antara alamat dan kata bijak.
       Provider/Last Sync tetap berada di panel terpisah di luar profile-branch. */
    let state = 0; // 0=alamat, 1=motivasi
    const applyState = () => {
      branch.classList.toggle('is-quote', state === 1);
      branch.classList.remove('is-sync');
    };
    const swap = () => {
      branch.classList.add('is-changing');
      window.setTimeout(() => {
        state = (state + 1) % 2;
        applyState();
        branch.classList.remove('is-changing');
      }, 220);
    };
    applyState();
    window.setInterval(swap, 6000);
  };

  const init = () => {
    setupGreeting();
    setupNameTyping();
    setupBranchQuote();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
