/* VAX AI Insight presenter: ../js/modules/vax-ai-insight.js (read-only). */
/* Dashboard-only UI add-on: no KPI/finance engine or source writer is modified. */
if (document.body.classList.contains("page-erp-dashboard")) {
    // Existing engine is a top-level const; expose a read-only reference for the isolated card.
    if (typeof DashboardEngine !== "undefined") window.DashboardEngine = DashboardEngine;
    const loadUi = () => {
        const card = document.createElement("script");
        card.src = "../js/modules/dashboard-ultimate-card-ui.js?v=20260918-ui1";
        document.head.appendChild(card);
    };
    if (window.LaporanBulananPerformanceKpiBridge) {
        loadUi();
    } else {
        const existingBridge = document.createElement("script");
        existingBridge.src = "../js/modules/laporan-bulanan-performance-kpi-bridge.js?v=20260918-ui1";
        existingBridge.onload = loadUi;
        existingBridge.onerror = () => console.warn("[Dashboard Ultimate Card] Bridge read-only belum tersedia.");
        document.head.appendChild(existingBridge);
    }
}
