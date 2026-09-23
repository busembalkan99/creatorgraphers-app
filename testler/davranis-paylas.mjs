// Davranış testi: paylaşım kartı seçim ekranı (karar 104, B; karar 108).
// Ekranın söylediği, indirilen PNG'nin kendisi ve veritabanı birlikte ölçülüyor.
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';

const APP = 'http://localhost:5180/';
const SS = '/tmp/cgapp/ss';
fs.mkdirSync(SS, { recursive: true });
await sifirla();

// Kurucu kare vermiyor (kart yok). Altı fotoğrafçı: 6/2,5 → iki kare sıralamada.
// Selin birinci, Can ikinci, Elif dördüncü (galeride), Pelin'in karesi çıkarılacak.
const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'], ['k1@test.local', 'Selin Arı'], ['k2@test.local', 'Can Öz'],
  ['k3@test.local', 'Deniz Akın'], ['k4@test.local', 'Elif Sunar'], ['k5@test.local', 'Mert Demir'],
  ['k6@test.local', 'Pelin Er'], ['k7@test.local', 'Onur Tek'],
];
const U = [];
for (const [e, ad] of KISI) U.push({ ...(await kullanici(e, ad)), ad, eposta: e });
const [A, SELIN, CAN, , ELIF, , PELIN] = U;
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
await admin.from('uyeler').insert(U.slice(1).map(u => ({ id: u.id, ad: u.ad, eposta: u.eposta, rol: 'uye', hosgeldin_goruldu: true })));

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-2), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const T = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true }).select('id').single()).data.id;
const kare = [];
for (const u of U.slice(1, 7)) {
  const yol = `${E}/${T}/${crypto.randomUUID()}.jpg`;
  await u.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  kare.push((await u.c.from('kareler').insert({ tema: T, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single()).data.id);
}
await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).eq('id', E);
for (const u of U) {
  const l = (await u.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [];
  for (const k of l) await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: Math.max(1, 10 - kare.indexOf(k.id)) });
}
await A.c.rpc('kare_cikar', { p_kare: kare[5], p_neden: 'deneme' });   // Pelin
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
// Bu test Wrapped'in kendiliğinden açılmasını sınamıyor
await admin.from('wrapped_izlendi').insert(U.map(u => ({ etkinlik: E, uye: u.id })));

const b = await chromium.launch();
const hatalar = [];
async function kisi(eposta, paylasimVar = false) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  if (paylasimVar) await ctx.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async d => { window.__paylasilan = d.files.map(f => ({ ad: f.name, tur: f.type, boyut: f.size })); };
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(`${eposta}: ${e}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) hatalar.push(`${eposta}: ${m.text()}`); });
  await p.goto(APP);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, eposta);
  return p;
}
const ac = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2500); };
const metin = p => p.locator('.app').innerText().then(t => t.replace(/\s+/g, ' '));
const var_ = async (p, t) => (await metin(p)).toLocaleLowerCase('tr-TR').includes(t.toLocaleLowerCase('tr-TR'));
const duzen = p => p.locator('.pk-kart').getAttribute('data-duzen');
const veri = p => p.evaluate(() => window.__paylasimVeri);
/** PNG'nin genişlik ve yüksekliği başlıktan (IHDR) */
const pngOlcu = buf => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), png: buf.slice(1, 4).toString() === 'PNG' });
/** Önizlemenin bir bölgesinde renk çeşitliliği: fotoğraf çizildiyse düz gri yer tutucudan farklı */
const cesitlilik = (p, x0, y0, x1, y1) => p.locator('.pk-kart').evaluate((img, [a, b2, c, d]) => {
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 1080, 1920);
  const r = []; for (let i = 0; i < 40; i++) { const x = a + (c - a) * ((i * 37) % 40) / 40, y = b2 + (d - b2) * ((i * 23) % 40) / 40; const px = g.getImageData(x, y, 1, 1).data; r.push(px[0] + px[1] + px[2]); }
  const m = r.reduce((s, v) => s + v, 0) / r.length;
  return Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / r.length);
}, [x0, y0, x1, y1]);

try {
  // ------------------------------------------------ 1. kazanan: dört düzen, gezinme, hafıza
  const P = await kisi(SELIN.eposta);
  await ac(P, `paylas/${E}`);
  bekle('1: seçim ekranı açılıyor', await var_(P, 'Kartını paylaş') && (await P.locator('.pk-kart').count()) === 1, (await metin(P)).slice(0, 120));
  bekle('1: ilk düzen dev puan, 1 / 4', (await duzen(P)) === 'dev' && await var_(P, '1 / 4'));
  const v1 = await veri(P);
  bekle('1: kazanan için "Temanın karesi", sıra 01', v1.baslik === 'Temanın karesi' && v1.sira === '01', JSON.stringify(v1 && { b: v1.baslik, s: v1.sira }));
  bekle('1: kaç kişi puanladı yazıyor', /^\d+ kişi puanladı$/.test(v1.alt), v1.alt);
  bekle('1: temadaki kare sayısı çıkarılan hariç (5)', v1.temaKare === 5, String(v1.temaKare));
  bekle('1: fotoğraf gerçekten çizildi (düz gri değil)', (await cesitlilik(P, 150, 700, 930, 1150)) > 8);
  bekle('1: paylaşım penceresi yoksa yalnız kaydet', (await P.getByRole('button', { name: 'Paylaş', exact: true }).count()) === 0 && (await P.getByRole('button', { name: 'Görseli kaydet' }).count()) === 1);
  await P.screenshot({ path: `${SS}/90-paylas-secim.png` });
  // Kaydırma ve komşuya dokunma
  const k = await P.locator('.pk-sahne').boundingBox();
  await P.mouse.move(k.x + k.width * 0.75, k.y + 200); await P.mouse.down(); await P.mouse.move(k.x + k.width * 0.2, k.y + 200, { steps: 6 }); await P.mouse.up(); await P.waitForTimeout(400);
  bekle('1: sola kaydırınca sonraki düzen', (await duzen(P)) === 'kontakt', await duzen(P));
  await P.locator('.pk-komsu.sag').click(); await P.waitForTimeout(400);
  bekle('1: sağdaki kesiğe dokununca sonraki', (await duzen(P)) === 'egik');
  bekle('1: çubuk ve sayaç', (await P.locator('.pk-nokta i.on').count()) === 1 && await var_(P, '3 / 4'));
  await ac(P, `paylas/${E}`);
  bekle('1: seçilen düzen hatırlanıyor', (await duzen(P)) === 'egik', await duzen(P));
  // Dört düzenin de PNG'si 1080x1920
  for (const [j, ad] of ['dev', 'kontakt', 'egik', 'bilet'].entries()) {
    while ((await duzen(P)) !== ad) {
      const once = await duzen(P);
      await P.locator(j > ['dev', 'kontakt', 'egik', 'bilet'].indexOf(once) ? '.pk-komsu.sag' : '.pk-komsu.sol').click(); await P.waitForTimeout(250);
    }
    const [d] = await Promise.all([P.waitForEvent('download'), P.getByRole('button', { name: 'Görseli kaydet' }).click()]);
    const yol = `${SS}/91-paylas-${ad}.png`;
    await d.saveAs(yol);
    const o = pngOlcu(fs.readFileSync(yol));
    bekle(`1: ${ad}: indirilen PNG 1080x1920`, o.png && o.w === 1080 && o.h === 1920, JSON.stringify(o));
    bekle(`1: ${ad}: dosya adı tema ve düzen`, d.suggestedFilename() === `creatorgraphers-sokak-${ad}.png`, d.suggestedFilename());
  }

  // ------------------------------------------------ 2. ikinci ve galeride
  const PC = await kisi(CAN.eposta);
  await ac(PC, `paylas/${E}`);
  const v2 = await veri(PC);
  bekle('2: sıralamaya giren için tek kelime sıra', v2.baslik === 'İkinci' && v2.sira === '02', JSON.stringify(v2 && { b: v2.baslik, s: v2.sira }));
  const PE = await kisi(ELIF.eposta);
  await ac(PE, `paylas/${E}`);
  const v3 = await veri(PE);
  bekle('2: sıralamaya girmeyen için "Galeride", sıra yok', v3.baslik === 'Galeride' && v3.sira === '—' && v3.alt === 'Puanı yalnız sen görüyorsun', JSON.stringify(v3 && { b: v3.baslik, s: v3.sira, a: v3.alt }));

  // ------------------------------------------------ 3. kartı olmayanlar: düğme yok, ekran söylüyor
  const PA = await kisi(A.eposta);
  await ac(PA, `sonuc/${E}`);
  bekle('3: kare vermeyenin sonuç ekranında paylaş düğmesi yok', (await PA.getByRole('button', { name: 'Kartını paylaş' }).count()) === 0);
  await ac(PA, `paylas/${E}`);
  bekle('3: doğrudan açınca paylaşacak karen yok', await var_(PA, 'Paylaşacak karen yok'));
  const PP = await kisi(PELIN.eposta);
  await ac(PP, `sonuc/${E}`);
  bekle('3: karesi çıkarılanın paylaş düğmesi yok', (await PP.getByRole('button', { name: 'Kartını paylaş' }).count()) === 0);
  await ac(PE, `sonuc/${E}`);
  bekle('3: galerideki kişinin paylaş düğmesi var', (await PE.getByRole('button', { name: 'Kartını paylaş' }).count()) === 1);
  await PE.getByRole('button', { name: 'Kartını paylaş' }).click(); await PE.waitForTimeout(2500);
  bekle('3: sonuç ekranından paylaşım ekranına', PE.url().includes(`#/paylas/${E}`), PE.url());

  // ------------------------------------------------ 4. Wrapped kapanışından paylaşım
  await ac(P, `wrapped/${E}`);
  for (let j = 0; j < 6; j++) { await P.locator('.wr').click({ position: { x: 330, y: 420 } }); await P.waitForTimeout(300); }
  bekle('4: kapanışta kartını paylaş var', (await P.getByRole('button', { name: 'Kartını paylaş' }).count()) === 1);
  await P.getByRole('button', { name: 'Kartını paylaş' }).click(); await P.waitForTimeout(2500);
  bekle('4: Wrapped kapanışından paylaşım ekranına', P.url().includes(`#/paylas/${E}`), P.url());
  await ac(PA, `wrapped/${E}`);
  for (let j = 0; j < 6; j++) { await PA.locator('.wr').click({ position: { x: 330, y: 420 } }); await PA.waitForTimeout(300); }
  bekle('4: kare vermeyenin Wrapped kapanışında paylaş yok', (await PA.getByRole('button', { name: 'Kartını paylaş' }).count()) === 0 && (await PA.getByRole('button', { name: 'Sonuçlara geç' }).count()) === 1);

  // ------------------------------------------------ 5. telefonun paylaşım penceresi
  const PS = await kisi(SELIN.eposta, true);
  await ac(PS, `paylas/${E}`);
  bekle('5: paylaşım penceresi varsa önce paylaş', (await PS.getByRole('button', { name: 'Paylaş', exact: true }).count()) === 1);
  await PS.getByRole('button', { name: 'Paylaş', exact: true }).click(); await PS.waitForTimeout(1200);
  const pl = await PS.evaluate(() => window.__paylasilan);
  bekle('5: pencereye PNG dosyası gidiyor', pl?.length === 1 && pl[0].tur === 'image/png' && pl[0].boyut > 10000 && pl[0].ad.endsWith('.png'), JSON.stringify(pl));

  // ------------------------------------------------ 6. başlık kuralları (M2 + M4) modülden
  const basliklar = await P.evaluate(async () => {
    const m = await import('/src/lib/paylasimKarti.ts');
    return [m.kartBasligi(1, true, false), m.kartBasligi(1, true, true), m.kartBasligi(3, true, false), m.kartBasligi(5, true, false), m.kartBasligi(4, false, false), m.kartBasligi(null, false, false)];
  });
  bekle('6: başlıklar: kazanan, ortak, üçüncü, beşinci, galeride', JSON.stringify(basliklar) === JSON.stringify(['Temanın karesi', 'Ortak birinci', 'Üçüncü', 'Beşinci', 'Galeride', 'Galeride']), JSON.stringify(basliklar));

  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
