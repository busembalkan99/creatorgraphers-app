import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import exifr from '../node_modules/exifr/dist/full.esm.mjs';
import { admin, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
const SS = '/tmp/cgapp/ss';
import fs from 'node:fs'; fs.mkdirSync(SS, { recursive: true });
await sifirla();
for (const e of ['kurucu@test.local', 'selin@test.local']) {
  const { data } = await admin.auth.admin.listUsers();
  if (!data.users.find(u => u.email === e)) await admin.auth.admin.createUser({ email: e, password: 'test-sifre-1', email_confirm: true });
}
const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

const b = await chromium.launch();
const hatalar = [];
async function kisi(eposta) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5180' });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(`${eposta}: ${e}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) hatalar.push(`${eposta}: ${m.text()}`); });
  await p.goto(APP);
  await p.waitForFunction(() => window.__sb);
  p.giris = async () => {
    p.kimlik = await p.evaluate(async e => {
      const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' });
      if (r.error) throw r.error;
      return r.data.user.id;
    }, eposta);
    await p.reload(); await p.waitForTimeout(700);
  };
  return p;
}
const metin = p => p.locator('.app').innerText();
const icerir = (a, b) => a.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR').includes(b.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR'));
const yaz = (p, sec, i = 0) => p.evaluate(([s, j]) => (document.querySelectorAll(s)[j]?.textContent ?? '').trim(), [sec, i]);
const bekleMetin = (p, t) => p.getByText(t, { exact: false }).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
async function olc(p, ad) {
  // Sayfa geçişi sürerken ekran yandan kayıyor; ölçüm oturmuş ekranda yapılsın.
  // Sonsuz dönen yükleme çubuğu beklenmez.
  await p.waitForFunction(() => document.getAnimations().every(a =>
    a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 3000 });
  const r = await p.evaluate(() => {
    const sc = document.querySelector('.sc');
    const tasma = [...document.querySelectorAll('.app *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > window.innerWidth + 1 || b.left < -1) && !e.closest('.kapak'); }).map(e => e.className).slice(0, 3);
    const kucuk = [...document.querySelectorAll('.app button:not([disabled])')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height < 44 && !e.classList.contains('k'); }).map(e => e.textContent.trim()).slice(0, 3);
    const karar = /karar\s*\d/i.test(document.querySelector('.app').innerText);
    return { tasma, kucuk, karar };
  });
  bekle(`${ad}: taşma yok`, r.tasma.length === 0, JSON.stringify(r.tasma));
  bekle(`${ad}: 44px altı düğme yok`, r.kucuk.length === 0, JSON.stringify(r.kucuk));
  bekle(`${ad}: karar numarası yok`, !r.karar);
  await p.screenshot({ path: `${SS}/${ad}.png`, fullPage: false });
}

// 1 · Kurucu
const A = await kisi('kurucu@test.local');
bekle('kapak: Google ile giriş yap var', await bekleMetin(A, 'Google ile giriş yap'));
await olc(A, '01-kapak');
await A.giris();
bekle('kurucu yok: Kulübü kur ekranı', await bekleMetin(A, 'Kulübü'));
bekle('kur düğmesi ad yokken kapalı', await A.locator('button.btn', { hasText: 'Kulübü kur' }).isDisabled());
await A.fill('#kad', 'Ayşe Kaya');
await olc(A, '02-kulubu-kur');
await A.click('button.btn:has-text("Kulübü kur")');
bekle('kurucu Etkinlikler ekranına girer (hoş geldin yok)', await bekleMetin(A, 'Geçmiş etkinlikler'));
bekle('açık etkinlik yok şeridi', icerir(await metin(A), 'henüz kurulmadı'));
await olc(A, '03-etkinlikler-bos');

// 2 · Selin istek bırakır
const B = await kisi('selin@test.local');
await B.giris();
bekle('istek formu', await bekleMetin(B, 'henüz yoksun'));
bekle('Google hesabı görünür', icerir(await metin(B), 'selin@test.local'));
bekle('ad boşken gönder kapalı', await B.locator('button.btn', { hasText: 'İsteği gönder' }).isDisabled());
await B.fill('#ad', 'S');
bekle('tek harfte gönder kapalı', await B.locator('button.btn', { hasText: 'İsteği gönder' }).isDisabled());
await B.fill('#ad', '<b>Selin</b> "Arı"');
await B.fill('#not', 'Ayşe çağırdı');
await olc(B, '04-istek');
await B.click('button.btn:has-text("İsteği gönder")');
bekle('bekliyor ekranı', await bekleMetin(B, 'yöneticide'));
bekle('etiketli ad düz yazı basılır', icerir(await metin(B), '<b>Selin</b> "Arı"'));
await olc(B, '05-bekliyor');

// 3 · Kurucu reddeder
await A.click('.tabs button:has-text("Profil")');
bekle('profilde 1 katılma isteği', await bekleMetin(A, '1 katılma isteği'));
await olc(A, '06-profil-yonetici');
await A.click('button.satir:has-text("katılma isteği")');
bekle('istek kartı', await bekleMetin(A, 'Ayşe çağırdı'));
bekle('ilk istekte tekrar işareti yok', (await A.locator('.tekrar').count()) === 0);
await olc(A, '07-uyeler-istek');
await A.click('.istek button:has-text("Reddet")');
bekle('ret sonucu yazılır', await bekleMetin(A, 'Reddedildi. Kişi görecek'));
bekle('sayaç 0 bekliyor', icerir(await metin(A), '0 bekliyor'));

// 4 · Selin reddi görür, tekrar ister
await B.reload();
bekle('ret ekranı', await bekleMetin(B, 'kabul'));
await olc(B, '08-ret');
await B.click('button.btn:has-text("Tekrar istek bırak")');
bekle('tekrar başlığı', await bekleMetin(B, 'Tekrar'));
bekle('ad önceki istekten gelir', (await B.inputValue('#ad')) === '<b>Selin</b> "Arı"');
bekle('not boş gelir', (await B.inputValue('#not')) === '');
await B.fill('#ad', 'Selin Arı');
await B.click('button.btn:has-text("İsteği gönder")');
bekle('tekrar bekliyor', await bekleMetin(B, 'yöneticide'));
bekle('notsuz özet', icerir(await metin(B), 'Not bırakmadın'));

// 5 · Kurucu onaylar
await A.reload();
bekle('tekrar işareti', await bekleMetin(A, 'Daha önce 1 kez reddedildi'));
bekle('notsuz kart', icerir(await metin(A), 'Not bırakmamış'));
await olc(A, '09-uyeler-tekrar');
await A.click('.istek button:has-text("Onayla")');
bekle('onay sonucu', await bekleMetin(A, 'Onaylandı'));
bekle('üye listesinde Selin', await bekleMetin(A, 'selin@test.local'));
// Düğmeler satıra dokununca açılıyor: kapalıyken görünmemeli
bekle('üye düğmeleri kapalıyken görünmüyor', (await A.locator('.rolakt').count()) === 0);
await A.locator('button.satir.acilir', { hasText: 'selin@test.local' }).click();
await A.waitForTimeout(300);
bekle('satır açılınca durumunu söylüyor',
  (await A.locator('button.satir.acilir', { hasText: 'selin@test.local' }).getAttribute('aria-expanded')) === 'true');
bekle('Selin için Yönetici yap düğmesi', (await A.locator('.rolakt button:has-text("Yönetici yap")').count()) === 1);
await olc(A, '10-uyeler-onay');

// 6 · Selin içeri girer (açık sayfa kendiliğinden fark eder mi: sekmeye dönüş)
await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
bekle('onay sonrası hoş geldin (yenilemeden)', await bekleMetin(B, 'Hoş geldin'));
bekle('ilk ad kullanılır', icerir(await metin(B), 'Selin') && !icerir(await metin(B), 'Arı'));
await olc(B, '11-hosgeldin');
await B.click('button.btn:has-text("Etkinliklere geç")');
bekle('etkinlikler', await bekleMetin(B, 'Geçmiş etkinlikler'));
bekle('üye etkinlik kuramaz', (await B.locator('button:has-text("Etkinliği kur")').count()) === 0);
await B.reload(); await B.waitForTimeout(800);
bekle('hoş geldin bir kez görünür', !icerir(await metin(B), 'Hoş geldin'));
await B.click('.tabs button:has-text("Profil")');
bekle('üye profilinde yönetim yok', await bekleMetin(B, 'Kulüp afişi') && !icerir(await metin(B), 'Yönetim'));
// Yeni üye: künye sıfırlarla, üç blok boş (spec 7. bölüm)
bekle('yeni üyenin sayaçları sönük', (await B.locator('.stats.zero').count()) === 1);
bekle('yeni üyede kare yok', icerir(await metin(B), 'Henüz kare yok'), (await metin(B)).slice(0, 200));
bekle('katkı ilk etkinlikten sonra', icerir(await metin(B), 'İlk etkinlikten sonra'));
bekle('çekim tarifi üç kareden sonra', icerir(await metin(B), 'Üç kareden sonra'));
bekle('kendi profilinde ortalama satırı yok', !icerir(await metin(B), 'Ortalaman'));
await olc(B, '12-profil-uye');
await B.goto(APP + '#/uyeler'); await B.waitForTimeout(600);
bekle('üye #/uyeler açınca istekleri görmez', !icerir(await metin(B), 'Katılma istekleri'));
await B.click('.tabs button:has-text("Sıralama")');
bekle('sıralama kilitli', await bekleMetin(B, 'İlk sonuçlarla açılıyor'));
bekle('kilitli sıralamada üç blok', (await B.locator('.empty').count()) === 3,
  String(await B.locator('.empty').count()));
bekle('sonuç yokken Müdavim şeridi yok', (await B.locator('.mud').count()) === 0);
bekle('sezon künyesi kilitliyken de duruyor', icerir(await metin(B), 'Sezon 01') && icerir(await metin(B), '0 / 6'),
  (await metin(B)).slice(0, 160));
await olc(B, '13-siralama');

// 7 · Kurucu etkinlik kurar
await A.goto(APP + '#/etkinlikler'); await A.waitForTimeout(600);
await A.click('button:has-text("Etkinliği kur")');
bekle('kur formu', await bekleMetin(A, 'Yeni etkinlik'));
await A.fill('#bg', bugun);
await A.fill('#yb', `${bugun}T00:00`);
bekle('tema adı yokken kur kapalı', await A.locator('button.btn', { hasText: /^Etkinliği kur$/ }).isDisabled());
await A.fill('#t0', 'Sokak');
await A.click('button:has-text("Tema ekle")');
await A.fill('#t1', 'Portre');
await A.locator('.tema-kur').nth(1).locator('button:has-text("Serbest")').click();
await A.click('button:has-text("Tema ekle")');
await A.fill('#t2', 'Gece');
bekle('3 temada tema ekle kalkar', (await A.locator('button:has-text("Tema ekle")').count()) === 0);
await A.locator('.tema-kur').nth(2).locator('button:has-text("Temayı çıkar")').click();
await A.fill('#os', '24');
bekle('oylama kısa uyarısı', await bekleMetin(A, 'Oylama yüklemeden kısa'));
await A.fill('#os', '72');
await olc(A, '14-kur');
await A.click('button.btn:has-text("Etkinliği kur")');
bekle('aşama ekranı', await bekleMetin(A, 'Yükleme açık'));
const msj = await A.locator('.mesaj p').innerText();
bekle('grup mesajı temaları söyler', msj.includes('Sokak, Portre (serbest)'), msj);
await A.click('.mesaj button');
bekle('kopyalandı', await bekleMetin(A, 'Kopyalandı'));
bekle('pano metni', (await A.evaluate(() => navigator.clipboard.readText())) === msj);
await olc(A, '15-asama');

// 8 · Selin yükler
await B.goto(APP + '#/etkinlikler'); await B.waitForTimeout(800);
bekle('canlı kart yükleme açık, düğme bütün temalar için', await bekleMetin(B, 'Karelerini yükle'));
bekle('canlı kart turuncu', (await B.locator('.live').getAttribute('data-asama')) === 'yukleme');
await olc(B, '16-etkinlikler-canli');
await B.click('.live .act');
bekle('yükleme ekranı', await bekleMetin(B, 'Buluşmada çekilir'));
const giris = B.locator('input[type=file]');
const dosya = async ad => { await giris.setInputFiles(`/tmp/cgapp/${ad}.jpg`); await B.waitForTimeout(300); await B.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await B.waitForTimeout(300); };
await olc(B, '17-yukleme-bos');
// Okuyucu dosyası inmezse (yayında yeni sürüm var, eskisi silinmiş) "tarih yok" denmez, sayfa yenilenir
await B.route('**/exifr*', r => r.abort());
await B.evaluate(() => { window.__eskiSayfa = true; });
await B.click('button.bos');
await giris.setInputFiles('/tmp/cgapp/gps.jpg');
await B.waitForFunction(() => !window.__eskiSayfa, null, { timeout: 8000 }).catch(() => {});
bekle('okuyucu inmezse sayfa yenilenir', !(await B.evaluate(() => window.__eskiSayfa)));
bekle('yenilenince yine yükleme ekranı', await bekleMetin(B, 'Buluşmada çekilir'));
bekle('okuyucu inmeyince "tarih yok" denmez', !icerir(await metin(B), 'Bu dosyada çekim tarihi yok'));
bekle('okuyucu inmeyince kayıt yok', ((await admin.from('kareler').select('id')).data ?? []).length === 0);
// Yenilemek çare olmadıysa ikinci seçimde yeniden yenilenmez, sebebi söylenir (oturumda bir kez)
await B.evaluate(() => { window.__eskiSayfa = true; });
await B.click('button.bos');
await giris.setInputFiles('/tmp/cgapp/gps.jpg');
await B.waitForTimeout(1500);
bekle('okuyucu yine inmezse ikinci kez yenilenmiyor', await B.evaluate(() => window.__eskiSayfa === true));
bekle('okuyucu yine inmezse sebebi söyleniyor', icerir(await metin(B), 'Bağlantı kurulamadı'));
// Bağlantı yokken hiç yenilenmez
await B.evaluate(() => sessionStorage.removeItem('okuyucu-yenilendi'));
await B.context().setOffline(true);
await giris.setInputFiles('/tmp/cgapp/gps.jpg');
await B.waitForTimeout(1500);
bekle('bağlantı yokken sayfa yenilenmiyor', await B.evaluate(() => window.__eskiSayfa === true));
bekle('bağlantı yokken sebebi söyleniyor', icerir(await metin(B), 'Bağlantı kurulamadı'));
bekle('bağlantı yokken "tarih yok" denmiyor', !icerir(await metin(B), 'Bu dosyada çekim tarihi yok'));
await B.context().setOffline(false);
await B.unroute('**/exifr*');
await B.reload(); await bekleMetin(B, 'Buluşmada çekilir');
await B.click('button.bos');
await dosya('yanlis');
bekle('yanlış gün reddi', icerir(await metin(B), 'buluşma günü çekilmemiş'));
bekle('çekildiği gün 3 Ağustos', icerir(await metin(B), 'Çekildiği gün: 3 Ağustos'));
bekle('etiket yüklenmedi', (await B.locator('.k.secili .d').innerText()) === 'yüklenmedi');
bekle('ilk yüklemede önceki kare cümlesi yok', !icerir(await metin(B), 'Önceki karen'));
bekle('pay söylenmiyor', !/bir gün önce|sonra çekilmiş/i.test(await metin(B)));
await olc(B, '18-ret-gun');
await dosya('ayarsiz');
bekle('2019: saat cümlesi', icerir(await metin(B), 'Makinenin saati ayarlı değilse'));
await dosya('tarihsiz');
bekle('tarihsiz reddi', icerir(await metin(B), 'Bu dosyada çekim tarihi yok'));
await olc(B, '19-ret-tarihsiz');
bekle('ret sonrası kayıt yok', ((await admin.from('kareler').select('id')).data ?? []).length === 0);
await dosya('gps');
bekle('doğru gün kabul', (await B.locator('.k.secili .d').innerText()) === 'yüklendi');
bekle('sayaç 1 / 2', icerir(await metin(B), '1 / 2 tema tamam'));
const k1 = (await admin.from('kareler').select('*')).data?.[0];
bekle('makine bilgisi saklandı', k1?.kamera === 'NIKON Z 6_2' && k1?.diyafram === 'f/2.8' && k1?.enstantane === '1/250' && k1?.iso === '400', JSON.stringify(k1));
bekle('çekim günü saklandı', k1?.cekim_gunu === bugun && k1?.cekim_zamani?.startsWith(`${bugun}T19:40`), JSON.stringify(k1));
bekle('boyut korunur (büyütülmez)', k1?.genislik === 1200 && k1?.yukseklik === 800);
if (!k1) { rapor(); process.exit(1) }
const indir = await admin.storage.from('kareler').download(k1.dosya);
const ham = Buffer.from(await indir.data.arrayBuffer());
const ex = await exifr.parse(ham, { gps: true }).catch(() => undefined);
bekle('depodaki dosyada konum yok', !ex?.latitude && !ex?.GPSLatitude, JSON.stringify(ex));
bekle('depodaki dosyada gömülü bilgi yok', !ex, JSON.stringify(ex));
bekle('önizleme görünür', await B.locator('.dolu img').evaluate(i => i.complete && i.naturalWidth > 0));
await olc(B, '20-yuklendi');
// değiştirme reddi önceki kareyi korur
await B.click('button:has-text("Değiştir")');
await dosya('yanlis');
bekle('değiştirme reddi: önceki karen duruyor', icerir(await metin(B), 'Önceki karen yerinde duruyor'));
bekle('değiştirme reddinde etiket yüklendi kalır', (await B.locator('.k.secili .d').innerText()) === 'yüklendi');
await olc(B, '21-degistirme-ret');
bekle('DB önceki kare aynı', (await admin.from('kareler').select('dosya')).data?.[0]?.dosya === k1.dosya);
await B.click('button:has-text("Öncekiyle devam et")');
bekle('öncekiyle devam: kare görünür', (await B.locator('.dolu img').count()) === 1);
// değiştirme kabul, eski dosya silinir
await B.click('button:has-text("Değiştir")');
await dosya('dogru');
const k2 = (await admin.from('kareler').select('*')).data?.[0];
bekle('değiştirme kabul: yeni dosya', k2 && k2.dosya !== k1.dosya && k2.id === k1.id);
bekle('eski dosya depodan silindi', !!(await admin.storage.from('kareler').download(k1.dosya)).error);
// kaldır
await B.click('button:has-text("Kaldır")');
bekle('kaldırma onayı', await bekleMetin(B, 'Kareni kaldırmak istiyor musun'));
await olc(B, '22-kaldir-onay');
await B.click('button:has-text("Vazgeç")');
bekle('vazgeç: kare duruyor', (await B.locator('.dolu img').count()) === 1);
await B.click('button:has-text("Kaldır")');
await B.locator('.ret button.btn:has-text("Kaldır")').click();
await B.locator('button.bos').waitFor({ timeout: 8000 }).catch(() => {});
bekle('kaldırıldı: boş kutu', (await B.locator('button.bos').count()) === 1);
bekle('kaldırıldı: kayıt yok', ((await admin.from('kareler').select('id')).data ?? []).length === 0);
bekle('kaldırıldı: dosya silindi', !!(await admin.storage.from('kareler').download(k2.dosya)).error);
bekle('sayaç 0 / 2', icerir(await metin(B), '0 / 2 tema tamam'));
// serbest temada tarihsiz
await B.locator('.k').nth(1).click();
bekle('serbest şart satırı', icerir(await metin(B), 'Serbest, istediğin gün'));
await B.click('button.bos');
await dosya('tarihsiz');
bekle('serbest temada tarihsiz kabul', (await B.locator('.k.secili .d').innerText()) === 'yüklendi');
bekle('tarihsiz: bilinmiyor yazar', icerir(await metin(B), 'Çekildiği gün: bilinmiyor'));
// Sokak'a dikey kare
await B.locator('.k').nth(0).click();
await B.click('button.bos');
await dosya('dikey');
bekle('dikey kare kabul', (await B.locator('.k.secili .d').innerText()) === 'yüklendi');
const dk = (await admin.from('kareler').select('*').eq('genislik', 800)).data?.[0];
bekle('dikey oran korunur', dk?.yukseklik === 1200, JSON.stringify(dk));
// afiş izni
await B.click('button.izin');
await B.waitForTimeout(500);
bekle('afiş izni kapandı (DB)', (await admin.from('uyeler').select('afis_izni').eq('ad', 'Selin Arı').single()).data?.afis_izni === false);
await B.click('button.izin');
await B.waitForTimeout(500);
bekle('afiş izni açıldı (DB)', (await admin.from('uyeler').select('afis_izni').eq('ad', 'Selin Arı').single()).data?.afis_izni === true);
// yenileyince kalıcı
await B.reload(); await B.waitForTimeout(1500);
bekle('yenileyince 2 / 2', icerir(await metin(B), '2 / 2 tema tamam'));
bekle('yenileyince küçük kareler yüklenir', await B.locator('.kk img').evaluateAll(l => l.length === 2 && l.every(i => i.complete && i.naturalWidth > 0)));
await olc(B, '23-iki-tema');
await B.goto(APP + '#/etkinlikler'); await B.waitForTimeout(700);
bekle('canlı kart: tüm temalar tamam', icerir(await metin(B), 'Karelerine bak') && icerir(await metin(B), '2 / 2 tema'));

// 9 · Kurucu oylamayı açar
await A.reload(); await A.waitForTimeout(800);
bekle('aşama: kare sayıları', (await A.locator('.ozet').innerText()).match(/1 kare/g)?.length === 2);
await A.click('button:has-text("Oylamayı aç")');
bekle('oylama onayı sorar', await bekleMetin(A, 'Oylama şimdi açılsın mı'));
bekle('onay kaç kare olduğunu söyler', icerir(await metin(A), '2 kareyle'));
await olc(A, '24-oylama-onay');
await A.locator('.kutu button.btn:has-text("Oylamayı aç")').click();
bekle('oylama açıldı', await bekleMetin(A, 'Oylama açık'));
bekle('oylamada iptal bölümü yok', !icerir(await metin(A), 'İptali başlat'));

// Yönetici oylamayı erken açtı. Uygulaması açık olan kişi bunu yenilemeden görmeli:
// aşamayı saatten hesaplamak yetmiyor, eski satır elde duruyor.
await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await B.waitForTimeout(1800);
bekle('oylama açılınca kart yenilemeden güncelleniyor',
  (await B.locator('.live').getAttribute('data-asama')) === 'oylama', (await metin(B)).slice(0, 120));

// 10 · Selin kilidi görür
await B.reload(); await B.waitForTimeout(800);
bekle('canlı kart oylama', (await B.locator('.live').getAttribute('data-asama')) === 'oylama');
await olc(B, '25-etkinlikler-oylama');
await B.goto(APP + '#/yukle'); await B.waitForTimeout(1200);
bekle('kilit cümlesi', icerir(await metin(B), 'kareler artık değişmiyor'));
bekle('değiştir ve kaldır yok', (await B.locator('button:has-text("Değiştir"), button:has-text("Kaldır")').count()) === 0);
await olc(B, '26-yukleme-kapali');

// 11 · Oylama (kurucu oyluyor: kendi karesi yok)
// Üçüncü bir kişinin karesini servis anahtarıyla ekliyoruz ki eksik kare ızgarası da görünsün.
const { data: liste } = await admin.auth.admin.listUsers();
let ucuncu = liste.users.find(u => u.email === 'deniz@test.local');
if (!ucuncu) ucuncu = (await admin.auth.admin.createUser({ email: 'deniz@test.local', password: 'test-sifre-1', email_confirm: true })).data.user;
await admin.from('uyeler').insert({ id: ucuncu.id, ad: 'Deniz Akın', eposta: 'deniz@test.local' });
const ev = (await admin.from('etkinlikler').select('id').single()).data;
const sokak = (await admin.from('temalar').select('id, ad').eq('sira', 1).single()).data;
const yol3 = `${ev.id}/${sokak.id}/${crypto.randomUUID()}.jpg`;
await admin.storage.from('kareler').upload(yol3, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
await admin.from('kareler').insert({ tema: sokak.id, sahip: ucuncu.id, dosya: yol3, genislik: 1200, yukseklik: 800, cekim_gunu: bugun,
  kamera: 'NIKON Z 6_2', objektif: '35mm f/1.8', odak: '35mm', diyafram: 'f/2.8', enstantane: '1/250', iso: '400' });

await A.goto(APP + '#/etkinlikler'); await A.waitForTimeout(1200);
bekle('canlı kartta oylama çağrısı', icerir(await metin(A), 'Oylamaya başla'), (await metin(A)).slice(0, 160));
bekle('kalan kare sayısı kartta', icerir(await metin(A), '3 kare kaldı'), await metin(A));
await A.click('.live .act'); await A.waitForTimeout(1500);
bekle('oylama tema listesi', (await A.locator('.tema-satir').count()) === 2, String(await A.locator('.tema-satir').count()));
bekle('son oy tarihi satırı', /\d+ (gün|saat|dakika) kaldı/.test(await metin(A)), (await metin(A)).slice(0, 120));
bekle('zorunlusu olmayana not', icerir(await metin(A), 'bunların hiçbiri zorunlu değil'));
// Başlık ile alt satır çelişmesin: "3 kare kaldı" derken "işin bitti" yazıyordu
bekle('başlık ile alt satır çelişmiyor', !icerir(await metin(A), 'işin bitti'), (await metin(A)).slice(0, 160));
bekle('oylama ekranında sekme çubuğu yok', (await A.locator('.tabs').count()) === 0);
// hata cümleleri: sunucu kodları okunur cümleye çevriliyor
{
  const c = await A.evaluate(() => ({
    kendi: window.__hataMetni({ message: 'kendi_karen' }),
    kapali: window.__hataMetni({ message: 'oylama_kapali' }),
    baska: window.__hataMetni({ message: 'baska_veren' }),
    bilinmeyen: window.__hataMetni({ message: 'ZZZ' }),
  }));
  bekle('hata cümleleri okunur', c.kendi.includes('Kendi karene') && c.kapali.includes('Oylama kapandı') && c.baska.includes('kendi puanını') && c.bilinmeyen.includes('ters gitti'), JSON.stringify(c));
}
// Karar 103'ün hata kodları: her biri kendi cümlesine düşmeli (eşleşme alt dize ile, sırayla)
{
  const c = await A.evaluate(() => Object.fromEntries(
    ['yoklamada_yok', 'cikarildi', 'neden_gerekli', 'bulusma_olmadi', 'toplu_geri', 'oylama_basladi', 'kare_yok', 'etkinlik_yok']
      .map(k => [k, window.__hataMetni({ message: k })])));
  const beklenen = {
    yoklamada_yok: 'Yoklamada adın yok', cikarildi: 'yarışmadan çıkarıldı', neden_gerekli: 'Nedenini yaz',
    bulusma_olmadi: 'buluşma günü alınır', toplu_geri: 'yoklama düzeltilince', oylama_basladi: 'Oylama başladı',
    kare_yok: 'Bu kare artık yok', etkinlik_yok: 'Etkinlik bulunamadı',
  };
  const yanlis = Object.entries(beklenen).filter(([k, v]) => !c[k].includes(v));
  bekle('karar 103 hata cümleleri okunur', yanlis.length === 0, JSON.stringify(yanlis.map(([k]) => [k, c[k]])));
}
// olmayan tema adresi
await A.goto(APP + '#/oyla/00000000-0000-0000-0000-000000000000'); await A.waitForTimeout(1500);
bekle('olmayan tema adresinde kilit ekranı', icerir(await metin(A), 'Oylama açık değil'), (await metin(A)).slice(0, 100));
await A.goto(APP + '#/oyla'); await A.waitForTimeout(1200);
bekle('kurucuya zorunlu değil', icerir(await metin(A), 'oylaman şart değil'), (await metin(A)).slice(0, 160));
bekle('isim sızmıyor', !icerir(await metin(A), 'Selin Arı') && !icerir(await metin(A), 'Deniz Akın'), (await metin(A)).slice(0, 160));
await olc(A, '27-oylama-temalar');
await A.locator('.tema-satir').first().click(); await A.waitForTimeout(1500);
bekle('akışta iki kare', (await A.locator('.kare').count()) === 2);
bekle('kare görünüyor', await A.locator('.kare .tutucu img').first().evaluate(i => i.complete && i.naturalWidth > 0));
// Büyüteç: sayfa yakınlaştırması kapalı, fotoğrafa yakından bakmak yalnız burada
{
  const res = A.locator('.kare .tutucu img').first();
  await res.click(); await A.waitForTimeout(400);
  bekle('büyüteç: tek dokunuş açmıyor (kaydırmaya kalıyor)', (await A.locator('.buyutec').count()) === 0);
  await res.dblclick(); await A.waitForTimeout(300);
  bekle('büyüteç: çift dokununca açılıyor', (await A.locator('.buyutec').count()) === 1);
  bekle('büyüteç: temayı ve kare sırasını söylüyor', icerir(await A.locator('.buyutec .bar').innerText(), '01 / 02'),
    await A.locator('.buyutec .bar').innerText());
  const donusum = () => A.evaluate(() => { const i = document.querySelector('.buyutec img'); return i ? new DOMMatrix(getComputedStyle(i).transform) : null; });
  const olcek = async () => (await donusum())?.a ?? null;
  bekle('büyüteç: çift dokunuş büyütülmüş açıyor', Math.abs(await olcek() - 2.2) < 0.01, String(await olcek()));
  bekle('büyüteç: gren ve sekmelerin üstünde', await A.evaluate(() => {
    const r = document.querySelector('.buyutec').getBoundingClientRect();
    return document.elementFromPoint(r.width / 2, r.height - 2)?.closest('.buyutec') != null && Number(getComputedStyle(document.querySelector('.buyutec')).zIndex) > 30;
  }));
  // İki parmak: aradaki uzaklık 100'den 200'e çıkınca ölçek iki katına
  const jest = (tip, id, x, y) => A.evaluate(([t, i, px, py]) => document.querySelector('.buyutec')?.dispatchEvent(
    new PointerEvent(t, { pointerId: i, clientX: px, clientY: py, bubbles: true, pointerType: 'touch', isPrimary: i === 1 })), [tip, id, x, y]);
  await jest('pointerdown', 1, 145, 400); await jest('pointerdown', 2, 245, 400);
  await jest('pointermove', 2, 345, 400);
  const iki = await olcek();
  await jest('pointerup', 2, 345, 400); await jest('pointerup', 1, 145, 400);
  bekle('büyüteç: iki parmakla büyüyor', Math.abs(iki - 4.4) < 0.05, String(iki));
  bekle('büyüteç: jestten sonra açık kalıyor', (await A.locator('.buyutec').count()) === 1);
  await jest('pointerdown', 1, 300, 300); await jest('pointermove', 1, 50, 300);
  bekle('büyüteç: büyükken tek parmakla gezdiriliyor', ((await donusum())?.e ?? 0) < 0);
  await jest('pointerup', 1, 50, 300);
  bekle('büyüteç: sürüklemek kapatmıyor', (await A.locator('.buyutec').count()) === 1);
  await jest('pointerdown', 1, 100, 300); await jest('pointerup', 1, 100, 300); await A.waitForTimeout(200);
  bekle('büyüteç: dokununca kapanıyor', (await A.locator('.buyutec').count()) === 0);
  await res.dblclick(); await A.waitForTimeout(300);
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  bekle('büyüteç: Esc kapatıyor', (await A.locator('.buyutec').count()) === 0);
  // Sayfadaki fotoğrafa iki parmak inince açılıyor
  await res.evaluate(i => { for (const id of [11, 12]) i.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: 150 + id, clientY: 300, bubbles: true, pointerType: 'touch' })); });
  await A.waitForTimeout(200);
  bekle('büyüteç: iki parmak inince açılıyor', (await A.locator('.buyutec').count()) === 1 && Math.abs(await olcek() - 1.15) < 0.01, String(await olcek()));
  // Tam boya kadar küçültüp bırakınca kapanıyor
  if (!(await A.locator('.buyutec').count())) { await res.dblclick(); await A.waitForTimeout(300); }
  await jest('pointerdown', 1, 95, 400); await jest('pointerdown', 2, 295, 400);
  await jest('pointermove', 2, 145, 400);
  bekle('büyüteç: tam boyun altına inmiyor', Math.abs(await olcek() - 1) < 0.001, String(await olcek()));
  await jest('pointerup', 2, 145, 400); await jest('pointerup', 1, 95, 400); await A.waitForTimeout(200);
  bekle('büyüteç: tam boya küçültünce kapanıyor', (await A.locator('.buyutec').count()) === 0);
  // En fazla 6 kat, gezdirirken fotoğrafın kenarı ekranın kenarını geçmiyor
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  await res.dblclick(); await A.waitForTimeout(300);
  await jest('pointerdown', 1, 190, 400); await jest('pointerdown', 2, 200, 400);
  await jest('pointermove', 2, 390, 400);
  bekle('büyüteç: en fazla 6 kat', Math.abs(await olcek() - 6) < 0.001, String(await olcek()));
  await jest('pointerup', 2, 390, 400); await jest('pointerup', 1, 190, 400);
  await jest('pointerdown', 1, 20, 300); await jest('pointermove', 1, 3000, 300); await jest('pointerup', 1, 3000, 300);
  const sol = await A.evaluate(() => document.querySelector('.buyutec img')?.getBoundingClientRect().left ?? null);
  bekle('büyüteç: gezdirince fotoğrafın sol kenarı ekranın sol kenarında duruyor', sol !== null && Math.abs(sol) < 1, String(sol));
  await A.keyboard.press('Escape'); await A.waitForTimeout(200);
}
bekle('puan boşken sürükle yazıyor', (await A.locator('.puan .deger').first().innerText()).toLowerCase().includes('sürükle'));
await olc(A, '28-oylama-kare');
// ilk kareye 7 ver
const puanla = async (yer, oran) => {
  await yer.scrollIntoViewIfNeeded();
  await A.waitForTimeout(400);
  const k = await yer.boundingBox();
  const y = k.y + k.height / 2;
  // gerçek sürükleme: bas, kaydır, bırak
  await A.mouse.move(k.x + 4, y);
  await A.mouse.down();
  await A.mouse.move(k.x + k.width * 0.3, y, { steps: 5 });
  await A.mouse.move(k.x + k.width * oran, y, { steps: 5 });
  await A.waitForTimeout(150);
  await A.mouse.up();
  await A.waitForTimeout(800);
};
await puanla(A.locator('.kaydirici').first(), 6 / 9);
bekle('puan ekranda 07', await yaz(A, '.puan .deger') === '07');
const oy1 = (await admin.from('oylar').select('*')).data ?? [];
bekle('puan veritabanına yazıldı', oy1.length === 1 && oy1[0].puan === 7, JSON.stringify(oy1));
await olc(A, '29-oylama-puanli');
// yarıda kalmışken kart "devam et" diyor
await A.goto(APP + '#/etkinlikler'); await A.waitForTimeout(1200);
bekle('yarıda kalınca kartta devam et', icerir(await metin(A), 'Oylamaya devam et'), (await metin(A)).slice(0, 140));
await A.goto(APP + '#/oyla'); await A.waitForTimeout(1000);
await A.locator('.tema-satir').first().click(); await A.waitForTimeout(1500);
// bitiş ekranına kaydır
await A.evaluate(() => { const a = document.querySelector('.akis'); a.scrollTo({ top: a.scrollHeight }); });
await A.waitForTimeout(1000);
bekle('bitişte 1 kare kaldı', icerir(await metin(A), '1 kare') && icerir(await metin(A), 'Puan vermediğin kareler'));
bekle('eksik ızgarada 1 kart', (await A.locator('.bitti .eksik button').count()) === 1);
await olc(A, '30-oylama-bitis-eksik');
bekle('eksik kart düğmesi doğru', icerir(await yaz(A, '.bitti .btn'), 'puansız'));
// ızgaradaki karta dokununca o kareye gidiyor
{
  const once = await A.evaluate(() => document.querySelector('.akis').scrollTop);
  await A.locator('.bitti .eksik button').first().click();
  await A.waitForTimeout(1200);
  const sonra = await A.evaluate(() => document.querySelector('.akis').scrollTop);
  bekle('eksik karta dokununca o kareye gidiyor', sonra < once, `${once} → ${sonra}`);
  await A.evaluate(() => { const a = document.querySelector('.akis'); a.scrollTo({ top: a.scrollHeight }); });
  await A.waitForTimeout(900);
}
await A.click('.bitti .btn'); await A.waitForTimeout(1200);
// klavyeyle 10: kaydırıcı ok tuşlarıyla da çalışmalı
{
  const k = A.locator('.kaydirici:not(.dolu)').first();
  await k.scrollIntoViewIfNeeded();
  await A.waitForTimeout(600);
  await k.focus();
  for (let i = 0; i < 10; i++) { await A.keyboard.press('ArrowRight'); await A.waitForTimeout(90); }
  await A.waitForTimeout(700);
}
bekle('ikinci kareye 10 verildi', ((await admin.from('oylar').select('puan')).data ?? []).some(o => o.puan === 10));
await A.evaluate(() => { const a = document.querySelector('.akis'); a.scrollTo({ top: a.scrollHeight }); });
await A.waitForTimeout(1000);
bekle('tema bitti ekranı', icerir(await yaz(A, '.bitti h2'), 'bitti') && (await A.locator('.bitti .eksik').count()) === 0,
  await yaz(A, '.bitti h2'));
bekle('bitişte dönüş düğmesi', icerir(await yaz(A, '.bitti .btn'), 'Temalara dön'));
await olc(A, '31-oylama-bitis-tamam');
await A.click('.bitti .btn'); await A.waitForTimeout(1200);
bekle('tema listesinde 2 / 2', icerir(await metin(A), '2 / 2'));
bekle('diğer temada kare sayısı', icerir(await metin(A), '1 kare kaldı'));
// puan değiştirme (karar 37)
await A.locator('.tema-satir').first().click(); await A.waitForTimeout(1200);
bekle('önceki puan geri geliyor', ['07', '10'].includes(await yaz(A, '.puan .deger')));
await puanla(A.locator('.kaydirici').first(), 2 / 9);
bekle('puan değiştirilebiliyor', ((await admin.from('oylar').select('puan')).data ?? []).some(o => o.puan === 3));
// sürüklerken değer parmakla birlikte değişiyor mu (pointermove)
{
  const k = await A.locator('.kaydirici').first().boundingBox();
  const y = k.y + k.height / 2;
  await A.mouse.move(k.x + 4, y);
  await A.mouse.down();
  await A.mouse.move(k.x + k.width * 0.55, y, { steps: 4 });
  await A.waitForTimeout(250);
  const sururken = await yaz(A, '.puan .deger');
  await A.mouse.move(k.x + k.width * 0.9, y, { steps: 4 });
  await A.waitForTimeout(250);
  const sonra = await yaz(A, '.puan .deger');
  await A.mouse.up(); await A.waitForTimeout(700);
  bekle('sürüklerken değer takip ediyor', sururken !== sonra && Number(sonra) > Number(sururken), `${sururken} → ${sonra}`);
}

// Portre temasını da bitir: "oyların tamam" hâli
await A.goto(APP + '#/oyla'); await A.waitForTimeout(1200);
await A.locator('.tema-satir').nth(1).click(); await A.waitForTimeout(1500);
await puanla(A.locator('.kaydirici').first(), 5 / 9);
await A.goto(APP + '#/oyla'); await A.waitForTimeout(1200);
bekle('hepsi bitince oyların tamam', icerir(await metin(A), 'Oyların tamam'), (await metin(A)).replace(/\n/g, ' | ').slice(0, 200));
bekle('biten temada Bitti yazıyor', await yaz(A, '.tema-satir .alt') === 'Bitti');
await olc(A, '33-oylama-tamam');
await A.goto(APP + '#/etkinlikler'); await A.waitForTimeout(1200);
bekle('kartta puanlarına bak', icerir(await metin(A), 'Puanlarına bak'));
bekle('bitince kalan kare rozeti yok', !/kare kaldı/.test(await metin(A)), (await metin(A)).slice(0, 140));

// B kendi karelerini oylamıyor
await B.goto(APP + '#/oyla'); await B.waitForTimeout(1500);
bekle('B için Sokak zorunlu', icerir(await metin(B), 'oylaman gerekiyor'));
bekle('B kendi karesini görmüyor', icerir(await metin(B), '0 / 1'), await metin(B));
bekle('oylanacak kare yoksa doğru cümle', icerir(await metin(B), 'senin dışında kare yok'), await metin(B));
// hiç kare verilmemiş tema: başka cümle
await admin.from('temalar').insert({ etkinlik: ev.id, ad: 'Gece', sira: 3, bulusmada: true });
await B.reload(); await B.waitForTimeout(1500);
bekle('boş temada kimse kare vermemiş yazıyor', icerir(await metin(B), 'kimse kare vermemiş'), await metin(B));
await admin.from('temalar').delete().eq('etkinlik', ev.id).eq('sira', 3);
await olc(B, '32-oylama-uye');

// Oylama kapanınca verilen puan ekranda kabul edilmiş gibi kalmasın
await A.goto(APP + '#/oyla'); await A.waitForTimeout(1000);
await A.locator('.tema-satir').first().click(); await A.waitForTimeout(1500);
const oncekiPuan = await yaz(A, '.puan .deger');
await admin.from('etkinlikler').update({
  yukleme_biter: new Date(Date.now() - 2000).toISOString(),
  oylama_biter: new Date(Date.now() - 1000).toISOString(),
}).eq('id', ev.id);
await puanla(A.locator('.kaydirici').first(), 1 / 9);
bekle('kapanınca hata görünüyor', icerir(await metin(A), 'Oylama kapandı'), (await metin(A)).slice(0, 120));
bekle('reddedilen puan geri alınıyor', await yaz(A, '.puan .deger') === oncekiPuan, `önce ${oncekiPuan} → şimdi ${await yaz(A, '.puan .deger')}`);
bekle('hata şeridi akışın üstünde', (await A.locator('.oy-hata').count()) === 1 && (await A.locator('.kare').count()) === 2);
await olc(A, '34-oylama-kapandi');
// oylama geri açılınca şerit kalkıyor
await admin.from('etkinlikler').update({
  yukleme_biter: new Date(Date.now() - 2000).toISOString(),
  oylama_biter: new Date(Date.now() + 3600_000).toISOString(),
}).eq('id', ev.id);
await puanla(A.locator('.kaydirici').first(), 4 / 9);
bekle('yeniden yazılınca şerit kalkıyor', (await A.locator('.oy-hata').count()) === 0, (await metin(A)).slice(0, 100));
bekle('yeni puan yazıldı', ((await admin.from('oylar').select('puan')).data ?? []).some(o => o.puan === 5));
// klavye: sola gider ve 1'in altına inmez
{
  const k = A.locator('.kaydirici').first();
  await k.scrollIntoViewIfNeeded(); await A.waitForTimeout(300); await k.focus();
  for (let i = 0; i < 8; i++) { await A.keyboard.press('ArrowLeft'); await A.waitForTimeout(80); }
  await A.waitForTimeout(600);
  bekle('klavyeyle 01 alt sınırı', await yaz(A, '.puan .deger') === '01', await yaz(A, '.puan .deger'));
  for (let i = 0; i < 12; i++) { await A.keyboard.press('ArrowRight'); await A.waitForTimeout(70); }
  await A.waitForTimeout(600);
  bekle('klavyeyle 10 üst sınırı', await yaz(A, '.puan .deger') === '10', await yaz(A, '.puan .deger'));
}
// telefonda sürükleme kaydırmaya dönerse (pointercancel) puan yazılmamalı
{
  const k = A.locator('.kaydirici').first();
  await k.scrollIntoViewIfNeeded(); await A.waitForTimeout(300);
  const onceki = await yaz(A, '.puan .deger');
  const oncekiDb = JSON.stringify(((await admin.from('oylar').select('kare, puan')).data ?? []).sort((x, y) => x.kare.localeCompare(y.kare)));
  const kutu = await k.boundingBox();
  const y = kutu.y + kutu.height / 2;
  await A.mouse.move(kutu.x + 4, y);
  await A.mouse.down();
  await A.mouse.move(kutu.x + kutu.width * 0.35, y, { steps: 3 });
  await A.waitForTimeout(200);
  await A.evaluate(() => {
    const s = document.querySelector('.kaydirici');
    s.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
  });
  await A.waitForTimeout(400);
  // parmak bambaşka bir yerde kalkıyor: kesilen sürükleme oradan da puan yazmamalı
  await A.mouse.move(kutu.x + kutu.width * 0.95, y, { steps: 2 });
  await A.mouse.up();
  await A.waitForTimeout(1200);
  bekle('kesilen sürüklemede puan yazılmıyor',
    JSON.stringify(((await admin.from('oylar').select('kare, puan')).data ?? []).sort((x, y) => x.kare.localeCompare(y.kare))) === oncekiDb,
    oncekiDb);
  bekle('kesilen sürüklemede ekran eski puana dönüyor', await yaz(A, '.puan .deger') === onceki,
    `${onceki} → ${await yaz(A, '.puan .deger')}`);
}
// oylama kapanmadan hemen önce ekranda duran (yani sunucunun kabul ettiği) puan
const sunucudakiPuan = await yaz(A, '.puan .deger');
// oylamayı yeniden kapat
await admin.from('etkinlikler').update({
  yukleme_biter: new Date(Date.now() - 2000).toISOString(),
  oylama_biter: new Date(Date.now() - 1000).toISOString(),
}).eq('id', ev.id);
// arka arkaya reddedilen puanlar: geri alma sunucudaki değere dönmeli, ara değere değil
{
  const k = A.locator('.kaydirici').first();
  await k.scrollIntoViewIfNeeded(); await A.waitForTimeout(300); await k.focus();
  // beklemeden: puanlar üst üste binsin, geri alma ara değere değil sunucudaki değere dönmeli
  for (let i = 0; i < 4; i++) await A.keyboard.press('ArrowLeft');
  await A.waitForTimeout(2000);
  bekle('arka arkaya redde sunucudaki puana dönüyor', await yaz(A, '.puan .deger') === sunucudakiPuan,
    `sunucu ${sunucudakiPuan} → ekran ${await yaz(A, '.puan .deger')}`);
  bekle('sunucudaki puan değişmedi', ((await admin.from('oylar').select('puan')).data ?? []).some(o => String(o.puan).padStart(2, '0') === sunucudakiPuan));
}

// 12 · Ağ koparsa (oylama yeniden açık)
await admin.from('etkinlikler').update({
  yukleme_biter: new Date(Date.now() - 2000).toISOString(),
  oylama_biter: new Date(Date.now() + 3600_000).toISOString(),
}).eq('id', ev.id);
await A.route('**/rest/v1/rpc/oylama_durumu*', r => r.abort());
await A.goto(APP + '#/etkinlikler'); await A.waitForTimeout(1500);
bekle('oy durumu alınamazsa yanlış ilerleme yazmıyor',
  !/kare kaldı/.test(await metin(A)) && !icerir(await metin(A), 'devam et'), (await metin(A)).slice(0, 160));
bekle('oy durumu alınamazsa kart yine oylamaya götürüyor', (await A.locator('.live .act').count()) === 1);
await A.unroute('**/rest/v1/rpc/oylama_durumu*');
await A.route('**/rest/v1/etkinlikler*', r => r.abort());
await A.goto(APP + '#/siralama'); await A.waitForTimeout(500);   // aynı adrese gitmek yeniden yüklemiyor
await A.goto(APP + '#/etkinlikler'); await A.waitForTimeout(14000);
bekle('etkinlikler alınamazsa hata görünüyor', icerir(await metin(A), 'Bağlantı kurulamadı') || icerir(await metin(A), 'ters gitti'), (await metin(A)).replace(/\n/g, ' | ').slice(0, 300));
await A.goto(APP + '#/oyla'); await A.waitForTimeout(14000);
bekle('oylama ekranı da hatayı söylüyor', icerir(await metin(A), 'Bağlantı kurulamadı') || icerir(await metin(A), 'ters gitti'), (await metin(A)).slice(0, 160));
await olc(A, '35-ag-hatasi');
await A.unroute('**/rest/v1/etkinlikler*');

// 13 · Sonuçlar (oylama kapalı, etkinlik sonuçlandı)
// puanları belirli yapıyoruz: Deniz'in karesi kazanır, Selin'inki sıralamaya girmez
{
  const kareler = (await admin.from('kareler').select('id, sahip, tema')).data ?? [];
  const sokaktakiler = kareler.filter(k => k.tema === sokak.id);
  const deniz = sokaktakiler.find(k => k.sahip === ucuncu.id);
  const selinin = sokaktakiler.find(k => k.sahip !== ucuncu.id);
  await admin.from('oylar').upsert({ kare: deniz.id, veren: A.kimlik, puan: 9 }, { onConflict: 'kare,veren' });
  await admin.from('oylar').upsert({ kare: selinin.id, veren: A.kimlik, puan: 5 }, { onConflict: 'kare,veren' });
  globalThis.selininKaresi = selinin.id;
}
// hiç oy almamış bir tema: ödül verilmemeli
{
  const t3 = (await admin.from('temalar').insert({ etkinlik: ev.id, ad: 'Gece', sira: 3, bulusmada: true }).select('id').single()).data;
  const yol4 = `${ev.id}/${t3.id}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol4, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  await admin.from('kareler').insert({ tema: t3.id, sahip: ucuncu.id, dosya: yol4, genislik: 1200, yukseklik: 800, cekim_gunu: bugun });
}
await admin.from('etkinlikler').update({
  yukleme_biter: new Date(Date.now() - 3000).toISOString(),
  oylama_biter: new Date(Date.now() - 1000).toISOString(),
}).eq('id', ev.id);
await A.goto(APP + '#/profil'); await A.waitForTimeout(400);
await A.goto(APP + '#/etkinlikler'); await A.waitForTimeout(1500);
bekle('biten etkinlik arşivde', icerir(await metin(A), 'Geçmiş etkinlikler') && (await A.locator('.ev').count()) === 1);
bekle('canlı kart kalktı', (await A.locator('.live').count()) === 0);
await olc(A, '36-arsiv');
await A.locator('.ev').first().click(); await A.waitForTimeout(2000);
bekle('sonuç sayfası açıldı', icerir(await metin(A), 'Sonuçlandı'), (await metin(A)).slice(0, 140));
bekle('temanın karesi var', (await A.locator('.odul img').count()) === 1);
bekle('kazanan en yüksek puanı alan', icerir(await yaz(A, '.odul .serit'), 'Deniz Akın'), await yaz(A, '.odul .serit'));
bekle('kazananın puanı var', /\d,\d/.test(await yaz(A, '.odul .serit .ort')), await yaz(A, '.odul .serit .ort'));
bekle('tema sekmeleri', (await A.locator('.sekmeler button').count()) === 3);
await olc(A, '37-sonuc');
// ikinci tema
await A.locator('.sekmeler button').nth(1).click(); await A.waitForTimeout(1200);
bekle('ikinci temada da kazanan var', (await A.locator('.odul img').count()) === 1);
bekle('az karede de kazananın puanı var', /\d,\d/.test(await yaz(A, '.odul .serit .ort')), await yaz(A, '.odul .serit .ort'));
// hiç oy almamış tema: ödül yok, kareler galeride
await A.locator('.sekmeler button').nth(2).click(); await A.waitForTimeout(1200);
bekle('oylanmayan temada ödül yok', (await A.locator('.odul').count()) === 0 && icerir(await metin(A), 'oylama olmadı'),
  (await metin(A)).replace(/\n/g, ' | ').slice(0, 220));
bekle('oylanmayan temanın kareleri galeride', (await A.locator('.izgara figure').count()) === 1);
await olc(A, '40-oylanmayan-tema');
await A.locator('.izgara figure').first().click(); await A.waitForTimeout(1200);
bekle('oylanmayan temada detay temayı söylüyor', icerir(await metin(A), 'Bu temayı kimse oylamamış'), (await metin(A)).slice(0, 200));
await A.click('.detay .geri'); await A.waitForTimeout(1000);
// kare detayı: makine bilgisi olan Sokak karesinden
await A.locator('.sekmeler button').nth(0).click(); await A.waitForTimeout(1200);
await A.locator('.odul img').click(); await A.waitForTimeout(1500);
bekle('detayda makine künyesi açık', icerir(await metin(A), 'Makine') && icerir(await metin(A), 'NIKON Z 6_2'), (await metin(A)).replace(/\n/g, ' | ').slice(0, 260));
bekle('detayda diyafram ve ISO', icerir(await metin(A), 'f/2.8') && icerir(await metin(A), 'ISO'));
bekle('detayda kaç kişi puan verdi', icerir(await metin(A), 'kişi puan verdi'));
await olc(A, '38-kare-detay');
await A.click('.detay > img'); await A.waitForTimeout(300);
bekle('kare detayında fotoğrafa dokununca büyüteç açılıyor', (await A.locator('.buyutec').count()) === 1);
await olc(A, '38b-kare-buyutec');
await A.locator('.buyutec').click(); await A.waitForTimeout(200);
bekle('büyüteç kapanınca detay yerinde', (await A.locator('.buyutec').count()) === 0 && (await A.locator('.detay').count()) === 1);
await A.click('.detay .geri'); await A.waitForTimeout(1200);
bekle('detaydan geri dönülüyor', (await A.locator('.sekmeler').count()) === 1);
// üyenin gözünden: kendi karesi işaretli, başkasının sırasız karesinde puan yok
await B.goto(APP + '#/etkinlikler'); await B.waitForTimeout(1500);
await B.locator('.ev').first().click(); await B.waitForTimeout(2000);
bekle('üye sonuçları görüyor', icerir(await metin(B), 'Sonuçlandı'));
bekle('kendi karesi işaretli', (await B.locator('.izgara figure.benim, .satir-kare.benim').count()) === 1,
  String(await B.locator('.izgara figure.benim, .satir-kare.benim').count()));
bekle('üye galeride kendi puanını görüyor', icerir(await metin(B), 'sen · 5,0'), (await metin(B)).replace(/\n/g, ' | ').slice(0, 300));
await B.locator('.izgara figure.benim').click(); await B.waitForTimeout(1200);
bekle('detayda kendi puanı ve uyarı', icerir(await metin(B), '5,0') && icerir(await metin(B), 'yalnız sen görüyorsun'), (await metin(B)).slice(0, 220));
await B.click('.detay .geri'); await B.waitForTimeout(1000);
// aynı kare A'nın ekranında puansız
await A.goto(APP + '#/profil'); await A.waitForTimeout(400);
await A.goto(APP + `#/sonuc/${(await admin.from('etkinlikler').select('id').single()).data.id}`); await A.waitForTimeout(2000);
bekle('başkasının sırasız karesinde puan yok', !icerir(await metin(A), '5,0'), (await metin(A)).replace(/\n/g, ' | ').slice(0, 300));
await A.locator('.izgara figure').first().click(); await A.waitForTimeout(1200);
bekle('detayda da puan gizli', icerir(await metin(A), 'sıralamaya girmedi'), (await metin(A)).slice(0, 200));
await olc(B, '39-sonuc-uye');

// 14 · Kalabalık tema: 4 ve 5. sıra listesi, ve hiç kare yüklenmemiş etkinlik
{
  // 9 kareli tema: round(9/2,5)=4, yani dördüncü sıra listede görünmeli
  const ek2 = (await admin.from('etkinlikler').insert({
    bulusma_gunu: bugun,
    yukleme_baslar: new Date(Date.now() - 5 * 86400000).toISOString(),
    yukleme_biter: new Date(Date.now() - 4 * 86400000).toISOString(),
    oylama_biter: new Date(Date.now() - 3 * 86400000).toISOString(),
    kuran: A.kimlik,
  }).select('id').single()).data;
  const tema = (await admin.from('temalar').insert({ etkinlik: ek2.id, ad: 'Kalabalık', sira: 1, bulusmada: false }).select('id').single()).data;
  const { data: l } = await admin.auth.admin.listUsers();
  for (let i = 0; i < 9; i++) {
    const posta = `kalabalik${i}@test.local`;
    const k = l.users.find(u => u.email === posta)
      ?? (await admin.auth.admin.createUser({ email: posta, password: 'test-sifre-1', email_confirm: true })).data.user;
    await admin.from('uyeler').insert({ id: k.id, ad: `Kalabalık ${i}`, eposta: posta });
    const yol = `${ek2.id}/${tema.id}/${crypto.randomUUID()}.jpg`;
    await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
    const kr = (await admin.from('kareler').insert({ tema: tema.id, sahip: k.id, dosya: yol, genislik: 1200, yukseklik: 800 }).select('id').single()).data;
    await admin.from('oylar').insert({ kare: kr.id, veren: A.kimlik, puan: Math.max(1, 10 - i) });
  }
  await A.goto(APP + `#/sonuc/${ek2.id}`); await A.waitForTimeout(2500);
  bekle('kalabalık temada kürsü iki kare', (await A.locator('.kursu figure').count()) === 2);
  bekle('kürsü numaraları sunucudaki sıradan', (await yaz(A, '.kursu .no', 0)) === '02' && (await yaz(A, '.kursu .no', 1)) === '03',
    `${await yaz(A, '.kursu .no', 0)} / ${await yaz(A, '.kursu .no', 1)}`);
  bekle('dördüncü sıra listede', (await A.locator('.satir-kare').count()) === 1, String(await A.locator('.satir-kare').count()));
  bekle('listedeki satır 04 numaralı', (await yaz(A, '.satir-kare .no')) === '04', await yaz(A, '.satir-kare .no'));
  bekle('geri kalanlar galeride', (await A.locator('.izgara figure').count()) === 5, String(await A.locator('.izgara figure').count()));
  await olc(A, '41-kalabalik-tema');

  // Ortak birincilik (karar 98): iki kare eşit puan alırsa ikisi de birinci
  {
    const ek3 = (await admin.from('etkinlikler').insert({
      bulusma_gunu: bugun,
      yukleme_baslar: new Date(Date.now() - 7 * 86400000).toISOString(),
      yukleme_biter: new Date(Date.now() - 6 * 86400000).toISOString(),
      oylama_biter: new Date(Date.now() - 5 * 86400000).toISOString(),
      kuran: A.kimlik,
    }).select('id').single()).data;
    // 8 kare: round(8/2,5)=3 sıralı. İlk iki kare eşit, yani 1, 1, 3 çıkmalı.
    const tema3 = (await admin.from('temalar').insert({ etkinlik: ek3.id, ad: 'Eşit', sira: 1, bulusmada: false }).select('id').single()).data;
    const { data: l3 } = await admin.auth.admin.listUsers();
    // İlk ikisi eşit puanlı. Adlar bilerek ters: yüklemede Zeynep önce, alfabede Ada önce.
    const kisiler = [['Zeynep Esen', 10], ['Ada Erim', 10], ['Can Uz', 8], ['Derya Ak', 7],
      ['Efe Bal', 6], ['Fulya Ün', 5], ['Gökhan Er', 4], ['Hale Su', 3]];
    for (let i = 0; i < kisiler.length; i++) {
      const [ad, puan] = kisiler[i];
      const posta = `esit${i}@test.local`;
      const k = l3.users.find(u => u.email === posta)
        ?? (await admin.auth.admin.createUser({ email: posta, password: 'test-sifre-1', email_confirm: true })).data.user;
      await admin.from('uyeler').insert({ id: k.id, ad, eposta: posta });
      const yol = `${ek3.id}/${tema3.id}/${crypto.randomUUID()}.jpg`;
      await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
      const kr = (await admin.from('kareler').insert({ tema: tema3.id, sahip: k.id, dosya: yol, genislik: 1200, yukseklik: 800 }).select('id').single()).data;
      await admin.from('oylar').insert({ kare: kr.id, veren: A.kimlik, puan });
    }
    await A.goto(APP + `#/sonuc/${ek3.id}`); await A.waitForTimeout(2500);
    bekle('eşitlikte iki kazanan', (await A.locator('.odul .kazanan').count()) === 2,
      String(await A.locator('.odul .kazanan').count()));
    bekle('eşitlik ekranda yazıyor', icerir(await yaz(A, '.odul .esit'), 'İki kare eşit puan aldı'), await yaz(A, '.odul .esit'));
    bekle('kazananlar alfabetik', icerir(await yaz(A, '.odul .kazanan .ad', 0), 'Ada Erim')
      && icerir(await yaz(A, '.odul .kazanan .ad', 1), 'Zeynep Esen'),
      `${await yaz(A, '.odul .kazanan .ad', 0)} / ${await yaz(A, '.odul .kazanan .ad', 1)}`);
    bekle('ikisinin de puanı ekranda', /\d,\d/.test(await yaz(A, '.odul .kazanan .ort', 0))
      && /\d,\d/.test(await yaz(A, '.odul .kazanan .ort', 1)));
    bekle('eşitlikten sonra kürsü 03 ile başlıyor', (await A.locator('.kursu figure').count()) === 1
      && (await yaz(A, '.kursu .no')) === '03', await yaz(A, '.kursu .no'));
    bekle('ekranda 02 numarası yok', !icerir(await metin(A), '02 '), (await metin(A)).replace(/\n/g, ' | ').slice(0, 200));
    bekle('geri kalan beş kare galeride', (await A.locator('.izgara figure').count()) === 5,
      String(await A.locator('.izgara figure').count()));
    await olc(A, '43-ortak-birincilik');
  }

  // hiç kare yüklenmemiş etkinlik
  const bos = (await admin.from('etkinlikler').insert({
    bulusma_gunu: bugun,
    yukleme_baslar: new Date(Date.now() - 9 * 86400000).toISOString(),
    yukleme_biter: new Date(Date.now() - 8 * 86400000).toISOString(),
    oylama_biter: new Date(Date.now() - 7 * 86400000).toISOString(),
    kuran: A.kimlik,
  }).select('id').single()).data;
  await A.goto(APP + `#/sonuc/${bos.id}`); await A.waitForTimeout(2000);
  bekle('boş etkinlikte açıklama', icerir(await metin(A), 'Hiç kare'), (await metin(A)).slice(0, 160));
  bekle('boş etkinlikte sekme yok', (await A.locator('.sekmeler').count()) === 0);
  await olc(A, '42-bos-etkinlik');

  // sonucu açılmamış etkinlik
  const yeni = (await admin.from('etkinlikler').insert({
    bulusma_gunu: bugun,
    yukleme_baslar: new Date(Date.now() - 1000).toISOString(),
    yukleme_biter: new Date(Date.now() + 86400000).toISOString(),
    oylama_biter: new Date(Date.now() + 2 * 86400000).toISOString(),
    kuran: A.kimlik,
  }).select('id').single()).data;
  await A.goto(APP + `#/sonuc/${yeni.id}`); await A.waitForTimeout(2000);
  bekle('sonucu açılmamış etkinlikte kilit', icerir(await yaz(A, 'h2.t'), 'Sonuçlar') && icerir(await yaz(A, 'h2.t'), 'açılmadı'), await yaz(A, 'h2.t'));
  await admin.from('etkinlikler').delete().eq('id', yeni.id);
}

// 15 · Sıralama dolu, isimden profile geçiş
{
  // Karar 53'ün eşiği: iki tamamlanmış etkinliğe katılmayan sıralamaya girmiyor.
  // Buraya kadar herkes tek etkinliğe kare vermişti, yani sıralı blok hiç dolmuyordu.
  const tm = (await admin.from('temalar').select('id, ad, etkinlik')).data ?? [];
  const kalabalik = tm.find(t => t.ad === 'Kalabalık');
  const esitTema = tm.find(t => t.ad === 'Eşit');
  const { data: hepsi } = await admin.auth.admin.listUsers();
  const ekle = async (tema, sahip, puan) => {
    const yol = `${tema.etkinlik}/${tema.id}/${crypto.randomUUID()}.jpg`;
    await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
    const kr = (await admin.from('kareler').insert({ tema: tema.id, sahip, dosya: yol, genislik: 1200, yukseklik: 800 })
      .select('id').single()).data;
    await admin.from('oylar').insert({ kare: kr.id, veren: hepsi.users.find(u => u.email === 'esit7@test.local').id, puan });
  };
  await ekle(kalabalik, A.kimlik, 10);
  await ekle(esitTema, A.kimlik, 10);
  await ekle(kalabalik, hepsi.users.find(u => u.email === 'esit1@test.local').id, 9);

  await A.goto(APP + '#/siralama'); await A.waitForTimeout(2500);
  bekle('sezon sıralaması açıldı', icerir(await metin(A), 'Sezon sıralaması'), (await metin(A)).slice(0, 200));
  bekle('sıralı satır var', (await A.locator('.row').count()) > 0, String(await A.locator('.row').count()));
  bekle('sıralı satırda kare görünüyor', (await A.locator('.row img').count()) === (await A.locator('.row').count()),
    `${await A.locator('.row img').count()} / ${await A.locator('.row').count()}`);
  bekle('sıralı satırda puan var', /\d,\d/.test(await yaz(A, '.row .av')), await yaz(A, '.row .av'));
  bekle('Müdavim şeridi açıldı', (await A.locator('.mud').count()) === 1);
  bekle('kendi satırın işaretli', (await A.locator('.row.me').count()) + (await A.locator('.unr .me').count()) > 0);
  await olc(A, '44-siralama-dolu');

  // Sırasız blokta isim varsa oraya, yoksa sıralı satıra dokun
  const sirasiz = await A.locator('.unr .names button').count();
  const hedefAd = sirasiz > 0 ? await yaz(A, '.unr .names button') : await yaz(A, '.row .nm');
  await (sirasiz > 0 ? A.locator('.unr .names button').first() : A.locator('.row').first()).click();
  await A.waitForTimeout(2000);
  bekle('isimden profil açılıyor', icerir(await metin(A), hedefAd), `${hedefAd} | ${(await metin(A)).slice(0, 120)}`);
  bekle('başkasının profilinde sekme çubuğu yok', (await A.locator('.tabs').count()) === 0);
  bekle('başkasının profilinde geri var', (await A.locator('.geri').count()) === 1);
  bekle('başkasının profilinde ayar yok', !icerir(await metin(A), 'Kulüp afişi') && !icerir(await metin(A), 'Çıkış yap'));
  bekle('başkasının ortalaması yazmıyor', !icerir(await metin(A), 'Ortalaman'));
  await olc(A, '45-baskasinin-profili');
  await A.locator('.geri').click(); await A.waitForTimeout(1500);
  bekle('geri sıralamaya döner', icerir(await metin(A), 'Sezon sıralaması') || icerir(await metin(A), 'İlk sonuçlarla'),
    (await metin(A)).slice(0, 120));

  // Kendi profilin: ortalama ve ayarlar burada
  await A.goto(APP + '#/profil'); await A.waitForTimeout(2200);
  bekle('kendi profilinde ortalaman var', icerir(await metin(A), 'Ortalaman'), (await metin(A)).slice(0, 220));
  bekle('kendi profilinde kareler var', (await A.locator('.grid figure').count()) > 0);
  bekle('kendi profilinde ayarlar var', icerir(await metin(A), 'Kulüp afişi'));
  await olc(A, '46-kendi-profilin');
}

// 16 · Üye çıkarma ve geri alma (karar 99)
{
  await A.goto(APP + '#/uyeler'); await A.waitForTimeout(1500);
  bekle('üyeler ekranı açıldı', icerir(await metin(A), 'Üyeler'));
  // Tam ad eşleşmesi şart: hasText büyük-küçük harf ayırmıyor, "Çıkar" araması
  // "Kulüpten çıkar" ve "Yöneticilikten çıkar" düğmelerine de takılıyor.
  await A.locator('button.satir.acilir', { hasText: 'selin@test.local' }).click(); await A.waitForTimeout(300);
  await A.getByRole('button', { name: 'Kulüpten çıkar', exact: true }).first().click();
  await A.waitForTimeout(500);
  bekle('onay kutusu ne olacağını yazıyor',
    icerir(await metin(A), 'Kareleri ve adı geçmiş etkinliklerde kalır'), (await metin(A)).slice(0, 300));
  bekle('onayda vazgeçme var', (await A.getByRole('button', { name: 'Vazgeç', exact: true }).count()) > 0);
  await A.getByRole('button', { name: 'Çıkar', exact: true }).click();
  await A.waitForTimeout(1800);
  bekle('çıkarılan satır işaretli', icerir(await metin(A), 'Çıkarıldı'), (await metin(A)).slice(0, 300));
  // İşlemden sonra satır kapanıyor; geri al için yeniden açılıyor
  await A.locator('button.satir.acilir', { hasText: 'selin@test.local' }).click(); await A.waitForTimeout(300);
  bekle('geri al düğmesi var', (await A.getByRole('button', { name: 'Geri al', exact: true }).count()) === 1);
  // Önceki hâli ilk .sec'i ("Katılma istekleri") okuyordu, sayacı hiç ölçmüyordu
  {
    const sayac = await A.evaluate(() => [...document.querySelectorAll('h2.sec')].find(h => h.textContent.startsWith('Üyeler'))?.querySelector('span')?.textContent);
    const iceride = await A.evaluate(() => [...document.querySelectorAll('.satir')].filter(e => !e.closest('.cikarilmis')).length);
    bekle('üye sayacı çıkarılanı saymıyor', sayac === `${iceride} üye`, `${sayac} / ${iceride}`);
  }
  await olc(A, '47-uye-cikarildi');

  // Çıkarılan kişi ne görüyor
  await B.goto(APP + '#/etkinlikler'); await B.reload(); await B.waitForTimeout(2000);
  bekle('çıkarılan kapalı ekranı görüyor', icerir(await metin(B), 'Artık') && icerir(await metin(B), 'kulüpte değilsin'),
    (await metin(B)).slice(0, 200));
  bekle('çıkarılanda sekme çubuğu yok', (await B.locator('.tabs').count()) === 0);
  bekle('kapalı ekranda çıkış var', (await B.getByRole('button', { name: 'Çıkış yap', exact: true }).count()) === 1);
  await olc(B, '48-cikarildin');
  await B.getByRole('button', { name: 'İstek bırak', exact: true }).click(); await B.waitForTimeout(1200);
  // Önceki hâli "istek" kelimesini arıyordu; "İstek bırak" düğmesi zaten eşleştiği için
  // form hiç açılmasa da geçiyordu. Artık formun alanına ve doğru metne bakıyor.
  bekle('çıkarılan istek formuna geçebiliyor', (await B.locator('#ad').count()) === 1, (await metin(B)).slice(0, 200));
  bekle('çıkarılana "kabul edilmedi" denmiyor', !icerir(await metin(B), 'kabul edilmedi') && icerir(await metin(B), 'neden dönmek istediğini'),
    (await metin(B)).slice(0, 200));

  // Yönetici geri alıyor
  await A.goto(APP + '#/uyeler'); await A.reload(); await A.waitForTimeout(1800);
  await A.locator('button.satir.acilir', { hasText: 'selin@test.local' }).click(); await A.waitForTimeout(300);
  await A.getByRole('button', { name: 'Geri al', exact: true }).first().click(); await A.waitForTimeout(1800);
  bekle('geri alınca işaret kalkıyor', !icerir(await metin(A), 'Çıkarıldı'), (await metin(A)).slice(0, 300));
  await B.goto(APP + '#/etkinlikler'); await B.reload(); await B.waitForTimeout(2000);
  bekle('geri alınan kişi içeri giriyor', !icerir(await metin(B), 'kulüpte değilsin'), (await metin(B)).slice(0, 160));
}

// 17 · Çıkış
await B.goto(APP + '#/profil'); await B.waitForTimeout(600);
await B.click('button:has-text("Çıkış yap")');
bekle('çıkışta kapak', await bekleMetin(B, 'Google ile giriş yap'));

bekle('konsol hatası yok', hatalar.length === 0, hatalar.join(' | '));
await b.close();
rapor();
