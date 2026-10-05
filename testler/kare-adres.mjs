// kare-adres çekirdeği (karar 127): gerçek yerel veritabanı + MinIO
import fs from 'node:fs';
import { isle } from '../supabase/functions/kare-adres/cekirdek.ts';
import { admin, kullanici, sifirla, bekle, rapor, yerelS3 } from './ortak.mjs';
import { presign, s3Istek } from '../supabase/functions/kare-adres/s3.ts';
await sifirla();
const s3 = yerelS3();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toISOString().slice(0, 10), yukleme_baslar: saat(-2), yukleme_biter: saat(20), oylama_biter: saat(44), kuran: A.id }).select('id').single()).data.id;
const T = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: false }).select('id').single()).data.id;
const cagir = (U, g) => isle(g, { kullanici: U.c, uid: U.id, servis: admin, s3 });
const yol = `${E}/${T}/${crypto.randomUUID()}.jpg`;
const jpg = fs.readFileSync('/tmp/cgapp/dogru.jpg');

let r = await cagir(A, { is: 'yukle', yol });
bekle('yükleme adresi veriliyor', r.durum === 200 && typeof r.veri.adres === 'string', JSON.stringify(r));
bekle('onaylamadan önce dosyalar boş', ((await admin.from('dosyalar').select('yol')).data ?? []).length === 0);
r = await cagir(A, { is: 'onayla', yol });
bekle('nesne yokken onay reddediliyor', r.durum === 409, JSON.stringify(r));
const izin = (await cagir(A, { is: 'yukle', yol })).veri;
bekle('yükleme başlıkları bir yıllık önbellek taşıyor', izin.basliklar?.['cache-control'] === 'max-age=31536000' && izin.basliklar?.['content-type'] === 'image/jpeg', JSON.stringify(izin.basliklar));
bekle('yükleme adresi var olan dosyanın üstüne yazmıyor (if-none-match imzalı)', izin.basliklar?.['if-none-match'] === '*', JSON.stringify(izin.basliklar));
await fetch(izin.adres, { method: 'PUT', body: jpg, headers: izin.basliklar });
r = await cagir(A, { is: 'onayla', yol });
bekle('yüklenince onaylanıyor, sahibi kaydediliyor', r.durum === 200 && (await admin.from('dosyalar').select('sahip').eq('yol', yol).single()).data?.sahip === A.id, JSON.stringify(r));
bekle('onaylanmış yola sahibine de yeniden yükleme adresi yok (kod incelemesi F1)', (await cagir(A, { is: 'yukle', yol })).durum === 403);
bekle('başkasının yoluna yükleme adresi yok', (await cagir(B, { is: 'yukle', yol })).durum === 403);
r = await cagir(A, { is: 'oku', yollar: ['yok/yok/yok.jpg', yol] });
bekle('okuma: sıra korunuyor, izinsiz null', r.veri.adresler.length === 2 && r.veri.adresler[0] === null && !!r.veri.adresler[1]);
bekle('okuma adresi dosyayı veriyor', (await fetch(r.veri.adresler[1])).ok);
bekle('yüklemede başkası okuyamaz', (await cagir(B, { is: 'oku', yollar: [yol] })).veri.adresler[0] === null);
bekle('başkası silemez', (await cagir(B, { is: 'sil', yollar: [yol] })).veri.silinen.length === 0);
bekle('yönetici olmayan taşıma çağıramaz', (await cagir(B, { is: 'tasi' })).durum === 403);
r = await cagir(A, { is: 'sil', yollar: [yol] });
bekle('sahibi siliyor: R2 ve dosyalar', r.veri.silinen.length === 1 && !(await fetch(await presign(s3, 'GET', yol, 60))).ok);
bekle('bilinmeyen iş 400', (await cagir(A, { is: 'yok' })).durum === 400);
// 8 MB üstü onaylanmıyor
const buyuk = `${E}/${T}/${crypto.randomUUID()}.jpg`;
const izinB = (await cagir(A, { is: 'yukle', yol: buyuk })).veri;
await fetch(izinB.adres, { method: 'PUT', body: new Uint8Array(8 * 1024 * 1024 + 1), headers: izinB.basliklar });
r = await cagir(A, { is: 'onayla', yol: buyuk });
bekle('8 MB üstü reddediliyor ve R2den siliniyor', r.durum === 413 && (await s3Istek(s3, 'HEAD', buyuk)).status === 404, JSON.stringify(r));
// Taşıma: Supabase Storage'daki dosya R2'ye, sahibiyle; ikinci çağrıda atlanıyor
const eski = `${E}/${T}/${crypto.randomUUID()}.jpg`;
await A.c.storage.from('kareler').upload(eski, jpg, { contentType: 'image/jpeg' });
r = await cagir(A, { is: 'tasi' });
bekle('taşıma kopyalıyor', r.durum === 200 && r.veri.kopyalanan >= 1 && (await admin.from('dosyalar').select('sahip').eq('yol', eski).single()).data?.sahip === A.id, JSON.stringify(r));
bekle('taşınan kare bir yıllık önbellek başlığı taşıyor (F7)', (await s3Istek(s3, 'HEAD', eski)).headers.get('cache-control') === 'max-age=31536000');
r = await cagir(A, { is: 'tasi' });
bekle('ikinci taşıma çift kopya yapmıyor', r.veri.kopyalanan === 0 && r.veri.atlanan >= 1, JSON.stringify(r));
await admin.from('dosyalar').delete().eq('yol', eski);
r = await cagir(A, { is: 'tasi' });
bekle('yarıda kalmış taşımada eksik sahiplik kaydı tamamlanıyor', (await admin.from('dosyalar').select('sahip').eq('yol', eski).single()).data?.sahip === A.id, JSON.stringify(r));
// Sahibi boş Storage nesnesi (servis rolüyle yüklenmiş, ör. onar-sunmus): sahip kare kaydından (kod incelemesi F2)
const sahipsiz = `${E}/${T}/${crypto.randomUUID()}.jpg`;
await admin.storage.from('kareler').upload(sahipsiz, jpg, { contentType: 'image/jpeg' });
await admin.from('kareler').insert({ tema: T, sahip: B.id, dosya: sahipsiz, genislik: 10, yukseklik: 10 });
r = await cagir(A, { is: 'tasi' });
bekle('sahibi boş nesne kare kaydının sahibiyle taşınıyor', (await admin.from('dosyalar').select('sahip').eq('yol', sahipsiz).maybeSingle()).data?.sahip === B.id && r.veri.hata === 0, JSON.stringify(r));
// Süre dolunca: mevcut "Yükleme kapalı" metni (kod incelemesi F6)
await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).eq('id', E);
const gec = `${E}/${T}/${crypto.randomUUID()}.jpg`;
bekle('yükleme kapanınca adres isteği yukleme_kapali', (await cagir(A, { is: 'yukle', yol: gec })).veri.hata === 'yukleme_kapali');
bekle('yükleme kapanınca onay yukleme_kapali', (await cagir(A, { is: 'onayla', yol: gec })).veri.hata === 'yukleme_kapali');
rapor();
