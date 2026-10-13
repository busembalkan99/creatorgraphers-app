// Ekran denetimi (Kontakt v2, karar 130): uç verilerle her kartta taşma, üst üste binme, kalem payı, boşluk, 16px ve 44px.
// Veri: davranis-wrapped-setler.mjs'in kurulumu + 3 kareli etkinlik (E3), uzun adlı ve dikey karelı etkinlik (E4), 40 kişilik etkinlik (E5),
// üç eşit birincili etkinlik (E7).
// Genişlikler: 390x844 ve 360x760 tam denetim; 320x640 ve 375x553 (iPhone SE, Safari araç çubuklarıyla) yalnız taşma, yazı çakışması
// ve kromdan uzaklık. Kişisel kart ayrıca WebKit'te (cqw lüp ölçüsü).
import fs from 'node:fs';
import { chromium, webkit } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor, depo } from './ortak.mjs';

const APP = (process.env.CG_APP ?? 'http://localhost:5180/');
const SS = '/tmp/cg-kontakt-izle/t6/denetim';
fs.mkdirSync(SS, { recursive: true });
await sifirla();

const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'],
  ['k10@test.local', 'Muhammed Mustafa Karaosmanoğlu'], ['k1@test.local', 'Selin Arı'], ['k2@test.local', 'Can Öz'],
  ['k3@test.local', 'Deniz Akın'], ['k4@test.local', 'Elif Sunar'], ['k5@test.local', 'Mert Demir'],
  ['k6@test.local', 'Pelin Er'], ['k7@test.local', 'Onur Tek'],
  ['yusuf@test.local', 'Yusuf Ak'],   // hiçbir şey yapmıyor: "sensiz geçti"
];
const U = [];
for (const [e, ad] of KISI) U.push({ ...(await kullanici(e, ad)), ad, eposta: e });
const [A] = U;
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
await admin.from('uyeler').insert(U.slice(1).map(u => ({ id: u.id, ad: u.ad, eposta: u.eposta, rol: 'uye', hosgeldin_goruldu: true })));
const Y = U[U.length - 1];
const foto = U.slice(1, -1);   // sekiz fotoğrafçı

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const DOGRU = fs.readFileSync('/tmp/cgapp/dogru.jpg'), DIKEY = fs.readFileSync('/tmp/cgapp/dikey.jpg');
const yukle = async (K, E, tema, dikey = false) => {
  const yol = `${E}/${tema}/${crypto.randomUUID()}.jpg`;
  await depo.koy(yol, dikey ? DIKEY : DOGRU, K.id);
  const r = await K.c.from('kareler').insert({ tema, dosya: yol, genislik: dikey ? 2000 : 3000, yukseklik: dikey ? 3000 : 2000, cekim_gunu: bugun }).select('id').single();
  if (r.error) throw r.error;
  return r.data.id;
};
const etkinlik = async (temalar) => {
  const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-2), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id, wrapped_set: 'kontakt' }).select('id').single()).data.id;
  const T = [];
  for (const [i, ad] of temalar.entries()) T.push((await admin.from('temalar').insert({ etkinlik: E, ad, sira: i + 1, bulusmada: true }).select('id').single()).data.id);
  return { E, T };
};

// E1: tek tema, sekiz kare (3 kare sıraya giriyor), son fotoğrafçının karesi çıkarılıyor
const { E: E1, T: [T1] } = await etkinlik(['Sokak']);
const k1 = []; for (const u of foto) k1.push(await yukle(u, E1, T1));
// E2: iki tema, uzun adlar; Portre'de ilk ikisi eşit birinci
const { E: E2, T: [T2a, T2b] } = await etkinlik(['Işık ve gölge oyunu', 'Portre fotoğrafçılığı']);
const k2a = [], k2b = [];
for (const u of foto) { k2a.push(await yukle(u, E2, T2a)); k2b.push(await yukle(u, E2, T2b)); }
// E3: üç kareli tek tema (yalnız birincisi sıraya giriyor)
const { E: E3, T: [T3] } = await etkinlik(['Gölge']);
const k3 = []; for (const u of foto.slice(0, 3)) k3.push(await yukle(u, E3, T3));
// E4: uzun tema adı, uzun isimli birinci, karesi dikey
const { E: E4, T: [T4a, T4b] } = await etkinlik(['Sokak', 'Portre fotoğrafçılığı ve sokak']);
const k4a = [], k4b = [];
for (const [j, u] of foto.slice(0, 5).entries()) { k4a.push(await yukle(u, E4, T4a, j === 0)); k4b.push(await yukle(u, E4, T4b, j === 0)); }
// E6: iki tema, ikincisinin adı kısa: tek baskılı kartta kısa başlık, baskı büyük kalmalı
const { E: E6, T: [T6a, T6b] } = await etkinlik(['Sokak', 'Işık']);
const k6a = [], k6b = [];
for (const u of foto.slice(0, 5)) { k6a.push(await yukle(u, E6, T6a)); k6b.push(await yukle(u, E6, T6b)); }
// E7: tek tema, ilk üç kare eşit puanla birinci: kartta iki baskı, üçüncünün adı notta
const { E: E7, T: [T7] } = await etkinlik(['Sokak']);
const k7 = []; for (const u of foto) k7.push(await yukle(u, E7, T7));
// E5: kişi başına tema başına tek kare (unique tema+sahip, 0001_temel.sql): 40 kişi, 40 karelik tema ve 3 karelik ikinci tema
const U40 = [];
for (let i = 0; i < 40; i++) { const e = `k40-${String(i).padStart(2, '0')}@test.local`; U40.push({ ...(await kullanici(e, `Kişi ${i}`)), eposta: e }); }
await admin.from('uyeler').insert(U40.map((u, i) => ({ id: u.id, ad: `Kişi ${i}`, eposta: u.eposta, rol: 'uye', hosgeldin_goruldu: true })));
const { E: E5, T: [T5a, T5b] } = await etkinlik(['Kalabalık', 'Küçük tema']);
const k5a = []; for (const u of U40) k5a.push(await yukle(u, E5, T5a));
const k5b = []; for (const u of U40.slice(0, 3)) k5b.push(await yukle(u, E5, T5b));

const tum = [E1, E2, E3, E4, E5, E6, E7];
await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).in('id', tum);
const sirali = [k1, k2a, k2b, k3, k4a, k4b, k6a, k6b, k7];
for (const u of U.filter(u => u !== Y)) {
  for (const E of [E1, E2, E3, E4, E6, E7]) {
    const l = (await u.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [];
    for (const k of l) {
      const j = sirali.map(x => x.indexOf(k.id)).find(x => x >= 0);
      const esit = (k2b.includes(k.id) && j <= 1) || (k7.includes(k.id) && j <= 2);
      await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: esit ? 9 : Math.max(1, 10 - j) });
    }
  }
}
{
  const oylar = [];
  for (const [vi, v] of U40.slice(0, 10).entries()) k5a.forEach((id, i) => { if (i !== vi) oylar.push({ kare: id, veren: v.id, puan: 1 + ((i * 7 + vi * 3) % 10) }); });
  const r = await admin.from('oylar').insert(oylar); if (r.error) throw r.error;
}
await A.c.rpc('kare_cikar', { p_kare: k1[k1.length - 1], p_neden: 'Buluşmaya katılmadın.' });
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.5) }).in('id', tum);

const b = await chromium.launch();
const hatalar = [];
async function kisi(eposta, hareket = 'no-preference', w = 390, h = 844) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: hareket });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(`${eposta}: ${e}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) hatalar.push(`${eposta}: ${m.text()}`); });
  await p.goto(APP);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, eposta);
  return p;
}
const ac = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2200); };
const metin = p => p.locator('.wr').innerText().then(t => t.replace(/\s+/g, ' ')).catch(() => '');
const kartAdi = p => p.locator('.wr .tel').getAttribute('data-kart');
const sag = async p => { await p.locator('.wr').click({ position: { x: Math.min(330, p.viewportSize().width - 30), y: 420 } }); await p.waitForTimeout(400); };
const kartaGit = async (p, ad, sart = async () => true) => {
  for (let j = 0; j < 8 && !((await kartAdi(p)) === ad && await sart()); j++) await sag(p);
  return (await kartAdi(p)) === ad;
};

// Sayfada ölçülen kısım. Kart içeriği (.w-ic) telefonun kromundan (.sayac, .w-kunye, .atla, .ilerleme) ayrı ölçülüyor:
// içerik sayaç yazısının 8px üstünde bitmeli, kromla üst üste binmemeli.
const OLC = (tam) => {
  const tel = document.querySelector('.wr .tel').getBoundingClientRect();
  const kutu = e => e.getBoundingClientRect();
  const yazi = e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const yazilar = [...document.querySelectorAll('.wr .w-ic *')].filter(e => yazi(e) && kutu(e).width > 0);
  const kalem = yazilar.filter(e => e.closest('.kalem-not, .kalem-buyuk, .kalem-puan'));
  const engel = [...document.querySelectorAll('.wr .serit, .wr .ac-serit, .wr .lup, .wr .k-baslik, .wr .baski img')];
  const icerik = [...document.querySelectorAll('.wr .w-ic *')].filter(e => kutu(e).width > 0 && kutu(e).height > 0 && !e.closest('.lup-sap') && (!e.children.length || e.matches('img,.serit,.ac-serit,.baski,.lup,svg')));
  const krom = [...document.querySelectorAll('.wr .sayac, .wr .sayac *, .wr .w-kunye, .wr .atla, .wr .ilerleme')].filter(e => (yazi(e) || e.matches('.ilerleme')) && kutu(e).width > 0);
  const sayac = [...document.querySelectorAll('.wr .sayac *')].filter(e => yazi(e) && kutu(e).width > 0);
  const sayacUst = sayac.length ? Math.min(...sayac.map(e => kutu(e).top)) : tel.bottom;
  const sorun = [];
  if (!sayac.length) sorun.push('sayaç yazısı bulunamadı');
  for (const e of document.querySelectorAll('.wr .ac-seritler > .ac-serit')) { const b = kutu(e); if (b.left > tel.left + 1 || b.right < tel.right - 1) sorun.push(`açılış şeridi kenara varmıyor: ${Math.round(b.left - tel.left)} / ${Math.round(b.right - tel.right)}`); }
  for (const e of yazilar) { const b = kutu(e); if (!e.closest('.serit-pencere, .ac-seritler') && (b.right > tel.right + 1 || b.left < tel.left - 1 || b.bottom > tel.bottom + 1)) sorun.push('taşıyor: ' + e.textContent.trim().slice(0, 24)); }
  for (let i = 0; i < yazilar.length; i++) for (let j = i + 1; j < yazilar.length; j++) {
    const a = yazilar[i], c = yazilar[j]; if (a.contains(c) || c.contains(a)) continue;
    const A = kutu(a), C = kutu(c);
    if (Math.min(A.right, C.right) - Math.max(A.left, C.left) > 3 && Math.min(A.bottom, C.bottom) - Math.max(A.top, C.top) > 3) sorun.push(`üst üste: ${a.textContent.trim().slice(0, 16)} × ${c.textContent.trim().slice(0, 16)}`);
  }
  for (const e of icerik) {
    const b = kutu(e);
    for (const k of krom) { const K = kutu(k); if (Math.min(b.right, K.right) - Math.max(b.left, K.left) > 1 && Math.min(b.bottom, K.bottom) - Math.max(b.top, K.top) > 1) sorun.push(`krom: ${k.textContent.trim().slice(0, 10) || k.className} × ${(e.textContent || e.tagName).trim().slice(0, 16)}`); }
    if (b.bottom > sayacUst - 8) sorun.push(`sayaca yakın (${Math.round(sayacUst - b.bottom)}px): ${(e.textContent || e.tagName).trim().slice(0, 16)}`);
  }
  // Medya (baskı, lüp, şerit, görsel) ile düğmeler arasında en az 12px; kenar yazısı kâğıdın içinde
  for (const m of [...document.querySelectorAll('.wr .w-ic .baski, .wr .w-ic .lup, .wr .w-ic .serit, .wr .w-ic .ac-serit, .wr .w-ic img')]) for (const d of document.querySelectorAll('.wr .w-ic .k-dg, .wr .w-ic .w-tekrar')) {
    if (m.contains(d) || d.contains(m)) continue;
    const M = kutu(m), D = kutu(d);
    const bosluk = Math.hypot(Math.max(M.left - D.right, D.left - M.right, 0), Math.max(M.top - D.bottom, D.top - M.bottom, 0));
    if (bosluk < 12) sorun.push(`düğmeye yakın (${Math.round(Math.max(M.top - D.bottom, D.top - M.bottom, bosluk > 0 ? bosluk : -Math.min(M.bottom - D.top, D.bottom - M.top)))}px): ${m.className || m.tagName} × ${d.textContent.trim().slice(0, 12)}`);
  }
  for (const k of document.querySelectorAll('.wr .baski .kenar')) { const K = kutu(k), B = kutu(k.closest('.baski')); const foto = k.closest('.baski').querySelector('img, .bos-foto'); if (K.right > B.right + 1 || K.left < B.left - 1 || K.bottom > B.bottom + 1 || (foto && K.top < kutu(foto).bottom - 1)) sorun.push('kenar yazısı kâğıdın ya da fotoğrafın üstünde: ' + k.textContent.trim().slice(0, 14)); }
  if (!tam) return [...new Set(sorun)];
  // Kalem payı 16px: lüpte daire (yarıçap üzerinden), baskının kâğıt payındaki numara bilerek orada
  for (const k of kalem) for (const g of engel) {
    if (g.contains(k) || k.contains(g) || k.closest('.baski') || g.closest('.baski')?.contains(k)) continue;
    const K = kutu(k), G = kutu(g);
    let d;
    if (g.classList.contains('lup')) { const cx = G.left + G.width / 2, cy = G.top + G.height / 2; const nx = Math.max(K.left, Math.min(cx, K.right)), ny = Math.max(K.top, Math.min(cy, K.bottom)); d = Math.hypot(cx - nx, cy - ny) - G.width / 2; }
    else d = Math.hypot(Math.max(G.left - K.right, K.left - G.right, 0), Math.max(G.top - K.bottom, K.top - G.bottom, 0));
    if (d < 16) sorun.push(`kalem yakın (${Math.round(d)}px): ${k.textContent.trim().slice(0, 16)}`);
  }
  // Boşluk: kart içeriğinin dikey aralıkları (üst yazıdan sayaca kadar) ekranın beşte birinden az
  const ust = document.querySelector('.wr .w-ic .k-ust');
  const aralik = icerik.map(e => [kutu(e).top, kutu(e).bottom]).sort((x, y) => x[0] - y[0]);
  let son = ust ? kutu(ust).bottom : 0, enBuyuk = 0;
  for (const [t, bo] of aralik) { enBuyuk = Math.max(enBuyuk, t - son); son = Math.max(son, bo); }
  enBuyuk = Math.max(enBuyuk, sayacUst - son);
  if (enBuyuk > tel.height / 5) sorun.push(`boşluk ${Math.round(enBuyuk)}px`);
  for (const e of document.querySelectorAll('.wr .k-alt, .wr .k-dg, .wr .w-tekrar')) if (parseFloat(getComputedStyle(e).fontSize) < 16) sorun.push('16px altı: ' + e.className);
  const tk = document.querySelector('.wr .w-tekrar'); if (tk && kutu(tk).height < 44) sorun.push('Tekrar izle 44px altı');
  return [...new Set(sorun)];
};
async function denetle(p, ad, tam = true) {
  await p.waitForTimeout(3800);
  const r = await p.evaluate(OLC, tam);
  bekle(`${ad}: taşma, çakışma, kromdan uzaklık${tam ? ', kalem payı, boşluk, boyut' : ''} temiz`, r.length === 0, r.slice(0, 4).join(' | '));
  if (r.length) await p.screenshot({ path: `${SS}/${ad.replace(/[^\wığüşöçİĞÜŞÖÇ-]+/g, '_')}.png` });
}
// Baştan sona bütün kartları gez, her birini denetle
async function gez(eposta, E, etiket, w, h, tam) {
  const p = await kisi(eposta, 'no-preference', w, h);
  await ac(p, `wrapped/${E}`);
  let ad = '';
  for (let i = 0; i < 10; i++) {
    ad = await kartAdi(p);
    await denetle(p, `${etiket}/${w}/${i}-${ad}`, tam);
    if (ad === 'kapanis') break;
    await sag(p);
  }
  bekle(`${etiket}/${w}: kapanış kartına varıldı`, ad === 'kapanis', ad);
  await p.context().close();
}

const ILK = foto[0].eposta;
// Etkinlik başına kişiler: birinci, sıraya girmeyen, karesi olmayan (oy verdi), hiç katılmayan; ayrıca ek durumlar
const KISILER = [
  ['E1', E1, [['birinci', ILK], ['girmedi', foto[6].eposta], ['cikarildi', foto[7].eposta], ['oyverdi', A.eposta], ['yoktun', Y.eposta]]],
  ['E2', E2, [['birinci', ILK], ['iki-tema-sirali', foto[1].eposta], ['iki-tema-girmedi', foto[6].eposta], ['oyverdi', A.eposta], ['yoktun', Y.eposta]]],
  ['E3', E3, [['birinci', ILK], ['girmedi', foto[2].eposta], ['oyverdi', A.eposta], ['yoktun', Y.eposta]]],
  ['E4', E4, [['birinci-dikey', ILK], ['girmedi', foto[4].eposta], ['oyverdi', A.eposta], ['yoktun', Y.eposta]]],
  ['E6', E6, [['birinci-kisa-baslik', ILK], ['girmedi', foto[4].eposta]]],
  ['E7', E7, [['uc-esit-birinci', ILK]]],
];

try {
  for (const [w, h, tam] of [[390, 844, true], [360, 760, true], [320, 640, false]]) {
    for (const [ad, E, kisiler] of KISILER)
      await Promise.all(kisiler.map(([kad, ep]) => gez(ep, E, `${ad}-${kad}`, w, h, tam)));
  }
  // iPhone SE, Safari'de araç çubukları açıkken (375x553): boşluk kuralı yok, içerik sığmalı. E5 (40 kare, üç şerit) de burada
  for (const [ad, E, kisiler] of [...KISILER, ['E5', E5, [['kalabalik', U40[0].eposta]]]])
    await Promise.all(kisiler.map(([kad, ep]) => gez(ep, E, `${ad}-${kad}`, 375, 553, false)));

  // Üç eşit birinci: iki baskı, üçüncünün adı ve puanı kalem notunda; üç ad da kartta (klasik.tsx: ad kimseyi dışarıda bırakmıyor)
  const ucAd = foto.slice(0, 3).map(u => u.ad);
  for (const [w, h] of [[390, 844], [360, 760], [375, 553]]) {
    const Q = await kisi(ILK, 'no-preference', w, h); await ac(Q, `wrapped/${E7}`);
    bekle(`E7/${w}x${h}: eşit tema kartı`, await kartaGit(Q, 'tema') && (await Q.locator('.wr .tel').getAttribute('class')).includes('kt-esit'));
    await Q.waitForTimeout(2500);
    const t = (await metin(Q)).toLocaleLowerCase('tr-TR');
    bekle(`E7/${w}x${h}: başlık "Sokak temasında 3 birinci", üç ad da kartta, iki baskı`, t.includes('sokak temasında 3 birinci') && ucAd.every(a => t.includes(a.toLocaleLowerCase('tr-TR'))) && (await Q.locator('.set-kontakt .baski').count()) === 2, t);
    bekle(`E7/${w}x${h}: kalan notu ad ve puan`, /^\S.* \d+,\d$/.test((await Q.locator('.set-kontakt .esit-kalan .kalem-not').innerText()).trim()), await Q.locator('.set-kontakt .esit-kalan').innerText());
    await Q.screenshot({ path: `${SS}/E7-uc-esit-${w}x${h}.png` });
    await Q.context().close();
  }

  // Kısa başlıklı tek baskı: baskı yüksekliği uzun başlıktaki sınırdan (100px) büyük
  for (const [w, h] of [[390, 844], [360, 760]]) {
    const Q = await kisi(ILK, 'no-preference', w, h); await ac(Q, `wrapped/${E6}`);
    bekle(`E6/${w}: tek baskılı tema kartı var`, await kartaGit(Q, 'tema', async () => (await Q.locator('.wr .tel').getAttribute('class')).includes('kt-baski')));
    await Q.waitForTimeout(1500);
    const yuk = await Q.locator('.tel.kt-baski .baski img').first().evaluate(e => e.getBoundingClientRect().height);
    bekle(`E6/${w}: kısa başlıkta baskı 100px sınırından büyük`, yuk > 110, String(yuk));
    await Q.context().close();
  }

  // Başlıkta Türkçe nokta: 1,08'de alt satırın İ noktası üst satırın tabanına değmiyor
  const P = await kisi(ILK); await ac(P, `wrapped/${E1}`);
  const lh = await P.locator('.set-kontakt .k-baslik').first().evaluate(e => parseFloat(getComputedStyle(e).lineHeight) / parseFloat(getComputedStyle(e).fontSize));
  bekle('başlık satır aralığı 1,08', Math.abs(lh - 1.08) < 0.01, String(lh));

  // Hareketi azalt: animasyon yok, baskı eğik kalıyor
  const R = await kisi(ILK, 'reduce'); await ac(R, `wrapped/${E1}`);
  await kartaGit(R, 'kursu');
  bekle('hareketi azalt: oynayan animasyon yok', (await R.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)) === 0);
  bekle('hareketi azalt: baskı eğik', (await R.locator('.set-kontakt .baski').first().evaluate(e => getComputedStyle(e).rotate)) !== 'none');
  await kartaGit(R, 'kisisel');
  bekle('hareketi azalt: lüp yerinde (kayma yok)', (await R.locator('.set-kontakt .lup-kap').first().evaluate(e => getComputedStyle(e).transform)) === 'none');
  await R.context().close();

  // Kare adresi alınamayınca baskı ve lüp boş çerçeveyle açılıyor
  await P.route('**/functions/v1/kare-adres', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await ac(P, `wrapped/${E1}`); await kartaGit(P, 'kursu');
  bekle('adres yok: kürsü baskıları boş çerçeveyle açık', (await P.locator('.set-kontakt .baski .bos-foto').count()) === 2);
  await kartaGit(P, 'kisisel');
  bekle('adres yok: lüp boş çerçeveyle açık', (await P.locator('.set-kontakt .lup .bos-foto').count()) === 1);
  await P.context().close();

  // E5: 40 kare. Açılışta en çok 12 kare ve 3 şerit, temalar kartında şerit başına en çok 6 kare
  const F = await kisi(U40[0].eposta); await ac(F, `wrapped/${E5}`);
  const ac12 = await F.locator('.set-kontakt .ac-serit img').count(), seritler = await F.locator('.set-kontakt .ac-serit').count();
  bekle('E5/açılış: en çok 12 kare, tam 3 şerit', ac12 > 0 && ac12 <= 12 && seritler === 3, `${ac12} kare, ${seritler} şerit`);
  bekle('E5/temalar: kart var', await kartaGit(F, 'temalar'));
  bekle('E5/temalar: iki şerit, şerit başına en çok 6 kare', (await F.locator('.set-kontakt .tema-serit').count()) === 2 && (await F.locator('.set-kontakt .tema-serit').evaluateAll(l => l.every(x => x.querySelectorAll('.k-kare').length <= 6 && x.querySelectorAll('.k-kare').length >= 1))));
  const seritFoto = await F.locator('.set-kontakt .tema-serit .k-kare').evaluateAll(l => ({ kare: l.length, img: l.filter(x => x.querySelector('img')).length, bos: l.filter(x => x.querySelector('.bos-foto')).length }));
  bekle('E5/temalar: şerit karelerinin hepsi fotoğraflı (imzalanmış), boş çerçeve yok', seritFoto.kare > 0 && seritFoto.img === seritFoto.kare && seritFoto.bos === 0, JSON.stringify(seritFoto));
  await denetle(F, 'E5/temalar/390', false);
  await F.context().close();

  // Sıraya girmeyen, iki temada karesi var (karar 52): lüp ilk karede, kalemle numara ve daire yok
  const G = await kisi(foto[6].eposta); await ac(G, `wrapped/${E2}`); await kartaGit(G, 'kisisel'); await G.waitForTimeout(2800);
  bekle('iki temada girmedi: iki kare, lüp var, büyük numara yok, daire yok', (await G.locator('.set-kontakt .serit .k-kare img').count()) === 2 && (await G.locator('.set-kontakt .lup').count()) === 1 && (await G.locator('.set-kontakt .kalem-buyuk').count()) === 0 && (await G.locator('.set-kontakt .kalem-daire').count()) === 0);
  await G.context().close();

  // WebKit (iPhone motoru): cqw ile kurulan lüp ölçüsü hedef karenin ortasında, sap telefonun içinde
  const wk = await webkit.launch();
  const lupOlc = async (ep, E, hedefSira, ad, kontrol) => {
    const ctx = await wk.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => hatalar.push(`webkit ${ep}: ${e}`));
    await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
    await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, ep);
    await ac(p, `wrapped/${E}`); await kartaGit(p, 'kisisel'); await p.waitForTimeout(3200);
    const t = await p.evaluate((n) => {
      const c = e => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
      const tel = document.querySelector('.wr .tel').getBoundingClientRect();
      const kareler = [...document.querySelectorAll('.set-kontakt .serit .k-kare')].filter(e => e.querySelector('img, .bos-foto'));
      const hedef = c(kareler[n]), lup = c(document.querySelector('.set-kontakt .lup'));
      const sap = document.querySelector('.set-kontakt .lup-sap').getBoundingClientRect();
      return { dx: Math.abs(hedef.x - lup.x), dy: Math.abs(hedef.y - lup.y), sapSag: sap.right - tel.right, sapSol: tel.left - sap.left, buyuk: document.querySelectorAll('.set-kontakt .kalem-buyuk').length, daire: document.querySelectorAll('.set-kontakt .kalem-daire').length };
    }, hedefSira);
    bekle(`webkit/${ad}: lüp hedef karenin ortasında (6px), sap telefonun içinde`, t.dx <= 6 && t.dy <= 6 && t.sapSag <= 0 && t.sapSol <= 0, JSON.stringify(t));
    if (kontrol) bekle(`webkit/${ad}: ${kontrol.ad}`, kontrol.f(t), JSON.stringify(t));
    await p.screenshot({ path: `${SS}/webkit-${ad}.png` });
    await ctx.close();
  };
  await lupOlc(ILK, E1, 0, 'birinci');
  await lupOlc(foto[1].eposta, E2, 1, 'iki-tema-sirali');
  await lupOlc(foto[6].eposta, E2, 0, 'iki-tema-girmedi', { ad: 'büyük numara ve daire yok', f: t => t.buyuk === 0 && t.daire === 0 });
  await wk.close();

  // Oy sorgusu düşerse Wrapped şeritsiz devam ediyor (Wrapped.tsx, "oylar okunamadı"): o yolun kaydı sayfa hatası sayılmıyor
  bekle('sayfa hatası yok', hatalar.filter(h => !/oylar/.test(h)).length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
