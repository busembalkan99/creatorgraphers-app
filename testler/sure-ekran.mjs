// Aşama: bitiş saatlerini değiştirme ve oylamayı bitirme (0022, Buse 2026-10-03), ekran.
// Sunucu kuralları sure.mjs'te; burada düğmelerin nerede göründüğü, saat kutusu, onay ve hata metinleri.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { kartDenetle } from './kartDenetim.mjs';
import { girdiDegeri } from '../src/lib/zaman.ts';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
  yukleme_baslar: saat(-2), yukleme_biter: saat(20), oylama_biter: saat(44), kuran: A.id }).select('id').single()).data.id;
await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true });
const oku = async () => (await admin.from('etkinlikler').select('yukleme_biter, oylama_biter').eq('id', E).single()).data;
const dk = iso => Math.round(Date.parse(iso) / 60000);

const b = await webkit.launch(); const hatalar = [];
const ctx = await b.newContext({ ...devices['iPhone 14'] });
const p = await ctx.newPage(); p.on('pageerror', e => hatalar.push(String(e)));
await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
await p.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });
const ac = async () => { await p.goto(APP + '#/asama'); await p.reload(); await p.waitForTimeout(2200); };
const satir = ad => p.locator('.kart.ozet > div', { hasText: ad });
const degistir = ad => satir(ad).getByRole('button', { name: 'Değiştir' });
const ss = ad => p.screenshot({ path: `/tmp/cgapp/ss/${ad}.png`, fullPage: true });
const yazi = async s => ((await p.locator(s).first().textContent({ timeout: 1500 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
// Saat kutusuna yaz: React'in onChange'i için yerleşik setter + input olayı (WebKit fill'i datetime-local'de güvenilmez)
const kutuyaYaz = v => p.locator('input[type=datetime-local]').evaluate((el, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
}, v);

try {
  // ---------------------------------------------- yükleme sürerken
  await ac();
  bekle('yüklemede: son yükleme değiştirilebiliyor', (await degistir('Son yükleme').count()) === 1, await yazi('.kart.ozet'));
  bekle('yüklemede: son oy değiştirilebiliyor', (await degistir('Son oy').count()) === 1);
  await ss('89-asama-yukleme');
  bekle('yüklemede: oylamayı bitir yok', (await p.getByRole('button', { name: 'Oylamayı bitir' }).count()) === 0);

  await degistir('Son yükleme').click(); await p.waitForTimeout(300);
  const ilk = (await oku()).yukleme_biter;
  bekle('kutu şimdiki son yükleme saatiyle açılıyor (İstanbul saati)', (await p.locator('input[type=datetime-local]').inputValue()) === girdiDegeri(ilk), await p.locator('input[type=datetime-local]').inputValue());
  bekle('kutunun başlığı ne değiştiğini söylüyor', /Son yükleme/.test(await yazi('.kart.saat-kutu')), await yazi('.kart.saat-kutu'));
  await kartDenetle(p, 'saat kutusu', bekle);
  await ss('90-asama-saat-kutusu');
  bekle('düzenlerken diğer Değiştir gizli', (await p.getByRole('button', { name: 'Değiştir' }).count()) === 0);
  bekle('düzenlerken 24 saat uzat ve Oylamayı aç gizli', (await p.getByRole('button', { name: '24 saat uzat' }).count()) === 0 && (await p.getByRole('button', { name: 'Oylamayı aç' }).count()) === 0);
  bekle('kutunun notu kilidi söylüyor', /Oylama açılınca son yükleme artık değişmez\./.test(await yazi('.kart.saat-kutu')));
  // Boş değer: sunucuya gitmeden uyarı, kutu açık
  await kutuyaYaz('');
  await p.getByRole('button', { name: 'Kaydet' }).click(); await p.waitForTimeout(600);
  bekle('boş saat: uyarı, kutu açık, sunucu aynı', /Bir tarih ve saat seç\./.test(await yazi('.hata')) && (await p.locator('.kart.saat-kutu').count()) === 1 && (await oku()).yukleme_biter === ilk, await yazi('.hata'));
  await kutuyaYaz(girdiDegeri(saat(30)));
  await p.getByRole('button', { name: 'Vazgeç' }).click(); await p.waitForTimeout(500);
  bekle('Vazgeç: saat değişmedi, kutu kapandı', (await oku()).yukleme_biter === ilk && (await p.locator('.kart.saat-kutu').count()) === 0);

  await degistir('Son yükleme').click(); await p.waitForTimeout(300);
  const yeni = girdiDegeri(saat(30));
  await kutuyaYaz(yeni);
  await p.getByRole('button', { name: 'Kaydet' }).click(); await p.waitForTimeout(1500);
  let s = await oku();
  bekle('Kaydet: son yükleme sunucuda yeni saat', girdiDegeri(s.yukleme_biter) === yeni, JSON.stringify({ s, yeni }));
  bekle('Kaydet: kutu kapandı, satır yeni saati gösteriyor', (await p.locator('.kart.saat-kutu').count()) === 0 && (await satir('Son yükleme').textContent()).includes(yeni.slice(11).replace(':', '.')), await yazi('.kart.ozet'));

  // Geçmiş saat: sunucunun hatası Türkçe metinle, kutu açık kalıyor
  await degistir('Son yükleme').click(); await p.waitForTimeout(300);
  await kutuyaYaz(girdiDegeri(saat(-3)));
  await p.getByRole('button', { name: 'Kaydet' }).click(); await p.waitForTimeout(1200);
  bekle('geçmiş saat: anlaşılır hata', /Geçmiş bir saat seçilemez/.test(await yazi('.hata')), await yazi('.hata'));
  await ss('92-asama-saat-hata');
  bekle('geçmiş saat: kutu açık kalıyor', (await p.locator('.kart.saat-kutu').count()) === 1);
  bekle('hata bir kez görünüyor (kutunun içinde)', (await p.locator('.hata').count()) === 1 && (await p.locator('.kart.saat-kutu .hata').count()) === 1);
  await kutuyaYaz(girdiDegeri(saat(50)));
  await p.getByRole('button', { name: 'Kaydet' }).click(); await p.waitForTimeout(1200);
  bekle('oy bitişinden sonraya alınan yükleme: anlaşılır hata', /Son oy, son yüklemeden sonra olmalı/.test(await yazi('.hata')), await yazi('.hata'));
  await p.getByRole('button', { name: 'Vazgeç' }).click(); await p.waitForTimeout(400);
  bekle('Vazgeç hatayı da kapatıyor', (await p.locator('.hata').count()) === 0);

  await degistir('Son oy').click(); await p.waitForTimeout(300);
  bekle('son oy kutusu şimdiki son oy saatiyle açılıyor', (await p.locator('input[type=datetime-local]').inputValue()) === girdiDegeri((await oku()).oylama_biter) && /Son oy/.test(await yazi('.kart.saat-kutu .bas')));
  const oy = girdiDegeri(saat(60));
  await kutuyaYaz(oy);
  await p.getByRole('button', { name: 'Kaydet' }).click(); await p.waitForTimeout(1500);
  bekle('son oy değişti, son yükleme aynı', girdiDegeri((await oku()).oylama_biter) === oy && (await oku()).yukleme_biter === s.yukleme_biter);
  bekle('grup mesajı yeni son yükleme saatini söylüyor', (await yazi('.mesaj p')).includes(yeni.slice(11).replace(':', '.')), await yazi('.mesaj p'));

  // ---------------------------------------------- oylama sürerken
  await admin.from('etkinlikler').update({ yukleme_biter: saat(-1), oylama_biter: saat(24) }).eq('id', E);
  // Sayfa zaten Aşama'dayken reload uçuştaki isteği kesip WebKit'te sayfa hatası üretiyor: sekmeden dön
  await p.goto(APP + '#/profil'); await p.waitForTimeout(1200); await p.goto(APP + '#/asama'); await p.waitForTimeout(2200);
  bekle('oylamada: son yükleme kilitli (isimsizlik)', (await degistir('Son yükleme').count()) === 0 && (await satir('Son yükleme').count()) === 1);
  bekle('oylamada: son oy değiştirilebiliyor', (await degistir('Son oy').count()) === 1);
  bekle('oylamada: oylamayı bitir var', (await p.getByRole('button', { name: 'Oylamayı bitir' }).count()) === 1);

  await p.getByRole('button', { name: 'Oylamayı bitir' }).click(); await p.waitForTimeout(300);
  bekle('onay açıkken Değiştir gizli', (await p.getByRole('button', { name: 'Değiştir' }).count()) === 0);
  bekle('onay: soru ve sonucu söylüyor', /Oylama şimdi bitsin mi\?/.test(await yazi('.kart.kutu')) && /Sonuçlar hemen açılır\. Geri alınamaz\./.test(await yazi('.kart.kutu')), await yazi('.kart.kutu'));
  await kartDenetle(p, 'oylamayı bitir onayı', bekle);
  await ss('91-asama-oylamayi-bitir');
  await p.getByRole('button', { name: 'Vazgeç' }).click(); await p.waitForTimeout(400);
  bekle('Vazgeç: oylama sürüyor', (await admin.rpc('etkinlik_asamasi', { p_etkinlik: E })).data === 'oylama');

  // Sunucu reddederse (oylama bu arada bitti): hata, kutu kapalı, sonuç ekranına gitmiyor
  await p.getByRole('button', { name: 'Oylamayı bitir' }).click(); await p.waitForTimeout(300);
  await admin.from('etkinlikler').update({ oylama_biter: saat(-0.01) }).eq('id', E);
  await p.locator('.kart.kutu').getByRole('button', { name: 'Oylamayı bitir' }).click(); await p.waitForTimeout(1200);
  bekle('reddedilince: hata metni, kutu kapalı, Aşama\'da kalıyor', /Oylama sürmüyor\./.test(await yazi('.hata')) && !/Oylama şimdi bitsin mi/.test(await yazi('.kart.kutu')) && p.url().includes('#/asama'), `${await yazi('.hata')} | ${p.url()}`);
  await admin.from('etkinlikler').update({ oylama_biter: saat(24) }).eq('id', E);
  await p.getByRole('button', { name: 'Oylamayı bitir' }).click(); await p.waitForTimeout(300);
  await p.locator('.kart.kutu').getByRole('button', { name: 'Oylamayı bitir' }).click(); await p.waitForTimeout(2500);
  bekle('onaylayınca sonuçlar açıldı', (await admin.rpc('etkinlik_asamasi', { p_etkinlik: E })).data === 'sonuc');
  bekle('onaylayınca sonuçlar ekranına gidiyor', p.url().includes(`#/sonuc/${E}`), p.url());

  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally {
  await b.close();
}
rapor();
