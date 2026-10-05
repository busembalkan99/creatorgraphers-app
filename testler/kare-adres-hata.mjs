// kare-adres çekirdeğinin hata yolları (karar 127): veritabanı taklit, S3 yerel (yerel Supabase'in S3 servisi).
// oku'nun girdi süzgeci, onayla'da kayıt hatası, taşımada RPC / indirme / PUT / kayıt hataları.
import fs from 'node:fs';
import { isle } from '../supabase/functions/kare-adres/cekirdek.ts';
import { bekle, rapor, yerelS3 } from './ortak.mjs';
import { presign, s3Istek } from '../supabase/functions/kare-adres/s3.ts';
const s3 = yerelS3();
const jpg = fs.readFileSync('/tmp/cgapp/dogru.jpg');
const yeniYol = () => `test-hata/${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;

// Taklitler: her çağrı kaydediliyor
const kullaniciTaklit = (cevaplar = {}) => {
  const cagrilar = [];
  return { cagrilar, rpc: async (ad, arg) => { cagrilar.push({ ad, arg }); return typeof cevaplar[ad] === 'function' ? cevaplar[ad](arg) : (cevaplar[ad] ?? { data: null }); } };
};
const servisTaklit = ({ rpc = {}, upsert = { error: null }, indir = { data: null } } = {}) => {
  const kayitlar = [];
  return {
    kayitlar,
    rpc: async ad => rpc[ad] ?? { data: null, error: null },
    from: () => ({ upsert: async satir => { kayitlar.push(satir); return upsert; } }),
    storage: { from: () => ({ download: async () => indir }) },
  };
};
const cagir = (g, kullanici, servis = servisTaklit(), ayar = s3) => isle(g, { kullanici, uid: 'u1', servis, s3: ayar });
const r2Koy = async yol => {
  const izin = await presign(s3, 'PUT', yol, 60, { 'content-type': 'image/jpeg' });
  const r = await fetch(izin, { method: 'PUT', body: jpg, headers: { 'content-type': 'image/jpeg' } });
  if (!r.ok) throw new Error(`R2 PUT ${r.status}`);
};
const r2Var = async yol => (await s3Istek(s3, 'HEAD', yol)).ok;
const temizle = [];

try {
  // oku: dizi olmayan yollar boş listeye düşüyor
  let k = kullaniciTaklit({ dosya_izni: { data: [] } });
  let r = await cagir({ is: 'oku', yollar: 'a/b/c.jpg' }, k);
  bekle('oku: dizi olmayan yollar boş adres listesi', r.durum === 200 && Array.isArray(r.veri.adresler) && r.veri.adresler.length === 0, JSON.stringify(r));
  bekle('oku: dizi olmayan yollarda izin boş listeyle soruluyor', Array.isArray(k.cagrilar[0]?.arg.p_yollar) && k.cagrilar[0].arg.p_yollar.length === 0, JSON.stringify(k.cagrilar));

  // oku: metin olmayan yollar atılıyor
  const izinli = 'a/b/c.jpg';
  k = kullaniciTaklit({ dosya_izni: { data: [izinli] } });
  r = await cagir({ is: 'oku', yollar: [1, null, izinli, { yol: izinli }] }, k);
  bekle('oku: metin olmayan yollar atılıyor, yalnız metin olan cevapta', r.veri.adresler.length === 1 && typeof r.veri.adresler[0] === 'string', JSON.stringify(r.veri));
  bekle('oku: izne yalnız metin yollar soruluyor', JSON.stringify(k.cagrilar[0]?.arg.p_yollar) === JSON.stringify([izinli]), JSON.stringify(k.cagrilar));

  // oku: en çok 500 yol
  const cok = Array.from({ length: 501 }, (_, i) => `a/b/${i}.jpg`);
  k = kullaniciTaklit({ dosya_izni: { data: [] } });
  r = await cagir({ is: 'oku', yollar: cok }, k);
  bekle('oku: 501 yoldan 500 adres dönüyor', r.veri.adresler.length === 500, String(r.veri.adresler?.length));
  bekle('oku: izne 500 yol soruluyor, 501. yok', k.cagrilar[0]?.arg.p_yollar.length === 500 && !k.cagrilar[0].arg.p_yollar.includes('a/b/500.jpg'));

  // onayla: dosya gerçekten R2'de, kayıt (dosya_kaydet) hata verirse 403 ve hata metni
  const onay = yeniYol(); temizle.push(onay);
  await r2Koy(onay);
  k = kullaniciTaklit({ dosya_izni: { data: [onay] } });
  r = await cagir({ is: 'onayla', yol: onay }, k, servisTaklit({ rpc: { dosya_kaydet: { error: { message: 'yetki_yok' } } } }));
  bekle('onayla: dosya_kaydet hatası 403 yetki_yok', r.durum === 403 && r.veri.hata === 'yetki_yok', JSON.stringify(r));

  // tasi: yönetici için depo_nesneleri hatası 500 ve hata metni
  const yonetici = () => kullaniciTaklit({ yonetici_mi: { data: true } });
  r = await cagir({ is: 'tasi' }, yonetici(), servisTaklit({ rpc: { depo_nesneleri: { data: null, error: { message: 'depo_hatasi' } } } }));
  bekle('tasi: depo_nesneleri hatası 500 ve hata metni', r.durum === 500 && r.veri.hata === 'depo_hatasi', JSON.stringify(r));

  // tasi: Storage'dan indirilemeyen nesne hata sayılıyor, hiçbir şey kopyalanmıyor
  const indirilemez = yeniYol(); temizle.push(indirilemez);
  let sv = servisTaklit({ rpc: { depo_nesneleri: { data: [{ name: indirilemez, owner_id: 'u1' }], error: null } }, indir: { data: null } });
  r = await cagir({ is: 'tasi' }, yonetici(), sv);
  bekle('tasi: indirilemeyen nesne hata 1, kopyalanan 0', r.durum === 200 && r.veri.hata === 1 && r.veri.kopyalanan === 0 && r.veri.atlanan === 0, JSON.stringify(r));
  bekle('tasi: indirilemeyen nesne R2ye yazılmıyor, kaydı yok', !(await r2Var(indirilemez)) && sv.kayitlar.length === 0, JSON.stringify(sv.kayitlar));

  // tasi: R2 PUT reddedilirse (yanlış gizli anahtar) hata sayılıyor, dosyalar kaydı yazılmıyor
  const reddedilen = yeniYol(); temizle.push(reddedilen);
  sv = servisTaklit({ rpc: { depo_nesneleri: { data: [{ name: reddedilen, owner_id: 'u1' }], error: null } }, indir: { data: new Blob([jpg]) } });
  r = await cagir({ is: 'tasi' }, yonetici(), sv, { ...s3, gizli: 'yanlis-gizli' });
  bekle('tasi: R2 PUT reddedilince hata 1, kopyalanan 0', r.durum === 200 && r.veri.hata === 1 && r.veri.kopyalanan === 0, JSON.stringify(r));
  bekle('tasi: R2 PUT reddedilince nesne yok, kayıt yazılmıyor', !(await r2Var(reddedilen)) && sv.kayitlar.length === 0, JSON.stringify(sv.kayitlar));

  // tasi: zaten R2'de olan nesnenin kaydı düşerse hata sayılıyor (atlanan değil)
  const zatenR2 = yeniYol(); temizle.push(zatenR2);
  await r2Koy(zatenR2);
  sv = servisTaklit({ rpc: { depo_nesneleri: { data: [{ name: zatenR2, owner_id: 'u1' }], error: null } }, upsert: { error: { message: 'kayit' } } });
  r = await cagir({ is: 'tasi' }, yonetici(), sv);
  bekle('tasi: R2deki nesnenin kaydı düşünce hata 1, atlanan 0', r.veri.hata === 1 && r.veri.atlanan === 0 && sv.kayitlar.length === 1, JSON.stringify(r));

  // tasi: kopyalanan nesnenin kaydı düşerse hata sayılıyor (kopyalanan değil)
  const kopya = yeniYol(); temizle.push(kopya);
  sv = servisTaklit({ rpc: { depo_nesneleri: { data: [{ name: kopya, owner_id: 'u1' }], error: null } }, indir: { data: new Blob([jpg]) }, upsert: { error: { message: 'kayit' } } });
  r = await cagir({ is: 'tasi' }, yonetici(), sv);
  bekle('tasi: kopyalanan nesnenin kaydı düşünce hata 1, kopyalanan 0', r.veri.hata === 1 && r.veri.kopyalanan === 0 && (await r2Var(kopya)) && sv.kayitlar.length === 1, JSON.stringify(r));
} finally {
  await Promise.all(temizle.map(y => s3Istek(s3, 'DELETE', y)));
}
rapor();
