// İmzalı adresler (egress, 2026-09-30): her ekran açılışında yeni adres üretiliyordu, adres değişince tarayıcı
// aynı kareyi yeniden indiriyordu (25 Eylül'de 39 kare ~2.300 kez). Aynı oturumda aynı dosyanın adresi yeniden kullanılmalı.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: '2026-09-20', yukleme_baslar: saat(-100), yukleme_biter: saat(-80), oylama_biter: saat(-1), kuran: A.id }).select('id').single()).data;
const t = (await admin.from('temalar').insert({ etkinlik: e.id, ad: 'Sokak', sira: 1, bulusmada: false }).select('id').single()).data;
const jpeg = fs.readFileSync('/tmp/cgapp/dogru.jpg');
const kareler = [], kareYollari = [];
for (const [u, puan] of [[A, 8], [B, 6]]) {
  const yol = `${e.id}/${t.id}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol, jpeg, { contentType: 'image/jpeg' }); kareYollari.push(yol);
  kareler.push((await admin.from('kareler').insert({ tema: t.id, sahip: u.id, dosya: yol, genislik: 1200, yukseklik: 800 }).select('id').single()).data.id);
}
// A'nın karesinin önizlemesi var, B'ninki yok (önizlemeden önce yüklenmiş eski kare gibi)
await admin.storage.from('kareler').upload(kareYollari[0].replace(/\.jpg$/, '.k.jpg'), jpeg, { contentType: 'image/jpeg' });
// Wrapped kendiliğinden açılmasın (karar 39), sekmeleri kapatıyor
await admin.from('wrapped_izlendi').insert([{ uye: A.id, etkinlik: e.id }]);
await admin.from('oylar').insert([{ kare: kareler[0], veren: B.id, puan: 8 }, { kare: kareler[1], veren: A.id, puan: 6 }]);
const b = await webkit.launch(); const hatalar = [];
try {
  const p = await (await b.newContext({ ...devices['iPhone 14'] })).newPage();
  p.on('pageerror', x => hatalar.push(String(x)));
  let imza = 0; p.on('request', r => { if (r.method() === 'POST' && r.url().includes('/storage/v1/object/sign/')) imza++; });
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  await p.goto(APP + '#/profil'); await p.reload(); await p.waitForTimeout(2500);
  const src1 = await p.locator('.sc img').first().getAttribute('src');
  bekle('profilde kare görünüyor (kontrol)', !!src1 && src1.includes('/storage/v1/object/sign/'), src1);
  // Uygulama açılışında sekmeler önceden yükleniyor (App.tsx); sayaç bundan sonra
  await p.waitForTimeout(1500); imza = 0;
  await p.locator('.tabs button', { hasText: 'Etkinlikler' }).click(); await p.waitForTimeout(1500);
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(2500);
  const src2 = await p.locator('.sc img').first().getAttribute('src');
  bekle('ikinci açılışta aynı adres: tarayıcı yeniden indirmiyor', src1 === src2);
  // Önizleme (karar 123): ızgarada önizlemesi olan kare .k.jpg'den, olmayan tam boydan geliyor
  const profilSrc = await p.locator('.sc img').evaluateAll(l => l.map(i => i.getAttribute('src')));
  bekle('Profil ızgarası önizlemeyi kullanıyor', profilSrc.some(u => u.includes(kareYollari[0].split('/').pop().replace('.jpg', '.k.jpg'))), JSON.stringify(profilSrc.map(u => u.split('?')[0].split('/').pop())));
  await p.goto(APP + `#/sonuc/${e.id}`); await p.waitForTimeout(2500);
  const sonucSrc = await p.locator('.sc img').evaluateAll(l => l.map(i => i.getAttribute('src').split('?')[0].split('/').pop()));
  bekle('Sonuç: önizlemesi olmayan eski kare tam boydan görünüyor', sonucSrc.includes(kareYollari[1].split('/').pop()), JSON.stringify(sonucSrc));
  await p.locator('.tabs button, .geri').first().click().catch(() => {});
  await p.locator('.tabs button', { hasText: 'Profil' }).click().catch(() => {}); await p.waitForTimeout(1500);
  bekle('Profil ve Sonuç arasında gidip gelince yeni imza isteği yok', imza === 0, `${imza} istek`);
  // Çıkışta önbellek temizleniyor: başka biri girince önceki kişinin adresleri kalmıyor
  const bos = await p.evaluate(async () => { const m = await import('/src/lib/imza.ts'); await window.__sb.auth.signOut(); await new Promise(r => setTimeout(r, 200)); return m.onbellekBoyu(); }).catch(x => `hata: ${x.message}`);
  bekle('çıkışta imza önbelleği boşalıyor', bos === 0, String(bos));
  // ---- hata yolları (kapsam incelemesi) ----
  await p.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  let hataSay = 0;
  await p.route('**/storage/v1/object/sign/**', r => { hataSay++; return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"test"}' }); });
  const r1 = await p.evaluate(async () => (await (await import('/src/lib/imza.ts')).imzala(['yok/1.jpg']))[0].signedUrl);
  const r2 = await p.evaluate(async () => (await (await import('/src/lib/imza.ts')).imzala(['yok/1.jpg']))[0].signedUrl);
  bekle('imza hatasında adres null, önbelleğe girmiyor (ikinci çağrı yeniden soruyor)', r1 === null && r2 === null && hataSay === 2, `${hataSay} istek`);
  await p.unroute('**/storage/v1/object/sign/**');
  // Çıkıştan önce başlayan istek, çıkıştan sonra gelince önbelleğe yazmıyor
  await p.route('**/storage/v1/object/sign/**', async r => { await new Promise(x => setTimeout(x, 800)); await r.continue(); });
  const boy = await p.evaluate(async yol => {
    const m = await import('/src/lib/imza.ts'); const s = m.imzala([yol]);
    await new Promise(x => setTimeout(x, 100)); await window.__sb.auth.signOut(); await s; return m.onbellekBoyu();
  }, kareYollari[0]);
  bekle('çıkıştan önce başlayan imza isteği önbelleğe yazmıyor', boy === 0, String(boy));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
