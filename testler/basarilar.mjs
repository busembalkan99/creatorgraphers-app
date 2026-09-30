// Başarılar sunucu kuralları (karar 115, 0018): sayılar yalnız sonucu açılmış etkinliklerden,
// yarışmadan çıkarılan kare sayılmıyor, yalnız üyeler çağırabiliyor. Ekran eşiklerle seviyeye çeviriyor.
import { admin, istemci, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { BASARILAR } from '../src/lib/basarilar.ts';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const K = {};
for (const [a, ad, e] of [['B', 'Barış Ak', 'baris'], ['C', 'Can Öz', 'can']]) {
  const k = await kullanici(`${e}@test.local`, ad); await admin.from('uyeler').insert({ id: k.id, ad, eposta: `${e}@test.local` }); K[a] = k;
}
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
async function etkinlik(gun, temalar, sonuc) {
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: gun, yukleme_baslar: saat(sonuc ? -100 : -10), yukleme_biter: saat(sonuc ? -80 : -5),
    oylama_biter: saat(sonuc ? -1 : 20), kuran: A.id }).select('id').single()).data;
  const t = (await admin.from('temalar').insert(temalar.map((ad, i) => ({ etkinlik: e.id, ad, sira: i + 1, bulusmada: false }))).select('id, ad, sira').order('sira')).data;
  return { id: e.id, t };
}
let n = 0;
const kare = async (tema, sahip) => (await admin.from('kareler').insert({ tema: tema.id, sahip, dosya: `x/${n++}.jpg`, genislik: 10, yukseklik: 10 }).select('id').single()).data.id;
const oy = (k, veren, puan) => admin.from('oylar').insert({ kare: k, veren, puan });

// Etkinlik 1 (sonuç açık): Sokak ve Portre. A ikisine de kare verdi (tam set), B yalnız Sokak'a, C ikisine.
const E1 = await etkinlik('2026-08-01', ['Sokak', 'Portre'], true);
const k = { aS: await kare(E1.t[0], A.id), bS: await kare(E1.t[0], K.B.id), cS: await kare(E1.t[0], K.C.id),
  aP: await kare(E1.t[1], A.id), cP: await kare(E1.t[1], K.C.id) };
// Sokak: A 9, B 6, C 7 → 3 kare, sıralamaya 1 kişi giriyor (round(3/2.5)=1): A birinci
await oy(k.aS, K.B.id, 9); await oy(k.aS, K.C.id, 9); await oy(k.bS, A.id, 6); await oy(k.bS, K.C.id, 6); await oy(k.cS, A.id, 7); await oy(k.cS, K.B.id, 7);
// Portre: C 8, A 5 → 2 kare, 1 kişi: C birinci
await oy(k.cP, A.id, 8); await oy(k.cP, K.B.id, 8); await oy(k.aP, K.B.id, 5); await oy(k.aP, K.C.id, 5);
// Etkinlik 2 (oylama sürüyor): A'nın karesi ve oyları sayılmamalı (karar 9)
const E2 = await etkinlik('2026-09-01', ['Gece'], false);
const aG = await kare(E2.t[0], A.id); await oy(aG, K.B.id, 10);

const oku = async (c, uye) => ((await c.rpc('basarilar', uye ? { p_uye: uye } : {})).data ?? [])[0];
let a = await oku(A.c);
bekle('sütunlar ekrandaki başarılarla aynı', BASARILAR.every(b => b.anahtar in (a ?? {})), JSON.stringify(a));
bekle('A: tam set 1 (iki temanın ikisine de)', Number(a.tam_set_sayisi) === 1, JSON.stringify(a));
bekle('A: 2 tema (oylaması süren Gece sayılmıyor)', Number(a.tema_sayisi) === 2, JSON.stringify(a));
bekle('A: 1 kez sıralamaya, 1 kez birinci (Sokak)', Number(a.sirali_sayisi) === 1 && Number(a.birinci_sayisi) === 1, JSON.stringify(a));
const b = await oku(K.B.c);
bekle('B: temayı atlayanda tam set 0, 1 tema, sıralama yok', Number(b.tam_set_sayisi) === 0 && Number(b.tema_sayisi) === 1 && Number(b.sirali_sayisi) === 0, JSON.stringify(b));
const cB = await oku(K.B.c, K.C.id);
bekle('üye başkasının sayılarını okuyabiliyor (profil herkese açık)', Number(cB.tam_set_sayisi) === 1 && Number(cB.birinci_sayisi) === 1, JSON.stringify(cB));
// Yarışmadan çıkarılan kare sayılmıyor: A'nın Sokak karesi çıkarılınca birincilik Can'a geçer, A'nın tam seti de düşer
await admin.from('diskalifiye').insert({ kare: k.aS, neden: 'Tarih tutmadı', eden: A.id });
a = await oku(A.c);
bekle('çıkarılan kare: A tam set 0, birincilik 0, tema 1', Number(a.tam_set_sayisi) === 0 && Number(a.birinci_sayisi) === 0 && Number(a.tema_sayisi) === 1, JSON.stringify(a));
// Aynı tema adı farklı etkinliklerde bir kez sayılıyor (büyük küçük harf, boşluk)
const E3 = await etkinlik('2026-07-01', [' portre '], true);
await kare(E3.t[0], K.C.id);
const c = await oku(K.C.c);
bekle('aynı tema adı bir kez sayılıyor', Number(c.tema_sayisi) === 2, JSON.stringify(c));
bekle('etkinlik başına tam set: C iki etkinlikte de tam', Number(c.tam_set_sayisi) === 2, JSON.stringify(c));
// Üye olmayan
const D = await kullanici('deniz@test.local', 'Deniz Yılmaz');
bekle('üye olmayan hiçbir şey alamıyor', !(await oku(D.c, A.id)));
bekle('girişsiz çağrılamıyor', !!(await istemci().rpc('basarilar', { p_uye: A.id })).error);
rapor();
