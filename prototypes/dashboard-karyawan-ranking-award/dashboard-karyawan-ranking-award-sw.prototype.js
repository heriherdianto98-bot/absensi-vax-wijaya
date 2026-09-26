/* VAX WIJAYA — Ranking #1 company award notification service worker. */
'use strict';

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || './dashboard-karyawan.html';
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const current = new URL(client.url);
        const wanted = new URL(target, self.location.origin);
        if (current.origin === wanted.origin && client.focus) {
          if (client.navigate) await client.navigate(wanted.href);
          return client.focus();
        }
      } catch (_) {}
    }
    if (clients.openWindow) return clients.openWindow(target);
  })());
});
