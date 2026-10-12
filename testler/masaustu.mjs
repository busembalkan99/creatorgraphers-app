// Masaüstü (karar 129, spec 2026-10-12_masaustu_v1). Önce: supabase start, npm run dev,
// node testler/exifjpeg.mjs "$(date +%Y:%m:%d)", node testler/siralama.mjs
// Kullanım: node testler/masaustu.mjs [bölüm ...]   (bölümsüz: hepsi)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { chromium, webkit } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, depo, bekle, rapor } from './ortak.mjs';
import { temaDurumu } from '../src/lib/temaDurumu.ts';

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
      // Yalnız metin düğümleri: 44px dokunma alanlı düğmenin kutusu satır sayımını bozmasın
      const ustler = [], gez = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n; (n = gez.nextNode());) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 1) ustler.push(r.top) }
      ustler.sort((a, b) => a - b);
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
// Sonuçlanmış etkinlik: üç tema, her temada bir birinci; kurucunun da karesi var ("Katıldığın son etkinlik")
// zengin: ilk temada 8 kare (6 üyenin sekizi için eşit olmayan puan); kürsüde en az bir kare çıksın
async function bitmisEtkinlik(zengin = false) {
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun(), kuran: await kimlik('kurucu@test.local'), yukleme_baslar: saat(-100), yukleme_biter: saat(-60), oylama_biter: saat(-1) }).select('id').single()).data;
  kurulan.push(e.id);
  const temalar = (await admin.from('temalar').insert(['Yansıma', 'Kalabalık', 'Gölge'].map((ad, i) => ({ etkinlik: e.id, ad, sira: i + 1, bulusmada: true }))).select('id, ad, sira').order('sira')).data;
  const uyeler = await Promise.all(['kurucu', 'baris', 'can', 'deniz', 'ece', 'zeynep'].map(async a => [a, await kimlik(`${a}@test.local`)]));
  const kareler = [];
  const dagilim = [['baris', 0], ['can', 1], ['deniz', 2], ['kurucu', 0]];
  if (zengin) dagilim.push(['ece', 0], ['zeynep', 0], ['can', 0], ['deniz', 0]);
  for (const [i, a] of dagilim.map(([a, i]) => [i, a])) {
    const id = await kareKoy(e.id, temalar[i].id, `${a}@test.local`);
    kareler.push({ id, sahip: uyeler.find(u => u[0] === a)[1], puan: Math.max(1, 9 - kareler.length) });
  }
  for (const k of kareler) for (const [, veren] of uyeler) if (veren !== k.sahip) await admin.from('oylar').insert({ kare: k.id, veren, puan: k.puan });
  return { id: e.id, temalar };
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
  {
    await acikEtkinlik('yukleme');
    const p = await sayfa(b, [1440, 900]);
    const renk = () => p.evaluate(() => getComputedStyle(document.querySelector('.m-ray a.on')).backgroundColor);
    await ac(p, 'yukle'); await p.waitForTimeout(1500);
    bekle('ray rengi yükleme aşamasını izliyor (veri geldikten sonra)', (await renk()) === 'rgb(181, 45, 18)', await renk());
    await p.locator('.m-ray a[aria-label="Sıralama"]').click(); await p.waitForTimeout(1200);
    bekle('Sıralama\'da ray rengi mürekkep', (await renk()) === 'rgb(237, 237, 234)', await renk());
    await p.context().close();
  }
  const u = await sayfa(b, [1440, 900], 'baris@test.local'); await ac(u, 'etkinlikler');
  bekle('üyeye Yönetim grubu yok', (await u.locator('.m-ray-grup').count()) === 0);
  await u.context().close();
});

// ---------------------------------------------------------------- ölçek
bolum('olcek', async b => {
  try { execSync('node scripts/masaustu-olcek.mjs --denetle', { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' }); bekle('masaustu-olcek.css güncel', true) }
  catch (x) { bekle('masaustu-olcek.css güncel', false, String(x.stderr ?? x)) }
  const olc = (p, sec) => p.evaluate(s => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null }, sec);
  for (const [boyut, mast, kb] of [[[390, 844], 11, 11], [[1024, 768], 12, 12], [[1440, 900], 13, 13]]) {
    const p = await sayfa(b, boyut); await ac(p, 'siralama');
    const m = await olc(p, '.mast'), k = await olc(p, '.kart-bas');
    bekle(`${boyut[0]}: künye ${mast}px, bölüm başlığı ${kb}px`, m === mast && k === kb, `${m} ${k}`);
    const s = await p.evaluate(() => getComputedStyle(document.querySelector('.sc')).getPropertyValue('--s-bolum').trim());
    bekle(`${boyut[0]}: bölüm boşluğu`, s === { 390: '36px', 1024: '54px', 1440: '72px' }[boyut[0]], s);
    await p.context().close();
  }
});

// ---------------------------------------------------------------- etkinlikler
bolum('etkinlikler', async b => {
  const ben = new Set(['a']);
  const oy = [{ tema: 'a', toplam: 12, puanladigim: 5 }, { tema: 'b', toplam: 4, puanladigim: 4 }, { tema: 'c', toplam: 0, puanladigim: 0 }];
  bekle('durum: yüklemede kare verdin', JSON.stringify(temaDurumu('yukleme', 'a', true, ben, null)) === '{"metin":"Kare verdin","tamam":true}');
  bekle('durum: yüklemede henüz yok', temaDurumu('yukleme', 'b', true, ben, null).metin === 'Henüz yok');
  bekle('durum: oylamada 5 / 12 puanladın', temaDurumu('oylama', 'a', true, ben, oy).metin === '5 / 12 puanladın');
  bekle('durum: oylamada bitti', temaDurumu('oylama', 'b', true, ben, oy).metin === 'Bitti');
  bekle('durum: oylanacak kare yok (yalnız kendi karesi)', temaDurumu('oylama', 'c', true, ben, oy).metin === 'Oylanacak kare yok');
  bekle('durum: başlamadıda buluşmada / serbest', temaDurumu('baslamadi', 'a', true, ben, null).metin === 'Buluşmada' && temaDurumu('baslamadi', 'a', false, ben, null).metin === 'Serbest');
  bekle('durum: oy verisi okunamadıysa boş', temaDurumu('oylama', 'a', true, ben, null).metin === '');

  const E = await acikEtkinlik('yukleme');
  await kareKoy(E.id, E.temalar[0].id, 'kurucu@test.local');
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut); await ac(p, 'etkinlikler');
    const r = await p.evaluate(() => [...document.querySelectorAll('.m-tema-durum li')].map(li => li.querySelector('.m-tema-d')?.textContent));
    bekle(`${boyut[0]}: canlı kartta üç tema, ilki Kare verdin`, r.length === 3 && r[0] === 'Kare verdin' && r[1] === 'Henüz yok', JSON.stringify(r));
    if (boyut[0] >= 1200) {
      const yan = await p.evaluate(() => { const l = document.querySelector('.m-tema-durum').getBoundingClientRect(), a = document.querySelector('.live .act').getBoundingClientRect(); return l.left > a.right });
      bekle(`${boyut[0]}: liste kartın sağında`, yan);
    }
    const d = await denetle(p); bekle(`${boyut[0]} etkinlikler: denetim temiz`, d.length === 0, d.join(' | '));
    await p.context().close();
  }
  const t = await sayfa(b, [390, 844]); await ac(t, 'etkinlikler');
  bekle('390: tema listesi telefonda görünmüyor', (await t.locator('.m-tema-durum').isVisible()) === false);
  await t.context().close();

  await admin.from('etkinlikler').update({ iptal: true }).eq('id', E.id);   // aynı anda tek açık etkinlik
  await acikEtkinlik('yukleme', ['ÇOK UZUN BİR TEMA ADI KIRK KARAKTERE KADAR', 'Kalabalık']);
  for (const w of [1024, 1440]) {
    const p = await sayfa(b, [w, 900]); await ac(p, 'etkinlikler');
    const d = await denetle(p); bekle(`${w}: 40 karakterlik tema adıyla canlı kart temiz`, d.length === 0, d.join(' | '));
    await p.context().close();
  }

  // Sonuçlanmış etkinlik: vitrin (üç sütun), katıldığın kart, geçmiş satırları
  await admin.from('etkinlikler').update({ iptal: true }).eq('id', kurulan[kurulan.length - 1]);
  const B = await bitmisEtkinlik();
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut); await p.evaluate(id => window.__sb.rpc('wrapped_izle', { p_etkinlik: id }), B.id);
    await ac(p, 'etkinlikler');
    const r = await p.evaluate(() => {
      const R = e => e.getBoundingClientRect();
      const fig = [...document.querySelectorAll('.vitrin figure')];
      const tasan = [...document.querySelectorAll('.vt figcaption, .vt figcaption *')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className || e.tagName);
      const kat = [...(document.querySelector('.kart.katildigin')?.children ?? [])].filter(e => R(e).width).map(R);
      const ev = [...document.querySelectorAll('.ev')].map(e => { const mo = R(e.querySelector('.mo')), alt = R(e.querySelector('.alt')), git = R(e.querySelector('.git')); return [mo.right, alt.left, alt.right, git.left, mo.top, alt.top, git.top] });
      return { n: fig.length, ayniUst: new Set(fig.map(f => Math.round(R(f).top))).size === 1, tasan, kat: kat.length, katTek: kat.length > 0 && Math.max(...kat.map(x => x.top)) < Math.min(...kat.map(x => x.bottom)), ev };
    });
    const w = boyut[0];
    if (w >= 768) {
      bekle(`${w}: vitrinde üç kare yan yana`, r.n === 3 && r.ayniUst, JSON.stringify([r.n, r.ayniUst]));
      bekle(`${w}: vitrin alt yazısı taşmıyor`, r.tasan.length === 0, r.tasan.join(','));
      bekle(`${w}: katıldığın kartın parçaları tek satırda`, r.kat >= 2 && r.katTek, JSON.stringify([r.kat, r.katTek]));
    }
    if (w >= 1200) bekle(`${w}: geçmiş satırı ay, özet, düğme soldan sağa`, r.ev.length > 0 && r.ev.every(([moR, altL, altR, gitL]) => altL > moR && gitL > altR), JSON.stringify(r.ev));
    const d = await denetle(p); bekle(`${w} etkinlikler (sonuçlanmış): denetim temiz`, d.length === 0, d.join(' | '));
    await p.context().close();
  }
});

// ---------------------------------------------------------------- sonuç
bolum('sonuc', async b => {
  const S = await bitmisEtkinlik(true);
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut); await ac(p, `sonuc/${S.id}`);
    bekle(`${boyut[0]}: veri: ilk temada Birinci ve kürsü var`, (await p.locator('.odul').count()) > 0 && (await p.locator('.kursu').count()) > 0);
    const r = await p.evaluate(() => {
      const R = e => e.getBoundingClientRect();
      const s = document.querySelector('.odul .serit'), kursu = [...document.querySelectorAll('.kursu figcaption')].pop(), k = document.querySelector('.kursu');
      const bas = document.querySelector('.m-baslik-sira'), btn = [...document.querySelectorAll('.m-baslik-sira .btn')];
      return { podyum: !!document.querySelector('.m-podyum'), seritAlt: s && Math.round(R(s).bottom), kursuAlt: kursu && Math.round(R(kursu).bottom), kursuUst: k && Math.round(R(k).top), kazananUst: Math.round(R(document.querySelector('.odul .kazanan')).top),
        kursuYanda: kursu && s && R(kursu).left > R(s).right, kursuTasan: k && k.scrollHeight > k.clientHeight + 1,
        baslikSira: !!bas, dugmeler: btn.length };
    });
    bekle(`${boyut[0]}: Birinci ve kürsü .m-podyum içinde, başlık .m-baslik-sira içinde`, r.podyum && r.baslikSira, JSON.stringify(r));
    if (boyut[0] >= 1200 && r.kursuAlt) {
      bekle(`${boyut[0]}: kürsü Birinci'nin yanında`, r.kursuYanda, JSON.stringify(r));
      bekle(`${boyut[0]}: Birinci şeridi ile son kürsü yazısı aynı yerde biter`, Math.abs(r.seritAlt - r.kursuAlt) <= 1, JSON.stringify(r));
      bekle(`${boyut[0]}: kürsünün üstü Birinci fotoğrafıyla hizalı`, Math.abs(r.kursuUst - r.kazananUst) <= 1, JSON.stringify(r));
      bekle(`${boyut[0]}: kürsü kutusuna sığıyor`, !r.kursuTasan, JSON.stringify(r));
    }
    if (process.env.CG_EKRAN && [1440, 1024].includes(boyut[0])) { const h = await p.evaluate(() => Math.max(...[...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50).map(e => e.scrollHeight)) || 0); await p.setViewportSize({ width: boyut[0], height: Math.min(h + 40, 6000) }); await p.waitForTimeout(500); await p.screenshot({ path: `/tmp/cgapp/ss/sonuc-${boyut[0]}.png`, fullPage: true }) }
    const d = await denetle(p); bekle(`${boyut[0]} sonuç: denetim temiz`, d.length === 0, d.join(' | '));
    await p.context().close();
  }
  // Kurucunun karesi olan sonuçlanmış etkinlik kalırsa sonraki bölümlerde Wrapped açılışı araya giriyor
  await temizle(); kurulan.length = 0;
});

// ---------------------------------------------------------------- çalıştır
try {
for (const [, t] of [['chromium', chromium], ['webkit', webkit]]) {
  const b = await t.launch();
  try { for (const { ad, fn } of bolumler) if (!istenen.length || istenen.includes(ad)) await fn(b); }
  finally { await b.close() }
}
} finally { await temizle() }
rapor();
