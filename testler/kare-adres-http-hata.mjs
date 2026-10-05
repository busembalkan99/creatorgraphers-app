// kare-adres'in kendisi (index.ts), hata yolları: bozuk JSON gövdesi ve çekirdekte fırlayan hata (karar 127).
// Ön koşul: npx supabase functions serve --env-file supabase/functions/.env.yerel
import { kullanici, sifirla, bekle, rapor, URL_, ANON } from './ortak.mjs';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const jeton = (await A.c.auth.getSession()).data.session.access_token;
const ADRES = `${URL_}/functions/v1/kare-adres`;
const gonder = govde => fetch(ADRES, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${jeton}` }, body: govde });
const json = async r => { try { return await r.json(); } catch { return null; } };

// Bozuk JSON: gövde {} sayılıyor, bilinmeyen iş
let r = await gonder('{bozuk');
let g = await json(r);
bekle('bozuk JSON gövdesi 400 bilinmeyen_is', r.status === 400 && g?.hata === 'bilinmeyen_is', `${r.status} ${JSON.stringify(g)}`);

// yol'suz yukle: çekirdek fırlatıyor (undefined.split), cevap 500 ic_hata, CORS başlıklarıyla
r = await gonder(JSON.stringify({ is: 'yukle' }));
g = await json(r);
bekle('çekirdekte fırlayan hata 500 ic_hata', r.status === 500 && g?.hata === 'ic_hata', `${r.status} ${JSON.stringify(g)}`);
// allow-origin'i ağ geçidi (Kong) de ekliyor; allow-headers yalnız fonksiyonun kendi CORS başlığından geliyor
bekle('iç hata cevabı fonksiyonun CORS başlıklarını taşıyor', r.headers.get('access-control-allow-headers') === 'authorization, x-client-info, apikey, content-type' && r.headers.get('access-control-allow-origin') === '*', `${r.headers.get('access-control-allow-headers')} / ${r.headers.get('access-control-allow-origin')}`);
bekle('iç hata cevabı JSON', /application\/json/.test(r.headers.get('content-type') ?? ''), String(r.headers.get('content-type')));
rapor();
