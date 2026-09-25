// iPhone'un motoru (WebKit) ile yerleşim: satır ve kartların içeriği kendi kutusundan taşmıyor.
// Chromium bazı düğme boylarını içeriğe göre büyütüyor, Safari büyütmüyor; 2026-09-26'da sıralama
// satırındaki altyazılı kare alttaki satırın üstüne biniyordu ve Chromium testleri görmedi.
// Veri: siralama.mjs'nin bıraktığı kulüp (önce o koşmalı).
import fs from 'node:fs';
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, bekle, rapor } from './ortak.mjs';

const APP = 'http://localhost:5180/';
const SS = '/tmp/cgapp/ss';
fs.mkdirSync(SS, { recursive: true });

const b = await webkit.launch();
// Kısa ekran: Safari düğme satırını ancak sayfa ekrandan uzunken sıkıştırıyor. Uzun bir sayfa
// garanti olsun diye yükseklik düşük (iPhone SE'nin görünen alanından da kısa).
const ctx = await b.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 420 } });
const p = await ctx.newPage();
const hatalar = [];
p.on('pageerror', e => hatalar.push(String(e)));
await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
await p.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });

// Taşma: kutunun her görünür torunu kutunun içinde mi (1px pay). Aynı listedeki kardeş kutular
// birbirinin üstüne biniyor mu.
const olc = async (ad, secici) => {
  const r = await p.evaluate(s => {
    const tasan = [], binen = [];
    const kutular = [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().height > 0);
    for (const k of kutular) {
      const kb = k.getBoundingClientRect();
      for (const c of k.querySelectorAll('*')) {
        const cb = c.getBoundingClientRect();
        if (!cb.width || !cb.height || getComputedStyle(c).visibility === 'hidden') continue;
        if (cb.bottom > kb.bottom + 1 || cb.top < kb.top - 1) tasan.push(`${k.className}>${c.tagName.toLowerCase()}.${c.className}: ${Math.round(cb.top)}-${Math.round(cb.bottom)} / ${Math.round(kb.top)}-${Math.round(kb.bottom)}`);
      }
    }
    for (let i = 1; i < kutular.length; i++) {
      const a = kutular[i - 1].getBoundingClientRect(), c = kutular[i].getBoundingClientRect();
      if (kutular[i - 1].parentElement === kutular[i].parentElement && Math.abs(a.left - c.left) < 2 && c.top < a.bottom - 1) binen.push(`${kutular[i].className}: ${Math.round(c.top)} < ${Math.round(a.bottom)}`);
    }
    return { sayi: kutular.length, tasan: tasan.slice(0, 4), binen: binen.slice(0, 4) };
  }, secici);
  bekle(`${ad}: içerik kutusundan taşmıyor (${r.sayi} kutu)`, r.tasan.length === 0, r.tasan.join(' | '));
  bekle(`${ad}: kutular üst üste binmiyor`, r.binen.length === 0, r.binen.join(' | '));
  return r.sayi;
};
const ac = async (yol, dosya) => {
  await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${SS}/wk-${dosya}.png`, fullPage: true });
};
const SECICI = '.row, .ev, .satir-kare, .tema-satir, .kursu figure, .izgara figure, .grid figure, .tabs button, .btn, .mud, .tahmin-kart';

try {
  await ac('siralama', 'siralama');
  const sirali = await olc('sıralama', SECICI);
  bekle('sıralama: sıralı satır var (kontrol)', (await p.locator('.row').count()) > 0 && sirali > 0);
  bekle('sıralama: altyazılı satır var (kontrol)', (await p.locator('.row .kr small').count()) > 0);

  await ac('etkinlikler', 'etkinlikler');
  await olc('etkinlikler', SECICI);

  await ac('profil', 'profil');
  await olc('profil', SECICI);

  // Kürsüsü dolu bir sonuç sayfası ve onun kare detayı
  const ev = (await admin.from('etkinlikler').select('id').lt('oylama_biter', new Date().toISOString()).order('bulusma_gunu', { ascending: false })).data ?? [];
  bekle('sonuçlanmış etkinlik var (kontrol)', ev.length > 0);
  if (ev.length) {
    await ac(`sonuc/${ev[0].id}`, 'sonuc');
    await olc('sonuç', SECICI);
    const kare = await p.evaluate(async id => (await window.__sb.rpc('sonuc_kareleri', { p_etkinlik: id })).data?.[0]?.id, ev[0].id);
    if (kare) { await ac(`sonuc/${ev[0].id}/kare/${kare}`, 'kare-detay'); await olc('kare detayı', SECICI); }
  }
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
