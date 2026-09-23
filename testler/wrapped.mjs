// Wrapped (karar 39, spec 2026-09-20 bölüm 7-8): sunucu kuralları.
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
const B = await kullanici('selin@test.local', 'Selin Arı');
const D = await kullanici('deniz@test.local', 'Deniz Akın');
const C = await kullanici('yabanci@test.local', 'Yabancı');   // üye değil
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').insert([
  { id: B.id, ad: 'Selin Arı', eposta: 'selin@test.local', rol: 'uye' },
  { id: D.id, ad: 'Deniz Akın', eposta: 'deniz@test.local', rol: 'uye' },
]);
const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const T = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true }).select('id').single()).data;
const yukle = async K => {
  const yol = `${E}/${T.id}/${crypto.randomUUID()}.jpg`;
  await K.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  return (await K.c.from('kareler').insert({ tema: T.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single()).data.id;
};
const kA = await yukle(A), kB = await yukle(B);   // Deniz kare vermiyor
const ozet = async K => ((await K.c.rpc('wrapped_ozeti', { p_etkinlik: E })).data ?? [])[0] ?? null;

bekle('yüklemede özet boş', (await ozet(A)) === null);
await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E);
await A.c.from('oylar').insert({ kare: kB, veren: A.id, puan: 8 });
await B.c.from('oylar').insert({ kare: kA, veren: B.id, puan: 6 });
await D.c.from('oylar').insert([{ kare: kA, veren: D.id, puan: 7 }, { kare: kB, veren: D.id, puan: 9 }]);
bekle('oylamada özet boş (sayılar oylamaya dair bir şey söylemesin)', (await ozet(A)) === null);
bekle('oylamada izlendi yazılamıyor', !(await A.c.rpc('wrapped_izle', { p_etkinlik: E })).error &&
  ((await admin.from('wrapped_izlendi').select('uye')).data ?? []).length === 0);

await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
const o = await ozet(A);
bekle('sonuçta sayılar: 2 kişi, 2 kare, 4 puan', o && Number(o.kisi) === 2 && Number(o.kare) === 2 && Number(o.puan) === 4, JSON.stringify(o));
bekle('kişinin kendi oyu', Number(o?.benim_oyum) === 1 && Number((await ozet(D))?.benim_oyum) === 2, JSON.stringify([o, await ozet(D)]));
bekle('izlenmedi', o?.izlendi === false);
bekle('üye olmayan göremiyor', (await ozet(C)) === null);

// Yarışmadan çıkarılan kare sayılmıyor
await A.c.rpc('kare_cikar', { p_kare: kB, p_neden: 'deneme' });
const o2 = await ozet(A);
bekle('çıkarılan kare sayılmıyor', Number(o2.kare) === 1 && Number(o2.kisi) === 1 && Number(o2.puan) === 2, JSON.stringify(o2));
await A.c.rpc('kare_geri_al', { p_kare: kB });

// İzlendi: kişi yalnız kendi adına, tekrar bir şey değiştirmiyor
bekle('izlendi yazılıyor', !(await B.c.rpc('wrapped_izle', { p_etkinlik: E })).error);
bekle('kendi izlendisi görünüyor', (await ozet(B))?.izlendi === true);
bekle('başkasınınki etkilenmiyor', (await ozet(A))?.izlendi === false);
bekle('ikinci kez yazmak hata vermiyor, tek satır', !(await B.c.rpc('wrapped_izle', { p_etkinlik: E })).error &&
  ((await admin.from('wrapped_izlendi').select('uye').eq('uye', B.id)).data ?? []).length === 1);
bekle('tabloya doğrudan yazılamıyor', !!(await A.c.from('wrapped_izlendi').insert({ etkinlik: E, uye: B.id })).error);
bekle('tablo doğrudan okunamıyor', ((await A.c.from('wrapped_izlendi').select('*')).data ?? []).length === 0);
bekle('üye olmayan izlendi yazamıyor', !(await C.c.rpc('wrapped_izle', { p_etkinlik: E })).error &&
  ((await admin.from('wrapped_izlendi').select('uye').eq('uye', C.id)).data ?? []).length === 0);

// İptal edilen etkinlikte Wrapped yok
await admin.from('etkinlikler').update({ iptal: true }).eq('id', E);
bekle('iptal edilen etkinlikte özet boş', (await ozet(D)) === null);
bekle('iptal edilen etkinlikte izlendi yazılmıyor', !(await D.c.rpc('wrapped_izle', { p_etkinlik: E })).error &&
  ((await admin.from('wrapped_izlendi').select('uye').eq('uye', D.id)).data ?? []).length === 0);

rapor();
