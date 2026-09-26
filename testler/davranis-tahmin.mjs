// Davranış testi: tahmin oyunu (kararlar 76, 106), skills/behaviour-check.md.
// Kurucu ekranda baştan sona oynuyor; her adımda ekranın söylediği ve veritabanındaki ölçülüyor.
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { kartDenetle } from './kartDenetim.mjs';

const APP = 'http://localhost:5180/';
const SS = '/tmp/cgapp/ss';
fs.mkdirSync(SS, { recursive: true });
await sifirla();

const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'], ['selin@test.local', 'Selin Arı'], ['can@test.local', 'Can Öz'],
  ['deniz@test.local', 'Deniz Akın'], ['elif@test.local', 'Elif Sunar'], ['mert@test.local', 'Mert Demir'],
  ['pelin@test.local', 'Pelin Er'],
];
const U = [];
for (const [e, ad] of KISI) U.push({ ...(await kullanici(e, ad)), ad, eposta: e });
const [A] = U;
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
await admin.from('uyeler').insert(U.slice(1).map(u => ({ id: u.id, ad: u.ad, eposta: u.eposta, rol: 'uye', hosgeldin_goruldu: true })));

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const [SOKAK, DOKU] = (await admin.from('temalar').insert([
  { etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true },
  { etkinlik: E, ad: 'Doku', sira: 2, bulusmada: false },
]).select('id, sira')).data.sort((x, y) => x.sira - y.sira);

// Kurucu kare vermiyor: bütün karelere soru alabiliyor (6 soru), adayları kare veren altı kişi (karar 107)
const sahibi = {};
const yukle = async (K, tema) => {
  const yol = `${E}/${tema.id}/${crypto.randomUUID()}.jpg`;
  await K.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const r = await K.c.from('kareler').insert({ tema: tema.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single();
  if (!r.error) sahibi[r.data.id] = K.id;
};
for (const u of U.slice(1)) await yukle(u, SOKAK);
for (const u of [U[1], U[2]]) await yukle(u, DOKU);
await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E);
// Sıralama belli olsun diye puanlar karenin sırasına göre
const sira = Object.keys(sahibi);
const oyla = async (K, hepsi = true) => {
  const l = (await K.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [];
  for (const k of (hepsi ? l : l.slice(1))) await K.c.from('oylar').insert({ kare: k.id, veren: K.id, puan: Math.min(10, sira.indexOf(k.id) + 1) });
};
for (const u of U.slice(1)) await oyla(u);

const b = await chromium.launch();
const hatalar = [];
async function kisi(eposta) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(`${eposta}: ${e}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) hatalar.push(`${eposta}: ${m.text()}`); });
  await p.goto(APP);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, eposta);
  return p;
}
const git = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(1400); };
const metin = p => p.locator('.app').innerText().then(t => t.replace(/\s+/g, ' '));
const var_ = async (p, t) => (await metin(p)).toLocaleLowerCase('tr-TR').includes(t.toLocaleLowerCase('tr-TR'));
const KART_DENETIMI = ['60-tahmin-kart', '61-tahmin-teklif', '64-tahmin-gonderildi', '66-tahmin-sonuc'];
async function olc(p, ad) {
  const r = await p.evaluate(() => {
    const tasma = [...document.querySelectorAll('.app *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > window.innerWidth + 1 || b.left < -1); }).map(e => e.className).slice(0, 3);
    const kucuk = [...document.querySelectorAll('.app button:not([disabled])')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height < 44; }).map(e => e.textContent.trim()).slice(0, 3);
    return { tasma, kucuk };
  });
  bekle(`${ad}: taşma yok`, r.tasma.length === 0, JSON.stringify(r.tasma));
  bekle(`${ad}: 44px altı düğme yok`, r.kucuk.length === 0, JSON.stringify(r.kucuk));
  // Kart sistemi (karar 118): oylama listesi, teklif, gönderildi ve sonuç ekranları
  if (KART_DENETIMI.includes(ad)) await kartDenetle(p, ad, bekle);
  await p.screenshot({ path: `${SS}/${ad}.png` });
}

const P = await kisi(A.eposta);
try {
  // ------------------------------------------------ 1. oylaması eksikken kart yok
  await oyla(A, false);   // bir kare eksik
  await git(P, 'oyla');
  bekle('1: oylaması eksikken tahmin kartı yok', (await P.locator('.tahmin-kart').count()) === 0);
  await git(P, `tahmin/${E}`);
  bekle('1: doğrudan açınca nedenini söylüyor', await var_(P, 'bütün karelere puan verince açılıyor'), (await metin(P)).slice(0, 200));

  // ------------------------------------------------ 2. oylayınca kart ve teklif
  const eksik = ((await A.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? []).find(k => k.puan == null);
  await A.c.from('oylar').insert({ kare: eksik.id, veren: A.id, puan: 3 });
  await git(P, 'oyla');
  bekle('2: oylama bitince tahmin kartı çıkıyor', (await P.locator('.tahmin-kart').count()) === 1);
  bekle('2: kart eylemi söylüyor', await var_(P, 'Tahmin oyunu') && (await P.locator('.tahmin-kart .git').textContent()).includes('Oyna'));
  await olc(P, '60-tahmin-kart');
  // Buse (2026-09-26): oylama bitince açık kalan iş bu, bilgi notu gibi değil eylem gibi görünsün: ters kart
  bekle('2: tahmin kartı ters (açık zemin)', await P.locator('.tahmin-kart').evaluate(k => getComputedStyle(k).backgroundColor === getComputedStyle(document.body).color));
  await P.locator('.tahmin-kart').click(); await P.waitForTimeout(1300);
  bekle('2: teklif ekranı ve kilit uyarısı', await var_(P, 'Başlarsan puanların kilitlenir') && await var_(P, 'Oyunu başlat'));
  bekle('2: teklif puanları gözden geçirme yolu veriyor', await var_(P, 'Puanlarımı gözden geçir'));
  await olc(P, '61-tahmin-teklif');
  // Ne olduğu, kilit uyarısı ve Oyunu başlat tek kartta; gözden geçir dışarıda (Buse, 2026-09-26)
  bekle('2: teklif tek kart: açıklama, kilit uyarısı, başlat düğmesi', await P.locator('.tahmin-teklif', { hasText: 'Başlarsan puanların kilitlenir' }).getByRole('button', { name: 'Oyunu başlat' }).count() === 1
    && await P.locator('.tahmin-teklif').getByRole('button', { name: 'Puanlarımı gözden geçir' }).count() === 0);
  bekle('2: başlamadan veritabanında oyun yok', ((await admin.from('tahmin_oyun').select('uye').eq('uye', A.id)).data ?? []).length === 0);

  // ------------------------------------------------ 3. başlat ve oyna
  // Teklif ekranı açıkken oylama kapanırsa: başlatma düşüyor, ekran nedenini söylüyor
  await P.route('**/rest/v1/rpc/tahmin_baslat*', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'tahmin_oylama_kapali', details: null, hint: null }) }), { times: 1 });
  await P.getByRole('button', { name: 'Oyunu başlat' }).click(); await P.waitForTimeout(1200);
  bekle('3: başlatma düşünce nedeni yazıyor', await var_(P, 'Tahmin oyunu yalnız oylama sürerken oynanıyor.'), (await metin(P)).slice(-200));
  bekle('3: başlatma düşünce düğme yine basılabilir', await P.getByRole('button', { name: 'Oyunu başlat' }).isEnabled());
  bekle('3: başlatma düşünce veritabanında oyun yok', ((await admin.from('tahmin_oyun').select('uye').eq('uye', A.id)).data ?? []).length === 0);
  await P.getByRole('button', { name: 'Oyunu başlat' }).click(); await P.waitForTimeout(1800);
  const vtSoru = (await admin.from('tahmin_soru').select('sira, kare').eq('uye', A.id).order('sira')).data ?? [];
  bekle('3: sunucu soruları seçti', vtSoru.length === 6, String(vtSoru.length));
  bekle('3: ilerleme çubuğu soru sayısı kadar', (await P.locator('.tahmin-ilerleme i').count()) === vtSoru.length);
  bekle('3: ilk çubuk şimdiki', (await P.locator('.tahmin-ilerleme i').nth(0).getAttribute('class')) === 'su');
  bekle('3: sayaç 01 / 06', (await P.locator('.tahmin-bas span').textContent()) === '01 / 06', await P.locator('.tahmin-bas span').textContent());
  bekle('3: fotoğraf yüklendi', await P.locator('.tahmin-foto img').evaluate(i => i.complete && i.naturalWidth > 0));
  bekle('3: fotoğraf kırpılmıyor', await P.locator('.tahmin-foto img').evaluate(i => getComputedStyle(i).objectFit === 'contain'));
  const adlar = async () => (await P.locator('.aday').allTextContents()).map(x => x.trim());
  const ilkListe = await adlar();
  bekle('3: adaylar kare veren herkes (6)', ilkListe.slice().sort().join() === U.slice(1).map(u => u.ad).sort().join(), JSON.stringify(ilkListe));
  bekle('3: adaylar Türkçe alfabeye göre', JSON.stringify(ilkListe) === JSON.stringify([...ilkListe].sort((a, b) => a.localeCompare(b, 'tr'))), JSON.stringify(ilkListe));
  bekle('3: aday düğmeleri ekrana sığıyor, iki sütun', await P.locator('.adaylar').evaluate(g => getComputedStyle(g).gridTemplateColumns.split(' ').length === 2 && g.scrollWidth <= g.clientWidth));
  bekle('3: seçim yokken ilerle kapalı', await P.getByRole('button', { name: 'Sıradaki' }).isDisabled());
  await olc(P, '62-tahmin-soru');

  // Uzun liste (gerçek kulüpte 12+ fotoğrafçı): fotoğraf başlığı ve isimleri örtmemeli
  const sahteAd = ['Zeynep Çelik', 'Şule Oğuz', 'Ömer Yıldız', 'İlker Aydın', 'Barış Kılıç', 'Gökçe Uçar', 'Hande Işık'];
  await P.route('**/rest/v1/rpc/tahmin_sorularim*', async r => {
    const c = await r.fetch();
    r.fulfill({ response: c, json: (await c.json()).map(x => ({ ...x, adaylar: [...x.adaylar, ...sahteAd.map((ad, i) => ({ uye: `00000000-0000-0000-0000-00000000000${i}`, ad }))] })) });
  });
  await P.reload(); await P.waitForTimeout(2500);
  const kutu = async q => P.locator(q).first().boundingBox();
  const [bas, foto, ilkAday] = [await kutu('.tahmin-bas'), await kutu('.tahmin-foto img'), await kutu('.aday')];
  bekle('3: uzun liste: 13 aday', (await P.locator('.aday').count()) === 13);
  bekle('3: uzun liste: fotoğraf başlığı ve isimleri örtmüyor', !!(bas && foto && ilkAday) && foto.y >= bas.y + bas.height && foto.y + foto.height <= ilkAday.y, JSON.stringify({ bas, foto, ilkAday }));
  bekle('3: uzun liste: fotoğraf görünür boyda', (foto?.height ?? 0) >= 150, String(foto?.height));
  await olc(P, '62b-tahmin-uzun-liste');
  await P.unroute('**/rest/v1/rpc/tahmin_sorularim*');
  await P.reload(); await P.waitForTimeout(2500);

  // İlk soruyu geç
  // Cevap sunucuda düşerse: soru yerinde kalıyor, neden yazıyor
  await P.route('**/rest/v1/rpc/tahmin_cevapla*', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'tahmin_oylama_kapali', details: null, hint: null }) }), { times: 1 });
  await P.getByRole('button', { name: 'Bilmiyorum, geç' }).click(); await P.waitForTimeout(900);
  bekle('3: cevap düşünce nedeni yazıyor', await var_(P, 'Tahmin oyunu yalnız oylama sürerken oynanıyor.'), (await metin(P)).slice(-200));
  bekle('3: cevap düşünce aynı soruda kalıyor', (await P.locator('.tahmin-bas span').textContent()) === '01 / 06');
  bekle('3: cevap düşünce veritabanına bir şey yazılmadı', ((await admin.from('tahmin_soru').select('gecti, cevap').eq('uye', A.id).eq('sira', 1).single()).data?.gecti) === false);
  await P.getByRole('button', { name: 'Bilmiyorum, geç' }).click(); await P.waitForTimeout(900);
  bekle('3: geçince ikinci soruya geçti', (await P.locator('.tahmin-bas span').textContent()) === '02 / 06');
  bekle('3: geçiş veritabanına yazıldı', ((await admin.from('tahmin_soru').select('gecti').eq('uye', A.id).eq('sira', 1).single()).data?.gecti) === true);

  // Kalanlar: ilk adayı seç. Her soruda liste aynı kalmalı.
  for (let i = 2; i <= vtSoru.length; i++) {
    bekle(`3: soru ${i}: aday listesi aynı`, JSON.stringify(await adlar()) === JSON.stringify(ilkListe));
    const ad = (await P.locator('.aday').first().textContent()).trim();
    await P.locator('.aday').first().click();
    bekle(`3: soru ${i}: seçim altta görünüyor`, (await P.locator('.tahmin-alt .secim b').textContent()).trim() === ad);
    if (i === vtSoru.length) {
      bekle('3: son soruda düğme gönder', await P.getByRole('button', { name: 'Gönder' }).isEnabled());
      await olc(P, '63-tahmin-son');
      await P.getByRole('button', { name: 'Gönder' }).click();
    } else {
      await P.getByRole('button', { name: 'Sıradaki' }).click();
    }
    await P.waitForTimeout(900);
  }
  bekle('3: gönderildi ekranı', await var_(P, 'Tahminlerin gönderildi') && await var_(P, '5 kareye isim verdin, 1 kareyi geçtin'), (await metin(P)).slice(0, 220));
  bekle('3: doğru cevap oylama sürerken hiç görünmüyor', !(await var_(P, 'doğru bildin')) && (await P.locator('.tahmin-satir').count()) === 0);
  bekle('3: veritabanında gönderildi', !!((await admin.from('tahmin_oyun').select('gonderildi').eq('uye', A.id).single()).data?.gonderildi));
  await olc(P, '64-tahmin-gonderildi');

  // ------------------------------------------------ 4. puan kilidi ekranda
  await git(P, `oyla/${SOKAK.id}`);
  bekle('4: oylama akışında kaydırıcı yok, kilit notu var', (await P.locator('.kaydirici').count()) === 0 && (await P.locator('.kilit-not').count()) > 0);
  bekle('4: kilit notu nedenini söylüyor', await var_(P, 'Tahmin oyununu başlattığın için kilitli'));
  await olc(P, '65-tahmin-kilit');
  await git(P, 'oyla');
  bekle('4: oylama listesinde kart gönderildi diyor', (await P.locator('.tahmin-kart').textContent()).includes('Tahminlerin gönderildi'));

  // ------------------------------------------------ 5. ötekiler de oynuyor (tanınma sayısı için); Pelin oynamıyor
  const PELIN = U[6];
  for (const u of U.slice(1, 6)) {
    const r = await u.c.rpc('tahmin_baslat', { p_etkinlik: E });
    if (r.error) continue;
    for (const s of (await u.c.rpc('tahmin_sorularim', { p_etkinlik: E })).data ?? [])
      await u.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: s.sira, p_cevap: sahibi[s.kare], p_gec: false });
  }

  // ------------------------------------------------ 6. sonuç
  await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
  const vt = (await admin.from('tahmin_soru').select('kare, cevap, gecti').eq('uye', A.id)).data ?? [];
  const dogruSayisi = vt.filter(x => x.cevap && x.cevap === sahibi[x.kare]).length;
  await git(P, `sonuc/${E}`);
  bekle('6: sonuç ekranında tahmin kartı', (await P.locator('.tahmin-kart').count()) === 1);
  await kartDenetle(P, '6-sonuc-tahmin-karti', bekle);
  bekle('6: kart skoru söylüyor', (await P.locator('.tahmin-kart b').textContent()).includes(`${dogruSayisi}/6`), await P.locator('.tahmin-kart b').textContent());
  await P.locator('.tahmin-kart').click(); await P.waitForTimeout(1500);
  bekle('6: skor gerçek cevaplardan', (await P.locator('.tahmin-skor b').textContent()) === `${dogruSayisi}/6`, await P.locator('.tahmin-skor b').textContent());
  bekle('6: kareler kimindi, altı satır', (await P.locator('.tahmin-satir').count()) === 6);
  bekle('6: tik yalnız doğru olanlarda', (await P.locator('.tahmin-satir .tik').count()) === dogruSayisi);
  bekle('6: geçilen satır geçtin diyor', await var_(P, 'geçtin'));
  bekle('6: skorun yalnız kişiye olduğu yazıyor', await var_(P, 'Bu skoru yalnız sen görüyorsun'));
  await olc(P, '66-tahmin-sonuc');
  // Doğru işareti yuvarlak rozet: köşeli kutu onay kutusu gibi görünüyordu (Buse, 2026-09-26)
  bekle('6: doğru işareti yuvarlak', await P.locator('.tahmin-satir .tik').first().evaluate(t => getComputedStyle(t).borderTopLeftRadius === '50%'));
  // Oylamada çıkarılan kare: satırda söyleniyor, skora girmiyor. Sunucu cevabında bir doğru
  // satır (yoksa ilk satır) çıkarılmış gösteriliyor.
  await P.route('**/rest/v1/rpc/tahmin_sonucum*', async r => {
    const c = await r.fetch(); const l = await c.json();
    const i = Math.max(0, l.findIndex(x => x.dogru));
    r.fulfill({ response: c, json: l.map((x, j) => (j === i ? { ...x, sayildi: false } : x)) });
  });
  await P.reload(); await P.waitForTimeout(2000);
  const cikanDogru = dogruSayisi > 0 ? 1 : 0;
  bekle('6: çıkarılan kare satırda söyleniyor', (await P.locator('.tahmin-satir', { hasText: 'Yarışmadan çıkarıldı, skora girmedi' }).count()) === 1);
  bekle('6: çıkarılan kare skora girmiyor', (await P.locator('.tahmin-skor b').textContent()) === `${dogruSayisi - cikanDogru}/5`, await P.locator('.tahmin-skor b').textContent());
  bekle('6: çıkarılan kare listede kalıyor', (await P.locator('.tahmin-satir').count()) === 6);
  await P.unroute('**/rest/v1/rpc/tahmin_sonucum*');

  // Tanınma: hangi karenin alt sınırı geçtiği rastgele, o yüzden Sokak sekmesindeki her
  // kareye tek tek bakılıyor. Alt sınırı geçen her karede satır doğru sayıyla, geçmeyende yok.
  const esik = Math.ceil(7 / 3);
  const tum = (await admin.from('tahmin_soru').select('kare, cevap')).data ?? [];
  const sokakKareleri = (await admin.from('kareler').select('id, sahip').eq('tema', SOKAK.id)).data ?? [];
  let gecen = 0, yanlis = [];
  for (let i = 0; ; i++) {
    await git(P, `sonuc/${E}`);
    const sec = P.locator('.odul img, .kursu figure, .izgara figure');
    if (i >= await sec.count()) break;
    await sec.nth(i).click(); await P.waitForTimeout(1100);
    const ad = ((await P.locator('.kim .ad').textContent().catch(() => '')) ?? '').replace(' · sen', '').trim();
    const sahipId = U.find(u => u.ad === ad)?.id;
    const k = sokakKareleri.find(x => x.sahip === sahipId);
    if (!k) continue;
    const toplam = tum.filter(x => x.kare === k.id && x.cevap).length;
    const bilen = tum.filter(x => x.kare === k.id && x.cevap === sahipId).length;
    const satir = (await P.locator('.kunye.taninma').count()) === 1;
    const yazi = satir ? await P.locator('.kunye.taninma span').textContent() : '';
    if (toplam >= esik) {
      gecen++;
      if (!satir || !yazi.includes(`${bilen} / ${toplam} kişi`)) yanlis.push(`${ad}: ${bilen}/${toplam} bekleniyordu, "${yazi}"`);
      if (gecen === 1) await olc(P, '67-tahmin-taninma');
    } else if (satir) yanlis.push(`${ad}: ${toplam} < ${esik} ama satır var`);
  }
  bekle('6: alt sınırı geçen en az bir kare sınandı', gecen > 0, String(gecen));
  bekle('6: tanınma satırı her karede doğru, herkese görünüyor', yanlis.length === 0, yanlis.join(' | '));


  // Oynamayan sonuçta oyun ekranını açarsa: skor değil, oynamadığı söyleniyor
  const PP = await kisi(PELIN.eposta);
  await git(PP, `sonuc/${E}`);
  bekle('6: oynamayanın sonuç ekranında tahmin kartı yok', (await PP.locator('.tahmin-kart').count()) === 0);
  await git(PP, `tahmin/${E}`);
  bekle('6: oynamayana "Bu etkinlikte oynamadın"', await var_(PP, 'Bu etkinlikte oynamadın') && (await PP.locator('.tahmin-skor, .tahmin-satir').count()) === 0, (await metin(PP)).slice(0, 200));
  await PP.getByRole('button', { name: 'Sonuçlara dön' }).click(); await PP.waitForTimeout(1500);
  bekle('6: oynamadın ekranından sonuçlara dönülüyor', PP.url().includes(`#/sonuc/${E}`), PP.url());

  // ------------------------------------------------ 7. profil
  await git(P, 'profil');
  const isimVerdigi = vt.filter(x => x.cevap).length;
  bekle('7: profilde birikmiş skor', (await metin(P)).replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR').includes(`${dogruSayisi}/${isimVerdigi} tahminde bildin`), (await metin(P)).slice(0, 400));

  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
