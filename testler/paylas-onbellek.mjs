// Paylaşım kartı fotoğrafı (karar 127, kod incelemesi F3). R2, Origin'siz isteğe CORS başlığı koymuyor ve Vary
// göndermiyor; Sonuç/Wrapped aynı imzalı adresi CORS'suz <img> ile önbelleğe aldıktan sonra kartın CORS'lu
// yüklemesi önbellekten gelip reddediliyordu (canlıda 2026-10-06 ölçüldü). Burada R2 gibi davranan bir sunucu var.
import http from 'node:http';
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
const jpg = fs.readFileSync('/tmp/cgapp/dogru.jpg');
const sunucu = http.createServer((q, s) => {
  const h = { 'content-type': 'image/jpeg', 'cache-control': 'max-age=31536000' };
  if (q.headers.origin) h['access-control-allow-origin'] = q.headers.origin;   // R2: yalnız Origin'li isteğe, Vary yok
  // Süresi geçmiş imza: R2 403 dönüyor. Gövde bilerek geçerli bir JPEG; null'ı yalnız durum denetimi verebilir
  if (q.url.startsWith('/suresi-gecmis.jpg')) { s.writeHead(403, h); s.end(jpg); return; }
  // 200 ve CORS var ama gövde resim değil: çözme hatası (im.onerror) yolu
  if (q.url.startsWith('/bozuk.jpg')) { s.writeHead(200, h); s.end('<Error><Code>NoSuchKey</Code></Error>'); return; }
  s.writeHead(200, h); s.end(jpg);
}).listen(8767, '127.0.0.1');
const b = await chromium.launch(); const hatalar = [];
try {
  const p = await (await b.newContext()).newPage();
  p.on('pageerror', e => hatalar.push(String(e)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  const sonuc = await p.evaluate(async () => {
    const url = 'http://127.0.0.1:8767/kare.jpg?X-Amz-Signature=abc';
    // Sonuç ekranı: CORS'suz <img>, tarayıcı önbelleğe alıyor
    await new Promise(r => { const i = new Image(); i.onload = r; i.onerror = r; i.src = url; });
    const { resimYukle } = await import('/src/lib/resim.ts');
    const im = await resimYukle(url);
    if (!im) return 'yuklenemedi';
    const c = document.createElement('canvas'); c.width = 8; c.height = 8; c.getContext('2d').drawImage(im, 0, 0, 8, 8);
    try { c.toDataURL('image/png'); return 'tamam'; } catch (e) { return 'kirli: ' + e.name; }
  });
  bekle('önbellekteki CORS\'suz kopyadan sonra kart fotoğrafı çizilebiliyor', sonuc === 'tamam', sonuc);
  const bos = await p.evaluate(async () => (await (await import('/src/lib/resim.ts')).resimYukle(null)) === null);
  bekle('adres yoksa resim yok', bos);
  const yok = await p.evaluate(async () => (await (await import('/src/lib/resim.ts')).resimYukle('http://127.0.0.1:9/yok.jpg')) === null);
  bekle('indirilemeyen resim null (kart fotoğrafsız çiziliyor)', yok);
  // Yanıt gelmezse (çözme hatası yutulursa) söz hiç bitmiyor; süre sınırı bunu KALDI'ya çeviriyor
  const dene = adres => p.evaluate(async u => {
    const { resimYukle } = await import('/src/lib/resim.ts');
    const s = await Promise.race([resimYukle(u), new Promise(r => setTimeout(() => r('bitmedi'), 5000))]);
    return s === null ? 'null' : s === 'bitmedi' ? 'bitmedi' : 'resim döndü';
  }, adres);
  const yasak = await dene('http://127.0.0.1:8767/suresi-gecmis.jpg?X-Amz-Signature=eski');
  bekle('403 (süresi geçmiş imza, CORS başlığıyla) resim null', yasak === 'null', yasak);
  const bozuk = await dene('http://127.0.0.1:8767/bozuk.jpg?X-Amz-Signature=abc');
  bekle('200 ama resim olmayan gövde null', bozuk === 'null', bozuk);
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); sunucu.close(); }
rapor();
