// SigV4 (kare-adres/s3.ts, karar 127): yerel S3'e (yerel Supabase'in S3 servisi, kova r2-yerel) karşı
// imzalı PUT/GET/HEAD/DELETE ve süreli adres. Önce: bash scripts/yerel-r2.sh
import { presign, s3Istek } from '../supabase/functions/kare-adres/s3.ts';
import { bekle, rapor, yerelS3 } from './ortak.mjs';
const a = yerelS3();
const k = `test/${crypto.randomUUID()}/x.jpg`;
const govde = new Uint8Array([255, 216, 255, 0, 1, 2]);
const p = await presign(a, 'PUT', k, 300, { 'content-type': 'image/jpeg' });
bekle('imzalı PUT çalışıyor', (await fetch(p, { method: 'PUT', body: govde, headers: { 'content-type': 'image/jpeg' } })).ok);
bekle('HEAD boyutu veriyor', (await s3Istek(a, 'HEAD', k)).headers.get('content-length') === '6');
const g = await presign(a, 'GET', k, 60);
bekle('imzalı GET içeriği veriyor', new Uint8Array(await (await fetch(g)).arrayBuffer()).join() === govde.join());
bekle('imzasız GET reddediliyor', !(await fetch(`${a.adres}/${a.kova}/${k}`)).ok);
bekle('imzası bozulmuş adres reddediliyor', !(await fetch(g.replace(/X-Amz-Signature=./, 'X-Amz-Signature=0'))).ok);
const kisa = await presign(a, 'GET', k, 1);
await new Promise(r => setTimeout(r, 2500));
bekle('süresi geçmiş adres reddediliyor', !(await fetch(kisa)).ok);
// Yerel Supabase depolaması ASCII dışı anahtarı kendisi reddediyor (InvalidKey); R2 kabul ediyor. Uygulamanın
// anahtarları uuid, o yüzden burada imzanın kodlamasını özel ASCII karakterlerle sınıyoruz.
const tr = `test/a b+c'd (e)/${crypto.randomUUID()}.jpg`;
bekle('boşluk ve özel karakterli anahtar imzalanıyor', (await fetch(await presign(a, 'PUT', tr, 60, { 'content-type': 'image/jpeg' }), { method: 'PUT', body: govde, headers: { 'content-type': 'image/jpeg' } })).ok && (await s3Istek(a, 'HEAD', tr)).ok);
// Bir yıllık önbellek (egress, 2026-09-30): başlık imzaya giriyor, tarayıcı göndermezse PUT reddediliyor
const ko = `test/${crypto.randomUUID()}.jpg`, ob = 'max-age=31536000';
const po = await presign(a, 'PUT', ko, 60, { 'content-type': 'image/jpeg', 'cache-control': ob });
bekle('önbellek başlığı imzalanmışsa başlıksız PUT reddediliyor', !(await fetch(po, { method: 'PUT', body: govde, headers: { 'content-type': 'image/jpeg' } })).ok);
bekle('önbellek başlığıyla PUT geçiyor, nesne başlığı taşıyor', (await fetch(po, { method: 'PUT', body: govde, headers: { 'content-type': 'image/jpeg', 'cache-control': ob } })).ok
  && (await s3Istek(a, 'HEAD', ko)).headers.get('cache-control') === ob, (await s3Istek(a, 'HEAD', ko)).headers.get('cache-control'));
await s3Istek(a, 'DELETE', ko);
bekle('sunucu tarafı PUT ve GET', (await s3Istek(a, 'PUT', `test/${crypto.randomUUID()}.jpg`, govde, { 'content-type': 'image/jpeg' })).ok);
bekle('DELETE siliyor', (await s3Istek(a, 'DELETE', k)).ok && (await s3Istek(a, 'HEAD', k)).status === 404);
await s3Istek(a, 'DELETE', tr);
rapor();
