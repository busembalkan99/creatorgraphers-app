// Telefon kabuğu: uygulamanın çerçevesi doğru mu.
// Bu dosya Buse'nin gözüyle yakaladığı kusurlar yüzünden var. Üçü de ölçülebilirdi:
// belge kayıyordu, sekme çubuğu ekranın alt kenarına oturmuyordu, seçili sekmenin
// dolgusu güvenli alanı doldurmuyordu. Bir daha gözle yakalanmasınlar.
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, bekle, rapor } from './ortak.mjs';

const APP = 'http://localhost:5180/';
const KOK = new URL('..', import.meta.url).pathname;
const oku = y => fs.readFileSync(KOK + y, 'utf8');

// ---------------------------------------------------------------- durgun kontroller
{
  const html = oku('index.html');
  const css = oku('src/index.css');
  const manifest = JSON.parse(oku('public/manifest.webmanifest'));

  bekle('viewport-fit=cover var', /viewport-fit=cover/.test(html));
  // Tarayıcı çubukları ile uygulama arasında dikiş olmasın: theme-color, gövde ve manifest
  // aynı rengi, grenli zeminin görünen rengini (#0D0D0E) söylemeli
  const tema = html.match(/name="theme-color" content="(#[0-9A-Fa-f]{6})"/)?.[1];
  bekle('theme-color grenli zeminin görünen rengi', tema === '#0D0D0E', tema);
  bekle('görünen zemin değişkeni theme-color ile aynı', new RegExp(`--gorunen:${tema}`).test(css.replace(/\s+/g, '')));
  bekle('gövde zemini görünen renkte', /body\{background:var\(--gorunen\)/.test(css.replace(/\s+/g, '')));
  bekle('manifest renkleri theme-color ile aynı', manifest.theme_color === tema && manifest.background_color === tema,
    `${manifest.theme_color} ${manifest.background_color}`);
  bekle('kabuk yüksekliği ölçülen ekrandan', /body\{height:100dvh;height:var\(--ekran,100dvh\)\}/.test(css.replace(/\s+/g, '')),
    css.split('\n').filter(l => l.includes('100dvh')).join(' | '));
  bekle('ekran yüksekliği index.html içinde ölçülüyor', /--ekran/.test(html) && /window\.innerHeight/.test(html));
  bekle('belge kaydırması kapalı', /html,body\{overflow:hidden/.test(css.replace(/\s+/g, '')));
  // vh, iOS'ta adres çubuğu gizliymiş gibi hesaplanıyor: kabuk ölçüsünde kullanılmamalı
  const vhler = css.split('\n').filter(l => /[^d]vh\b/.test(l) && !l.trim().startsWith('/*') && !l.includes('dvh'));
  bekle('kabuk ölçüsünde çıplak vh yok', vhler.length === 0, vhler.join(' | '));
  bekle('üst künye yapışkan', /\.tepe\{[^}]*position:sticky/.test(css.replace(/\s+/g, '')));
  // iOS, yatayı auto kalan dikey kaydırma alanını içerik sığsa da sağa sola esnetiyor;
  // Chromium bunu göstermediği için tarayıcıda değil kuralda denetleniyor
  for (const sinif of ['sc', 'akis']) {
    const kural = (css.replace(/\s+/g, '').match(new RegExp(`\\.${sinif}\\{[^}]*\\}`)) ?? [''])[0];
    bekle(`.${sinif}: yatay kaydırma kapalı`, kural.includes('overflow-x:hidden'), kural);
  }
  // Sayfa yakınlaştırması kapalı (Buse, 2026-09-18); yakından bakmak yalnız büyüteçte
  const duz = css.replace(/\s+/g, '');
  bekle('.sc: yalnız dikey kaydırma', /\.sc\{[^}]*touch-action:pan-y;/.test(duz));
  bekle('sayfa kökünde iki parmak yakınlaştırması kapalı', /html\{[^}]*touch-action:pan-xpan-y/.test(duz));
  bekle('büyüteç dışında hiçbir yerde pinch-zoom yok', !duz.replace(/\/\*.*?\*\//g, '').includes('pinch-zoom'));
  bekle('viewport yakınlaştırmayı kapatıyor', /maximum-scale=1/.test(html) && /user-scalable=no/.test(html));
  bekle('Safari iki parmak jesti durduruluyor',
    /addEventListener\('gesturestart', durdur, \{ passive: false \}\)/.test(html) && /function durdur\(e\) \{ e\.preventDefault\(\); \}/.test(html));
  bekle('büyüteç jesti kendisi sayıyor', /\.buyutec\{[^}]*touch-action:none/.test(duz));
  bekle('eski kaydırma özelliği yok', !css.includes('-webkit-overflow-scrolling'));
  bekle('üst künyede güvenli alan payı', /\.tepe\{[^}]*env\(safe-area-inset-top\)/.test(css.replace(/\s+/g, '')));
  // Pay kapta olursa seçili sekmenin dolgusu alt kenara inmiyor
  bekle('alt çubukta güvenli alan payı düğmenin içinde',
    /\.tabsbutton\{[^}]*padding-bottom:env\(safe-area-inset-bottom\)/.test(css.replace(/\s+/g, '')),
    css.split('\n').filter(l => l.includes('safe-area-inset-bottom')).join(' | '));


  // Link önizlemesi ve simgeler
  for (const [ad, etiket] of [['og:image', 'link kartı'], ['og:title', 'başlık'], ['og:description', 'açıklama'], ['og:url', 'adres']])
    bekle(`link kartı: ${etiket} etiketi var`, new RegExp(`property="${ad}"`).test(html));
  bekle('link kartı mutlak adres', /property="og:image" content="https:\/\//.test(html));
  bekle('twitter kartı büyük görselli', /name="twitter:card" content="summary_large_image"/.test(html));
  for (const d of ['link-karti.jpg', 'ikon-32.png', 'ikon-180.png', 'ikon-192.png', 'ikon-512.png'])
    bekle(`${d} dosyası var`, fs.existsSync(KOK + 'public/' + d));
  bekle('manifest simgeleri var olan dosyalar',
    manifest.icons.every(i => fs.existsSync(KOK + 'public/' + i.src)), JSON.stringify(manifest.icons.map(i => i.src)));
  bekle('gizlilik sayfasının İngilizce bölümü kendi dilini söylüyor',
    /<section lang="en">/.test(oku('public/privacy/index.html')));
}

// ---------------------------------------------------------------- tarayıcıda
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const hatalar = [];
p.on('pageerror', e => hatalar.push(String(e)));
await p.goto(APP);
await p.waitForFunction(() => window.__sb);

// Kapak: oturum açılmadan
const window0 = 844;
{
  const r = await p.evaluate(() => ({
    belgeKayar: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    kunye: !!document.querySelector('.tepe'),
    ekran: getComputedStyle(document.documentElement).getPropertyValue('--ekran').trim(),
    gercek: window.innerHeight + 'px',
    kabuk: Math.round(document.querySelector('.app').getBoundingClientRect().height),
  }));
  bekle('kapakta belge kaymıyor', !r.belgeKayar);
  bekle('kapakta künye var', r.kunye);
  bekle('ekran yüksekliği ölçülüp yazılmış', r.ekran === r.gercek, `${r.ekran} / ${r.gercek}`);
  bekle('kabuk tam ekran yüksekliğinde', r.kabuk === window0, `${r.kabuk} / ${window0}`);
}

const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
const kurucu = liste.users.find(u => u.email === 'kurucu@test.local');
bekle('test hesabı duruyor', !!kurucu, 'önce node testler/siralama.mjs çalıştır');
await p.evaluate(async () => {
  const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' });
  if (r.error) throw r.error;
});

for (const yol of ['etkinlikler', 'siralama', 'profil']) {
  await p.goto(APP + '#/' + yol);
  await p.reload();
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => {
    const d = document.documentElement, sc = document.querySelector('.sc');
    const tabs = document.querySelector('.tabs'), ust = document.querySelector('.tepe');
    // Kısa ekranlarda kaydırma olmuyor ve yapışkanlık hiç sınanmıyordu: zorla taşır.
    if (sc) {
      const dolgu = document.createElement('div');
      dolgu.style.cssText = 'height:1200px;flex:0 0 auto';
      dolgu.dataset.test = 'dolgu';
      sc.appendChild(dolgu);
      sc.scrollTop = sc.scrollHeight;
    }
    const ur = ust?.getBoundingClientRect();
    const tr = tabs?.getBoundingClientRect();
    // Künyenin ortasındaki bir noktada üstte ne var: künye içerik gösteriyorsa
    // oradan içerik dönerdi, yani künye saydam demektir.
    const nokta = ur ? document.elementFromPoint(20, Math.round(ur.top + ur.height / 2)) : null;
    return {
      belgeKayar: d.scrollHeight > d.clientHeight || document.body.scrollHeight > document.body.clientHeight,
      kaydirildi: sc ? Math.round(sc.scrollTop) : 0,
      kunyeUstte: ur ? Math.round(ur.top) : null,
      kunyeOrtusuyor: nokta ? !!nokta.closest('.tepe') : null,
      tabsAlt: tr ? Math.round(tr.bottom) : null,
      gorunen: window.innerHeight,
      ilkSinif: (() => { const e = document.querySelector('.sc > *:not(.tepe)'); return e ? e.className : null })(),
      ilkCizgi: (() => { const e = document.querySelector('.sc > *:not(.tepe)'); return e ? getComputedStyle(e).borderTopWidth : null })(),
      yatayTasma: [...document.querySelectorAll('.app *')].some(e => {
        const q = e.getBoundingClientRect();
        return q.width && (q.right > window.innerWidth + 1 || q.left < -1);
      }),
    };
  });
  bekle(`${yol}: ekran gerçekten kaydırıldı`, r.kaydirildi > 300, String(r.kaydirildi));
  bekle(`${yol}: belge kaymıyor`, !r.belgeKayar, JSON.stringify(r));
  bekle(`${yol}: alt çubuk ekranın alt kenarında`, r.tabsAlt === r.gorunen, `${r.tabsAlt} / ${r.gorunen}`);
  bekle(`${yol}: künye kaydırınca tepede kalıyor`, r.kunyeUstte === 0, String(r.kunyeUstte));
  bekle(`${yol}: künye içeriği örtüyor`, r.kunyeOrtusuyor === true, JSON.stringify(r));
  bekle(`${yol}: yatay taşma yok`, !r.yatayTasma);
  // Künyenin 4px çizgisi zaten bir sınır; ilk blok ikincisini çizerse çift çizgi oluyor
  bekle(`${yol}: künyenin altında çift çizgi yok`, r.ilkCizgi !== '4px', `${r.ilkSinif} · ${r.ilkCizgi}`);
}

// iOS, 16px altindaki bir alana dokununca sayfayi zorla yakinlastiriyor ve geri
// dondurmuyor. Form olan her ekranda alanlarin puntosu olculuyor.
for (const yol of ['kur']) {
  await p.goto(APP + '#/' + yol);
  await p.reload(); await p.waitForTimeout(1500);
  const alanlar = await p.evaluate(() => [...document.querySelectorAll('input, textarea, select')]
    .map(e => ({ id: e.id || e.type, punto: parseFloat(getComputedStyle(e).fontSize) })));
  const kucuk = alanlar.filter(x => x.punto < 16);
  bekle(`${yol}: ekranda form alanı var`, alanlar.length > 0, String(alanlar.length));
  bekle(`${yol}: form alanları 16px altında değil`, kucuk.length === 0, JSON.stringify(kucuk));
}

// Tipografi ölçeği (karar 79): etiket seviyesinde altı stil. Sayımın dışında kalanlar:
// ters çevrilmiş yüzeyler (orada renk zorunlu olarak döner), gövde metni (etiket değil).
for (const yol of ['etkinlikler', 'siralama', 'profil', 'uyeler', 'kur']) {
  await p.goto(APP + '#/' + yol);
  await p.reload(); await p.waitForTimeout(1600);
  const stiller = await p.evaluate(() => {
    const ters = '.mud, .live, .odul .serit, .rozet.kurucu, .tabs button.on';
    const kova = new Set();
    for (const e of document.querySelectorAll('.sc *')) {
      if (!e.getBoundingClientRect().width) continue;
      if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
      if (e.closest(ters)) continue;
      const s = getComputedStyle(e);
      const boy = Math.round(parseFloat(s.fontSize) * 10) / 10;
      if (boy > 13) continue;
      if (parseInt(s.fontWeight) < 700) continue;
      kova.add(`${boy}/${s.fontWeight}/${s.color}/${Math.round((parseFloat(s.letterSpacing) || 0) * 2) / 2}`);
    }
    return [...kova];
  });
  bekle(`${yol}: etiket stili altıyı aşmıyor`, stiller.length <= 6, `${stiller.length}: ${stiller.join(' | ')}`);
}

// Boşluğa doğru kaydırmak: içerik bittikten sonra kalan ölü alan
for (const yol of ['etkinlikler', 'siralama', 'profil', 'uyeler', 'kur']) {
  await p.goto(APP + '#/' + yol);
  await p.reload(); await p.waitForTimeout(1600);
  const r = await p.evaluate(() => {
    const sc = document.querySelector('.sc'); if (!sc) return null;
    let alt = 0;
    for (const e of sc.querySelectorAll('*')) {
      const q = e.getBoundingClientRect();
      if (q.height > 0 && q.width > 0 && (e.textContent.trim().length || e.querySelector('img, svg')))
        alt = Math.max(alt, q.bottom + sc.scrollTop - sc.getBoundingClientRect().top);
    }
    return Math.round(sc.scrollHeight - Math.max(alt, sc.clientHeight));
  });
  bekle(`${yol}: boşluğa doğru kaydırma yok`, r !== null && r <= 24, String(r));
}

// Hareket (Buse, 2026-09-18): ileri sağdan kayar, geri soldan belirir, sekmede hareket yok
{
  const gecis = () => p.evaluate(() => {
    const g = document.querySelector('.gecis');
    return { sinif: g?.className ?? null, anim: g ? g.getAnimations().map(a => a.animationName) : [] };
  });
  await p.goto(APP + '#/etkinlikler'); await p.reload(); await p.waitForTimeout(1500);
  bekle('hareket: ilk açılışta kayma yok', (await gecis()).anim.length === 0, JSON.stringify(await gecis()));
  await p.click('.tabs button:has-text("Profil")'); await p.waitForTimeout(50);
  const sekme = await gecis();
  bekle('hareket: sekme değişince kayma yok', sekme.sinif.includes('yon-sekme') && sekme.anim.length === 0, JSON.stringify(sekme));
  await p.waitForTimeout(1200);
  await p.setViewportSize({ width: 390, height: 460 });
  await p.waitForTimeout(300);
  // Profili dibine kadar kaydır, Üyeler'e git, geri gel: kaldığın yerde açılmalı ve
  // hiçbir karede başa dönüp sonra aşağı zıplamamalı
  const yer = await p.evaluate(() => { const sc = document.querySelector('.sc'); sc.scrollTop = sc.scrollHeight; return Math.round(sc.scrollTop); });
  bekle('hareket: profil kaydırılabilir', yer > 80, String(yer));
  await p.locator('button.satir', { hasText: 'Katılma istekleri, üye listesi' }).or(p.locator('button.satir', { hasText: 'İstekler, roller' })).first().click();
  await p.waitForTimeout(40);
  const ileri = await gecis();
  bekle('hareket: alt ekran sağdan kayarak geliyor', ileri.sinif.includes('yon-ileri') && ileri.anim.includes('sagdan'), JSON.stringify(ileri));
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    window.__ornek = [];
    const f = () => {
      const sc = document.querySelector('.sc');
      const profilde = !!document.querySelector('.tabs button.on')?.textContent.includes('Profil') && !!sc?.textContent.includes('Yönetim');
      const gorunur = !document.querySelector('.gecis.bekliyor');
      if (profilde && gorunur) window.__ornek.push(Math.round(sc.scrollTop));
      if (performance.now() - t0 < 900) requestAnimationFrame(f);
    };
    const t0 = performance.now();
    requestAnimationFrame(f);
  });
  await p.goBack(); await p.waitForTimeout(30);
  const geri = await gecis();
  await p.waitForTimeout(1000);
  const ornek = await p.evaluate(() => window.__ornek);
  bekle('hareket: geri dönüş soldan beliriyor', geri.sinif.includes('yon-geri') && geri.anim.includes('soldan'), JSON.stringify(geri));
  // Yön sınıfı geri düğmesinin sınıfıyla çakışıyordu (.geri): dönünce bütün ekran
  // düğme gibi ortalanıp daralıyordu
  const dizilim = await p.evaluate(() => getComputedStyle(document.querySelector('.gecis')).alignItems);
  bekle('hareket: geri dönen ekran düğme stili almıyor', dizilim !== 'center', dizilim);
  bekle('hareket: geri dönünce görünen her karede kaldığın yer', ornek.length > 5 && Math.min(...ornek) >= yer - 2,
    `${yer} · ${ornek.slice(0, 12).join(',')} (${ornek.length})`);
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(APP + '#/profil'); await p.waitForTimeout(800);
  await p.locator('button.satir', { hasText: 'Katılma istekleri, üye listesi' }).or(p.locator('button.satir', { hasText: 'İstekler, roller' })).first().click();
  await p.waitForTimeout(40);
  bekle('hareket: "hareketi azalt" açıkken kayma yok', (await gecis()).anim.length === 0, JSON.stringify(await gecis()));
  // Basınca küçülme: :active olunca düğme %3 küçülüyor
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.waitForTimeout(600);
  const btn = p.locator('.sc .geri').first();
  const kutu = await btn.boundingBox();
  // Basılı dururken ölç. Chromium dokunmatik öykünmede :active vermiyor, fare veriyor;
  // telefonda :active için index.html'deki boş touchstart dinleyicisi var.
  await p.mouse.move(kutu.x + kutu.width / 2, kutu.y + kutu.height / 2); await p.mouse.down(); await p.waitForTimeout(250);
  const basili = await btn.evaluate(e => new DOMMatrix(getComputedStyle(e).transform).a);
  await p.mouse.up(); await p.waitForTimeout(40);
  // Bırakınca bu künyedeki geri bağlantısı: geri hareketi sayılmalı
  const kunyeGeri = await gecis();
  bekle('hareket: künyedeki geri bağlantısı da soldan beliriyor', kunyeGeri.sinif.includes('yon-geri') && kunyeGeri.anim.includes('soldan'), JSON.stringify(kunyeGeri));
  bekle('hareket: basınca düğme küçülüyor', Math.abs(basili - 0.97) < 0.005, String(basili));

  // Bellek boşken (ör. sekme uzun süre arkada kalıp sayfa yeniden kurulduysa) içerik geç
  // geliyor: ekran yerine oturana kadar gizli bekliyor, sonra kaldığın yerde görünüyor
  await p.waitForTimeout(800);
  const yer2 = await p.evaluate(() => { const sc = document.querySelector('.sc'); sc.scrollTop = sc.scrollHeight; return Math.round(sc.scrollTop); });
  await p.locator('button.satir', { hasText: 'Katılma istekleri, üye listesi' }).or(p.locator('button.satir', { hasText: 'İstekler, roller' })).first().click();
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    window.__bellek.clear();
    window.__ornek = []; window.__bekledi = false;
    const t0 = performance.now();
    const f = () => {
      const sc = document.querySelector('.sc');
      if (document.querySelector('.gecis.bekliyor')) window.__bekledi = true;
      const profilde = !!document.querySelector('.tabs button.on')?.textContent.includes('Profil') && !!sc?.textContent.includes('Yönetim');
      if (profilde && !document.querySelector('.gecis.bekliyor')) window.__ornek.push(Math.round(sc.scrollTop));
      if (performance.now() - t0 < 2600) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await p.goBack(); await p.waitForTimeout(2800);
  const bos = await p.evaluate(() => ({ ornek: window.__ornek, bekledi: window.__bekledi, hala: !!document.querySelector('.gecis.bekliyor') }));
  bekle('hareket: bellek boşken ekran yerine oturana kadar gizli', bos.bekledi, JSON.stringify(bos).slice(0, 200));
  bekle('hareket: bellek boşken de görünen her karede kaldığın yer', bos.ornek.length > 5 && Math.min(...bos.ornek) >= yer2 - 2 && !bos.hala,
    `${yer2} · ${bos.ornek.slice(0, 12).join(',')} (${bos.ornek.length})`);

  // Sıralamadan kişiye gidip dönünce de hiçbir karede başa dönmüyor
  await p.click('.tabs button:has-text("Sıralama")'); await p.waitForTimeout(1500);
  const yer3 = await p.evaluate(() => { const sc = document.querySelector('.sc'); sc.scrollTop = sc.scrollHeight; return Math.round(sc.scrollTop); });
  bekle('hareket: sıralama kaydırılabilir', yer3 > 80, String(yer3));
  await p.locator('.sc .mud button, .sc .unr .names button').last().click();
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    window.__ornek = [];
    const t0 = performance.now();
    const f = () => {
      const sc = document.querySelector('.sc');
      const sirada = !!document.querySelector('.tabs button.on')?.textContent.includes('Sıralama');
      if (sirada && sc && !document.querySelector('.gecis.bekliyor')) window.__ornek.push(Math.round(sc.scrollTop));
      if (performance.now() - t0 < 900) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await p.goBack(); await p.waitForTimeout(1100);
  const sira = await p.evaluate(() => window.__ornek);
  bekle('hareket: sıralamaya dönünce görünen her karede kaldığın yer', sira.length > 5 && Math.min(...sira) >= yer3 - 2,
    `${yer3} · ${sira.slice(0, 12).join(',')} (${sira.length})`);

  // Bellek üyeye bağlı: aynı sekmede başka biri girince öncekinin ekranı bir kare bile görünmüyor
  const kurucuId = await p.evaluate(async () => (await window.__sb.auth.getUser()).data.user.id);
  const anahtarlar = await p.evaluate(() => [...window.__bellek.keys()]);
  bekle('bellek: anahtarlar üye kimliğini taşıyor', anahtarlar.length > 0 && anahtarlar.every(k => k.startsWith(kurucuId + ':')), JSON.stringify(anahtarlar));
  await p.goto(APP + '#/profil'); await p.waitForTimeout(1500);
  const kurucuMetni = await p.evaluate(() => document.querySelector('.sc')?.textContent ?? '');
  bekle('bellek: kurucunun profili adını gösteriyor (ön koşul)', kurucuMetni.includes('Ayşe Kaya'), kurucuMetni.slice(0, 120));
  // Başka biri aynı sekmede girip Profil'i ilk kez açınca ekran bellekten kurucunun
  // verisiyle başlamamalı: her karede ada bak
  // Hangi veri kümesi kuruluysa oradaki düz bir üye (siralama.mjs ile ui.mjs farklı kişiler kuruyor)
  const { data: duzler } = await admin.from('uyeler').select('id, ad, eposta').eq('rol', 'uye').is('cikarildi_at', null).like('eposta', '%@test.local').order('ad');
  const baska = duzler?.[0];
  bekle('bellek: denenecek ikinci üye var (ön koşul)', !!baska);
  await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', baska.id);
  await p.click('.tabs button:has-text("Etkinlikler")'); await p.waitForTimeout(800);
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, baska.eposta);
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    window.__sizinti = false; window.__kare = 0;
    const t0 = performance.now();
    const f = () => {
      window.__kare++;
      if (document.querySelector('.sc')?.textContent.includes('Ayşe Kaya')) window.__sizinti = true;
      if (performance.now() - t0 < 1500) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await p.click('.tabs button:has-text("Profil")'); await p.waitForTimeout(1700);
  const sonra = await p.evaluate(() => ({ sizinti: window.__sizinti, kare: window.__kare, metin: document.querySelector('.sc')?.textContent.slice(0, 80) }));
  bekle('bellek: başka üye girince öncekinin profili bir kare bile görünmüyor', !sonra.sizinti && sonra.kare > 10 && sonra.metin?.includes(baska.ad), `${baska.ad} · ${JSON.stringify(sonra)}`);
  await p.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  await p.waitForTimeout(800);
  await p.setViewportSize({ width: 390, height: 844 });
}

// Yatay çevirince kırılma olmasın
await p.setViewportSize({ width: 844, height: 390 });
for (const yol of ['etkinlikler', 'siralama', 'profil']) {
  await p.goto(APP + '#/' + yol);
  await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({
    belgeKayar: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    tabsAlt: Math.round(document.querySelector('.tabs').getBoundingClientRect().bottom),
    gorunen: window.innerHeight,
    tasma: [...document.querySelectorAll('.app *')].some(e => {
      const q = e.getBoundingClientRect();
      return q.width && (q.right > window.innerWidth + 1 || q.left < -1);
    }),
  }));
  bekle(`${yol} (yatay): belge kaymıyor`, !r.belgeKayar, JSON.stringify(r));
  bekle(`${yol} (yatay): alt çubuk yerinde`, r.tabsAlt === r.gorunen, `${r.tabsAlt} / ${r.gorunen}`);
  bekle(`${yol} (yatay): taşma yok`, !r.tasma);
}
await p.setViewportSize({ width: 390, height: 844 });

// Ekran okuyucu için yapı: her ekranda en az bir başlık, adsız düğme ve
// etiketsiz alan olmasın, görseller alt taşısın
for (const yol of ['etkinlikler', 'siralama', 'profil', 'uyeler', 'kur']) {
  await p.goto(APP + '#/' + yol);
  await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const ad = e => (e.getAttribute('aria-label') || e.textContent.trim() || '').trim();
    return {
      baslik: document.querySelectorAll('.sc h1, .sc h2, .sc h3').length,
      adsiz: [...document.querySelectorAll('button')].filter(e => e.getBoundingClientRect().width && !ad(e)).length,
      altsiz: [...document.querySelectorAll('img')].filter(e => !e.hasAttribute('alt')).length,
      etiketsiz: [...document.querySelectorAll('input, select, textarea')].filter(e =>
        !e.getAttribute('aria-label') && !(e.id && document.querySelector(`label[for="${e.id}"]`))).length,
    };
  });
  bekle(`${yol}: ekranda başlık var`, r.baslik > 0, JSON.stringify(r));
  bekle(`${yol}: adsız düğme yok`, r.adsiz === 0, JSON.stringify(r));
  bekle(`${yol}: alt'sız görsel yok`, r.altsiz === 0, JSON.stringify(r));
  bekle(`${yol}: etiketsiz form alanı yok`, r.etiketsiz === 0, JSON.stringify(r));
}

// Sıkı harf aralıklı kalın büyük harflerde kelime arası kayboluyor ("BARIŞAK").
// Negatif harf aralığı olan büyük harf başlıklarda kelime arası payı olmalı.
for (const yol of ['etkinlikler', 'siralama', 'profil', 'uyeler']) {
  await p.goto(APP + '#/' + yol);
  await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => [...document.querySelectorAll('.sc *')]
    .filter(e => {
      const s2 = getComputedStyle(e);
      const t = e.textContent.trim();
      return s2.textTransform === 'uppercase' && parseFloat(s2.fontSize) >= 17
        && parseFloat(s2.letterSpacing) < 0 && t.includes(' ') && e.getBoundingClientRect().width
        && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    })
    .map(e => ({ metin: e.textContent.trim().slice(0, 20), kelimeArasi: getComputedStyle(e).wordSpacing }))
    .filter(x => x.kelimeArasi === 'normal' || parseFloat(x.kelimeArasi) === 0));
  bekle(`${yol}: sıkışık başlıkta kelime arası var`, r.length === 0, JSON.stringify(r));
}

// Geri bağlantısı her ekranda aynı görünsün: metin + ok
for (const yol of ['uyeler', 'kur', 'asama']) {
  await p.goto(APP + '#/' + yol);
  await p.reload(); await p.waitForTimeout(1400);
  const r = await p.evaluate(() => [...document.querySelectorAll('.geri')]
    .map(e => ({ metin: e.textContent.trim().slice(0, 18), ok: !!e.querySelector('svg') })));
  bekle(`${yol}: geri bağlantısında ok var`, r.length > 0 && r.every(x => x.ok), JSON.stringify(r));
}

// Geri dönünce bırakılan yer korunuyor; sekmeye dokununca baştan açılıyor (Buse, 2026-09-18).
// Test verisinde Sıralama tek ekrana sığıyor, kaydırma olsun diye ekran kısaltılıyor.
{
  await p.setViewportSize({ width: 390, height: 460 });
  const sirala = async () => {
    await p.goto(APP + '#/siralama'); await p.waitForTimeout(1600);
    return p.evaluate(() => { const sc = document.querySelector('.sc'); sc.scrollTop = sc.scrollHeight; return Math.round(sc.scrollTop) });
  };
  const yer = () => p.evaluate(() => Math.round(document.querySelector('.sc')?.scrollTop ?? -1));

  const y1 = await sirala();
  bekle('geri dönüş testi: Sıralama gerçekten kayıyor', y1 > 40, String(y1));
  await p.locator('.unr .names button, .row').last().click(); await p.waitForTimeout(1600);
  await p.locator('.geri').click(); await p.waitForTimeout(1400);
  const y2 = await yer();
  bekle('künyedeki geri ile dönünce yer korunuyor', Math.abs(y2 - y1) <= 2, `${y2} / ${y1}`);

  await p.locator('.unr .names button, .row').last().click(); await p.waitForTimeout(1600);
  await p.goBack(); await p.waitForTimeout(1400);
  const y3 = await yer();
  bekle('tarayıcının geri tuşuyla da yer korunuyor', Math.abs(y3 - y1) <= 2, `${y3} / ${y1}`);

  await p.locator('.tabs button', { hasText: 'Profil' }).click(); await p.waitForTimeout(1400);
  await p.locator('.tabs button', { hasText: 'Sıralama' }).click(); await p.waitForTimeout(1400);
  bekle('sekmeye dokununca baştan açılıyor', (await yer()) === 0, String(await yer()));

  // Sonuç ekranında kare detayından dönüş
  const { data: ev } = await admin.from('etkinlikler').select('id').order('bulusma_gunu', { ascending: false }).limit(1);
  await p.goto(APP + '#/sonuc/' + ev[0].id); await p.waitForTimeout(1800);
  const s1 = await p.evaluate(() => { const sc = document.querySelector('.sc'); sc.scrollTop = sc.scrollHeight; return Math.round(sc.scrollTop) });
  await p.locator('.izgara figure, .satir-kare, .kursu figure').last().click(); await p.waitForTimeout(1000);
  await p.getByRole('button', { name: 'Sonuçlara dön', exact: true }).click(); await p.waitForTimeout(600);
  const s2 = await yer();
  bekle('kare detayından dönünce galeri yerinde', s1 > 40 && Math.abs(s2 - s1) <= 2, `${s2} / ${s1}`);

  // Telefonun geri hareketi (tarayıcı geri): Etkinlikler'e değil sonuçlara, yer ve tema korunarak
  const sonucAdres = APP + '#/sonuc/' + ev[0].id;
  const sekmeSayisi = await p.locator('.sekmeler button').count();
  if (sekmeSayisi > 1) { await p.locator('.sekmeler button').nth(1).click(); await p.waitForTimeout(500); }
  const secSekme = await p.locator('.sekmeler button.on').textContent().catch(() => null);
  const s3 = await p.evaluate(() => { const sc = document.querySelector('.sc'); sc.scrollTop = sc.scrollHeight; return Math.round(sc.scrollTop) });
  await p.locator('.izgara figure, .satir-kare, .kursu figure, .odul img').last().click(); await p.waitForTimeout(1000);
  bekle('kare detayının kendi adresi var', /#\/sonuc\/[^/]+\/kare\/[^/]+$/.test(p.url()), p.url());
  await p.goBack(); await p.waitForTimeout(1200);
  bekle('geri hareketi detaydan sonuçlara dönüyor', p.url() === sonucAdres, p.url());
  bekle('geri hareketinde seçili tema korunuyor', (await p.locator('.sekmeler button.on').textContent().catch(() => null)) === secSekme, `${secSekme} (${sekmeSayisi} tema)`);
  const s4 = await yer();
  bekle('geri hareketinde galeri yerinde', Math.abs(s4 - s3) <= 2, `${s4} / ${s3}`);
  // Detaydaki düğme geçmişe fazladan sayfa eklemiyor: bir geri daha Etkinlikler'den önceki yere gider
  await p.locator('.izgara figure, .satir-kare, .kursu figure, .odul img').last().click(); await p.waitForTimeout(1000);
  await p.getByRole('button', { name: 'Sonuçlara dön', exact: true }).click(); await p.waitForTimeout(800);
  const uzunluk = await p.evaluate(() => history.length);
  await p.locator('.izgara figure, .satir-kare, .kursu figure, .odul img').last().click(); await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Sonuçlara dön', exact: true }).click(); await p.waitForTimeout(800);
  bekle('detay aç-kapa geçmişi büyütmüyor', (await p.evaluate(() => history.length)) === uzunluk && p.url() === sonucAdres, `${await p.evaluate(() => history.length)} / ${uzunluk}`);
  // Bağlantıyla doğrudan açılan detay: düğme sonuçlara götürüyor, uygulamadan çıkmıyor
  const kareAdres = await p.evaluate(async id => (await window.__sb.rpc('sonuc_kareleri', { p_etkinlik: id })).data[0].id, ev[0].id);
  await p.goto(sonucAdres + '/kare/' + kareAdres); await p.reload(); await p.waitForTimeout(1800);
  bekle('bağlantıyla açılan detay görünüyor', await p.getByRole('button', { name: 'Sonuçlara dön', exact: true }).isVisible());
  await p.getByRole('button', { name: 'Sonuçlara dön', exact: true }).click(); await p.waitForTimeout(1200);
  bekle('bağlantıyla açılan detaydan sonuçlara', p.url() === sonucAdres, p.url());
  // Olmayan kare adresi: sonuç sayfası açılıyor, boş ekran değil
  await p.goto(sonucAdres + '/kare/00000000-0000-0000-0000-000000000000'); await p.reload(); await p.waitForTimeout(1800);
  bekle('olmayan kare adresinde sonuçlar açılıyor', (await p.locator('.sekmeler, .bos-tema').count()) > 0);
  // Detay sonuçlardan açılıp telefonun geri hareketiyle kapatılınca işaret sıfırlanmalı: sonra
  // profilden açılan detayın düğmesi geçmişte geri gitmemeli, karenin etkinliğine gitmeli
  await p.goto(sonucAdres); await p.reload(); await p.waitForTimeout(1800);
  await p.locator('.izgara figure, .satir-kare, .kursu figure, .odul img').last().click(); await p.waitForTimeout(1000);
  await p.goBack(); await p.waitForTimeout(1200);
  await p.goto(APP + '#/profil'); await p.waitForTimeout(2000);
  if (await p.locator('.grid figure').count()) {
    await p.locator('.grid figure').first().click(); await p.waitForTimeout(1800);
    const detayAdresi = p.url();
    if (await p.getByRole('button', { name: 'Sonuçlara dön', exact: true }).count()) {
      await p.getByRole('button', { name: 'Sonuçlara dön', exact: true }).click(); await p.waitForTimeout(1200);
      bekle('geri hareketinden sonra profilden açılan detay etkinliğe dönüyor', p.url() === detayAdresi.replace(/\/kare\/[^/]+$/, ''), `${p.url()} / ${detayAdresi}`);
    } else bekle('profil karesi sonuçlanmış etkinlikten (kontrol)', false, detayAdresi);
  } else bekle('profilde kare var (kontrol)', false);
  await p.setViewportSize({ width: 390, height: 844 });
}

// Üyeler: düğmeler kapalıyken görünmüyor, rozet sütunu hizalı (açılır ve açılmaz satırlar)
{
  await p.goto(APP + '#/uyeler'); await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({
    acikAksiyon: document.querySelectorAll('.rolakt').length,
    rozetSag: [...new Set([...document.querySelectorAll('.satir .rozet')].map(e => Math.round(e.getBoundingClientRect().right)))],
  }));
  bekle('üyeler: düğmeler kapalıyken görünmüyor', r.acikAksiyon === 0, JSON.stringify(r));
  bekle('üyeler: rozet sütunu hizalı', r.rozetSag.length === 1, JSON.stringify(r.rozetSag));
}

// Künye: iOS Safari üst şeridi künyenin yazılı zemininden alıyor, grenin üstünde ve düz
// görünen renkte olmalı. Sonuçtaki tema sekmeleri künyenin arkasına değil altına yapışmalı.
{
  await p.goto(APP + '#/siralama'); await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const t = document.querySelector('.tepe'), st = getComputedStyle(t);
    return { zemin: st.backgroundColor, z: Number(st.zIndex),
      gren: Number(getComputedStyle(document.querySelector('.app'), '::after').zIndex),
      tema: document.querySelector('meta[name=theme-color]').content };
  });
  bekle('künye zemini görünen renkte (#0D0D0E)', r.zemin === 'rgb(13, 13, 14)', r.zemin);
  bekle('künye grenin üstünde', r.z > r.gren, `${r.z} / ${r.gren}`);

  const { data: ev } = await admin.from('etkinlikler').select('id').order('bulusma_gunu', { ascending: false }).limit(1);
  await p.goto(APP + '#/sonuc/' + ev[0].id); await p.waitForTimeout(1800);
  const s2 = await p.evaluate(() => {
    const sc = document.querySelector('.sc');
    const d = document.createElement('div'); d.style.cssText = 'height:1500px;flex:0 0 auto'; sc.appendChild(d);
    sc.scrollTop = 900;
    const t = document.querySelector('.tepe').getBoundingClientRect(), k = document.querySelector('.sekmeler')?.getBoundingClientRect();
    return k ? { tepeAlt: Math.round(t.bottom), sekmeUst: Math.round(k.top) } : null;
  });
  bekle('sonuç sekmeleri künyenin hemen altına yapışıyor', s2 && Math.abs(s2.sekmeUst - s2.tepeAlt) <= 1, JSON.stringify(s2));
}

// Oylamada kareye uzun basınca kaydet menüsü çıkmasın (Chromium bu özelliği okumuyor, kural denetleniyor)
{
  const css = oku('src/index.css').replace(/\s+/g, '');
  bekle('oylamada uzun basma menüsü kapalı', /\.akisimg\{[^}]*-webkit-touch-callout:none/.test(css));
}

// Arka plan yenilemesi başarısız olunca çalışan ekran hata ekranına dönmesin,
// bağlantı gelince de kendini toparlasın (inceleme bulgusu F1, 2026-09-18)
{
  await p.goto(APP + '#/etkinlikler'); await p.reload(); await p.waitForTimeout(1800);
  const icerik = () => p.evaluate(() => ({
    hata: !!document.querySelector('.sc .hata'),
    gecmis: (document.querySelector('.sc')?.innerText || '').includes('GEÇMİŞ ETKİNLİKLER'),
  }));
  bekle('yenileme testi: ekran yüklü', (await icerik()).gecmis, JSON.stringify(await icerik()));
  await ctx.route('**/rest/v1/**', r => r.abort());
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  // Supabase istemcisi ağ hatasında kendisi yeniden deniyor; hata ancak uygulamanın
  // 12 saniyelik sınırında (sor) yüzeye çıkıyor. Ondan önce bakmak kusuru görmüyordu.
  await p.waitForTimeout(14000);
  const kopuk = await icerik();
  bekle('arka plan yenilemesi kopunca ekran yerinde kalıyor', kopuk.gecmis && !kopuk.hata, JSON.stringify(kopuk));
  await ctx.unroute('**/rest/v1/**');
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(2000);
  const geri = await icerik();
  bekle('bağlantı gelince ekran sağlam', geri.gecmis && !geri.hata, JSON.stringify(geri));
}

// Yavaş bağlantıda ekran bomboş kalmasın: çerçeve yerinde dursun
{
  await ctx.route('**/rest/v1/**', async r => { await new Promise(x => setTimeout(x, 2500)); await r.continue().catch(() => {}) });
  await p.goto(APP + '#/siralama');
  await p.reload(); await p.waitForTimeout(900);
  const r = await p.evaluate(() => ({
    metin: (document.querySelector('.app')?.innerText || '').trim(),
    yukleniyor: !!document.querySelector('.yukleniyor'),
  }));
  bekle('yavaş bağlantıda yükleme göstergesi var', r.yukleniyor, JSON.stringify(r));
  bekle('yavaş bağlantıda ekran boş değil', r.metin.length > 2, JSON.stringify(r));
  await ctx.unroute('**/rest/v1/**');
}

// ---------------------------------------------------------------- yeni sürüm (Buse, 2026-09-20)
// Yayında yeni sürüm varsa bir sonraki ekran geçişinde sessizce yenileniyor, öncesinde değil
{
  // Önceki "yavaş bağlantı" testi yönlendirmeyi açık bırakıyor
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(APP + '#/etkinlikler'); await p.reload(); await p.waitForTimeout(1200);
  const isaretle = () => p.evaluate(() => { window.__isaret = 1; });
  const isaretVar = () => p.evaluate(() => window.__isaret === 1);
  const ac = '/assets/index-ESKI.js';
  // Açık sayfanın betik adı okunamıyorsa karşılaştırma yapılmaz (surum.ts: `!!acik`)
  await isaretle();
  await p.evaluate(() => window.__surum('<script type="module" src="/assets/index-YENI.js"></script>', null));
  await p.click('.tabs button:has-text("Sıralama")'); await p.waitForTimeout(800);
  bekle('sürüm: açık betiğin adı okunamazsa yenilenmiyor', await isaretVar());
  await p.click('.tabs button:has-text("Etkinlikler")'); await p.waitForTimeout(800);
  // aynı sürüm: geçişte yenilenmiyor
  await isaretle();
  await p.evaluate(a => window.__surum(`<script type="module" src="${a}"></script>`, a), ac);
  await p.click('.tabs button:has-text("Sıralama")'); await p.waitForTimeout(800);
  bekle('sürüm: aynıysa geçişte yenilenmiyor', await isaretVar());
  // bozuk cevap: yenilenmiyor
  await p.evaluate(a => window.__surum('<html>bakım</html>', a), ac);
  await p.click('.tabs button:has-text("Profil")'); await p.waitForTimeout(800);
  bekle('sürüm: sayfa okunamazsa yenilenmiyor', await isaretVar());
  // yeni sürüm: fark edilince hemen değil, bir sonraki geçişte
  await p.evaluate(a => window.__surum('<script type="module" src="/assets/index-YENI.js"></script>', a), ac);
  await p.waitForTimeout(800);
  bekle('sürüm: yeni sürüm fark edilince ekran olduğu gibi kalıyor', await isaretVar());
  await p.click('.tabs button:has-text("Etkinlikler")'); await p.waitForTimeout(1500);
  bekle('sürüm: bir sonraki geçişte yenileniyor', !(await isaretVar()));
  bekle('sürüm: yenilenince gidilen ekranda açılıyor', p.url().endsWith('#/etkinlikler') && (await p.locator('.tabs button.on').textContent()).includes('Etkinlikler'), p.url());
}

// Yeni sürüm bir kez görüldükten sonra bozuk bir cevap bunu silmiyor (surum.ts: `if (yeni) return`)
{
  await p.waitForTimeout(800);
  const ac = '/assets/index-ESKI.js';
  await p.evaluate(() => { window.__isaret = 1; });
  await p.evaluate(a => window.__surum('<script type="module" src="/assets/index-YENI2.js"></script>', a), ac);
  await p.evaluate(a => window.__surum('<html>bakım</html>', a), ac);
  await p.click('.tabs button:has-text("Sıralama")'); await p.waitForTimeout(1500);
  bekle('sürüm: görülen yeni sürüm bozuk cevapla unutulmuyor', !(await p.evaluate(() => window.__isaret === 1)));
}

// Yayın derlemesinde gerçek yol: betik adı sayfadan okunuyor, yayındaki index.html ile karşılaştırılıyor
{
  const { execSync, spawn } = await import('node:child_process');
  const env = Object.fromEntries(execSync('npx supabase status -o env', { cwd: KOK, encoding: 'utf8' }).split('\n')
    .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
  // Yerel veritabanına bağlı bir yayın derlemesi: canlıya hiç dokunmuyor
  execSync('npx vite build --outDir /tmp/cg-yayin --emptyOutDir', { cwd: KOK, stdio: 'ignore',
    env: { ...process.env, VITE_SUPABASE_URL: env.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: env.ANON_KEY } });
  const sunucu = spawn('npx', ['vite', 'preview', '--outDir', '/tmp/cg-yayin', '--port', '5199', '--strictPort'], { cwd: KOK, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const q = await ctx.newPage();
  const html = fs.readFileSync('/tmp/cg-yayin/index.html', 'utf8');
  let yayindaki = html;
  await q.route(/index\.html\?s=/, r => r.fulfill({ status: 200, contentType: 'text/html', body: yayindaki }));
  await q.goto('http://localhost:5199/#/etkinlikler'); await q.waitForTimeout(1500);
  const gorunur = () => q.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await q.evaluate(() => { window.__isaret = 1; });
  await gorunur(); await q.waitForTimeout(500);
  await q.evaluate(() => { location.hash = '#/siralama'; }); await q.waitForTimeout(1200);
  bekle('yayın: aynı sürümde geçiş yenilemiyor', await q.evaluate(() => window.__isaret === 1));
  // Yayındaki sayfa hiç alınamazsa (bağlantı yok) geçişte yenilenmiyor, bir dahaki kontrole kalıyor
  await q.unroute(/index\.html\?s=/);
  await q.route(/index\.html\?s=/, r => r.abort());
  await gorunur(); await q.waitForTimeout(500);
  await q.evaluate(() => { location.hash = '#/etkinlikler'; }); await q.waitForTimeout(1200);
  bekle('yayın: sayfa alınamazsa yenilenmiyor', await q.evaluate(() => window.__isaret === 1));
  await q.unroute(/index\.html\?s=/);
  await q.route(/index\.html\?s=/, r => r.fulfill({ status: 200, contentType: 'text/html', body: yayindaki }));
  yayindaki = html.replace(/\/assets\/index-[^"]+\.js/, '/assets/index-YENI123.js');
  await gorunur(); await q.waitForTimeout(500);
  bekle('yayın: görünür olunca yenilemiyor (yükleme yarıda kalmasın)', await q.evaluate(() => window.__isaret === 1));
  await q.evaluate(() => { location.hash = '#/profil'; }); await q.waitForTimeout(1500);
  bekle('yayın: yeni sürümü gördükten sonraki geçişte yenileniyor', await q.evaluate(() => window.__isaret !== 1) && q.url().endsWith('#/profil'), q.url());
  await q.close();
  sunucu.kill();
}

bekle('konsol hatası yok', hatalar.length === 0, hatalar.join(' | '));
await b.close();
rapor();
