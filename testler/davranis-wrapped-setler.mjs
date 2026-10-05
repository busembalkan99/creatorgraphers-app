// Davranış testi: Wrapped kütüphanesinin yeni setleri (karar 126, spec 2026-10-03_wrapped-kutuphane_v1).
// Kalkış tabelası ve Kontakt baskı aynı veriyle: metinler, eşit birincilik, uzun isim, Türkçe harf,
// imzasız kare, hareketi azalt. Eski set davranis-wrapped.mjs'te.
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';

const APP = 'http://localhost:5180/';
const SS = '/tmp/cgapp/ss';
fs.mkdirSync(SS, { recursive: true });
await sifirla();

// Kurucu yalnız oy verir. Birinci, harf yükü ağır uzun isimli fotoğrafçı (panoda kısalmalı).
const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'],
  ['k10@test.local', 'Muhammed Mustafa Karaosmanoğlu'], ['k1@test.local', 'Selin Arı'], ['k2@test.local', 'Can Öz'],
  ['k3@test.local', 'Deniz Akın'], ['k4@test.local', 'Elif Sunar'], ['k5@test.local', 'Mert Demir'],
  ['k6@test.local', 'Pelin Er'], ['k7@test.local', 'Onur Tek'],
  ['yusuf@test.local', 'Yusuf Ak'],   // hiçbir şey yapmıyor: kişisel kart "sensiz geçti"
];
// Sekiz kare: round(8 / 2,5) = 3 kare sıraya giriyor (karar 52), kürsüde ikinci ve üçüncü var
const U = [];
for (const [e, ad] of KISI) U.push({ ...(await kullanici(e, ad)), ad, eposta: e });
const [A] = U;
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
await admin.from('uyeler').insert(U.slice(1).map(u => ({ id: u.id, ad: u.ad, eposta: u.eposta, rol: 'uye', hosgeldin_goruldu: true })));

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const yukle = async (K, E, tema) => {
  const yol = `${E}/${tema}/${crypto.randomUUID()}.jpg`;
  await K.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  return (await K.c.from('kareler').insert({ tema, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single()).data?.id;
};
const etkinlik = async (temalar) => {
  const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-2), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id, wrapped_set: 'klasik' }).select('id').single()).data.id;
  const T = [];
  for (const [i, ad] of temalar.entries()) T.push((await admin.from('temalar').insert({ etkinlik: E, ad, sira: i + 1, bulusmada: true }).select('id').single()).data.id);
  return { E, T };
};
const Y = U[U.length - 1];
const foto = U.slice(1, -1);

// E1: tek tema, sekiz kare, puan sırası 10 - j (birinci uzun isimli). Kürsü kartı çıkıyor.
const { E: E1, T: [T1] } = await etkinlik(['Sokak']);
const k1 = []; for (const u of foto) k1.push(await yukle(u, E1, T1));
// E2: iki tema; Portre'de ilk iki kare eşit puanla birinci
// Uzun tema adı: panoda iki satıra bölünüyor
const { E: E2, T: [T2a, T2b] } = await etkinlik(['Işık ve gölge oyunu', 'Portre']);
const k2a = [], k2b = [];
for (const u of foto) { k2a.push(await yukle(u, E2, T2a)); k2b.push(await yukle(u, E2, T2b)); }
await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).in('id', [E1, E2]);
for (const u of U.filter(u => u !== Y)) {
  for (const E of [E1, E2]) {
    const l = (await u.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [];
    for (const k of l) {
      const j = [k1, k2a, k2b].map(x => x.indexOf(k.id)).find(x => x >= 0);
      const esit = k2b.includes(k.id) && j <= 1;
      await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: esit ? 9 : Math.max(1, 10 - j) });
    }
  }
}
// Son fotoğrafçının karesi yarışmadan çıkarılıyor: kişisel kart "karen sayılmadı"
await A.c.rpc('kare_cikar', { p_kare: k1[k1.length - 1], p_neden: 'Buluşmaya katılmadın.' });
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.5) }).in('id', [E1, E2]);

const b = await chromium.launch();
const hatalar = [];
async function kisi(eposta, hareket = 'no-preference') {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: hareket });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(`${eposta}: ${e}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) hatalar.push(`${eposta}: ${m.text()}`); });
  await p.goto(APP);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, eposta);
  return p;
}
const ac = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2200); };
const metin = p => p.locator('.wr').innerText().then(t => t.replace(/\s+/g, ' ')).catch(() => '');
const var_ = async (p, t) => (await metin(p)).toLocaleLowerCase('tr-TR').includes(t.toLocaleLowerCase('tr-TR'));
const kartAdi = p => p.locator('.wr .tel').getAttribute('data-kart');
const sag = async p => { await p.locator('.wr').click({ position: { x: 330, y: 420 } }); await p.waitForTimeout(400); };
const kartaGit = async (p, ad, sart = async () => true) => {
  for (let j = 0; j < 8 && !((await kartAdi(p)) === ad && await sart()); j++) await sag(p);
  return (await kartAdi(p)) === ad;
};
// Panonun son hâli: her kutunun ilk harfi, satırlar | ile
const panoMetni = p => p.locator('.set-pano .pano-satir').evaluateAll(l => l.map(r => [...r.querySelectorAll('.h b')].map(b => b.firstElementChild.textContent.replace(/ /g, ' ')).join('').trim()).join('|'));
const YASAK = /kalkış|kapı|\bindi\b|rulo|banyoda|seçilen/i;
async function olc(p, ad) {
  await p.waitForTimeout(3800);   // hareket bitsin, son hâli ölçülsün
  const r = await p.evaluate(() => {
    const tel = document.querySelector('.wr .tel').getBoundingClientRect();
    const tasma = [...document.querySelectorAll('.wr .w-ic *')].filter(e => {
      if (e.closest('.serit-pencere')) return false;   // şerit telefonun kenarına bilerek taşıyor, pencere kesiyor
      if (e.closest('.h')) return false;               // pano kutusundaki dönüş harfleri kutunun içinde gizli (overflow)
      const b = e.getBoundingClientRect(); return b.width && (b.right > tel.right + 1 || b.left < tel.left - 1 || b.bottom > tel.bottom + 1);
    }).map(e => e.className).slice(0, 3);
    const kucuk = [...document.querySelectorAll('.wr button')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height < 44; }).map(e => e.textContent.trim()).slice(0, 3);
    return { tasma, kucuk };
  });
  bekle(`${ad}: taşma yok`, r.tasma.length === 0, JSON.stringify(r.tasma));
  bekle(`${ad}: 44px altı düğme yok`, r.kucuk.length === 0, JSON.stringify(r.kucuk));
  await p.screenshot({ path: `${SS}/${ad}.png` });
}

try {
  for (const SET of ['pano', 'kontakt']) {
    await admin.from('etkinlikler').update({ wrapped_set: SET }).in('id', [E1, E2]);
    const no = SET === 'pano' ? 110 : 130;
    const P = await kisi(foto[0].eposta);   // birinci olan
    await ac(P, `wrapped/${E1}`);
    bekle(`${SET}: set kabukta`, (await P.locator('.wr .tel').getAttribute('data-set')) === SET && (await kartAdi(P)) === 'acilis');
    bekle(`${SET}: yasak kelime yok (açılış)`, !YASAK.test(await metin(P)), await metin(P));
    await olc(P, `${no}-${SET}-acilis`);
    if (SET === 'pano') {
      bekle('pano/açılış: başlık', await var_(P, 'Sonuçlar panoda'));
      bekle('pano/açılış: harfler son hâlinde (kişi, kare, puan)', /^\d+\|\d+\|\d+$/.test(await panoMetni(P)), await panoMetni(P));
      bekle('pano/açılış: ekran okuyucu satırı düz okuyor', /^\d+$/.test((await P.locator('.set-pano .pano-satir').first().getAttribute('aria-label')) ?? ''));
    } else {
      bekle('kontakt/açılış: rastgele üç kare görünüyor', (await P.locator('.set-kontakt img').count()) === 3, String(await P.locator('.set-kontakt img').count()));
      bekle('kontakt/açılış: kazanan söylenmiyor (sıra numarası, daire yok)', (await P.locator('.set-kontakt .kare-no').count()) === 0 && (await P.locator('.set-kontakt .kalem-daire').count()) === 0);
      bekle('kontakt/açılış: "Oylar sayıldı" ve film kenarında sayılar', await var_(P, 'Oylar sayıldı') && /\d+ kişi · \d+ kare · \d+ puan/.test((await metin(P)).toLocaleLowerCase('tr-TR')), await metin(P));
    }

    await sag(P);
    bekle(`${SET}/tema: kart`, (await kartAdi(P)) === 'tema');
    await olc(P, `${no + 1}-${SET}-tema`);
    if (SET === 'pano') {
      const t = await panoMetni(P);
      bekle('pano/tema: tema, kısalmış uzun isim, puan, durum', t.startsWith('SOKAK|MUHAMMED K.|') && t.endsWith('|1.'), t);
      const etiket = (await P.locator('.set-pano .pano-eti').allInnerTexts()).map(x => x.toLocaleLowerCase('tr-TR'));
      bekle('pano/tema: etiketler TEMA BİRİNCİ PUAN DURUM', ['tema', 'birinci', 'puan', 'durum'].every(x => etiket.includes(x)), JSON.stringify(etiket));
      bekle('pano/tema: başlık', await var_(P, 'Sokak temasının birincisi'));
    } else {
      bekle('kontakt/tema: başlık', await var_(P, 'Sokak temasının birincisi'));
      const not = (await P.locator('.set-kontakt .kalem-not').first().innerText()).replace(/\s+/g, ' ');
      bekle('kontakt/tema: kalem notu isim ve puan, ünlemsiz', /^Muhammed Mustafa Karaosmanoğlu \d+,\d$/.test(not) && !(await metin(P)).includes('!'), not);
      const pay = await P.locator('.set-kontakt .serit > div').first().evaluate(e => getComputedStyle(e).paddingTop + ' ' + getComputedStyle(e).paddingBottom);
      bekle('kontakt: film karesine uygulamanın genel .kare payı (çentik payı) karışmıyor', pay === '0px 0px', pay);
      bekle('kontakt/tema: kazanan karede daire ve "1"', (await P.locator('.set-kontakt .kalem-daire').count()) === 1 && (await P.locator('.set-kontakt .kalem-no').first().innerText()) === '1');
      const nolar = await P.locator('.set-kontakt .kare-no').allInnerTexts();
      bekle('kontakt/tema: film kenarında sıra numarası', nolar.length >= 1 && nolar.every(t => /^▸ \d{2}$/.test(t)) && nolar.includes('▸ 01'), JSON.stringify(nolar));
      const yuz = await P.evaluate(async () => (await document.fonts.load('27px Mansalva', 'şğİıÇÖÜ')).map(f => f.family));
      bekle('kontakt: Mansalva Türkçe harfleri kendisi çiziyor', yuz.some(f => /Mansalva/.test(f)), JSON.stringify(yuz));
    }
    if (SET === 'pano') {
      const yuz = await P.evaluate(async () => (await document.fonts.load('700 22px Overpass', 'ŞĞİıÇÖÜ')).map(f => f.family));
      bekle('pano: Overpass Türkçe harfleri kendisi çiziyor', yuz.some(f => /Overpass/.test(f)), JSON.stringify(yuz));
    }

    // Kürsü (tek temalı etkinlik)
    bekle(`${SET}/kürsü: kart var`, await kartaGit(P, 'kursu'));
    await olc(P, `${no + 2}-${SET}-kursu`);
    bekle(`${SET}/kürsü: başlık`, await var_(P, 'Kürsünün kalanı') || await var_(P, 'Az farkla'));
    if (SET === 'pano') bekle('pano/kürsü: durum 2. ve 3., fark eksi', /\|2\.\|−\d,\d\|/.test(await panoMetni(P)) && /\|3\.\|−\d,\d/.test(await panoMetni(P)), await panoMetni(P));
    else bekle('kontakt/kürsü: iki daire, "2" ve "3"', (await P.locator('.set-kontakt .kalem-daire').count()) === 2 && (await P.locator('.set-kontakt .kalem-no').allInnerTexts()).join() === '2,3');

    // Kişisel: birinci
    bekle(`${SET}/kişisel: kart var`, await kartaGit(P, 'kisisel'));
    await olc(P, `${no + 3}-${SET}-kisisel-birinci`);
    bekle(`${SET}/kişisel: "Senin karen birinci"`, await var_(P, 'Senin karen birinci'), await metin(P));
    if (SET === 'pano') bekle('pano/kişisel: senin satırın vurgulu', (await P.locator('.set-pano .vurgu-kayit .h').first().evaluate(e => getComputedStyle(e).boxShadow)) !== 'none');
    bekle(`${SET}/kişisel: eski setin pembe kişisel kart rengi sızmıyor`, (await P.locator('.wr .tel').evaluate(e => getComputedStyle(e).backgroundColor)) === (SET === 'pano' ? 'rgb(14, 16, 19)' : 'rgb(239, 234, 224)'), await P.locator('.wr .tel').evaluate(e => getComputedStyle(e).backgroundColor));
    bekle(`${SET}/kapanış: kart ve düğmeler`, await kartaGit(P, 'kapanis') && await var_(P, 'Sonuçlara geç') && await var_(P, 'Tekrar izle'));
    await olc(P, `${no + 4}-${SET}-kapanis`);
    if (SET === 'pano') bekle('pano/kapanış: üç satır', (await panoMetni(P)) === 'SIRADAKİ|ETKİNLİKTE|GÖRÜŞÜRÜZ', await panoMetni(P));
    else bekle('kontakt/kapanış: cümle', await var_(P, 'Sıradaki etkinlikte görüşürüz'));
    bekle(`${SET}: yasak kelime yok (kapanış)`, !YASAK.test(await metin(P)));

    // Eşit birincilik (E2 Portre)
    await ac(P, `wrapped/${E2}`);
    bekle(`${SET}/eşit: Portre kartı`, await kartaGit(P, 'tema', () => var_(P, 'Portre')));
    await olc(P, `${no + 5}-${SET}-esit`);
    bekle(`${SET}/eşit: başlık "iki birinci"`, await var_(P, 'Portre temasında iki birinci'), await metin(P));
    if (SET === 'pano') bekle('pano/eşit: iki satır EŞİT', ((await panoMetni(P)).match(/\|EŞİT/g) ?? []).length === 2, await panoMetni(P));
    else bekle('kontakt/eşit: iki daire, iki not, "Eşit puan aldılar"', (await P.locator('.set-kontakt .kalem-daire').count()) === 2 && (await P.locator('.set-kontakt .kalem-not').count()) === 2 && await var_(P, 'Eşit puan aldılar'));
    bekle(`${SET}/temalar: iki temalı etkinlikte kart var`, await kartaGit(P, 'temalar'));
    if (SET === 'pano') bekle('pano/temalar: uzun tema adı iki satırda', (await panoMetni(P)).startsWith('IŞIK VE|GÖLGE OYUNU|'), await panoMetni(P));
    await olc(P, `${no + 6}-${SET}-temalar`);

    // Sıraya girmeyen (sondan ikinci fotoğrafçı; sonuncunun karesi çıkarıldı): sırası yazmıyor, puanı yalnız ona
    const S = await kisi(foto[foto.length - 2].eposta);
    await ac(S, `wrapped/${E1}`);
    bekle(`${SET}/girmedi: kişisel kart`, await kartaGit(S, 'kisisel'));
    await olc(S, `${no + 7}-${SET}-kisisel-girmedi`);
    bekle(`${SET}/girmedi: gizlilik cümlesi`, await var_(S, 'Puanını yalnız sen görüyorsun'), await metin(S));
    if (SET === 'pano') bekle('pano/girmedi: boş satır ekran okuyucuya isimsiz resim olarak gitmiyor', (await S.locator('.set-pano .pano-satir[role=img][aria-label=""]').count()) === 0);
    if (SET === 'pano') bekle('pano/girmedi: durum boş', /\|$/.test(await panoMetni(S)) || (await panoMetni(S)).split('|').pop() === '', await panoMetni(S));
    else bekle('kontakt/girmedi: daire yok, numara yok', (await S.locator('.set-kontakt .kalem-daire').count()) === 0 && (await S.locator('.set-kontakt .kare-no').count()) === 0);

    // Dar telefon (360 px): 12 harflik satır kenar boşluğunu aşmıyor
    if (SET === 'pano') {
      const D = await kisi(foto[0].eposta); await D.setViewportSize({ width: 360, height: 760 });
      await ac(D, `wrapped/${E1}`); await sag(D); await D.waitForTimeout(2500);
      const t = await D.evaluate(() => { const tel = document.querySelector('.wr .tel').getBoundingClientRect(); const s = [...document.querySelectorAll('.set-pano .pano-satir .h')].map(h => h.getBoundingClientRect().right); return { sag: Math.max(...s), sinir: tel.right - 20 }; });
      bekle('pano/360 px: en uzun satır kenar boşluğunda kalıyor', t.sag <= t.sinir, JSON.stringify(t));
      await D.screenshot({ path: `${SS}/118-pano-360.png` });
      await D.context().close();
    }
    // Kişisel kartın öteki durumları, setin kendi sesiyle (Buse onayladı, 2026-10-05)
    const kisiselMetin = async (eposta) => { const X = await kisi(eposta); await ac(X, `wrapped/${E1}`); await kartaGit(X, 'kisisel'); return X; };
    const O = await kisiselMetin(A.eposta);   // oy verdi, kare vermedi
    await olc(O, `${no + 8}-${SET}-kisisel-oyverdi`);
    if (SET === 'kontakt') bekle('kontakt/oy verdin: puan verdiği karelerden şerit, numarasız ve çizgisiz', (await O.locator('.set-kontakt img').count()) === 3 && (await O.locator('.set-kontakt .kare-no').count()) === 0 && (await O.locator('.set-kontakt .kalem-daire').count()) === 0, String(await O.locator('.set-kontakt img').count()));
    if (SET === 'kontakt') bekle('kontakt/oy verdin: başlık, kalem notu, alt', await var_(O, 'Bu sefer oylayan sendin') && /\d+ kareye puan verdin|Bütün kareleri puanladın/.test(await O.locator('.set-kontakt .kalem-not').first().innerText()) && await var_(O, 'Sıradaki etkinlikte senin karen de şeritte olsun'), await metin(O));
    else bekle('pano/oy verdin: başlık, pano, alt', await var_(O, 'Oy verdin') && /^\d+\|\d+$/.test(await panoMetni(O)) && await var_(O, 'Sıradaki etkinlikte panoda senin satırın da olsun'), `${await metin(O)} | ${await panoMetni(O)}`);
    const Yp = await kisiselMetin(Y.eposta);   // hiç katılmadı
    await olc(Yp, `${no + 9}-${SET}-kisisel-yoktun`);
    bekle(`${SET}/sensiz: "Bu sefer yoktun" ve davet`, await var_(Yp, 'Bu sefer yoktun') && await var_(Yp, 'Bir sonraki buluşmada seni de aramızda görmek isteriz'), await metin(Yp));
    if (SET === 'kontakt') bekle('kontakt/sensiz: kalem notunda kare ve tema sayısı', /^\d+ kare, \d+ tema$/.test((await Yp.locator('.set-kontakt .kalem-not').first().innerText()).trim()), await Yp.locator('.set-kontakt .kalem-not').first().innerText());
    else bekle('pano/sensiz: kare ve tema', /^\d+\|\d+$/.test(await panoMetni(Yp)), await panoMetni(Yp));
    const C = await kisiselMetin(foto[foto.length - 1].eposta);   // karesi çıkarıldı
    await olc(C, `${no + 10}-${SET}-kisisel-cikarildi`);
    bekle(`${SET}/çıkarıldı: "Karen sayılmadı", neden ve yönetici`, await var_(C, 'Karen sayılmadı') && await var_(C, 'Buluşmaya katılmadın') && await var_(C, 'Yöneticiyle konuşabilirsin'), await metin(C));
    if (SET === 'kontakt') bekle('kontakt/çıkarıldı: daire yok, kare soluk', (await C.locator('.set-kontakt .kalem-daire').count()) === 0 && (await C.locator('.set-kontakt .gri').count()) === 1);
    else bekle('pano/çıkarıldı: durum ÇIKARILDI', (await panoMetni(C)).endsWith('|ÇIKARILDI'), await panoMetni(C));
    await O.context().close(); await Yp.context().close(); await C.context().close();

    // Hareketi azalt: animasyon yok, son hâl görünüyor
    const R = await kisi(foto[0].eposta, 'reduce');
    await ac(R, `wrapped/${E1}`); await sag(R); await R.waitForTimeout(300);
    const oynayan = await R.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
    bekle(`${SET}/hareketi azalt: oynayan animasyon yok`, oynayan === 0, String(oynayan));
    if (SET === 'pano') bekle('pano/hareketi azalt: son harfler görünüyor', (await R.locator('.set-pano .h b').first().evaluate(b => getComputedStyle(b).transform)) === 'none' && (await panoMetni(R)).startsWith('SOKAK|'));
    else bekle('kontakt/hareketi azalt: daire çizili', (await R.locator('.set-kontakt .kalem-daire path').first().evaluate(e => getComputedStyle(e).strokeDashoffset)) === '0px');

    // İmzası alınamayan kare: boş çerçeve, kart çökmüyor
    await P.route('**/storage/v1/object/sign/**', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deneme"}' }));
    await ac(P, `wrapped/${E1}`); await sag(P);
    bekle(`${SET}: adresi alınamayan kare boş çerçeve, kart açık`, (await kartAdi(P)) === 'tema' && (await P.locator('.wr .bos-foto').count()) >= 1, String(await P.locator('.wr .bos-foto').count()));
    await P.unroute('**/storage/v1/object/sign/**');
    await P.context().close(); await S.context().close(); await R.context().close();
  }
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
