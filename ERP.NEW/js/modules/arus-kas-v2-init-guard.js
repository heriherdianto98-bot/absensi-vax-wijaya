/*
=========================================================
VAX ERP — ARUS KAS V2 INIT GUARD
Additive runtime safety layer only.

Tujuan:
- memastikan ArusKasV2.init() hanya benar-benar berjalan satu kali,
  meskipun dipanggil dari DOMContentLoaded dan erp:finance-ready.
- mencegah event handler Input Manual / Simpan ter-bind ganda.

Tidak mengubah engine, formula, query, data, atau workflow Arus Kas.
=========================================================
*/
"use strict";

(function(){
  const flow = window.ArusKasV2;
  if(!flow || typeof flow.init !== "function" || flow.__initGuardInstalled) return;

  flow.__initGuardInstalled = true;
  const baseInit = flow.init;
  let initPromise = null;

  flow.init = function(){
    if(initPromise) return initPromise;

    const ctx = this;
    const args = arguments;
    initPromise = Promise.resolve()
      .then(() => baseInit.apply(ctx,args))
      .catch(err => {
        initPromise = null;
        throw err;
      });

    return initPromise;
  };
})();
