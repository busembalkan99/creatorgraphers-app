// Yüklemede önizleme kopyası (karar 123, egress 1): tam boyun yanına en çok 720 px'lik <ad>.k.jpg, bir yıl
// önbellekte. Kare değiştirilince ya da kaldırılınca iki dosya birden gidiyor.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
  yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data;
const tema = (await admin.from('temalar').insert({ etkinlik: e.id, ad: 'Serbest', sira: 1, bulusmada: false }).select('id').single()).data;

// JPEG boyutu: SOF işaretinden
const boyut = buf => {
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], uz = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { y: buf.readUInt16BE(i + 5), g: buf.readUInt16BE(i + 7) };
    i += 2 + uz;
  }
  return null;
};
const dosyaVar = async yol => {
  const klasor = yol.split('/').slice(0, -1).join('/'), ad = yol.split('/').pop();
  return ((await admin.storage.from('kareler').list(klasor, { search: ad })).data ?? []).find(x => x.name === ad) ?? null;
};
const kareYolu = async () => (await admin.from('kareler').select('dosya').eq('tema', tema.id).eq('sahip', A.id).maybeSingle()).data?.dosya ?? null;
const onizleme = y => y.replace(/\.jpg$/, '.k.jpg');

const b = await webkit.launch(); const hatalar = [];
try {
  const p = await (await b.newContext({ ...devices['iPhone 14'] })).newPage();
  p.on('pageerror', x => hatalar.push(String(x)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  await p.goto(APP + '#/yukle'); await p.reload(); await p.waitForTimeout(2500);
  const giris = p.locator('input[type=file]');
  const yukle = async ad => { await giris.setInputFiles(`/tmp/cgapp/${ad}.jpg`); await p.waitForTimeout(300); await p.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1000); };

  await yukle('buyuk');   // 4032x3024, çevirme bilgili
  const y1 = await kareYolu();
  bekle('kare yüklendi (kontrol)', !!y1 && !!(await dosyaVar(y1)), String(y1));
  const k1 = y1 && await dosyaVar(onizleme(y1));
  bekle('önizleme tam boyun yanında', !!k1, JSON.stringify(k1));
  const indir = y1 && (await admin.storage.from('kareler').download(onizleme(y1))).data;
  const ham = indir && Buffer.from(await indir.arrayBuffer());
  const bo = ham && boyut(ham);
  bekle('önizleme uzun kenarı 720 px, yön korunmuş (dikey)', bo && Math.max(bo.g, bo.y) === 720 && bo.y > bo.g, JSON.stringify(bo));
  bekle('önizleme tam boydan çok küçük', k1 && k1.metadata.size < (await dosyaVar(y1)).metadata.size / 3, `${k1?.metadata.size} / ${(await dosyaVar(y1))?.metadata.size}`);
  bekle('önizleme bir yıl önbellekte', k1?.metadata.cacheControl === 'max-age=31536000', JSON.stringify(k1?.metadata));

  // Değiştir: eski iki dosya gidiyor, yeni ikisi geliyor
  await p.getByRole('button', { name: /Değiştir/ }).first().click(); await p.waitForTimeout(300);
  await yukle('dogru');
  const y2 = await kareYolu();
  bekle('değiştirince eski tam boy ve önizleme silindi', y2 !== y1 && !(await dosyaVar(y1)) && !(await dosyaVar(onizleme(y1))), `${y1} → ${y2}`);
  bekle('değiştirince yeni önizleme var', !!y2 && !!(await dosyaVar(onizleme(y2))));

  // Kaldır: iki dosya da gidiyor
  await p.getByRole('button', { name: /Kaldır/ }).first().click(); await p.waitForTimeout(300);
  await p.locator('.ret button.btn', { hasText: 'Kaldır' }).click(); await p.waitForTimeout(1500);
  bekle('kaldırınca tam boy ve önizleme silindi', !(await kareYolu()) && !(await dosyaVar(y2)) && !(await dosyaVar(onizleme(y2))));
  // Önizleme yüklenemezse kare yine kaydediliyor, ekran tam boyla devam ediyor (kapsam incelemesi)
  await p.route('**/storage/v1/object/kareler/**.k.jpg', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"test"}' }));
  await yukle('donuk');   // başka dosya: aynı dosya ikinci kez seçilince giriş değişiklik olayı üretmiyor
  const y3 = await kareYolu();
  bekle('önizleme yüklenemese de kare kaydediliyor', !!y3 && !!(await dosyaVar(y3)) && !(await dosyaVar(onizleme(y3))), String(y3));
  await p.unroute('**/storage/v1/object/kareler/**.k.jpg');
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
