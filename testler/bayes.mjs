// Sıralama puanı (karar 125, 0023, Buse 2026-10-03): sunucu kuralları.
//   yer puanı = 100 · (n − yer) / (n − 1)   karenin temasındaki yerinden; n temadaki puanlı kare, tek kareyse 50
//   puan      = (3 · 50 + Σ(w · yer puanı)) / (3 + Σw), tam sayı (Bayes, karar 124; çekim artık sabit 50'ye)
// Temiz veritabanı ister: her bölüm baştan kuruyor.
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';

const gun = n => new Date(Date.now() - n * 86400000).toISOString();
const tarih = n => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const sayi = x => (x == null ? null : Number(x));
const satir = (l, ad) => l.find(x => x.ad === ad);

let A, K, oyVerenler;
async function kur(adlar) {
  await sifirla();
  A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
  await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
  K = {};
  for (const [a, ad] of adlar) {
    const posta = `${a}@test.local`;
    const k = await kullanici(posta, ad);
    await admin.from('uyeler').insert({ id: k.id, ad, eposta: posta });
    K[a] = { ...k, ad };
  }
  // Oy verenler kare vermiyor, listede görünmüyor
  oyVerenler = [];
  for (const [a, ad] of [['oy1', 'Oy Bir'], ['oy2', 'Oy İki']]) {
    const k = await kullanici(`${a}@test.local`, ad);
    await admin.from('uyeler').insert({ id: k.id, ad, eposta: `${a}@test.local` });
    oyVerenler.push(k);
  }
}
async function etkinlik(gunSayisi, temalar, serbest = false) {
  const e = (await admin.from('etkinlikler').insert({
    bulusma_gunu: tarih(gunSayisi), yukleme_baslar: gun(gunSayisi), yukleme_biter: gun(gunSayisi - 1),
    oylama_biter: gun(gunSayisi - 2), kuran: A.id, serbest,
  }).select('id').single()).data;
  const t = [];
  for (const [i, [ad, bulusmada]] of temalar.entries())
    t.push((await admin.from('temalar').insert({ etkinlik: e.id, ad, sira: i + 1, bulusmada }).select('id').single()).data);
  return { id: e.id, temalar: t };
}
// puanlar: her oy veren için bir puan; boş dizi puansız kare
async function kare(etk, i, sahip, puanlar) {
  const tema = etk.temalar[i].id;
  const yol = `${etk.id}/${tema}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const k = (await admin.from('kareler').insert({ tema, sahip: sahip.id, dosya: yol, genislik: 1200, yukseklik: 800 }).select('id').single()).data;
  for (const [j, puan] of [].concat(puanlar).entries())
    await admin.from('oylar').insert({ kare: k.id, veren: oyVerenler[j].id, puan });
  return k;
}
const sira = async (U, fn = 'siralama') => {
  const r = await U.c.rpc(fn);
  if (r.error) throw r.error;
  return r.data ?? [];
};
// Herkes kendi puanını görüyor (karar 52): sırası gizli olanlarınki de buradan okunuyor
const kendi = async (U, fn = 'siralama') => sayi((await sira(U, fn)).find(x => x.benim)?.ortalama);

// ---------------------------------------------- 1. tek yüksek kare, çok kareli istikrarı geçemiyor
// İki tamamlanmış buluşma → eşik 1. Buluşma temaları (w = 1).
// Xe: tek kare, Sokak'ta birinci (100). Ya: beş kare, Sokak'ta ikinci (50), dördünde birinci (100).
// Zo: beş kare, hepsinde sonuncu (0).
//   Xe: (150 + 100) / 4 = 62,5 → 63     Ya: (150 + 450) / 8 = 75     Zo: 150 / 8 = 18,75 → 19
// Çekim olmasaydı Xe (100) Ya'nın (90) önündeydi.
{
  await kur([['xe', 'Xe Ak'], ['ya', 'Ya Bal'], ['zo', 'Zo Can']]);
  const E1 = await etkinlik(10, [['Sokak', true], ['Portre', true], ['Gece', true]]);
  const E2 = await etkinlik(5, [['Su', true], ['Işık', true]]);
  await kare(E1, 0, K.xe, [10, 10]);
  const yer = [[E1, 0], [E1, 1], [E1, 2], [E2, 0], [E2, 1]];
  for (const [[e, i], p] of yer.map((y, j) => [y, [9, 8, 8, 8, 8][j]])) await kare(e, i, K.ya, [p]);
  for (const [[e, i], p] of yer.map((y, j) => [y, [4, 4, 4, 5, 5][j]])) await kare(e, i, K.zo, [p]);

  const l = await sira(A);
  const sirali = l.filter(x => x.sirali);
  // Üç kişi → round(3 / 2,5) = 1 sıralı
  bekle('1: beş kareli (90) tek kareliyi (100) geçiyor', sirali.length === 1 && sirali[0].ad === 'Ya Bal' && sayi(sirali[0].sira) === 1,
    JSON.stringify(l.map(x => [x.ad, x.sira, x.ortalama])));
  bekle('1: sıralının puanı düzeltilmiş, tam sayı (75)', sayi(sirali[0]?.ortalama) === 75, JSON.stringify(sirali[0]));
  bekle('1: tek kareli 50\'ye çekiliyor (100 → 63)', (await kendi(K.xe)) === 63, String(await kendi(K.xe)));
  bekle('1: tek kareli eşikte ama sıralı değil', satir(await sira(K.xe), 'Xe Ak')?.esikte === true && satir(await sira(K.xe), 'Xe Ak')?.sirali === false);
  bekle('1: hep sonuncu olan 50\'ye doğru yukarı çekiliyor (0 → 19)', (await kendi(K.zo)) === 19, String(await kendi(K.zo)));
  // Karar 124: profildeki "Sezon puanın" sıralamadaki sayının aynısı; başkasının profilinde yok
  const pX = ((await K.xe.c.rpc('profil')).data ?? [])[0];
  bekle('1: profilde kendi puanın sıralamadakiyle aynı (63)', sayi(pX?.ortalama) === 63, JSON.stringify(pX));
  const pY = ((await K.xe.c.rpc('profil', { p_uye: K.ya.id })).data ?? [])[0];
  bekle('1: başkasının profilinde ortalama yok', pY && pY.ortalama == null, JSON.stringify(pY));
  bekle('1: kare sayısı değişmedi', sayi(satir(l, 'Ya Bal')?.kare_sayisi) === 5 && sayi(satir(l, 'Xe Ak')?.kare_sayisi) === 1);
}

// ---------------------------------------------- 2. kare sayıları eşitse sıra eskisiyle aynı
// Beş kişi, ikişer buluşma karesi → round(5 / 2,5) = 2 sıralı. Ham ortalamalar 9 > 7,5 > 7 > 6 > 4.
// Sokak 9, 8, 7, 6, 4 → 100, 75, 50, 25, 0. Portre 9, 7, 7, 6, 4 → 100, 75, 75, 25, 0 (eşitler aynı yeri alıyor).
{
  await kur([['a1', 'Bir Ak'], ['a2', 'İki Ak'], ['a3', 'Üç Ak'], ['a4', 'Dört Ak'], ['a5', 'Beş Ak']]);
  const E1 = await etkinlik(10, [['Sokak', true], ['Portre', true]]);
  const ham = { a1: [9, 9], a2: [8, 7], a3: [7, 7], a4: [6, 6], a5: [4, 4] };
  for (const [a, [p, q]] of Object.entries(ham)) { await kare(E1, 0, K[a], [p]); await kare(E1, 1, K[a], [q]); }
  const puan = {};
  for (const a of Object.keys(ham)) puan[a] = await kendi(K[a]);
  const eski = Object.keys(ham).sort((x, y) => (ham[y][0] + ham[y][1]) - (ham[x][0] + ham[x][1]));
  const yeni = Object.keys(ham).sort((x, y) => puan[y] - puan[x]);
  bekle('2: eşit kare sayısında sıra değişmiyor', JSON.stringify(eski) === JSON.stringify(yeni), JSON.stringify({ eski, yeni, puan }));
  const l = await sira(A);
  bekle('2: sıralı ilk iki eskisiyle aynı', l.filter(x => x.sirali).map(x => x.ad).join() === 'Bir Ak,İki Ak',
    JSON.stringify(l.map(x => [x.ad, x.sira])));
  // Bir: (150 + 200) / 5 = 70 · İki: 300 / 5 = 60 · Üç: 275 / 5 = 55 · Dört: 200 / 5 = 40 · Beş: 150 / 5 = 30
  bekle('2: puanlar 0-100 arasında ayrışıyor', JSON.stringify(Object.values(puan)) === JSON.stringify([70, 60, 55, 40, 30]), JSON.stringify(puan));
  bekle('2: temada eşit olan iki kare aynı yer puanını alıyor (İki ve Üç Portre\'de 75)', puan.a2 - puan.a3 === 5, JSON.stringify(puan));
}

// ---------------------------------------------- 3. serbest temanın 0,5 ağırlığı hem Σw'de hem C'de
// Pe: Sokak'ta birinci (100, w 1) + serbest temada tek kare (50, w 0,5). Qu: Sokak'ta ikinci (0).
//   Pe: (150 + 100 + 25) / 4,5 = 61,1 → 61   (ağırlık 1 olsaydı 60; Σw kare sayısı olsaydı 55)
//   Qu: 150 / 4 = 37,5 → 38
{
  await kur([['pe', 'Pe Ak'], ['qu', 'Qu Ak']]);
  const E1 = await etkinlik(10, [['Sokak', true], ['Serbest', false]]);
  await kare(E1, 0, K.pe, [8]); await kare(E1, 1, K.pe, [4]);
  await kare(E1, 0, K.qu, [6]);
  bekle('3: serbest kare yarım ağırlıkla giriyor, temada tekse 50 (61)', (await kendi(K.pe)) === 61, String(await kendi(K.pe)));
  bekle('3: yalnız buluşma karesi olan (38)', (await kendi(K.qu)) === 38, String(await kendi(K.qu)));
  // Puansız kare hesaba girmiyor: Qu'ya oysuz bir serbest kare eklenince puanı aynı
  await kare(E1, 1, K.qu, []);
  bekle('3: puansız kare ne Σw\'ye ne temadaki kare sayısına giriyor', (await kendi(K.qu)) === 38 && (await kendi(K.pe)) === 61,
    JSON.stringify([await kendi(K.qu), await kendi(K.pe)]));
  bekle('3: puansız kare kare sayısında', sayi(satir(await sira(K.qu), 'Qu Ak')?.kare_sayisi) === 2);
}

// ---------------------------------------------- 4. eşik ve görünürlük aynı (karar 52, 53)
// Dört tamamlanmış buluşma → eşik 2. Tek etkinliğe gelen yüksek puanlı Ri eşik altı.
{
  await kur([['ri', 'Ri Ak'], ['so', 'So Ak'], ['ta', 'Ta Ak'], ['um', 'Um Ak'], ['vo', 'Vo Ak']]);
  const E = [];
  for (const g of [20, 15, 10, 5]) E.push(await etkinlik(g, [['Tema', true]]));
  await kare(E[3], 0, K.ri, [10, 10]);
  for (const [a, p] of [['so', 8], ['ta', 7], ['um', 6], ['vo', 5]])
    for (const e of E.slice(0, 2)) await kare(e, 0, K[a], [p]);
  const l = await sira(A);
  const ri = satir(l, 'Ri Ak');
  bekle('4: eşik altı sırasız ve eşikte değil', ri && ri.esikte === false && ri.sirali === false && ri.sira == null, JSON.stringify(ri));
  bekle('4: eşik altının puanı başkasına gizli', ri?.ortalama == null, JSON.stringify(ri));
  bekle('4: eşik altı kendi puanını görüyor', (await kendi(K.ri)) != null, String(await kendi(K.ri)));
  bekle('4: eşik altının profilinde de aynı sayı', sayi(((await K.ri.c.rpc('profil')).data ?? [])[0]?.ortalama) === (await kendi(K.ri)),
    JSON.stringify((await K.ri.c.rpc('profil')).data));
  // Beş kişi → 2 sıralı
  bekle('4: görünürlük round(kişi / 2,5)', l.filter(x => x.sirali).map(x => [x.ad, sayi(x.sira)]).join('|') === 'So Ak,1|Ta Ak,2',
    JSON.stringify(l.map(x => [x.ad, x.sira, x.ortalama])));
  bekle('4: sıralı olmayanların puanı gizli', l.filter(x => !x.sirali).every(x => x.ortalama == null && x.sira == null));
  bekle('4: sırasızlar alfabetik', l.filter(x => !x.sirali).map(x => x.ad).join() === 'Ri Ak,Um Ak,Vo Ak');
}

// ---------------------------------------------- 5. Serbest tablosu: tek kare kulüp ortalamasına çekiliyor, eşik yok
// Yalnız serbest etkinlik, üç serbest tema, hepsi aynı ağırlık.
// Doku: Ra 10, Sa 9, Te 3, Ul 2 → 100, 67, 33, 0. Çizgi: Sa 9, Te 3, Va 2 → 100, 50, 0. Renk: Sa 9, Ul 2 → 100, 0.
//   Sa: (150 + 266,7) / 6 = 69,4 → 69    Ra: (150 + 100) / 4 = 62,5 → 63
{
  await kur([['ra', 'Ra Ak'], ['sa', 'Sa Ak'], ['te', 'Te Ak'], ['ul', 'Ul Ak'], ['va', 'Va Ak']]);
  const S = await etkinlik(5, [['Doku', false], ['Çizgi', false], ['Renk', false]], true);
  await kare(S, 0, K.ra, [10]);
  for (const i of [0, 1, 2]) await kare(S, i, K.sa, [9]);
  await kare(S, 0, K.te, [3]); await kare(S, 1, K.te, [3]);
  await kare(S, 0, K.ul, [2]); await kare(S, 2, K.ul, [2]); await kare(S, 1, K.va, [2]);
  const l = await sira(A, 'serbest_siralama');
  bekle('5: üç kareli tek karelinin (10) önünde', l.filter(x => x.sirali).map(x => x.ad).join() === 'Sa Ak,Ra Ak',
    JSON.stringify(l.map(x => [x.ad, x.sira, x.ortalama])));
  bekle('5: puanlar düzeltilmiş (69 ve 63)', sayi(satir(l, 'Sa Ak')?.ortalama) === 69 && sayi(satir(l, 'Ra Ak')?.ortalama) === 63,
    JSON.stringify(l.map(x => [x.ad, x.ortalama])));
  bekle('5: eşik yok: tek kareli sıralanabiliyor', satir(l, 'Ra Ak')?.sirali === true && sayi(satir(l, 'Ra Ak')?.sira) === 2);
  // Va: Çizgi'de sonuncu → 150 / 4 = 37,5 → 38
  bekle('5: sonuncu tek kare yukarı çekiliyor (0 → 38)', (await kendi(K.va, 'serbest_siralama')) === 38, String(await kendi(K.va, 'serbest_siralama')));
  bekle('5: Serbest tablosunda sırasızın puanı başkasına gizli', l.filter(x => !x.sirali).every(x => x.ortalama == null));
  // Ana tablo: buluşma yok → eşik 0, serbest temalar yarım ağırlık, aynı sıra
  const ana = await sira(A);
  bekle('5: ana tablo da aynı kişileri sıralıyor', ana.filter(x => x.sirali).map(x => x.ad).join() === 'Sa Ak,Ra Ak',
    JSON.stringify(ana.map(x => [x.ad, x.sira, x.ortalama])));
}

// ---------------------------------------------- 6. puanlı kare yokken hata yok
{
  await kur([['ba', 'Ba Ak'], ['ca', 'Ca Ak']]);
  let r = await A.c.rpc('siralama'); let s = await A.c.rpc('serbest_siralama');
  bekle('6: hiç kare yokken hata yok, boş sonuç', !r.error && !s.error && (r.data ?? []).length === 0 && (s.data ?? []).length === 0,
    JSON.stringify([r.error, s.error, r.data, s.data]));
  const E1 = await etkinlik(10, [['Sokak', true], ['Serbest', false]]);
  await kare(E1, 0, K.ba, []); await kare(E1, 1, K.ca, []);
  r = await A.c.rpc('siralama'); s = await A.c.rpc('serbest_siralama');
  bekle('6: oysuz kareler varken hata yok', !r.error && !s.error, JSON.stringify([r.error, s.error]));
  bekle('6: oysuz sezonda kimse sıralı değil, puan boş', (r.data ?? []).length === 2 && r.data.every(x => !x.sirali && x.sira == null && x.ortalama == null),
    JSON.stringify(r.data));
  bekle('6: oysuz serbest kare puansız', (s.data ?? []).length === 1 && s.data[0].ortalama == null && !s.data[0].sirali, JSON.stringify(s.data));
  const ben = (await K.ba.c.rpc('siralama')).data?.find(x => x.benim);
  bekle('6: puanlı karesi olmayana kulüp ortalaması verilmiyor', ben && ben.ortalama == null, JSON.stringify(ben));
  const pB = ((await K.ba.c.rpc('profil')).data ?? [])[0];
  bekle('6: puanlı karesi olmayanın profilinde ortalama yok, profil açılıyor', pB?.ad === 'Ba Ak' && pB.ortalama == null, JSON.stringify(pB));
}

// ---------------------------------------------- 7. satırdaki en iyi kare yer puanından (kod incelemesi F5)
// Ge: Sokak'ta 6,5 ile birinci (100), Portre'de 7,0 ile sonuncu (0). Görsel Sokak karesi olmalı, ham ortalaması düşük olsa da.
{
  await kur([['ge', 'Ge Ak'], ['ha', 'Ha Ak'], ['ip', 'İp Ak']]);
  const E1 = await etkinlik(10, [['Sokak', true], ['Portre', true]]);
  const sokak = await kare(E1, 0, K.ge, [6, 7]); await kare(E1, 0, K.ha, [5, 5]);
  await kare(E1, 1, K.ge, [7, 7]); await kare(E1, 1, K.ha, [9, 9]); await kare(E1, 1, K.ip, [8, 8]);
  const dosya = (await admin.from('kareler').select('dosya').eq('id', sokak.id).single()).data.dosya;
  bekle('7: satırdaki kare temada en iyi yeri alan (ham ortalaması düşük olsa da)', satir(await sira(K.ge), 'Ge Ak')?.dosya === dosya, JSON.stringify(satir(await sira(K.ge), 'Ge Ak')));
}

rapor();
