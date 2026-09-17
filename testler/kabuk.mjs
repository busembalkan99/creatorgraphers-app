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
  bekle('theme-color var', /name="theme-color" content="#0A0A0B"/.test(html), html.match(/theme-color[^>]*/)?.[0]);
  bekle('kabuk yüksekliği dvh ile', /body\{height:100dvh\}/.test(css.replace(/\s+/g, '')),
    css.split('\n').filter(l => l.includes('100dvh')).join(' | '));
  bekle('belge kaydırması kapalı', /html,body\{overflow:hidden/.test(css.replace(/\s+/g, '')));
  // vh, iOS'ta adres çubuğu gizliymiş gibi hesaplanıyor: kabuk ölçüsünde kullanılmamalı
  const vhler = css.split('\n').filter(l => /[^d]vh\b/.test(l) && !l.trim().startsWith('/*') && !l.includes('dvh'));
  bekle('kabuk ölçüsünde çıplak vh yok', vhler.length === 0, vhler.join(' | '));
  bekle('üst künye yapışkan', /\.tepe\{[^}]*position:sticky/.test(css.replace(/\s+/g, '')));
  bekle('üst künyede güvenli alan payı', /\.tepe\{[^}]*env\(safe-area-inset-top\)/.test(css.replace(/\s+/g, '')));
  // Pay kapta olursa seçili sekmenin dolgusu alt kenara inmiyor
  bekle('alt çubukta güvenli alan payı düğmenin içinde',
    /\.tabsbutton\{[^}]*padding-bottom:env\(safe-area-inset-bottom\)/.test(css.replace(/\s+/g, '')),
    css.split('\n').filter(l => l.includes('safe-area-inset-bottom')).join(' | '));
  bekle('gövde zemini uygulamayla aynı siyah', /body\{background:var\(--paper\)/.test(css.replace(/\s+/g, '')));

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
{
  const r = await p.evaluate(() => ({
    belgeKayar: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    kunye: !!document.querySelector('.tepe'),
  }));
  bekle('kapakta belge kaymıyor', !r.belgeKayar);
  bekle('kapakta künye var', r.kunye);
}

const { data: liste } = await admin.auth.admin.listUsers();
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
}

bekle('konsol hatası yok', hatalar.length === 0, hatalar.join(' | '));
await b.close();
rapor();
