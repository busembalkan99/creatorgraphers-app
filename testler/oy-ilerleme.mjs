// Oylama ilerlemesi (karar 105): yönetici kimin oy verdiğini görüyor, kimse başkasının
// oyunu ya da kare sahipliğini öğrenemiyor. Aşamalar saatler elle kaydırılarak geçiliyor.
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const hata = r => r.error?.message ?? '';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
const B = await kullanici('selin@test.local', 'Selin Arı');
const D = await kullanici('deniz@test.local', 'Deniz Akın');
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').insert([
  { id: B.id, ad: 'Selin Arı', eposta: 'selin@test.local', rol: 'uye' },
  { id: D.id, ad: 'Deniz Akın', eposta: 'deniz@test.local', rol: 'uye' },
]);

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const SOKAK = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true }).select('id').single()).data;

const yukle = async (K) => {
  const yol = `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`;
  const u = await K.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  if (u.error) return { error: u.error };
  return K.c.from('kareler').insert({ tema: SOKAK.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single();
};
const durumlar = async K => Object.fromEntries(
  ((await K.c.rpc('oylama_ilerlemesi', { p_etkinlik: E })).data ?? []).map(x => [x.ad, x.durum])
);

// Üçü de kare veriyor: herkesin oylayacağı iki kare var
const kA = await yukle(A); const kB = await yukle(B); const kD = await yukle(D);
bekle('üç kare de yüklendi (kontrol)', !kA.error && !kB.error && !kD.error, hata(kA) + hata(kB) + hata(kD));

// Yükleme sürerken liste kapalı: oy veren olamaz, fonksiyon da açılmaz
bekle('yüklemede yönetici bile ilerleme göremiyor', Object.keys(await durumlar(A)).length === 0);

await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E);

// Oylama açık, kimse oy vermedi
const d0 = await durumlar(A);
bekle('oylamada yönetici üç kişiyi de görüyor', Object.keys(d0).length === 3, JSON.stringify(d0));
bekle('oy verilmeden herkes başlamadı', Object.values(d0).every(x => x === 'baslamadi'), JSON.stringify(d0));

// Üye listeyi hiç göremiyor
bekle('üye ilerleme listesini göremiyor', Object.keys(await durumlar(B)).length === 0);
bekle('üye başkasının oyunu doğrudan okuyamıyor (kontrol)', ((await B.c.from('oylar').select('veren')).data ?? []).length === 0);

// Selin bir kareye puan verdi: devam ediyor, ötekiler değişmedi
bekle('Selin oy verebiliyor', !(await B.c.from('oylar').insert({ kare: kA.data.id, veren: B.id, puan: 7 })).error);
const d1 = await durumlar(A);
bekle('bir oy veren devam ediyor', d1['Selin Arı'] === 'devam', JSON.stringify(d1));
bekle('oy vermeyen başlamadı kalıyor', d1['Deniz Akın'] === 'baslamadi' && d1['Ayşe Kaya'] === 'baslamadi', JSON.stringify(d1));

// İkinci kareyi de puanladı: kendi karesi sayılmıyor, bitti oluyor
bekle('Selin ikinci kareyi puanlıyor', !(await B.c.from('oylar').insert({ kare: kD.data.id, veren: B.id, puan: 9 })).error);
const d2 = await durumlar(A);
bekle('kendi karesi hariç hepsini puanlayan bitirdi', d2['Selin Arı'] === 'bitti', JSON.stringify(d2));

// Sayı dönmüyor: kişinin kaç kare yüklediği listeden çıkarılamıyor (isimsizlik, karar 9)
const satir = ((await A.c.rpc('oylama_ilerlemesi', { p_etkinlik: E })).data ?? [])[0] ?? {};
bekle('satırda yalnız üye, ad ve durum var', Object.keys(satir).sort().join() === 'ad,durum,uye', JSON.stringify(satir));
bekle('durum üç değerden biri', ['bitti', 'devam', 'baslamadi'].includes(satir.durum), String(satir.durum));

// SALDIRI: oylamada kare çıkarmak ölçüyü oynatmamalı. Oynatsaydı yönetici X dışındaki
// bütün kareleri çıkarıp durumu değişen kişiyi X'in sahibi diye okurdu (güvenlik incelemesi).
const oncesi = JSON.stringify(await durumlar(A));
bekle('yönetici Deniz\'in karesini çıkarıyor', !(await A.c.rpc('kare_cikar', { p_kare: kD.data.id, p_neden: 'etkinlik dışı' })).error);
bekle('saldırı 1: oylamada kare çıkınca kimsenin durumu değişmiyor', JSON.stringify(await durumlar(A)) === oncesi, oncesi + ' -> ' + JSON.stringify(await durumlar(A)));
bekle('Ayşe kalan tek kareyi puanlıyor', !(await A.c.from('oylar').insert({ kare: kB.data.id, veren: A.id, puan: 6 })).error);
bekle('çıkarılan kare ölçüde kaldığı için bitmiş sayılmıyor', (await durumlar(A))['Ayşe Kaya'] === 'devam', JSON.stringify(await durumlar(A)));

// SALDIRI: X dışındaki her kareyi çıkarıp tek tek sahiplik okumak
const araci = JSON.stringify(await durumlar(A));
await A.c.rpc('kare_cikar', { p_kare: kA.data.id, p_neden: 'deneme' });
await A.c.rpc('kare_cikar', { p_kare: kB.data.id, p_neden: 'deneme' });
bekle('saldırı 2: tek kare kalana kadar çıkarmak da bir şey söylemiyor', JSON.stringify(await durumlar(A)) === araci, araci + ' -> ' + JSON.stringify(await durumlar(A)));
await A.c.rpc('kare_geri_al', { p_kare: kA.data.id });
await A.c.rpc('kare_geri_al', { p_kare: kB.data.id });
bekle('saldırı 3: geri almak da bir şey söylemiyor', JSON.stringify(await durumlar(A)) === araci, JSON.stringify(await durumlar(A)));
await A.c.rpc('kare_geri_al', { p_kare: kD.data.id });
bekle('hepsi geri gelince Ayşe yine devam ediyor', (await durumlar(A))['Ayşe Kaya'] === 'devam', JSON.stringify(await durumlar(A)));

// SALDIRI: ölçüyü donduran çapayı (yukleme_biter) yöneticinin kendisi kaydırması.
// İkinci güvenlik turu bunu baştan sona çalıştırmıştı: kareleri çıkar, saati şimdiye
// çek, çıkardıkların "oylamadan önce çıkarılmış" sayılsın, ölçü tek kareye insin.
{
  const e0 = (await A.c.from('etkinlikler').select('yukleme_biter, oylama_biter').eq('id', E).single()).data;
  const yaz = await A.c.from('etkinlikler').update({ yukleme_biter: new Date().toISOString() }).eq('id', E).select();
  bekle('saldırı 4: yönetici etkinliğin saatini doğrudan yazamıyor', ((yaz.data ?? []).length === 0) || !!yaz.error, JSON.stringify(yaz.data ?? yaz.error));
  const e1 = (await A.c.from('etkinlikler').select('yukleme_biter, oylama_biter').eq('id', E).single()).data;
  bekle('saldırı 4: saatler yerinde kaldı', JSON.stringify(e0) === JSON.stringify(e1), JSON.stringify(e0) + ' -> ' + JSON.stringify(e1));
  bekle('saldırı 4: sonucu erken açamıyor', ((await A.c.from('etkinlikler').update({ oylama_biter: new Date().toISOString() }).eq('id', E).select()).data ?? []).length === 0);
  bekle('saldırı 4: temayı başka etkinliğe taşıyamıyor', ((await A.c.from('temalar').update({ etkinlik: null }).eq('id', SOKAK.id).select()).data ?? []).length === 0);
  bekle('saldırı 4: temayı silemiyor', ((await A.c.from('temalar').delete().eq('id', SOKAK.id).select()).data ?? []).length === 0);
}

// SALDIRI: toplu çıkarılmış kareyi yeniden çıkarıp ölçüye sokmak (çıkarma zamanı tazelenmemeli)
{
  const once = JSON.stringify(await durumlar(A));
  await A.c.rpc('kare_cikar', { p_kare: kD.data.id, p_neden: 'ilk' });
  const zaman1 = (await admin.from('diskalifiye').select('zaman').eq('kare', kD.data.id).single()).data?.zaman;
  await A.c.rpc('kare_cikar', { p_kare: kD.data.id, p_neden: 'ikinci' });
  const zaman2 = (await admin.from('diskalifiye').select('zaman').eq('kare', kD.data.id).single()).data?.zaman;
  bekle('saldırı 5: yeniden çıkarmak zamanı tazelemiyor', zaman1 === zaman2, `${zaman1} -> ${zaman2}`);
  bekle('saldırı 5: durumlar yine değişmiyor', JSON.stringify(await durumlar(A)) === once, once + ' -> ' + JSON.stringify(await durumlar(A)));
  await A.c.rpc('kare_geri_al', { p_kare: kD.data.id });
}

// Sonuç açıldıktan sonra da görünüyor
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
bekle('sonuçta yönetici hâlâ görüyor', Object.keys(await durumlar(A)).length === 3);
bekle('sonuçta üye hâlâ göremiyor', Object.keys(await durumlar(B)).length === 0);

// Sonuçta ölçü o anki yarışan karelere dönüyor: sahiplik zaten açık
await A.c.rpc('kare_cikar', { p_kare: kD.data.id, p_neden: 'sonuç sonrası' });
bekle('sonuçta çıkarılan kare ölçüden düşüyor', (await durumlar(A))['Ayşe Kaya'] === 'bitti', JSON.stringify(await durumlar(A)));
await A.c.rpc('kare_geri_al', { p_kare: kD.data.id });

// Kulüpten çıkarılan üye listede yok
await admin.from('uyeler').update({ cikarildi_at: new Date().toISOString() }).eq('id', D.id);
const d4 = await durumlar(A);
bekle('kulüpten çıkarılan listede görünmüyor', !('Deniz Akın' in d4) && Object.keys(d4).length === 2, JSON.stringify(d4));

// Oylayacak karesi olmayan ayrı duruyor: tek oy vermeden "oy veren" sayılmamalı
{
  const E2 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
  const T2 = (await admin.from('temalar').insert({ etkinlik: E2, ad: 'Gece', sira: 1, bulusmada: true }).select('id').single()).data;
  const yol = `${E2}/${T2.id}/${crypto.randomUUID()}.jpg`;
  await B.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const tek = await B.c.from('kareler').insert({ tema: T2.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single();
  bekle('tek kare yüklendi (kontrol)', !tek.error, hata(tek));
  await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E2);
  const d = Object.fromEntries(((await A.c.rpc('oylama_ilerlemesi', { p_etkinlik: E2 })).data ?? []).map(x => [x.ad, x.durum]));
  // Oylayacak karesi olmayan ayrı bir durumla gösterilmiyor: "oylayacağın kare yok" demek
  // bütün karelerin o kişiye ait olduğunu söylerdi (isimsizlik, karar 9).
  bekle('bütün kareler kendisinin olan da başlamadı görünüyor', d['Selin Arı'] === 'baslamadi', JSON.stringify(d));
  bekle('ötekiler de başlamadı', d['Ayşe Kaya'] === 'baslamadi', JSON.stringify(d));
  bekle('durumlar ayırt edilemiyor', new Set(Object.values(d)).size === 1, JSON.stringify(d));
}

rapor();
