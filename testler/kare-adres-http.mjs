// kare-adres'in kendisi (index.ts), yerel Edge Function ortamında: oturum, CORS, çekirdeğe bağlantı (karar 127).
// Ön koşul: npx supabase functions serve --env-file supabase/functions/.env.yerel
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor, URL_, ANON } from './ortak.mjs';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toISOString().slice(0, 10), yukleme_baslar: saat(-2), yukleme_biter: saat(20), oylama_biter: saat(44), kuran: A.id }).select('id').single()).data.id;
const T = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: false }).select('id').single()).data.id;
const ADRES = `${URL_}/functions/v1/kare-adres`;
const yol = `${E}/${T}/${crypto.randomUUID()}.jpg`;

const on = await fetch(ADRES, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type, apikey, x-client-info' } });
bekle('CORS ön isteği geçiyor', on.ok && /authorization/i.test(on.headers.get('access-control-allow-headers') ?? ''), `${on.status} ${on.headers.get('access-control-allow-headers')}`);
const oturumsuz = await fetch(ADRES, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON }, body: JSON.stringify({ is: 'oku', yollar: [yol] }) });
bekle('oturumsuz istek reddediliyor', oturumsuz.status === 401, String(oturumsuz.status));
const anonla = await fetch(ADRES, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${ANON}` }, body: JSON.stringify({ is: 'oku', yollar: [yol] }) });
bekle('herkese açık anon anahtarıyla istek reddediliyor', anonla.status === 401, String(anonla.status));

let r = await A.c.functions.invoke('kare-adres', { body: { is: 'yukle', yol } });
bekle('yükleme adresi geliyor', !r.error && typeof r.data?.adres === 'string', JSON.stringify(r.error ?? r.data));
const put = await fetch(r.data.adres, { method: 'PUT', body: fs.readFileSync('/tmp/cgapp/dogru.jpg'), headers: r.data.basliklar });
bekle('adrese PUT geçiyor', put.ok, String(put.status));
r = await A.c.functions.invoke('kare-adres', { body: { is: 'onayla', yol } });
bekle('fonksiyon kendi isteğiyle nesneyi görüp onaylıyor', !r.error && r.data?.tamam === true, JSON.stringify(r.error ?? r.data));
r = await A.c.functions.invoke('kare-adres', { body: { is: 'oku', yollar: [yol] } });
bekle('okuma adresi dosyayı veriyor', !r.error && !!r.data?.adresler?.[0] && (await fetch(r.data.adresler[0])).ok, JSON.stringify(r.error ?? r.data));
r = await A.c.functions.invoke('kare-adres', { body: { is: 'bilinmeyen' } });
bekle('bilinmeyen iş 400', r.error?.context?.status === 400, String(r.error?.context?.status));
rapor();
