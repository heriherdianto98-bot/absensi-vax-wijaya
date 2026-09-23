/* Page-local employee email login compatibility bridge. Owner/SPV auth stays canonical. */
(() => {
  'use strict';
  if (typeof OwnerAuth === 'undefined' || typeof db === 'undefined') return;
  const original = OwnerAuth.loginOwner.bind(OwnerAuth);
  OwnerAuth.loginOwner = async (identifier, password) => {
    const email = String(identifier || '').trim().toLowerCase();
    if (!email.includes('@')) return original(identifier, password);
    let ownerError;
    try { return await original(identifier, password); }
    catch (error) {
      ownerError = error;
      // A service outage/rate limit in Owner auth must not silently switch auth providers.
      if (error?.status && Number(error.status) !== 400) throw error;
    }
    const originalRpc = db.rpc;
    db.rpc = function(name, args, options) {
      if (name === 'karyawan_login_session' && String(args?.p_kode || '').toLowerCase() === email) {
        return originalRpc.call(this, 'karyawan_login_email_session', {
          p_email: email,
          p_secret: args.p_secret
        }, options);
      }
      return originalRpc.call(this, name, args, options);
    };
    try { return await OwnerAuth.loginKaryawanByKode(email, password); }
    catch (error) {
      if (/LOGIN_INACTIVE/i.test(String(error?.message || ''))) throw new Error('Akun karyawan tidak aktif. Hubungi Owner.');
      throw new Error('Email atau password tidak cocok, atau email belum diverifikasi. Karyawan juga dapat masuk menggunakan kode Kxxxx.');
    } finally { db.rpc = originalRpc; }
  };
})();