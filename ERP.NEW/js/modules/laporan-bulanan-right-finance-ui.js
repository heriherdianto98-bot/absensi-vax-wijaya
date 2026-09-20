"use strict";
/* Laporan Bulanan: move existing expense/result cards; no data or presenter changes. */
(() => {
  let left, right, expense, result;
  let expenseNext, resultNext;
  function placeRight() {
    if (!right || !expense || !result) return;
    right.insertBefore(expense, right.firstChild);
    right.insertBefore(result, expense.nextSibling);
  }
  function restoreForPrint() {
    if (!left || !expense || !result) return;
    left.insertBefore(expense, expenseNext?.parentNode === left ? expenseNext : null);
    left.insertBefore(result, resultNext?.parentNode === left ? resultNext : null);
  }
  function boot() {
    const grid = document.querySelector('body.laporan-bulanan-page .lb-grid');
    left = grid?.querySelector('.lb-monthly-column-left');
    right = grid?.querySelector('.lb-monthly-column-right');
    expense = left?.querySelector('.lb-card[data-lb-view="expense"]');
    result = left?.querySelector('.lb-card[data-lb-view="result"]');
    if (!left || !right || !expense || !result) return;
    expenseNext = expense.nextSibling;
    resultNext = result.nextSibling;
    placeRight();
    window.addEventListener('beforeprint', restoreForPrint);
    window.addEventListener('afterprint', placeRight);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else boot();
})();
