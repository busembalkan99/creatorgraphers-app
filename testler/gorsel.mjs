// Ekran görüntüleri (önce/sonra): node testler/gorsel.mjs <etiket> [yol ...]
// iPhone motoru (WebKit), 390 genişlik, uzun sayfa tek karede.
import fs from 'node:fs';
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
const [etiket = 'simdi', ...yollar] = process.argv.slice(2);
const liste = yollar.length ? yollar : ['siralama', 'profil', 'etkinlikler'];
fs.mkdirSync('/tmp/cgapp/ss', { recursive: true });
const b = await webkit.launch();
try {
  const p = await (await b.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 1600 } })).newPage();
  await p.goto('http://localhost:5180/'); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });
  for (const y of liste) {
    await p.goto('http://localhost:5180/#/' + y); await p.reload(); await p.waitForTimeout(2500);
    const dosya = `/tmp/cgapp/ss/gorsel-${etiket}-${y.replace(/\W+/g, '-')}.png`;
    await p.screenshot({ path: dosya });
    console.log(dosya);
  }
} finally {
  await b.close();
}
