// Paylaşım kartının yeni düzenleri (karar 130): taşma, çakışma, kalem payı, Galeride numarasız ve dairesiz, afiş izni.
// Kart sayfada içe aktarılıp çiziliyor (geliştirme sunucusu açık); Chromium ve iPhone motoru (WebKit) ayrı ölçülüyor,
// WebKit'te tuvalin dar yazı biçimi (fontStretch) yok, yazılar küçülerek sığıyor.
import { chromium, webkit } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { bekle, rapor } from './ortak.mjs';

const APP = process.env.CG_APP ?? 'http://localhost:5180/';
const kesisir = (a, c, pay = 0) => a.x < c.x + c.w + pay && c.x < a.x + a.w + pay && a.y < c.y + c.h + pay && c.y < a.y + a.h + pay;

for (const motor of [chromium, webkit]) {
  const m = motor.name();
  const b = await motor.launch(); const p = await b.newPage();
  await p.goto(APP); await p.waitForFunction(() => window.__sb);
  const sonuc = await p.evaluate(async () => {
    const D = await import('/src/lib/paylasimKarti.ts');
    await D.fontlarHazir();
    const resim = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#c84'; x.fillRect(0, 0, w, h); const i = new Image(); i.src = c.toDataURL(); return new Promise(r => { i.onload = () => r(i) }) };
    const yatay = await resim(300, 200), dikey = await resim(200, 300), gri = await resim(300, 200);
    const MK = 'Muhammed Mustafa Karaosmanoğlu';
    const HAL = {
      birinci: { baslik: 'Tema birincisi', tema: 'Sokak', ad: MK, puan: '10,0', alt: '9 kişi puanladı', sira: '01', foto: yatay, serit: [gri, gri, gri, gri, gri, gri] },
      ortak: { baslik: 'Ortak birinci', tema: 'Portre fotoğrafçılığı ve sokak', ad: 'Selin Arı', puan: '9,0', alt: '8 kişi puanladı', sira: '01', foto: yatay, serit: [gri, gri, gri] },
      ucuncu: { baslik: 'Üçüncü', tema: 'Sokak', ad: 'Can Öz', puan: '8,0', alt: '9 kişi puanladı', sira: '03', foto: dikey, serit: [gri, gri] },
      galeride: { baslik: 'Galeride', tema: 'Sokak', ad: 'Pelin Er', puan: '4,0', alt: 'Puanı yalnız sen görüyorsun', sira: '—', foto: yatay, serit: [gri, gri] },
      // Şeritte başkası yok, isim ve tema uzun: boş hücreler ve küçülme yolu
      tek: { baslik: 'İkinci', tema: 'Portre fotoğrafçılığı ve sokak', ad: MK, puan: '7,5', alt: '12 kişi puanladı', sira: '02', foto: dikey, serit: [] },
    };
    const out = {};
    for (const d of ['lup', 'baski', 'sayfa', 'kontakt']) for (const [h, v0] of Object.entries(HAL)) {
      const v = { ay: 'Ekim', yil: '2026', temaKare: 7, tohum: 'x', ...v0 }, olcum = [];
      const cv = D.kartCiz(d, v, olcum);
      out[`${d}/${h}`] = { k: olcum, w: cv.width, h: cv.height };
    }
    return { out, duzenler: D.DUZENLER.map(x => x.ad), basliklar: D.DUZENLER.map(x => x.baslik) };
  });
  bekle(`${m}: yedi düzen, yeniler sonda`, sonuc.duzenler.join() === 'dev,kontakt,egik,bilet,lup,baski,sayfa', sonuc.duzenler.join());
  bekle(`${m}: yeni düzenlerin adları`, sonuc.basliklar.slice(4).join() === 'Lüp,Baskı,Kontakt sayfası', sonuc.basliklar.join());
  for (const [ad, { k, w, h }] of Object.entries(sonuc.out)) {
    const a = `${m}: ${ad}`;
    bekle(`${a}: 1080x1920, ölçüm var`, w === 1080 && h === 1920 && k.length > 0, `${w}x${h} ${k.length}`);
    const disarida = k.find(x => !(x.x >= 0 && x.y >= 0 && x.x + x.w <= 1080 && x.y + x.h <= 1920));
    bekle(`${a}: tuvalin içinde`, !disarida, JSON.stringify(disarida));
    const yazi = k.filter(x => x.tur === 'yazi' || x.tur === 'kalem' || x.tur === 'baslik');
    const cak = []; for (let i = 0; i < yazi.length; i++) for (let j = i + 1; j < yazi.length; j++) if (kesisir(yazi[i], yazi[j])) cak.push(`${yazi[i].t} × ${yazi[j].t}`);
    bekle(`${a}: yazılar çakışmıyor`, cak.length === 0, cak.join(' | '));
    if (ad.startsWith('kontakt/')) {
      bekle(`${a}: alt satırda isim ve künye ölçüldü`, yazi.length === 2, String(yazi.length));
      continue;
    }
    const kalem = k.filter(x => x.tur === 'kalem'), engel = k.filter(x => ['serit', 'lup', 'baslik'].includes(x.tur) || (x.tur === 'foto' && x.kaynak === 'serit'));
    const yakin = kalem.flatMap(q => engel.filter(g => kesisir(q, g, 16)).map(g => `${q.t} × ${g.tur}/${g.kaynak ?? ''} ${JSON.stringify(q)} ${JSON.stringify(g)}`));
    bekle(`${a}: kalem 16px uzak`, yakin.length === 0, yakin.join(' | '));
    const numara = k.filter(x => x.tur === 'kalem' && /^\d$/.test(x.t ?? '')), daire = k.filter(x => x.tur === 'daire');
    if (ad.endsWith('/galeride')) bekle(`${a}: numara ve daire yok (karar 52)`, numara.length === 0 && daire.length === 0, JSON.stringify([...numara, ...daire]));
    else if (ad.startsWith('lup/')) bekle(`${a}: kalem sırayı yazıyor`, numara.length === 1 && numara[0].t === String(Number(ad.endsWith('/ucuncu') ? 3 : ad.endsWith('/tek') ? 2 : 1)), JSON.stringify(numara));
    else bekle(`${a}: tek daire`, daire.length === 1, String(daire.length));
    bekle(`${a}: başkalarının kareleri yalnız şeritten (karar 41)`, k.filter(x => x.tur === 'foto' && x.kaynak !== 'foto').every(x => x.kaynak === 'serit'));
    bekle(`${a}: senin karen çizildi`, k.some(x => x.tur === 'foto' && x.kaynak === 'foto'));
  }
  // Kontakt sayfası ızgarası: senin karen dışında 5, 2 ya da olduğu kadar kare (izgaraKareleri)
  const seritSay = h => sonuc.out[`sayfa/${h}`].k.filter(x => x.tur === 'foto' && x.kaynak === 'serit').length;
  bekle(`${m}: sayfa ızgarası 5/2/2/2/0`, [seritSay('birinci'), seritSay('ortak'), seritSay('ucuncu'), seritSay('galeride'), seritSay('tek')].join() === '5,2,2,2,0',
    ['birinci', 'ortak', 'ucuncu', 'galeride', 'tek'].map(seritSay).join());
  await b.close();
}
rapor();
