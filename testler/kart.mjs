// Kart sistemi denetimi (karar 118): köşe, iç boşluk, çizgi kalıntısı, taşma.
// Veri: siralama.mjs'nin bıraktığı kulüp. WebKit iPhone 14, dar ekran (320px) da deneniyor.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
// Sonraki geçişler buraya kendi ekranlarını ekliyor
const son = (await admin.from('etkinlikler').select('id').eq('iptal', false).lt('oylama_biter', new Date().toISOString()).order('bulusma_gunu', { ascending: false }).limit(1)).data?.[0];
// Karesi olmayan üyenin profili boş durum kartlarını gösteriyor
const kareliler = new Set(((await admin.from('kareler').select('sahip')).data ?? []).map(k => k.sahip));
const bosUye = ((await admin.from('uyeler').select('id')).data ?? []).find(u => !kareliler.has(u.id));
const EKRANLAR = ['siralama', ...(son ? [`sonuc/${son.id}`] : []), 'etkinlikler', 'profil', ...(bosUye ? [`profil/${bosUye.id}`] : [])];

const b = await webkit.launch();
try {
  for (const genislik of [390, 320]) {
    const p = await (await b.newContext({ ...devices['iPhone 14'], viewport: { width: genislik, height: 900 } })).newPage();
    await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
    await p.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });
    for (const yol of EKRANLAR) {
      await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2500);
      const r = await p.evaluate(() => {
        const px = v => parseFloat(v) || 0;
        const kartlar = [...document.querySelectorAll('.kart, .satir-kartlari > *, .bos-kart, .mud-kart, .odul .kazanan, .live')];
        const koseler = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
        const koseHatali = kartlar.filter(k => koseler.some(y => px(getComputedStyle(k)[y]) !== 8)).map(k => k.className);
        // Birincinin kartında fotoğraf kenardan kenara; boşluğu künye şeridi taşıyor
        const bosluk = [...kartlar.filter(k => !k.matches('.odul .kazanan')), ...document.querySelectorAll('.odul .serit')].filter(k => { const s = getComputedStyle(k); return px(s.paddingLeft) < 12 || px(s.paddingRight) < 12; }).map(k => k.className);
        const foto = [...document.querySelectorAll('.kart img, .satir-kartlari img, .izgara img, .kursu img')].filter(i => px(getComputedStyle(i).borderTopLeftRadius) !== 4).length;
        const kalin = [...document.querySelectorAll('.sc *')].filter(e => px(getComputedStyle(e).borderTopWidth) >= 2 && !e.closest('.kunye, .tabs, .prog, .sekmeler')).map(e => e.className);
        const tasma = kartlar.filter(k => { const kb = k.getBoundingClientRect(); return [...k.querySelectorAll('*')].some(c => { const cb = c.getBoundingClientRect(); return cb.width > 0 && (cb.right > kb.right + 1 || cb.bottom > kb.bottom + 1); }); }).map(k => k.className);
        // Kesik çizgili boş kutular kartla yer değiştirdi; kartın kendisinde ve içinde çizgi yok
        const kesik = [...document.querySelectorAll('.sc *')].filter(e => getComputedStyle(e).borderTopStyle === 'dashed').map(e => e.className);
        const ayrac = kartlar.flatMap(k => [k, ...k.querySelectorAll('*')]).filter(e => { const s = getComputedStyle(e); return !e.matches('.box') && (px(s.borderTopWidth) >= 1 || px(s.borderRightWidth) >= 1 || px(s.borderBottomWidth) >= 1); }).map(e => e.className);
        // Bölüm başlığı anlamca da başlık (ekran okuyucu başlıktan başlığa atlıyor)
        const basliksiz = [...document.querySelectorAll('.kart-bas')].filter(e => e.tagName !== 'H2').length;
        const dugme = [...document.querySelectorAll('.sc .btn')].filter(d => px(getComputedStyle(d).borderTopLeftRadius) !== 6).length;
        // Kendi adının çipi ince (en çok 24px), dokunma alanı düğmede (en az 44px)
        const cip = [...document.querySelectorAll('.isimler .me')].map(c => ({ c: Math.round(c.getBoundingClientRect().height), d: Math.round(c.closest('button').getBoundingClientRect().height) }));
        return { sayi: kartlar.length, basliksiz, kesik: kesik.slice(0, 4), ayrac: [...new Set(ayrac)].slice(0, 4), koseHatali, bosluk, foto, kalin: kalin.slice(0, 4), tasma: tasma.slice(0, 4), dugme, cip };
      });
      const ad = `${yol} (${genislik}px)`;
      bekle(`${ad}: kart var (kontrol)`, r.sayi > 0, String(r.sayi));
      if (yol.startsWith('profil/')) bekle(`${ad}: boş durum kartları var (kontrol)`, (await p.locator('.bos-kart').count()) === 3);
      if (yol.startsWith('sonuc/')) {
        const w = await p.evaluate(() => { const s = document.querySelector('.sekmeler'); return s && Math.round(s.getBoundingClientRect().width); });
        bekle(`${ad}: tema sekmeleri boydan boya`, w === genislik, String(w));
      }
      bekle(`${ad}: bütün kart köşeleri 8px`, r.koseHatali.length === 0, r.koseHatali.join(' | '));
      bekle(`${ad}: kart iç boşluğu en az 12px`, r.bosluk.length === 0, r.bosluk.join(' | '));
      bekle(`${ad}: fotoğraf köşeleri 4px`, r.foto === 0, String(r.foto));
      bekle(`${ad}: kalın çizgi kalmadı`, r.kalin.length === 0, r.kalin.join(' | '));
      bekle(`${ad}: kart başlıkları h2`, r.basliksiz === 0, String(r.basliksiz));
      bekle(`${ad}: kesik çizgili kutu kalmadı`, r.kesik.length === 0, r.kesik.join(' | '));
      bekle(`${ad}: kartta ve içinde çizgi yok`, r.ayrac.length === 0, r.ayrac.join(' | '));
      bekle(`${ad}: kart içeriği taşmıyor`, r.tasma.length === 0, r.tasma.join(' | '));
      bekle(`${ad}: düğme köşeleri 6px`, r.dugme === 0, String(r.dugme));
      bekle(`${ad}: kendi adının çipi ince, dokunma alanı 44px`, r.cip.every(x => x.c <= 24 && x.d >= 44), JSON.stringify(r.cip));
    }
  }
} finally {
  await b.close();
}
rapor();
