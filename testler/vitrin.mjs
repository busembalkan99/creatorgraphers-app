// Ana ekranın boş günleri (Buse, 2026-09-26): "[Ay] birincileri" şeridi, "Katıldığın son etkinlik"
// kartı ve "Sıradaki etkinlik" kartının boş hâli. Kendi verisini kuruyor.
import fs from 'node:fs';
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { kartDenetle } from './kartDenetim.mjs';
const APP = 'http://localhost:5180/';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const K = { A: { ...A, ad: 'Ayşe Kaya', eposta: 'kurucu@test.local' } };
for (const [a, ad, posta] of [['B', 'Barış Ak', 'baris@test.local'], ['C', 'Can Öz', 'can@test.local'],
  ['D', 'Deniz Yılmaz', 'deniz@test.local'], ['E', 'Ece Tan', 'ece@test.local'], ['Z', 'Zeynep Ar', 'zeynep@test.local']]) {
  const k = await kullanici(posta, ad);
  await admin.from('uyeler').insert({ id: k.id, ad, eposta: posta });
  K[a] = { ...k, ad, eposta: posta };
}
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');

const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const gun = h => new Date(Date.now() + h * 3600000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
async function etkinlik(bitisSaat, temalar) {
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: gun(bitisSaat - 72), yukleme_baslar: saat(bitisSaat - 72),
    yukleme_biter: saat(bitisSaat - 48), oylama_biter: saat(bitisSaat), kuran: A.id }).select('id, bulusma_gunu').single()).data;
  const t = [];
  for (const [i, ad] of temalar.entries()) t.push((await admin.from('temalar').insert({ etkinlik: e.id, ad, sira: i + 1, bulusmada: false }).select('id').single()).data);
  return { ...e, t };
}
async function kare(e, tema, sahip, puan) {
  const yol = `${e.id}/${tema.id}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const k = (await admin.from('kareler').insert({ tema: tema.id, sahip: sahip.id, dosya: yol, genislik: 1200, yukseklik: 800 }).select('id').single()).data;
  await admin.from('oylar').insert({ kare: k.id, veren: K.Z.id, puan });
  return k;
}
// E1: 20 gün önce. Ayşe birinci (Ayşe'nin katıldığı son etkinlik bu).
const E1 = await etkinlik(-480, ['Su']);
await kare(E1, E1.t[0], K.A, 9); await kare(E1, E1.t[0], K.B, 7);
// E2: iki saat önce, üç tema. Sokak: Barış; Portre: Can ve Deniz eşit; Gece: Deniz. Ece Gece'de sıralamaya girmiyor.
const E2 = await etkinlik(-2, ['Sokak', 'Portre', 'Gece']);
const sokakBaris = await kare(E2, E2.t[0], K.B, 9); await kare(E2, E2.t[0], K.C, 6);
await kare(E2, E2.t[1], K.C, 8); await kare(E2, E2.t[1], K.D, 8);
await kare(E2, E2.t[2], K.D, 9); await kare(E2, E2.t[2], K.B, 7); await kare(E2, E2.t[2], K.C, 4); await kare(E2, E2.t[2], K.E, 2);
// Can'ın Wrapped'i izlenmedi; diğerleri izledi
await admin.from('wrapped_izlendi').insert([K.A, K.B, K.D, K.E, K.Z].map(u => ({ etkinlik: E2.id, uye: u.id })));
const ay = new Date(E2.bulusma_gunu + 'T12:00:00').toLocaleDateString('tr-TR', { month: 'long', timeZone: 'Europe/Istanbul' });
const Ay = ay[0].toLocaleUpperCase('tr-TR') + ay.slice(1);

const b = await webkit.launch();
const hatalar = [];
async function sayfa(k, izle = false) {
  const ctx = await b.newContext({ ...devices['iPhone 14'] });
  if (izle) await ctx.addInitScript(() => {
    window.__ifsa = false; window.__degisim = 0;
    const bas = () => new MutationObserver(() => { window.__degisim++; if (!location.hash.startsWith('#/wrapped') && document.querySelector('.vitrin, .katildigin')) window.__ifsa = true; })
      .observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) bas(); else document.addEventListener('DOMContentLoaded', bas, { once: true });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(String(e)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, k.eposta);
  return p;
}
const git = async (p, yol) => { await p.evaluate(y => { location.hash = '#/' + y; }, yol); await p.waitForTimeout(2200); };
const yazi = async (p, s) => ((await p.locator(s).first().textContent({ timeout: 1500 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

try {
  // Yönetici, E2'de karesi yok: şerit E2'nin birincileri, kartı E1
  const P = await sayfa(K.A);
  await git(P, 'etkinlikler');
  bekle('şerit başlığı ayla', (await yazi(P, 'h2.kart-bas:has(+ .vitrin)')).startsWith(`${Ay} birincileri`), await yazi(P, 'h2.kart-bas:has(+ .vitrin)'));
  const kartlar = (await P.locator('.vitrin .vt figcaption').allTextContents()).map(x => x.replace(/\s+/g, ' ').trim());
  bekle('şeritte tema başına birinci, eşitlikte ikisi, tema sırasıyla', kartlar.length === 4 && /Sokak.*Barış Ak/.test(kartlar[0]) && kartlar.slice(1, 3).every(x => x.includes('Portre')) && kartlar.slice(1, 3).some(x => x.includes('Can Öz')) && kartlar.slice(1, 3).some(x => x.includes('Deniz Yılmaz')) && /Gece.*Deniz Yılmaz/.test(kartlar[3]), JSON.stringify(kartlar));
  bekle('şerit fotoğrafları yüklendi', await P.locator('.vitrin .vt img').first().evaluate(i => i.complete && i.naturalWidth > 0, null, { timeout: 3000 }).catch(() => false));
  bekle('katıldığın son etkinlik: karesi olduğu son etkinlik (E1), sıralı', /^1 ?Sıran ?9,0 ?Puanın/.test(await yazi(P, '.katildigin .vt-sayi')), await yazi(P, '.katildigin'));
  bekle('katıldığın son etkinlik başlığı', (await yazi(P, 'h2.kart-bas:has(+ .katildigin)')).startsWith('Katıldığın son etkinlik'), await yazi(P, 'h2.kart-bas:has(+ .katildigin)'));
  bekle('sıradaki etkinlik boşken "henüz planlanmadı"', /henüz planlanmadı/.test(await yazi(P, '.next')) && !/kurulmadı/.test(await yazi(P, '.next')), await yazi(P, '.next'));
  bekle('yöneticinin "Etkinliği kur" düğmesi sıradaki etkinlik kartının içinde', (await P.locator('.next').getByRole('button', { name: 'Etkinliği kur' }).count()) === 1 && (await P.getByRole('button', { name: 'Etkinliği kur' }).count()) === 1);
  const sira = await P.evaluate(() => [...document.querySelectorAll('.sc > *')].map(e => e.className || e.tagName).join(' | '));
  bekle('sıra: sıradaki → birinciler → katıldığın → geçmiş', /next.*vitrin.*katildigin.*satir-kartlari/.test(sira), sira);
  await kartDenetle(P, 'vitrin (yönetici)', bekle);
  // Şerit yana kayıyor, sayfa kaymıyor
  const kay = await P.evaluate(() => { const sc = document.querySelector('.sc'), v = document.querySelector('.vitrin'); return { sayfa: sc.scrollWidth - sc.clientWidth, belge: document.documentElement.scrollWidth - document.documentElement.clientWidth, serit: v.scrollWidth - v.clientWidth }; });
  bekle('şerit yana kayıyor, sayfa ve belge yana kaymıyor', kay.sayfa === 0 && kay.belge === 0 && kay.serit > 0, JSON.stringify(kay));
  // Şeridin ilk kartı sayfa kenar boşluğunda başlıyor (kaydırma yapışması onu kenara çekmesin)
  const ilkSol = await P.locator('.vitrin .vt').first().evaluate(e => Math.round(e.getBoundingClientRect().left));
  bekle('şeridin ilk kartı 16px içeride başlıyor', ilkSol === 16, String(ilkSol));
  // Dar ekranda (320px) katıldığın kartındaki iki sayı yan yana kalıyor
  await P.setViewportSize({ width: 320, height: 800 }); await P.waitForTimeout(500);
  const tepeler = await P.locator('.katildigin .vt-sayi b').evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().top)));
  bekle('320px: katıldığın kartında sayılar yan yana', tepeler.length === 2 && tepeler[0] === tepeler[1], JSON.stringify(tepeler));
  await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(300);
  // Şeritteki kareye dokununca Sonuç'ta o karenin detayı açılıyor
  await P.locator('.vitrin .vt').first().click({ timeout: 3000 }).catch(() => {}); await P.waitForTimeout(1500);
  bekle('şeritteki kare Sonuç\'ta detayını açıyor', (await P.evaluate(() => location.hash)) === `#/sonuc/${E2.id}/kare/${sokakBaris.id}` && (await P.locator('.detay').count()) === 1, await P.evaluate(() => location.hash));
  // Katıldığın son etkinlik kartı o etkinliğin sonuçlarını açıyor
  await git(P, 'etkinlikler');
  await P.locator('.katildigin').click({ timeout: 3000 }).catch(() => {}); await P.waitForTimeout(1200);
  bekle('katıldığın son etkinlik kartı sonuçları açıyor', (await P.evaluate(() => location.hash)) === `#/sonuc/${E1.id}`, await P.evaluate(() => location.hash));

  // Sıralamaya girmeyen: yalnız puan, yalnız kendine
  const E = await sayfa(K.E);
  await git(E, 'etkinlikler');
  bekle('katıldığın: sıralamaya girmediyse puan ve not', /^2,0 ?Puanın ?Karen sıralamaya girmedi\./.test(await yazi(E, '.katildigin .vt-sayi')), await yazi(E, '.katildigin'));
  // Karesi olmayan üye: şerit var, kart yok; "Etkinliği kur" düğmesi yok
  const Z = await sayfa(K.Z);
  await git(Z, 'etkinlikler');
  bekle('karesi olmayan: şerit var, katıldığın kartı yok', (await Z.locator('.vitrin .vt').count()) === 4 && (await Z.locator('.katildigin').count()) === 0);
  bekle('üye "Etkinliği kur" görmüyor', (await Z.getByRole('button', { name: 'Etkinliği kur' }).count()) === 0 && /henüz planlanmadı/.test(await yazi(Z, '.next')));

  // Okunamazsa bölümler yok, liste açık
  await Z.route('**/rest/v1/rpc/sonuc_kareleri*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deneme"}' }));
  await git(Z, 'siralama'); await git(Z, 'etkinlikler');
  bekle('okunamazsa şerit ve kart yok, liste açık', (await Z.locator('.vitrin').count()) === 0 && (await Z.locator('.katildigin').count()) === 0 && (await Z.locator('.ev').count()) === 2);
  await Z.unroute('**/rest/v1/rpc/sonuc_kareleri*');

  // Wrapped'i izlenmemiş etkinlik: açılıştan önce bir kare bile görünmüyor
  const C = await sayfa(K.C, true);
  await C.goto(APP + '#/etkinlikler'); await C.reload(); await C.waitForTimeout(4000);
  bekle('wrapped kendiliğinden açıldı (kontrol)', (await C.evaluate(() => location.hash)).startsWith('#/wrapped/'));
  bekle('ana ekran çizildi (kontrol)', (await C.evaluate(() => window.__degisim)) > 0);
  bekle('wrapped izlenmeden şerit ve katıldığın kartı hiç görünmedi', !(await C.evaluate(() => window.__ifsa)));
  await admin.from('wrapped_izlendi').insert({ etkinlik: E2.id, uye: K.C.id });
  await git(C, 'siralama'); await git(C, 'etkinlikler');
  bekle('izlendikten sonra şerit ve kart görünüyor, eşitlikte Can birinci', (await C.locator('.vitrin .vt').count()) === 4 && /^1 ?Sıran ?8,0 ?Puanın/.test(await yazi(C, '.katildigin .vt-sayi')), await yazi(C, '.katildigin'));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
