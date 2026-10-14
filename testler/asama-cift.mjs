// Aşama düğmeleri: istek sürerken ikinci dokunuş gitmiyor (audit 2026-10-14, Must fix 2). Yavaş bağlantıda
// "24 saat uzat"a iki kez basmak yüklemeyi 48 saat uzatıyordu.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = (process.env.CG_APP ?? 'http://localhost:5180/');
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
  yukleme_baslar: saat(-2), yukleme_biter: saat(20), oylama_biter: saat(44), kuran: A.id }).select('id').single()).data.id;
await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true });
const bitis = async () => Date.parse((await admin.from('etkinlikler').select('yukleme_biter').eq('id', E).single()).data.yukleme_biter);

const b = await webkit.launch(); const hatalar = [];
const ctx = await b.newContext({ ...devices['iPhone 14'] });
const p = await ctx.newPage(); p.on('pageerror', e => hatalar.push(String(e)));
try {
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });
  await p.goto(APP + '#/asama'); await p.reload(); await p.waitForTimeout(2200);
  const dugme = p.getByRole('button', { name: '24 saat uzat' });
  // Yavaş bağlantı: istek 1,5 sn sürüyor, kişi bu arada yeniden basıyor
  const once = await bitis();
  await p.route('**/rest/v1/rpc/yukleme_uzat*', async r => { await new Promise(s => setTimeout(s, 1500)); await r.continue(); });
  await dugme.click();
  bekle('istek sürerken düğme kilitli', await dugme.isDisabled());
  await dugme.click({ force: true, timeout: 1000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const fark = (await bitis() - once) / 3600e3;
  bekle('iki dokunuş tek uzatma: yükleme 24 saat uzadı', Math.round(fark) === 24, `${fark} saat`);
  bekle('istek bitince düğme yine basılabilir', await dugme.isEnabled());
  // İstek hata verirse düğme kilitli kalmıyor (Review Focus 4)
  await p.unroute('**/rest/v1/rpc/yukleme_uzat*');
  await p.route('**/rest/v1/rpc/yukleme_uzat*', r => r.fulfill({ status: 400, contentType: 'application/json',
    body: JSON.stringify({ code: 'P0001', message: 'yetki_yok', details: null, hint: null }) }), { times: 1 });
  await dugme.click(); await p.waitForTimeout(800);
  bekle('hata sonrası düğme yine basılabilir', await dugme.isEnabled());
  bekle('hata metni görünüyor', (await p.locator('.hata').count()) > 0 && !hatalar.length, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
