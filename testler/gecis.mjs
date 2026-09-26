// Sayfa geçişleri ve geç gelen içerik (Buse, 2026-09-27): liste zıplamıyor, geri dönüşte boş ekran yok,
// sekmeler önceden yüklü, sonradan gelen yumuşak beliriyor. Ağ bilerek yavaşlatılıyor.
import fs from 'node:fs';
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const K = { A: { ...A, eposta: 'kurucu@test.local' } };
for (const [a, ad, posta] of [['B', 'Barış Ak', 'baris@test.local'], ['Z', 'Zeynep Ar', 'zeynep@test.local']]) {
  const k = await kullanici(posta, ad);
  await admin.from('uyeler').insert({ id: k.id, ad, eposta: posta });
  K[a] = { ...k, eposta: posta };
}
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const gun = h => new Date(Date.now() + h * 3600000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
for (const [bitis, temalar] of [[-480, ['Su']], [-2, ['Sokak', 'Portre']]]) {
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: gun(bitis - 72), yukleme_baslar: saat(bitis - 72), yukleme_biter: saat(bitis - 48), oylama_biter: saat(bitis), kuran: A.id }).select('id').single()).data;
  for (const [i, ad] of temalar.entries()) {
    const t = (await admin.from('temalar').insert({ etkinlik: e.id, ad, sira: i + 1, bulusmada: false }).select('id').single()).data;
    for (const [sahip, puan] of [[K.A, 8 - i], [K.B, 6 + i]]) {
      const yol = `${e.id}/${t.id}/${crypto.randomUUID()}.jpg`;
      await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
      const k = (await admin.from('kareler').insert({ tema: t.id, sahip: sahip.id, dosya: yol, genislik: 1200, yukseklik: 800 }).select('id').single()).data;
      await admin.from('oylar').insert({ kare: k.id, veren: K.Z.id, puan });
    }
  }
  await admin.from('wrapped_izlendi').insert([K.A, K.B, K.Z].map(u => ({ etkinlik: e.id, uye: u.id })));
}

const b = await webkit.launch();
const hatalar = [];
const ctx = await b.newContext({ ...devices['iPhone 14'] });
// İlk kareden itibaren: yükleniyor çizgisi görünüyor mu, "Geçmiş etkinlikler" başlığı ve "Çıkış yap" kayıyor mu
await ctx.addInitScript(() => {
  window.__iz = { yukleniyor: 0, gecmis: [], cikis: [] };
  const bak = () => {
    const iz = window.__iz;
    if (document.querySelector('.yukleniyor')) iz.yukleniyor++;
    const g = [...document.querySelectorAll('h2.kart-bas')].find(h => h.textContent.startsWith('Geçmiş'));
    if (g) { const y = Math.round(g.getBoundingClientRect().top); if (iz.gecmis.at(-1) !== y) iz.gecmis.push(y); }
    const c = [...document.querySelectorAll('.sc .btn')].find(x => x.textContent === 'Çıkış yap');
    if (c) { const y = Math.round(c.getBoundingClientRect().top); if (iz.cikis.at(-1) !== y) iz.cikis.push(y); }
  };
  const bas = () => new MutationObserver(bak).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  if (document.documentElement) bas(); else document.addEventListener('DOMContentLoaded', bas, { once: true });
});
const p = await ctx.newPage();
p.on('pageerror', e => hatalar.push(String(e)));
const sifirIz = () => p.evaluate(() => { window.__iz = { yukleniyor: 0, gecmis: [], cikis: [] }; });
const iz = () => p.evaluate(() => window.__iz);
await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, K.A.eposta);

try {
  // 1. Birinciler yavaş gelirken liste yerinde duruyor, yer tutucular var, sonra içerik beliriyor
  await p.route('**/rest/v1/rpc/sonuc_kareleri*', async r => { await new Promise(z => setTimeout(z, 1200)); await r.continue(); });
  await p.goto(APP + '#/etkinlikler'); await p.reload();
  await p.waitForTimeout(700);
  bekle('yavaş ağda birinciler yüklenirken yer tutucular var', (await p.locator('.vitrin .vt.yer-kart').count()) > 0 && (await p.locator('.katildigin.yer-kart').count()) === 1);
  await p.waitForTimeout(2500);
  let s = await iz();
  bekle('birinciler gelince "Geçmiş etkinlikler" başlığı kaymıyor (±2px)', Math.max(...s.gecmis) - Math.min(...s.gecmis) <= 2, JSON.stringify(s.gecmis));
  bekle('birinciler geldi (kontrol)', (await p.locator('.vitrin .vt:not(.yer-kart)').count()) === 3 && (await p.locator('.katildigin:not(.yer-kart)').count()) === 1);
  bekle('gelen birinciler yumuşak beliriyor', await p.locator('.vitrin .vt:not(.yer-kart)').first().evaluate(e => getComputedStyle(e).animationName === 'belir'));
  await p.unroute('**/rest/v1/rpc/sonuc_kareleri*');

  // 2. Sekmeler önceden yüklendi: yükleniyor çizgisi hiç görünmüyor
  await sifirIz();
  await p.locator('.tabs button', { hasText: 'Sıralama' }).click(); await p.waitForTimeout(900);
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(900);
  s = await iz();
  bekle('önceden yüklenen sekmelerde yükleniyor çizgisi hiç görünmüyor', s.yukleniyor === 0, String(s.yukleniyor));
  bekle('sekmeler açıldı (kontrol)', (await p.locator('.pname').count()) === 1);

  // 3. Sonuç'tan geri dönüşte boş ekran yok, liste kaymıyor
  await p.locator('.tabs button', { hasText: 'Etkinlikler' }).click(); await p.waitForTimeout(1200);
  await p.locator('.satir-kartlari .ev').first().click(); await p.waitForTimeout(1500);
  await sifirIz();
  const t0 = Date.now();
  await p.locator('.tepe .geri').first().click();
  await p.waitForFunction(() => { const g = document.querySelector('.gecis'); return document.querySelector('.satir-kartlari .ev') && g && !g.classList.contains('bekliyor'); }, null, { timeout: 3000 }).catch(() => {});
  const gorundu = Date.now() - t0;
  bekle('geri dönüşte liste hemen görünüyor (boş ekran yok)', gorundu < 250, `${gorundu} ms`);
  await p.waitForTimeout(1500);
  s = await iz();
  bekle('geri dönüşte birinciler bellekten, liste kaymıyor (±2px)', s.gecmis.length > 0 && Math.max(...s.gecmis) - Math.min(...s.gecmis) <= 2, JSON.stringify(s.gecmis));

  // 4. Profil'deki tahmin skoru: ikinci açılışta bellekten, "Çıkış yap" kaymıyor
  await p.route('**/rest/v1/rpc/tahmin_profilim*', async r => { await new Promise(z => setTimeout(z, 600)); await r.fulfill({ status: 200, contentType: 'application/json', body: '[{"bilen":2,"toplam":4}]' }); });
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(1500);
  await p.locator('.tabs button', { hasText: 'Etkinlikler' }).click(); await p.waitForTimeout(800);
  await sifirIz();
  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(1500);
  s = await iz();
  bekle('Profil ikinci açılış: tahmin skoru ve yönetim satırları bellekten, "Çıkış yap" kaymıyor (±2px)', s.cikis.length > 0 && Math.max(...s.cikis) - Math.min(...s.cikis) <= 2 && /2\/4/.test(await p.locator('.kisisel').textContent()), JSON.stringify(s.cikis));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
