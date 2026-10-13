// Masaüstü (karar 129, spec 2026-10-12_masaustu_v1). Önce: supabase start, npm run dev,
// node testler/exifjpeg.mjs "$(date +%Y:%m:%d)", node testler/siralama.mjs
// Kullanım: node testler/masaustu.mjs [bölüm ...]   (bölümsüz: hepsi)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { chromium, webkit } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, depo, bekle, rapor, kullanici } from './ortak.mjs';
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
const TEK_SATIR = ['.kart-bas', '.mast', '.m-ray a .m-uzun', '.m-tema-d', '.m-durum', '.habit .l', '.row .nm', '.ozet .k', '.rolakt button'];
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
    for (const i of document.querySelectorAll('.m-pk img')) { const a = R(i), k = R(i.parentElement); if (a.width > k.width + 1 || a.height > k.height + 1) out.push(`kırpılan kare (${i.parentElement.parentElement?.className} ${Math.round(a.width)}x${Math.round(a.height)} > ${Math.round(k.width)}x${Math.round(k.height)})`) }
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
    : asama === 'baslamadi'
      ? { yukleme_baslar: saat(5), yukleme_biter: saat(25), oylama_biter: saat(49) }
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
async function bitmisEtkinlik(zengin = false, kurucuEkstra = false) {
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun(), kuran: await kimlik('kurucu@test.local'), yukleme_baslar: saat(-100), yukleme_biter: saat(-60), oylama_biter: saat(-1) }).select('id').single()).data;
  kurulan.push(e.id);
  const temalar = (await admin.from('temalar').insert(['Yansıma', 'Kalabalık', 'Gölge'].map((ad, i) => ({ etkinlik: e.id, ad, sira: i + 1, bulusmada: true }))).select('id, ad, sira').order('sira')).data;
  const uyeler = await Promise.all(['kurucu', 'baris', 'can', 'deniz', 'ece', 'zeynep'].map(async a => [a, await kimlik(`${a}@test.local`)]));
  const kareler = [];
  const dagilim = [['baris', 0], ['can', 1], ['deniz', 2], ['kurucu', 0]];
  if (kurucuEkstra) dagilim.push(['kurucu', 1], ['kurucu', 2]);
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
    if (boyut[0] === 1440) {
      // Cmd/Ctrl tıklaması bağlantının kendi davranışı: yeni sekme, bu sayfa yerinde
      const [yeni] = await Promise.all([p.context().waitForEvent('page', { timeout: 4000 }).catch(() => null),
        p.locator('.m-ray a[aria-label="Sıralama"]').click({ modifiers: ['ControlOrMeta'] })]);
      await p.waitForTimeout(400);
      bekle('1440: Cmd/Ctrl tıklaması yeni sekmede açıyor, sayfa yerinde', !!yeni && p.url().endsWith('#/profil'), `${!!yeni} ${p.url()}`);
      if (yeni) await yeni.close();
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
  // Açık yükleme etkinliği kalırsa oylama bölümünün etkinliği açık etkinlik sayılmıyor
  await temizle(); kurulan.length = 0;
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
  // Kur'un sınırı 40 karakter (temalar_ad_check); daha uzunu veritabanına girmiyor
  await acikEtkinlik('yukleme', ['ÇOK UZUN BİR TEMA ADI KIRK KARAKTER OLUR', 'Kalabalık']);
  for (const w of [1024, 1440]) {
    const p = await sayfa(b, [w, 900]); await ac(p, 'etkinlikler');
    const ad = (await p.textContent('.m-tema-durum').catch(() => '')) ?? '';
    const d = await denetle(p); bekle(`${w}: 40 karakterlik tema adıyla canlı kart temiz`, d.length === 0 && ad.includes('KIRK KARAKTER OLUR'), d.join(' | ') || ad.slice(0, 80));
    await p.context().close();
  }

  // Başlamadı: tema adları masaüstünde yalnız listede (tek satırlık özet telefonda)
  await admin.from('etkinlikler').update({ iptal: true }).eq('id', kurulan[kurulan.length - 1]);
  await acikEtkinlik('baslamadi');
  for (const boyut of [[390, 844], [1024, 768], [1440, 900]]) {
    const p = await sayfa(b, boyut); await ac(p, 'etkinlikler');
    const r = { ozet: await p.locator('.live .temalar').isVisible(), liste: await p.locator('.live .m-tema-durum').isVisible() };
    const tel = boyut[0] < 768;
    bekle(`${boyut[0]} başlamadı: tema adları ${tel ? 'özet satırında' : 'yalnız listede'}`, tel ? r.ozet && !r.liste : !r.ozet && r.liste, JSON.stringify(r));
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
  // Ortak birincilik (karar 98): ilk temada iki kare eşit puanla birinci. Kürsü (sıra 3) çıksın diye temada
  // 8 kare gerekiyor (sıralı kare sayısı = kare / 2.5): altı test üyesine iki geçici üye ekleniyor.
  const gecici = [];
  try {
    const t0 = S.temalar[0].id;
    for (const [e, ad] of [['esit-a@test.local', 'Gül Er'], ['esit-b@test.local', 'Ilgaz Su']]) {
      const k = await kullanici(e, ad); gecici.push(k.id);
      await admin.from('uyeler').upsert({ id: k.id, ad, eposta: e, hosgeldin_goruldu: true });
      const kare = await kareKoy(S.id, t0, e);
      for (const v of ['kurucu', 'baris', 'can']) await admin.from('oylar').insert({ kare, veren: await kimlik(`${v}@test.local`), puan: 1 });
    }
    const kk = (await admin.from('kareler').select('id').eq('tema', t0).eq('sahip', await kimlik('kurucu@test.local'))).data[0].id;
    const tepe = (await admin.from('kareler').select('id').eq('tema', t0).eq('sahip', await kimlik('baris@test.local'))).data[0].id;
    const tp = ((await admin.from('oylar').select('puan').eq('kare', tepe)).data ?? [])[0]?.puan;
    await admin.from('oylar').update({ puan: tp }).eq('kare', kk);
    const p = await sayfa(b, [1440, 900]); await p.evaluate(id => window.__sb.rpc('wrapped_izle', { p_etkinlik: id }), S.id);
    await ac(p, `sonuc/${S.id}`);
    const r = await p.evaluate(() => {
      const R = e => e.getBoundingClientRect();
      const kaz = [...document.querySelectorAll('.odul .kazanan')], k = document.querySelector('.kursu');
      const fig = k ? [...k.querySelectorAll('figure')] : [];
      return { n: kaz.length, kursuUst: k && Math.round(R(k).top), kazUst: kaz[0] && Math.round(R(kaz[0]).top),
        kursuAlt: fig.length && Math.round(R(fig.at(-1).querySelector('figcaption')).bottom), kazAlt: kaz[0] && Math.round(R(kaz[0].querySelector('.serit')).bottom),
        kazBoy: kaz[0] && Math.round(R(kaz[0]).height),
        kutular: fig.map(f => [R(f).height, R(f.querySelector('img')).height, R(f.querySelector('figcaption')).height].map(Math.round)) };
    });
    bekle('1440 ortak birincilik: iki kazanan ve kürsü', r.n === 2 && r.kutular.length > 0, JSON.stringify(r));
    bekle('1440 ortak birincilik: kürsü üstü ilk kazananla hizalı, altlar 1px içinde', Math.abs(r.kursuUst - r.kazUst) <= 1 && Math.abs(r.kursuAlt - r.kazAlt) <= 1, JSON.stringify(r));
    // Tek kürsü karesi tasarım gereği Birinci'nin boyuna esniyor (eşitlik yokken de); eşitlik onu iki kazananın boyuna çekmesin
    bekle('1440 ortak birincilik: kürsü ilk kazanandan uzun değil', r.kutular.reduce((a, [f]) => a + f, 0) <= r.kazBoy + 1, JSON.stringify({ kazBoy: r.kazBoy, kutular: r.kutular }));
    const d = await denetle(p); bekle('1440 ortak birincilik: denetim temiz', d.length === 0, d.join(' | '));
    if (b.browserType().name() === 'chromium') {
      const h = await p.evaluate(() => document.querySelector('.sc').scrollHeight);
      await p.setViewportSize({ width: 1440, height: Math.min(h + 40, 6000) }); await p.waitForTimeout(500);
      await p.screenshot({ path: '/tmp/cgapp/ss/sonuc-esit-1440.png' });
    }
    await p.context().close();
  } finally {
    await temizle(); kurulan.length = 0;
    for (const id of gecici) { await admin.from('uyeler').delete().eq('id', id); await admin.auth.admin.deleteUser(id) }
  }
  // Kurucunun karesi olan sonuçlanmış etkinlik kalırsa sonraki bölümlerde Wrapped açılışı araya giriyor
  await temizle(); kurulan.length = 0;
});

// ---------------------------------------------------------------- kare detayı ve büyüteç
bolum('detay', async b => {
  const S = await bitmisEtkinlik(true);
  const kare = (await admin.from('kareler').select('id').in('tema', S.temalar.map(t => t.id)).limit(1)).data[0];
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut); await p.evaluate(id => window.__sb.rpc('wrapped_izle', { p_etkinlik: id }), S.id);
    await ac(p, `sonuc/${S.id}/kare/${kare.id}`);
    const yan = await p.evaluate(() => { const f = document.querySelector('.m-detay .m-pk'), k = document.querySelector('.m-detay .kunye'); return f && k ? k.getBoundingClientRect().left > f.getBoundingClientRect().right : null });
    bekle(`${boyut[0]}: künye ${boyut[0] >= 1440 ? 'fotoğrafın yanında' : 'fotoğrafın altında'}`, boyut[0] >= 1440 ? yan === true : yan === false, String(yan));
    const d = await denetle(p); bekle(`${boyut[0]} detay: denetim temiz`, d.length === 0, d.join(' | '));
    if (process.env.CG_EKRAN && [1440, 1024].includes(boyut[0])) await p.screenshot({ path: `/tmp/cgapp/ss/detay-${boyut[0]}.png` });
    if (boyut[0] === 1440) {
      await p.locator('.m-buyut').click(); await p.waitForTimeout(400);
      bekle('Büyüt düğmesi büyüteci açtı', await p.locator('.buyutec').isVisible());
      bekle('masaüstü ipucu', (await p.textContent('.buyutec .alt')).includes('Tekerlekle büyüt'));
      const olcek = () => p.evaluate(() => { const m = getComputedStyle(document.querySelector('.buyutec img')).transform; return m === 'none' ? 1 : new DOMMatrix(m).a });
      await p.mouse.move(720, 450); await p.mouse.wheel(0, -400); await p.waitForTimeout(300);
      bekle('tekerlek büyüttü', (await olcek()) > 1.2, await olcek());
      if (process.env.CG_EKRAN) await p.screenshot({ path: '/tmp/cgapp/ss/buyutec-1440.png' });
      await p.locator('.m-kapat').click(); await p.waitForTimeout(300);
      bekle('kapat düğmesi kapattı', (await p.locator('.buyutec').count()) === 0);
      await p.locator('.m-buyut').click(); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      bekle('Esc kapattı', (await p.locator('.buyutec').count()) === 0);
    }
    await p.context().close();
  }
  await temizle(); kurulan.length = 0;
});

// ---------------------------------------------------------------- profil ve sıralama
bolum('profil', async b => {
  // Kurucunun üç karesi (Profil ızgarası) ve küçük görselli sezon sıralaması için biten etkinlik
  const P = await bitmisEtkinlik(true, true);
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut); await p.evaluate(id => window.__sb.rpc('wrapped_izle', { p_etkinlik: id }), P.id);
    await ac(p, 'profil');
    const sutun = await p.evaluate(() => { const g = document.querySelector('.grid'); return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0 });
    bekle(`${boyut[0]}: Profil kareleri ${boyut[0] >= 1600 ? 5 : boyut[0] >= 1200 ? 4 : 3} sütun`, sutun === (boyut[0] >= 1600 ? 5 : boyut[0] >= 1200 ? 4 : 3), sutun);
    if (boyut[0] >= 1200) {
      const yan = await p.evaluate(() => { const s = document.querySelector('.m-profil-ust .m-sol'), g = document.querySelector('.m-profil-ust .m-sag'); return s && g && g.getBoundingClientRect().left > s.getBoundingClientRect().right });
      bekle(`${boyut[0]}: Profil üstü iki sütun`, yan);
    }
    let d = await denetle(p); bekle(`${boyut[0]} profil: denetim temiz`, d.length === 0, d.join(' | '));
    await ac(p, 'siralama');
    if (boyut[0] >= 1440) {
      const yan = await p.evaluate(() => { const s = document.querySelector('.m-iki .m-sol'), g = document.querySelector('.m-iki .m-sag'); return s && g && g.getBoundingClientRect().left > s.getBoundingClientRect().right });
      bekle(`${boyut[0]}: Sıralama iki sütun`, yan);
    }
    const kucuk = await p.evaluate(() => { const i = document.querySelector('.row .m-pk'); return i ? Math.round(i.getBoundingClientRect().width) : 0 });
    bekle(`${boyut[0]}: sıralama satırında kare 72px`, kucuk === 72, kucuk);
    if (boyut[0] === 1440) {
      const goster = async yol => { await ac(p, yol); return p.evaluate(() => [...document.querySelectorAll('.satir-kartlari')].map(e => getComputedStyle(e).display)) };
      for (const yol of ['etkinlikler', 'profil', 'siralama']) { const g = await goster(yol); bekle(`1440 ${yol}: .satir-kartlari ızgara değil`, g.length > 0 && g.every(x => x !== 'grid'), g.join(',')) }
      await ac(p, `sonuc/${P.id}`);
      // Altı üyeyle sıra 4+ çıkmıyor (kürsü dışı liste boş): kapsayıcı yoksa kuralı bir deneme öğesiyle sınıyoruz
      const sr = await p.evaluate(() => {
        let e = document.querySelector('.satir-kartlari.m-siralar'), deneme = false;
        if (!e) { e = document.createElement('div'); e.className = 'satir-kartlari m-siralar'; document.querySelector('.sc').append(e); deneme = true }
        const d = getComputedStyle(e).display; if (deneme) e.remove(); return d;
      });
      bekle('1440 sonuç: sıra kartları (.m-siralar) ızgara', sr === 'grid', sr);
    }
    d = await denetle(p); bekle(`${boyut[0]} sıralama: denetim temiz`, d.length === 0, d.join(' | '));
    if (process.env.CG_EKRAN && [1440, 1024].includes(boyut[0])) for (const y of ['profil', 'siralama']) {
      await ac(p, y);
      const h = await p.evaluate(() => Math.max(...[...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50).map(e => e.scrollHeight)) || 0);
      await p.setViewportSize({ width: boyut[0], height: Math.min(h + 40, 6000) }); await p.waitForTimeout(500);
      await p.screenshot({ path: `/tmp/cgapp/ss/${y}-${boyut[0]}.png`, fullPage: true });
      await p.setViewportSize({ width: boyut[0], height: boyut[1] });
    }
    await p.context().close();
  }
  await temizle(); kurulan.length = 0;
});

// ---------------------------------------------------------------- oylama
// Akış tam o karenin başında mı (yuvarlama kaymayı gizlemesin)
const oturdu = (p, i) => p.evaluate(i => { const ak = document.querySelector('.akis'), k = ak.querySelectorAll('.kare')[i]; return !!k && Math.abs(ak.scrollTop - k.offsetTop) < 2 }, i);
bolum('oylama', async b => {
  const E = await acikEtkinlik('oylama');
  const T = E.temalar[0];
  // Kurucunun dışında beş üye: beş kare (yatay ve dikey karışık)
  const ids = [];
  for (const [e, f] of [['baris@test.local', 'dogru'], ['can@test.local', 'dikey'], ['deniz@test.local', 'dogru'], ['ece@test.local', 'dikey'], ['zeynep@test.local', 'dogru']]) ids.push(await kareKoy(E.id, T.id, e, f));
  const ben = await kimlik('kurucu@test.local');
  const puanim = async () => ((await admin.from('oylar').select('puan, kare').eq('veren', ben).in('kare', ids)).data ?? []);
  const sifirla = () => admin.from('oylar').delete().eq('veren', ben).in('kare', ids);
  for (const boyut of BOYUTLAR) {
    await sifirla();
    const p = await sayfa(b, boyut); await ac(p, `oyla/${T.id}`);
    const r = await p.evaluate(() => {
      const k = document.querySelector('.kare'), d = k.querySelectorAll('.m-puanlar button');
      return { dugme: d.length, kaydirici: !!k.querySelector('.kaydirici')?.offsetParent, belge: document.documentElement.scrollHeight <= innerHeight,
        panelYanda: (() => { const f = k.querySelector('.sahne').getBoundingClientRect(), pn = k.querySelector('.m-panel').getBoundingClientRect(); return pn.left >= f.right })(),
        tekSatir: new Set([...d].map(x => Math.round(x.getBoundingClientRect().top))).size,
        // Köşe işaretleri fotoğrafa otursun: resim kutusu fotoğrafın oranında (yatay ve dikey kare)
        oran: [...document.querySelectorAll('.kare .tutucu img')].map(i => { const a = i.getBoundingClientRect(); return +(a.width / a.height - i.getAttribute('width') / i.getAttribute('height')).toFixed(3) }),
        ipucu: !!k.querySelector('.m-ipucu')?.offsetParent };
    });
    bekle(`${boyut[0]}: resim kutusu fotoğrafın oranında`, r.oran.length === 5 && r.oran.every(x => Math.abs(x) < 0.02), JSON.stringify(r.oran));
    bekle(`${boyut[0]}: 10 puan düğmesi, kaydırıcı gizli, belge kaymıyor`, r.dugme === 10 && !r.kaydirici && r.belge, JSON.stringify(r));
    bekle(`${boyut[0]}: panel ${boyut[0] >= 1440 ? 'fotoğrafın yanında, 5x2' : 'altta, tek satır'}`, boyut[0] >= 1440 ? r.panelYanda && r.tekSatir === 2 : !r.panelYanda && r.tekSatir === 1, JSON.stringify(r));
    bekle(`${boyut[0]}: kısayol ipucu görünüyor`, r.ipucu);
    // düğmeyle puan: düğmeler yerinden oynamıyor
    const once = await p.evaluate(() => [...document.querySelectorAll('.kare')[0].querySelectorAll('.m-puanlar button')].map(x => Math.round(x.getBoundingClientRect().top)).join());
    await p.locator('.kare').first().locator('.m-puanlar button', { hasText: /^8$/ }).click(); await p.waitForTimeout(700);
    const sonra = await p.evaluate(() => [...document.querySelectorAll('.kare')[0].querySelectorAll('.m-puanlar button')].map(x => Math.round(x.getBoundingClientRect().top)).join());
    bekle(`${boyut[0]}: düğmeyle 8 puan yazıldı`, (await puanim()).some(x => x.puan === 8));
    bekle(`${boyut[0]}: puan verince düğmeler kaymadı`, once === sonra, `${once} → ${sonra}`);
    // klavye: 3 puan, sonra sağ ok bir sonraki kare
    await p.keyboard.press('3'); await p.waitForTimeout(600);
    bekle(`${boyut[0]}: 3 tuşu puanı 3 yaptı`, (await puanim()).some(x => x.puan === 3));
    const odak = await p.evaluate(() => { const a = document.activeElement; return !a?.closest('.m-puanlar') || a.classList.contains('on') });
    bekle(`${boyut[0]}: tuşla puan verince odak eski düğmede kalmadı`, odak);
    const y0 = await p.evaluate(() => document.querySelector('.akis').scrollTop);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
    const y1 = await p.evaluate(() => document.querySelector('.akis').scrollTop);
    bekle(`${boyut[0]}: sağ ok sonraki kareye geçti`, y1 > y0 && await oturdu(p, 1), `${y0} → ${y1}`);
    // Önceki / Sonraki: 768-1439 fotoğrafın iki yanında ok, 1440+ panelde
    const g = await p.evaluate(() => {
      const k = document.querySelectorAll('.kare')[1], s = k.querySelector('.sahne').getBoundingClientRect();
      const d = ['Önceki kare', 'Sonraki kare'].map(a => k.querySelector(`button[aria-label="${a}"]`)).filter(x => x?.offsetParent).map(x => x.getBoundingClientRect());
      return { n: d.length, icinde: d.length === 2 && d[0].left >= s.left && d[0].left - s.left < 40 && d[1].right <= s.right && s.right - d[1].right < 40,
        orta: d.length === 2 && d.every(x => Math.abs((x.top + x.bottom) / 2 - (s.top + s.bottom) / 2) < 2), panelde: d.length === 2 && !!k.querySelector('.m-panel')?.contains(document.elementFromPoint(d[0].left + 5, d[0].top + 5)) };
    });
    if (boyut[0] < 1440) bekle(`${boyut[0]}: önceki / sonraki okları fotoğraf alanının iki kenarında, ortada`, g.n === 2 && g.icinde && g.orta, JSON.stringify(g));
    else bekle(`${boyut[0]}: önceki / sonraki panelde`, g.n === 2 && !g.icinde, JSON.stringify(g));
    await p.locator('.kare').nth(1).locator('button[aria-label="Sonraki kare"]').click(); await p.waitForTimeout(900);
    bekle(`${boyut[0]}: Sonraki düğmesi tam sonraki kareye oturdu`, await oturdu(p, 2));
    const d = await denetle(p); bekle(`${boyut[0]} oylama: denetim temiz`, d.length === 0, d.join(' | '));
    if (process.env.CG_EKRAN && [1440, 1024].includes(boyut[0])) for (const i of [0, 1, 2]) {
      await p.evaluate(i => { const ak = document.querySelector('.akis'); ak.scrollTo({ top: ak.querySelectorAll('.kare')[i].offsetTop }) }, i); await p.waitForTimeout(500);
      const yon = await p.evaluate(i => { const im = document.querySelectorAll('.kare')[i].querySelector('img'); return im && im.naturalHeight > im.naturalWidth ? 'dikey' : 'yatay' }, i);
      await p.screenshot({ path: `/tmp/cgapp/ss/oylama-${boyut[0]}-${b.browserType().name()}-${i + 1}-${yon}.png` });
    }
    await p.context().close();
  }
  await kenarDurumlari(b, E, T, puanim, sifirla);   // Step 6-8
  await temizle(); kurulan.length = 0;
});

async function kenarDurumlari(b, E, T, puanim, sifirla) {
  const p = await sayfa(b, [1440, 900]); await ac(p, `oyla/${T.id}`);
  // Pencere boyu değişince aynı kare: yuvarlama değil, tam kenar (900 → 768'de kare 3, en yakın kenar olarak 4'e kayardı)
  for (const hedef of [1, 3]) {
    while (!(await oturdu(p, hedef))) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900); if (await oturdu(p, 4)) break }
    const once = await oturdu(p, hedef);
    await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(800);
    const orta = await oturdu(p, hedef);
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(800);
    bekle(`pencere daralıp genişleyince aynı kare (${hedef + 1}. kare)`, once && orta && await oturdu(p, hedef), `${once} ${orta}`);
  }

  // Kaydırma sürerken: rakam gidilen kareye yazılıyor, arka arkaya iki ok iki kare ilerletiyor
  await sifirla();
  await p.evaluate(() => document.querySelector('.akis').scrollTo({ top: 0 })); await p.waitForTimeout(600);
  const sira = await p.evaluate(() => [...document.querySelectorAll('.kare')].map(k => k.dataset.kare));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100); await p.keyboard.press('7'); await p.waitForTimeout(1200);
  const v7 = await puanim();
  bekle('ok kaydırırken 7 tuşu yeni kareye yazdı, bırakılan kare puansız', v7.length === 1 && v7[0].kare === sira[1] && v7[0].puan === 7 && await oturdu(p, 1), JSON.stringify(v7));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(80); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1500);
  bekle('hızlı iki sağ ok iki kare ilerletti', await oturdu(p, 3), String(await p.evaluate(() => document.querySelector('.akis').scrollTop)));
  // Basılı tutulan rakam yinelenmiyor (oyVer seli)
  await p.keyboard.press('5'); await p.waitForTimeout(600);
  await p.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '6', repeat: true, bubbles: true, cancelable: true }))); await p.waitForTimeout(600);
  const v5 = (await puanim()).find(x => x.kare === sira[3]);
  bekle('yinelenen tuş olayı puan vermiyor', v5?.puan === 5, JSON.stringify(v5));

  // Büyüteç açıkken rakam puan vermiyor
  await sifirla();
  await p.locator('.kare').nth(3).locator('.tutucu img').dblclick(); await p.waitForTimeout(400);
  if (await p.locator('.buyutec').count()) {
    await p.keyboard.press('5'); await p.waitForTimeout(500);
    bekle('büyüteç açıkken 5 tuşu puan vermedi', (await puanim()).length === 0);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  } else bekle('büyüteç çift tıklamayla açıldı', false);

  await p.locator('.kare').first().locator('button.cikar').click();   // kurucu yönetici: "Yarışmadan çıkar"
  // CikarPenceresi'nde gerekçe tek satırlık input (#cikar-neden)
  const alan = p.locator('[role="dialog"] textarea, [role="dialog"] input, .pencere textarea').first();
  if (await alan.count()) {
    await sifirla();
    await alan.click(); await p.keyboard.type('1 nedeni');
    await p.waitForTimeout(500);
    bekle('çıkarma gerekçesine 1 yazmak puan vermedi', (await puanim()).length === 0);
    await p.keyboard.press('Escape');
    if (await p.locator('[role="dialog"]').count()) await p.locator('[role="dialog"] button', { hasText: 'Vazgeç' }).click();
  } else bekle('çıkarma penceresinde yazı alanı bulundu', false, 'seçiciyi CikarPenceresi\'ne göre düzelt');

  // Çıkar düğmesine tıklamak akışı ilk kareye kaydırıyor: ölçü ikinci karenin kendi üstüne göre
  await p.setViewportSize({ width: 1366, height: 600 }); await p.waitForTimeout(600);
  const r = await p.evaluate(() => { const k = document.querySelectorAll('.kare')[1], ust = k.getBoundingClientRect().top;
    return [...k.querySelectorAll('.m-puanlar button')].every(x => x.getBoundingClientRect().bottom - ust <= Math.min(innerHeight, k.clientHeight)) });
  bekle('1366x600: puan düğmeleri pencerede', r);
  await p.context().close();
}

// ---------------------------------------------------------------- yükleme
// Tema sütunu .m-yuk-tema: .m-tema Profil'de kare altı tema adı (Task 5), aynı ad başka anlamla kullanılmıyor
const TEMA = id => `.m-yuk-tema[data-tema="${id}"]`;
bolum('yukleme', async b => {
  const E = await acikEtkinlik('yukleme');
  const ben = await kimlik('kurucu@test.local');
  const karem = async tema => (await admin.from('kareler').select('id, dosya').eq('tema', tema).eq('sahip', ben)).data ?? [];
  const jpg = n => fs.readFileSync(`/tmp/cgapp/${n}.jpg`).toString('base64');
  // Tarayıcı içinde dosya bırakma: DataTransfer kurulup hedefe dragenter/dragover/drop gönderiliyor
  const birak = (p, secici, dosyalar) => p.evaluate(async ([s, ds]) => {
    const dt = new DataTransfer();
    for (const [ad, b64, tur] of ds) dt.items.add(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], ad, { type: tur }));
    const h = document.querySelector(s);
    let engellendi = false;
    for (const t of ['dragenter', 'dragover', 'drop']) { const ok = h.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })); if (t === 'drop') engellendi = !ok }
    return engellendi;   // sentetik olay sayfayı terk ettirmiyor; tarayıcının varsayılanı (dosyayı açmak) engellendi mi
  }, [secici, dosyalar]);
  // Yalnız sürükleme olayı (bırakmadan); dosya: true ise içinde bir File var, değilse yalnız yazı
  const surukle = (p, secici, tur, dosya = true) => p.evaluate(([s, t, f]) => {
    const dt = new DataTransfer();
    if (f) dt.items.add(new File(['x'], 'a.jpg', { type: 'image/jpeg' })); else dt.setData('text/plain', 'yazı');
    (s ? document.querySelector(s) : document).dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [secici, tur, dosya]);
  const gorunen = (p, s) => p.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).length, s);
  {
    const p = await sayfa(b, [390, 844]); await ac(p, 'yukle');
    const r = { temalar: await gorunen(p, '.m-temalar'), kontakt: await gorunen(p, '.kontakt'), bas: await gorunen(p, '.m-govde-tel .kart-bas'), afis: await gorunen(p, '.satir-kartlari.afis') };
    bekle('390 yükleme: kontakt ve tek gövde, masaüstü listesi yok', r.temalar === 0 && r.kontakt === 1 && r.bas === 1 && r.afis === 1, JSON.stringify(r));
    await p.context().close();
  }
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut); await ac(p, 'yukle');
    const r = await p.evaluate(() => [...document.querySelectorAll('.m-alan')].map(a => { const x = a.getBoundingClientRect(); return [Math.round(x.top), Math.round(x.bottom), Math.round(x.left)] }));
    bekle(`${boyut[0]}: üç bırakma alanı`, r.length === 3, JSON.stringify(r));
    if (boyut[0] >= 1200) bekle(`${boyut[0]}: üç alan yan yana, aynı pikselde`, new Set(r.map(x => x[0] + ',' + x[1])).size === 1 && r[0][2] < r[1][2], JSON.stringify(r));
    else bekle(`${boyut[0]}: temalar alt alta`, r.length === 3 && r[0][1] <= r[1][0] && r[1][1] <= r[2][0], JSON.stringify(r));
    const g = { kontakt: await gorunen(p, '.kontakt'), tel: await gorunen(p, '.m-govde-tel'), afis: await gorunen(p, '.satir-kartlari.afis') };
    bekle(`${boyut[0]}: kontakt ve telefon gövdesi gizli, afiş görünür`, g.kontakt === 0 && g.tel === 0 && g.afis === 1, JSON.stringify(g));
    const d = await denetle(p); bekle(`${boyut[0]} yükleme: denetim temiz`, d.length === 0, d.join(' | '));
    if (boyut[0] === 1024 || boyut[0] === 1440) {
      const ss = `/tmp/cgapp/ss/yukleme-${boyut[0]}-${b.browserType().name()}`;
      await p.screenshot({ path: `${ss}-bos.png` });
      await surukle(p, null, 'dragenter'); await surukle(p, `${TEMA(E.temalar[1].id)} .m-alan`, 'dragenter'); await p.waitForTimeout(200);
      await p.screenshot({ path: `${ss}-surukle.png` });
    }
    await p.context().close();
  }
  const p = await sayfa(b, [1440, 900]); await ac(p, 'yukle');
  const [t1, t2, t3] = E.temalar;
  // dosya olmayan sürükleme (sayfadaki bir yazı ya da resim) alanları açmıyor
  await surukle(p, null, 'dragenter', false); await p.waitForTimeout(200);
  bekle('dosya olmayan sürükleme alanları açmıyor', (await p.locator('.m-birak:visible').count()) === 0);
  await surukle(p, null, 'dragleave', false);
  // sürüklerken bütün alanlar açık
  await surukle(p, null, 'dragenter'); await p.waitForTimeout(200);
  bekle('sürüklerken alanlar "Buraya bırak"', (await p.locator('.m-birak:visible').count()) === 3);
  // alanın üstü yalnız o alan; alandan çıkıp boş yere gelince işaret kalkıyor, alanlar açık kalıyor
  await surukle(p, `${TEMA(t2.id)} .m-alan`, 'dragenter'); await p.waitForTimeout(200);
  const ust1 = await p.evaluate(() => [...document.querySelectorAll('.m-alan.uzerinde')].map(a => a.closest('[data-tema]').dataset.tema));
  bekle('üstündeki alan işaretli, yalnız o', ust1.length === 1 && ust1[0] === t2.id, JSON.stringify(ust1));
  await surukle(p, '.kal', 'dragenter'); await p.waitForTimeout(200);
  bekle('alan dışında işaret kalkıyor, alanlar açık', (await p.locator('.m-alan.uzerinde').count()) === 0 && (await p.locator('.m-birak:visible').count()) === 3);
  // alan dışına bırakmak: sayfada kal, yükleme yok
  const disEngel = await birak(p, '.sc', [['dogru.jpg', jpg('dogru'), 'image/jpeg']]); await p.waitForTimeout(800);
  bekle('alan dışına bırakmak sayfada kalıyor (varsayılan engellendi), yükleme yok', disEngel === true && (await karem(t1.id)).length === 0 && (await p.locator('.m-birak:visible').count()) === 0, String(disEngel));
  // pencereden çıkınca alanlar kapanıyor
  await surukle(p, null, 'dragenter'); await surukle(p, '.kal', 'dragenter'); await surukle(p, null, 'dragleave'); await p.waitForTimeout(150);
  const acikKaldi = (await p.locator('.m-birak:visible').count()) === 3;
  await surukle(p, '.kal', 'dragleave'); await p.waitForTimeout(200);
  bekle('pencereden çıkınca alanlar kapanıyor (içeride gezerken değil)', acikKaldi && (await p.locator('.m-birak:visible').count()) === 0);
  // Sayaç şaşarsa (çıkışı gelmeyen tek giriş) alanlar açık kalıyor: tıklayıp seçmek yine çalışmalı
  await surukle(p, null, 'dragenter'); await p.waitForTimeout(200);
  const takildi = (await p.locator('.m-birak:visible').count()) === 3;
  const secildi = await Promise.all([p.waitForEvent('filechooser', { timeout: 4000 }).then(() => true, () => false),
    p.locator(`${TEMA(t1.id)} .m-alan button.bos`).click({ timeout: 4000 }).then(() => true, () => false)]);
  bekle('alanlar takılı açıkken "Kare seç" dosya seçicisini açıyor', takildi && secildi.every(Boolean), JSON.stringify({ takildi, secildi }));
  // İptal edilen sürükleme ya da pencere değişimi alanları kapatıyor
  await p.evaluate(() => window.dispatchEvent(new DragEvent('dragend', { bubbles: true }))); await p.waitForTimeout(200);
  bekle('dragend alanları kapatıyor', (await p.locator('.m-birak:visible').count()) === 0);
  await surukle(p, null, 'dragenter'); await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.waitForTimeout(200);
  bekle('pencere odağı gidince alanlar kapanıyor', (await p.locator('.m-birak:visible').count()) === 0);
  // İmleç: alan dışında "kopyala" değil, alanın üstünde kopyala
  // Sentetik DataTransfer'da dropEffect yazılamıyor (hep none): son atanan değer örnek üstünde tutuluyor
  const etki = s => p.evaluate(s => {
    const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    let son = 'atanmadı'; Object.defineProperty(dt, 'dropEffect', { get: () => son, set: v => { son = v } });
    document.querySelector(s).dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); return son;
  }, s);
  const disEtki = await etki('.kal'), icEtki = await etki(`${TEMA(t2.id)} .m-alan`);
  bekle('alan dışında bırakma etkisi none, alanda copy', disEtki === 'none' && icEtki === 'copy', `${disEtki} ${icEtki}`);
  await surukle(p, null, 'dragleave'); await p.waitForTimeout(150);
  // iki dosya: hata
  await birak(p, `${TEMA(t3.id)} .m-alan`, [['a.jpg', jpg('dogru'), 'image/jpeg'], ['b.jpg', jpg('dogru'), 'image/jpeg']]); await p.waitForTimeout(800);
  bekle('iki dosya: "Birden çok kare bıraktın. Bu temaya tek kare bırak."', (await p.textContent('.sc')).includes('Birden çok kare bıraktın. Bu temaya tek kare bırak.') && (await karem(t3.id)).length === 0);
  // serbest temaya doğru kare
  await birak(p, `${TEMA(t3.id)} .m-alan`, [['dogru.jpg', jpg('dogru'), 'image/jpeg']]); await p.waitForTimeout(4000);
  bekle('bırakılan kare serbest temaya yüklendi', (await karem(t3.id)).length === 1);
  // buluşmada temaya önce doğru, sonra tarihi tutmayan: önceki yerinde
  await birak(p, `${TEMA(t1.id)} .m-alan`, [['dogru.jpg', jpg('dogru'), 'image/jpeg']]); await p.waitForTimeout(4000);
  const ilk = (await karem(t1.id))[0]?.dosya;
  await birak(p, `${TEMA(t1.id)} .m-alan`, [['yanlis.jpg', jpg('yanlis'), 'image/jpeg']]); await p.waitForTimeout(3000);
  bekle('tarih tutmayan değiştirme reddedildi, önceki kare yerinde (karar 93)', ilk && (await karem(t1.id))[0]?.dosya === ilk && (await p.textContent('.sc')).includes('buluşma günü çekilmemiş'));
  const d = await denetle(p); bekle('1440 dolu, ret ve boş temalar: denetim temiz', d.length === 0, d.join(' | '));
  await yuklemeKenar(b, p, birak, karem, E, surukle);   // Step 8-9
  await p.context().close();
  await temizle(); kurulan.length = 0;
});

const jpg64 = n => fs.readFileSync(`/tmp/cgapp/${n}.jpg`).toString('base64');
async function yuklemeKenar(b, p, birak, karem, E, surukle) {
  const t2 = E.temalar[1];
  await birak(p, `${TEMA(t2.id)} .m-alan`, [['not.txt', btoa('merhaba'), 'text/plain']]); await p.waitForTimeout(1500);
  const metin = (await p.locator(`${TEMA(t2.id)} .hata`).textContent().catch(() => '')) ?? '';
  bekle('txt bırakmak yüklemiyor, dosya hatası gösteriyor, sayfada kalıyor', p.url().endsWith('#/yukle') && (await karem(t2.id)).length === 0 && metin.includes('Bu dosya açılamadı'), metin.slice(0, 120));
  // Alana tıklayıp seçmek: dosya seçicisi tıklanan temaya yüklüyor (seçili temaya değil)
  const [secici] = await Promise.all([p.waitForEvent('filechooser'), p.locator(`${TEMA(t2.id)} .m-alan button.bos`).click()]);
  await secici.setFiles('/tmp/cgapp/dikey.jpg'); await p.waitForTimeout(4000);
  bekle('alana tıklayıp seçilen kare o temaya yüklendi', (await karem(t2.id)).length === 1);
  // Alandaki kendi karesini sürüklemek başka alana taşımasın (Chrome resmi Files olarak sürükletiyor)
  const resimSurukle = await p.evaluate(s => { const i = document.querySelector(s); return !!i && !i.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true })) }, `${TEMA(t2.id)} .m-alan img`);
  bekle('alandaki kare sürüklenmiyor', resimSurukle);
  // Yarışmadan çıkarılan kare: telefonda Değiştir yok, masaüstünde alan da bırakma almıyor
  const t3 = E.temalar[2];
  const [cikanKare] = await karem(t3.id);
  await admin.from('diskalifiye').insert({ kare: cikanKare.id, neden: 'Başka gün çekilmiş', eden: await kimlik('kurucu@test.local') });
  await ac(p, 'yukle');
  await surukle(p, null, 'dragenter'); await p.waitForTimeout(200);
  const acik3 = await p.locator(`${TEMA(t3.id)} .m-birak`).count(), acikDiger = await p.locator('.m-birak:visible').count();
  await surukle(p, null, 'dragleave');
  await birak(p, `${TEMA(t3.id)} .m-alan`, [['dogru.jpg', jpg64('dogru'), 'image/jpeg']]); await p.waitForTimeout(3000);
  const sonra = await karem(t3.id), m3 = (await p.textContent(TEMA(t3.id))) ?? '';
  bekle('çıkarılan karenin alanı bırakma almıyor, satır aynı', acik3 === 0 && acikDiger === 2 && sonra.length === 1 && sonra[0].dosya === cikanKare.dosya
    && (await p.locator(`${TEMA(t3.id)} .hata, ${TEMA(t3.id)} .kart.ret`).count()) === 0 && m3.includes('Yarışmadan çıkarıldı'), JSON.stringify({ acik3, acikDiger, n: sonra.length }));
  for (const w of [1024, 1440]) {
    await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(300);
    await p.screenshot({ path: `/tmp/cgapp/ss/yukleme-${w}-${b.browserType().name()}-dolu.png` });
    const d = await denetle(p); bekle(`${w}: üç tema dolu, denetim temiz`, d.length === 0, d.join(' | '));
  }
  // Kur'un sınırı 40 karakter (temalar_ad_check); daha uzunu veritabanına girmiyor
  const U = await acikEtkinlik('yukleme', ['ÇOK UZUN BİR TEMA ADI KIRK KARAKTER OLUR', 'Kalabalık', 'Gölge']);
  await admin.from('etkinlikler').update({ iptal: true }).eq('id', E.id);
  for (const w of [1024, 1440]) {
    await p.setViewportSize({ width: w, height: 900 }); await ac(p, 'yukle');
    const ad = await p.textContent(`${TEMA(U.temalar[0].id)}`);
    await p.screenshot({ path: `/tmp/cgapp/ss/yukleme-${w}-${b.browserType().name()}-uzun-ad.png` });
    const d = await denetle(p); bekle(`${w}: 40 karakterlik tema adıyla denetim temiz`, d.length === 0 && ad.includes('KIRK KARAKTER OLUR'), d.join(' | '));
  }
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(300);
  const r = await p.evaluate(() => [...document.querySelectorAll('.m-alan')].map(a => Math.round(a.getBoundingClientRect().top)));
  bekle('1440: uzun ad iki satır olsa da alanların üstü hizalı', new Set(r).size === 1, JSON.stringify(r));
}

// ---------------------------------------------------------------- yönetim
bolum('yonetim', async b => {
  const E = await acikEtkinlik('oylama');
  await kareKoy(E.id, E.temalar[0].id, 'baris@test.local');
  // Karar 128 testi sayı dalına girebilsin: iki üyenin bildirimi açık (abone 0 iken hiçbir satırda sayı çıkmıyor)
  const uyeIds = await Promise.all(['baris', 'can'].map(a => kimlik(`${a}@test.local`)));
  const ep = uyeIds.map((_, i) => `https://push.example/yonetim-${i}-${b.browserType().name()}`);
  await admin.from('bildirim_abonelikleri').delete().in('endpoint', ep);
  const { error: abHata } = await admin.from('bildirim_abonelikleri').insert(uyeIds.map((u, i) => ({ kullanici: u, endpoint: ep[i], p256dh: 'x', auth: 'x' })));
  bekle('yönetim: test abonelikleri eklendi', !abHata, abHata?.message);
  try {
  for (const boyut of BOYUTLAR) {
    const p = await sayfa(b, boyut);
    for (const yol of ['asama', 'kur', 'uyeler', 'bildirim', 'havuz']) {
      await ac(p, yol);
      const d = await denetle(p); bekle(`${boyut[0]} ${yol}: denetim temiz`, d.length === 0, d.join(' | '));
      bekle(`${boyut[0]} ${yol}: rayda Yönetim'de seçili`, (await p.getAttribute('.m-ray-grup a.on', 'aria-label').catch(() => null)) === { asama: 'Aşama', uyeler: 'Üyeler', bildirim: 'Bildirim', havuz: 'Tema havuzu', kur: 'Aşama' }[yol]);
      if (boyut[0] >= 1200 && ['asama', 'kur', 'bildirim'].includes(yol)) {
        const yan = await p.evaluate(() => { const c = document.querySelectorAll('.m-yonetim-iki > *'); return c.length === 2 && c[1].getBoundingClientRect().left > c[0].getBoundingClientRect().right });
        bekle(`${boyut[0]} ${yol}: iki sütun`, yan);
      }
      if (boyut[0] === 1440 || (boyut[0] === 1024 && yol === 'asama')) {
        // .sc kendi içinde kayıyor: tam sayfa için pencereyi içeriğin boyuna açıp geri alıyoruz
        const boy = await p.evaluate(() => document.querySelector('.sc').scrollHeight + 40);
        await p.setViewportSize({ width: boyut[0], height: Math.max(boyut[1], boy) }); await p.waitForTimeout(300);
        await p.screenshot({ path: `/tmp/cgapp/ss/yonetim-${yol}-${boyut[0]}-${b.browserType().name()}.png` });
        await p.setViewportSize({ width: boyut[0], height: boyut[1] }); await p.waitForTimeout(200);
      }
    }
    // Karar 128: fotoğrafa bağlı hatırlatmalarda sayı yok; sayı dalı ulaşılabilir olduğu için sayılı satır da aranıyor
    await ac(p, 'bildirim');
    const r = await p.evaluate(() => {
      const satirlar = [...document.querySelectorAll('.satir')];
      const foto = satirlar.filter(s => /Oy vermedin|Fotoğraf yüklemedin|Tahmin oyunu/.test(s.textContent));
      const diger = satirlar.filter(s => /Buluşma günü|Tema önerebilirsin/.test(s.textContent));
      return { foto: foto.length, fotoSayili: foto.filter(s => /\d+ kişi/.test(s.textContent)).length, digerSayili: diger.filter(s => /\d+ kişi/.test(s.textContent)).length,
        baslik: /Bildirimi açık 2 kişiye/.test(document.body.textContent) };
    });
    bekle(`${boyut[0]}: fotoğrafa bağlı satırlar görünüyor`, r.foto >= 2, JSON.stringify(r));
    bekle(`${boyut[0]}: fotoğrafa bağlı hatırlatmada sayı yok (karar 128)`, r.fotoSayili === 0, JSON.stringify(r));
    bekle(`${boyut[0]}: fotoğrafsız satırda sayı var, başlıkta 2 kişi`, r.digerSayili > 0 && r.baslik, JSON.stringify(r));
    await p.context().close();
  }
  } finally { await admin.from('bildirim_abonelikleri').delete().in('endpoint', ep) }
  await temizle(); kurulan.length = 0;
});

// ---------------------------------------------------------------- wrapped
bolum('wrapped', async b => {
  const W = await bitmisEtkinlik();
  try {
    await kareKoy(W.id, W.temalar[1].id, 'kurucu@test.local', 'dikey');
    await admin.from('etkinlikler').update({ wrapped_set: 'klasik' }).eq('id', W.id);   // yeni etkinlik Kontakt setiyle açılıyor; max-height'lı .cerceve klasik sette
    // Kart 390x844'te kurulup ölçekleniyor: kart içinde pencereye bağlı birim (vh, vw...) kartı telefondan ayırır.
    // Kontakt v2 dalı kart CSS'ini yeniden yazıyor; birleşince yeni bir birim sızarsa burada yakalanır.
    {
      const BIRIM = /[0-9.]\s*(vh|dvh|svh|lvh|vw|dvw|svw|lvw|vmin|vmax)\b/;
      // İzinli: wrapped-pano.css --hw'deki min() üst sınırı; 390 genişlikte de, 768+ masaüstünde de 26px / 31px'te kalıyor
      const IZIN = [['wrapped-pano.css', '--hw:min(26px'], ['wrapped-pano.css', '.p-kapanis{--hw:min(31px']];
      const sorunlar = [];
      const masa = fs.readFileSync('src/wrapped.css', 'utf8');
      const bas = masa.indexOf('@media (min-width:768px) and (min-height:520px){');
      let d = 0, son = bas; for (let i = masa.indexOf('{', bas); i < masa.length; i++) { if (masa[i] === '{') d++; if (masa[i] === '}' && --d === 0) { son = i; break } }
      const blok = bas < 0 ? '' : masa.slice(bas, son + 1);
      for (const f of ['wrapped.css', 'wrapped-kontakt.css', 'wrapped-pano.css']) {
        const css = fs.readFileSync('src/' + f, 'utf8').replace(f === 'wrapped.css' && bas >= 0 ? blok : '\0', '');
        for (const [, sel, govde] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          for (const dekl of govde.split(';').filter(x => BIRIM.test(x))) {
            const metin = sel.trim() + '{' + dekl.trim();
            if (IZIN.some(([a, b]) => a === f && metin.includes(b))) continue;
            if (f === 'wrapped.css' && blok.includes(sel.trim()) && blok.slice(blok.indexOf(sel.trim())).split('}')[0].includes(dekl.split(':')[0].trim() + ':')) continue;
            sorunlar.push(`${f}: ${sel.trim().slice(0, 50)} { ${dekl.trim()} }`);
          }
        }
      }
      bekle('kart CSS: pencere birimi ya masaüstü blokta geçersiz kılınmış ya izinli', sorunlar.length === 0, sorunlar.join(' | '));
    }
    const resimBoy = [];
    for (const [w, h] of [[1440, 900], [1024, 768], [1920, 1080], [1366, 600]]) {
      const p = await sayfa(b, [w, h]); await ac(p, `wrapped/${W.id}`); await p.waitForTimeout(1500);
      const r = await p.evaluate(() => {
        const k = document.querySelector('.w-sahne').getBoundingClientRect(), ip = document.querySelector('.m-w-ipucu')?.getBoundingClientRect();
        return { g: Math.round(k.width), y: Math.round(k.height), oran: k.width / k.height, ust: Math.round(k.top), alt: Math.round(innerHeight - k.bottom),
          ipucuCakisiyor: ip ? ip.top < k.bottom && ip.bottom > k.top : null, ok: document.querySelectorAll('.m-w-ok').length };
      });
      bekle(`${w}x${h}: kart 390:844 oranında`, Math.abs(r.oran - 390 / 844) < 0.005, JSON.stringify(r));
      bekle(`${w}x${h}: kart pencereye sığıyor, ipucu çakışmıyor, iki ok`, r.ust >= 0 && r.alt >= 0 && r.ipucuCakisiyor === false && r.ok === 2, JSON.stringify(r));
      if (b.browserType().name() === 'chromium') await p.screenshot({ path: `/tmp/cgapp/ss/wrapped-${w}x${h}.png` });
      if (w === 1440 || (w === 1366)) {
        // Fotoğraflı bir karta (kişinin karesi) ArrowRight ile ulaş; yüksekliği kartın 390x844 kutusuna göre ölç
        let boy = null;
        for (let j = 0; j < 8 && boy == null; j++) {
          boy = await p.evaluate(() => { const im = document.querySelector('.wr .tel .cerceve img'), sh = document.querySelector('.w-sahne'); return im ? im.getBoundingClientRect().height / (sh.getBoundingClientRect().height / 844) : null });
          if (boy == null) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900) }
        }
        resimBoy.push([w, boy]);
        if (resimBoy.length === 2) bekle('fotoğraf yüksekliği kart oranında aynı (1440x900 ve 1366x600)', resimBoy.every(x => x[1] != null) && Math.abs(resimBoy[0][1] - resimBoy[1][1]) <= 2, JSON.stringify(resimBoy));
      }
      if (w === 1440) {
        bekle('Wrapped açıkken ray inert (Shift+Tab ile arkaya geçilmiyor)', await p.evaluate(() => document.querySelector('.m-ray')?.inert === true));
        const sayac = () => p.textContent('.sayac span');
        const s0 = await sayac();
        await p.mouse.click(60, 450); await p.waitForTimeout(400);
        bekle('kartın dışına tıklamak kart değiştirmiyor', (await sayac()) === s0);
        const k = await p.locator('.w-sahne').boundingBox();
        await p.mouse.click(k.x + k.width * 0.8, k.y + k.height / 2); await p.waitForTimeout(400);
        bekle('kartın sağ yarısı ilerletiyor', (await sayac()) !== s0);
        await p.locator('.m-w-ok').first().click(); await p.waitForTimeout(400);
        bekle('sol ok geri götürüyor', (await sayac()) === s0);
        await p.keyboard.press('Escape'); await p.waitForTimeout(800);
        bekle('Esc sonuçlara geçiyor (Atla)', p.url().includes(`#/sonuc/${W.id}`), p.url());
      }
      await p.context().close();
    }
    const t = await sayfa(b, [390, 844]); await ac(t, `wrapped/${W.id}`); await t.waitForTimeout(1500);
    bekle('390: oklar ve ipucu yok, kart tam ekran', (await t.locator('.m-w-ok:visible').count()) === 0 && (await t.locator('.m-w-ipucu:visible').count()) === 0 && Math.round((await t.locator('.w-sahne').boundingBox()).width) === 390);
    await t.context().close();
    // Oylama: 768-1439'da ileri/geri oku aynı çizgi dilinde (Ikon ileri = geri'nin aynası)
    const O = await acikEtkinlik('oylama');
    for (const a of ['baris', 'can']) await kareKoy(O.id, O.temalar[0].id, `${a}@test.local`);
    const q = await sayfa(b, [1024, 768]); await ac(q, `oyla/${O.temalar[0].id}`); await q.waitForTimeout(800);
    const ok = await q.evaluate(() => ({ geri: document.querySelector('.m-gez [aria-label="Önceki kare"] svg')?.innerHTML ?? '', ileri: document.querySelector('.m-gez [aria-label="Sonraki kare"] svg')?.innerHTML ?? '' }));
    bekle('oylama: Sonraki kare oku geri okunun aynası (üç çizgi)', (ok.ileri.match(/<path/g) ?? []).length === 3 && (ok.geri.match(/<path/g) ?? []).length === 3, JSON.stringify(ok));
    if (b.browserType().name() === 'chromium') await q.screenshot({ path: '/tmp/cgapp/ss/oylama-oklar-1024x768.png' });
    await q.context().close();
  } finally { await temizle(); kurulan.length = 0 }
});

// ---------------------------------------------------------------- diğer ekranlar
// Tema listesi, tahmin oyununun her hâli, paylaşım kartı, tema öner, başkasının profili
bolum('diger', async b => {
  const O = await acikEtkinlik('oylama');
  const T = O.temalar[0];
  // Tahmin oyunu altı fotoğrafçıyla açılıyor (karar 109); kurucu da havuzda olsun diye karesi var
  const kisiler = ['kurucu', 'baris', 'can', 'deniz', 'ece', 'zeynep'];
  const kareler = [];
  for (const [j, a] of kisiler.entries()) kareler.push([a, await kareKoy(O.id, T.id, `${a}@test.local`, j % 2 ? 'dikey' : 'dogru')]);
  const ben = await kimlik('kurucu@test.local');
  const gez = async (ad, yol, hazirla) => {
    for (const boyut of BOYUTLAR) {
      const p = await sayfa(b, boyut);
      if (hazirla) await hazirla(p);
      await ac(p, yol);
      const d = await denetle(p); bekle(`${boyut[0]} ${ad}: denetim temiz`, d.length === 0, d.join(' | '));
      if (process.env.CG_EKRAN && [1024, 1440].includes(boyut[0]) && b.browserType().name() === 'chromium') {
        const h = await p.evaluate(() => { const sc = document.querySelector('.sc'); return sc ? sc.scrollHeight : 0 });
        if (h > boyut[1]) { await p.setViewportSize({ width: boyut[0], height: Math.min(h + 40, 6000) }); await p.waitForTimeout(400) }
        await p.screenshot({ path: `/tmp/cgapp/ss/diger-${ad.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '')}-${boyut[0]}.png` });
      }
      await p.context().close();
    }
  };
  try {
    await gez('oyla (oylanacak)', 'oyla');
    await gez('tahmin (oylar eksik)', `tahmin/${O.id}`);
    for (const [a, k] of kareler) if (a !== 'kurucu') await admin.from('oylar').insert({ kare: k, veren: ben, puan: 7 });
    await gez('oyla (tamam, tahmin kartı)', 'oyla');
    await gez('tahmin (teklif)', `tahmin/${O.id}`);
    {
      const p = await sayfa(b, [1440, 900]); await ac(p, `tahmin/${O.id}`);
      await p.locator('button', { hasText: 'Oyunu başlat' }).click(); await p.waitForTimeout(1500);
      bekle('tahmin oyunu başladı', (await p.locator('.tahmin-foto').count()) === 1);
      await p.context().close();
    }
    await gez('tahmin (soru)', `tahmin/${O.id}`);
    {
      const p = await sayfa(b, [1440, 900]); await ac(p, 'etkinlikler');
      const hata = await p.evaluate(async id => {
        const { data } = await window.__sb.rpc('tahmin_sorularim', { p_etkinlik: id });
        for (const s of data ?? []) { const r = await window.__sb.rpc('tahmin_cevapla', { p_etkinlik: id, p_sira: s.sira, p_cevap: s.adaylar[0].uye, p_gec: false }); if (r.error) return r.error.message }
        return (data ?? []).length ? null : 'soru yok';
      }, O.id);
      bekle('tahminler gönderildi', hata === null, hata);
      await p.context().close();
    }
    await gez('tahmin (gönderildi)', `tahmin/${O.id}`);
    await admin.from('etkinlikler').update({ yukleme_biter: saat(-30), oylama_biter: saat(-1) }).eq('id', O.id);
    const izle = p => p.evaluate(id => window.__sb.rpc('wrapped_izle', { p_etkinlik: id }), O.id);
    await gez('tahmin (sonuç)', `tahmin/${O.id}`, izle);
    await gez('paylas', `paylas/${O.id}`, izle);
    await gez('oner', 'oner');
    await gez('kisi', `profil/${await kimlik('baris@test.local')}`, izle);
  } finally { await temizle(); kurulan.length = 0 }
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
