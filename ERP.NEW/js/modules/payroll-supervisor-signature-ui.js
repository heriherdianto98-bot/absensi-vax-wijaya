/* UI ONLY — Payroll Supervisor Signature Bridge */
(() => {
  const api = window.PayrollCapsterPrint;
  if (!api?.open || api.__svpSignatureUiPatched) return;

  const originalOpen = api.open.bind(api);
  const signatureUrl = new URL('../assets/supervisor-signature-rangga.svg', window.location.href).href;

  api.open = function(...args){
    const nativeOpen = window.open;
    window.open = function(...openArgs){
      const popup = nativeOpen.apply(window, openArgs);
      if (!popup) return popup;

      const nativeWrite = popup.document.write.bind(popup.document);
      popup.document.write = function(html){
        let out = String(html);
        out = out.replace(
          /<div class="stage"><div class="ttd"><svg viewBox="0 0 460 170"[\s\S]*?<\/svg><\/div><\/div><div class="name">Rangga Putra Pratama<\/div>/,
          `<div class="stage"><div class="ttd"><img src="${signatureUrl}" alt="Tanda tangan Supervisor"></div></div><div class="name">Rangga Putra Pratama</div>`
        );
        out = out.replace(
          '</style>',
          '.supervisor-sign .ttd img{display:block;width:42mm;height:16mm;object-fit:contain;object-position:center;margin:auto}</style>'
        );
        return nativeWrite(out);
      };
      return popup;
    };

    try { return originalOpen(...args); }
    finally { window.open = nativeOpen; }
  };

  api.__svpSignatureUiPatched = true;
})();
