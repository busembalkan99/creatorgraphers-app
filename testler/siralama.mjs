// Sıralama ve Profil sunucu kuralları (kararlar 52, 53, 54, 55, 56, 57, 58, 98).
// Temiz veritabanı ister: sezon sayıları bütün etkinliklere bakıyor.
import fs from 'node:fs';
import { admin, istemci, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
const anon = istemci();
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });

// Üyeler. Ayşe kurucu, diğerleri doğrudan yazılıyor: bu dosya giriş akışını sınamıyor.
const kisiler = {};
for (const [anahtar, ad, posta] of [
  ['baris', 'Barış Ak', 'baris@test.local'],
  ['can', 'Can Öz', 'can@test.local'],
  ['deniz', 'Deniz Yılmaz', 'deniz@test.local'],
  ['ece', 'Ece Tan', 'ece@test.local'],
  ['zeynep', 'Zeynep Ar', 'zeynep@test.local'],
]) {
  const k = await kullanici(posta, ad);
  await admin.from('uyeler').insert({ id: k.id, ad, eposta: posta });
  kisiler[anahtar] = { ...k, ad };
}
kisiler.ayse = { ...A, ad: 'Ayşe Kaya' };

const gun = n => new Date(Date.now() - n * 86400000).toISOString();
const tarih = n => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

async function etkinlik(gunSayisi, temalar) {
  const e = (await admin.from('etkinlikler').insert({
    bulusma_gunu: tarih(gunSayisi),
    yukleme_baslar: gun(gunSayisi), yukleme_biter: gun(gunSayisi - 1), oylama_biter: gun(gunSayisi - 2),
    kuran: A.id,
  }).select('id').single()).data;
  const t = [];
  for (let i = 0; i < temalar.length; i++)
    t.push((await admin.from('temalar').insert({ etkinlik: e.id, ad: temalar[i], sira: i + 1, bulusmada: false })
      .select('id').single()).data);
  return { id: e.id, temalar: t };
}

// Depo yolu gerçek etkinlik kimliğiyle başlamalı: okuma kuralı (0002) ilk klasörden
// etkinliğin aşamasına bakıyor. Rastgele bir kimlikle imzalı adres alınamıyor.
async function kare(etk, temaIndeks, sahip, puan, exif = {}) {
  const tema = etk.temalar[temaIndeks].id;
  const yol = `${etk.id}/${tema}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const k = (await admin.from('kareler').insert({
    tema, sahip: sahip.id, dosya: yol, genislik: 1200, yukseklik: 800, ...exif,
  }).select('id').single()).data;
  if (puan != null) await admin.from('oylar').insert({ kare: k.id, veren: kisiler.zeynep.id, puan });
  return k;
}

// Üç tamamlanmış etkinlik. E1 iki temalı, diğerleri tek temalı.
const E1 = await etkinlik(30, ['Sokak', 'Portre']);
const E2 = await etkinlik(20, ['Gece']);
const E3 = await etkinlik(10, ['Su']);

// Ayşe: üç etkinlik, E1'de iki temaya da kare → tam set, seri 3
await kare(E1, 0, kisiler.ayse, 9, { odak: '35mm', diyafram: 'f/1.8', iso: '100' });
await kare(E1, 1, kisiler.ayse, 9, { odak: '35mm', diyafram: 'f/2', iso: '200' });
await kare(E2, 0, kisiler.ayse, 9, { odak: '35mm', diyafram: 'f/2.8', iso: '400' });
await kare(E3, 0, kisiler.ayse, 9, { odak: '50mm', diyafram: 'f/4', iso: '800' });
// Barış: üç etkinlik ama E1'de tek tema → tam set yok, seri 3
await kare(E1, 0, kisiler.baris, 8);
await kare(E2, 0, kisiler.baris, 8);
await kare(E3, 0, kisiler.baris, 8);
// Can: iki etkinlik → eşiği geçiyor ama sıralamaya girmiyor
await kare(E2, 0, kisiler.can, 7);
await kare(E3, 0, kisiler.can, 7);
// Deniz: yalnız son etkinlik → seri 1, eşik altı
await kare(E3, 0, kisiler.deniz, 6);
// Ece: yalnız ilk etkinlik → seri 0, eşik altı
await kare(E1, 1, kisiler.ece, 5);

// ---------------------------------------------------------------- sezon künyesi
{
  const o = (await A.c.rpc('sezon_ozeti')).data?.[0];
  bekle('sezon 1, üç etkinlik tamamlandı',
    Number(o?.sezon) === 1 && Number(o?.tamamlanan) === 3 && Number(o?.toplam) === 6, JSON.stringify(o));
  bekle('önceki sezon yok', o?.onceki === false, JSON.stringify(o));
  bekle('üye sayısı altı', Number(o?.uye_sayisi) === 6, String(o?.uye_sayisi));
  bekle('anonim sezon künyesini alamaz',
    ((await anon.rpc('sezon_ozeti')).data ?? []).length === 0 || !!(await anon.rpc('sezon_ozeti')).error);
}

// ---------------------------------------------------------------- sezon sıralaması
{
  const s = (await A.c.rpc('siralama')).data ?? [];
  bekle('kare veren beş kişi listede', s.length === 5, JSON.stringify(s.map(x => x.ad)));
  bekle('kare vermeyen listede yok', !s.some(x => x.ad === 'Zeynep Ar'));
  // 5 kişi → round(5/2,5)=2 sıralı (karar 52)
  const sirali = s.filter(x => x.sirali);
  bekle('beş kişide iki sıralı', sirali.length === 2, JSON.stringify(s.map(x => [x.ad, x.sira])));
  bekle('sıra 1 ve 2', Number(sirali[0].sira) === 1 && Number(sirali[1].sira) === 2,
    JSON.stringify(sirali.map(x => [x.ad, x.sira])));
  bekle('sıralı en yüksek ortalamalı', sirali[0].ad === 'Ayşe Kaya' && sirali[1].ad === 'Barış Ak',
    JSON.stringify(sirali.map(x => x.ad)));
  bekle('sıralının ortalaması açık', Number(sirali[0].ortalama) === 9 && Number(sirali[1].ortalama) === 8,
    JSON.stringify(sirali.map(x => x.ortalama)));
  const sirasiz = s.filter(x => !x.sirali);
  bekle('sırasızın ortalaması gizli', sirasiz.every(x => x.ortalama === null), JSON.stringify(sirasiz));
  bekle('sırasızın sırası da gizli', sirasiz.every(x => x.sira === null), JSON.stringify(sirasiz));
  bekle('sırasız blok alfabetik', JSON.stringify(sirasiz.map(x => x.ad)) === JSON.stringify(['Can Öz', 'Deniz Yılmaz', 'Ece Tan']),
    JSON.stringify(sirasiz.map(x => x.ad)));
  // Karar 53: üç tamamlanan etkinlikte eşik 2
  bekle('eşiği geçen ama sıralamaya girmeyen var', s.find(x => x.ad === 'Can Öz')?.esikte === true);
  bekle('tek etkinliğe katılan eşiği geçmiyor',
    s.find(x => x.ad === 'Deniz Yılmaz')?.esikte === false && s.find(x => x.ad === 'Ece Tan')?.esikte === false);
  bekle('her satırda en iyi karesi var', s.every(x => !!x.dosya), JSON.stringify(s.map(x => x.dosya)));
  {
    // Ekran bu adresi kullanıyor: depo kuralı ilk klasörden etkinliğin aşamasına bakıyor,
    // yani yalnız dosya adının dönmesi karenin görüneceği anlamına gelmiyor.
    const im = await A.c.storage.from('kareler').createSignedUrls(s.map(x => x.dosya), 60);
    bekle('sıralamadaki karelerin imzalı adresi alınıyor',
      !im.error && (im.data ?? []).every(x => !!x.signedUrl), JSON.stringify(im.data?.[0] ?? im.error));
  }
  bekle('kare ve etkinlik sayıları doğru',
    Number(s.find(x => x.ad === 'Ayşe Kaya').kare_sayisi) === 4 && Number(s.find(x => x.ad === 'Ayşe Kaya').etkinlik_sayisi) === 3,
    JSON.stringify(s.find(x => x.ad === 'Ayşe Kaya')));
}
{
  // Can sıralamaya girmiyor: kendi ortalamasını görüyor, sırasını görmüyor
  const s = (await kisiler.can.c.rpc('siralama')).data ?? [];
  const ben = s.find(x => x.benim);
  bekle('sırasız kendi ortalamasını görüyor', ben?.ad === 'Can Öz' && Number(ben?.ortalama) === 7, JSON.stringify(ben));
  bekle('sırasız kendi sırasını görmüyor', ben?.sira === null, JSON.stringify(ben));
  bekle('başkasının gizli ortalaması yine gizli',
    s.filter(x => !x.sirali && !x.benim).every(x => x.ortalama === null));
}
bekle('yabancı sıralamayı göremez', ((await istemci().rpc('siralama')).data ?? []).length === 0);

// ---------------------------------------------------------------- Müdavim
{
  const m = (await A.c.rpc('mudavim')).data ?? [];
  bekle('Müdavim çoğul: eşit olan herkes', m.length === 2, JSON.stringify(m.map(x => x.ad)));
  bekle('Müdavim üç etkinliğin üçüne de katılanlar',
    m.every(x => Number(x.katilim) === 3) && JSON.stringify(m.map(x => x.ad)) === JSON.stringify(['Ayşe Kaya', 'Barış Ak']),
    JSON.stringify(m));
  bekle('pencere tamamlanan etkinlik sayısı', Number(m[0].pencere) === 3, String(m[0]?.pencere));
  bekle('kendi işaretin Müdavim şeridinde de var', m.find(x => x.ad === 'Ayşe Kaya')?.benim === true);
}

// ---------------------------------------------------------------- Profil
{
  const p = (await A.c.rpc('profil')).data?.[0];
  bekle('kendi profilin', p?.ad === 'Ayşe Kaya' && p?.benim === true, JSON.stringify(p));
  bekle('sayaçlar: 3 etkinlik, 4 kare, seri 3',
    Number(p?.etkinlik_sayisi) === 3 && Number(p?.kare_sayisi) === 4 && Number(p?.seri) === 3, JSON.stringify(p));
  bekle('tam set: katıldığı her etkinlikte bütün temalar', p?.tam_set === true, JSON.stringify(p));
  bekle('tema sayısı dört', Number(p?.tema_sayisi) === 4, String(p?.tema_sayisi));
  bekle('kendi ortalamanı görürsün', Number(p?.ortalama) === 9, String(p?.ortalama));
}
{
  const p = (await A.c.rpc('profil', { p_uye: kisiler.baris.id })).data?.[0];
  bekle('başkasının profili açılıyor', p?.ad === 'Barış Ak' && p?.benim === false, JSON.stringify(p));
  bekle('başkasının ortalaması profilde yok', p?.ortalama === null, JSON.stringify(p));
  bekle('bir temayı atlayan tam set almıyor', p?.tam_set === false, JSON.stringify(p));
}
{
  const d = (await A.c.rpc('profil', { p_uye: kisiler.deniz.id })).data?.[0];
  const e = (await A.c.rpc('profil', { p_uye: kisiler.ece.id })).data?.[0];
  bekle('son etkinliğe katılanın serisi 1', Number(d?.seri) === 1, JSON.stringify(d));
  bekle('son etkinliği kaçıranın serisi 0', Number(e?.seri) === 0, JSON.stringify(e));
  const z = (await A.c.rpc('profil', { p_uye: kisiler.zeynep.id })).data?.[0];
  bekle('hiç kare vermeyenin profili sıfırlarla açılıyor',
    z?.ad === 'Zeynep Ar' && Number(z?.kare_sayisi) === 0 && Number(z?.seri) === 0 && z?.tam_set === false,
    JSON.stringify(z));
}

// ---------------------------------------------------------------- Profildeki kareler
{
  const k = (await A.c.rpc('profil_kareleri')).data ?? [];
  bekle('kendi karelerin listeleniyor', k.length === 4, String(k.length));
  bekle('kareler yeniden eskiye', k[0].tema_ad === 'Su' && k[k.length - 1].tema_ad !== 'Su',
    JSON.stringify(k.map(x => x.tema_ad)));
  bekle('kendi puanların görünüyor', k.every(x => x.ortalama !== null), JSON.stringify(k.map(x => x.ortalama)));
  {
    const im = await A.c.storage.from('kareler').createSignedUrls(k.map(x => x.dosya), 60);
    bekle('profildeki karelerin imzalı adresi alınıyor',
      !im.error && (im.data ?? []).every(x => !!x.signedUrl), JSON.stringify(im.data?.[0] ?? im.error));
  }
  // Su teması dört kareli, yani iki sıralı: Barış'ın oradaki karesi herkese açık,
  // aynı kişinin iki kareli temalardaki kareleri gizli. İkisi aynı profilde duruyor.
  const baska = (await A.c.rpc('profil_kareleri', { p_uye: kisiler.baris.id })).data ?? [];
  const acik = baska.filter(x => x.sirali);
  bekle('başkasının sıralı karesinin puanı açık',
    acik.length === 1 && acik[0].tema_ad === 'Su' && Number(acik[0].ortalama) === 8, JSON.stringify(acik));
  bekle('aynı profilde sıralı olmayanların puanı gizli',
    baska.filter(x => !x.sirali).every(x => x.ortalama === null && x.sira === null), JSON.stringify(baska));
  const canin = (await A.c.rpc('profil_kareleri', { p_uye: kisiler.can.id })).data ?? [];
  const gizli = canin.filter(x => !x.sirali);
  bekle('başkasının sıralamaya girmeyen karesinin puanı gizli',
    gizli.length > 0 && gizli.every(x => x.ortalama === null && x.sira === null), JSON.stringify(canin));
  const kendi = (await kisiler.can.c.rpc('profil_kareleri')).data ?? [];
  bekle('sahibi kendi gizli puanını görüyor', kendi.every(x => x.ortalama !== null), JSON.stringify(kendi));
}

// ---------------------------------------------------------------- Çekim tarifi
{
  const t = (await A.c.rpc('profil_tarifi')).data ?? [];
  const odak = t.filter(x => x.tur === 'odak');
  bekle('10 karenin altında odak tek değer', odak.length === 1 && odak[0].deger === '35mm'
    && Number(odak[0].adet) === 3 && Number(odak[0].toplam) === 4, JSON.stringify(odak));
  const d = t.find(x => x.tur === 'diyafram');
  bekle('diyafram aralığı ve etiketi', d?.etiket === 'Genelde açık' && /^f\/[0-9.]+( - f\/[0-9.]+)?$/.test(d?.deger ?? ''),
    JSON.stringify(d));
  const i = t.find(x => x.tur === 'isik');
  // ISO 100, 200, 400, 800 → ortadaki değer 200, aralık gerçekten çekilmiş iki değer
  bekle('ışık etiketi ISO ortasından', i?.etiket === 'Bol ışıkta' && i?.deger === 'ISO 100 - 400', JSON.stringify(i));
  bekle('tarif uydurma değer üretmiyor',
    /^f\/(1.8|2|2.8|4)( - f\/(1.8|2|2.8|4))?$/.test(d?.deger ?? ''), JSON.stringify(d));
  const az = (await A.c.rpc('profil_tarifi', { p_uye: kisiler.baris.id })).data ?? [];
  bekle('üç kareden az makine bilgisi varsa tarif yok', az.length === 0, JSON.stringify(az));
}

rapor();
