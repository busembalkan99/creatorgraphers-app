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
bekle('durum dört değerden biri', ['bitti', 'devam', 'baslamadi', 'yok'].includes(satir.durum), String(satir.durum));

// Yarışmadan çıkarılan kare beklentiden de düşüyor
bekle('yönetici Deniz\'in karesini çıkarıyor', !(await A.c.rpc('kare_cikar', { p_kare: kD.data.id, p_neden: 'etkinlik dışı' })).error);
const d3 = await durumlar(A);
bekle('çıkarılan kare sayılmıyor: tek oy veren bitirdi', d3['Ayşe Kaya'] === 'baslamadi' && d3['Selin Arı'] === 'bitti', JSON.stringify(d3));
bekle('Ayşe kalan tek kareyi puanlıyor', !(await A.c.from('oylar').insert({ kare: kB.data.id, veren: A.id, puan: 6 })).error);
bekle('tek kalan kareyi puanlayan bitirdi', (await durumlar(A))['Ayşe Kaya'] === 'bitti');
await A.c.rpc('kare_geri_al', { p_kare: kD.data.id });

// Sonuç açıldıktan sonra da görünüyor
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
bekle('sonuçta yönetici hâlâ görüyor', Object.keys(await durumlar(A)).length === 3);
bekle('sonuçta üye hâlâ göremiyor', Object.keys(await durumlar(B)).length === 0);

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
  bekle('tek kareyi yükleyenin oylayacağı kare yok', d['Selin Arı'] === 'yok', JSON.stringify(d));
  bekle('ötekiler başlamadı', d['Ayşe Kaya'] === 'baslamadi', JSON.stringify(d));
}

rapor();
