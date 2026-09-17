/*
 * Parahyangan July 2026: legacy SVP override intentionally retired.
 * July must use the same canonical LaporanBulananConsumer and existing
 * Cash Out / provider mapping flow as August. This compatibility file
 * remains because the investor page still references its script URL.
 * No historical amounts, salary rows, or readiness status are fabricated.
 */
'use strict';
(() => {
  if (typeof window !== 'undefined') {
    window.LaporanInvestorParahyanganJulySvpBridge = Object.freeze({
      retired: true,
      source: 'CANONICAL_MONTHLY_CONSUMER'
    });
  }
})();
