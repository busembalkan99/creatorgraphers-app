// Önizleme kopyası (karar 123, egress 1): <ad>.k.jpg tam boyla aynı klasörde. Depo kuralları önizlemeye de
// tam boyla aynı davranmalı; en önemlisi isimsizlik: toplu çıkarılan karenin önizlemesi oylamada açılmamalı (0009).
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const hata = r => r.error?.message ?? '';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('selin@test.local', 'Selin Arı');
const D = await kullanici('deniz@test.local', 'Deniz Akın');
await admin.from('uyeler').insert([{ id: B.id, ad: 'Selin Arı', eposta: 'selin@test.local' }, { id: D.id, ad: 'Deniz Akın', eposta: 'deniz@test.local' }]);
const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const T = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: false }).select('id').single()).data;
const jpeg = fs.readFileSync('/tmp/cgapp/dogru.jpg');
const yukle = async K => {
  const yol = `${E}/${T.id}/${crypto.randomUUID()}.jpg`, kucuk = yol.replace(/\.jpg$/, '.k.jpg');
  const u1 = await K.c.storage.from('kareler').upload(yol, jpeg, { contentType: 'image/jpeg' });
  const u2 = await K.c.storage.from('kareler').upload(kucuk, jpeg, { contentType: 'image/jpeg' });
  const k = await K.c.from('kareler').insert({ tema: T.id, dosya: yol, genislik: 10, yukseklik: 10 }).select('id').single();
  return { yol, kucuk, id: k.data?.id, hata: hata(u1) || hata(u2) || hata(k) };
};
const kB = await yukle(B), kD = await yukle(D);
bekle('üye önizlemeyi tam boyun yanına yükleyebiliyor', !kB.hata && !kD.hata, kB.hata || kD.hata);
const imzali = async (K, yol) => !(await K.c.storage.from('kareler').createSignedUrl(yol, 60)).error;
bekle('yüklemede başkasının önizlemesi görünmüyor', !(await imzali(B, kD.kucuk)));
bekle('sahibi kendi önizlemesini görüyor', await imzali(D, kD.kucuk));
// Yoklama: D gelmedi, karesi toplu çıkarılıyor
await A.c.rpc('yoklama_kaydet', { p_etkinlik: E, p_gelenler: [A.id, B.id] });
bekle('gelmeyen toplu çıkarıldı (kontrol)', (await A.c.rpc('gelmeyenleri_cikar', { p_etkinlik: E })).data == 1);
await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E);
bekle('oylamada başkasının önizlemesi görünüyor', await imzali(B, kB.kucuk) && await imzali(D, kB.kucuk));
bekle('oylamada toplu çıkarılanın tam boyu görünmüyor (kontrol, 0009)', !(await imzali(B, kD.yol)));
bekle('oylamada toplu çıkarılanın önizlemesi de görünmüyor (isimsizlik)', !(await imzali(B, kD.kucuk)) && !(await imzali(A, kD.kucuk)));
// Sonuç: yönetici çıkarılanı resmiyle görüyor, önizleme dahil
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
bekle('sonuçta yönetici toplu çıkarılanın önizlemesini görüyor', await imzali(A, kD.kucuk));
bekle('ad eşleme yalnız sondaki .k.jpg (başka adla atlatılamıyor)', (await admin.rpc('asil_dosya', { p_ad: 'a/b/c.k.jpg' })).data === 'a/b/c.jpg'
  && (await admin.rpc('asil_dosya', { p_ad: 'a/b/c.k.jpg.k.jpg' })).data === 'a/b/c.k.jpg.jpg'
  && (await admin.rpc('asil_dosya', { p_ad: 'a/b/c.jpg' })).data === 'a/b/c.jpg');
rapor();
