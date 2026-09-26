// Kart sistemi denetimi (karar 118): köşe, iç boşluk, çizgi kalıntısı, taşma.
// Veri: siralama.mjs'nin bıraktığı kulüp. WebKit iPhone 14, dar ekran (320px) da deneniyor.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, bekle, rapor } from './ortak.mjs';
import { kartDenetle } from './kartDenetim.mjs';
const APP = 'http://localhost:5180/';
// Sonraki geçişler buraya kendi ekranlarını ekliyor
const son = (await admin.from('etkinlikler').select('id').eq('iptal', false).lt('oylama_biter', new Date().toISOString()).order('bulusma_gunu', { ascending: false }).limit(1)).data?.[0];
// Karesi olmayan üyenin profili boş durum kartlarını gösteriyor
const kareliler = new Set(((await admin.from('kareler').select('sahip')).data ?? []).map(k => k.sahip));
const bosUye = ((await admin.from('uyeler').select('id')).data ?? []).find(u => !kareliler.has(u.id));
const EKRANLAR = ['siralama', ...(son ? [`sonuc/${son.id}`] : []), 'etkinlikler', 'profil', 'kur', 'uyeler', ...(bosUye ? [`profil/${bosUye.id}`] : [])];

// Bir ekranın kart denetimi; ad raporda görünüyor
async function denetle(p, yol, genislik, ad = `${yol} (${genislik}px)`) {
  await kartDenetle(p, ad, bekle);
  const dolu = async ad2 => { const d = p.getByRole('button', { name: ad2, exact: true }); return (await d.count()) === 1 && !((await d.getAttribute('class', { timeout: 1000 })) ?? '').split(' ').includes('ik'); };
  // Vurgu: ekranın ana bilgisi (Buse, 2026-09-26)
  const boy = async sec => p.locator(sec).first().evaluate(e => parseFloat(getComputedStyle(e).fontSize), null, { timeout: 1000 }).catch(() => 0);
  const yazi = async sec => ((await p.locator(sec).first().textContent({ timeout: 1000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  if (yol === 'profil') {
    bekle(`${ad}: profil sayıları 26px`, (await boy('.kart.stats b')) >= 26, String(await boy('.kart.stats b')));
    bekle(`${ad}: ortalaman sayılar kartında`, /Ortalama/.test(await yazi('.kart.stats')) && (await boy('.kart.stats .kisisel b')) >= 26, await yazi('.kart.stats'));
  }
  if (yol === 'siralama') {
    bekle(`${ad}: üstte senin yerin`, /^\d+ ?Sıralaman ?\d+,\d ?Ortalaman$|^\d+,\d ?Ortalaman ?Sıralamaya girmedin/.test(await yazi('.sen-yeri')) && (await boy('.sen-yeri b')) >= 26, await yazi('.sen-yeri'));
    const lider = await boy('.satir-kartlari .row.lider .av'), diger = await boy('.satir-kartlari .row:not(.lider) .av');
    bekle(`${ad}: liderin puanı diğerlerinden büyük`, lider > diger && diger > 0, `${lider} / ${diger}`);
  }
  if (yol.startsWith('sonuc/')) bekle(`${ad}: seçili sekme sessiz (dolgu yok, çizgisi ve yazısı ana renkte)`, await p.locator('.sekmeler button.on').evaluate(e => { const s = getComputedStyle(e), g = getComputedStyle(document.body).color; return s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderTopColor === g && s.color === g; }, null, { timeout: 1000 }).catch(() => false));
  if (yol.startsWith('sonuc/')) bekle(`${ad}: sekmelerin altında senin karen`, (/^\d+ ?Sıran ?\d+,\d ?Puanın$|^\d+,\d ?Puanın ?Karen sıralamaya girmedi/.test(await yazi('.senin')) && (await boy('.senin b')) >= 26 || /^Karen yarışmadan çıkarıldı/.test(await yazi('.senin'))), await yazi('.senin'));
  if (ad.startsWith('etkinlikler (')) bekle(`${ad}: geçmiş etkinlikte kazanan adı`, /: [A-ZÇĞİÖŞÜ]/.test(await yazi('.satir-kartlari .ev .alt')), await yazi('.satir-kartlari .ev .alt'));
  if (ad.startsWith('asama (')) {
    bekle(`${ad}: kalan süre büyük`, (await boy('.durum b')) >= 17 && /\d/.test(await yazi('.durum b')), await yazi('.durum'));
    bekle(`${ad}: durum satırında toplam kare`, / \d+ kare/.test(await yazi('.durum')), await yazi('.durum'));
    bekle(`${ad}: tema kare sayıları ana renkte`, await p.locator('.kart.ozet .sayi').first().evaluate(e => getComputedStyle(e).color === getComputedStyle(document.body).color, null, { timeout: 1000 }).catch(() => false));
  }
  if (yol === 'kur') bekle(`${ad}: büyük başlıkla ilk alan arasında nefes`, await p.evaluate(() => { const h = document.querySelector('.sc > h2.t'); const n = h?.nextElementSibling; return !!n && n.getBoundingClientRect().top - h.getBoundingClientRect().bottom >= 20; }));
  if (yol === 'kur') bekle(`${ad}: son yükleme vurgulu özet`, /\d/.test(await yazi('.kur-ozet b')) && (await boy('.kur-ozet b')) >= 17, await yazi('.kur-ozet'));
  if (yol === 'kur' || yol === 'asama') bekle(`${ad}: sayfa başlığı büyük`, (await p.locator('.sc > h2.t').count()) === 1);
  if (yol === 'uyeler' && !(await p.locator('.istek').count())) bekle(`${ad}: istek yokken boş durum kartı`, (await p.locator('.bos-kart', { hasText: 'Bekleyen istek yok' }).count()) === 1);
  if (ad.startsWith('etkinlikler (')) bekle(`${ad}: açık etkinlik yokken "Etkinliği kur" dolu`, await dolu('Etkinliği kur'));
  if (ad.startsWith('asama (')) bekle(`${ad}: buluşma günü "Yoklamayı al" dolu`, await dolu('Yoklamayı al'));
  if (yol.startsWith('sonuc/') && (await p.getByRole('button', { name: 'Kartını paylaş' }).count())) bekle(`${ad}: "Kartını paylaş" dolu`, await dolu('Kartını paylaş'));
    if (yol.startsWith('profil/')) bekle(`${ad}: boş durum kartları var (kontrol)`, (await p.locator('.bos-kart').count()) === 3);
    if (yol.startsWith('sonuc/')) {
      const w = await p.evaluate(() => { const s = document.querySelector('.sekmeler'); return s && Math.round(s.getBoundingClientRect().width); });
      bekle(`${ad}: tema sekmeleri boydan boya`, w === genislik, String(w));
    }
}

// Açık etkinlik: yönetim (Aşama) ve canlı kart. Buluşma günü bugün, yoklama açık.
const kuran = (await admin.from('uyeler').select('id').eq('eposta', 'kurucu@test.local').single()).data.id;
const saat = n => new Date(Date.now() + n * 3600000).toISOString();
const acik = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }),
  yukleme_baslar: saat(-2), yukleme_biter: saat(20), oylama_biter: saat(44), kuran }).select('id').single()).data;
for (const [i, ad] of ['Gölge', 'Kalabalık'].entries()) await admin.from('temalar').insert({ etkinlik: acik.id, ad, sira: i + 1, bulusmada: i === 0 });

const b = await webkit.launch();
try {
  for (const genislik of [390, 320]) {
    const p = await (await b.newContext({ ...devices['iPhone 14'], viewport: { width: genislik, height: 900 } })).newPage();
    await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
    await p.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });
    // Kurulum ekranı açık etkinlik yokken; önce onu, sonra etkinliği açıp gerisini
    await admin.from('etkinlikler').update({ iptal: true }).eq('id', acik.id);
    for (const yol of EKRANLAR) {
      await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2500);
      await denetle(p, yol, genislik);
    }
    await admin.from('etkinlikler').update({ iptal: false }).eq('id', acik.id);
    await p.goto(APP + '#/etkinlikler'); await p.reload(); await p.waitForTimeout(2500);
    bekle(`canlı kart var (kontrol, ${genislik}px)`, (await p.locator('.live').count()) === 1);
    await denetle(p, 'etkinlikler', genislik, `etkinlikler canlı (${genislik}px)`);
    await p.goto(APP + '#/asama'); await p.reload(); await p.waitForTimeout(2500);
    await denetle(p, 'asama', genislik);
    await p.getByRole('button', { name: 'Yoklamayı al' }).click(); await p.waitForTimeout(500);
    await p.getByRole('button', { name: 'İptali başlat' }).click(); await p.waitForTimeout(500);
    bekle(`aşama: yoklama listesi ve iptal kutusu açık (kontrol, ${genislik}px)`, (await p.locator('.yoklama .izin').count()) > 0 && (await p.locator('.kutu').count()) === 1);
    await denetle(p, 'asama', genislik, `aşama yoklama + iptal (${genislik}px)`);
  }
} finally {
  await b.close();
  await admin.from('etkinlikler').update({ iptal: true }).eq('id', acik.id);
}
rapor();
