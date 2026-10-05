// Eski Safari'de kare yükleme (2026-09-29): iPhone X en fazla iOS 16'ya çıkıyor. Safari 16
// createImageBitmap'in imageOrientation: 'from-image' değerini tanımıyor, çağrıyı TypeError ile
// reddediyor; uygulama her karede "Bu dosya açılamadı" diyordu. Tarayıcı burada o davranışa
// getiriliyor. Beklenen: kare yükleniyor, makinenin çevirme bilgisi korunuyor (dikey kare dikey kalıyor).
import fs from 'node:fs';
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
  yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data;
const temalar = [];
for (const [i, ad] of ['Serbest', 'Serbest 2', 'Serbest 3'].entries()) temalar.push((await admin.from('temalar').insert({ etkinlik: e.id, ad, sira: i + 1, bulusmada: false }).select('id').single()).data);

const b = await webkit.launch();
const hatalar = [];
try {
  const ctx = await b.newContext({ ...devices['iPhone 14'] });
  // Safari 16 gibi: tanımadığı imageOrientation değerini reddeden createImageBitmap
  await ctx.addInitScript(() => {
    const asil = window.createImageBitmap;
    window.__reddedilen = 0;
    window.createImageBitmap = function (kaynak, ...r) {
      const secenek = r.length === 1 ? r[0] : r[4];
      if (secenek && secenek.imageOrientation === 'from-image') { window.__reddedilen++; return Promise.reject(new TypeError('Type error')); }
      return asil.call(this, kaynak, ...r);
    };
  });
  const p = await ctx.newPage();
  p.on('pageerror', x => hatalar.push(String(x)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });
  await p.goto(APP + '#/yukle'); await p.reload(); await p.waitForTimeout(2500);
  const giris = p.locator('input[type=file]');
  const yukle = async ad => { await giris.setInputFiles(`/tmp/cgapp/${ad}.jpg`); await p.waitForTimeout(300); await p.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await p.waitForTimeout(800); };
  const metin = async () => ((await p.locator('.app').innerText()) ?? '').replace(/\s+/g, ' ');

  // Birinci tema: yatay kare
  await yukle('dogru');
  bekle('eski Safari: tarayıcı "from-image"i gerçekten reddetti (kontrol)', (await p.evaluate(() => window.__reddedilen)) > 0);
  bekle('eski Safari: "Bu dosya açılamadı" denmiyor', !(await metin()).includes('Bu dosya açılamadı'), (await metin()).slice(0, 300));
  const k1 = (await admin.from('kareler').select('genislik, yukseklik').eq('tema', temalar[0].id).eq('sahip', A.id)).data ?? [];
  bekle('eski Safari: yatay kare yüklendi, yatay kaldı', k1.length === 1 && k1[0].genislik > k1[0].yukseklik, JSON.stringify(k1));

  // İkinci tema: makinenin "90° çevir" dediği kare (yatay kaydedilmiş) dikey kalıyor
  await p.locator('.kontakt .k').nth(1).click(); await p.waitForTimeout(400);
  await yukle('donuk');
  const k2 = (await admin.from('kareler').select('genislik, yukseklik').eq('tema', temalar[1].id).eq('sahip', A.id)).data ?? [];
  bekle('eski Safari: çevirme bilgili kare dikey yüklendi (800x1200)', k2.length === 1 && k2[0].genislik === 800 && k2[0].yukseklik === 1200, JSON.stringify(k2));
  // Üçüncü tema: telefonun tam boy, çevirme bilgili karesi (4032x3024, 90°) 2400'e küçülüp dikey kalıyor (Buse, 2026-09-30: egress)
  await p.locator('.kontakt .k').nth(2).click(); await p.waitForTimeout(400);
  await yukle('buyuk');
  const k3 = (await admin.from('kareler').select('genislik, yukseklik').eq('tema', temalar[2].id).eq('sahip', A.id)).data ?? [];
  bekle('eski Safari: tam boy çevrik kare 1800x2400 yüklendi', k3.length === 1 && k3[0].genislik === 1800 && k3[0].yukseklik === 2400, JSON.stringify(k3));
  // Dosya adları tekil: tarayıcı bir yıl önbellekte tutabilir (egress, 2026-09-30)
  const d3 = (await admin.from('kareler').select('dosya').eq('tema', temalar[2].id).eq('sahip', A.id).single()).data?.dosya ?? '';
  const klasor = d3.split('/').slice(0, -1).join('/'), ad = d3.split('/').pop();
  const meta = ((await admin.storage.from('r2-yerel').list(klasor, { search: ad })).data ?? [])[0]?.metadata;
  bekle('yüklenen kare bir yıl önbellekte tutulabiliyor', meta?.cacheControl === 'max-age=31536000', JSON.stringify(meta));

  // Hiçbir yolla çözülemeyen dosya: yine "Bu dosya açılamadı", sayfa kırılmıyor, kare eklenmiyor
  fs.writeFileSync('/tmp/cgapp/bozuk.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 7)]));
  await p.locator('.kontakt .k').nth(2).click(); await p.waitForTimeout(300);
  const once = ((await admin.from('kareler').select('id').eq('sahip', A.id)).data ?? []).length;
  await giris.setInputFiles('/tmp/cgapp/bozuk.jpg'); await p.waitForTimeout(2500);
  bekle('eski Safari: çözülemeyen dosyada "Bu dosya açılamadı"', (await metin()).includes('Bu dosya açılamadı'), (await metin()).slice(0, 300));
  bekle('eski Safari: çözülemeyen dosya kare eklemedi', ((await admin.from('kareler').select('id').eq('sahip', A.id)).data ?? []).length === once);
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
