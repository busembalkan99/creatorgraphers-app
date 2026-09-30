// Bildirimler (karar 120): göster ve dokununca uygulamada aç. Önbellek tutmuyor (sürüm izleyicisiyle çakışmasın).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim ? self.clients.claim() : Promise.resolve()));

// Yalnız uygulama içi adres ("sonuc/<id>", "oyla"...); başka her şey Etkinlikler
function hedefAdres(adres, kapsam) {
  const a = typeof adres === 'string' && /^[a-z0-9/-]{1,80}$/.test(adres) && !adres.startsWith('/') ? adres : 'etkinlikler';
  return new URL('./#/' + a, kapsam).href;
}

self.addEventListener('push', e => {
  let v;
  try { v = e.data ? e.data.json() : {}; } catch { v = { govde: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(v.baslik || 'Creatorgraphers', {
    body: v.govde || '', icon: 'ikon-192.png', badge: 'ikon-192.png', data: { adres: v.adres || 'etkinlikler' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const hedef = hedefAdres(e.notification.data && e.notification.data.adres, self.registration.scope);
  e.waitUntil((async () => {
    const pencereler = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const p of pencereler) {
      if (p.focus) { await p.focus(); if (p.navigate) await p.navigate(hedef); return; }
    }
    await self.clients.openWindow(hedef);
  })());
});
