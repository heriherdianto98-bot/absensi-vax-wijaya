/* Dashboard-only, read-only extension of the existing notification bell.
 * Mirrors the draft notice on Master Tagihan; no shared engine or database writes.
 * Owner has no invoice action in the current module: hide invoice bell items for Owner.
 */
'use strict';
(() => {
  if (!/\/erp-dashboard\.html$/i.test(location.pathname)) return;
  let installed = false;
  let lastRefresh = 0;
  const refresh = () => {
    const bell = window.ERPGlobalNotifications;
    if (!installed || typeof bell?.refresh !== 'function') return;
    const now = Date.now();
    if (now - lastRefresh < 1200) return;
    lastRefresh = now;
    Promise.resolve(bell.refresh()).catch(error => console.warn('[Dashboard INV notice] Refresh gagal:', error));
  };
  const install = () => {
    const bell = window.ERPGlobalNotifications;
    if (!bell || typeof bell.loadInvoices !== 'function' || typeof bell.add !== 'function') return false;
    if (bell.__dashboardInvoiceDraftNoticeInstalled) return true;
    const previousAdd = bell.add;
    bell.add = function(item) {
      if (String(this.role || '').toLowerCase() === 'owner' && String(item?.module || '').toUpperCase() === 'INVOICE') return;
      return previousAdd.call(this, item);
    };
    const previous = bell.loadInvoices;
    bell.loadInvoices = async function(supabaseClient) {
      // Owner no longer has an invoice inbox; do not fetch or notify Owner about invoices.
      if (String(this.role || '').toLowerCase() === 'owner') return;
      await previous.call(this, supabaseClient);
      if (!['svp', 'spv'].includes(String(this.role || '').toLowerCase()) || !this.user?.id) return;
      try {
        const client = supabaseClient || (typeof db !== 'undefined' ? db : window.db);
        if (!client?.from) return;
        const {count, error} = await client.from('svp_invoices')
          .select('id', {count:'exact', head:true})
          .eq('created_by', this.user.id)
          .in('sender_role', ['svp', 'spv'])
          .eq('status', 'draft');
        if (error) throw error;
        if (count > 0) this.add({
          key:'svp-own-unsent-invoices', tone:'urgent', icon:'▤', module:'INVOICE',
          href:'./master-tagihan.html?focus=invoice&draft=1',
          title:`${count} invoice belum terkirim`,
          detail:'Draft invoice SVP → Owner • buka untuk kirim via WhatsApp atau email'
        });
      } catch (error) {
        console.warn('[Dashboard INV notice] Gagal membaca draft:', error);
      }
    };
    bell.__dashboardInvoiceDraftNoticeInstalled = true;
    installed = true;
    // Clear stale Owner invoice entries already rendered before this extension loaded.
    if (String(bell.role || '').toLowerCase() === 'owner') {
      bell.items = (bell.items || []).filter(item => String(item.module || '').toUpperCase() !== 'INVOICE');
      if (typeof bell.render === 'function') bell.render();
    }
    refresh();
    // Initial global refresh may still be running when installed; refresh again afterwards.
    setTimeout(refresh, 1600);
    return true;
  };
  let attempts = 0;
  const timer = setInterval(() => {
    if (install() || ++attempts >= 120) clearInterval(timer);
  }, 250);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  window.addEventListener('focus', refresh);
  // Invoice can be saved inside the dashboard shortcut's iframe without changing page focus.
  // Check when the shortcut is closed, using the existing read-only notification refresh.
  document.addEventListener('click', event => {
    if (event.target.closest?.('#vaxInvoiceQuickOverlay .vax-inv-close')) setTimeout(refresh, 400);
  });
})();