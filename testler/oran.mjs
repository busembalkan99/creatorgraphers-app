// Dikey kareler kısa ekranlarda basılıyordu (2026-09-30, canlıda): Oylama'da .tutucu img iki sınırı (en ve boy) Safari'de
// ayrı uyguluyordu. Her ekrandaki her kare beş boyutta, kırpmasız/sığdırmasız çizilenin oranı dosyanınkiyle aynı olmalı.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
// Oylama açık etkinlik: B'nin dikey karesi, A'nın yatay karesi
const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-50), yukleme_biter: saat(-1), oylama_biter: saat(40), kuran: A.id }).select('id').single()).data;
const t = (await admin.from('temalar').insert({ etkinlik: e.id, ad: 'Serbest', sira: 1, bulusmada: false }).select('id').single()).data;
for (const [u, f, g, y] of [[B, 'dikey', 800, 1200], [A, 'dogru', 1200, 800]]) {
  const yol = `${e.id}/${t.id}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol, fs.readFileSync(`/tmp/cgapp/${f}.jpg`), { contentType: 'image/jpeg' });
  await admin.from('kareler').insert({ tema: t.id, sahip: u.id, dosya: yol, genislik: g, yukseklik: y });
}
const b = await webkit.launch();
for (const [cihaz, vp] of [['iPhone SE', { width: 375, height: 667 }], ['iPhone 14', { width: 390, height: 844 }], ['iPhone X', { width: 375, height: 812 }], ['kısa', { width: 390, height: 560 }], ['iPad', { width: 820, height: 1180 }]]) {
  const ctx = await b.newContext({ ...devices['iPhone 14'], viewport: vp });
  await ctx.addInitScript(() => localStorage.setItem('bildirim-karti-gizli', '1'));
  const p = await ctx.newPage();
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  for (const yol of ['oyla', `oyla/${t.id}`, 'etkinlikler', 'profil', 'asama', `sonuc/${e.id}`]) {
    await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2200);
    const r = await p.evaluate(() => [...document.querySelectorAll('img')].filter(i => i.naturalWidth && i.getBoundingClientRect().width > 20).map(i => {
      const b = i.getBoundingClientRect(), s = getComputedStyle(i);
      const cizilen = b.width / b.height, gercek = i.naturalWidth / i.naturalHeight;
      return { sinif: (i.parentElement?.className || '') + '>' + (i.className || 'img'), fit: s.objectFit, boyut: `${Math.round(b.width)}x${Math.round(b.height)}`, dogal: `${i.naturalWidth}x${i.naturalHeight}`, bozuk: s.objectFit === 'fill' && Math.abs(cizilen / gercek - 1) > 0.02 };
    }).filter(x => x.bozuk));
    bekle(`${cihaz} ${yol.split('/')[0]}: kareler oranı bozulmadan çiziliyor`, r.length === 0, JSON.stringify(r));
  }
  await ctx.close();
}
await b.close();
rapor();
