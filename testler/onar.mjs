// Onarım betiği (scripts/onar-sunmus.mjs) yerel veritabanında: listele boyut uyuşmazlığını gösteriyor, "boyut" kaydı
// kayıpsız düzeltiyor, "onar ezik" ezik kareyi dik orana açıp yeni yola bağlıyor; kare kimliği ve oylar yerinde kalıyor.
import fs from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const env = Object.fromEntries(execSync('npx supabase status -o env', { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' })
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const calistir = (...a) => execFileSync('node', ['scripts/onar-sunmus.mjs', ...a], {
  cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8',
  env: { ...process.env, SUPABASE_URL: env.API_URL, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY } });

// Ezik dosya: dik kare (üst kırmızı, alt mavi) yatay 1200x800 kutuya ezilmiş
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1200, height: 800 } });
await pg.setContent('<body style="margin:0;display:flex;flex-direction:column;height:800px"><div style="height:400px;background:#f00"></div><div style="height:400px;background:#00f"></div></body>');
const ezik = await pg.screenshot({ type: 'jpeg', quality: 92 });

await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const F = await kullanici('ferda@test.local', 'Ferda Kılıç'); await admin.from('uyeler').insert({ id: F.id, ad: 'Ferda Kılıç', eposta: 'ferda@test.local' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: '2026-09-27', yukleme_baslar: saat(-50), yukleme_biter: saat(-2), oylama_biter: saat(40), kuran: A.id }).select('id').single()).data;
const t = (await admin.from('temalar').insert([{ etkinlik: e.id, ad: 'Sokak', sira: 1, bulusmada: false }, { etkinlik: e.id, ad: 'Portre', sira: 2, bulusmada: false }]).select('id, sira').order('sira')).data;
const koy = async (tema, buf, g, y) => {
  const yol = `${e.id}/${tema.id}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol, buf, { contentType: 'image/jpeg' });
  return (await admin.from('kareler').insert({ tema: tema.id, sahip: F.id, dosya: yol, genislik: g, yukseklik: y }).select('id, dosya').single()).data;
};
const kUyusmaz = await koy(t[0], fs.readFileSync('/tmp/cgapp/dogru.jpg'), 800, 1200);   // dosya 1200x800, kayıt ters
const kEzik = await koy(t[1], ezik, 1200, 800);
await admin.from('oylar').insert([{ kare: kUyusmaz.id, veren: A.id, puan: 7 }, { kare: kEzik.id, veren: A.id, puan: 9 }]);

const liste = calistir('listele', 'ferda@test.local');
bekle('listele: iki kare, uyuşmayan işaretli', liste.includes(kUyusmaz.id) && liste.includes(kEzik.id)
  && /kayıt 800x1200\s+dosya 1200x800\s+← UYUŞMUYOR/.test(liste) && !new RegExp(`${kEzik.id}.*UYUŞMUYOR`).test(liste), liste);
bekle('listele: dosyalar indirildi', fs.existsSync(`/tmp/onar/${kEzik.id}.jpg`));

calistir('boyut', kUyusmaz.id);
const k1 = (await admin.from('kareler').select('dosya, genislik, yukseklik').eq('id', kUyusmaz.id).single()).data;
bekle('boyut: kayıt dosyaya eşitlendi, dosya aynı', k1.genislik === 1200 && k1.yukseklik === 800 && k1.dosya === kUyusmaz.dosya, JSON.stringify(k1));

const dene = calistir('onar', kEzik.id, 'ezik', '--dene');
bekle('onar --dene: üretime dokunmuyor', /1200x800 → 800x1200/.test(dene)
  && (await admin.from('kareler').select('dosya').eq('id', kEzik.id).single()).data.dosya === kEzik.dosya, dene);
calistir('onar', kEzik.id, 'ezik');
const k2 = (await admin.from('kareler').select('dosya, genislik, yukseklik').eq('id', kEzik.id).single()).data;
bekle('onar: dik orana açıldı, yeni yola bağlandı', k2.genislik === 800 && k2.yukseklik === 1200 && k2.dosya !== kEzik.dosya, JSON.stringify(k2));
const eskiVar = ((await admin.storage.from('kareler').list(`${e.id}/${t[1].id}`)).data ?? []).some(x => kEzik.dosya.endsWith(x.name));
bekle('onar: eski dosya silindi', !eskiVar);
const yeni = Buffer.from(await (await admin.storage.from('kareler').download(k2.dosya)).data.arrayBuffer()).toString('base64');
const renk = await pg.evaluate(async s => {
  const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(s), c => c.charCodeAt(0))], { type: 'image/jpeg' }));
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const r = (px, py) => { const d = x.getImageData(px, py, 1, 1).data; return d[0] > 180 && d[2] < 80 ? 'k' : d[2] > 180 && d[0] < 80 ? 'm' : '?'; };
  return r(400, 200) + r(400, 1000);
}, yeni);
bekle('onar: içerik dik ve doğru (üst kırmızı, alt mavi)', renk === 'km', renk);
bekle('oylar yerinde', ((await admin.from('oylar').select('kare, puan').in('kare', [kUyusmaz.id, kEzik.id])).data ?? []).length === 2);
const oku = await F.c.storage.from('kareler').createSignedUrl(k2.dosya, 60);
bekle('oylamada üye onarılmış dosyayı açabiliyor', !oku.error, JSON.stringify(oku.error));
await b.close();
rapor();
