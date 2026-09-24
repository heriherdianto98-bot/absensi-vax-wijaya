/*
=========================================================
ERP VAX WIJAYA
loader.js
Version : 2.1.2 — Payroll sidebar entry
Safety  : UI shell only; no auth/query/workflow change
=========================================================
*/

let _erpDashboardBooted = false;
let _erpShellChromeInited = false;

async function loadComponent(targetId, file) {
    try {
        const response = await fetch(file);
        if (!response.ok) throw new Error(file);
        const html = await response.text();
        document.getElementById(targetId).innerHTML = html;
        initializeComponent(targetId);
        if(targetId==="chart-section") setTimeout(initChart,100);
    } catch (err) {
        console.error("Load Component Error :", err);
    }
}

function initializeComponent(targetId){
    if(targetId==="sidebar") initSidebar();
}

function ensureSidebarBackdrop(){
    let bd = document.getElementById("erpSidebarBackdrop");
    if(!bd){
        bd = document.createElement("div");
        bd.id = "erpSidebarBackdrop";
        bd.className = "erp-sidebar-backdrop";
        bd.addEventListener("click", closeMobileSidebar);
        document.body.appendChild(bd);
    }
    return bd;
}

function openMobileSidebar(){
    const sidebar = document.querySelector(".sidebar");
    if(!sidebar) return;
    ensureSidebarBackdrop();
    sidebar.classList.add("is-mobile-open");
    document.body.classList.add("erp-drawer-open");
}

function closeMobileSidebar(){
    const sidebar = document.querySelector(".sidebar");
    sidebar?.classList.remove("is-mobile-open");
    document.body.classList.remove("erp-drawer-open");
}

function isErpDashboardPage(){
    const path = String(window.location.pathname || "").toLowerCase();
    return path.endsWith("/erp-dashboard.html") || path.endsWith("erp-dashboard.html");
}

function ensurePayrollSidebarEntry(){
    const sidebar = document.querySelector(".sidebar");
    if(!sidebar || sidebar.querySelector('[data-erp-nav="payroll"]')) return;

    const karyawan = sidebar.querySelector('[data-erp-nav="karyawan"]');
    if(!karyawan) return;

    const link = document.createElement("a");
    link.href = "./payroll-capster.html";
    link.className = "menu-item";
    link.dataset.erpNav = "payroll";
    link.innerHTML = '<span class="menu-icon" aria-hidden="true">▤</span><span>Master Gaji</span>';

    const host = karyawan.parentElement;
    if(host && host !== sidebar && host.children.length === 1){
        host.insertAdjacentElement("afterend", link);
    }else{
        karyawan.insertAdjacentElement("afterend", link);
    }
}

function initSidebar(){
    const sidebar=document.querySelector(".sidebar");
    const btn=document.getElementById("sidebarToggle");
    if(!sidebar || !btn) return;

    ensurePayrollSidebarEntry();

    const status=localStorage.getItem("sidebar-collapse");
    if(status==="true"){
        sidebar.classList.add("collapsed");
        document.body.classList.add("sidebar-collapsed");
    }

    btn.onclick=()=>{
        if(window.matchMedia("(max-width:900px)").matches){
            if(sidebar.classList.contains("is-mobile-open")) closeMobileSidebar();
            else openMobileSidebar();
            return;
        }
        sidebar.classList.toggle("collapsed");
        const collapsed = sidebar.classList.contains("collapsed");
        document.body.classList.toggle("sidebar-collapsed", collapsed);
        localStorage.setItem("sidebar-collapse", collapsed ? "true" : "false");
    };

    markActiveSidebarLink();
    syncSidebarRoleMeta();
    bindSidebarMenuGroups();
}

const ERP_LAPORAN_NAV = ["tabel-harian", "setoran", "setoran-bulanan", "qris", "laporan"];

function setLaporanMenuOpen(open){
    const group = document.querySelector('.sidebar .menu-group[data-erp-menu-group="laporan"]');
    if(!group) return;
    const parent = group.querySelector(".menu-item-parent");
    const sub = group.querySelector(".menu-submenu");
    group.classList.toggle("is-open", !!open);
    if(parent) parent.setAttribute("aria-expanded", open ? "true" : "false");
    if(sub){
        if(open) sub.removeAttribute("hidden");
        else sub.setAttribute("hidden", "");
    }
}

function bindSidebarMenuGroups(){
    const parent = document.querySelector('.sidebar .menu-item-parent[data-erp-parent="laporan"]');
    if(!parent || parent.dataset.bound === "1") return;
    parent.dataset.bound = "1";
    parent.addEventListener("click", (e) => {
        e.preventDefault();
        const group = parent.closest(".menu-group");
        const willOpen = !group?.classList.contains("is-open");
        setLaporanMenuOpen(willOpen);
    });
}

function markActiveSidebarLink(){
    const path = (location.pathname || "").toLowerCase();
    let nav = "";
    if(path.includes("setoran-3-harian")){
        try{
            const menu = String(new URLSearchParams(location.search).get("menu") || "").toLowerCase();
            nav = menu === "qris" ? "qris" : "setoran";
        }catch(_e){ nav = "setoran"; }
    }
    else if(path.includes("cash-out")) nav = "cash-out";
    else if(path.includes("arus-kas")) nav = "arus-kas";
    else if(path.includes("tabel-harian-cabang")) nav = "tabel-harian";
    else if(path.includes("erp-dashboard")) nav = "dashboard";
    else if(path.includes("finance")){
        try{
            const menu = String(new URLSearchParams(location.search).get("menu") || "").toLowerCase();
            const allowed = ["cash-out","arus-kas","qris","cash-in","laporan","setoran-bulanan","reimbursement"];
            nav = allowed.includes(menu) ? menu : "laporan";
        }catch(_e){ nav = "laporan"; }
    }
    else if(path.includes("absensi") || path.includes("dashboard_owner") || path.includes("dashboard-owner")) nav = "absensi";
    else if(path.includes("pengumuman")) nav = "pengumuman";
    else if(path.includes("pengaduan")) nav = "pengaduan";
    else if(path.includes("payroll")) nav = "payroll";
    else if(path.includes("karyawan")) nav = "karyawan";
    else if(path.includes("cabang")) nav = "cabang";
    else if(path.includes("pengaturan")) nav = "settings";

    document.querySelectorAll(".sidebar .menu-item").forEach((a) => {
        const key = a.dataset.erpNav || "";
        const isParent = a.classList.contains("menu-item-parent");
        if(isParent){
            a.classList.remove("active");
            a.classList.toggle("is-active-parent", ERP_LAPORAN_NAV.includes(nav));
            return;
        }
        a.classList.toggle("active", !!nav && key === nav);
    });

    if(ERP_LAPORAN_NAV.includes(nav)) setLaporanMenuOpen(true);
}

function syncSidebarRoleMeta(){
    const roleEl = document.getElementById("ownerAuthRole");
    const nameEl = document.getElementById("ownerAuthName");
    const sideRole = document.getElementById("sidebarRoleName");
    const sideBranch = document.getElementById("sidebarRoleBranch");
    if(sideRole){
        const role = roleEl?.textContent?.trim() || "—";
        const name = nameEl?.textContent?.trim() || "";
        sideRole.textContent = name ? `${role} · ${name}` : role;
    }
    if(sideBranch && !sideBranch.dataset.locked){
        const cabang = document.getElementById("erpHeaderCabang")?.textContent?.trim();
        sideBranch.textContent = cabang && cabang !== "—" ? cabang : "";
    }
}

function syncHeaderContextFromPage(){
    const cabangEl = document.getElementById("erpHeaderCabang");
    const periodeEl = document.getElementById("erpHeaderPeriode");
    const branchFilter = document.getElementById("branchFilter");
    const periodFilter = document.getElementById("periodFilter");
    const activeCabang = document.getElementById("setoran3ActiveCabang");
    const periodBtn = document.getElementById("setoran3PeriodBtn");
    const arusCabang = document.getElementById("arusKasCabang");
    const arusPeriode = document.getElementById("arusKasPeriode");

    if(cabangEl){
        if(activeCabang?.textContent?.trim()) cabangEl.textContent = activeCabang.textContent.trim();
        else if(arusCabang?.selectedOptions?.[0]?.textContent?.trim()) cabangEl.textContent = arusCabang.selectedOptions[0].textContent.trim();
        else if(branchFilter?.selectedOptions?.[0]) cabangEl.textContent = branchFilter.selectedOptions[0].textContent.trim();
    }

    if(periodeEl){
        if(periodBtn?.textContent?.trim() && !periodBtn.textContent.includes("PILIH PERIODE")){
            periodeEl.textContent = periodBtn.textContent.replace(/^📅\s*/,"").trim();
        }else if(arusPeriode && typeof ArusKas !== "undefined" && typeof ArusKas.formatHeaderPeriode === "function"){
            periodeEl.textContent = ArusKas.formatHeaderPeriode(ArusKas.getActiveFilter());
        }else if(typeof getPeriodeLabel === "function" && typeof DashboardEngine !== "undefined" && DashboardEngine.lastPeriode){
            periodeEl.textContent = getPeriodeLabel(DashboardEngine.lastPeriode);
        }else if(periodFilter?.selectedOptions?.[0]){
            const key = String(periodFilter.value || "").toLowerCase().replace(/\s+/g,"");
            if(key === "custom-active" || key === "customactive"){
                periodeEl.textContent = periodFilter.selectedOptions[0].textContent.trim();
            }else if(key === "customtanggal"){
                const start = document.getElementById("customStartDate")?.value || (typeof DashboardEngine !== "undefined" ? DashboardEngine.lastCustomStart : null);
                const end = document.getElementById("customEndDate")?.value || (typeof DashboardEngine !== "undefined" ? DashboardEngine.lastCustomEnd : null);
                if(start && end && typeof DashboardEngine !== "undefined" && typeof DashboardEngine.isFullCalendarMonth === "function" && DashboardEngine.isFullCalendarMonth(start, end) && typeof formatMonthYearId === "function") periodeEl.textContent = formatMonthYearId(start);
                else if(start && end && typeof formatDisplayRange === "function") periodeEl.textContent = formatDisplayRange(start, end);
                else if(start && end) periodeEl.textContent = `${start} — ${end}`;
                else periodeEl.textContent = "Custom Tanggal";
            }else periodeEl.textContent = periodFilter.selectedOptions[0].textContent.trim();
        }
    }
    syncSidebarRoleMeta();
}

function initErpShellChrome(){
    if(_erpShellChromeInited) return;
    _erpShellChromeInited = true;
    ensureSidebarBackdrop();
    document.body.classList.add("has-bottom-nav");
    const mobileBtn = document.getElementById("erpMobileMenuBtn");
    mobileBtn?.addEventListener("click", () => {
        const sidebar = document.querySelector(".sidebar");
        if(sidebar?.classList.contains("is-mobile-open")) closeMobileSidebar();
        else openMobileSidebar();
    });
    document.querySelectorAll(".sidebar .menu-item").forEach((a) => {
        a.addEventListener("click", () => {
            if(window.matchMedia("(max-width:900px)").matches) closeMobileSidebar();
        });
    });
    syncHeaderContextFromPage();
    initStickyTopHeaderChrome();
    const branchFilter = document.getElementById("branchFilter");
    const periodFilter = document.getElementById("periodFilter");
    branchFilter?.addEventListener("change", syncHeaderContextFromPage);
    periodFilter?.addEventListener("change", syncHeaderContextFromPage);
    const obsTarget = document.getElementById("setoran3ActiveCabang") || document.getElementById("toolbar");
    if(obsTarget && typeof MutationObserver !== "undefined"){
        const mo = new MutationObserver(() => syncHeaderContextFromPage());
        mo.observe(obsTarget, { childList:true, subtree:true, characterData:true });
    }
}

function initStickyTopHeaderChrome(){
    const header = document.querySelector(".top-header, .erp-header");
    const lock = document.getElementById("header") || header;
    if(!header || header.dataset.stickyChromeBound === "1") return;
    header.dataset.stickyChromeBound = "1";
    const sync = () => {
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        const scrolled = y > 4;
        header.classList.toggle("is-scrolled", scrolled);
        if(lock && lock !== header) lock.classList.toggle("is-scrolled", scrolled);
        const h = Math.max((lock && lock.offsetHeight) || header.offsetHeight || 0, 64);
        document.documentElement.style.setProperty("--erp-top-header-h", `${h}px`);
    };
    window.addEventListener("scroll", sync, { passive:true });
    window.addEventListener("resize", sync, { passive:true });
    if(typeof ResizeObserver !== "undefined"){
        const ro = new ResizeObserver(sync);
        ro.observe(lock || header);
    }
    sync();
}

async function bootErpDashboard(){
    if(!isErpDashboardPage()) return;
    if(_erpDashboardBooted) return;
    _erpDashboardBooted = true;
    await Promise.all([
        loadComponent("sidebar","../components/sidebar.html"),
        loadComponent("header","../components/header.html"),
        loadComponent("toolbar","../components/toolbar.html"),
        loadComponent("kpi-section","../components/kpi.html"),
        loadComponent("chart-section","../components/chart.html"),
        loadComponent("ranking-section","../components/ranking.html"),
        loadComponent("widget-section","../components/ai-insight.html"),
        loadComponent("activity-section","../components/live-activity.html"),
        loadComponent("payment-section","../components/payment-summary.html"),
        loadComponent("executive-summary","../components/executive-summary.html")
    ]);
    if(typeof OwnerAuth !== "undefined"){
        OwnerAuth.bindUi();
        OwnerAuth.syncHeader();
        OwnerAuth.applyAccessControl();
    }
    initErpShellChrome();
    document.body.classList.remove("owner-auth-pending", "erp-drawer-open", "dashboard-loading");
    document.querySelector(".sidebar")?.classList.remove("is-mobile-open");
    const sideBd = document.getElementById("erpSidebarBackdrop");
    if(sideBd){
        sideBd.style.removeProperty("display");
        sideBd.setAttribute("aria-hidden", "true");
    }
    syncSidebarRoleMeta();
    markActiveSidebarLink();
    const title = document.getElementById("erpHeaderTitle");
    const sub = document.getElementById("erpHeaderSub");
    if(title) title.textContent = "Dashboard";
    if(sub) sub.textContent = "Ringkasan performa cabang";
    document.dispatchEvent(new CustomEvent("erp:components-ready"));
}

function onDashboardReady(){
    if(!isErpDashboardPage()) return;
    bootErpDashboard();
}
document.addEventListener("erp:dashboard-ready", onDashboardReady);
document.addEventListener("erp:owner-ready", onDashboardReady);

/* =========================================================
   OWNER HEADER EMPHASIS — UI ONLY
   Runtime style is injected after page inline locks so it
   intentionally wins without touching engine/filter logic.
   ========================================================= */
function ensureOwnerHeaderEmphasisStyle(){
    if(!isErpDashboardPage()) return;
    if(document.getElementById("ownerHeaderEmphasisStyle")) return;

    const style = document.createElement("style");
    style.id = "ownerHeaderEmphasisStyle";
    style.textContent = `
        html body.page-erp-dashboard .erp-wrapper{
            padding-top:76px !important;
        }
        html body.page-erp-dashboard #header .top-header,
        html body.page-erp-dashboard #header .erp-header,
        html body.page-erp-dashboard #header .od-command-bar{
            position:relative !important;
            isolation:isolate !important;
            overflow:hidden !important;
            height:76px !important;
            min-height:76px !important;
            max-height:76px !important;
            padding:0 20px !important;
            gap:12px !important;
            background:linear-gradient(180deg,#131820 0%,#0D1117 100%) !important;
            box-shadow:inset 0 -1px 0 rgba(242,194,48,.14),0 6px 20px rgba(0,0,0,.28) !important;
        }
        html body.page-erp-dashboard #header .top-header::after,
        html body.page-erp-dashboard #header .erp-header::after,
        html body.page-erp-dashboard #header .od-command-bar::after{
            content:"";
            position:absolute;
            inset:0;
            z-index:0;
            pointer-events:none;
            background:
                radial-gradient(70% 120% at 18% 50%,rgba(242,194,48,.42) 0%,rgba(242,194,48,.08) 35%,transparent 72%),
                radial-gradient(60% 120% at 82% 50%,rgba(34,211,238,.16) 0%,transparent 68%),
                linear-gradient(90deg,rgba(242,194,48,.08),rgba(255,255,255,.015),rgba(242,194,48,.06));
            opacity:.12;
            animation:ownerHeaderBackgroundPulse 1.9s ease-in-out infinite;
            will-change:opacity,filter;
        }
        html body.page-erp-dashboard #header .top-header > *,
        html body.page-erp-dashboard #header .erp-header > *,
        html body.page-erp-dashboard #header .od-command-bar > *{
            position:relative;
            z-index:1;
        }
        html body.page-erp-dashboard #header .header-context{
            gap:10px !important;
        }
        html body.page-erp-dashboard #header .header-chip,
        html body.page-erp-dashboard #header .od-chip{
            min-height:50px !important;
            padding:6px 16px !important;
            gap:2px !important;
            border:1px solid rgba(242,194,48,.30) !important;
            border-radius:12px !important;
            background:linear-gradient(180deg,rgba(242,194,48,.09),rgba(255,255,255,.02)) !important;
            box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 0 0 1px rgba(242,194,48,.05) !important;
            animation:none !important;
        }
        html body.page-erp-dashboard #header .header-chip + .header-chip{
            border-left:1px solid rgba(242,194,48,.30) !important;
        }
        html body.page-erp-dashboard #header .header-chip label{
            font-size:11px !important;
            line-height:1.12 !important;
            font-weight:800 !important;
            letter-spacing:.10em !important;
            color:#AAB2BD !important;
        }
        html body.page-erp-dashboard #header .header-chip strong,
        html body.page-erp-dashboard #header #erpHeaderCabang,
        html body.page-erp-dashboard #header #erpHeaderPeriode{
            font-size:17px !important;
            line-height:1.15 !important;
            font-weight:900 !important;
            color:#F8FAFC !important;
        }
        html body.page-erp-dashboard #header .header-chip .material-symbols-rounded,
        html body.page-erp-dashboard #header .header-context .material-symbols-rounded,
        html body.page-erp-dashboard #header .header-chip-icon{
            font-size:23px !important;
            width:23px !important;
            height:23px !important;
        }
        html body.page-erp-dashboard #header .header-minutes-status{
            min-height:44px !important;
            padding:0 10px !important;
        }
        html body.page-erp-dashboard #header .header-icon-btn{
            width:40px !important;
            height:40px !important;
            min-height:40px !important;
            flex-basis:40px !important;
        }
        html body.page-erp-dashboard #header .header-icon-btn .material-symbols-rounded{
            font-size:23px !important;
        }
        html body.page-erp-dashboard #header .header-user-block{
            min-height:44px !important;
        }
        html body.page-erp-dashboard #header #ownerAuthName,
        html body.page-erp-dashboard #header .header-auth-meta strong{
            font-size:15px !important;
        }
        html body.page-erp-dashboard #header #ownerAuthRole,
        html body.page-erp-dashboard #header .header-auth-meta span{
            font-size:10px !important;
        }
        html body.page-erp-dashboard #header .btn-owner-logout{
            height:40px !important;
            min-height:40px !important;
            padding:0 15px !important;
            font-size:13px !important;
        }
        @keyframes ownerHeaderBackgroundPulse{
            0%,100%{
                opacity:.10;
                filter:brightness(.9) saturate(.9);
            }
            50%{
                opacity:.48;
                filter:brightness(1.35) saturate(1.35);
            }
        }
        @media (prefers-reduced-motion: reduce){
            html body.page-erp-dashboard #header .top-header::after,
            html body.page-erp-dashboard #header .erp-header::after,
            html body.page-erp-dashboard #header .od-command-bar::after{
                animation:none !important;
                opacity:.18;
            }
        }
    `;
    document.head.appendChild(style);
    document.documentElement.style.setProperty("--erp-top-header-h", "76px");
}

document.addEventListener("erp:components-ready", ensureOwnerHeaderEmphasisStyle);

/* =========================================================
   ERP ASSISTANT GLOBAL HELP DESK — UI/HELPER ONLY
   Loads a separate context-help layer. No LOCK engine touched.
   ========================================================= */
(function loadErpGlobalHelpDesk(){
    if(window.__ERP_GLOBAL_HELP_DESK_SCRIPT_REQUESTED__) return;
    window.__ERP_GLOBAL_HELP_DESK_SCRIPT_REQUESTED__ = true;
    const s = document.createElement("script");
    s.src = "../js/modules/erp-assistant-global-help.js";
    s.defer = true;
    s.onerror = () => console.warn("ERP Help Desk UI layer failed to load");
    document.head.appendChild(s);
})();
