// Etkinlikler arşivindeki kazanan adları (karar 119) ve "senin karen / senin yerin" kartları.
// Kendi verisini kuruyor: sonuçlanmış eski bir etkinlik (Su: tek birinci, Gece: ortak birinci) ve
// Wrapped'i henüz izlenmemiş yeni bir etkinlik (Işık).
import fs from 'node:fs';
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const K = { A: { ...A, ad: 'Ayşe Kaya', eposta: 'kurucu@test.local' } };
for (const [a, ad, posta] of [['B', 'Barış Ak', 'baris@test.local'], ['C', 'Can Öz', 'can@test.local'],
  ['D', 'Deniz Yılmaz', 'deniz@test.local'], ['Z', 'Zeynep Ar', 'zeynep@test.local']]) {
  const k = await kullanici(posta, ad);
  await admin.from('uyeler').insert({ id: k.id, ad, eposta: posta });
  K[a] = { ...k, ad, eposta: posta };
}
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');

const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const gun = h => new Date(Date.now() + h * 3600000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
async function etkinlik(bitisSaat, temalar) {
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: gun(bitisSaat - 72), yukleme_baslar: saat(bitisSaat - 72),
    yukleme_biter: saat(bitisSaat - 48), oylama_biter: saat(bitisSaat), kuran: A.id }).select('id').single()).data;
  const t = [];
  for (const [i, ad] of temalar.entries()) t.push((await admin.from('temalar').insert({ etkinlik: e.id, ad, sira: i + 1, bulusmada: false }).select('id').single()).data);
  return { id: e.id, t };
}
async function kare(tema, sahip, puan) {
  const yol = `${tema.id}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const k = (await admin.from('kareler').insert({ tema: tema.id, sahip: sahip.id, dosya: yol, genislik: 1200, yukseklik: 800 }).select('id').single()).data;
  await admin.from('oylar').insert({ kare: k.id, veren: K.Z.id, puan });
  return k;
}
// E1: 20 gün önce bitti. Su: Ayşe birinci; Can sıralamaya girmiyor. Gece: Barış ve Can eşit birinci.
const E1 = await etkinlik(-480, ['Su', 'Gece']);
const suAyse = await kare(E1.t[0], K.A, 9); await kare(E1.t[0], K.B, 7); await kare(E1.t[0], K.C, 3); await kare(E1.t[0], K.D, 2);
await kare(E1.t[1], K.B, 8); await kare(E1.t[1], K.C, 8);
// E2: bir saat önce bitti, Ayşe'nin Wrapped'i izlenmedi. Işık: Deniz birinci.
const E2 = await etkinlik(-1, ['Işık']);
await kare(E2.t[0], K.D, 6); await kare(E2.t[0], K.A, 5);
await admin.from('wrapped_izlendi').insert([K.B, K.C, K.D, K.Z].map(u => ({ etkinlik: E2.id, uye: u.id })));

const b = await webkit.launch();
const hatalar = [];
async function sayfa(k, izle = false) {
  const ctx = await b.newContext({ ...devices['iPhone 14'] });
  // İlk kareden itibaren: ana ekranda Wrapped'i izlenmemiş etkinliğin kazananı (Deniz) göründü mü
  if (izle) await ctx.addInitScript(() => {
    // DOM her değiştiğinde bak: kare kaçırmasın (rAF döngüsü kısa ömürlü bir çizimi atlayabiliyor)
    window.__ifsa = false; window.__degisim = 0;
    const bas = () => new MutationObserver(() => { window.__degisim++; if (!location.hash.startsWith('#/wrapped') && [...document.querySelectorAll('.ev .alt b')].some(x => x.textContent.includes('Deniz'))) window.__ifsa = true; })
      .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    // WebKit'te başlangıç betiği çalışırken belge kökü henüz yok
    if (document.documentElement) bas(); else document.addEventListener('DOMContentLoaded', bas, { once: true });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(String(e)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, k.eposta);
  return p;
}
const git = async (p, yol) => { await p.evaluate(y => { location.hash = '#/' + y; }, yol); await p.waitForTimeout(1800); };
const alt = p => p.locator('.ev .alt').allTextContents().then(l => l.map(x => x.replace(/\s+/g, ' ').trim()));
const yazi = async (p, s) => ((await p.locator(s).first().textContent({ timeout: 1500 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

try {
  const P = await sayfa(K.A, true);
  // Wrapped izlenmeden ana ekran o etkinliğin kazananını bir kare bile göstermiyor (karar 39'un sürprizi).
  // Temiz yükleme: oturum açık, ana ekran ilk kez açılıyor
  await P.goto(APP + '#/etkinlikler'); await P.reload(); await P.waitForTimeout(4000);
  bekle('wrapped izlenmemişken otomatik açıldı (kontrol)', (await P.evaluate(() => location.hash)).startsWith('#/wrapped/'), await P.evaluate(() => location.hash));
  bekle('ana ekran çizildi (kontrol)', (await P.evaluate(() => window.__degisim)) > 0, String(await P.evaluate(() => window.__degisim)));
  bekle('wrapped izlenmeden ana ekranda o etkinliğin kazananı hiç görünmedi', !(await P.evaluate(() => window.__ifsa)));

  // İzlendikten sonra, uygulama içinde dönünce kazananlar görünüyor; ortak birinciler virgülle
  await admin.from('wrapped_izlendi').insert({ etkinlik: E2.id, uye: A.id });
  await git(P, 'siralama'); await git(P, 'etkinlikler'); await P.waitForTimeout(1500);
  let satirlar = await alt(P);
  bekle('izlendikten sonra yeni etkinliğin kazananı görünüyor', satirlar.some(x => x.includes('Işık: Deniz Yılmaz')), JSON.stringify(satirlar));
  bekle('eski etkinlikte tek birinci', satirlar.some(x => x.includes('Su: Ayşe Kaya')), JSON.stringify(satirlar));
  bekle('ortak birinciler virgülle', satirlar.some(x => x.includes('Gece: Barış Ak, Can Öz')), JSON.stringify(satirlar));

  // Sonuçtan sonra birincinin karesi çıkarılınca uygulama içinde dönüşte yeni birinci görünüyor
  const cik = await P.evaluate(async id => (await window.__sb.rpc('kare_cikar', { p_kare: id, p_neden: 'Deneme' })).error?.message ?? null, suAyse.id);
  bekle('birincinin karesi çıkarıldı (kontrol)', cik === null, String(cik));
  await git(P, 'siralama'); await git(P, 'etkinlikler'); await P.waitForTimeout(1500);
  satirlar = await alt(P);
  bekle('çıkarılan kazanan arşivde kalmıyor, yeni birinci görünüyor', satirlar.some(x => x.includes('Su: Barış Ak')) && !satirlar.some(x => x.includes('Su: Ayşe Kaya')), JSON.stringify(satirlar));

  // Sonuç: kendi karesi çıkarılan kişi bunu kendi kartında görüyor
  await git(P, `sonuc/${E1.id}`);
  bekle('senin karen: çıkarıldı', /^Karen yarışmadan çıkarıldı/.test(await yazi(P, '.senin')), await yazi(P, '.senin'));

  // Kazananlar okunamazsa liste yine açılıyor, satırlar tema adıyla kalıyor
  await P.route('**/rest/v1/rpc/sonuc_kareleri*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deneme"}' }));
  await git(P, 'siralama'); await git(P, 'etkinlikler'); await P.waitForTimeout(1500);
  satirlar = await alt(P);
  bekle('kazananlar okunamazsa liste açık, satırlar tema adıyla', satirlar.length === 2 && satirlar.every(x => !x.includes(':')) && satirlar.some(x => x.includes('Su · Gece')), JSON.stringify(satirlar));
  await P.unroute('**/rest/v1/rpc/sonuc_kareleri*');

  // Boş cevap saklanmıyor: telefon saati ileriyken sunucu henüz "sonuç" demiyor; sonraki tazelemede geliyor
  await P.route('**/rest/v1/rpc/sonuc_kareleri*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await git(P, 'siralama'); await git(P, 'etkinlikler'); await P.waitForTimeout(1500);
  bekle('boş cevapta kazanan yok (kontrol)', (await alt(P)).every(x => !x.includes(':')), JSON.stringify(await alt(P)));
  await P.unroute('**/rest/v1/rpc/sonuc_kareleri*');
  await P.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await P.waitForTimeout(2000);
  bekle('boş cevap saklanmadı, tazelemede kazananlar geldi', (await alt(P)).some(x => x.includes('Su: Barış Ak')), JSON.stringify(await alt(P)));

  // Wrapped durumu okunamazsa (hata ya da istek düşerse) o etkinliğin kazananı gizli kalıyor, diğerleri görünüyor
  for (const [ad, cevap] of [['hata', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deneme"}' })], ['istek düştü', r => r.abort()]]) {
    await P.route('**/rest/v1/rpc/wrapped_ozeti*', cevap);
    await git(P, 'siralama'); await git(P, 'etkinlikler'); await P.waitForTimeout(1500);
    const l = await alt(P);
    bekle(`wrapped durumu okunamazsa (${ad}) o etkinliğin kazananı gizli, eskiler görünüyor`, !l.some(x => x.includes('Deniz')) && l.some(x => x.includes('Su: Barış Ak')), JSON.stringify(l));
    await P.unroute('**/rest/v1/rpc/wrapped_ozeti*');
  }

  // Sıralamaya girmeyen: kendi puanını yalnız kendi görüyor (karar 38, 52)
  const C = await sayfa(K.C);
  await git(C, `sonuc/${E1.id}`);
  bekle('senin karen: sıralamaya girmedi, puanı yalnız kendine', /^3,0 ?Puanın ?Karen sıralamaya girmedi\. Puanını yalnız sen görüyorsun\.$/.test(await yazi(C, '.senin')), await yazi(C, '.senin'));
  const D = await sayfa(K.D);
  const dSira = ((await K.D.c.rpc('siralama')).data ?? []).find(x => x.benim);
  bekle('Deniz sezonda sıralamaya girmedi (kontrol)', dSira && !dSira.sirali && dSira.ortalama != null, JSON.stringify(dSira));
  await git(D, 'siralama');
  bekle('senin yerin: sıralamaya girmedin, ortalaman yalnız sana', /^\d+,\d ?Ortalaman ?Sıralamaya girmedin\. Ortalamanı yalnız sen görüyorsun\.$/.test(await yazi(D, '.sen-yeri')), await yazi(D, '.sen-yeri'));
  // Karesi olmayan üye ne "senin karen" ne "senin yerin" kartı görüyor
  const Z = await sayfa(K.Z);
  await git(Z, `sonuc/${E1.id}`);
  bekle('karesi olmayan: senin karen kartı yok', (await Z.locator('.senin').count()) === 0);
  await git(Z, 'siralama');
  bekle('karesi olmayan: senin yerin kartı yok', (await Z.locator('.sen-yeri').count()) === 0);
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
