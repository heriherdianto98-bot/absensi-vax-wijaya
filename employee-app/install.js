(() => {
  'use strict';
  const button = document.getElementById('installButton');
  const hint = document.getElementById('installHint');
  const status = document.getElementById('installStatus');
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/employee-app/sw.js', { scope: '/employee-app/' })
      .catch(() => { /* Installation can still work without offline shell. */ });
  }

  if (standalone) {
    status.textContent = 'Membuka portal…';
    fetch('/dashboard-karyawan.html', { method: 'HEAD', cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('Portal belum tersedia');
        window.location.replace('/dashboard-karyawan.html');
      })
      .catch(() => {
        status.textContent = 'Koneksi diperlukan untuk membuka data karyawan.';
      });
    return;
  }

  let prompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    button.hidden = false;
    hint.textContent = 'Pasang aplikasi agar portal terbuka tanpa bilah alamat browser.';
  });
  button.addEventListener('click', async () => {
    if (!prompt) return;
    const pending = prompt;
    prompt = null;
    button.hidden = true;
    await pending.prompt();
    const choice = await pending.userChoice;
    status.textContent = choice.outcome === 'accepted'
      ? 'Pemasangan diproses oleh Chrome.'
      : 'Pemasangan dibatalkan.';
  });
  window.addEventListener('appinstalled', () => {
    button.hidden = true;
    status.textContent = 'Aplikasi terpasang. Buka dari layar utama HP.';
  });
})();
