// Davranış testi: Wrapped (karar 39, spec 2026-09-20). Her kişisel durum (A-F) kendi
// kullanıcısıyla ekranda; her adımda ekranın söylediği ve veritabanındaki ölçülüyor.
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';

const APP = 'http://localhost:5180/';
const SS = '/tmp/cgapp/ss';
fs.mkdirSync(SS, { recursive: true });
await sifirla();

// Kurucu oy verir ama kare vermez (D). Sekiz fotoğrafçı, biri çıkarılacak (F). Yusuf hiçbir şey yapmaz (E).
const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'],
  ['k1@test.local', 'Selin Arı'], ['k2@test.local', 'Can Öz'], ['k3@test.local', 'Deniz Akın'],
  ['k4@test.local', 'Elif Sunar'], ['k5@test.local', 'Mert Demir'], ['k6@test.local', 'Pelin Er'],
  ['k7@test.local', 'Onur Tek'], ['k8@test.local', 'Kaan Uz'], ['k9@test.local', 'Tuna Kara'],
  ['yusuf@test.local', 'Yusuf Ak'],
];
const U = [];
for (const [e, ad] of KISI) U.push({ ...(await kullanici(e, ad)), ad, eposta: e });
const [A] = U; const Y = U[10];
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
await admin.from('uyeler').insert(U.slice(1).map(u => ({ id: u.id, ad: u.ad, eposta: u.eposta, rol: 'uye', hosgeldin_goruldu: true })));

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const yukle = async (K, E, tema) => {
  const yol = `${E}/${tema}/${crypto.randomUUID()}.jpg`;
  await K.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  return (await K.c.from('kareler').insert({ tema, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single()).data?.id;
};

// ------------------------------------------------ tek temalı etkinlik
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-2), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const T = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true }).select('id').single()).data.id;
const foto = U.slice(1, 10);                  // dokuz fotoğrafçı, sırayla puan alacaklar
const kare = [];
for (const u of foto) kare.push(await yukle(u, E, T));
await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).eq('id', E);
// Sıra: kare j, 10 - j puan alır. Dokuzuncu kare (Tuna) çıkarılacak.
for (const u of U.slice(0, 10)) {
  const l = (await u.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [];
  for (const k of l) await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: Math.max(1, 10 - kare.indexOf(k.id)) });
}
await A.c.rpc('kare_cikar', { p_kare: kare[8], p_neden: 'Buluşmaya katılmadın.' });
// Sekiz gün önce sonuçlanmış eski bir etkinlik: kendiliğinden açılmamalı (yedi gün penceresi)
const ESKI = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-2), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const TE = (await admin.from('temalar').insert({ etkinlik: ESKI, ad: 'Eski', sira: 1, bulusmada: true }).select('id').single()).data.id;
await yukle(foto[0], ESKI, TE);
await admin.from('etkinlikler').update({ yukleme_baslar: saat(-240), yukleme_biter: saat(-216), oylama_biter: saat(-192) }).eq('id', ESKI);

// Sunucunun gerçeği: kim kaçıncı, kim sıralamada
const sk = async K => (await K.c.rpc('sonuc_kareleri', { p_etkinlik: E })).data ?? [];
const ozet = async K => ((await K.c.rpc('wrapped_ozeti', { p_etkinlik: E })).data ?? [])[0];

const b = await chromium.launch();
const hatalar = [];
async function kisi(eposta, hareket = 'no-preference') {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: hareket });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(`${eposta}: ${e}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) hatalar.push(`${eposta}: ${m.text()}`); });
  await p.goto(APP);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, eposta);
  return p;
}
const ac = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(1800); };
const metin = p => p.locator('.wr').innerText().then(t => t.replace(/\s+/g, ' ')).catch(() => '');
const var_ = async (p, t) => (await metin(p)).toLocaleLowerCase('tr-TR').includes(t.toLocaleLowerCase('tr-TR'));
const kartAdi = p => p.locator('.wr .tel').getAttribute('data-kart');
const sag = async p => { await p.locator('.wr').click({ position: { x: 330, y: 420 } }); await p.waitForTimeout(350); };
const sol = async p => { await p.locator('.wr').click({ position: { x: 60, y: 420 } }); await p.waitForTimeout(350); };
async function olc(p, ad) {
  await p.waitForTimeout(4200);   // kartın hareketi bitsin, son hâli ölçülsün
  const r = await p.evaluate(() => {
    const tel = document.querySelector('.wr .tel').getBoundingClientRect();
    const tasma = [...document.querySelectorAll('.wr .ic *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > tel.right + 1 || b.left < tel.left - 1); }).map(e => e.className).slice(0, 3);
    const kucuk = [...document.querySelectorAll('.wr button')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height < 44; }).map(e => e.textContent.trim()).slice(0, 3);
    return { tasma, kucuk };
  });
  bekle(`${ad}: taşma yok`, r.tasma.length === 0, JSON.stringify(r.tasma));
  bekle(`${ad}: 44px altı düğme yok`, r.kucuk.length === 0, JSON.stringify(r.kucuk));
  await p.screenshot({ path: `${SS}/${ad}.png` });
}
async function kisiselKartaGit(p) {
  for (let j = 0; j < 8 && (await kartAdi(p)) !== 'kisisel'; j++) await sag(p);
  return (await kartAdi(p)) === 'kisisel';
}

try {
  // ------------------------------------------------ 0. yedi günden eski sonuç kendiliğinden açılmıyor
  const P = await kisi(A.eposta);
  await ac(P, 'etkinlikler'); await P.waitForTimeout(1500);
  bekle('0: sekiz gün önce sonuçlanan etkinlik kendiliğinden açılmıyor', !P.url().includes('#/wrapped/'), P.url());
  // Oylama sürerken Wrapped adresi açılırsa sonuç ekranına yönleniyor
  await ac(P, `wrapped/${E}`);
  bekle('0: sonuç açılmadan Wrapped yok, sonuç ekranına yönleniyor', P.url().includes(`#/sonuc/${E}`), P.url());
  await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);

  // ------------------------------------------------ 1. kendiliğinden açılış, bir kez
  await ac(P, 'etkinlikler');
  await P.waitForTimeout(1500);
  bekle('1: sonuç açıldıktan sonra ilk girişte Wrapped açılıyor', P.url().includes(`#/wrapped/${E}`), P.url());
  bekle('1: ilk kart açılış', (await kartAdi(P)) === 'acilis');
  const o = await ozet(A);
  const rulolar = await P.locator('.k1 .rulo').evaluateAll(l => l.map(r => r.firstElementChild.textContent));
  bekle('1: açılış sayıları sunucudan', JSON.stringify(rulolar) === JSON.stringify([String(o.kisi), String(o.kare), String(o.puan)]), `${JSON.stringify(rulolar)} / ${JSON.stringify(o)}`);
  bekle('1: çıkarılan kare sayılmıyor (8 kare, 8 kişi)', Number(o.kare) === 8 && Number(o.kisi) === 8, JSON.stringify(o));
  await olc(P, '70-wrapped-acilis');

  // ------------------------------------------------ 2. kart kümesi ve gezinme
  const siralar = [];
  for (let j = 0; j < 7; j++) { siralar.push(await kartAdi(P)); if (j < 6) await sag(P); }
  bekle('2: tek temalı etkinlikte beş kart: açılış, tema, kürsü, kişisel, kapanış',
    JSON.stringify(siralar.slice(0, 5)) === JSON.stringify(['acilis', 'tema', 'kursu', 'kisisel', 'kapanis']), JSON.stringify(siralar));
  bekle('2: son kartta sağa dokunmak bir şey yapmıyor', siralar[5] === 'kapanis' && siralar[6] === 'kapanis');
  bekle('2: sona gelince izlendi yazıldı', (await ozet(A)).izlendi === true);
  bekle('2: son kartta atla yerine kapat', (await P.locator('.wr .atla').textContent()) === 'Kapat');
  await sol(P);
  bekle('2: sola dokunmak geri götürüyor', (await kartAdi(P)) === 'kisisel');
  bekle('2: ilerleme çubuğu kaçıncı kartta olduğunu söylüyor', (await P.locator('.wr .ilerleme i.w-d').count()) === 4);
  bekle('2: sayaç 04 / 05', (await P.locator('.wr .sayac span').first().textContent()) === '04 / 05');
  // Kaydırmak da aynı işi yapıyor
  await P.mouse.move(300, 420); await P.mouse.down(); await P.mouse.move(80, 420, { steps: 6 }); await P.mouse.up(); await P.waitForTimeout(400);
  bekle('2: sola kaydırınca ileri', (await kartAdi(P)) === 'kapanis', await kartAdi(P));
  await olc(P, '74-wrapped-kapanis');
  await P.getByRole('button', { name: 'Tekrar izle' }).click(); await P.waitForTimeout(500);
  bekle('2: tekrar izle başa götürüyor', (await kartAdi(P)) === 'acilis');
  for (let j = 0; j < 3; j++) await sol(P);
  bekle('2: ilk kartta sola dokunmak bir şey yapmıyor', (await kartAdi(P)) === 'acilis');
  // Tema kartı: kazanan sunucudakiyle aynı
  await sag(P);
  const kaz = (await sk(A)).find(k => k.sira === 1);
  bekle('2: tema kartında kazanan doğru', (await var_(P, kaz.sahip_ad.split(' ')[0])) && (await P.locator('.k2 .puan-kutu').textContent()) === Number(kaz.ortalama).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), (await metin(P)).slice(0, 200));
  await olc(P, '71-wrapped-tema');
  await sag(P);
  const ikinci = (await sk(A)).filter(k => k.sirali && (k.sira === 2 || k.sira === 3)).map(k => k.sira);
  bekle('2: kürsüde ikinci ve üçüncü', JSON.stringify(await P.locator('.k3 .w-no').allTextContents()) === JSON.stringify(ikinci.sort().map(x => String(x).padStart(2, '0'))), JSON.stringify(await P.locator('.k3 .w-no').allTextContents()));
  await olc(P, '72-wrapped-kursu');
  await sag(P);
  // D · kare yok, oy var
  bekle('D: oy verdin kartı', await var_(P, 'oy verdin') && (await P.locator('.kisi .dev').textContent()) === String((await ozet(A)).benim_oyum), (await metin(P)).slice(0, 200));
  bekle('D: bütün kareleri puanladın', await var_(P, 'Bütün kareleri puanladın'));
  await olc(P, '73-wrapped-D');
  // Kapat → sonuç ekranı, kendiliğinden bir daha açılmıyor
  await P.getByRole('button', { name: 'Atla' }).click(); await P.waitForTimeout(1500);
  bekle('D: atla sonuç ekranına götürüyor', P.url().includes(`#/sonuc/${E}`), P.url());
  bekle('sonuç ekranında tekrar izle düğmesi', (await P.getByRole('button', { name: 'Sonuç açılışını tekrar izle' }).count()) === 1);
  await ac(P, 'etkinlikler'); await P.waitForTimeout(1500);
  bekle('izlendikten sonra kendiliğinden açılmıyor', !P.url().includes('#/wrapped/'), P.url());

  // ------------------------------------------------ A · temayı kazandın
  const W = foto[0];
  const PW = await kisi(W.eposta);
  await ac(PW, `wrapped/${E}`);
  bekle('A: kişisel karta ulaşıldı', await kisiselKartaGit(PW));
  bekle('A: temayı sen kazandın (karar 111)', await var_(PW, 'Temayı sen kazandın') && await var_(PW, 'Sokak temasının birincisi') && (await PW.locator('.kisi .no-kutu').textContent()) === '01', (await metin(PW)).slice(0, 220));
  bekle('A: tek temada tek kare, yan yana yok', (await PW.locator('.kisi .iki-kare').count()) === 0);
  await olc(PW, '75-wrapped-A');
  // B · sıralamaya girdin (ikinci)
  const PR = await kisi(foto[1].eposta);
  await ac(PR, `wrapped/${E}`);
  await kisiselKartaGit(PR);
  bekle('B: sıralamaya girdin ve sırası', await var_(PR, 'Sokak temasında sıralamaya girdin') && (await PR.locator('.kisi .no-kutu').textContent()) === '02', (await metin(PR)).slice(0, 220));
  // C · sıralamaya girmedi (beşinci): puanı yalnız kendisine
  const PC = await kisi(foto[4].eposta);
  await ac(PC, `wrapped/${E}`);
  await kisiselKartaGit(PC);
  const cBen = (await sk(foto[4])).find(k => k.benim);
  bekle('C: sıralamaya girmedi, puanı yalnız sana', await var_(PC, 'yalnız sen görüyorsun') && (await PC.locator('.kisi .sari-etiket b').textContent()) === Number(cBen.ortalama).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), (await metin(PC)).slice(0, 220));
  bekle('C: sıra kutusu yok, temadaki kare sayısı var', (await PC.locator('.kisi .no-kutu').count()) === 0 && await var_(PC, 'Temada 8 kare vardı'));
  await olc(PC, '76-wrapped-C');
  // F · karesi çıkarılan
  const PF = await kisi(foto[8].eposta);
  await ac(PF, `wrapped/${E}`);
  await kisiselKartaGit(PF);
  bekle('F: karen yarışmada yok, nedeniyle', await var_(PF, 'yarışmada yok') && await var_(PF, 'Buluşmaya katılmadın.'), (await metin(PF)).slice(0, 220));
  bekle('F: kutlama yok', !(await var_(PF, 'kazandın')) && !(await var_(PF, 'sıralamaya girdin')));
  await olc(PF, '77-wrapped-F');
  // Başka kimse F'nin nedenini görmüyor
  bekle('F: nedeni başkasının Wrapped\'inde yok', !(await var_(PR, 'Buluşmaya katılmadın')));
  // E · hiç katılmadın
  const PY = await kisi(Y.eposta);
  await ac(PY, `wrapped/${E}`);
  await kisiselKartaGit(PY);
  bekle('E: bu etkinlik sensiz geçti', await var_(PY, 'sensiz geçti') && (await PY.locator('.kisi .dev').textContent()) === '8', (await metin(PY)).slice(0, 220));
  await olc(PY, '78-wrapped-E');
  // Atla izlendiyi yazıyor
  await PY.getByRole('button', { name: /Atla|Kapat/ }).click(); await PY.waitForTimeout(1200);
  bekle('E: atlamak da izlendi yazıyor', (await ozet(Y)).izlendi === true);

  // ------------------------------------------------ hareketi azalt
  const PH = await kisi(foto[2].eposta, 'reduce');
  await ac(PH, `wrapped/${E}`);
  await PH.waitForTimeout(300);
  const oynayan = await PH.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
  bekle('hareketi azalt: hiçbir kart oynamıyor', oynayan === 0, String(oynayan));
  bekle('hareketi azalt: açılış sayıları hemen yerinde', (await PH.locator('.k1 .rulo').first().evaluate(r => getComputedStyle(r).transform)) === 'none');

  // ------------------------------------------------ iki temalı etkinlik: tema tema kartı
  const E2 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-50), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
  const T2 = (await admin.from('temalar').insert([
    { etkinlik: E2, ad: 'Gece', sira: 1, bulusmada: true }, { etkinlik: E2, ad: 'Pencere', sira: 2, bulusmada: false },
  ]).select('id, sira')).data.sort((x, y) => x.sira - y.sira);
  for (const u of foto.slice(0, 4)) for (const t of T2) await yukle(u, E2, t.id);
  await admin.from('etkinlikler').update({ yukleme_biter: saat(-40) }).eq('id', E2);
  for (const u of U.slice(0, 5)) {
    const l = (await u.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [];
    for (const [j, k] of l.entries()) await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: 1 + (j % 9) });
  }
  await admin.from('etkinlikler').update({ oylama_biter: saat(-30) }).eq('id', E2);
  await ac(P, `wrapped/${E2}`);
  const s2 = [];
  for (let j = 0; j < 6; j++) { s2.push(await kartAdi(P)); await sag(P); }
  bekle('iki tema: altı kart, tema tema kartıyla', JSON.stringify(s2) === JSON.stringify(['acilis', 'tema', 'tema', 'temalar', 'kisisel', 'kapanis']), JSON.stringify(s2));
  await ac(P, `wrapped/${E2}`);
  for (let j = 0; j < 3; j++) await sag(P);
  bekle('iki tema: blok sayısı kare sayısı kadar', (await P.locator('.k4 .cubuk').first().locator('i').count()) === 4);
  bekle('iki tema: ortalama değil en yüksek puan (karar 52)', await var_(P, 'en yüksek') && !(await var_(P, 'ort.')));
  await olc(P, '79-wrapped-temalar');

  // ------------------------------------------------ klavye ve geri kaydırma
  await ac(P, `wrapped/${E}`);
  // Odak elle verilmiyor: Wrapped açılır açılmaz oklar çalışmalı
  await P.keyboard.press('ArrowRight'); await P.waitForTimeout(300);
  bekle('klavye: sağ ok ileri', (await kartAdi(P)) === 'tema');
  await P.keyboard.press('ArrowLeft'); await P.waitForTimeout(300);
  bekle('klavye: sol ok geri', (await kartAdi(P)) === 'acilis');
  await sag(P); await sag(P);
  await P.mouse.move(80, 420); await P.mouse.down(); await P.mouse.move(300, 420, { steps: 6 }); await P.mouse.up(); await P.waitForTimeout(400);
  bekle('sağa kaydırınca geri', (await kartAdi(P)) === 'tema', await kartAdi(P));
  // Kapanıştaki "Sonuçlara geç" ve sonuç ekranındaki "tekrar izle"
  for (let j = 0; j < 5; j++) await sag(P);
  await P.getByRole('button', { name: 'Sonuçlara geç' }).click(); await P.waitForTimeout(1500);
  bekle('kapanış: sonuçlara geç sonuç ekranına götürüyor', P.url().includes(`#/sonuc/${E}`), P.url());
  await P.getByRole('button', { name: 'Sonuç açılışını tekrar izle' }).click(); await P.waitForTimeout(1800);
  bekle('sonuç ekranından tekrar izlenebiliyor', P.url().includes(`#/wrapped/${E}`) && (await kartAdi(P)) === 'acilis', P.url());

  // ------------------------------------------------ yükleme hatası: "geliyor"da asılı kalmıyor
  const hataOnce = hatalar.length
  await P.route('**/rest/v1/rpc/wrapped_ozeti*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deneme"}' }));
  await ac(P, `wrapped/${E}`);
  bekle('hata: yüklenemezse hata yazıyor', !(await var_(P, 'Sonuçlar geliyor')) && (await var_(P, 'ters gitti') || await var_(P, 'Bağlantı')), (await metin(P)).slice(0, 120));
  await P.unroute('**/rest/v1/rpc/wrapped_ozeti*');
  hatalar.splice(hataOnce)   // zorlanan 500'ün kaydı; başka hiçbir hata süzülmüyor

  // ------------------------------------------------ ortak birincilik, kimsenin oylamadığı tema, puansız kare
  // Gece: dört kare, ilk ikisi eşit 9 (ortak birinci), üçüncüsü 5, dördüncüsüne kimse puan vermiyor.
  // Pencere: tek kare, kimse oylamıyor (temanın kartı açılmamalı).
  const E3 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-2), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
  const [G, PE] = (await admin.from('temalar').insert([
    { etkinlik: E3, ad: 'Gece', sira: 1, bulusmada: true }, { etkinlik: E3, ad: 'Pencere', sira: 2, bulusmada: false },
  ]).select('id, sira')).data.sort((x, y) => x.sira - y.sira);
  const g = [];
  for (const u of foto.slice(0, 4)) g.push(await yukle(u, E3, G.id));
  await yukle(foto[4], E3, PE.id);
  await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).eq('id', E3);
  for (const u of U.slice(0, 10)) {
    for (const [j, k] of g.entries()) {
      if (j === 3) continue;                                  // dördüncü kareye kimse puan vermiyor
      await u.c.from('oylar').insert({ kare: k, veren: u.id, puan: j < 2 ? 9 : 5 });   // kendi karesine tetik reddediyor
    }
  }
  await admin.from('etkinlikler').update({ oylama_biter: saat(-0.05) }).eq('id', E3);
  const sk3 = (await A.c.rpc('sonuc_kareleri', { p_etkinlik: E3 })).data ?? [];
  bekle('ortak: sunucuda iki birinci (kontrol)', sk3.filter(k => k.sira === 1).length === 2, JSON.stringify(sk3.map(k => k.sira)));
  await ac(P, `wrapped/${E3}`);
  const s3 = [];
  for (let j = 0; j < 5; j++) { s3.push(await kartAdi(P)); await sag(P); }
  bekle('oylanmayan temanın kartı açılmıyor', JSON.stringify(s3) === JSON.stringify(['acilis', 'tema', 'temalar', 'kisisel', 'kapanis']), JSON.stringify(s3));
  await ac(P, `wrapped/${E3}`); await sag(P);
  bekle('ortak: tema kartı ortak birinci, iki kare', await var_(P, 'Ortak') && await var_(P, 'eşit puan aldı') && (await P.locator('.k2 .cerceve img, .k2 .cerceve .bos-foto').count()) === 2, (await metin(P)).slice(0, 200));
  await olc(P, '80-wrapped-ortak');
  const P0 = await kisi(foto[0].eposta);
  await ac(P0, `wrapped/${E3}`); await kisiselKartaGit(P0);
  bekle('ortak: kişisel kart ortak birinci oldun', await var_(P0, 'birinci oldun') && await var_(P0, 'Gece temasında ortak birinci oldun'), (await metin(P0)).slice(0, 220));
  const P3 = await kisi(foto[3].eposta);
  await ac(P3, `wrapped/${E3}`); await kisiselKartaGit(P3);
  bekle('C: kimsenin puan vermediği kare', await var_(P3, 'Bu kareye kimse puan vermemiş') && await var_(P3, 'Puan yok'), (await metin(P3)).slice(0, 220));
  const P4 = await kisi(foto[4].eposta);
  await ac(P4, `wrapped/${E3}`); await kisiselKartaGit(P4);
  bekle('C: kimsenin oylamadığı tema', await var_(P4, 'Bu temayı kimse oylamamış'), (await metin(P4)).slice(0, 220));

  // ------------------------------------------------ B: birden çok temada sıralamaya girdin
  // İki tema, her birinde beş kare (5 / 2,5 → iki kare sıralamada). Mert iki temada da ikinci.
  const E4 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-2), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
  const T4 = (await admin.from('temalar').insert([
    { etkinlik: E4, ad: 'Sis', sira: 1, bulusmada: true }, { etkinlik: E4, ad: 'Duvar', sira: 2, bulusmada: false },
  ]).select('id, sira')).data.sort((x, y) => x.sira - y.sira);
  const sahip4 = {};
  for (const t of T4) for (const u of foto.slice(4, 9)) sahip4[await yukle(u, E4, t.id)] = u.id;
  await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).eq('id', E4);
  const birinci4 = foto[8].id, ikinci4 = foto[4].id;
  for (const u of U.slice(0, 10)) for (const [k, sid] of Object.entries(sahip4))
    await u.c.from('oylar').insert({ kare: k, veren: u.id, puan: sid === birinci4 ? 10 : sid === ikinci4 ? 8 : 3 });
  await admin.from('etkinlikler').update({ oylama_biter: saat(-0.02) }).eq('id', E4);
  const PM = await kisi(foto[4].eposta);
  await ac(PM, `wrapped/${E4}`); await kisiselKartaGit(PM);
  bekle('B: iki temada sıralamaya girdin', await var_(PM, 'İki temada sıralamaya girdin') && (await PM.locator('.kisi .no-kutu').textContent()) === '02', (await metin(PM)).slice(0, 220));
  // Karar 114: iki temanın karesi yan yana, altlarında tema ve sonuç
  const ikiKare = async P2 => P2.locator('.kisi .iki-kare > div').evaluateAll(l => l.map(d => ({
    alt: d.querySelector('.iki-kare-alt')?.textContent.trim(), foto: !!d.querySelector('img, .bos, .yer, [class*=foto]'),
  })));
  const m2 = await ikiKare(PM);
  bekle('B: iki kare yan yana, her birinin altında tema ve sıra', m2.length === 2 && m2.map(x => x.alt).sort().join('|') === 'Duvar · 02|Sis · 02', JSON.stringify(m2));
  bekle('B: iki karede etiket temayı değil ayı söylüyor', !(await var_(PM, 'Sen / Sis')) && !(await var_(PM, 'Sen / Duvar')));
  const PB = await kisi(foto[8].eposta);
  await ac(PB, `wrapped/${E4}`); await kisiselKartaGit(PB);
  const m3 = await ikiKare(PB);
  bekle('A: iki temayı kazanan: iki kare, ikisi de birinci', m3.length === 2 && m3.every(x => x.alt.endsWith('· birinci')), JSON.stringify(m3));
  bekle('A: iki temayı kazanan metinde de iki tema', await var_(PB, 'İki temayı sen kazandın') && await var_(PB, 'Sis ve Duvar temalarının birincisi'), (await metin(PB)).slice(0, 220));
  await PB.screenshot({ path: `${SS}/wr-iki-kare.png` });

  // ------------------------------------------------ kendiliğinden açılmada ağ hatası: ana ekran bozulmuyor, sonra yeniden deneniyor
  // E4 en yeni sonuç, Yusuf onu izlemedi. İstek ilk girişte 500 dönüyor; sayfa YENİLENMEDEN
  // tazelenince açılmalı (yenilemek bellekteki kümeyi sıfırlar, test boşa çıkardı).
  {
    const ctxQ = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const PQ = await ctxQ.newPage();
    const qHata = [];
    PQ.on('pageerror', e => qHata.push(String(e)));
    await PQ.route('**/rest/v1/rpc/wrapped_ozeti*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deneme"}' }));
    await PQ.goto(APP + '#/etkinlikler');
    await PQ.waitForFunction(() => window.__sb);
    await PQ.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, Y.eposta);
    await PQ.waitForTimeout(2500);
    bekle('ağ hatası: ana ekranda kalıyor', !PQ.url().includes('#/wrapped/') && (await PQ.locator('.ev').count()) > 0, PQ.url());
    bekle('ağ hatası: yakalanmamış hata yok', qHata.length === 0, qHata.slice(0, 2).join(' | '));
    await PQ.unroute('**/rest/v1/rpc/wrapped_ozeti*');
    await PQ.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await PQ.waitForTimeout(2500);
    bekle('ağ hatası: sonraki tazelemede yeniden deneyip açılıyor', PQ.url().includes(`#/wrapped/${E4}`), PQ.url());
    await ctxQ.close();
  }

  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} finally {
  await b.close();
}
rapor();
