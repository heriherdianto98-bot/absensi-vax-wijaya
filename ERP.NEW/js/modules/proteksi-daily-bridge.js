/* VAX ERP — Proteksi -> DailyDataEngine summary bridge. */
"use strict";

(function(){
    if(typeof DailyDataEngine === "undefined") return;
    if(typeof ProteksiEngine === "undefined") return;
    if(DailyDataEngine.__proteksiBridgeApplied) return;

    const originalSummarizeRows = DailyDataEngine.summarizeRows.bind(DailyDataEngine);

    DailyDataEngine.summarizeRows = function(rows){
        const summary = originalSummarizeRows(rows);
        const proteksi = ProteksiEngine.summarizeRows(rows);

        return {
            ...summary,
            proteksiCapster: Number(proteksi.total || 0),
            proteksiByDate: proteksi.byDate,
            proteksiByBranch: proteksi.byBranch,
            proteksiDetails: proteksi.details
        };
    };

    DailyDataEngine.__proteksiBridgeApplied = true;
})();
