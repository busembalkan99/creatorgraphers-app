// Sunucu hata kodlarının cümleleri (src/lib/supabase.ts, 0026 elle bildirim). hataMetni import.meta.env
// okuduğu için geliştirme sunucusunun açtığı window.__hataMetni üzerinden çağrılıyor (localhost:5180).
import { webkit } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { bekle, rapor } from './ortak.mjs';
const YEDEK = 'Bir şey ters gitti. Tekrar dene.';
const b = await webkit.launch();
try {
  const p = await b.newPage();
  await p.goto('http://localhost:5180/'); await p.waitForFunction(() => window.__hataMetni, null, { timeout: 20000 });
  const m = await p.evaluate(k => k.map(x => window.__hataMetni({ message: x })), ['elle_sinir', 'alici_yok', 'metin_gecersiz']);
  bekle('elle_sinir kendi cümlesi', m[0] !== YEDEK && m[0].includes('hakkı doldu'), m[0]);
  bekle('alici_yok kendi cümlesi', m[1] !== YEDEK && m[1].includes('kimse kalmadı'), m[1]);
  bekle('metin_gecersiz kendi cümlesi, boşluğu da söylüyor', m[2] !== YEDEK && m[2].includes('40') && m[2].includes('140') && m[2].includes('boş'), m[2]);
} finally { await b.close(); }
rapor();
