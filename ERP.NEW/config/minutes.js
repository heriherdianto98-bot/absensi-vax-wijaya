/*
=========================================================
VAX ERP — Minutes Sync (config stub)
=========================================================
Minutes data masuk ke Supabase via VPS auto-sync (LOCKED):
  PM2 minutes-sync + scheduler.js
  path production VPS: /var/www/absensi-vax-wijaya/minutes-connector

Dashboard membaca freshness dari Supabase synced_at
(DashboardEngine.lastSync) — BUKAN browser → /api/sync.

Eksperimen Direct VPS HTTP API (/api/sync*) dibatalkan.
=========================================================
*/

/**
 * Display-only mirror of production scheduler window.
 * Source of truth: minutes-connector/scheduler.js
 *   dalamJamOperasional(): jam >= 7 && jam <= 23 (WIB)
 *   → aktif 07.00–23.59 WIB; jeda 00.00–06.59 WIB
 *
 * DO NOT use this object to trigger sync.
 * DO NOT change connector / PM2 / scheduler from the Dashboard.
 */
const MinutesSyncDisplay = {
    /* Mirrors scheduler.js dalamJamOperasional() */
    ACTIVE_HOUR_START_WIB: 7,
    ACTIVE_HOUR_END_WIB_INCLUSIVE: 23,

    /* Existing dashboard freshness threshold (renderToolbarSyncStatus) */
    FRESH_MAX_MINUTES: 120,

    SCHEDULE_LABEL: "07.00–23.59 WIB",
    PAUSE_LABEL: "00.00–06.59 WIB",

    isConfigured(){
        return Number.isFinite(this.ACTIVE_HOUR_START_WIB)
            && Number.isFinite(this.ACTIVE_HOUR_END_WIB_INCLUSIVE);
    },

    /** Current hour 0–23 in Asia/Jakarta */
    getJakartaHour(){
        const raw = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            hour12: false
        }).format(new Date());
        const hour = Number(String(raw).split(":")[0]);
        return Number.isFinite(hour) ? hour : null;
    },

    /** True when production scheduler would run sync (mirror scheduler.js). */
    isInsideActiveSyncWindow(hour = this.getJakartaHour()){
        if(!this.isConfigured() || hour == null) return null;
        return hour >= this.ACTIVE_HOUR_START_WIB
            && hour <= this.ACTIVE_HOUR_END_WIB_INCLUSIVE;
    },

    /** Intentional pause / waiting window (00.00–06.59 WIB). */
    isInsideScheduledPause(hour = this.getJakartaHour()){
        const active = this.isInsideActiveSyncWindow(hour);
        if(active == null) return null;
        return !active;
    }
};
