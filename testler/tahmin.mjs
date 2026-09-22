// Tahmin oyunu (karar 76, karar 106): sunucu kuralları, isimsizlik saldırılarıyla.
// Aşamalar saatler elle kaydırılarak geçiliyor. Rastgelelik yüzünden sayılar değil,
// her rastgele sonuçta tutması gereken kurallar ölçülüyor.
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const hata = r => r.error?.message ?? '';
await sifirla();

const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'], ['selin@test.local', 'Selin Arı'], ['can@test.local', 'Can Öz'],
  ['deniz@test.local', 'Deniz Akın'], ['elif@test.local', 'Elif Sunar'], ['mert@test.local', 'Mert Demir'],
  ['pelin@test.local', 'Pelin Er'],
];
const U = [];
for (const [e, ad] of KISI) U.push({ ...(await kullanici(e, ad)), ad });
const [A] = U;
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').insert(U.slice(1).map(u => ({ id: u.id, ad: u.ad, eposta: KISI.find(k => k[1] === u.ad)[0], rol: 'uye' })));
const adi = Object.fromEntries(U.map(u => [u.id, u.ad]));

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const [SOKAK, PORTRE] = (await admin.from('temalar').insert([
  { etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true },
  { etkinlik: E, ad: 'Portre', sira: 2, bulusmada: false },
]).select('id, sira')).data.sort((x, y) => x.sira - y.sira);

const yukle = async (K, tema) => {
  const yol = `${E}/${tema.id}/${crypto.randomUUID()}.jpg`;
  const u = await K.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  if (u.error) return { error: u.error };
  return K.c.from('kareler').insert({ tema: tema.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single();
};
const sahibi = {};
for (const u of U) { const r = await yukle(u, SOKAK); if (!r.error) sahibi[r.data.id] = u.id; }
for (const u of [U[1], U[2]]) { const r = await yukle(u, PORTRE); if (!r.error) sahibi[r.data.id] = u.id; }
bekle('dokuz kare yüklendi (kontrol)', Object.keys(sahibi).length === 9, String(Object.keys(sahibi).length));

const durum = async K => ((await K.c.rpc('tahmin_durumu', { p_etkinlik: E })).data ?? [])[0] ?? {};
const sorular = async K => (await K.c.rpc('tahmin_sorularim', { p_etkinlik: E })).data ?? [];
const oylaHepsini = async K => {
  const l = (await K.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [];
  for (const k of l) if (k.puan == null) await K.c.from('oylar').insert({ kare: k.id, veren: K.id, puan: 5 });
};

// ------------------------------------------------ yüklemede kapalı
bekle('yüklemede oyun kapalı', (await durum(A)).durum === 'oylama_kapali', JSON.stringify(await durum(A)));
bekle('yüklemede başlatılamıyor', hata(await A.c.rpc('tahmin_baslat', { p_etkinlik: E })).includes('tahmin_oylama_kapali'));

await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E);

// ------------------------------------------------ oylar eksikken kapalı
bekle('oyları eksikken kapalı', (await durum(A)).durum === 'oylar_eksik', JSON.stringify(await durum(A)));
bekle('oyları eksikken başlatılamıyor', hata(await A.c.rpc('tahmin_baslat', { p_etkinlik: E })).includes('tahmin_oylar_eksik'));

// ------------------------------------------------ tablolara doğrudan erişim yok
bekle('tablolar okunamıyor: kümeler', !!(await A.c.from('tahmin_aday').select('*')).error || ((await A.c.from('tahmin_aday').select('*')).data ?? []).length === 0);
bekle('tablolar yazılamıyor: oyun', !!(await A.c.from('tahmin_oyun').insert({ etkinlik: E, uye: A.id })).error);
bekle('tablolar yazılamıyor: soru', !!(await A.c.from('tahmin_soru').insert({ etkinlik: E, uye: A.id, sira: 1, kare: Object.keys(sahibi)[0] })).error);

// ------------------------------------------------ oylayınca açılıyor
await oylaHepsini(A);
bekle('oylarını bitirince açık', (await durum(A)).durum === 'acik', JSON.stringify(await durum(A)));
bekle('başlatmadan önce soru yok', (await sorular(A)).length === 0);
bekle('başlatılıyor', !(await A.c.rpc('tahmin_baslat', { p_etkinlik: E })).error);
bekle('ikinci başlatma bir şey yapmıyor', !(await A.c.rpc('tahmin_baslat', { p_etkinlik: E })).error);
const dA = await durum(A);
bekle('durum başladı', dA.durum === 'basladi' && dA.basladi === true && dA.gonderildi === false, JSON.stringify(dA));

// ------------------------------------------------ kümeler
const kumeler = Object.fromEntries(((await admin.from('tahmin_aday').select('kare, adaylar')).data ?? []).map(x => [x.kare, x.adaylar]));
bekle('bütün karelerin kümesi ilk oyunda üretildi', Object.keys(kumeler).length === 9, String(Object.keys(kumeler).length));
bekle('her kümede sahibi tam bir kez var', Object.entries(kumeler).every(([k, a]) => a.filter(x => x === sahibi[k]).length === 1));
bekle('kümeler dört kişi ve tekrar yok', Object.values(kumeler).every(a => a.length === 4 && new Set(a).size === 4), JSON.stringify(Object.values(kumeler).map(a => a.length)));

const sA = await sorular(A);
bekle('soru sayısı üst sınırı aşmıyor', sA.length >= 1 && sA.length <= 10, String(sA.length));
bekle('kendi karesi sorulmuyor', sA.every(s => sahibi[s.kare] !== A.id));
bekle('kendisinin aday olduğu kare sorulmuyor', sA.every(s => !s.adaylar.some(a => a.uye === A.id)), JSON.stringify(sA.map(s => s.adaylar.map(a => a.ad))));
bekle('adaylar kümenin aynısı ve aynı sırada', sA.every(s => JSON.stringify(s.adaylar.map(a => a.uye)) === JSON.stringify(kumeler[s.kare])));
bekle('sorularda sahip ya da doğruluk alanı yok', sA.every(s => Object.keys(s).sort().join() === 'adaylar,cevap,dosya,gecti,genislik,kare,sira,tema_ad,yukseklik'), JSON.stringify(Object.keys(sA[0] ?? {})));

// SALDIRI: yenileyip kümeleri kesiştirmek
const sA2 = await sorular(A);
bekle('saldırı 1: yenilemek kümeyi değiştirmiyor', JSON.stringify(sA) === JSON.stringify(sA2));

// ------------------------------------------------ puan kilidi
const oyKaresi = ((await A.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [])[0];
bekle('başlatınca puan değişmiyor', hata(await A.c.from('oylar').update({ puan: 9 }).eq('kare', oyKaresi.id).eq('veren', A.id).select()).includes('tahmin_kilidi'));
bekle('puan yerinde kaldı', ((await admin.from('oylar').select('puan').eq('kare', oyKaresi.id).eq('veren', A.id).single()).data?.puan) === 5);

// ------------------------------------------------ dengeli dağıtım
// Başlayan her oyuncu için: seçtiği karelerin önceki soru sayısı, seçilebilir ama seçilmemiş
// her karenin önceki soru sayısından büyük olamaz.
const soruSayisi = async () => {
  const s = (await admin.from('tahmin_soru').select('kare')).data ?? [];
  const m = Object.fromEntries(Object.keys(sahibi).map(k => [k, 0]));
  for (const x of s) m[x.kare]++;
  return m;
};
let dengeli = true; const dengeAyrinti = [];
// Her oyuncunun oyuna başladığı anda gördüğü kümeler. Karşılaştırma sonradan değil bu
// anlık görüntülerle yapılıyor: kümeler okuma anında tablodan geldiği için sonradan
// bakılınca herkes en son kümeyi görür ve oyuncu başına yeniden üretme gizlenir.
const gorulen = [sA.map(x => [x.kare, JSON.stringify(x.adaylar.map(a => a.uye))])];
for (const u of U.slice(1, 6)) {
  await oylaHepsini(u);
  const once = await soruSayisi();
  const r = await u.c.rpc('tahmin_baslat', { p_etkinlik: E });
  if (r.error) { dengeAyrinti.push(`${u.ad}: ${hata(r)}`); continue; }
  const suAn = await sorular(u);
  gorulen.push(suAn.map(x => [x.kare, JSON.stringify(x.adaylar.map(a => a.uye))]));
  const secilen = new Set(suAn.map(s => s.kare));
  const secilebilir = Object.keys(sahibi).filter(k => sahibi[k] !== u.id && !kumeler[k].includes(u.id));
  const secilmeyen = secilebilir.filter(k => !secilen.has(k));
  const enCok = Math.max(...[...secilen].map(k => once[k]));
  const enAz = secilmeyen.length ? Math.min(...secilmeyen.map(k => once[k])) : Infinity;
  if (enCok > enAz) { dengeli = false; dengeAyrinti.push(`${u.ad}: seçilen ${enCok} > seçilmeyen ${enAz}`); }
}
bekle('dengeli: en az sorulmuş kareler önce seçiliyor', dengeli, dengeAyrinti.join(' | '));

// SALDIRI: arkadaşlar kümelerini karşılaştırıp kesiştiriyor
{
  const kare = {};
  for (const g of gorulen) for (const [k, a] of g) (kare[k] ??= new Set()).add(a);
  // Oyun bitince de aynı olmalı: başladığı andaki kümeyle şimdiki aynı
  for (const u of U) for (const x of await sorular(u)) (kare[x.kare] ??= new Set()).add(JSON.stringify(x.adaylar.map(a => a.uye)));
  bekle('saldırı 2: aynı kareyi alan herkes aynı kümeyi görüyor', Object.values(kare).every(s => s.size === 1), JSON.stringify(Object.values(kare).map(s => s.size)));
}

// SALDIRI: oylama sürerken doğru cevap hiçbir yoldan dönmüyor
bekle('saldırı 3: oylamada sonuç boş', ((await A.c.rpc('tahmin_sonucum', { p_etkinlik: E })).data ?? []).length === 0);
bekle('saldırı 3: oylamada tanınma boş', ((await A.c.rpc('taninma', { p_kare: Object.keys(sahibi)[0] })).data ?? []).length === 0);
bekle('saldırı 3: oylamada profil bu etkinliği saymıyor', JSON.stringify(((await A.c.rpc('tahmin_profilim')).data ?? [])[0]) === '{"bilen":0,"toplam":0}', JSON.stringify((await A.c.rpc('tahmin_profilim')).data));

// ------------------------------------------------ cevaplamak
const ilk = sA[0];
const yanlisAday = ilk.adaylar.find(a => a.uye !== sahibi[ilk.kare]).uye;
bekle('aday olmayan isim reddediliyor', hata(await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: ilk.sira, p_cevap: A.id, p_gec: false })).includes('tahmin_aday_degil'));
bekle('adaydan biri kabul ediliyor', !(await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: ilk.sira, p_cevap: yanlisAday, p_gec: false })).error);
// SALDIRI: cevabı değiştirerek doğruyu bulmak (değiştirilemiyor, sonucu da dönmüyor)
bekle('saldırı 4: cevap değiştirilemiyor', hata(await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: ilk.sira, p_cevap: sahibi[ilk.kare], p_gec: false })).includes('tahmin_cevaplandi'));
bekle('saldırı 4: cevap vermek doğruluğunu söylemiyor', ((await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: 999, p_cevap: yanlisAday, p_gec: false })).data ?? null) === null);
bekle('başkasının sorusu cevaplanamıyor', hata(await U[1].c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: 99, p_cevap: yanlisAday, p_gec: false })).includes('tahmin_soru_yok'));
// Kalanlar: biri doğru, biri geç, gerisi doğru
// Havuz küçükken tek soru düşebiliyor (kişinin aday olduğu kareler sorulmuyor); test
// her uzunlukta tutsun diye geç yalnız ikinci soru varsa var.
const gecSira = sA[1]?.sira ?? null;
for (const s of sA.slice(1)) {
  const gec = s.sira === gecSira;
  await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: s.sira, p_cevap: gec ? null : sahibi[s.kare], p_gec: gec });
}
const dA2 = await durum(A);
bekle('hepsi bitince gönderildi', dA2.gonderildi === true && dA2.cevaplanan === sA.length, JSON.stringify(dA2));

// Diğerleri: her soruya doğru cevap (tanınma sayısı için)
for (const u of U.slice(1, 6)) for (const s of await sorular(u))
  await u.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: s.sira, p_cevap: sahibi[s.kare], p_gec: false });

await oylaHepsini(U[6]);   // Pelin oylamasını bitirdi ama oynamadı
bekle('oylamasını bitiren oynamasa da oyun açık görünüyor', (await durum(U[6])).durum === 'acik', JSON.stringify(await durum(U[6])));
// ------------------------------------------------ sonuç açılınca
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
bekle('sonuçta başlatılamıyor (kaçıran oynamıyor)', hata(await U[6].c.rpc('tahmin_baslat', { p_etkinlik: E })).includes('tahmin_oylama_kapali'));
bekle('sonuçta cevap yazılamıyor', hata(await U[1].c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: 1, p_cevap: null, p_gec: true })).includes('oylama_kapali'));

const son = (await A.c.rpc('tahmin_sonucum', { p_etkinlik: E })).data ?? [];
bekle('sonuçta her soru dönüyor', son.length === sA.length, `${son.length} / ${sA.length}`);
bekle('sonuçta sahipler doğru', son.every(s => s.sahip_ad === adi[sahibi[s.kare]]));
const beklenenDogru = Math.max(0, sA.length - (gecSira ? 2 : 1));   // ilki yanlış, varsa ikincisi geç
bekle('skor gerçek cevaplardan', son.filter(s => s.dogru).length === beklenenDogru, `${son.filter(s => s.dogru).length} / ${beklenenDogru}`);
if (gecSira) bekle('geçilen soru doğru sayılmıyor', son.find(s => s.sira === gecSira)?.gecti === true && son.find(s => s.sira === gecSira)?.dogru === false);
bekle('profil sonuçlanan etkinliği sayıyor', JSON.stringify(((await A.c.rpc('tahmin_profilim')).data ?? [])[0]) === JSON.stringify({ bilen: beklenenDogru, toplam: sA.length - (gecSira ? 1 : 0) }), JSON.stringify((await A.c.rpc('tahmin_profilim')).data));

// Tanınma: alt sınır kişi sayısının üçte biri (7 kişi → 3), geç sayılmıyor
const esik = Math.ceil(7 / 3);
const tahminSayisi = {};
for (const x of (await admin.from('tahmin_soru').select('kare, cevap')).data ?? []) if (x.cevap) tahminSayisi[x.kare] = (tahminSayisi[x.kare] ?? 0) + 1;
let taninmaDogru = true; const tAyr = [];
for (const k of Object.keys(sahibi)) {
  const t = ((await U[3].c.rpc('taninma', { p_kare: k })).data ?? [])[0];
  const n = tahminSayisi[k] ?? 0;
  if (n >= esik && (!t || t.toplam !== n)) { taninmaDogru = false; tAyr.push(`${k.slice(0, 6)}: ${n} tahmin, satır ${JSON.stringify(t)}`); }
  if (n < esik && t) { taninmaDogru = false; tAyr.push(`${k.slice(0, 6)}: ${n} < ${esik} ama satır var`); }
}
bekle('tanınma alt sınırı ve toplam doğru, herkes görüyor', taninmaDogru, tAyr.join(' | '));

// ------------------------------------------------ dengeli dağıtım, seçimin gerçekten yapıldığı yerde
// İlk etkinlikte her oyuncu seçebileceği karelerin hepsini alıyordu, kural sınanmıyordu.
// Burada dört fotoğrafçı ikişer kare veriyor: dört kişilik havuzda her küme dördünü de
// içeriyor, yani fotoğrafçılara hiç soru çıkmıyor. Kare vermeyen üç kişi sekiz kareden
// altısını alıyor (7 kişi → 5·8/7 → 6 soru), seçim gerçekten yapılıyor.
{
  const E2 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
  // Temaya kişi başına tek kare: iki kare için iki tema
  const T2 = (await admin.from('temalar').insert([
    { etkinlik: E2, ad: 'Gece', sira: 1, bulusmada: true },
    { etkinlik: E2, ad: 'Pencere', sira: 2, bulusmada: false },
  ]).select('id')).data;
  const kare2 = [];
  for (const u of U.slice(0, 4)) for (const tema of T2) {
    const yol = `${E2}/${tema.id}/${crypto.randomUUID()}.jpg`;
    await u.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
    const r = await u.c.from('kareler').insert({ tema: tema.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single();
    if (!r.error) kare2.push(r.data.id);
  }
  bekle('ikinci etkinlik: sekiz kare (kontrol)', kare2.length === 8, String(kare2.length));
  await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E2);
  for (const u of U) {
    const l = (await u.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [];
    for (const k of l) await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: 6 });
  }
  // Havuzdaki herkes her kümede: fotoğrafçıya soru çıkmıyor ve puanı kilitlenmiyor
  bekle('herkesin kümesinde olana soru çıkmıyor', hata(await U[0].c.rpc('tahmin_baslat', { p_etkinlik: E2 })).includes('tahmin_yok'));
  bekle('sorusu çıkmayan kilitlenmiyor', ((await U[0].c.rpc('tahmin_durumu', { p_etkinlik: E2 })).data ?? [])[0]?.basladi === false);
  const ilkKare2 = ((await U[0].c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [])[0];
  bekle('sorusu çıkmayan puanını değiştirebiliyor', !(await U[0].c.from('oylar').update({ puan: 7 }).eq('kare', ilkKare2.id).eq('veren', U[0].id).select()).error);

  const sayim2 = async () => {
    const m = Object.fromEntries(kare2.map(k => [k, 0]));
    for (const x of (await admin.from('tahmin_soru').select('kare').eq('etkinlik', E2)).data ?? []) m[x.kare]++;
    return m;
  };
  let dengeli2 = true; const ayr2 = [];
  for (const u of U.slice(4)) {
    const once = await sayim2();
    const r = await u.c.rpc('tahmin_baslat', { p_etkinlik: E2 });
    if (r.error) { dengeli2 = false; ayr2.push(`${u.ad}: ${hata(r)}`); continue; }
    const secilen = new Set(((await u.c.rpc('tahmin_sorularim', { p_etkinlik: E2 })).data ?? []).map(s => s.kare));
    if (secilen.size !== 6) ayr2.push(`${u.ad}: ${secilen.size} soru`);
    const secilmeyen = kare2.filter(k => !secilen.has(k));
    const enCok = Math.max(...[...secilen].map(k => once[k]));
    const enAz = Math.min(...secilmeyen.map(k => once[k]));
    if (enCok > enAz) { dengeli2 = false; ayr2.push(`${u.ad}: seçilen ${enCok} > seçilmeyen ${enAz}`); }
  }
  bekle('dengeli: soru sayısı kare sayısına göre (6)', !ayr2.some(x => x.includes(' soru')), ayr2.join(' | '));
  bekle('dengeli: en az sorulmuş kareler önce seçiliyor', dengeli2, ayr2.join(' | '));
  const son2 = Object.values(await sayim2());
  bekle('dengeli: kareler arasındaki fark en çok bir', Math.max(...son2) - Math.min(...son2) <= 1, JSON.stringify(son2));
}

rapor();
