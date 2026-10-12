// Masaüstü (karar 129, spec 2026-10-12_masaustu_v1). Önce: supabase start, npm run dev,
// node testler/exifjpeg.mjs "$(date +%Y:%m:%d)", node testler/siralama.mjs
// Kullanım: node testler/masaustu.mjs [bölüm ...]   (bölümsüz: hepsi)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { chromium, webkit } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, depo, bekle, rapor } from './ortak.mjs';

const APP = process.env.CG_APP ?? 'http://localhost:5180/';
export const BOYUTLAR = [[768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const istenen = process.argv.slice(2);
const bolumler = [];
const bolum = (ad, fn) => bolumler.push({ ad, fn });

async function sayfa(b, [w, h], eposta = 'kurucu@test.local') {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error }, eposta);
  return p;
}
async function ac(p, yol) { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(1800) }

// Maketlerde kullanılan denetim; her kontrol kusur geri konarak sınandı (2026-10-12).
// Tek satır kalması gereken etiketler: yeni görevler kendi sınıflarını buraya ekler.
const TEK_SATIR = ['.kart-bas', '.mast', '.m-ray a .m-uzun', '.m-tema-d', '.m-durum'];
async function denetle(p) {
  return p.evaluate(tekSatir => {
    const R = e => e.getBoundingClientRect(), out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('yatay taşma');
    const ray = document.querySelector('.m-ray');
    if (ray && ray.offsetParent) {
      const r = R(ray);
      for (const e of ray.querySelectorAll('*')) { const x = R(e); if (x.width && x.right > r.right + 1) out.push('raydan taşan') }
      for (const a of ray.querySelectorAll('a')) {
        const ra = R(a);
        for (const c of a.children) { const rc = R(c); if (rc.width && Math.min(rc.left - ra.left, ra.right - rc.right) < 8) out.push('sekme payı: ' + a.getAttribute('aria-label')) }
        if (!a.getAttribute('aria-label')) out.push('adsız sekme');
      }
    }
    for (const i of document.querySelectorAll('.m-pk img')) { const a = R(i), k = R(i.parentElement); if (a.width > k.width + 1 || a.height > k.height + 1) out.push('kırpılan kare') }
    for (const x of document.querySelectorAll('.btn')) if (x.offsetParent && x.scrollWidth > x.clientWidth + 1) out.push('sığmayan düğme: ' + x.textContent.trim().slice(0, 24));
    for (const e of document.querySelectorAll(tekSatir.join(','))) {
      if (!e.getClientRects().length) continue;
      const rg = document.createRange(); rg.selectNodeContents(e);
      const ustler = [...rg.getClientRects()].filter(r => r.width > 1).map(r => r.top).sort((a, b) => a - b);
      let satir = 0, son = -1e9; for (const u of ustler) { if (u - son > 8) satir++; son = u }
      if (satir > 1) out.push('iki satıra kırılan: ' + e.textContent.trim().slice(0, 24));
    }
    return out;
  }, TEK_SATIR);
}

// Test verisi: açık etkinlik ve kareler; sonunda siliniyor
const kurulan = [];
const saat = n => new Date(Date.now() + n * 3600000).toISOString();
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kimlik = async e => (await admin.from('uyeler').select('id').eq('eposta', e).single()).data.id;
async function acikEtkinlik(asama, temaAdlari = ['Yansıma', 'Kalabalık', 'Gölge']) {
  const z = asama === 'yukleme'
    ? { yukleme_baslar: saat(-2), yukleme_biter: saat(20), oylama_biter: saat(44) }
    : { yukleme_baslar: saat(-50), yukleme_biter: saat(-2), oylama_biter: saat(20) };
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun(), kuran: await kimlik('kurucu@test.local'), ...z }).select('id').single()).data;
  kurulan.push(e.id);
  const temalar = (await admin.from('temalar').insert(temaAdlari.map((ad, i) => ({ etkinlik: e.id, ad, sira: i + 1, bulusmada: i < 2 })))
    .select('id, ad, sira, bulusmada').order('sira')).data;
  return { id: e.id, temalar };
}
const OLCU = { dogru: [1200, 800], dikey: [800, 1200] };
async function kareKoy(etkinlik, tema, eposta, dosya = 'dogru') {
  const sahip = await kimlik(eposta);
  const yol = `${etkinlik}/${tema}/${crypto.randomUUID()}.jpg`;
  await depo.koy(yol, fs.readFileSync(`/tmp/cgapp/${dosya}.jpg`), sahip);
  const [genislik, yukseklik] = OLCU[dosya] ?? OLCU.dogru;
  return (await admin.from('kareler').insert({ tema, sahip, dosya: yol, genislik, yukseklik, cekim_gunu: bugun() }).select('id').single()).data.id;
}
async function temizle() {
  for (const id of kurulan) {
    const t = ((await admin.from('temalar').select('id').eq('etkinlik', id)).data ?? []).map(x => x.id);
    const k = (await admin.from('kareler').select('dosya').in('tema', t)).data ?? [];
    if (k.length) await depo.sil(k.map(x => x.dosya));
    await admin.from('kareler').delete().in('tema', t);
    await admin.from('temalar').delete().eq('etkinlik', id);
    await admin.from('etkinlikler').delete().eq('id', id);
  }
}

// ---------------------------------------------------------------- kabuk
bolum('kabuk', async b => {
  {
    const p = await sayfa(b, [390, 844]); await ac(p, 'etkinlikler');
    const r = await p.evaluate(() => ({ ray: !!document.querySelector('.m-ray')?.offsetParent, tabs: !!document.querySelector('.tabs')?.offsetParent, app: document.querySelector('.app').getBoundingClientRect().width }));
    bekle('390: ray yok, alt sekme var, sütun aynı', !r.ray && r.tabs && r.app === 390, JSON.stringify(r));
    await p.setViewportSize({ width: 700, height: 900 }); await p.waitForTimeout(300);
    const r2 = await p.evaluate(() => ({ ray: !!document.querySelector('.m-ray')?.offsetParent, app: document.querySelector('.app').getBoundingClientRect().width }));
    bekle('700: hâlâ 480px telefon sütunu', !r2.ray && r2.app === 480, JSON.stringify(r2));
    await p.context().close();
  }
  {
    const p = await sayfa(b, [844, 390]); await ac(p, 'etkinlikler');
    const r = await p.evaluate(() => ({ ray: !!document.querySelector('.m-ray')?.offsetParent, tabs: !!document.querySelector('.tabs')?.offsetParent, app: Math.round(document.querySelector('.app').getBoundingClientRect().width) }));
    bekle('844x390 yatay telefon: ray yok, alt sekme var, sütun 480', !r.ray && r.tabs && r.app === 480, JSON.stringify(r));
    await p.context().close();
  }
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut);
    for (const yol of ['etkinlikler', 'siralama', 'profil']) {
      await ac(p, yol);
      const r = await p.evaluate(() => {
        const ray = document.querySelector('.m-ray'), sc = document.querySelector('.sc');
        return { ray: ray?.offsetParent ? Math.round(ray.getBoundingClientRect().width) : 0, tabs: !!document.querySelector('.tabs')?.offsetParent,
          app: Math.round(document.querySelector('.app').getBoundingClientRect().width), sol: Math.round(sc.getBoundingClientRect().left),
          on: document.querySelector('.m-ray a.on')?.getAttribute('aria-label'), yonetim: document.querySelectorAll('.m-ray-grup a').length };
      });
      const beklenen = boyut[0] >= 1200 ? 280 : 88;
      bekle(`${boyut[0]} ${yol}: ray ${beklenen}px, alt sekme yok, tam genişlik`, r.ray === beklenen && !r.tabs && r.app === boyut[0] && r.sol === beklenen, JSON.stringify(r));
      bekle(`${boyut[0]} ${yol}: seçili sekme doğru`, r.on === { etkinlikler: 'Etkinlikler', siralama: 'Sıralama', profil: 'Profil' }[yol], r.on);
      bekle(`${boyut[0]} ${yol}: kurucuya Yönetim grubu (4)`, r.yonetim === 4, r.yonetim);
      const d = await denetle(p);
      bekle(`${boyut[0]} ${yol}: denetim temiz`, d.length === 0, d.join(' | '));
    }
    await p.locator('.m-ray a[aria-label="Sıralama"]').click(); await p.waitForTimeout(600);
    bekle(`${boyut[0]}: raydan Sıralama'ya geçiş`, p.url().endsWith('#/siralama'), p.url());
    await p.context().close();
  }
  const u = await sayfa(b, [1440, 900], 'baris@test.local'); await ac(u, 'etkinlikler');
  bekle('üyeye Yönetim grubu yok', (await u.locator('.m-ray-grup').count()) === 0);
  await u.context().close();
});

// ---------------------------------------------------------------- çalıştır
for (const [, t] of [['chromium', chromium], ['webkit', webkit]]) {
  const b = await t.launch();
  try { for (const { ad, fn } of bolumler) if (!istenen.length || istenen.includes(ad)) await fn(b); }
  finally { await b.close() }
}
await temizle();
rapor();
