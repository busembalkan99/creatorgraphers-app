// Bildirim gönder ekranında düğmelerin kilitlendiği durumlar (0026): hak bitince (hakYok) satır ve
// Herkese gönder kapalı, abone yokken Herkese gönder kapalı, gönderim sürerken (mesgul) bütün düğmeler
// kapalı, hatalı gönderimden sonra durum yeniden okunuyor, Son gönderilenler boşken başlık yok,
// etiketsiz Wrapped'in kime metni. Durumlar sunucunun cevabı değiştirilerek kuruluyor (elle-bildirim-durumlar.mjs'deki gibi).
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');
for (const [u, n] of [[A, 'a'], [B, 'b']]) await u.c.rpc('bildirim_abone_ol', { p_endpoint: `https://push.example/${n}`, p_p256dh: 'p', p_auth: 'a' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date(Date.now() + 3 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }), yukleme_baslar: saat(-2), yukleme_biter: saat(40), oylama_biter: saat(80), kuran: A.id }).select('id').single()).data.id;
await admin.from('temalar').insert({ etkinlik: E, ad: 'Gece', sira: 1, bulusmada: false });

const b = await webkit.launch(); const hatalar = [];
const giris = async eposta => {
  const p = await (await b.newContext({ ...devices['iPhone 14'] })).newPage();
  p.on('pageerror', x => hatalar.push(String(x)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); }, eposta);
  return p;
};
const ac = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2500); };
const kucuk = t => t.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
const blok = (p, ad) => p.locator('.satir-kartlari').first().locator(':scope > div', { has: p.locator('.satir', { hasText: ad }) });
const gonderDugmesi = (p, ad) => blok(p, ad).locator('.satir').getByRole('button', { name: 'Gönder' });
const DURUM = '**/rest/v1/rpc/elle_bildirim_durumu*';
const GONDER = '**/rest/v1/rpc/elle_bildirim_gonder*';
const sahte = (p, degistir) => p.route(DURUM, async r => {
  const cevap = await r.fetch();
  r.fulfill({ response: cevap, json: degistir(await cevap.json()) });
});
const tur = (d, t) => {
  let h = d.hatirlatmalar.find(x => x.tur === t);
  if (!h) { h = { tur: t, gorunur: true, alici: 1, bugun: false, etiket: null }; d.hatirlatmalar.push(h); }
  return h;
};
// Sayısız (alici: null) yükleme hatırlatması ve 2 alıcılı tema satırı; abone ve kalan sunucudan
const satirlar = d => {
  Object.assign(tur(d, 'yukleme'), { gorunur: true, alici: null, bugun: false });
  Object.assign(tur(d, 'tema_oner'), { gorunur: true, alici: 2, bugun: false });
  return d;
};
const doldur = async p => { await p.getByLabel('Başlık').fill('Cumartesi'); await p.getByLabel('Metin').fill('Saat 10.00, Karaköy.'); };
try {
  const P = await giris('kurucu@test.local');
  const herkese = P.getByRole('button', { name: 'Herkese gönder' });

  // 0. Karşılaştırma: hak ve abone varken sayısız satır ve Herkese gönder açık
  await sahte(P, d => ({ ...satirlar(d), kalan: 2 }));
  await ac(P, 'bildirim');
  bekle('hak varken sayısız yükleme satırında Gönder açık', await gonderDugmesi(P, 'Fotoğraf yüklemedin').isEnabled());
  await doldur(P);
  bekle('hak ve abone varken Herkese gönder açık', await herkese.isEnabled());
  await P.unroute(DURUM);

  // 1. hakYok: kalan 0, abone var, satır sayısız (alici null) -> Gönder kapalı
  await sahte(P, d => ({ ...satirlar(d), kalan: 0 }));
  await ac(P, 'bildirim');
  const yukSatir = await blok(P, 'Fotoğraf yüklemedin').locator('.satir').innerText();
  bekle('hak bitince sayısız satır yine de alıcılı görünüyor', yukSatir.includes('İşi kalana gidecek'), yukSatir);
  bekle('hakYok: hak bitince sayısız yükleme satırında Gönder kapalı', await gonderDugmesi(P, 'Fotoğraf yüklemedin').isDisabled());

  // 2. hakYok: kalan 0, başlık ve metin dolu -> Herkese gönder kapalı
  await doldur(P);
  bekle('hakYok: hak bitince başlık ve metin doluyken Herkese gönder kapalı', await herkese.isDisabled());
  await P.unroute(DURUM);

  // 3. serbestHazir: abone 0, hak var, başlık ve metin dolu -> Herkese gönder kapalı
  await sahte(P, d => ({ ...satirlar(d), kalan: 2, abone: 0 }));
  await ac(P, 'bildirim');
  await doldur(P);
  bekle('serbestHazir: abone yokken başlık ve metin doluyken Herkese gönder kapalı', await herkese.isDisabled());
  await P.unroute(DURUM);

  // 4. mesgul: gönderim sürerken onaydaki Gönder ve satırların Gönder düğmeleri kapalı
  await sahte(P, d => ({ ...satirlar(d), kalan: 2 }));
  await ac(P, 'bildirim');
  let birak; const tutuldu = new Promise(r => { birak = r; });
  await P.route(GONDER, async r => { await tutuldu; await r.fulfill({ status: 200, contentType: 'application/json', body: '2' }); }, { times: 1 });
  await gonderDugmesi(P, 'Tema önerebilirsin').click(); await P.waitForTimeout(300);
  const onayGonder = P.locator('.onay').getByRole('button', { name: 'Gönder' });
  bekle('istekten önce onaydaki Gönder açık', await onayGonder.isEnabled());
  await onayGonder.click(); await P.waitForTimeout(400);
  bekle('mesgul: istek sürerken onaydaki Gönder kapalı', await onayGonder.isDisabled());
  bekle('mesgul: istek sürerken sayısız satırın Gönder düğmesi kapalı', await gonderDugmesi(P, 'Fotoğraf yüklemedin').isDisabled());
  bekle('mesgul: istek sürerken tema satırının Gönder düğmesi kapalı', await gonderDugmesi(P, 'Tema önerebilirsin').isDisabled());
  birak(); await P.waitForTimeout(1500);
  bekle('istek bitince satırın Gönder düğmesi yeniden açık', await gonderDugmesi(P, 'Fotoğraf yüklemedin').isEnabled());
  await P.unroute(DURUM);

  // 5. gonder hatası: durum yeniden okunuyor (sayılar ve hak güncelleniyor)
  let okuma = 0;
  await P.route(DURUM, r => { okuma++; return r.continue(); });
  await ac(P, 'bildirim');
  await P.route(GONDER, r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'elle_sinir', details: null, hint: null }) }), { times: 1 });
  await gonderDugmesi(P, 'Tema önerebilirsin').click(); await P.waitForTimeout(300);
  const once = okuma;
  await P.locator('.onay').getByRole('button', { name: 'Gönder' }).click(); await P.waitForTimeout(1500);
  const hataAlt = await blok(P, 'Tema önerebilirsin').locator('[role=alert]').innerText().catch(() => '');
  bekle('gönderim hatası göründü', hataAlt.includes('Bugünkü iki bildirim hakkı doldu'), hataAlt);
  bekle('gönderim hatasından sonra durum yeniden okunuyor', okuma > once, `${once} -> ${okuma}`);
  await P.unroute(DURUM);

  // 6. Son gönderilenler boşken başlık yok
  await sahte(P, d => ({ ...d, son: [] }));
  await ac(P, 'bildirim');
  const m6 = kucuk(await P.locator('.app').innerText());
  bekle('ekran açıldı', m6.includes('kendin yaz'), m6.slice(0, 120));
  bekle('son boşken Son gönderilenler başlığı yok', (await P.locator('h2', { hasText: 'Son gönderilenler' }).count()) === 0 && !m6.includes('son gönderilenler'));
  await P.unroute(DURUM);

  // 7. etiketsiz Wrapped: "Son buluşmasının" geri metni
  await sahte(P, d => { Object.assign(tur(d, 'wrapped'), { gorunur: true, alici: 1, bugun: false, etiket: null }); return d; });
  await ac(P, 'bildirim');
  const wr = await blok(P, "Wrapped'ini izlemedin").locator('.satir').innerText();
  bekle("etiketsiz Wrapped'in kime metni: Son buluşmasının", wr.includes("Son buluşmasının Wrapped'ini açmamış olanlara") && !wr.includes('null'), wr);
  await P.unroute(DURUM);

  // Yeniden yüklemede yarıda kalan istekler WebKit'te "access control checks" diye düşüyor; başka sayfa hatası olmamalı
  const diger = hatalar.filter(x => !x.includes('due to access control checks'));
  bekle('sayfa hatası yok', diger.length === 0, diger.join(' | '));
} finally { await b.close(); }
rapor();
