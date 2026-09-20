// Kare bilgisinin okunması (veritabanı istemez, yalnız `npm run dev` açık olsun).
// İki kusur yüzünden var (2026-09-20):
// 1. Okuyucu dosyasının adı her yayında değişiyor, eskisi siliniyor. Eski sürümü açık olan telefonda
//    okuyucu yüklenemiyordu ve uygulama buna "Bu dosyada çekim tarihi yok" diyordu.
// 2. Lightroom iOS makine bilgisini bozuk yazabiliyor: diyafram, enstantane ve odak aynı anlamsız sayı.
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';

const APP = 'http://localhost:5180/';
const sonuclar = [];
const bekle = (ad, kosul, ayrinti = '') => sonuclar.push({ ad, ok: !!kosul, ayrinti: kosul ? '' : JSON.stringify(ayrinti) });

const b = await chromium.launch();
const s = await b.newPage();
await s.goto(APP);

const okuyucu = await s.evaluate(async () => {
  const m = await import('/src/lib/kare.ts');
  const dosya = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'a.jpg', { type: 'image/jpeg' });
  const dene = async getir => {
    try { return { bilgi: await m.bilgiOku(dosya, getir) }; }
    catch (x) { return { okuyucuHatasi: x instanceof m.OkuyucuHatasi, ad: x?.constructor?.name }; }
  };
  return {
    yuklenemedi: await dene(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))),
    bozukDosya: await dene(async () => ({ parse: () => Promise.reject(new Error('bozuk')) })),
    tarihsiz: await dene(async () => ({ parse: async () => undefined })),
  };
});
bekle('okuyucu yüklenemezse OkuyucuHatasi atılır, "tarih yok" denmez', okuyucu.yuklenemedi.okuyucuHatasi === true, okuyucu.yuklenemedi);
bekle('dosya okunamazsa hata atılmaz, tarih boş döner', okuyucu.bozukDosya.bilgi?.cekim_gunu === null, okuyucu.bozukDosya);
bekle('bilgisiz dosyada tarih boş döner', okuyucu.tarihsiz.bilgi?.cekim_gunu === null, okuyucu.tarihsiz);

const kur = await s.evaluate(async () => {
  const m = await import('/src/lib/kare.ts');
  const saglam = { DateTimeOriginal: '2026:09:19 17:08:19', Make: 'Canon', Model: 'Canon EOS 6D', LensModel: 'EF40mm f/2.8 STM', FocalLength: 40, FNumber: 2.8, ExposureTime: 1 / 60, ISO: 6400 };
  // Buluşmadan gelen gerçek dosyadaki değerler (IMG_9583.JPG, Lightroom 11.5.30 iOS)
  const bozuk = { DateTimeOriginal: '2026:09:19 17:08:19', LensModel: '\x06', FocalLength: 258.9882360187238, FNumber: 258.9882360187238, ExposureTime: 258.9882360187238, ISO: 6400 };
  return {
    saglam: m.bilgiKur(saglam),
    bozuk: m.bilgiKur(bozuk),
    uzunPoz: m.bilgiKur({ FocalLength: 24, FNumber: 8, ExposureTime: 30 }),
    sacmaDiyafram: m.bilgiKur({ FocalLength: 50, FNumber: 900, ExposureTime: 1 / 125 }),
    sacmaOdak: m.bilgiKur({ FocalLength: 4500, FNumber: 2.8, ExposureTime: 1 / 200 }),
    sacmaPoz: m.bilgiKur({ FocalLength: 35, FNumber: 4, ExposureTime: 7200 }),
    altSinir: m.bilgiKur({ FocalLength: 0, FNumber: 0.2, ExposureTime: 1 / 200000 }),
  };
});
bekle('sağlam dosya: makine bilgisi olduğu gibi', kur.saglam.kamera === 'Canon EOS 6D' && kur.saglam.objektif === 'EF40mm f/2.8 STM' && kur.saglam.odak === '40mm' && kur.saglam.diyafram === 'f/2.8' && kur.saglam.enstantane === '1/60' && kur.saglam.iso === '6400', kur.saglam);
bekle('bozuk dosya: tarih kalır', kur.bozuk.cekim_gunu === '2026-09-19', kur.bozuk);
bekle('bozuk dosya: üçü aynı sayıysa diyafram, enstantane, odak boş', kur.bozuk.diyafram === null && kur.bozuk.enstantane === null && kur.bozuk.odak === null, kur.bozuk);
bekle('bozuk dosya: denetim karakterinden ibaret objektif boş', kur.bozuk.objektif === null, kur.bozuk);
bekle('bozuk dosya: sağlam kalan ISO durur', kur.bozuk.iso === '6400', kur.bozuk);
bekle('uzun pozlama bozuk sayılmaz', kur.uzunPoz.enstantane === '30s' && kur.uzunPoz.diyafram === 'f/8' && kur.uzunPoz.odak === '24mm', kur.uzunPoz);
bekle('tek başına anlamsız diyafram boş, diğerleri durur', kur.sacmaDiyafram.diyafram === null && kur.sacmaDiyafram.odak === '50mm' && kur.sacmaDiyafram.enstantane === '1/125', kur.sacmaDiyafram);
bekle('tek başına anlamsız odak boş, diğerleri durur', kur.sacmaOdak.odak === null && kur.sacmaOdak.diyafram === 'f/2.8' && kur.sacmaOdak.enstantane === '1/200', kur.sacmaOdak);
bekle('iki saatlik pozlama boş, diğerleri durur', kur.sacmaPoz.enstantane === null && kur.sacmaPoz.odak === '35mm' && kur.sacmaPoz.diyafram === 'f/4', kur.sacmaPoz);
bekle('alt sınırın altındaki değerler boş (üçü farklı, bozuk kuralı devrede değil)', kur.altSinir.odak === null && kur.altSinir.diyafram === null && kur.altSinir.enstantane === null, kur.altSinir);

await b.close();
for (const x of sonuclar) console.log(x.ok ? 'GEÇTİ ' : 'KALDI ', x.ad, x.ayrinti ? '→ ' + x.ayrinti : '');
const k = sonuclar.filter(x => !x.ok).length;
console.log(`\n${sonuclar.length - k}/${sonuclar.length} geçti`);
process.exit(k ? 1 : 0);
