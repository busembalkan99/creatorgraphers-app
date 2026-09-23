// Tahmin oyunu (karar 76, 106, 107): sunucu kuralları, isimsizlik saldırılarıyla.
// Aşamalar saatler elle kaydırılarak geçiliyor. Rastgelelik yüzünden sayılar değil,
// her rastgele sonuçta tutması gereken kurallar ölçülüyor.
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor, istemci } from './ortak.mjs';
const hata = r => r.error?.message ?? '';
await sifirla();

const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'], ['selin@test.local', 'Selin Arı'], ['can@test.local', 'Can Öz'],
  ['deniz@test.local', 'Deniz Akın'], ['elif@test.local', 'Elif Sunar'], ['mert@test.local', 'Mert Demir'],
  ['pelin@test.local', 'Pelin Er'], ['onur@test.local', 'Onur Tek'], ['kaan@test.local', 'Kaan Uz'],
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
for (const u of U.slice(0, 7)) { const r = await yukle(u, SOKAK); if (!r.error) sahibi[r.data.id] = u.id; }
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
bekle('tablolar okunamıyor: oyun', !!(await A.c.from('tahmin_oyun').select('*')).error || ((await A.c.from('tahmin_oyun').select('*')).data ?? []).length === 0);
bekle('eski kare başına küme tablosu yok (karar 107)', !!(await admin.from('tahmin_aday').select('*')).error);
bekle('tablolar yazılamıyor: oyun', !!(await A.c.from('tahmin_oyun').insert({ etkinlik: E, uye: A.id })).error);
bekle('tablolar yazılamıyor: soru', !!(await A.c.from('tahmin_soru').insert({ etkinlik: E, uye: A.id, sira: 1, kare: Object.keys(sahibi)[0] })).error);

// ------------------------------------------------ üye olmayan ve giriş yapmamış (karar 9)
{
  const yabanci = await kullanici('yabanci@test.local', 'Yabancı');
  const anon = istemci();
  const bos = async (K, fn, arg) => ((await K.rpc(fn, arg)).data ?? []).length === 0;
  const kare1 = Object.keys(sahibi)[0];
  bekle('üye olmayan: durum boş', await bos(yabanci.c, 'tahmin_durumu', { p_etkinlik: E }));
  bekle('üye olmayan: başlatamıyor', hata(await yabanci.c.rpc('tahmin_baslat', { p_etkinlik: E })).includes('tahmin_uye_degil'));
  bekle('üye olmayan: soru yok', await bos(yabanci.c, 'tahmin_sorularim', { p_etkinlik: E }));
  bekle('üye olmayan: cevap yazamıyor', hata(await yabanci.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: 1, p_cevap: null, p_gec: true })).includes('tahmin_uye_degil'));
  bekle('üye olmayan: sonuç, tanınma, profil boş', await bos(yabanci.c, 'tahmin_sonucum', { p_etkinlik: E }) && await bos(yabanci.c, 'taninma', { p_kare: kare1 }) && JSON.stringify(((await yabanci.c.rpc('tahmin_profilim')).data ?? [])[0] ?? { bilen: 0, toplam: 0 }) === '{"bilen":0,"toplam":0}');
  for (const [fn, arg] of [['tahmin_durumu', { p_etkinlik: E }], ['tahmin_baslat', { p_etkinlik: E }], ['tahmin_sorularim', { p_etkinlik: E }],
    ['tahmin_cevapla', { p_etkinlik: E, p_sira: 1, p_cevap: null, p_gec: true }], ['tahmin_sonucum', { p_etkinlik: E }], ['taninma', { p_kare: kare1 }], ['tahmin_profilim', {}]])
    bekle(`giriş yapmamış: ${fn} çağrılamıyor`, !!(await anon.rpc(fn, arg)).error);
  for (const [fn, arg] of [['tahmin_havuzu', { p_etkinlik: E }], ['tahmin_adaylarim', { p_etkinlik: E }], ['tahmin_kareleri', { p_etkinlik: E }], ['tahmin_acik', { p_etkinlik: E }]])
    bekle(`üye: gizli.${fn} çağrılamıyor`, !!(await A.c.schema('gizli').rpc(fn, arg)).error);
}

// ------------------------------------------------ oylayınca açılıyor
await oylaHepsini(A);
bekle('oylarını bitirince açık', (await durum(A)).durum === 'acik', JSON.stringify(await durum(A)));
bekle('başlatmadan önce soru yok', (await sorular(A)).length === 0);
bekle('başlatılıyor', !(await A.c.rpc('tahmin_baslat', { p_etkinlik: E })).error);
bekle('ikinci başlatma bir şey yapmıyor', !(await A.c.rpc('tahmin_baslat', { p_etkinlik: E })).error);
const dA = await durum(A);
bekle('durum başladı', dA.durum === 'basladi' && dA.basladi === true && dA.gonderildi === false, JSON.stringify(dA));

// ------------------------------------------------ adaylar (karar 107): kare veren herkes, kendisi hariç
const trSira = l => [...l].sort((x, y) => x.localeCompare(y, 'tr'));
const havuz1 = [...new Set(Object.values(sahibi))];
const adaylarOf = (K, liste) => liste.map(a => a.uye).sort().join() === havuz1.filter(x => x !== K.id).sort().join();
const sA = await sorular(A);
bekle('soru sayısı üst sınırı aşmıyor', sA.length >= 1 && sA.length <= 10, String(sA.length));
bekle('kendi karesi sorulmuyor', sA.every(s => sahibi[s.kare] !== A.id));
bekle('her soruda adaylar: kare veren herkes, kendisi hariç', sA.every(s => adaylarOf(A, s.adaylar)), JSON.stringify(sA[0]?.adaylar.map(a => a.ad)));
bekle('her soruda aynı liste, aynı sırada', new Set(sA.map(s => JSON.stringify(s.adaylar))).size === 1);
bekle('liste ada göre sıralı', sA.every(s => JSON.stringify(s.adaylar.map(a => a.ad)) === JSON.stringify(trSira(s.adaylar.map(a => a.ad)))), JSON.stringify(sA[0]?.adaylar.map(a => a.ad)));
bekle('sorularda sahip ya da doğruluk alanı yok', sA.every(s => Object.keys(s).sort().join() === 'adaylar,cevap,dosya,gecti,genislik,kare,sira,tema_ad,yukseklik'), JSON.stringify(Object.keys(sA[0] ?? {})));
bekle('soru sırası karışık değil tekrarlı değil', new Set(sA.map(s => s.kare)).size === sA.length && sA.every((s, i) => s.sira === i + 1));

// SALDIRI: yenileyip listeleri kesiştirmek
const sA2 = await sorular(A);
bekle('saldırı 1: yenilemek soruları ve listeyi değiştirmiyor', JSON.stringify(sA) === JSON.stringify(sA2));

// ------------------------------------------------ puan kilidi
const oyKaresi = ((await A.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [])[0];
bekle('başlatınca puan değişmiyor', hata(await A.c.from('oylar').update({ puan: 9 }).eq('kare', oyKaresi.id).eq('veren', A.id).select()).includes('tahmin_kilidi'));
bekle('puan yerinde kaldı', ((await admin.from('oylar').select('puan').eq('kare', oyKaresi.id).eq('veren', A.id).single()).data?.puan) === 5);

// ------------------------------------------------ diğer oyuncular
// SALDIRI 2: arkadaşlar listelerini karşılaştırıyor. Her listede havuzdan yalnız oyuncunun
// kendisi eksik; kareye bağlı hiçbir fark yok.
let listeTemiz = true; const lAyr = [];
for (const u of U.slice(1, 6)) {
  await oylaHepsini(u);
  const r = await u.c.rpc('tahmin_baslat', { p_etkinlik: E });
  if (r.error) { listeTemiz = false; lAyr.push(`${u.ad}: ${hata(r)}`); continue; }
  const su = await sorular(u);
  if (!su.length || su.some(s => sahibi[s.kare] === u.id)) { listeTemiz = false; lAyr.push(`${u.ad}: kendi karesi ya da soru yok`); }
  if (!su.every(s => adaylarOf(u, s.adaylar))) { listeTemiz = false; lAyr.push(`${u.ad}: liste havuz eksi kendisi değil`); }
}
bekle('saldırı 2: her oyuncunun listesi havuz eksi kendisi, kareye göre değişmiyor', listeTemiz, lAyr.join(' | '));

// SALDIRI: oylama sürerken doğru cevap hiçbir yoldan dönmüyor
bekle('saldırı 3: oylamada sonuç boş', ((await A.c.rpc('tahmin_sonucum', { p_etkinlik: E })).data ?? []).length === 0);
bekle('saldırı 3: oylamada tanınma boş', ((await A.c.rpc('taninma', { p_kare: Object.keys(sahibi)[0] })).data ?? []).length === 0);
bekle('saldırı 3: oylamada profil bu etkinliği saymıyor', JSON.stringify(((await A.c.rpc('tahmin_profilim')).data ?? [])[0]) === '{"bilen":0,"toplam":0}', JSON.stringify((await A.c.rpc('tahmin_profilim')).data));

// ------------------------------------------------ cevaplamak
const ilk = sA[0];
const yanlisAday = ilk.adaylar.find(a => a.uye !== sahibi[ilk.kare]).uye;
bekle('kendi adı reddediliyor', hata(await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: ilk.sira, p_cevap: A.id, p_gec: false })).includes('tahmin_aday_degil'));
bekle('adaydan biri kabul ediliyor', !(await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: ilk.sira, p_cevap: yanlisAday, p_gec: false })).error);
// SALDIRI: cevabı değiştirerek doğruyu bulmak (değiştirilemiyor, sonucu da dönmüyor)
bekle('saldırı 4: cevap değiştirilemiyor', hata(await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: ilk.sira, p_cevap: sahibi[ilk.kare], p_gec: false })).includes('tahmin_cevaplandi'));
bekle('saldırı 4: cevap vermek doğruluğunu söylemiyor', ((await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: 999, p_cevap: yanlisAday, p_gec: false })).data ?? null) === null);
bekle('başkasının sorusu cevaplanamıyor', hata(await U[1].c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: 99, p_cevap: yanlisAday, p_gec: false })).includes('tahmin_soru_yok'));
// Kalanlar: biri doğru, biri geç, gerisi doğru
// Test her uzunlukta tutsun diye geç yalnız ikinci soru varsa var.
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

// Tanınma: alt sınır kişi sayısının üçte biri (9 kişi → 3), geç sayılmıyor
const esik = Math.ceil(9 / 3);
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

// ------------------------------------------------ havuz kuralları (karar 107, 109)
// Sekiz fotoğrafçı: Mert'in karesi yoklamayla toplu çıkarılıyor (havuz dışı), Elif'inki
// yüklemede tek tek çıkarılıyor (havuzda kalıyor). Pelin kare vermiyor. Havuz yedi kişi.
{
  const E2 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
  const T2 = (await admin.from('temalar').insert([
    { etkinlik: E2, ad: 'Gece', sira: 1, bulusmada: true },
    { etkinlik: E2, ad: 'Pencere', sira: 2, bulusmada: false },
  ]).select('id, sira')).data.sort((x, y) => x.sira - y.sira);
  const sahip2 = {};
  const yukle2 = async (u, tema) => {
    const yol = `${E2}/${tema.id}/${crypto.randomUUID()}.jpg`;
    await u.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
    const r = await u.c.from('kareler').insert({ tema: tema.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single();
    if (!r.error) sahip2[r.data.id] = u.id;
    return r.data?.id;
  };
  const [ELIF, MERT, PELIN, ONUR, KAAN] = [U[4], U[5], U[6], U[7], U[8]];
  for (const u of [...U.slice(0, 6), ONUR, KAAN]) await yukle2(u, T2[0]);
  for (const u of U.slice(0, 4)) await yukle2(u, T2[1]);
  bekle('havuz: on iki kare (kontrol)', Object.keys(sahip2).length === 12, String(Object.keys(sahip2).length));
  const elifKare = Object.keys(sahip2).find(k => sahip2[k] === ELIF.id);
  const mertKare = Object.keys(sahip2).find(k => sahip2[k] === MERT.id);
  const kaanKare = Object.keys(sahip2).find(k => sahip2[k] === KAAN.id);
  bekle('havuz: tek tek çıkarma (kontrol)', !(await A.c.rpc('kare_cikar', { p_kare: elifKare, p_neden: 'deneme' })).error);
  await admin.from('diskalifiye').insert({ kare: mertKare, neden: 'Buluşmaya katılmadın.', eden: A.id, toplu: true });
  await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E2);
  // Kaan'ın karesi oylama açılınca çıkarılıyor: kimse puanlamadan (sonra geri alınacak)
  bekle('havuz: oylamada çıkarma (kontrol)', !(await A.c.rpc('kare_cikar', { p_kare: kaanKare, p_neden: 'deneme' })).error);
  for (const u of U) {
    const l = (await u.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [];
    for (const k of l) await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: 6 });
  }
  const havuz2 = [...U.slice(0, 5), ONUR, KAAN].map(u => u.id);   // Mert yok, Elif ve Kaan var
  const sor2 = async K => (await K.c.rpc('tahmin_sorularim', { p_etkinlik: E2 })).data ?? [];

  bekle('havuz: kare vermeyen başlatabiliyor', !(await PELIN.c.rpc('tahmin_baslat', { p_etkinlik: E2 })).error);
  const sP = await sor2(PELIN);
  const pl = sP[0]?.adaylar.map(a => a.uye) ?? [];
  bekle('havuz: tek tek çıkarılanın sahibi listede', pl.includes(ELIF.id) && pl.includes(KAAN.id), JSON.stringify(sP[0]?.adaylar.map(a => a.ad)));
  bekle('havuz: toplu çıkarılan listede yok', !pl.includes(MERT.id));
  bekle('havuz: liste tam olarak havuz', pl.slice().sort().join() === havuz2.slice().sort().join());
  bekle('havuz: çıkarılan kareler sorulmuyor', sP.every(s => ![elifKare, mertKare, kaanKare].includes(s.kare)));
  // Soru sayısı: 9 yarışan kare, 9 kişi → ceil(5·9/9) = 5
  bekle('havuz: soru sayısı kare sayısına göre (5)', sP.length === 5, String(sP.length));
  bekle('havuz: toplu çıkarılan isim cevap olamıyor', hata(await PELIN.c.rpc('tahmin_cevapla', { p_etkinlik: E2, p_sira: 1, p_cevap: MERT.id, p_gec: false })).includes('tahmin_aday_degil'));
  bekle('havuz: kare vermeyen biri cevap olamıyor', hata(await PELIN.c.rpc('tahmin_cevapla', { p_etkinlik: E2, p_sira: 1, p_cevap: PELIN.id, p_gec: false })).includes('tahmin_aday_degil'));
  bekle('havuz: tek tek çıkarılanın sahibi cevap olabiliyor', !(await PELIN.c.rpc('tahmin_cevapla', { p_etkinlik: E2, p_sira: 1, p_cevap: ELIF.id, p_gec: false })).error);

  // Fotoğrafçı da oynuyor: kendi iki karesi hariç yedi kare kalıyor, beşi geliyor
  bekle('havuz: fotoğrafçı başlatabiliyor', !(await U[1].c.rpc('tahmin_baslat', { p_etkinlik: E2 })).error);
  const s1 = await sor2(U[1]);
  bekle('havuz: fotoğrafçıya kendi karesi gelmiyor', s1.length === 5 && s1.every(s => sahip2[s.kare] !== U[1].id), String(s1.length));

  // Geri alınan kare: oyunu başlatan ona sonradan puan veremiyor (oy_kontrol, INSERT yolu)
  bekle('havuz: oylamada geri alma (kontrol)', !(await A.c.rpc('kare_geri_al', { p_kare: kaanKare })).error);
  bekle('kilit: geri dönen kareye başlatan puan veremiyor', hata(await PELIN.c.from('oylar').insert({ kare: kaanKare, veren: PELIN.id, puan: 8 })).includes('tahmin_kilidi'));
  bekle('kilit: başlatmayan geri dönen kareye puan verebiliyor', !(await ONUR.c.from('oylar').insert({ kare: kaanKare, veren: ONUR.id, puan: 8 })).error);

  // Oylamada Pelin'in ikinci sorusunun karesi çıkarılıyor: liste değişmiyor, sonuçta sayılmıyor
  const cikanKare = sP[1].kare;
  const onceListe = JSON.stringify(sP[0].adaylar);
  bekle('havuz: oylamada soru karesini çıkarma (kontrol)', !(await A.c.rpc('kare_cikar', { p_kare: cikanKare, p_neden: 'deneme' })).error);
  bekle('havuz: oylamada çıkarılan karenin sahibi listede kalıyor', JSON.stringify((await sor2(PELIN))[0]?.adaylar) === onceListe);
  for (const s of sP.slice(1)) await PELIN.c.rpc('tahmin_cevapla', { p_etkinlik: E2, p_sira: s.sira, p_cevap: sahip2[s.kare], p_gec: false });
  // Kulüpten çıkarılan oyuncu yarım oyununa cevap veremiyor
  const s1ilk = s1[0];
  await admin.from('uyeler').update({ cikarildi_at: new Date().toISOString() }).eq('id', U[1].id);
  bekle('çıkarılan üye: yarım oyununa cevap veremiyor', hata(await U[1].c.rpc('tahmin_cevapla', { p_etkinlik: E2, p_sira: s1ilk.sira, p_cevap: ELIF.id, p_gec: false })).includes('tahmin_uye_degil'));
  bekle('çıkarılan üye: soruları görünmüyor', ((await sor2(U[1])).length) === 0);
  await admin.from('uyeler').update({ cikarildi_at: null }).eq('id', U[1].id);

  // Sonuç: çıkarılan kare skora, tanınmaya ve profile girmiyor
  await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E2);
  const sonP = (await PELIN.c.rpc('tahmin_sonucum', { p_etkinlik: E2 })).data ?? [];
  bekle('çıkarılan kare: sonuçta var ama sayılmıyor', sonP.find(x => x.kare === cikanKare)?.sayildi === false && sonP.filter(x => x.kare !== cikanKare).every(x => x.sayildi), JSON.stringify(sonP.map(x => [x.sira, x.sayildi])));
  bekle('çıkarılan kare: tanınma satırı yok', ((await U[3].c.rpc('taninma', { p_kare: cikanKare })).data ?? []).length === 0);
  // Pelin yalnız bu etkinlikte oynadı: ilk soru yanlış (Elif), çıkarılan hariç kalan üçü doğru
  const beklenen = { bilen: sonP.filter(x => x.kare !== cikanKare && x.dogru).length, toplam: sonP.filter(x => x.kare !== cikanKare && !x.gecti).length };
  bekle('çıkarılan kare: profil saymıyor', JSON.stringify(((await PELIN.c.rpc('tahmin_profilim')).data ?? [])[0]) === JSON.stringify(beklenen) && beklenen.toplam === 4, JSON.stringify([(await PELIN.c.rpc('tahmin_profilim')).data, beklenen]));
}

// ------------------------------------------------ altıdan az fotoğrafçı, ya da sorulacak kare kalmadı (karar 109)
{
  const kur = async kisiler => {
    const E3 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
    const T3 = (await admin.from('temalar').insert({ etkinlik: E3, ad: 'Tek', sira: 1, bulusmada: true }).select('id').single()).data;
    const kareler = [];
    for (const u of kisiler) {
      const yol = `${E3}/${T3.id}/${crypto.randomUUID()}.jpg`;
      await u.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
      kareler.push((await u.c.from('kareler').insert({ tema: T3.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single()).data.id);
    }
    return { E3, kareler };
  };
  const oyla = async E3 => {
    await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E3);
    for (const u of U) for (const k of (await u.c.rpc('oylama_kareleri', { p_etkinlik: E3 })).data ?? [])
      await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: 6 });
  };
  const durum3 = async (K, E3) => ((await K.c.rpc('tahmin_durumu', { p_etkinlik: E3 })).data ?? [])[0]?.durum;
  const bes = await kur(U.slice(0, 5));
  await oyla(bes.E3);
  bekle('beş fotoğrafçıda oyun yok (karar 109)', (await durum3(U[6], bes.E3)) === 'yok');
  bekle('beş fotoğrafçıda başlatılamıyor', hata(await U[6].c.rpc('tahmin_baslat', { p_etkinlik: bes.E3 })).includes('tahmin_yok'));
  const alti = await kur(U.slice(0, 6));
  // Diğer beş kare yüklemede tek tek çıkarılıyor: havuz altı kişi ama Ayşe'ye sorulacak kare yok
  for (const k of alti.kareler.slice(1)) await A.c.rpc('kare_cikar', { p_kare: k, p_neden: 'deneme' });
  await oyla(alti.E3);
  bekle('altı fotoğrafçıda kare vermeyen oyunu görüyor', (await durum3(U[6], alti.E3)) === 'acik');
  bekle('sorulacak başkasının karesi yoksa oyun yok', (await durum3(A, alti.E3)) === 'yok');
  bekle('sorusu çıkmayan başlatamıyor ve kilitlenmiyor', hata(await A.c.rpc('tahmin_baslat', { p_etkinlik: alti.E3 })).includes('tahmin_yok') && ((await A.c.rpc('tahmin_durumu', { p_etkinlik: alti.E3 })).data ?? [])[0]?.basladi === false);
}

rapor();
