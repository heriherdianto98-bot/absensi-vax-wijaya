/* Dashboard Karyawan: themed calendar UI. The existing date input change handler remains the sole KPI data path. */
(() => {
  'use strict';
  const toolbar = document.querySelector('.employee-date-toolbar');
  const trigger = toolbar?.querySelector('.date-toolbar-button');
  const input = toolbar?.querySelector('#employeeDatePicker');
  if (!toolbar || !trigger || !input) return;
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayWib = () => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const selected = () => input.value || todayWib();
  let year = Number(selected().slice(0, 4));
  let month = Number(selected().slice(5, 7)) - 1;
  const popup = document.createElement('section');
  popup.className = 'vax-calendar';
  popup.id = 'vaxEmployeeCalendar';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Pilih tanggal Dashboard');
  popup.hidden = true;
  popup.innerHTML = '<div class="vax-calendar-head"><button type="button" class="vax-calendar-prev" aria-label="Bulan sebelumnya"><i class="fa-solid fa-chevron-left"></i></button><span class="vax-calendar-title"></span><button type="button" class="vax-calendar-next" aria-label="Bulan berikutnya"><i class="fa-solid fa-chevron-right"></i></button></div><div class="vax-calendar-week" aria-hidden="true"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div><div class="vax-calendar-days" role="group" aria-label="Tanggal"></div><div class="vax-calendar-foot"><button type="button" class="vax-calendar-today">Hari ini</button><button type="button" class="vax-calendar-close">Tutup</button></div>';
  toolbar.appendChild(popup);
  const title = popup.querySelector('.vax-calendar-title');
  const days = popup.querySelector('.vax-calendar-days');
  const prev = popup.querySelector('.vax-calendar-prev');
  const next = popup.querySelector('.vax-calendar-next');
  const monthName = (y, m) => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, 1)));
  const close = () => { popup.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  function render() {
    const max = todayWib();
    title.textContent = monthName(year, month);
    next.disabled = iso(year, month, 1).slice(0, 7) >= max.slice(0, 7);
    days.replaceChildren();
    const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let n = 0; n < offset; n++) {
      const blank = document.createElement('span'); blank.className = 'vax-calendar-blank'; days.appendChild(blank);
    }
    for (let day = 1; day <= length; day++) {
      const value = iso(year, month, day);
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'vax-calendar-day';
      cell.textContent = String(day); cell.disabled = value > max;
      cell.setAttribute('aria-label', `${day} ${monthName(year, month)}`);
      if (value === selected()) { cell.classList.add('is-selected'); cell.setAttribute('aria-pressed', 'true'); }
      if (value === max) cell.classList.add('is-today');
      cell.addEventListener('click', () => choose(value));
      days.appendChild(cell);
    }
  }
  function choose(value) {
    if (value > todayWib()) return;
    input.value = value;
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  /* Capture phase prevents the old native showPicker handler from opening a browser-controlled gray picker. */
  trigger.addEventListener('click', event => {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!popup.hidden) { close(); return; }
    year = Number(selected().slice(0, 4)); month = Number(selected().slice(5, 7)) - 1;
    render(); popup.hidden = false; trigger.setAttribute('aria-expanded', 'true');
  }, true);
  prev.addEventListener('click', () => { if (--month < 0) { month = 11; --year; } render(); });
  next.addEventListener('click', () => { if (next.disabled) return; if (++month > 11) { month = 0; ++year; } render(); });
  popup.querySelector('.vax-calendar-today').addEventListener('click', () => choose(todayWib()));
  popup.querySelector('.vax-calendar-close').addEventListener('click', close);
  document.addEventListener('pointerdown', event => { if (!popup.hidden && !toolbar.contains(event.target) ) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popup.hidden) { close(); trigger.focus(); } });
  trigger.setAttribute('aria-controls', popup.id);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
})();