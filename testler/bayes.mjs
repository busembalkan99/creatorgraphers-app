// Sıralamada düzeltilmiş (Bayes) ortalama (0021, Buse 2026-10-02): sunucu kuralları.
//   puan = (3 · C + Σ(w · ort)) / (3 + Σw), C = o tablodaki bütün puanlı karelerin ağırlıklı ortalaması
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
// Xe: tek kare 8,5. Ya: beş kare, ortalama 8,2. Zo: beş kare, ortalama 4,4.
// C = (8,5 + 41 + 22) / 11 = 6,5
//   Xe: (3 · 6,5 + 8,5) / 4 = 7,0     Ya: (19,5 + 41) / 8 = 7,5625 → 7,6
// Eski kuralda Xe (8,5) Ya'nın (8,2) önündeydi.
{
  await kur([['xe', 'Xe Ak'], ['ya', 'Ya Bal'], ['zo', 'Zo Can']]);
  const E1 = await etkinlik(10, [['Sokak', true], ['Portre', true], ['Gece', true]]);
  const E2 = await etkinlik(5, [['Su', true], ['Işık', true]]);
  await kare(E1, 0, K.xe, [8, 9]);
  const yer = [[E1, 0], [E1, 1], [E1, 2], [E2, 0], [E2, 1]];
  for (const [[e, i], p] of yer.map((y, j) => [y, [9, 8, 8, 8, 8][j]])) await kare(e, i, K.ya, [p]);
  for (const [[e, i], p] of yer.map((y, j) => [y, [4, 4, 4, 5, 5][j]])) await kare(e, i, K.zo, [p]);

  const l = await sira(A);
  const sirali = l.filter(x => x.sirali);
  // Üç kişi → round(3 / 2,5) = 1 sıralı
  bekle('1: beş kareli (8,2) tek kareliyi (8,5) geçiyor', sirali.length === 1 && sirali[0].ad === 'Ya Bal' && sayi(sirali[0].sira) === 1,
    JSON.stringify(l.map(x => [x.ad, x.sira, x.ortalama])));
  bekle('1: sıralının puanı düzeltilmiş (7,6)', sayi(sirali[0]?.ortalama) === 7.6, JSON.stringify(sirali[0]));
  bekle('1: tek kareli kulüp ortalamasına çekiliyor (8,5 → 7,0)', (await kendi(K.xe)) === 7, String(await kendi(K.xe)));
  bekle('1: tek kareli eşikte ama sıralı değil', satir(await sira(K.xe), 'Xe Ak')?.esikte === true && satir(await sira(K.xe), 'Xe Ak')?.sirali === false);
  // Zo: (19,5 + 22) / 8 = 5,1875 → 5,2
  bekle('1: düşük ortalama kulübe doğru yukarı çekiliyor (4,4 → 5,2)', (await kendi(K.zo)) === 5.2, String(await kendi(K.zo)));
  // Karar 124: profildeki "Ortalaman" sıralamadaki sayının aynısı; başkasının profilinde yok
  const pX = ((await K.xe.c.rpc('profil')).data ?? [])[0];
  bekle('1: profilde kendi ortalaman sıralamadakiyle aynı (7,0)', sayi(pX?.ortalama) === 7, JSON.stringify(pX));
  const pY = ((await K.xe.c.rpc('profil', { p_uye: K.ya.id })).data ?? [])[0];
  bekle('1: başkasının profilinde ortalama yok', pY && pY.ortalama == null, JSON.stringify(pY));
  bekle('1: kare sayısı değişmedi', sayi(satir(l, 'Ya Bal')?.kare_sayisi) === 5 && sayi(satir(l, 'Xe Ak')?.kare_sayisi) === 1);
}

// ---------------------------------------------- 2. kare sayıları eşitse sıra eskisiyle aynı
// Beş kişi, ikişer buluşma karesi → round(5 / 2,5) = 2 sıralı. Ham ortalamalar 9 > 7,5 > 7 > 6 > 4.
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
  // C = 6,7; Bir: (20,1 + 18) / 5 = 7,62 → 7,6; Beş: (20,1 + 8) / 5 = 5,62 → 5,6
  bekle('2: puanlar kulüp ortalamasına doğru sıkışıyor', puan.a1 === 7.6 && puan.a5 === 5.6, JSON.stringify(puan));
}

// ---------------------------------------------- 3. serbest temanın 0,5 ağırlığı hem Σw'de hem C'de
// Pe: buluşma 8 (w 1) + serbest tema 4 (w 0,5). Qu: buluşma 6.
// C = (8 + 2 + 6) / 2,5 = 6,4
//   Pe: (19,2 + 10) / 4,5 = 6,49 → 6,5   (C ağırlıksız olsaydı 6,2; Σw kare sayısı olsaydı 5,8)
//   Qu: (19,2 + 6) / 4 = 6,3
{
  await kur([['pe', 'Pe Ak'], ['qu', 'Qu Ak']]);
  const E1 = await etkinlik(10, [['Sokak', true], ['Serbest', false]]);
  await kare(E1, 0, K.pe, [8]); await kare(E1, 1, K.pe, [4]);
  await kare(E1, 0, K.qu, [6]);
  bekle('3: serbest kare yarım ağırlıkla Σw\'ye ve C\'ye giriyor (6,5)', (await kendi(K.pe)) === 6.5, String(await kendi(K.pe)));
  bekle('3: yalnız buluşma karesi olan (6,3)', (await kendi(K.qu)) === 6.3, String(await kendi(K.qu)));
  // Puansız kare hesaba girmiyor: Qu'ya oysuz bir serbest kare eklenince puanı aynı
  await kare(E1, 1, K.qu, []);
  bekle('3: puansız kare ne Σw\'ye ne C\'ye giriyor', (await kendi(K.qu)) === 6.3 && (await kendi(K.pe)) === 6.5,
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
// Ra: 10. Sa: 9, 9, 9. Te: 3, 3. Ul: 2. Va: 2.  C = 47 / 8 = 5,875
//   Sa: (17,625 + 27) / 6 = 7,44 → 7,4    Ra: (17,625 + 10) / 4 = 6,91 → 6,9
{
  await kur([['ra', 'Ra Ak'], ['sa', 'Sa Ak'], ['te', 'Te Ak'], ['ul', 'Ul Ak'], ['va', 'Va Ak']]);
  const S = await etkinlik(5, [['Doku', false], ['Çizgi', false], ['Renk', false]], true);
  await kare(S, 0, K.ra, [10]);
  for (const i of [0, 1, 2]) await kare(S, i, K.sa, [9]);
  await kare(S, 0, K.te, [3]); await kare(S, 1, K.te, [3]);
  await kare(S, 0, K.ul, [2]); await kare(S, 1, K.va, [2]);
  const l = await sira(A, 'serbest_siralama');
  bekle('5: üç kareli tek karelinin (10) önünde', l.filter(x => x.sirali).map(x => x.ad).join() === 'Sa Ak,Ra Ak',
    JSON.stringify(l.map(x => [x.ad, x.sira, x.ortalama])));
  bekle('5: puanlar düzeltilmiş (7,4 ve 6,9)', sayi(satir(l, 'Sa Ak')?.ortalama) === 7.4 && sayi(satir(l, 'Ra Ak')?.ortalama) === 6.9,
    JSON.stringify(l.map(x => [x.ad, x.ortalama])));
  bekle('5: eşik yok: tek kareli sıralanabiliyor', satir(l, 'Ra Ak')?.sirali === true && sayi(satir(l, 'Ra Ak')?.sira) === 2);
  // Ul ve Va: (17,625 + 2) / 4 = 4,9; Te: (17,625 + 6) / 5 = 4,7 → düşükler de kulübe doğru yukarı
  bekle('5: düşük tek kare yukarı çekiliyor (2 → 4,9)', (await kendi(K.ul, 'serbest_siralama')) === 4.9, String(await kendi(K.ul, 'serbest_siralama')));
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

rapor();
