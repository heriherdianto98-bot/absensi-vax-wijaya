/*
=========================================================
VAX ERP
Dashboard Sprint 2 - Integrasi Dashboard Engine V2
=========================================================
Tanggung jawab:
- Memanggil DashboardEngine.load()
- Subscribe ke event DashboardEngine (loading/calculated/error)
- Render KPI, Executive Summary, Payment Summary,
  Chart, Ranking, Live Activity dari data Engine
=========================================================
*/

const DASHBOARD_FILTER_KEY = "erp.dashboard.filters";
const CUSTOM_PERIOD_COMMAND = "customtanggal";
const CUSTOM_PERIOD_ACTIVE = "custom-active";
const ID_MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
let _dashboardPrevPeriod = "hariini";
let _calViewYear = null;
let _calViewMonth = null; // 0-11
let _calPickStart = null;
let _calPickEnd = null;
let _calMode = "range"; // 'range' | 'month'
/** Canonical Pilih Bulan state — ONLY source for month apply (1–12, never 0-based). */
let _monthPickYear = null;
let _monthPickMonth = null; // 1-12
/** Canonical active custom period label shown in Periode control (not the command option). */
let _customActiveLabel = null;
let _calEscBound = false;
let _execAiEscBound = false;
let _lastExecAiInsight = null;
let _aiMultiPeriod = null;
let _aiMultiPeriodKey = null;
let _aiMultiPeriodSeq = 0;
let _toolbarEventsBound = false;
let _syncStatusRow = null;
let _syncHealthTimer = null;
let _syncHealthTimerMs = 0;
let _syncHealthUiBound = false;
let _syncHealthMonitorBound = false;
const SYNC_HEALTH_FRESH_MIN = 8;
const SYNC_HEALTH_STALE_MIN = 15;
const SYNC_HEALTH_IDLE_MS = 60000;
const SYNC_HEALTH_ACTIVE_MS = 20000;

document.addEventListener("DOMContentLoaded", () => {

    DashboardEngine.subscribe(handleEngineEvent);

    document.addEventListener(
        "erp:components-ready",
        () => {
            // Toolbar HTML exists only after async loadComponent — bind here.
            resetDashboardChromeOverlays();
            bindToolbarEvents();
            restoreDashboardFilters();
            showCustomPeriodPanel(false);
            Promise.all([
                loadSyncStatusForToolbar(),
                loadDashboardFromToolbar()
            ]).then(() => {
                renderToolbarSyncStatus();
                startSyncHealthMonitor();
            });
        },
        { once: true }
    );

});


/* ================= EVENT ENGINE ================= */

function handleEngineEvent(event, payload){

    if(event==="loading"){
        setLoadingState(payload);
    }

    if(event==="calculated"){
        renderDashboard();
    }

    if(event==="error"){
        showDashboardError(payload);
    }

}


function setLoadingState(isLoading){
    document.body.classList.toggle("dashboard-loading", Boolean(isLoading));
    if(!isLoading){
        document.body.classList.remove("dashboard-loading");
    }
}


function showDashboardError(message){
    console.error("Dashboard Engine Error:", message);
}


/** Clear stuck page dimmers that must never survive a normal dashboard paint. */
function resetDashboardChromeOverlays(){
    document.body.classList.remove(
        "owner-auth-pending",
        "dashboard-loading",
        "erp-drawer-open"
    );

    const sidebar = document.querySelector(".sidebar");
    sidebar?.classList.remove("is-mobile-open");

    const bd = document.getElementById("erpSidebarBackdrop");
    if(bd){
        bd.style.removeProperty("display");
        bd.style.removeProperty("opacity");
        bd.style.removeProperty("pointer-events");
        bd.setAttribute("aria-hidden", "true");
    }

    showCustomPeriodPanel(false);
}


/* ================= TOOLBAR (FILTER + REFRESH) ================= */

function bindToolbarEvents(){
    if(_toolbarEventsBound) return;
    _toolbarEventsBound = true;

    document.addEventListener("change", (e) => {

        if(e.target.id === "branchFilter"){
            persistDashboardFilters();
            loadDashboardFromToolbar();
            return;
        }

        if(e.target.id !== "periodFilter"){
            return;
        }

        const periodFilter = e.target;
        const raw = String(periodFilter.value || "");
        const key = normalizePeriodeKey(raw);

        // customtanggal = command/action — always open modal (never stay stuck on same value).
        if(raw === CUSTOM_PERIOD_COMMAND || key === CUSTOM_PERIOD_COMMAND){
            openCustomCalendarModal();
            // Snap control back to active custom label so next "Custom Tanggal" is a real change again.
            // Only when custom is the currently applied period — not leftover dates from an old session.
            if(isCustomPeriodActivelyApplied()){
                syncPeriodControlActiveLabel();
            }
            return;
        }

        // Selecting the active display option itself is a no-op (already applied).
        if(raw === CUSTOM_PERIOD_ACTIVE){
            return;
        }

        _dashboardPrevPeriod = key;
        _customActiveLabel = null;
        clearCustomActiveOption();
        closeCustomCalendarModal(false);
        persistDashboardFilters();
        loadDashboardFromToolbar();

    });

    document.addEventListener("click", async (e) => {

        if(e.target.closest("#btnCustomApply")){
            applyCustomPeriod();
            return;
        }

        if(e.target.closest("#btnCustomCancel") || e.target.closest("[data-cal-close]")){
            cancelCustomPeriod();
            return;
        }

        const modeTab = e.target.closest("[data-cal-mode]");
        if(modeTab){
            setCustomCalMode(modeTab.getAttribute("data-cal-mode"));
            return;
        }

        if(e.target.closest("#btnCalPrev")){
            shiftCalendarMonth(-1);
            return;
        }

        if(e.target.closest("#btnCalNext")){
            shiftCalendarMonth(1);
            return;
        }

        if(e.target.closest("#btnMonthYearPrev")){
            shiftMonthPickerYear(-1);
            return;
        }

        if(e.target.closest("#btnMonthYearNext")){
            shiftMonthPickerYear(1);
            return;
        }

        const monthBtn = e.target.closest("[data-cal-month]");
        if(monthBtn){
            onMonthPickerClick(Number(monthBtn.getAttribute("data-cal-month")));
            return;
        }

        const dayBtn = e.target.closest("[data-cal-day]");
        if(dayBtn){
            onCalendarDayClick(dayBtn.getAttribute("data-cal-day"));
            return;
        }

        if(e.target.closest("#btnExecAiDetail")){
            openExecutiveAiDetail();
            return;
        }

        if(e.target.closest("#execAiInsightModal [data-ai-close]")){
            closeExecutiveAiDetail();
            return;
        }

        const btnRefresh = e.target.closest("#btnRefresh");
        if(btnRefresh){
            e.preventDefault();
            await refreshDashboardData(btnRefresh);
            return;
        }

        // VPS auto-sync (PM2) menulis ke Supabase — tombol ini hanya reload data terbaru.
        // Tidak memanggil /api/sync HTTP (eksperimen Direct VPS API dibatalkan).
        const btnSync = e.target.closest("#btnSync");
        if(btnSync){
            e.preventDefault();
            await refreshDashboardData(btnSync);
        }

    });

    if(!_calEscBound){
        _calEscBound = true;
        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && isCustomCalendarOpen()){
                cancelCustomPeriod();
            }
        });
    }

    if(!_execAiEscBound){
        _execAiEscBound = true;
        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && isExecutiveAiDetailOpen()){
                closeExecutiveAiDetail();
            }
        });
    }

}


function isCustomCalendarOpen(){
    const modal = document.getElementById("customPeriodModal");
    return Boolean(modal && !modal.hidden);
}


function showCustomPeriodPanel(show){
    // Compat: panel lama diganti modal kalender.
    if(show) openCustomCalendarModal();
    else closeCustomCalendarModal(false);
}


function openCustomCalendarModal(){
    const modal = document.getElementById("customPeriodModal");
    if(!modal) return;

    const today = DashboardEngine.getJakartaToday();
    const start = DashboardEngine.lastCustomStart
        || document.getElementById("customStartDate")?.value
        || today;
    const end = DashboardEngine.lastCustomEnd
        || document.getElementById("customEndDate")?.value
        || start;

    _calPickStart = start || null;
    _calPickEnd = (_calPickStart && end && end >= _calPickStart) ? end : null;

    const seed = _calPickStart || today;
    _calViewYear = Number(seed.slice(0, 4));
    _calViewMonth = Number(seed.slice(5, 7)) - 1;

    // Restore canonical month/year — prefer persisted customMonth/customYear, never stale day-range.
    const persisted = (() => {
        try{ return JSON.parse(localStorage.getItem(DASHBOARD_FILTER_KEY) || "null"); }
        catch(_e){ return null; }
    })();
    const persistedMonth = Number(persisted?.customMonth);
    const persistedYear = Number(persisted?.customYear);
    const fromFullMonth = (_calPickStart && _calPickEnd
        && typeof DashboardEngine.isFullCalendarMonth === "function"
        && DashboardEngine.isFullCalendarMonth(_calPickStart, _calPickEnd))
        ? {
            year: Number(_calPickStart.slice(0, 4)),
            month: Number(_calPickStart.slice(5, 7))
        }
        : null;

    if(persistedYear >= 2000 && persistedYear <= 2100
        && persistedMonth >= 1 && persistedMonth <= 12
        && (persisted?.customMode === "month" || DashboardEngine.lastCustomMode === "month")){
        _monthPickYear = persistedYear;
        _monthPickMonth = persistedMonth;
    }else if(fromFullMonth){
        _monthPickYear = fromFullMonth.year;
        _monthPickMonth = fromFullMonth.month;
    }else{
        _monthPickYear = Number(seed.slice(0, 4)) || Number(today.slice(0, 4));
        _monthPickMonth = null; // force explicit pick — jangan warisi rentang/hari lain
    }

    // Owner UX: default Pilih Bulan; restore Rentang only if last custom mode was range.
    const savedMode = document.getElementById("customPeriodMode")?.value
        || DashboardEngine.lastCustomMode
        || persisted?.customMode
        || "month";
    const preferMonth = savedMode !== "range";

    modal.hidden = false;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("custom-cal-open");
    document.body.classList.remove("owner-auth-pending", "erp-drawer-open");

    setCustomCalMode(preferMonth ? "month" : "range", { silent: true });
    renderCustomCalendar();
    renderMonthPicker();
    syncCalendarPreview();
}


function closeCustomCalendarModal(restorePeriod){
    const modal = document.getElementById("customPeriodModal");
    if(modal){
        modal.hidden = true;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("custom-cal-open");

    // Pastikan tidak ada scrim/dim tertinggal.
    const bd = document.getElementById("erpSidebarBackdrop");
    if(bd){
        bd.style.removeProperty("display");
        bd.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("erp-drawer-open", "owner-auth-pending");

    if(restorePeriod){
        restorePeriodControlAfterCustomCancel();
    }
}


function shiftCalendarMonth(delta){
    if(_calViewYear == null || _calViewMonth == null) return;
    const d = new Date(Date.UTC(_calViewYear, _calViewMonth + delta, 1));
    _calViewYear = d.getUTCFullYear();
    _calViewMonth = d.getUTCMonth();
    renderCustomCalendar();
}


function onCalendarDayClick(iso){
    if(!iso) return;
    if(!_calPickStart || (_calPickStart && _calPickEnd)){
        _calPickStart = iso;
        _calPickEnd = null;
    }else if(iso < _calPickStart){
        _calPickEnd = _calPickStart;
        _calPickStart = iso;
    }else{
        _calPickEnd = iso;
    }
    syncCalendarHiddenInputs();
    renderCustomCalendar();
    syncCalendarPreview();
}


function syncCalendarHiddenInputs(){
    const startEl = document.getElementById("customStartDate");
    const endEl = document.getElementById("customEndDate");
    const modeEl = document.getElementById("customPeriodMode");
    if(startEl) startEl.value = _calPickStart || "";
    if(endEl) endEl.value = _calPickEnd || "";
    if(modeEl) modeEl.value = _calMode || "range";
}


function setCustomCalMode(mode, opts = {}){
    const next = mode === "month" ? "month" : "range";
    _calMode = next;

    document.querySelectorAll("[data-cal-mode]").forEach((btn) => {
        const active = btn.getAttribute("data-cal-mode") === next;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    const rangePane = document.getElementById("customCalRangePane");
    const monthPane = document.getElementById("customCalMonthPane");
    if(rangePane){
        rangePane.hidden = next !== "range";
        rangePane.classList.toggle("is-active", next === "range");
    }
    if(monthPane){
        monthPane.hidden = next !== "month";
        monthPane.classList.toggle("is-active", next === "month");
    }

    const modeEl = document.getElementById("customPeriodMode");
    if(modeEl) modeEl.value = next;

    if(next === "month"){
        if(_monthPickYear == null){
            const today = DashboardEngine.getJakartaToday();
            _monthPickYear = Number((_calPickStart || today).slice(0, 4));
        }
        if(_monthPickMonth == null && _calPickStart && _calPickEnd
            && typeof DashboardEngine.isFullCalendarMonth === "function"
            && DashboardEngine.isFullCalendarMonth(_calPickStart, _calPickEnd)){
            _monthPickMonth = Number(_calPickStart.slice(5, 7));
        }
        if(_monthPickMonth != null){
            applyMonthPickToRange(_monthPickYear, _monthPickMonth, { previewOnly: true });
        }
        renderMonthPicker();
    }else{
        renderCustomCalendar();
    }

    if(!opts.silent) syncCalendarPreview();
    else syncCalendarPreview();
}


function shiftMonthPickerYear(delta){
    if(_monthPickYear == null) return;
    _monthPickYear += delta;
    // Keep canonical month range in sync with visible year (jangan biarkan preview/apply beda).
    if(_monthPickMonth >= 1 && _monthPickMonth <= 12){
        applyMonthPickToRange(_monthPickYear, _monthPickMonth, { previewOnly: true });
    }
    renderMonthPicker();
    syncCalendarPreview();
}


function onMonthPickerClick(monthNum){
    const m = Number(monthNum);
    if(!m || m < 1 || m > 12 || _monthPickYear == null) return;
    _monthPickMonth = m;
    applyMonthPickToRange(_monthPickYear, m, { previewOnly: true });
    renderMonthPicker();
    syncCalendarPreview();
}


/**
 * ONE canonical month/year — prefer visible UI selection, then memory.
 * Month is ALWAYS 1–12 (Januari=1 … Desember=12). Never 0-based.
 */
function getCanonicalMonthSelection(){
    let year = Number(_monthPickYear);
    let month = Number(_monthPickMonth);

    const yearLabel = document.getElementById("calMonthYearLabel")?.textContent?.trim();
    if(yearLabel && /^\d{4}$/.test(yearLabel)){
        year = Number(yearLabel);
    }

    const selectedBtn = document.querySelector("#calMonthGrid .cal-month-btn.is-selected[data-cal-month]");
    if(selectedBtn){
        const dm = Number(selectedBtn.getAttribute("data-cal-month"));
        if(dm >= 1 && dm <= 12) month = dm;
    }

    if(!(year >= 2000 && year <= 2100)) return null;
    if(!(month >= 1 && month <= 12)) return null;
    return { year, month };
}


/** Build full calendar month range from 1-based month. */
function applyMonthPickToRange(year, month, opts = {}){
    const y = Number(year);
    const m = Number(month); // 1-12
    if(!(y >= 2000 && y <= 2100) || !(m >= 1 && m <= 12)) return null;

    // Date.UTC monthIndex is 0-based: day 0 of (m) = last day of calendar month m.
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    const dd = String(lastDay).padStart(2, "0");
    const start = `${y}-${mm}-01`;
    const end = `${y}-${mm}-${dd}`;

    _monthPickYear = y;
    _monthPickMonth = m;
    _calPickStart = start;
    _calPickEnd = end;
    syncCalendarHiddenInputs();
    return { start, end, year: y, month: m };
}


function renderMonthPicker(){
    const grid = document.getElementById("calMonthGrid");
    const label = document.getElementById("calMonthYearLabel");
    if(!grid || _monthPickYear == null) return;

    if(label) label.textContent = String(_monthPickYear);

    const today = DashboardEngine.getJakartaToday();
    const curY = Number(today.slice(0, 4));
    const curM = Number(today.slice(5, 7));

    let html = "";
    for(let m = 1; m <= 12; m++){
        const classes = ["cal-month-btn"];
        if(_monthPickMonth === m) classes.push("is-selected");
        if(curY === _monthPickYear && curM === m) classes.push("is-current");
        html += `<button type="button" class="${classes.join(" ")}" data-cal-month="${m}" role="option" aria-selected="${_monthPickMonth === m ? "true" : "false"}">${ID_MONTH_NAMES[m - 1]}</button>`;
    }
    grid.innerHTML = html;
}


function syncCalendarPreview(){
    const preview = document.getElementById("calRangePreview");
    const applyBtn = document.getElementById("btnCustomApply");

    let valid = false;
    if(_calMode === "month"){
        const sel = getCanonicalMonthSelection();
        valid = Boolean(sel);
        if(preview){
            preview.textContent = sel
                ? `${ID_MONTH_NAMES[sel.month - 1]} ${sel.year}`
                : "Pilih bulan dan tahun";
        }
        // Keep hidden inputs aligned with visible selection (prevent stale March etc).
        if(sel){
            applyMonthPickToRange(sel.year, sel.month, { previewOnly: true });
        }
    }else{
        valid = Boolean(_calPickStart && _calPickEnd && _calPickEnd >= _calPickStart);
        if(preview){
            if(_calPickStart && _calPickEnd){
                preview.textContent = `${formatDisplayDateId(_calPickStart)} — ${formatDisplayDateId(_calPickEnd)}`;
            }else if(_calPickStart){
                preview.textContent = `${formatDisplayDateId(_calPickStart)} — pilih tanggal akhir`;
            }else{
                preview.textContent = "Pilih tanggal mulai, lalu tanggal akhir";
            }
        }
    }

    if(applyBtn) applyBtn.disabled = !valid;
}


function renderCustomCalendar(){
    const grid = document.getElementById("calDays");
    const label = document.getElementById("calMonthLabel");
    if(!grid || _calViewYear == null || _calViewMonth == null) return;

    const monthNames = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    if(label) label.textContent = `${monthNames[_calViewMonth]} ${_calViewYear}`;

    const today = DashboardEngine.getJakartaToday();
    const first = new Date(Date.UTC(_calViewYear, _calViewMonth, 1));
    // Monday-first: Mon=0 ... Sun=6
    const jsDay = first.getUTCDay(); // Sun=0
    const mondayIndex = (jsDay + 6) % 7;
    const daysInMonth = new Date(Date.UTC(_calViewYear, _calViewMonth + 1, 0)).getUTCDate();

    let html = "";
    for(let i = 0; i < mondayIndex; i++){
        html += `<span class="cal-day is-empty" aria-hidden="true"></span>`;
    }

    for(let day = 1; day <= daysInMonth; day++){
        const iso = `${_calViewYear}-${String(_calViewMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        const classes = ["cal-day"];
        if(iso === today) classes.push("is-today");
        if(_calPickStart && iso === _calPickStart) classes.push("is-start");
        if(_calPickEnd && iso === _calPickEnd) classes.push("is-end");
        if(_calPickStart && _calPickEnd && iso > _calPickStart && iso < _calPickEnd){
            classes.push("is-in-range");
        }
        html += `<button type="button" class="${classes.join(" ")}" data-cal-day="${iso}">${day}</button>`;
    }

    grid.innerHTML = html;
}


function applyCustomPeriod(){
    let start = null;
    let end = null;
    let mode = _calMode === "month" ? "month" : "range";
    let customMonth = null;
    let customYear = null;

    if(mode === "month"){
        // ROOT FIX: apply EXACT visible month/year — never stale _calPickStart / localStorage / today.
        const sel = getCanonicalMonthSelection();
        if(!sel) return;
        const range = applyMonthPickToRange(sel.year, sel.month);
        if(!range) return;
        start = range.start;
        end = range.end;
        customMonth = range.month;
        customYear = range.year;
        mode = "month";
    }else{
        start = _calPickStart || document.getElementById("customStartDate")?.value;
        end = _calPickEnd || document.getElementById("customEndDate")?.value;
        mode = "range";
    }

    if(!start || !end || end < start){
        return;
    }

    const displayLabel = buildCustomPeriodDisplayLabel(start, end, mode, customMonth, customYear);
    DashboardEngine.lastCustomMode = mode;
    DashboardEngine.lastCustomStart = start;
    DashboardEngine.lastCustomEnd = end;
    syncCalendarHiddenInputs();
    setPeriodControlToCustomActive(displayLabel);
    _dashboardPrevPeriod = CUSTOM_PERIOD_ACTIVE;
    persistDashboardFilters({
        periode: CUSTOM_PERIOD_COMMAND,
        customStart: start,
        customEnd: end,
        customMode: mode,
        customMonth: customMonth,
        customYear: customYear,
        displayLabel
    });
    closeCustomCalendarModal(false);
    // Satu load saja — range eksplisit dari bulan/rentang yang terlihat.
    loadDashboardFromToolbar({ start, end, mode });
}


function cancelCustomPeriod(){
    closeCustomCalendarModal(true);
    persistDashboardFilters();

    if(typeof syncHeaderContextFromPage === "function"){
        syncHeaderContextFromPage();
    }
}


/** Human-readable active custom label (month name or date range). */
function buildCustomPeriodDisplayLabel(start, end, mode, month, year){
    const s = String(start || "").slice(0, 10);
    const e = String(end || "").slice(0, 10);
    if(mode === "month"){
        const m = Number(month);
        const y = Number(year);
        if(y >= 2000 && m >= 1 && m <= 12){
            return `${ID_MONTH_NAMES[m - 1]} ${y}`;
        }
        if(s && typeof DashboardEngine.isFullCalendarMonth === "function"
            && DashboardEngine.isFullCalendarMonth(s, e)){
            return formatMonthYearId(s);
        }
    }
    if(s && e && typeof DashboardEngine.isFullCalendarMonth === "function"
        && DashboardEngine.isFullCalendarMonth(s, e)
        && (mode === "month" || mode == null)){
        return formatMonthYearId(s);
    }
    if(s && e) return formatDisplayRange(s, e);
    return "Custom Tanggal";
}


function hasCanonicalCustomRange(){
    const start = document.getElementById("customStartDate")?.value
        || DashboardEngine.lastCustomStart
        || _calPickStart;
    const end = document.getElementById("customEndDate")?.value
        || DashboardEngine.lastCustomEnd
        || _calPickEnd;
    return Boolean(start && end && end >= start);
}


/** True only when custom month/range is the applied active period (not a preset). */
function isCustomPeriodActivelyApplied(){
    if(_customActiveLabel && hasCanonicalCustomRange()) return true;
    const periodFilter = document.getElementById("periodFilter");
    if(periodFilter?.value === CUSTOM_PERIOD_ACTIVE && hasCanonicalCustomRange()) return true;
    if(typeof DashboardEngine !== "undefined"
        && normalizePeriodeKey(DashboardEngine.lastPeriode) === CUSTOM_PERIOD_COMMAND
        && hasCanonicalCustomRange()){
        return true;
    }
    return false;
}


function getCanonicalCustomDisplayLabel(){
    if(_customActiveLabel) return _customActiveLabel;
    const start = document.getElementById("customStartDate")?.value
        || DashboardEngine.lastCustomStart
        || DashboardEngine.lastRange?.start;
    const end = document.getElementById("customEndDate")?.value
        || DashboardEngine.lastCustomEnd
        || DashboardEngine.lastRange?.end;
    if(!start || !end) return null;
    const mode = document.getElementById("customPeriodMode")?.value
        || DashboardEngine.lastCustomMode
        || (_monthPickMonth != null ? "month" : "range");
    const month = _monthPickMonth
        || (mode === "month" ? Number(String(start).slice(5, 7)) : null);
    const year = _monthPickYear
        || (mode === "month" ? Number(String(start).slice(0, 4)) : null);
    return buildCustomPeriodDisplayLabel(start, end, mode, month, year);
}


function ensureCustomActiveOption(label){
    const periodFilter = document.getElementById("periodFilter");
    if(!periodFilter || !label) return null;
    let opt = periodFilter.querySelector(`option[value="${CUSTOM_PERIOD_ACTIVE}"]`);
    if(!opt){
        opt = document.createElement("option");
        opt.value = CUSTOM_PERIOD_ACTIVE;
        // Place just before command option so closed control shows active label;
        // "Custom Tanggal" remains a separate selectable action.
        const cmd = periodFilter.querySelector(`option[value="${CUSTOM_PERIOD_COMMAND}"]`);
        if(cmd) periodFilter.insertBefore(opt, cmd);
        else periodFilter.appendChild(opt);
    }
    opt.textContent = label;
    opt.disabled = false;
    return opt;
}


function clearCustomActiveOption(){
    const periodFilter = document.getElementById("periodFilter");
    const opt = periodFilter?.querySelector(`option[value="${CUSTOM_PERIOD_ACTIVE}"]`);
    if(opt) opt.remove();
    _customActiveLabel = null;
}


function setPeriodControlToCustomActive(label){
    const periodFilter = document.getElementById("periodFilter");
    if(!periodFilter || !label) return;
    _customActiveLabel = label;
    ensureCustomActiveOption(label);
    periodFilter.value = CUSTOM_PERIOD_ACTIVE;
}


function syncPeriodControlActiveLabel(){
    if(!hasCanonicalCustomRange()) return;
    const label = getCanonicalCustomDisplayLabel();
    if(!label) return;
    setPeriodControlToCustomActive(label);
}


function restorePeriodControlAfterCustomCancel(){
    const periodFilter = document.getElementById("periodFilter");
    if(!periodFilter) return;

    if(isCustomPeriodActivelyApplied()){
        syncPeriodControlActiveLabel();
        return;
    }

    clearCustomActiveOption();
    const prev = _dashboardPrevPeriod
        && _dashboardPrevPeriod !== CUSTOM_PERIOD_COMMAND
        && _dashboardPrevPeriod !== CUSTOM_PERIOD_ACTIVE
        ? _dashboardPrevPeriod
        : "hariini";
    const hasOption = [...periodFilter.options].some(o => o.value === prev);
    periodFilter.value = hasOption ? prev : "hariini";
}


function getToolbarBranchValue(){
    const branchFilter = document.getElementById("branchFilter");
    return branchFilter ? branchFilter.value : null;
}


function getToolbarPeriodValue(){
    const periodFilter = document.getElementById("periodFilter");
    const raw = periodFilter ? periodFilter.value : "hariini";
    // custom-active is UI-only; engine always uses customtanggal + canonical range.
    if(raw === CUSTOM_PERIOD_ACTIVE) return CUSTOM_PERIOD_COMMAND;
    return normalizePeriodeKey(raw || "hariini");
}


async function loadDashboardFromToolbar(customRange = null){
    // AI-only: drop previous filter's insight/cache so Prioritas Owner cannot leak.
    invalidateAiMultiPeriodCache();
    _lastExecAiInsight = null;

    const branch = getToolbarBranchValue();
    const periode = getToolbarPeriodValue();

    if(periode === CUSTOM_PERIOD_COMMAND){
        const start = customRange?.start
            || document.getElementById("customStartDate")?.value
            || DashboardEngine.lastCustomStart;
        const end = customRange?.end
            || document.getElementById("customEndDate")?.value
            || DashboardEngine.lastCustomEnd;

        if(!start || !end || end < start){
            // Missing range → open picker; never leave a blank applied custom state.
            showCustomPeriodPanel(true);
            return;
        }

        const mode = customRange?.mode
            || document.getElementById("customPeriodMode")?.value
            || DashboardEngine.lastCustomMode
            || "range";
        // Keep Periode control on human-readable active label during/after load.
        syncPeriodControlActiveLabel();
        await DashboardEngine.load(branch, CUSTOM_PERIOD_COMMAND, { start, end, mode });
        return;
    }

    await DashboardEngine.load(branch, periode);
}


function persistDashboardFilters(override = null){
    try{
        let periode = override?.periode || getToolbarPeriodValue();
        // Never persist UI-only custom-active; store engine key.
        if(periode === CUSTOM_PERIOD_ACTIVE) periode = CUSTOM_PERIOD_COMMAND;

        const mode = override?.customMode
            ?? document.getElementById("customPeriodMode")?.value
            ?? DashboardEngine.lastCustomMode
            ?? "range";
        let customMonth = override?.customMonth ?? null;
        let customYear = override?.customYear ?? null;
        if(mode === "month" && periode === CUSTOM_PERIOD_COMMAND){
            if(!(customMonth >= 1 && customMonth <= 12) || !(customYear >= 2000)){
                const sel = getCanonicalMonthSelection();
                if(sel){
                    customMonth = sel.month;
                    customYear = sel.year;
                }else if(DashboardEngine.lastCustomStart
                    && typeof DashboardEngine.isFullCalendarMonth === "function"
                    && DashboardEngine.isFullCalendarMonth(
                        DashboardEngine.lastCustomStart,
                        DashboardEngine.lastCustomEnd
                    )){
                    customYear = Number(String(DashboardEngine.lastCustomStart).slice(0, 4));
                    customMonth = Number(String(DashboardEngine.lastCustomStart).slice(5, 7));
                }
            }
        }

        const customStart = override?.customStart
            ?? document.getElementById("customStartDate")?.value
            ?? DashboardEngine.lastCustomStart
            ?? null;
        const customEnd = override?.customEnd
            ?? document.getElementById("customEndDate")?.value
            ?? DashboardEngine.lastCustomEnd
            ?? null;

        let displayLabel = override?.displayLabel ?? null;
        if(periode === CUSTOM_PERIOD_COMMAND && customStart && customEnd){
            displayLabel = displayLabel
                || _customActiveLabel
                || buildCustomPeriodDisplayLabel(
                    customStart,
                    customEnd,
                    mode,
                    customMonth,
                    customYear
                );
        }

        const payload = {
            cabang: getToolbarBranchValue() || "Semua Cabang",
            periode,
            customStart,
            customEnd,
            customMode: periode === CUSTOM_PERIOD_COMMAND ? mode : (DashboardEngine.lastCustomMode || mode || null),
            customMonth: periode === CUSTOM_PERIOD_COMMAND && mode === "month" ? customMonth : null,
            customYear: periode === CUSTOM_PERIOD_COMMAND && mode === "month" ? customYear : null,
            displayLabel: periode === CUSTOM_PERIOD_COMMAND ? displayLabel : null
        };
        localStorage.setItem(DASHBOARD_FILTER_KEY, JSON.stringify(payload));
    }catch(_e){ /* ignore quota / private mode */ }
}


function restoreDashboardFilters(){
    const branchFilter = document.getElementById("branchFilter");
    const periodFilter = document.getElementById("periodFilter");
    if(!branchFilter || !periodFilter) return;

    let saved = null;
    try{
        saved = JSON.parse(localStorage.getItem(DASHBOARD_FILTER_KEY) || "null");
    }catch(_e){
        saved = null;
    }

    if(saved?.cabang){
        const opt = [...branchFilter.options].find(o => o.value === saved.cabang);
        if(opt) branchFilter.value = saved.cabang;
    }

    let periode = normalizePeriodeKey(saved?.periode || "hariini");
    const hasCustomDates = Boolean(saved?.customStart && saved?.customEnd && saved.customEnd >= saved.customStart);

    if(periode === CUSTOM_PERIOD_COMMAND && !hasCustomDates){
        periode = "hariini";
    }

    // Restore custom range FIRST so load never sees empty custom state / blank dashboard.
    if(hasCustomDates && periode === CUSTOM_PERIOD_COMMAND){
        const startEl = document.getElementById("customStartDate");
        const endEl = document.getElementById("customEndDate");
        const modeEl = document.getElementById("customPeriodMode");
        let mode = (saved.customMode === "month" || saved.customMode === "range")
            ? saved.customMode
            : (typeof DashboardEngine.isFullCalendarMonth === "function"
                && DashboardEngine.isFullCalendarMonth(saved.customStart, saved.customEnd)
                    ? "month"
                    : "range");

        let start = saved.customStart;
        let end = saved.customEnd;

        // Canonical month restore: rebuild range from customYear/customMonth (1–12).
        const cm = Number(saved.customMonth);
        const cy = Number(saved.customYear);
        if(mode === "month" && cy >= 2000 && cy <= 2100 && cm >= 1 && cm <= 12){
            const rebuilt = applyMonthPickToRange(cy, cm);
            if(rebuilt){
                start = rebuilt.start;
                end = rebuilt.end;
            }
        }else if(mode === "month"
            && typeof DashboardEngine.isFullCalendarMonth === "function"
            && DashboardEngine.isFullCalendarMonth(start, end)){
            _monthPickYear = Number(String(start).slice(0, 4));
            _monthPickMonth = Number(String(start).slice(5, 7));
        }

        if(startEl) startEl.value = start;
        if(endEl) endEl.value = end;
        DashboardEngine.lastCustomStart = start;
        DashboardEngine.lastCustomEnd = end;
        DashboardEngine.lastCustomMode = mode;
        if(modeEl) modeEl.value = mode;
        _calMode = mode;

        const label = saved.displayLabel
            || buildCustomPeriodDisplayLabel(start, end, mode, cm || _monthPickMonth, cy || _monthPickYear);
        setPeriodControlToCustomActive(label);
        _dashboardPrevPeriod = CUSTOM_PERIOD_ACTIVE;

        // Seed header immediately — jangan tunggu engine (hindari blank label setelah Ctrl+R).
        const periodeEl = document.getElementById("erpHeaderPeriode");
        if(periodeEl && label) periodeEl.textContent = label;
    }else{
        clearCustomActiveOption();
        const hasOption = [...periodFilter.options].some(o => o.value === periode);
        periodFilter.value = hasOption ? periode : "hariini";
        _dashboardPrevPeriod = periodFilter.value === CUSTOM_PERIOD_COMMAND
            ? "hariini"
            : periodFilter.value;

        // Still hydrate custom fields if present (for later Custom Tanggal open), without selecting them.
        if(hasCustomDates){
            const startEl = document.getElementById("customStartDate");
            const endEl = document.getElementById("customEndDate");
            const modeEl = document.getElementById("customPeriodMode");
            if(startEl) startEl.value = saved.customStart;
            if(endEl) endEl.value = saved.customEnd;
            DashboardEngine.lastCustomStart = saved.customStart;
            DashboardEngine.lastCustomEnd = saved.customEnd;
            const mode = (saved.customMode === "month" || saved.customMode === "range")
                ? saved.customMode
                : "range";
            DashboardEngine.lastCustomMode = mode;
            if(modeEl) modeEl.value = mode;
        }
    }

    // Initial/refresh: panel always closed. Custom range remains in inputs + engine state.
    showCustomPeriodPanel(false);
}


/* ================= RENDER UTAMA ================= */

function renderDashboard(){
    renderExecutiveSummary();
    renderKPI();
    renderPaymentSummary();
    renderRankingChart();
    renderActivity();
    hitungTargetBulanIni();
    renderToolbarSyncStatus();
    syncHeaderPeriodeFromEngine();
    persistDashboardFilters();
    if(typeof KpiBranchPopup !== "undefined" && typeof KpiBranchPopup.decorateTargets === "function"){
        KpiBranchPopup.decorateTargets();
    }
    // Barber Aktif = provider_sales_daily_source (terpisah dari daily_recap KPI)
    if(typeof BarberAktif !== "undefined" && typeof BarberAktif.refresh === "function"){
        BarberAktif.refresh();
    }
}

/* ================= TOOLBAR STATUS (display only — data dari Engine + sync_status) ================= */

async function loadFreshnessState(){
    if(typeof ErpFreshness === "undefined" || typeof ErpFreshness.load !== "function") return;
    await ErpFreshness.load({
        syncRow: _syncStatusRow,
        lastIsoFallback: (typeof DashboardEngine !== "undefined")
            ? (DashboardEngine.globalLastSync || DashboardEngine.lastSync)
            : null
    });
}

async function loadSyncStatusForToolbar(){
    if(typeof db === "undefined" || !db?.from){
        await loadFreshnessState();
        return;
    }
    const tries = [
        "last_sync_at,status,berhasil,gagal,total_cabang,vps_online,pesan",
        "last_sync_at,status,berhasil,gagal,total_cabang,pesan"
    ];
    for(const cols of tries){
        const { data, error } = await db
            .from("sync_status")
            .select(cols)
            .eq("id", 1)
            .maybeSingle();
        if(!error && data){
            _syncStatusRow = data;
            break;
        }
        if(error && !/column|schema cache|vps_online/i.test(error.message || "")){
            console.warn("sync_status read:", error);
            break;
        }
    }
    await loadFreshnessState();
}

function isVpsOnline(row){
    const vps = row?.vps_online;
    if(vps === undefined || vps === null) return true;
    return vps === true || vps === "true" || vps === "t" || vps === 1 || vps === "1";
}

function syncAgeMinutes(lastIso, nowMs = Date.now()){
    if(!lastIso) return null;
    const t = new Date(lastIso).getTime();
    if(!Number.isFinite(t)) return null;
    return (nowMs - t) / 60000;
}

function classifySyncHealth(row, nowMs = Date.now()){
    const cfg = (typeof MinutesSyncDisplay !== "undefined") ? MinutesSyncDisplay : null;
    const scheduledPause = cfg?.isConfigured?.()
        ? Boolean(cfg.isInsideScheduledPause())
        : false;
    if(scheduledPause){
        const lastIsoPause = row?.last_sync_at || null;
        const lastHm = lastIsoPause && typeof ErpFreshness !== "undefined"
            ? ErpFreshness.formatHm(lastIsoPause)
            : "";
        return {
            key: "waiting",
            css: "is-waiting",
            label: "Jam Operasional Sync Selesai",
            sub: lastHm
                ? `Sinkronisasi operasional akan aktif kembali pukul 07:00 WIB. Data terakhir valid: ${lastHm}`
                : "Sinkronisasi operasional akan aktif kembali pukul 07:00 WIB."
        };
    }

    const lastIso = row?.last_sync_at || null;
    const age = syncAgeMinutes(lastIso, nowMs);
    if(cfg?.isInsideResumeGrace?.() && (age == null || age > SYNC_HEALTH_STALE_MIN)){
        return {
            key: "recovery",
            css: "is-syncing",
            label: "LIVE / Menunggu Sync",
            sub: "Menunggu siklus sync pertama setelah pukul 07:00 WIB."
        };
    }

    if(typeof ErpFreshness !== "undefined" && ErpFreshness.getState?.()){
        const header = ErpFreshness.getState().header;
        if(header){
            return {
                key: header.key === "error" ? "error" : header.key === "normal" ? "normal" : "recovery",
                css: header.css,
                label: header.label,
                sub: header.sub || ""
            };
        }
    }

    if(!lastIso || age == null || age < 0 || age > SYNC_HEALTH_STALE_MIN){
        return {
            key: "error",
            css: "is-error",
            label: "Perlu Intervensi",
            sub: "Sync belum pulih otomatis"
        };
    }

    const statusOk = ["berhasil", "success"].includes(String(row?.status || "").trim().toLowerCase());
    const fail = Number(row?.gagal || 0);
    const ok = Number(row?.berhasil || 0);
    const total = Number(row?.total_cabang || 0);
    const complete = total > 0 && ok === total && fail === 0;
    const vpsOk = isVpsOnline(row);

    if(vpsOk && statusOk && complete && age <= SYNC_HEALTH_FRESH_MIN){
        return {
            key: "normal",
            css: "is-success",
            label: "Sync Normal",
            sub: ""
        };
    }

    return {
        key: "recovery",
        css: "is-recovery",
        label: "Auto Recovery",
        sub: "Sistem sedang mencoba memulihkan koneksi"
    };
}

function isSyncStatusNormal(row){
    return classifySyncHealth(row).key === "normal";
}

function syncHealthIconSvg(key){
    if(key === "normal"){
        return `<svg class="header-minutes-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
    }
    if(key === "error"){
        return `<svg class="header-minutes-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
    }
    return `<svg class="header-minutes-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.2"/><polyline points="21 3 21 9 15 9"/></svg>`;
}

function freshnessPollMs(){
    if(typeof ErpFreshness !== "undefined" && typeof ErpFreshness.isPipelineRunning === "function"){
        if(ErpFreshness.isPipelineRunning()) return SYNC_HEALTH_ACTIVE_MS;
    }
    return SYNC_HEALTH_IDLE_MS;
}

function armSyncHealthTimer(){
    const ms = freshnessPollMs();
    if(_syncHealthTimer && _syncHealthTimerMs === ms) return;
    if(_syncHealthTimer) clearInterval(_syncHealthTimer);
    _syncHealthTimerMs = ms;
    _syncHealthTimer = setInterval(pollSyncHealth, ms);
}

async function pollSyncHealth(){
    await loadSyncStatusForToolbar();
    renderToolbarSyncStatus();
    armSyncHealthTimer();
}

function bindSyncHealthUi(){
    if(_syncHealthUiBound) return;
    const badge = document.getElementById("headerMinutesStatus");
    if(!badge) return;
    _syncHealthUiBound = true;
    badge.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        badge.classList.toggle("is-open");
    });
    document.addEventListener("click", (e) => {
        if(!e.target.closest("#headerMinutesStatus")){
            badge.classList.remove("is-open");
        }
    });
}

function startSyncHealthMonitor(){
    bindSyncHealthUi();
    armSyncHealthTimer();
    if(_syncHealthMonitorBound) return;
    _syncHealthMonitorBound = true;
    document.addEventListener("visibilitychange", () => {
        if(document.visibilityState === "visible") pollSyncHealth();
    });
}

async function refreshDashboardData(buttonEl){
    const labelAsli = buttonEl?.textContent || "";
    if(buttonEl){
        buttonEl.disabled = true;
        if(buttonEl.id === "btnSync") buttonEl.textContent = "Memuat…";
    }
    try{
        await loadSyncStatusForToolbar();
        // AI-only: drop 7D/14D/30D/MTD snapshot before Minutes reload.
        // Engine refresh still owns ERP state; AI must not reuse same-day cache.
        invalidateAiMultiPeriodCache();
        await DashboardEngine.refresh();
        renderToolbarSyncStatus();
        armSyncHealthTimer();
    }finally{
        if(buttonEl){
            buttonEl.disabled = false;
            if(labelAsli) buttonEl.textContent = labelAsli;
        }
    }
}

function formatLastSyncDisplay(syncedAt){
    if(!syncedAt) return "—";
    const d = new Date(syncedAt);
    if(Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

/**
 * Status badge + Last Sync dari Supabase synced_at (VPS auto-sync → DB).
 * Prefer globalLastSync (max synced_at semua baris) agar badge tidak
 * "mati" hanya karena filter periode/cabang kosong.
 * Bukan browser HTTP /api/sync (eksperimen Direct VPS API dibatalkan).
 *
 * PRESENTATION ONLY — tidak memicu sync, tidak menulis DB.
 * Jadwal jeda (jika ada) dibaca dari MinutesSyncDisplay
 * (= mirror minutes-connector/scheduler.js untuk display).
 */
function renderToolbarSyncStatus(rowOverride){
    const row = rowOverride || _syncStatusRow;
    const lastIso = row?.last_sync_at
        || (!rowOverride && (DashboardEngine.globalLastSync || DashboardEngine.lastSync))
        || null;
    const lastEl = document.getElementById("toolbarLastSync");
    const headerStatus = document.getElementById("headerMinutesStatus");
    const headerLabel = document.getElementById("headerMinutesLabel");
    const headerSub = document.getElementById("headerMinutesSub");
    const headerTip = document.getElementById("headerMinutesTip");
    const iconWrap = document.getElementById("headerMinutesIconWrap");
    const lastDisplay = formatLastSyncDisplay(lastIso);

    if(!rowOverride && typeof ErpFreshness !== "undefined" && typeof ErpFreshness.render === "function"){
        if(!ErpFreshness.getState?.()){
            if(lastEl) lastEl.textContent = lastDisplay;
            return;
        }
        ErpFreshness.render({
            syncRow: row,
            lastIsoFallback: lastIso
        });
        if(typeof VaxAiInsight !== "undefined"){
            if(typeof VaxAiInsight.paintFrom === "function" && _lastExecAiInsight){
                VaxAiInsight.paintFrom(_lastExecAiInsight);
            }else if(typeof VaxAiInsight.paintFreshness === "function"){
                VaxAiInsight.paintFreshness();
            }
        }
        return;
    }

    const health = classifySyncHealth(row ? { ...row, last_sync_at: lastIso } : { last_sync_at: lastIso });

    if(lastEl) lastEl.textContent = lastDisplay;

    if(!headerStatus && !headerLabel) return;

    if(headerStatus){
        headerStatus.classList.remove(
            "is-online","is-success","is-syncing","is-waiting","is-warn","is-error","is-offline","is-recovery","is-night","is-final"
        );
        headerStatus.classList.add(health.css);
    }

    if(headerLabel) headerLabel.textContent = health.label;
    if(headerSub){
        headerSub.textContent = health.sub || "";
        headerSub.hidden = !health.sub;
    }

    if(iconWrap){
        const dot = iconWrap.querySelector(".header-minutes-dot");
        iconWrap.innerHTML = syncHealthIconSvg(health.key);
        if(dot) iconWrap.appendChild(dot);
        else iconWrap.insertAdjacentHTML("beforeend", `<i class="header-minutes-dot"></i>`);
    }

    const ok = Number(row?.berhasil || 0);
    const total = Number(row?.total_cabang || 0);
    const fail = Number(row?.gagal || 0);
    const vpsLabel = isVpsOnline(row) ? "Online" : "Offline";
    const tip = [
        `Last Sync: ${lastDisplay}`,
        `Cabang: ${ok} / ${total}`,
        `Gagal: ${fail}`,
        `VPS: ${vpsLabel}`,
        row?.pesan ? `Pesan: ${row.pesan}` : null
    ].filter(Boolean).join("\n");

    if(headerStatus){
        headerStatus.setAttribute("aria-label", `${health.label}. ${tip.replaceAll("\n", ". ")}`);
    }
    if(headerTip){
        headerTip.textContent = tip;
    }
}

window.ErpSyncHealthTest = {
    classify: classifySyncHealth,
    simulateAgeMinutes(ageMin){
        const base = _syncStatusRow || {
            status: "berhasil",
            berhasil: 10,
            gagal: 0,
            total_cabang: 10,
            vps_online: true,
            pesan: "simulasi UI"
        };
        const fake = {
            ...base,
            last_sync_at: new Date(Date.now() - Number(ageMin) * 60000).toISOString()
        };
        renderToolbarSyncStatus(fake);
        return classifySyncHealth(fake, Date.now());
    }
};


function renderRankingChart(){

    if(typeof renderRanking==="function"){
        renderRanking();
    }

    if(typeof renderChart==="function"){
        renderChart("aktif");
    }

    syncChartPeriodLabel();

}


/* ================= SINKRONISASI LABEL PERIODE ================= */

function normalizePeriodeKey(periode){
    const key = String(periode || "hariini")
        .toLowerCase()
        .replace(/\s+/g,"");

    if(key === "custom"
        || key === "customdate"
        || key === "customtanggal"
        || key === "custom-active"
        || key === "customactive"){
        return CUSTOM_PERIOD_COMMAND;
    }

    return key || "hariini";
}

function formatDisplayDateId(tanggal){
    const key = String(tanggal || "").slice(0, 10);
    const parts = key.split("-").map(Number);
    if(parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return key || "—";

    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
    return dt.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    });
}


function formatDisplayRange(start, end){
    const s = String(start || "").slice(0, 10);
    const e = String(end || "").slice(0, 10);
    if(s && e && s === e) return formatDisplayDateId(s);
    const sy = s.slice(0, 4);
    const ey = e.slice(0, 4);
    // Rentang dalam tahun sama: "05 Agu — 18 Agu 2026"
    if(sy && ey && sy === ey){
        const left = formatDisplayDateId(s).replace(/\s+\d{4}$/, "");
        return `${left} — ${formatDisplayDateId(e)}`;
    }
    return `${formatDisplayDateId(s)} — ${formatDisplayDateId(e)}`;
}


function formatMonthYearId(tanggal){
    const key = String(tanggal || "").slice(0, 10);
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7));
    if(!y || !m || m < 1 || m > 12) return key || "—";
    return `${ID_MONTH_NAMES[m - 1]} ${y}`;
}


function getPeriodeLabel(periode){
    const key = normalizePeriodeKey(periode);
    const label = {
        hariini: "Hari Ini",
        kemarin: "Kemarin",
        "7hari": "7 Hari",
        "30hari": "30 Hari",
        bulanini: "Bulan Ini",
        tahunini: "Tahun Ini",
        customtanggal: "Custom Tanggal"
    };

    if(key === "customtanggal"){
        const start = DashboardEngine.lastRange?.start || DashboardEngine.lastCustomStart;
        const end = DashboardEngine.lastRange?.end || DashboardEngine.lastCustomEnd;
        if(start && end){
            // Pilih Bulan / full calendar month → tampilkan nama bulan ID, bukan rentang tgl.
            if(typeof DashboardEngine.isFullCalendarMonth === "function"
                && DashboardEngine.isFullCalendarMonth(start, end)){
                return formatMonthYearId(start);
            }
            return formatDisplayRange(start, end);
        }
    }

    return label[key] || "Hari Ini";
}

function syncChartPeriodLabel(){
    const labelEl = document.getElementById("chartPeriodLabel");
    if(labelEl){
        labelEl.textContent = getPeriodeLabel(DashboardEngine.lastPeriode);
    }
}


function syncTransactionPeriodLabel(){
    const card = document.getElementById("kpiTransaction")?.closest(".kpi-card");
    const descEl = card?.querySelector(".kpi-desc");
    // Period label di desc; status tetap dipakai untuk trend %
    if(descEl){
        descEl.textContent = getPeriodeLabel(DashboardEngine.lastPeriode);
    }
}


function syncHeaderPeriodeFromEngine(){
    const periodeEl = document.getElementById("erpHeaderPeriode");
    if(!periodeEl) return;
    const label = getPeriodeLabel(DashboardEngine.lastPeriode);
    periodeEl.textContent = label;

    // Keep Periode <select> visually aligned with active custom month/range label.
    if(normalizePeriodeKey(DashboardEngine.lastPeriode) === CUSTOM_PERIOD_COMMAND
        && hasCanonicalCustomRange()){
        _customActiveLabel = label;
        setPeriodControlToCustomActive(label);
    }

    if(typeof syncHeaderContextFromPage === "function"){
        syncHeaderContextFromPage();
    }
    if(typeof syncSidebarRoleMeta === "function"){
        syncSidebarRoleMeta();
    }
}


/* ================= EXECUTIVE SUMMARY ================= */

function renderExecutiveSummary(){

    const s = DashboardEngine.summary || {};
    const cashOut = (s.cashOut != null)
        ? Number(s.cashOut)
        : hitungTotalCashOut();

    setText("todayRevenue", formatRupiah(s.omzet));
    setText("execNett", formatRupiah(s.nett));
    setText("execCustomer", formatAngka(s.customer));
    setText("execService", formatAngka(s.service));
    setText("execCash", formatRupiah(s.cash));
    setText("execQris", formatRupiah(s.qris));
    setText("execCashout", formatRupiah(cashOut));

    renderExecutiveTrends();
    renderExecutiveAiInsight();

}


function hitungTotalCashOut(){
    return (DashboardEngine.rawData || [])
        .reduce((total,row)=>total+Number(row.cash_out||0),0);
}


function getTrend(metricKey){
    return (DashboardEngine.trends && DashboardEngine.trends[metricKey]) || {
        pct: null,
        tone: "neutral",
        arrow: "●",
        text: "—"
    };
}


function applyTrendTone(el, tone){
    if(!el) return;
    el.classList.remove("positive", "negative", "warning", "neutral");
    if(tone === "positive") el.classList.add("positive");
    else if(tone === "negative") el.classList.add("negative");
    else if(tone === "warning") el.classList.add("warning");
    else el.classList.add("neutral");
}


function trendDescText(trend){
    if(trend?.noBaseline || trend?.pct === null || trend?.pct === undefined){
        return "Tidak ada data periode sebelumnya";
    }
    return "vs periode sebelumnya";
}


function setKpiTrendByValueId(kpiValueId, metricKey, descText){
    const card = document.getElementById(kpiValueId)?.closest(".kpi-card");
    if(!card) return;

    const statusEl = card.querySelector(".kpi-status");
    const descEl = card.querySelector(".kpi-desc");
    const trend = getTrend(metricKey);

    if(statusEl){
        statusEl.textContent = trend.text;
        applyTrendTone(statusEl, trend.tone);
    }
    if(descEl){
        descEl.textContent = descText || trendDescText(trend);
    }
}


function formatGrowthValue(trend){
    if(!trend || trend.pct === null || trend.pct === undefined){
        return "—";
    }
    if(trend.pct > 0) return `+${trend.pct}%`;
    if(trend.pct < 0) return `${trend.pct}%`;
    return "0%";
}


function formatExecutiveOmzetDelta(current, previous){
    const cur = Number(current || 0);
    const prev = Number(previous || 0);
    const delta = cur - prev; // exact: jangan turunkan dari % yang dibulatkan

    if(delta > 0){
        return `Naik ${formatRupiah(delta)} vs periode sebelumnya`;
    }
    if(delta < 0){
        return `Turun ${formatRupiah(Math.abs(delta))} vs periode sebelumnya`;
    }
    return "Tetap Rp0 vs periode sebelumnya";
}


function renderExecutiveTrends(){
    const omzetTrend = getTrend("omzet");
    const badgeEl = document.querySelector("#executive-summary .summary-info .exec-trend-badge")
        || document.querySelector("#executive-summary .summary-info span:first-child");
    const subEl = document.querySelector("#executive-summary .summary-info .exec-trend-sub");

    // Source of truth sama dengan %: summary.omzet vs previousSummary.omzet
    const currentOmzet = Number(DashboardEngine.summary?.omzet || 0);
    const previousOmzet = Number(DashboardEngine.previousSummary?.omzet || 0);

    let badgeText;
    let subText;
    if(omzetTrend.noBaseline || omzetTrend.pct === null || omzetTrend.pct === undefined){
        badgeText = "—";
        subText = "Tidak ada data periode sebelumnya";
    }else{
        // Percentage text existing tetap dipakai apa adanya
        badgeText = omzetTrend.text;
        subText = formatExecutiveOmzetDelta(currentOmzet, previousOmzet);
    }

    if(badgeEl){
        badgeEl.textContent = badgeText;
        applyTrendTone(badgeEl, omzetTrend.tone);
    }
    if(subEl){
        subEl.textContent = subText;
        applyTrendTone(subEl, omzetTrend.tone);
    }

    // Optional per-metric tone on executive values (label size handled by CSS)
    const map = [
        ["execNett", "nett"],
        ["execCustomer", "customer"],
        ["execService", "service"],
        ["execCash", "cash"],
        ["execQris", "qris"],
        ["execCashout", "cashOut"]
    ];
    map.forEach(([id, key]) => {
        const el = document.getElementById(id);
        const item = el?.closest(".executive-item");
        if(!item) return;
        item.dataset.trend = getTrend(key).tone || "neutral";
    });
}


/* ================= KPI ================= */

function renderKPI(){

    const s = DashboardEngine.summary || {};
    const omzetTrend = getTrend("omzet");

    setText("kpiAvgTicket", formatRupiah(s.avgTicket));
    setText("kpiGross", formatRupiah(s.grossService));
    setText("kpiTransaction", formatAngka(s.transaction));
    setText("kpiProduct", formatAngka(s.product));

    // Growth utama = tren omzet vs periode pembanding (data asli)
    setText("kpiGrowth", formatGrowthValue(omzetTrend));
    applyTrendTone(document.getElementById("kpiGrowth"), omzetTrend.tone);

    setKpiTrendByValueId("kpiAvgTicket", "avgTicket");
    setKpiTrendByValueId("kpiGrowth", "omzet");
    setKpiTrendByValueId("kpiGross", "grossService");
    setKpiTrendByValueId("kpiTransaction", "transaction");
    setKpiTrendByValueId("kpiProduct", "product");

}


/* ================= TARGET BULAN (kartu TARGET BULAN, dari public.target_bulanan) =================
Independen dari filter periode utama (selalu bulan berjalan, sesuai
permintaan "omzet bulan berjalan"), tapi TETAP mengikuti filter cabang
yang sedang aktif (DashboardEngine.lastCabangId): Semua Cabang = jumlah
target seluruh cabang, 1 Cabang = target cabang tersebut saja. Query
target_bulanan + omzet bulan berjalan dilakukan terpisah di sini (bukan
lewat DashboardEngine.rawData yang sudah terpotong oleh periode utama),
memakai client Supabase global "db" yang sama dipakai dashboard-engine.js.
===================================================================== */

async function hitungTargetBulanIni(){

    const today = DashboardEngine.getJakartaToday();
    const bulan = Number(today.slice(5,7));
    const tahun = Number(today.slice(0,4));
    const awalBulan = today.slice(0,8) + "01";

    const cabangIdNumeric = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);

    try{

        let queryTarget = db
            .from("target_bulanan")
            .select("target")
            .eq("bulan", bulan)
            .eq("tahun", tahun);

        let queryOmzet = db
            .from(DashboardEngine.TABLE_SOURCE)
            .select("service,produk")
            .gte("tanggal", awalBulan)
            .lte("tanggal", today);

        if(cabangIdNumeric){
            queryTarget = queryTarget.eq("cabang_id", cabangIdNumeric);
            queryOmzet = queryOmzet.eq("cabang_id", cabangIdNumeric);
        }

        const [{ data: dataTarget, error: errTarget }, { data: dataOmzet, error: errOmzet }] =
            await Promise.all([queryTarget, queryOmzet]);

        if(errTarget) throw errTarget;
        if(errOmzet) throw errOmzet;

        const targetBulan = (dataTarget || [])
            .reduce((total,row)=>total+Number(row.target||0), 0);

        const omzetBulan = (dataOmzet || [])
            .reduce((total,row)=>total+Number(row.service||0)+Number(row.produk||0), 0);

        renderTargetBulan(omzetBulan, targetBulan);

    }catch(err){
        console.error("Gagal memuat Target Bulan:", err);
    }

}


function renderTargetBulan(omzetBulan, targetBulan){

    const persen = targetBulan>0
        ? Math.round((omzetBulan/targetBulan)*100)
        : 0;

    setText("kpiTarget", `${persen}%`);
    setWidth("#kpiTargetBar", Math.min(persen, 100));

    const statusEl = document.getElementById("kpiTarget")
        ?.closest(".kpi-card")
        ?.querySelector(".kpi-status");

    if(statusEl){
        statusEl.textContent = `${formatRupiah(omzetBulan)} / ${formatRupiah(targetBulan)}`;
    }

}


/* ================= PAYMENT SUMMARY ================= */

function renderPaymentSummary(){

    const s = DashboardEngine.summary || {};
    const total = Number(s.cash||0) + Number(s.qris||0);

    setText("cashValue", formatRupiah(s.cash));
    setText("qrisValue", formatRupiah(s.qris));

    const persenCash = total>0 ? Math.round((s.cash/total)*100) : 0;
    const persenQris = total>0 ? 100-persenCash : 0;

    setWidth(".progress-fill.cash", persenCash);
    setWidth(".progress-fill.qris", persenQris);

    syncPaymentSummaryTitle();

}


function getPaymentSummaryTitle(periode){
    const key = normalizePeriodeKey(periode);
    const judul = {
        hariini: "Pembayaran Hari Ini",
        kemarin: "Pembayaran Kemarin",
        "7hari": "Pembayaran 7 Hari",
        "30hari": "Pembayaran 30 Hari",
        bulanini: "Pembayaran Bulan Ini",
        tahunini: "Pembayaran Tahun Ini",
        customtanggal: "Pembayaran Custom"
    };

    if(key === "customtanggal"){
        const start = DashboardEngine.lastRange?.start || DashboardEngine.lastCustomStart;
        const end = DashboardEngine.lastRange?.end || DashboardEngine.lastCustomEnd;
        if(start && end){
            if(typeof DashboardEngine.isFullCalendarMonth === "function"
                && DashboardEngine.isFullCalendarMonth(start, end)){
                return `Pembayaran ${formatMonthYearId(start)}`;
            }
            return `Pembayaran ${formatDisplayRange(start, end)}`;
        }
    }

    return judul[key] || "Pembayaran Hari Ini";
}


function syncPaymentSummaryTitle(){
    const titleEl = document.querySelector(".payment-title h3");

    if(titleEl){
        titleEl.textContent = getPaymentSummaryTitle(DashboardEngine.lastPeriode);
    }
}


/* ================= LIVE ACTIVITY ================= */

function renderActivity(){

    const list = document.getElementById("activityList");

    if(!list) return;

    // Baris dengan seluruh nilai transaksi nol (mis. sync harian yang belum
    // ada transaksi) disingkirkan agar Live Activity tidak menampilkan Rp0
    // padahal ada aktivitas bernilai di tanggal lain pada periode yang sama.
    const adaNilaiTransaksi = row =>
        Number(row.service||0) > 0 ||
        Number(row.produk||0) > 0 ||
        Number(row.cash_out||0) > 0 ||
        Number(row.non_cash||0) > 0 ||
        Number(row.cash_payment||0) > 0;

    const aktivitas = [...(DashboardEngine.rawData || [])]
        .filter(row=>row.synced_at && adaNilaiTransaksi(row))
        .sort((a,b)=>new Date(b.synced_at)-new Date(a.synced_at))
        .slice(0,10);

    if(aktivitas.length===0){
        list.innerHTML = `
            <div class="activity-item">
                <div class="activity-content">
                    <p>Belum ada aktivitas dengan nilai transaksi pada periode ini.</p>
                </div>
            </div>
        `;

        return;
    }

    list.innerHTML = aktivitas.map(row=>`
        <div class="activity-item">

            <div class="activity-time">
                ${formatJam(row.synced_at)}
            </div>

            <div class="activity-content">

                <strong>${row.nama_cabang || "-"}</strong>

                <p>
                    Sinkronisasi Omzet
                    •
                    ${formatRupiah(Number(row.service||0) + Number(row.produk||0))}
                </p>

            </div>

        </div>
    `).join("");

}


/* ================= HELPER FORMAT ================= */

function formatRupiah(nilai){
    return "Rp" + Number(nilai||0).toLocaleString("id-ID");
}


function formatAngka(nilai){
    return Number(nilai||0).toLocaleString("id-ID");
}


function formatJam(waktu){

    if(!waktu) return "-";

    return new Date(waktu).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta"
    });

}


function setText(id, value){
    const el = document.getElementById(id);
    if(el) el.innerText = value;
}


function setWidth(selector, persen){
    const el = document.querySelector(selector);
    if(el) el.style.width = `${persen}%`;
}


/* ================= EXECUTIVE AI INSIGHT (deterministic + proactive advice) =================
   TEMUAN DATA = fakta ERP. REKOMENDASI INISIATIF = saran saja (tidak dieksekusi otomatis).
   Promo/diskon = traffic-first + multi-period evidence. Tidak ada data jam → jangan invent.
============================================================================= */

function escapeHtmlExec(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


/** Presentation-only: color TURUN/NAIK + related %/Rp, and Cash Out → RED. */
function colorizeAiSemanticHtml(raw){
    let s = escapeHtmlExec(raw);
    s = s.replace(/Cash\s*Out/gi, (m) => `<span class="ai-cashout">${m}</span>`);
    s = s.replace(/\b(TURUN|Turun|turun)\b/g, (m) => `<span class="ai-word-down">${m}</span>`);
    s = s.replace(/\b(NAIK|Naik|naik)\b/g, (m) => `<span class="ai-word-up">${m}</span>`);
    s = s.replace(/▼/g, `<span class="ai-num-down">▼</span>`);
    s = s.replace(/▲/g, `<span class="ai-num-up">▲</span>`);
    s = s.replace(/(^|[^0-9>])(-\d+%)/g, `$1<span class="ai-num-down">$2</span>`);
    s = s.replace(/(^|[^0-9>+])(\+\d+%)/g, `$1<span class="ai-num-up">$2</span>`);
    s = s.replace(
        /(<span class="ai-word-down">[^<]*<\/span>)(.{0,48}?)(Rp[\d.\s]+)/g,
        (_, a, mid, rp) => `${a}${mid}<span class="ai-num-down">${rp.trim()}</span>`
    );
    s = s.replace(
        /(<span class="ai-word-up">[^<]*<\/span>)(.{0,48}?)(Rp[\d.\s]+)/g,
        (_, a, mid, rp) => `${a}${mid}<span class="ai-num-up">${rp.trim()}</span>`
    );
    s = s.replace(
        /(<span class="ai-cashout">[^<]*<\/span>)(.{0,56}?)(Rp[\d.\s]+)/g,
        (_, a, mid, rp) => `${a}${mid}<span class="ai-cashout">${rp.trim()}</span>`
    );
    return s;
}


function formatSignedPct(pct){
    if(pct == null || Number.isNaN(Number(pct))) return "—";
    const n = Number(pct);
    if(n > 0) return `+${n}%`;
    return `${n}%`;
}


function formatMetricDeltaText(label, current, previous, opts = {}){
    const cur = Number(current || 0);
    const prev = Number(previous || 0);
    const delta = cur - prev;
    const money = Boolean(opts.money);
    const trend = opts.trend || null;
    const pct = (trend && trend.pct != null) ? trend.pct : (
        prev > 0 ? Math.round((delta / prev) * 100) : null
    );
    const absFmt = money ? formatRupiah(Math.abs(delta)) : formatAngka(Math.abs(delta));
    const curFmt = money ? formatRupiah(cur) : formatAngka(cur);

    if(delta < 0){
        return `${label} turun ${formatSignedPct(pct)} (${absFmt}) — sekarang ${curFmt}`;
    }
    if(delta > 0){
        return `${label} naik ${formatSignedPct(pct)} (${absFmt}) — sekarang ${curFmt}`;
    }
    return `${label} tetap (${curFmt})`;
}


function aiFreshnessToken(){
    return DashboardEngine.globalLastSync
        || DashboardEngine.lastSync
        || "";
}

function aiPeriodCacheKey(){
    const cabang = DashboardEngine.lastCabangId ?? "all";
    const periode = normalizePeriodeKey(DashboardEngine.lastPeriode) || "";
    const rangeStart = DashboardEngine.lastRange?.start || DashboardEngine.lastCustomStart || "";
    const rangeEnd = DashboardEngine.lastRange?.end || DashboardEngine.lastCustomEnd || "";
    const today = DashboardEngine.getJakartaToday?.() || "";
    return `${cabang}|${periode}|${rangeStart}|${rangeEnd}|${today}|${aiFreshnessToken()}`;
}

function invalidateAiMultiPeriodCache(){
    _aiMultiPeriodSeq += 1;
    _aiMultiPeriod = null;
    _aiMultiPeriodKey = null;
}

const OWNER_PRIORITY_NEUTRAL =
    "Belum ada cabang dengan bukti cukup kuat untuk prioritas tindakan.";

function readAiFreshnessFlags(){
    const ai = (typeof ErpFreshness !== "undefined" && ErpFreshness.getState?.()?.ai) || null;
    return {
        operationalValid: ai?.operationalValid === true,
        holdProvider: ai?.holdProvider === true,
        holdPrediction: ai?.holdPrediction === true
    };
}

function getActiveCabangFilter(){
    const raw = DashboardEngine.lastCabangId;
    const selectedId = (typeof DashboardEngine.resolveCabangId === "function")
        ? DashboardEngine.resolveCabangId(raw)
        : null;
    const isAll = selectedId == null;
    let name = "Semua Cabang";
    if(!isAll){
        const found = (DashboardEngine.cabangList || []).find((c) => Number(c.id) === Number(selectedId));
        const rawName = found?.nama_cabang || String(raw || "Cabang");
        name = (typeof DashboardEngine.shortCabangName === "function")
            ? DashboardEngine.shortCabangName(rawName)
            : rawName;
    }
    return { selectedId, isAll, name };
}

function metricMoveFromBreakdown(branch){
    const value = Number(branch?.value || 0);
    const prevValue = Number(branch?.prevValue || 0);
    const delta = value - prevValue;
    const pct = prevValue > 0 ? Math.round((delta / prevValue) * 100) : null;
    return { value, prevValue, delta, pct };
}

function collectActiveBranchEvidence(){
    const byId = new Map();
    if(typeof DashboardEngine.buildBranchBreakdown !== "function") return [];

    const metricKeys = ["omzet", "customer", "transaction", "service", "avgTicket", "cashOut"];
    metricKeys.forEach((metric) => {
        let bd = null;
        try{
            bd = DashboardEngine.buildBranchBreakdown(metric);
        }catch(_e){
            bd = null;
        }
        (bd?.branches || []).forEach((b) => {
            const id = b.cabang_id;
            if(id === null || id === undefined) return;
            if(!byId.has(id)){
                byId.set(id, {
                    cabang_id: id,
                    name: b.nama_pendek || b.nama_cabang || "-",
                    metrics: {}
                });
            }
            const row = byId.get(id);
            if(!row.name || row.name === "-"){
                row.name = b.nama_pendek || b.nama_cabang || row.name;
            }
            row.metrics[metric] = metricMoveFromBreakdown(b);
        });
    });

    return [...byId.values()];
}

function scoreBranchAttention(branch, { useService }){
    const m = branch.metrics || {};
    let score = 0;
    const signals = [];

    const addDown = (key, weight) => {
        const d = m[key];
        if(!d || d.pct == null || !(d.delta < 0)) return;
        score += weight * Math.abs(Number(d.pct) || 0);
        signals.push(key);
    };

    addDown("omzet", 3);
    addDown("customer", 3);
    addDown("transaction", 2);
    if(useService) addDown("service", 2);
    addDown("avgTicket", 1);

    const co = m.cashOut;
    const omzetDown = Boolean(m.omzet && m.omzet.delta < 0);
    const custDown = Boolean(m.customer && m.customer.delta < 0);
    if(co && co.delta > 0 && (omzetDown || custDown)){
        score += 30 + Math.abs(Number(co.pct) || 0);
        signals.push("cashOut");
    }

    const trafficDown = ["omzet", "customer", "transaction"]
        .filter((key) => m[key] && m[key].delta < 0).length;
    if(trafficDown >= 2) score += 20;

    return { score, signals };
}

function resolveOwnerPriorityDecision(){
    const freshness = readAiFreshnessFlags();
    const filter = getActiveCabangFilter();
    const useService = !freshness.holdProvider;
    let pool = collectActiveBranchEvidence();

    if(filter.isAll){
        const opIds = (typeof DashboardEngine.getOperationalCabangIds === "function")
            ? DashboardEngine.getOperationalCabangIds()
            : [];
        const opSet = new Set((opIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)));
        if(opSet.size){
            pool = pool.filter((b) => opSet.has(Number(b.cabang_id)));
        }
    }else{
        pool = pool.filter((b) => Number(b.cabang_id) === Number(filter.selectedId));
        if(!pool.length){
            pool = [{
                cabang_id: filter.selectedId,
                name: filter.name,
                metrics: {}
            }];
        }
    }

    const scored = pool.map((b) => {
        const att = scoreBranchAttention(b, { useService });
        return { ...b, score: att.score, signals: att.signals };
    });

    const declinedBranches = scored
        .filter((b) => b.metrics?.omzet && b.metrics.omzet.pct != null && b.metrics.omzet.delta < 0)
        .sort((a, b) => (a.metrics.omzet.pct - b.metrics.omzet.pct));
    const grownBranches = scored
        .filter((b) => b.metrics?.omzet && b.metrics.omzet.pct != null && b.metrics.omzet.delta > 0)
        .sort((a, b) => (b.metrics.omzet.pct - a.metrics.omzet.pct));

    if(!filter.isAll){
        const branch = scored[0] || {
            cabang_id: filter.selectedId,
            name: filter.name,
            metrics: {},
            score: 0,
            signals: []
        };
        return {
            mode: "single",
            cabangLabel: filter.name,
            selectedId: filter.selectedId,
            branch,
            sufficient: true,
            holdFinal: false,
            reason: "single-filter",
            freshness,
            evidenceBranches: scored,
            declinedBranches,
            grownBranches
        };
    }

    const withEvidence = scored
        .filter((b) => b.score > 0 && b.signals.length)
        .sort((a, b) => {
            if(b.score !== a.score) return b.score - a.score;
            const ap = a.metrics?.omzet?.pct;
            const bp = b.metrics?.omzet?.pct;
            const an = (ap != null && ap < 0) ? ap : 0;
            const bn = (bp != null && bp < 0) ? bp : 0;
            if(an !== bn) return an - bn;
            const ac = a.metrics?.customer?.pct;
            const bc = b.metrics?.customer?.pct;
            const acn = (ac != null && ac < 0) ? ac : 0;
            const bcn = (bc != null && bc < 0) ? bc : 0;
            if(acn !== bcn) return acn - bcn;
            return String(a.name || "").localeCompare(String(b.name || ""), "id");
        });

    if(!withEvidence.length){
        return {
            mode: "all",
            cabangLabel: "Semua Cabang",
            selectedId: null,
            branch: null,
            sufficient: false,
            holdFinal: false,
            reason: "insufficient",
            freshness,
            evidenceBranches: scored,
            declinedBranches,
            grownBranches
        };
    }

    return {
        mode: "all",
        cabangLabel: "Semua Cabang",
        selectedId: null,
        branch: withEvidence[0],
        sufficient: true,
        holdFinal: false,
        reason: "attention",
        freshness,
        evidenceBranches: scored,
        declinedBranches,
        grownBranches
    };
}

function buildOwnerPriorityLines(decision, ctx){
    const {
        noBaseline,
        shortDecline,
        omzetDelta,
        promo,
        cashOutAbnormal,
        coM
    } = ctx;
    const lines = [];
    const name = decision.branch?.name || null;
    const single = decision.mode === "single";
    const signals = decision.branch?.signals || [];
    const hasProblem = Boolean(name && signals.length);

    if(!single && !hasProblem){
        lines.push(OWNER_PRIORITY_NEUTRAL);
        return lines;
    }

    if(noBaseline){
        if(single && name){
            lines.push(`Pantau data ${name} — baseline periode sebelumnya belum tersedia.`);
            lines.push("Pastikan data periode pembanding tersedia sebelum menindaklanjuti.");
        }else{
            lines.push(OWNER_PRIORITY_NEUTRAL);
        }
        return lines;
    }

    if(hasProblem || (single && (shortDecline || omzetDelta < 0))){
        const at = name || "cabang terpilih";
        if(shortDecline || (omzetDelta < 0 && promo.shortWindow)){
            lines.push(`Cek penyebab penurunan traffic ${at} dan lakukan riset lapangan.`);
            lines.push("Diagnosa customer / transaksi / service + cek operasional cabang.");
            lines.push("Jalankan aksi non-diskon (reaktivasi/visibility) lalu monitor beberapa hari.");
        }else if(omzetDelta < 0 || signals.includes("omzet") || signals.includes("customer") || signals.includes("transaction")){
            if(!promo.persistent14TrafficWeak){
                lines.push(`Diagnosa & riset ${at} — belum cukup bukti ≥14 hari untuk promo/diskon.`);
            }else{
                lines.push(`Lanjutkan aksi non-diskon dulu di ${at}; promo hanya opsi terakhir.`);
            }
            if(cashOutAbnormal || signals.includes("cashOut")){
                lines.push(`Review Cash Out abnormal (${formatSignedPct(coM?.trend?.pct)} / ${formatRupiah(coM?.delta || 0)}).`);
            }
            if(promo.status === "LAYAK DIUJI"){
                lines.push("Jika non-diskon sudah dijalankan: baru pertimbangkan uji promo terbatas.");
            }
        }else{
            lines.push(`Prioritas tindakan: ${at} — sinyal underperform pada periode aktif.`);
            lines.push("Diagnosa customer / transaksi / service + cek operasional cabang.");
        }
        return lines.slice(0, 3);
    }

    if(single && name){
        lines.push(`Pertahankan ritme operasional ${name}; pantau customer/service.`);
        return lines;
    }

    lines.push(OWNER_PRIORITY_NEUTRAL);
    return lines;
}


async function fetchAiPeriodSnapshot(periodeKey){
    const range = DashboardEngine.getPeriodeRange(periodeKey);
    const prevRange = DashboardEngine.getPreviousRange(range.start, range.end, periodeKey);
    const cabangId = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);
    const [curRows, prevRows] = await Promise.all([
        DashboardEngine.fetchRecapRows(range.start, range.end, cabangId),
        DashboardEngine.fetchRecapRows(prevRange.start, prevRange.end, cabangId)
    ]);
    const cur = DashboardEngine.summarizeRows(curRows);
    const prev = DashboardEngine.summarizeRows(prevRows);
    return {
        key: periodeKey,
        range,
        prevRange,
        cur,
        prev,
        trends: {
            omzet: DashboardEngine.calcTrend(cur.omzet, prev.omzet),
            customer: DashboardEngine.calcTrend(cur.customer, prev.customer),
            transaction: DashboardEngine.calcTrend(cur.transaction, prev.transaction),
            service: DashboardEngine.calcTrend(cur.service, prev.service),
            avgTicket: DashboardEngine.calcTrend(cur.avgTicket, prev.avgTicket),
            cashOut: DashboardEngine.calcTrend(cur.cashOut, prev.cashOut),
            grossService: DashboardEngine.calcTrend(cur.grossService, prev.grossService)
        }
    };
}


async function fetchAiRollingDaysSnapshot(days){
    const today = DashboardEngine.getJakartaToday();
    const start = DashboardEngine.shiftDate(today, -(Number(days) - 1));
    const end = today;
    // Equal-length previous window (bukan asumsi filter UI).
    const prevRange = DashboardEngine.getPreviousRange(start, end, "customtanggal");
    const cabangId = DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId);
    const [curRows, prevRows] = await Promise.all([
        DashboardEngine.fetchRecapRows(start, end, cabangId),
        DashboardEngine.fetchRecapRows(prevRange.start, prevRange.end, cabangId)
    ]);
    const cur = DashboardEngine.summarizeRows(curRows);
    const prev = DashboardEngine.summarizeRows(prevRows);
    return {
        key: `${days}hari`,
        range: { start, end },
        prevRange,
        dayCount: days,
        cur,
        prev,
        trends: {
            omzet: DashboardEngine.calcTrend(cur.omzet, prev.omzet),
            customer: DashboardEngine.calcTrend(cur.customer, prev.customer),
            transaction: DashboardEngine.calcTrend(cur.transaction, prev.transaction),
            service: DashboardEngine.calcTrend(cur.service, prev.service),
            avgTicket: DashboardEngine.calcTrend(cur.avgTicket, prev.avgTicket),
            cashOut: DashboardEngine.calcTrend(cur.cashOut, prev.cashOut),
            grossService: DashboardEngine.calcTrend(cur.grossService, prev.grossService)
        }
    };
}


async function ensureAiMultiPeriodContext(){
    const key = aiPeriodCacheKey() + "|v14gate";
    if(_aiMultiPeriod && _aiMultiPeriodKey === key && _aiMultiPeriod["14hari"]){
        return _aiMultiPeriod;
    }

    const seq = ++_aiMultiPeriodSeq;
    _aiMultiPeriod = null;
    _aiMultiPeriodKey = null;
    try{
        const [d7, d14, d30, bulan] = await Promise.all([
            fetchAiPeriodSnapshot("7hari"),
            fetchAiRollingDaysSnapshot(14),
            fetchAiPeriodSnapshot("30hari"),
            fetchAiPeriodSnapshot("bulanini")
        ]);
        if(seq !== _aiMultiPeriodSeq) return null;
        if(aiPeriodCacheKey() + "|v14gate" !== key) return null;
        _aiMultiPeriod = { "7hari": d7, "14hari": d14, "30hari": d30, bulanini: bulan };
        _aiMultiPeriodKey = key;
        return _aiMultiPeriod;
    }catch(err){
        console.warn("AI multi-period context failed:", err);
        if(seq === _aiMultiPeriodSeq){
            _aiMultiPeriod = null;
            _aiMultiPeriodKey = null;
        }
        return null;
    }
}


function assessPromoReadiness(ctx){
    const activeKey = normalizePeriodeKey(DashboardEngine.lastPeriode);
    const omzet = getTrend("omzet");
    const customer = getTrend("customer");
    const transaction = getTrend("transaction");
    const service = getTrend("service");
    const avgTicket = getTrend("avgTicket");
    const cashOut = getTrend("cashOut");
    const gross = getTrend("grossService");

    const omzetDown = omzet.pct != null && omzet.pct < 0;
    const custDown = customer.pct != null && customer.pct < 0;
    const trxDown = transaction.pct != null && transaction.pct < 0;
    const avgDown = avgTicket.pct != null && avgTicket.pct < 0;
    const custNotDown = customer.pct == null || customer.pct >= 0;
    const cashOutUp = cashOut.pct != null && cashOut.pct > 0;

    const activeDays = (() => {
        const s = DashboardEngine.lastRange?.start;
        const e = DashboardEngine.lastRange?.end;
        if(!s || !e || typeof DashboardEngine.enumerateDates !== "function") return 1;
        return DashboardEngine.enumerateDates(s, e).length || 1;
    })();

    // Jendela pendek (≤7 hari filter ATAU rentang aktif < 14 hari) → diagnosa/riset, BUKAN promo.
    const shortWindow = ["hariini", "kemarin", "7hari"].includes(activeKey) || activeDays < 14;

    const p14 = ctx?.["14hari"]?.trends || null;
    const p30 = ctx?.["30hari"]?.trends || null;
    const pBulan = ctx?.bulanini?.trends || null;

    const trafficWeak = (tr) => Boolean(
        tr && tr.customer?.pct != null && tr.customer.pct < 0
        && tr.transaction?.pct != null && tr.transaction.pct < 0
    );

    // Gate ≥14 hari: bukti rolling 14 hari real (bukan sekadar label filter 30 Hari).
    const persistent14TrafficWeak = trafficWeak(p14);
    const support30TrafficWeak = trafficWeak(p30);
    const activeTrafficWeak = custDown && trxDown;
    const ticketMixIssue = omzetDown && custNotDown && avgDown;

    const evidence = [];
    evidence.push(`Periode aktif (${getPeriodeLabel(activeKey)}, ${activeDays} hari): omzet ${formatSignedPct(omzet.pct)}, customer ${formatSignedPct(customer.pct)}, transaksi ${formatSignedPct(transaction.pct)}, service ${formatSignedPct(service.pct)}, avg ticket ${formatSignedPct(avgTicket.pct)}, gross service ${formatSignedPct(gross.pct)}.`);
    if(p14){
        evidence.push(`Cek rolling 14 Hari (real): customer ${formatSignedPct(p14.customer?.pct)}, transaksi ${formatSignedPct(p14.transaction?.pct)}, service ${formatSignedPct(p14.service?.pct)}, omzet ${formatSignedPct(p14.omzet?.pct)}.`);
    }else{
        evidence.push("Cek rolling 14 Hari: masih dimuat / belum tersedia untuk AI.");
    }
    if(p30){
        evidence.push(`Cek 30 Hari: customer ${formatSignedPct(p30.customer?.pct)}, transaksi ${formatSignedPct(p30.transaction?.pct)}, omzet ${formatSignedPct(p30.omzet?.pct)}.`);
    }
    if(pBulan){
        evidence.push(`Cek Bulan Ini vs sebanding: customer ${formatSignedPct(pBulan.customer?.pct)}, transaksi ${formatSignedPct(pBulan.transaction?.pct)}, omzet ${formatSignedPct(pBulan.omzet?.pct)}.`);
    }
    evidence.push("Data traffic per jam belum tersedia — jam promo tidak ditentukan.");

    let status = "BELUM LAYAK";
    let reason = "";
    let risk = cashOutUp
        ? `Cash Out naik ${formatSignedPct(cashOut.pct)} — diskon agresif dapat menambah tekanan profitabilitas.`
        : "Diskon memotong margin; utamakan diagnosa, riset, dan aksi non-diskon dulu.";

    if(ticketMixIssue){
        status = "BELUM LAYAK";
        reason = "Omzet turun sementara customer tidak turun dan Avg Ticket turun — fokus bauran/upsell, bukan diskon traffic.";
    }else if(shortWindow){
        // ABSOLUTE: ≤7 hari / rentang <14 hari → promo/diskon FORBIDDEN sebagai rekomendasi.
        status = "BELUM LAYAK";
        reason = "Penurunan baru terlihat pada periode pendek. Belum cukup bukti untuk menyarankan promo/diskon. Prioritas: diagnosa data + riset lapangan + aksi non-diskon + monitor.";
    }else if(persistent14TrafficWeak && !ticketMixIssue){
        status = "LAYAK DIUJI";
        reason = `Traffic telah lemah pada bukti rolling ≥14 hari (customer ${formatSignedPct(p14.customer?.pct)}, transaksi ${formatSignedPct(p14.transaction?.pct)}${support30TrafficWeak ? `; 30 Hari customer ${formatSignedPct(p30.customer?.pct)}` : ""}). Setelah langkah operasional & acquisition non-diskon, promo terbatas dapat dipertimbangkan sebagai uji terukur — bukan blanket discount.`;
    }else if(activeTrafficWeak || omzetDown){
        status = "PERLU DIPANTAU";
        reason = "Ada sinyal pelemahan, tetapi bukti traffic lemah yang persisten ≥14 hari belum terpenuhi. Belum cukup bukti untuk menyarankan promo/diskon.";
    }else{
        status = "BELUM LAYAK";
        reason = "Tidak ada pola traffic lemah ≥14 hari yang memadai untuk merekomendasikan promo/diskon.";
    }

    const recommendation = status === "LAYAK DIUJI"
        ? "Hanya setelah diagnosa + aksi non-diskon: pertimbangkan uji promo terbatas pada cabang traffic lemah (durasi pendek), lalu ukur customer·transaksi·service·omzet."
        : "Jangan sarankan promo/diskon sekarang. Jalankan diagnosa, riset lapangan, perbaikan operasional, reaktivasi/visibility non-diskon, lalu monitor.";

    return {
        status,
        evidence,
        recommendation,
        reason,
        risk,
        successMetric: [
            "Customer membaik vs baseline",
            "Transaksi & service membaik",
            "Omzet membaik tanpa lonjakan Cash Out abnormal"
        ],
        cashOutAbnormal: cashOutUp && (omzetDown || activeTrafficWeak),
        activeTrafficWeak,
        longerTrafficWeak: persistent14TrafficWeak,
        persistent14TrafficWeak,
        ticketMixIssue,
        shortWindow,
        shortWindowOnly: shortWindow,
        activeDays,
        promoForbidden: shortWindow || status !== "LAYAK DIUJI"
    };
}


function buildExecutiveAiInsight(multiPeriod = _aiMultiPeriod){
    const cur = DashboardEngine.summary || {};
    const prev = DashboardEngine.previousSummary || {};
    const omzetTrend = getTrend("omzet");
    const currentOmzet = Number(cur.omzet || 0);
    const previousOmzet = Number(prev.omzet || 0);
    const omzetDelta = currentOmzet - previousOmzet;
    const noBaseline = Boolean(omzetTrend.noBaseline || omzetTrend.pct == null || omzetTrend.pct === undefined);
    const tone = noBaseline ? "warning" : (omzetTrend.tone || "neutral");
    const activeKey = normalizePeriodeKey(DashboardEngine.lastPeriode);

    let statusLabel = "— PERFORMA STABIL";
    if(noBaseline) statusLabel = "PERLU DICEK";
    else if(tone === "negative" || omzetDelta < 0) statusLabel = "▼ PERFORMA TURUN";
    else if(tone === "positive" || omzetDelta > 0) statusLabel = "▲ PERFORMA NAIK";

    // Detail summary (longer ok). Initial card uses cardSummaryHtml only.
    let summaryHtml;
    let cardSummaryHtml;
    const pctLabel = formatSignedPct(omzetTrend.pct);
    if(noBaseline){
        summaryHtml = "Data periode sebelumnya tidak tersedia — insight perbandingan belum bisa dihitung.";
        cardSummaryHtml = "Data pembanding belum tersedia";
    }else if(omzetDelta < 0){
        summaryHtml = `Omzet turun ${omzetTrend.text || pctLabel} / ${formatRupiah(Math.abs(omzetDelta))} vs periode sebelumnya.`;
        cardSummaryHtml = `Omzet TURUN ${pctLabel}<br>${formatRupiah(Math.abs(omzetDelta))}`;
    }else if(omzetDelta > 0){
        summaryHtml = `Omzet naik ${omzetTrend.text || pctLabel} / ${formatRupiah(omzetDelta)} vs periode sebelumnya.`;
        cardSummaryHtml = `Omzet NAIK ${pctLabel}<br>${formatRupiah(omzetDelta)}`;
    }else{
        summaryHtml = `Omzet tetap vs periode sebelumnya (${formatRupiah(currentOmzet)}).`;
        cardSummaryHtml = `Omzet TETAP<br>${formatRupiah(currentOmzet)}`;
    }

    const metricDefs = [
        { key: "customer", label: "Customer", money: false },
        { key: "service", label: "Service", money: false },
        { key: "avgTicket", label: "Avg Ticket", money: true },
        { key: "cash", label: "Cash", money: true },
        { key: "qris", label: "QRIS", money: true },
        { key: "cashOut", label: "Cash Out", money: true },
        { key: "transaction", label: "Transaksi", money: false },
        { key: "grossService", label: "Gross Service", money: true }
    ];

    const metricMoves = metricDefs.map((def) => {
        const c = Number(cur[def.key] || 0);
        const p = Number(prev[def.key] || 0);
        const d = c - p;
        const trend = getTrend(def.key);
        return {
            ...def,
            current: c,
            previous: p,
            delta: d,
            trend,
            text: formatMetricDeltaText(def.label, c, p, { money: def.money, trend })
        };
    });

    const decision = resolveOwnerPriorityDecision();
    const declinedBranches = decision.declinedBranches || [];
    const grownBranches = decision.grownBranches || [];
    const targetBranch = (decision.mode === "single" || decision.sufficient)
        ? (decision.branch?.name || null)
        : null;
    const allowOtherBranchNames = decision.mode === "all";
    const refBranch = (allowOtherBranchNames && grownBranches[0] && grownBranches[0].name !== targetBranch)
        ? grownBranches[0]
        : null;

    const custM = metricMoves.find((m) => m.key === "customer");
    const trxM = metricMoves.find((m) => m.key === "transaction");
    const svcM = metricMoves.find((m) => m.key === "service");
    const avgM = metricMoves.find((m) => m.key === "avgTicket");
    const coM = metricMoves.find((m) => m.key === "cashOut");
    const cashOutAbnormal = Boolean(coM && coM.delta > 0 && (omzetDelta < 0 || (custM && custM.delta < 0)));

    // A. TEMUAN DATA — fakta saja
    const findings = [];
    const findingsMeta = [];
    if(noBaseline){
        findings.push("Tidak ada data periode sebelumnya untuk mengukur perubahan.");
        findingsMeta.push({ text: findings[0], cashOut: false });
    }else{
        if(custM && custM.delta !== 0){
            findings.push(custM.text);
            findingsMeta.push({ text: custM.text, cashOut: false });
        }
        if(trxM && trxM.delta !== 0 && findings.length < 4){
            findings.push(trxM.text);
            findingsMeta.push({ text: trxM.text, cashOut: false });
        }
        if(svcM && svcM.delta !== 0 && findings.length < 4){
            findings.push(svcM.text);
            findingsMeta.push({ text: svcM.text, cashOut: false });
        }
        if(avgM && avgM.delta !== 0 && findings.length < 4){
            findings.push(avgM.text);
            findingsMeta.push({ text: avgM.text, cashOut: false });
        }
        if(coM && coM.delta > 0){
            const t = `Cash Out naik ${formatSignedPct(coM.trend?.pct)} (${formatRupiah(coM.delta)}) — sekarang ${formatRupiah(coM.current)}.`;
            findings.push(t);
            findingsMeta.push({ text: t, cashOut: true });
        }
        const focusOmzet = decision.branch?.metrics?.omzet;
        if(targetBranch && focusOmzet && focusOmzet.pct != null){
            const t = `Fokus cabang ${targetBranch}: omzet ${formatSignedPct(focusOmzet.pct)} / ${formatRupiah(focusOmzet.delta)}.`;
            findings.push(t);
            findingsMeta.push({ text: t, cashOut: false });
        }
        if(!findings.length){
            findings.push("KPI pendukung relatif seimbang pada periode aktif.");
            findingsMeta.push({ text: findings[0], cashOut: false });
        }
    }

    const promo = noBaseline
        ? {
            status: "BELUM LAYAK",
            evidence: ["Baseline periode sebelumnya tidak tersedia."],
            recommendation: "Jangan sarankan promo sampai data pembanding tersedia.",
            reason: "Tanpa baseline, AI tidak bisa membuktikan kelemahan traffic ≥14 hari.",
            risk: "Menghindari diskon tanpa bukti.",
            successMetric: ["Tunggu data periode pembanding"],
            cashOutAbnormal,
            activeTrafficWeak: false,
            longerTrafficWeak: false,
            persistent14TrafficWeak: false,
            ticketMixIssue: false,
            shortWindow: true,
            shortWindowOnly: true,
            promoForbidden: true
        }
        : assessPromoReadiness(multiPeriod);

    if(cashOutAbnormal) promo.cashOutAbnormal = true;

    const shortDecline = Boolean(promo.shortWindow && omzetDelta < 0);

    // 4. Rekomendasi operasional (non-diskon)
    const operational = [];
    if(noBaseline){
        operational.push("Pastikan sync Minutes periode pembanding tersedia.");
        operational.push("Pantau omzet, customer, dan service harian sampai baseline muncul.");
    }else{
        if(targetBranch && (omzetDelta < 0 || (custM && custM.delta < 0) || (decision.branch?.signals || []).length)){
            operational.push(`Cek operasional ${targetBranch}: ketersediaan barber/service, antrian, visibility lokal.`);
        }
        if(custM && custM.delta < 0){
            operational.push(`Diagnosa customer/transaksi/service — customer ${formatSignedPct(custM.trend?.pct)}.`);
        }
        if(promo.ticketMixIssue){
            operational.push(`Investigasi bauran/upsell — Avg Ticket ${formatSignedPct(avgM?.trend?.pct)} sementara customer tidak turun.`);
        }
        if(svcM && svcM.delta < 0){
            operational.push(`Follow-up volume service ${formatSignedPct(svcM.trend?.pct)} & performa barber.`);
        }
        if(cashOutAbnormal){
            operational.push(`Review Cash Out (RED) — naik ${formatSignedPct(coM.trend?.pct)} / ${formatRupiah(coM.delta)}; verifikasi pengeluaran & SPV bila perlu.`);
        }
        if(refBranch && decision.sufficient && targetBranch && omzetDelta > 0){
            operational.push(`Pelajari pola ${refBranch.name} sebagai referensi cabang terbaik pada periode aktif.`);
        }
        if(!operational.length){
            operational.push("Pertahankan ritme operasional; pantau customer/service harian.");
        }
    }

    // Riset yang perlu dilakukan (bukan klaim fakta eksternal)
    const researchNeeded = [];
    if(shortDecline || (omzetDelta < 0 && (custM?.delta < 0 || trxM?.delta < 0)) || (decision.branch?.signals || []).length){
        researchNeeded.push(`Perlu riset lapangan${targetBranch ? ` di ${targetBranch}` : ""}: survey traffic sekitar cabang.`);
        researchNeeded.push("Petakan sekolah/kampus/kos/gym/cafe/kantor di radius cabang (jangan diasumsikan tanpa cek).");
        researchNeeded.push("Cek kompetitor sekitar & peluang event/community/partnership.");
        researchNeeded.push("Cek Google Maps / local visibility cabang.");
    }else if(omzetDelta > 0){
        researchNeeded.push(decision.mode === "single" && targetBranch
            ? `Riset ringan di ${targetBranch}: pertahankan pola yang sudah berjalan.`
            : "Tidak ada cabang dengan bukti underperform cukup kuat — riset lapangan tidak wajib hari ini.");
    }else{
        researchNeeded.push("Tidak ada sinyal penurunan kuat — riset lapangan tidak wajib hari ini.");
    }

    // 5. Tindakan tanpa diskon
    const nonDiscount = [];
    if(!noBaseline && (custM?.delta < 0 || shortDecline || (decision.branch?.signals || []).length)){
        nonDiscount.push(`Reaktivasi customer lama / booking reminder${targetBranch ? ` (${targetBranch})` : ""} — tanpa potongan harga.`);
        nonDiscount.push("Konten lokal / Google Maps visibility.");
        nonDiscount.push("Sebar brosur hanya setelah titik potensial ditentukan dari riset.");
        nonDiscount.push("Partnership/event/kampus/komunitas — setelah riset titik target.");
    }
    if(svcM?.delta < 0 || avgM?.delta < 0){
        nonDiscount.push("Kampanye add-on/service bundle (bukan voucher diskon) bila Avg Ticket/service lemah.");
    }
    if(allowOtherBranchNames && refBranch && targetBranch && refBranch.name !== targetBranch && omzetDelta <= 0){
        nonDiscount.push(`Benchmark ${targetBranch} vs ${refBranch.name}.`);
    }
    if(!nonDiscount.length){
        nonDiscount.push("Pertahankan strategi non-diskon yang sudah berjalan; pantau KPI.");
    }

    // Inisiatif untuk detail (tanpa promo kecuali gate ≥14 hari lolos)
    const initiatives = [];
    initiatives.push({
        title: "RISET LAPANGAN",
        target: targetBranch || "cabang underperform",
        goal: "temukan penyebab traffic & peluang akuisisi",
        text: `Cek penyebab penurunan${targetBranch ? ` di ${targetBranch}` : ""} dan lakukan riset lapangan — survey traffic, kompetitor, titik sekolah/kampus/kos/gym/cafe.`
    });
    if(custM?.delta < 0 || shortDecline || (decision.branch?.signals || []).length){
        initiatives.push({
            title: "REAKTIVASI WA / BOOKING",
            target: targetBranch || "customer lama",
            goal: "reaktivasi tanpa diskon",
            text: `Broadcast WA / reminder booking${targetBranch ? ` ${targetBranch}` : ""} — tanpa promo/diskon otomatis; butuh persetujuan Owner.`
        });
    }
    initiatives.push({
        title: "OFFLINE / PARTNERSHIP",
        target: targetBranch || "area cabang",
        goal: "akuisisi non-diskon",
        text: "Setelah riset: brosur di titik potensial, event komunitas/kampus, partnership gym/cafe/kos/kantor — fakta titik harus diverifikasi di lapangan."
    });
    initiatives.push({
        title: "MONITOR",
        target: "3–7 hari berikutnya",
        goal: "ukur dampak tanpa diskon",
        text: "Pantau customer · transaksi · service · omzet setelah tindakan; bandingkan dengan baseline periode ini."
    });
    if(promo.status === "LAYAK DIUJI" && !promo.promoForbidden){
        initiatives.push({
            title: "PROMO TERBATAS (OPSI TERAKHIR)",
            target: targetBranch || "cabang traffic lemah ≥14 hari",
            goal: "uji terukur setelah non-diskon",
            text: `Hanya karena bukti traffic ≥14 hari: uji promo terbatas dapat dipertimbangkan setelah aksi non-diskon. ${promo.reason}`
        });
    }
    const initiativeList = initiatives.slice(0, 5);

    const ownerPriorityTop = buildOwnerPriorityLines(decision, {
        noBaseline,
        shortDecline,
        omzetDelta,
        promo,
        cashOutAbnormal,
        coM
    }).slice(0, 3);

    // Initial card DISPLAY ONLY — one concise visible line (logic/detail unchanged).
    const primaryActionRaw = String(ownerPriorityTop[0] || OWNER_PRIORITY_NEUTRAL);
    let cardPrimaryAction = primaryActionRaw;
    if(primaryActionRaw === OWNER_PRIORITY_NEUTRAL){
        cardPrimaryAction = OWNER_PRIORITY_NEUTRAL;
    }else if(/cek penyebab|riset lapangan/i.test(primaryActionRaw)){
        cardPrimaryAction = targetBranch
            ? `Cek penyebab traffic ${targetBranch} + riset lapangan`
            : "Cek penyebab traffic + riset lapangan";
    }else if(cardPrimaryAction.length > 72){
        cardPrimaryAction = `${cardPrimaryAction.slice(0, 69).trim()}…`;
    }

    const multiLines = [];
    if(multiPeriod?.["7hari"]){
        const t = multiPeriod["7hari"].trends;
        multiLines.push(`7 Hari: omzet ${formatSignedPct(t.omzet?.pct)}, customer ${formatSignedPct(t.customer?.pct)}, transaksi ${formatSignedPct(t.transaction?.pct)}.`);
    }
    if(multiPeriod?.["14hari"]){
        const t = multiPeriod["14hari"].trends;
        multiLines.push(`14 Hari (rolling): omzet ${formatSignedPct(t.omzet?.pct)}, customer ${formatSignedPct(t.customer?.pct)}, transaksi ${formatSignedPct(t.transaction?.pct)}.`);
    }
    if(multiPeriod?.["30hari"]){
        const t = multiPeriod["30hari"].trends;
        multiLines.push(`30 Hari: omzet ${formatSignedPct(t.omzet?.pct)}, customer ${formatSignedPct(t.customer?.pct)}, transaksi ${formatSignedPct(t.transaction?.pct)}.`);
    }
    if(multiPeriod?.bulanini){
        const t = multiPeriod.bulanini.trends;
        multiLines.push(`Bulan Ini: omzet ${formatSignedPct(t.omzet?.pct)}, customer ${formatSignedPct(t.customer?.pct)}, transaksi ${formatSignedPct(t.transaction?.pct)}.`);
    }
    if(!multiLines.length){
        multiLines.push("Multi-period check sedang dimuat dari data ERP real…");
    }

    const unknown = [];
    if(shortDecline){
        unknown.push("Penyebab pasti penurunan pendek belum terbukti dari ERP.");
        unknown.push("Titik akuisisi offline (sekolah/kampus/kos/event) belum diverifikasi lapangan.");
        unknown.push("Data traffic per jam belum tersedia.");
    }else{
        unknown.push("Faktor eksternal (kompetitor/event lokal) tidak ada di ERP — perlu riset bila relevan.");
        unknown.push("Data traffic per jam belum tersedia.");
    }

    const monitoring = [
        "Pantau customer, transaksi, service, omzet harian setelah tindakan.",
        "Bandingkan dengan baseline periode aktif.",
        cashOutAbnormal
            ? "Pantau Cash Out agar tidak naik saat recovery."
            : "Pastikan recovery tidak mengandalkan diskon prematur."
    ];

    return {
        tone,
        statusLabel,
        summaryHtml,
        cardSummaryHtml,
        cardPrimaryAction,
        findingsAll: findingsMeta,
        actions: ownerPriorityTop,
        promo,
        filterKey: aiPeriodCacheKey(),
        priorityBranch: targetBranch,
        priorityMode: decision.mode,
        detail: {
            kondisi: [
                `Cabang: ${decision.cabangLabel}`,
                `Periode aktif: ${getPeriodeLabel(activeKey)}`,
                ...(noBaseline
                    ? ["Tidak ada baseline periode sebelumnya."]
                    : [
                        `Status: ${statusLabel}`,
                        `Omzet: ${formatRupiah(currentOmzet)} vs ${formatRupiah(previousOmzet)} → ${formatRupiah(omzetDelta)} (${omzetTrend.text || formatSignedPct(omzetTrend.pct)})`
                    ])
            ],
            buktiData: noBaseline
                ? ["Perubahan KPI tidak dihitung tanpa periode pembanding."]
                : [
                    ...findingsMeta.map((f) => (typeof f === "string" ? f : f.text)),
                    ...multiLines,
                    ...declinedBranches.slice(0, 3).map((b) => {
                        const om = b.metrics?.omzet || {};
                        return `Cabang ${b.name}: ${formatSignedPct(om.pct)} / ${formatRupiah(om.delta)}`;
                    })
                ],
            unknown,
            researchNeeded,
            nonDiscount,
            operational,
            monitoring,
            initiatives: initiativeList,
            ownerPriority: ownerPriorityTop,
            promo,
            // legacy keys kept for safety if referenced elsewhere
            performance: null,
            temuanData: findingsMeta,
            attentionBranches: declinedBranches.slice(0, 5).map((b) => {
                const om = b.metrics?.omzet || {};
                return `${b.name}: ${formatRupiah(om.value)} (prev ${formatRupiah(om.prevValue)}) → ${formatSignedPct(om.pct)} / ${formatRupiah(om.delta)}`;
            })
        }
    };
}


function paintExecutiveAiInsight(insight){
    const statusEl = document.getElementById("execAiStatus");
    const summaryEl = document.getElementById("execAiSummary");
    const actionEl = document.getElementById("execAiPrimaryAction");

    if(statusEl){
        statusEl.classList.remove("positive", "negative", "neutral", "warning");
        statusEl.classList.add(insight.tone || "neutral");
        statusEl.innerHTML = colorizeAiSemanticHtml(insight.statusLabel);
    }
    if(summaryEl){
        const brief = insight.cardSummaryHtml || insight.summaryHtml || "—";
        const parts = String(brief).split(/<br\s*\/?>/i);
        summaryEl.innerHTML = parts.map((p, idx) => {
            if(idx > 0 && /^Rp[\d.\s]+$/.test(String(p).trim())){
                const cls = insight.tone === "positive"
                    ? "ai-num-up"
                    : insight.tone === "negative"
                        ? "ai-num-down"
                        : "";
                return cls
                    ? `<span class="${cls}">${escapeHtmlExec(p.trim())}</span>`
                    : escapeHtmlExec(p.trim());
            }
            return colorizeAiSemanticHtml(p);
        }).join("<br>");
    }
    if(actionEl){
        actionEl.innerHTML = colorizeAiSemanticHtml(insight.cardPrimaryAction || "—");
    }
    try{
        if(typeof VaxAiInsight !== "undefined" && typeof VaxAiInsight.paintFrom === "function"){
            VaxAiInsight.paintFrom(insight);
        }
    }catch(_err){
        /* Lower AI presenter must never interrupt top AI or ERP paint. */
    }
}


function renderExecutiveAiInsight(){
    const root = document.getElementById("execAiInsight");
    const vaxRoot = document.getElementById("vaxAiInsight");
    if(!root && !vaxRoot) return;

    const liveKey = aiPeriodCacheKey() + "|v14gate";
    if(_lastExecAiInsight && _lastExecAiInsight.filterKey !== aiPeriodCacheKey()){
        _lastExecAiInsight = null;
    }
    if(_aiMultiPeriod && _aiMultiPeriodKey !== liveKey){
        invalidateAiMultiPeriodCache();
    }

    const insight = buildExecutiveAiInsight(_aiMultiPeriod);
    _lastExecAiInsight = insight;
    paintExecutiveAiInsight(insight);

    // Enrich multi-period (read-only) lalu refresh saran promo — tanpa mengubah KPI dashboard.
    const keyAtStart = aiPeriodCacheKey();
    ensureAiMultiPeriodContext().then((ctx) => {
        if(!ctx) return;
        if(aiPeriodCacheKey() !== keyAtStart) return;
        const next = buildExecutiveAiInsight(ctx);
        _lastExecAiInsight = next;
        paintExecutiveAiInsight(next);
        if(isExecutiveAiDetailOpen()){
            openExecutiveAiDetail();
        }
    });
}


function isExecutiveAiDetailOpen(){
    const modal = document.getElementById("execAiInsightModal");
    return Boolean(modal && !modal.hidden);
}


function openExecutiveAiDetail(){
    const modal = document.getElementById("execAiInsightModal");
    const body = document.getElementById("execAiModalBody");
    if(!modal || !body) return;

    const liveKey = aiPeriodCacheKey();
    let insight = _lastExecAiInsight;
    if(!insight || insight.filterKey !== liveKey){
        insight = buildExecutiveAiInsight(_aiMultiPeriod);
        _lastExecAiInsight = insight;
    }
    const d = insight.detail || {};
    const promo = d.promo || insight.promo || {};

    const sectionList = (title, items, opts = {}) => {
        const rows = (items && items.length) ? items : ["Tidak ada item pada bagian ini."];
        const list = rows.map((item) => {
            const text = typeof item === "string" ? item : item.text;
            const cash = typeof item === "object" && item.cashOut;
            return `<li class="${cash ? "is-cashout-alert" : ""}">${colorizeAiSemanticHtml(text)}</li>`;
        }).join("");
        const extraClass = opts.priority ? " exec-ai-owner-priority" : "";
        return `<section class="exec-ai-modal-section"><h4>${escapeHtmlExec(title)}</h4><ul class="${extraClass.trim()}">${list}</ul></section>`;
    };

    const promoClass = promo.status === "LAYAK DIUJI"
        ? "is-layak"
        : promo.status === "PERLU DIPANTAU"
            ? "is-pantau"
            : "is-belum";

    const promoGateLine = promo.shortWindow || promo.status !== "LAYAK DIUJI"
        ? "Belum cukup bukti untuk menyarankan promo/diskon."
        : "Gate ≥14 hari terpenuhi pada bukti traffic — promo hanya opsi terakhir setelah non-diskon.";

    const promoSection = `
        <section class="exec-ai-modal-section">
            <h4>7. PROMO ELIGIBILITY</h4>
            <p><span class="exec-ai-promo-badge ${promoClass}">${escapeHtmlExec(promo.status || "BELUM LAYAK")}</span></p>
            <p style="margin-top:10px;font-weight:800">${colorizeAiSemanticHtml(promoGateLine)}</p>
            <p style="margin-top:10px"><strong>BUKTI</strong></p>
            <ul>${(promo.evidence || []).map((t) => `<li>${colorizeAiSemanticHtml(t)}</li>`).join("") || "<li>—</li>"}</ul>
            <p style="margin-top:10px"><strong>ALASAN</strong></p>
            <p>${colorizeAiSemanticHtml(promo.reason || "—")}</p>
            <p style="margin-top:10px"><strong>REKOMENDASI</strong></p>
            <p>${colorizeAiSemanticHtml(promo.recommendation || "—")}</p>
            <p style="margin-top:10px"><strong>RISIKO</strong></p>
            <p class="${promo.cashOutAbnormal ? "exec-ai-cashout-alert" : ""}">${colorizeAiSemanticHtml(promo.risk || "—")}</p>
            <p style="margin-top:10px;color:#94A3B8;font-size:14px;font-weight:700">
                Saran saja — tidak ada eksekusi otomatis. Promo/diskon terkunci kecuali bukti traffic ≥14 hari.
            </p>
        </section>
    `;

    body.innerHTML = [
        sectionList("1. KONDISI", d.kondisi || d.performance),
        sectionList("2. BUKTI DATA", d.buktiData || d.temuanData),
        sectionList("3. APA YANG BELUM DIKETAHUI", d.unknown),
        sectionList("4. RISET YANG PERLU DILAKUKAN", d.researchNeeded),
        sectionList("5. TINDAKAN TANPA DISKON", d.nonDiscount),
        sectionList("6. MONITORING", d.monitoring),
        promoSection,
        sectionList("PRIORITAS OWNER", d.ownerPriority, { priority: true })
    ].join("");

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("exec-ai-modal-open");
}


function closeExecutiveAiDetail(){
    const modal = document.getElementById("execAiInsightModal");
    if(modal){
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("exec-ai-modal-open");
}
