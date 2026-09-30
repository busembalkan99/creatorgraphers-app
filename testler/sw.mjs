// Service worker: push'u gösteriyor, dokununca yalnız uygulama içi adrese gidiyor
import fs from 'node:fs';
import vm from 'node:vm';
import { bekle, rapor } from './ortak.mjs';
const olay = {}, gosterilen = [], acilan = [];
const self = {
  addEventListener: (t, f) => { olay[t] = f; },
  registration: { scope: 'https://creatorgraphers.com/', showNotification: async (b, o) => { gosterilen.push({ b, o }); } },
  clients: { matchAll: async () => [], openWindow: async u => { acilan.push(u); } }, skipWaiting() {},
};
vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, URL, console });
const bekleyen = [];
const ev = extra => ({ waitUntil: p => bekleyen.push(p), ...extra });
olay.push(ev({ data: { json: () => ({ baslik: 'Oylama açıldı', govde: 'Son oy: 28 Eylül 20.00', adres: 'oyla' }) } }));
await Promise.all(bekleyen);
bekle('push gösteriliyor', gosterilen[0]?.b === 'Oylama açıldı' && gosterilen[0]?.o.body === 'Son oy: 28 Eylül 20.00' && gosterilen[0]?.o.data.adres === 'oyla');
olay.notificationclick(ev({ notification: { close() {}, data: { adres: 'sonuc/abc-123' } } }));
await Promise.all(bekleyen);
bekle('dokununca uygulama içi adres', acilan.at(-1) === 'https://creatorgraphers.com/#/sonuc/abc-123', acilan.at(-1));
olay.notificationclick(ev({ notification: { close() {}, data: { adres: '//kotu.example/x' } } }));
await Promise.all(bekleyen);
bekle('dışarı giden adres Etkinlikler\'e düşüyor', acilan.at(-1) === 'https://creatorgraphers.com/#/etkinlikler', acilan.at(-1));
olay.push(ev({ data: { json: () => { throw new Error('bozuk'); }, text: () => 'düz metin' } }));
await Promise.all(bekleyen);
bekle('bozuk yükte yine bildirim', gosterilen.at(-1)?.b === 'Creatorgraphers' && gosterilen.at(-1)?.o.body === 'düz metin');
rapor();
