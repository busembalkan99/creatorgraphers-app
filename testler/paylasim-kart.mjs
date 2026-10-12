// Paylaşım kartının yeni düzenleri (karar 130): taşma, çakışma, kalem payı, Galeride numarasız ve dairesiz, afiş izni,
// senin karen renkli / başkalarınınki gri, fotoğrafsız kart. Kart sayfada içe aktarılıp çiziliyor (geliştirme sunucusu açık);
// Chromium ve iPhone motoru (WebKit) ayrı ölçülüyor, dar Archivo iki motorda aynı genişlikte olmalı.
import { chromium, webkit } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { bekle, rapor } from './ortak.mjs';

const APP = process.env.CG_APP ?? 'http://localhost:5180/';
const kesisir = (a, c, pay = 0) => a.x < c.x + c.w + pay && c.x < a.x + a.w + pay && a.y < c.y + c.h + pay && c.y < a.y + a.h + pay;
const SIRA = { birinci: '01', ortak: '01', ucuncu: '03', galeride: '—', tek: '02', fotosuz: '01' };
const motorlar = {};

for (const motor of [chromium, webkit]) {
  const m = motor.name();
  const b = await motor.launch(); const p = await b.newPage();
  await p.goto(APP); await p.waitForFunction(() => window.__sb);
  const sonuc = await p.evaluate(async SIRA => {
    const D = await import('/src/lib/paylasimKarti.ts');
    await D.fontlarHazir();
    // Ayırt edilebilir kareler: seninki kırmızıdan maviye, başkalarınınki yeşilden turuncuya (gri çizilmeleri gerekiyor)
    const resim = (w, h, r1, r2) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, r1); g.addColorStop(1, r2); x.fillStyle = g; x.fillRect(0, 0, w, h);
      const i = new Image(); i.src = c.toDataURL(); return new Promise(r => { i.onload = () => r(i) });
    };
    const yatay = await resim(300, 200, '#e02020', '#2040e0'), dikey = await resim(200, 300, '#e02020', '#2040e0'), baska = await resim(300, 200, '#20c060', '#f09010');
    const MK = 'Muhammed Mustafa Karaosmanoğlu';
    const HAL = {
      birinci: { baslik: 'Tema birincisi', tema: 'Sokak', ad: MK, puan: '10,0', alt: '9 kişi puanladı', foto: yatay, serit: Array(6).fill(baska) },
      ortak: { baslik: 'Ortak birinci', tema: 'Portre fotoğrafçılığı ve sokak', ad: 'Selin Arı', puan: '9,0', alt: '8 kişi puanladı', foto: yatay, serit: Array(3).fill(baska) },
      ucuncu: { baslik: 'Üçüncü', tema: 'Sokak', ad: 'Can Öz', puan: '8,0', alt: '9 kişi puanladı', foto: dikey, serit: [baska, baska] },
      galeride: { baslik: 'Galeride', tema: 'Sokak', ad: 'Pelin Er', puan: '4,0', alt: 'Puanı yalnız sen görüyorsun', foto: yatay, serit: [baska, baska] },
      // Şeritte başkası yok, isim ve tema uzun: boş hücreler ve küçülme yolu
      tek: { baslik: 'İkinci', tema: 'Portre fotoğrafçılığı ve sokak', ad: MK, puan: '7,5', alt: '12 kişi puanladı', foto: dikey, serit: [] },
      // Senin karen yüklenemedi: boş çerçeve
      fotosuz: { baslik: 'Tema birincisi', tema: 'Sokak', ad: 'Deniz Akın', puan: '9,5', alt: '9 kişi puanladı', foto: null, serit: Array(3).fill(baska) },
    };
    // Renk doygunluğu (en büyük - en küçük kanal), kutunun içinde ızgara noktalarında
    const doygun = (g, k, oranlar, atla = []) => oranlar.flatMap(fx => oranlar.map(fy => [k.x + k.w * fx, k.y + k.h * fy]))
      .filter(([x, y]) => !atla.some(a => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h))
      .map(([x, y]) => { const d = g.getImageData(Math.floor(x), Math.floor(y), 1, 1).data; return Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]); });
    const orta = l => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];
    const out = {};
    for (const d of ['lup', 'baski', 'sayfa', 'kontakt']) for (const [h, v0] of Object.entries(HAL)) {
      const v = { ay: 'Ekim', yil: '2026', temaKare: 7, tohum: 'x', sira: SIRA[h], ...v0 }, olcum = [];
      const cv = D.kartCiz(d, v, olcum), g = cv.getContext('2d');
      const lup = olcum.filter(x => x.tur === 'lup');
      const senin = olcum.filter(x => x.tur === 'foto' && x.kaynak === 'foto' && x.t !== 'bos').map(x => orta(doygun(g, x, [0.3, 0.5, 0.7])));
      const bos = olcum.filter(x => x.tur === 'foto' && x.t === 'bos').map(x => orta(doygun(g, x, [0.3, 0.5, 0.7])));
      const baskalari = olcum.filter(x => x.tur === 'foto' && x.kaynak === 'serit').flatMap(x => doygun(g, x, [0.1, 0.3, 0.5, 0.7, 0.9], lup));
      out[`${d}/${h}`] = { k: olcum, w: cv.width, h: cv.height, senin, bos, baskalari };
    }
    // document.fonts.check, o adda yüz hiç yokken de true dönüyor: yüzün kendisi yüklenmiş olmalı
    const dar = ['ArchivoDar', 'ArchivoDar75'].map(a => [...document.fonts].some(f => f.family === a && f.status === 'loaded'));
    return { out, dar, duzenler: D.DUZENLER.map(x => x.ad), basliklar: D.DUZENLER.map(x => x.baslik) };
  }, SIRA);
  motorlar[m] = sonuc.out;
  bekle(`${m}: dar Archivo kesimleri yüklendi`, sonuc.dar.every(Boolean), JSON.stringify(sonuc.dar));
  bekle(`${m}: yedi düzen, yeniler sonda`, sonuc.duzenler.join() === 'dev,kontakt,egik,bilet,lup,baski,sayfa', sonuc.duzenler.join());
  bekle(`${m}: yeni düzenlerin adları`, sonuc.basliklar.slice(4).join() === 'Lüp,Baskı,Kontakt sayfası', sonuc.basliklar.join());
  for (const [ad, { k, w, h, senin, bos, baskalari }] of Object.entries(sonuc.out)) {
    const a = `${m}: ${ad}`, hal = ad.split('/')[1], sira = SIRA[hal];
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
    // Künyedeki sıra: Baskı'nın alt payındaki satır, Kontakt sayfasının "▸ 01 ·" yazısı
    const parca = k.filter(x => x.tur === 'yazi').flatMap(x => (x.t ?? '').split(' / '));
    const siraParca = parca.filter(t => /^(\d{1,2}|—)$/.test(t) || /▸\s*(\d|—)/.test(t));
    if (hal === 'galeride') {
      bekle(`${a}: numara ve daire yok (karar 52)`, numara.length === 0 && daire.length === 0, JSON.stringify([...numara, ...daire]));
      bekle(`${a}: künyede sıra yok (karar 52)`, siraParca.length === 0, siraParca.join(' | '));
    } else {
      if (ad.startsWith('lup/')) bekle(`${a}: kalem sırayı yazıyor`, numara.length === 1 && numara[0].t === String(Number(sira)), JSON.stringify(numara));
      else bekle(`${a}: tek daire`, daire.length === 1, String(daire.length));
      if (ad.startsWith('baski/')) bekle(`${a}: alt payda sıra`, parca.includes(sira), parca.join(' | '));
      if (ad.startsWith('sayfa/')) bekle(`${a}: künyede sıra`, parca.some(t => t.startsWith(`▸ ${sira} · `)), parca.join(' | '));
    }
    bekle(`${a}: başkalarının kareleri yalnız şeritten (karar 41)`, k.filter(x => x.tur === 'foto' && x.kaynak !== 'foto').every(x => x.kaynak === 'serit'));
    if (hal === 'fotosuz') {
      bekle(`${a}: fotoğraf yoksa boş çerçeve, renkli kare yok`, senin.length === 0 && bos.length === 1 && bos[0] <= 16, JSON.stringify({ senin, bos }));
    } else {
      bekle(`${a}: senin karen renkli`, senin.length > 0 && Math.max(...senin) >= 60, JSON.stringify(senin));
      bekle(`${a}: boş çerçeve yok`, bos.length === 0, JSON.stringify(bos));
    }
    // Baskı yalnız senin baskını gösteriyor; şerit ve ızgara Lüp ile Kontakt sayfasında
    if (ad.startsWith('baski/')) bekle(`${a}: başkasının karesi yok`, baskalari.length === 0, String(baskalari.length));
    else if (hal === 'tek') bekle(`${a}: başkasının karesi yok`, baskalari.length === 0, String(baskalari.length));
    else bekle(`${a}: başkalarının kareleri gri`, baskalari.length > 0 && Math.max(...baskalari) <= 16, `${baskalari.length} nokta, en çok ${Math.max(...baskalari)}`);
  }
  // Kontakt sayfası ızgarası: senin karen dışında 5, 2 ya da olduğu kadar kare (izgaraKareleri)
  const seritSay = h => sonuc.out[`sayfa/${h}`].k.filter(x => x.tur === 'foto' && x.kaynak === 'serit').length;
  bekle(`${m}: sayfa ızgarası 5/2/2/2/0`, [seritSay('birinci'), seritSay('ortak'), seritSay('ucuncu'), seritSay('galeride'), seritSay('tek')].join() === '5,2,2,2,0',
    ['birinci', 'ortak', 'ucuncu', 'galeride', 'tek'].map(seritSay).join());
  await b.close();
}

// Google Fonts takılırsa paylaşım ekranı beklemiyor: kart süre içinde fontStretch yoluyla çiziliyor, sonraki çağrı yeniden deniyor
{
  const b = await chromium.launch(); const p = await b.newPage();
  const hatalar = []; p.on('pageerror', e => hatalar.push(String(e)));
  const DAR_CSS = /fonts\.googleapis\.com\/css2\?family=Archivo:wdth,wght@(62\.5|75),/;
  await p.route(DAR_CSS, () => {});   // hiç cevap vermiyor
  await p.goto(APP); await p.waitForFunction(() => window.__sb);
  const takili = await p.evaluate(async () => {
    const D = await import('/src/lib/paylasimKarti.ts');
    const t0 = performance.now();
    await D.fontlarHazir();
    const k = [];
    for (const d of ['lup', 'baski', 'sayfa']) D.kartCiz(d, { ay: 'Ekim', yil: '2026', tema: 'Sokak', ad: 'Can Öz', baslik: 'Tema birincisi', puan: '9,0', alt: '9 kişi puanladı', sira: '01', temaKare: 3, foto: null, serit: [], tohum: 'x' }, k);
    const c = document.createElement('canvas').getContext('2d'); c.font = '900 200px Archivo'; c.fontStretch = 'extra-condensed';
    return { ms: performance.now() - t0, dar: [...document.fonts].filter(f => f.family.startsWith('ArchivoDar')).length,
      tema: k.find(x => x.t === 'TEMA')?.g, dar62: c.measureText('TEMA').width };
  });
  bekle('takılan font isteği: kart 6 sn içinde çiziliyor', takili.ms < 6000, `${Math.round(takili.ms)} ms`);
  bekle('takılan font isteği: dar yüz kalmıyor, başlık fontStretch ile dar', takili.dar === 0 && Math.abs(takili.tema - takili.dar62) < 1, JSON.stringify(takili));
  await p.unroute(DAR_CSS);
  const sonra = await p.evaluate(async () => {
    const D = await import('/src/lib/paylasimKarti.ts');
    await D.fontlarHazir();
    return ['ArchivoDar', 'ArchivoDar75'].map(a => [...document.fonts].some(f => f.family === a && f.status === 'loaded'));
  });
  bekle('takılan font isteği: istek açılınca sonraki çağrı yeniden deniyor', sonra.every(Boolean), JSON.stringify(sonra));
  bekle('takılan font isteği: sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
  await b.close();
}

// Dar Archivo iki motorda aynı genişlikte: başlık ve künye satırlarının ilerleme genişliği %3 içinde
// (mürekkep kutusu değil: WebKit actualBoundingBoxLeft/Right'ı ilerlemeden veriyor)
const fark = [];
for (const [ad, { k }] of Object.entries(motorlar.chromium)) {
  if (ad.startsWith('kontakt/')) continue;
  const c = k.filter(x => x.tur === 'baslik' || x.tur === 'yazi'), w = motorlar.webkit[ad].k.filter(x => x.tur === 'baslik' || x.tur === 'yazi');
  if (c.length !== w.length) { fark.push(`${ad}: ${c.length} / ${w.length} kutu`); continue; }
  c.forEach((x, i) => { if (x.t !== w[i].t || !(x.g > 0) || Math.abs(x.g - w[i].g) / x.g > 0.03) fark.push(`${ad}: ${x.t} ${x.g?.toFixed(0)} / ${w[i].t} ${w[i].g?.toFixed(0)}`); });
}
bekle('Chromium ve WebKit: dar başlık ve künye genişliği %3 içinde', fark.length === 0, fark.slice(0, 6).join(' | '));
rapor();
