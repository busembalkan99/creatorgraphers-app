// Dikey karelerin sündürülmesi (2026-09-30, canlıda): iOS 16 yedek yolu kareyi <img> ile çözüp tuvale çiziyordu;
// boyutu tarayıcının çevrilmiş boyutundan alıyordu. Çizim çevirmeyi uygulamayan tarayıcıda yatay ham çizim dikey
// tuvale sünerek basılıyordu. Burada eski Safari taklit ediliyor: createImageBitmap 'from-image'i reddediyor,
// <img> boyutu çevrilmiş ama drawImage ham çiziyor. Beklenen: kare dikey ve yönü doğru (üstü kırmızı, altı mavi).
import fs from 'node:fs';
import { chromium, webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';

// Fikstür: ham 1200x800, sol yarı kırmızı sağ yarı mavi; EXIF Orientation 6 (90° saat yönünde göster)
{
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  await p.setContent('<body style="margin:0;display:flex;height:800px"><div style="width:600px;background:#f00"></div><div style="width:600px;background:#00f"></div></body>');
  const jpg = await p.screenshot({ type: 'jpeg', quality: 92 }); await b.close();
  const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
  const govde = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const uz = Buffer.alloc(2); uz.writeUInt16BE(govde.length + 2);
  fs.writeFileSync('/tmp/cgapp/yonlu.jpg', Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xff, 0xe1]), uz, govde, jpg.subarray(2)]));
}

await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
  yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data;
const tema = (await admin.from('temalar').insert({ etkinlik: e.id, ad: 'Serbest', sira: 1, bulusmada: false }).select('id').single()).data;

const b = await webkit.launch(); const hatalar = [];
try {
  // ---- birimler: yön okuma ve elle çevirme (gerçek WebKit) ----
  const pb = await (await b.newContext()).newPage();
  await pb.goto(APP); await pb.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  const yonlu = fs.readFileSync('/tmp/cgapp/yonlu.jpg').toString('base64'), duz = fs.readFileSync('/tmp/cgapp/dogru.jpg').toString('base64');
  const birim = await pb.evaluate(async ([yonlu, duz]) => {
    const m = await import('/src/lib/kare.ts');
    const bayt = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
    const exifsiz = u => { let i = 2; while (i < u.length - 4 && u[i] === 0xff) { const m = u[i + 1], l = (u[i + 2] << 8) | u[i + 3]; if (m === 0xe1) return new Uint8Array([...u.subarray(0, i), ...u.subarray(i + 2 + l)]); if (m === 0xda) break; i += 2 + l; } return u; };
    const ham = await createImageBitmap(new Blob([exifsiz(new Uint8Array(bayt(yonlu)))], { type: 'image/jpeg' }));
    const renk = (c, x, y) => { const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return d[0] > 180 && d[2] < 80 ? 'k' : d[2] > 180 && d[0] < 80 ? 'm' : '?'; };
    const ciz = (yon, g, y) => { const c = document.createElement('canvas'); c.width = g; c.height = y; m.yonluCiz(c.getContext('2d'), ham, yon, g, y); return c; };
    const c6 = ciz(6, 80, 120), c8 = ciz(8, 80, 120), c3 = ciz(3, 120, 80), c1 = ciz(1, 120, 80);
    return {
      yon6: m.yonOku(bayt(yonlu)), yon1: m.yonOku(bayt(duz)),
      // Makineler (Canon, Nikon, Sony, Fuji) EXIF'i little-endian (II) yazıyor; iki girdili IFD, çevirme ikinci sırada
      yonII: m.yonOku(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x2e, 0x45, 0x78, 0x69, 0x66, 0, 0,
        0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 2, 0,
        0x0f, 0x01, 2, 0, 1, 0, 0, 0, 0x41, 0, 0, 0,
        0x12, 0x01, 3, 0, 1, 0, 0, 0, 8, 0, 0, 0,
        0, 0, 0, 0, 0xff, 0xd9]).buffer),
      yonBozuk: m.yonOku(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x78]).buffer),
      yonJpegDegil: m.yonOku(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer),
      r6: renk(c6, 40, 10) + renk(c6, 40, 110), r8: renk(c8, 40, 10) + renk(c8, 40, 110),
      r3: renk(c3, 10, 40) + renk(c3, 110, 40), r1: renk(c1, 10, 40) + renk(c1, 110, 40),
      olcum: await m.cizimOlc(),
    };
  }, [yonlu, duz]);
  bekle('EXIF yönü okunuyor (6 ve etiketsiz 1)', birim.yon6 === 6 && birim.yon1 === 1, JSON.stringify(birim));
  bekle("makine EXIF'i (little-endian) okunuyor: 8", birim.yonII === 8, String(birim.yonII));
  bekle('bozuk başlık ya da JPEG olmayan dosya: 1 (çökmeden)', birim.yonBozuk === 1 && birim.yonJpegDegil === 1, JSON.stringify([birim.yonBozuk, birim.yonJpegDegil]));
  bekle('elle çevirme: 6 → üstü kırmızı, altı mavi', birim.r6 === 'km', birim.r6);
  bekle('elle çevirme: 8 → üstü mavi, altı kırmızı', birim.r8 === 'mk', birim.r8);
  bekle('elle çevirme: 3 → solu mavi, sağı kırmızı', birim.r3 === 'mk', birim.r3);
  bekle('elle çevirme: 1 → olduğu gibi', birim.r1 === 'km', birim.r1);
  bekle('bugünkü WebKit: boyut ve çizim çevrilmiş ölçülüyor (kontrol)', birim.olcum.dogalYonlu && birim.olcum.cizimYonlu, JSON.stringify(birim.olcum));

  // ---- uçtan uca: eski Safari taklidi ----
  const ctx = await b.newContext({ ...devices['iPhone 14'] });
  await ctx.addInitScript(() => {
    const asilCib = window.createImageBitmap;
    window.createImageBitmap = function (k, ...r) {
      const s = r.length === 1 ? r[0] : r[4];
      if (s && s.imageOrientation === 'from-image') return Promise.reject(new TypeError('Type error'));
      return asilCib.call(this, k, ...r);
    };
    // <img> çevrilmiş boyut bildiriyor ama drawImage ham çiziyor
    const asilDecode = HTMLImageElement.prototype.decode;
    // Ham pikseller: EXIF (APP1) silinmiş dosyadan; bugünkü motorlar 'none' ile de çeviriyor
    const exifsiz = u => { let i = 2; while (i < u.length - 4 && u[i] === 0xff) { const m = u[i + 1], l = (u[i + 2] << 8) | u[i + 3]; if (m === 0xe1) return new Uint8Array([...u.subarray(0, i), ...u.subarray(i + 2 + l)]); if (m === 0xda) break; i += 2 + l; } return u; };
    HTMLImageElement.prototype.decode = async function () { await asilDecode.call(this); const u = new Uint8Array(await (await fetch(this.src)).arrayBuffer()); this.__ham = await asilCib(new Blob([exifsiz(u)], { type: 'image/jpeg' })); };
    const asilCiz = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (k, ...r) { return asilCiz.call(this, k && k.__ham ? k.__ham : k, ...r); };
  });
  const p = await ctx.newPage(); p.on('pageerror', x => hatalar.push(String(x)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  const taklit = await p.evaluate(async () => (await import('/src/lib/kare.ts')).cizimOlc?.());
  bekle('taklit: çizim çevirmeyi uygulamıyor ölçülüyor (kontrol)', taklit && taklit.dogalYonlu && !taklit.cizimYonlu, JSON.stringify(taklit));
  await p.goto(APP + '#/yukle'); await p.reload(); await p.waitForTimeout(2500);
  await p.locator('input[type=file]').setInputFiles('/tmp/cgapp/yonlu.jpg'); await p.waitForTimeout(300);
  await p.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1000);
  const k = (await admin.from('kareler').select('dosya, genislik, yukseklik').eq('tema', tema.id).eq('sahip', A.id).maybeSingle()).data;
  bekle('eski Safari: dikey kare dikey boyutla kaydedildi (800x1200)', k?.genislik === 800 && k?.yukseklik === 1200, JSON.stringify(k));
  const dosya = k && Buffer.from(await (await admin.storage.from('kareler').download(k.dosya)).data.arrayBuffer()).toString('base64');
  const icerik = dosya && await pb.evaluate(async s => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(s), c => c.charCodeAt(0))], { type: 'image/jpeg' }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    const renk = (x, y) => { const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return d[0] > 180 && d[2] < 80 ? 'k' : d[2] > 180 && d[0] < 80 ? 'm' : '?'; };
    return renk(bmp.width / 2, 100) + renk(bmp.width / 2, bmp.height - 100) + renk(100, bmp.height / 2) + renk(bmp.width - 100, bmp.height / 2);
  }, dosya);
  bekle('eski Safari: kare sünmemiş, yönü doğru (üstü kırmızı, altı mavi)', icerik?.slice(0, 2) === 'km', `üst/alt/sol/sağ: ${icerik}`);
  // ---- ikinci taklit: <img> boyutu HAM (çevrilmemiş) ama drawImage çeviriyor ----
  // Kullanıcının tarif ettiği "sündürülmüş ama yan yatmamış" görüntü bu durumdan çıkar.
  await admin.from('kareler').delete().eq('tema', tema.id);
  const ctx2 = await b.newContext({ ...devices['iPhone 14'] });
  await ctx2.addInitScript(() => {
    const asilCib = window.createImageBitmap;
    window.createImageBitmap = function (k, ...r) {
      const s = r.length === 1 ? r[0] : r[4];
      if (s && s.imageOrientation === 'from-image') return Promise.reject(new TypeError('Type error'));
      return asilCib.call(this, k, ...r);
    };
    const exifsiz = u => { let i = 2; while (i < u.length - 4 && u[i] === 0xff) { const m = u[i + 1], l = (u[i + 2] << 8) | u[i + 3]; if (m === 0xe1) return new Uint8Array([...u.subarray(0, i), ...u.subarray(i + 2 + l)]); if (m === 0xda) break; i += 2 + l; } return u; };
    const asilDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await asilDecode.call(this);
      const ham = await asilCib(new Blob([exifsiz(new Uint8Array(await (await fetch(this.src)).arrayBuffer()))], { type: 'image/jpeg' }));
      Object.defineProperty(this, 'naturalWidth', { value: ham.width }); Object.defineProperty(this, 'naturalHeight', { value: ham.height });
    };
  });
  const p2 = await ctx2.newPage(); p2.on('pageerror', x => hatalar.push(String(x)));
  await p2.goto(APP); await p2.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p2.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  const taklit2 = await p2.evaluate(async () => (await import('/src/lib/kare.ts')).cizimOlc());
  bekle('ikinci taklit: boyut ham, çizim çevrilmiş ölçülüyor (kontrol)', !taklit2.dogalYonlu && taklit2.cizimYonlu, JSON.stringify(taklit2));
  await p2.goto(APP + '#/yukle'); await p2.reload(); await p2.waitForTimeout(2500);
  await p2.locator('input[type=file]').setInputFiles('/tmp/cgapp/yonlu.jpg'); await p2.waitForTimeout(300);
  await p2.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await p2.waitForTimeout(1000);
  const k2 = (await admin.from('kareler').select('dosya, genislik, yukseklik').eq('tema', tema.id).eq('sahip', A.id).maybeSingle()).data;
  bekle('ikinci taklit: dikey boyutla kaydedildi (800x1200)', k2?.genislik === 800 && k2?.yukseklik === 1200, JSON.stringify(k2));
  const dosya2 = k2 && Buffer.from(await (await admin.storage.from('kareler').download(k2.dosya)).data.arrayBuffer()).toString('base64');
  const icerik2 = dosya2 && await pb.evaluate(async s => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(s), c => c.charCodeAt(0))], { type: 'image/jpeg' }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    const renk = (x, y) => { const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return d[0] > 180 && d[2] < 80 ? 'k' : d[2] > 180 && d[0] < 80 ? 'm' : '?'; };
    return renk(bmp.width / 2, 100) + renk(bmp.width / 2, bmp.height - 100);
  }, dosya2);
  bekle('ikinci taklit: kare sünmemiş, yönü doğru', icerik2 === 'km', String(icerik2));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
