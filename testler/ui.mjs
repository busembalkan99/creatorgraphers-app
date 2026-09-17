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
    await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, eposta);
    await p.reload(); await p.waitForTimeout(700);
  };
  return p;
}
const metin = p => p.locator('.app').innerText();
const icerir = (a, b) => a.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR').includes(b.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR'));
const yaz = (p, sec, i = 0) => p.evaluate(([s, j]) => (document.querySelectorAll(s)[j]?.textContent ?? '').trim(), [sec, i]);
const bekleMetin = (p, t) => p.getByText(t, { exact: false }).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
async function olc(p, ad) {
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
bekle('kapak: Google ile gir var', await bekleMetin(A, 'Google ile gir'));
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
bekle('ret sonucu yazılır', await bekleMetin(A, 'Reddedildi. Kişi bunu görecek'));
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
await olc(B, '12-profil-uye');
await B.goto(APP + '#/uyeler'); await B.waitForTimeout(600);
bekle('üye #/uyeler açınca istekleri görmez', !icerir(await metin(B), 'Katılma istekleri'));
await B.click('.tabs button:has-text("Sıralama")');
bekle('sıralama kilitli', await bekleMetin(B, 'İlk sonuçlarla açılıyor'));
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
bekle('canlı kart yükleme açık', await bekleMetin(B, 'Sokak için kare yükle'));
bekle('canlı kart turuncu', (await B.locator('.live').getAttribute('data-asama')) === 'yukleme');
await olc(B, '16-etkinlikler-canli');
await B.click('.live .act');
bekle('yükleme ekranı', await bekleMetin(B, 'Buluşmada çekilir'));
const giris = B.locator('input[type=file]');
const dosya = async ad => { await giris.setInputFiles(`/tmp/cgapp/${ad}.jpg`); await B.waitForTimeout(300); await B.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await B.waitForTimeout(300); };
await olc(B, '17-yukleme-bos');
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
await admin.from('kareler').insert({ tema: sokak.id, sahip: ucuncu.id, dosya: yol3, genislik: 1200, yukseklik: 800, cekim_gunu: bugun });

await A.goto(APP + '#/etkinlikler'); await A.waitForTimeout(1200);
bekle('canlı kartta oylama çağrısı', icerir(await metin(A), 'Oylamaya başla'), (await metin(A)).slice(0, 160));
bekle('kalan kare sayısı kartta', icerir(await metin(A), '3 kare kaldı'), await metin(A));
await A.click('.live .act'); await A.waitForTimeout(1500);
bekle('oylama tema listesi', icerir(await metin(A), 'Temalar'));
bekle('kurucuya zorunlu değil', icerir(await metin(A), 'oylamak zorunda değilsin'));
bekle('isim sızmıyor', !icerir(await metin(A), 'Selin') && !icerir(await metin(A), 'Deniz'));
await olc(A, '27-oylama-temalar');
await A.locator('.tema-satir').first().click(); await A.waitForTimeout(1500);
bekle('akışta iki kare', (await A.locator('.kare').count()) === 2);
bekle('kare görünüyor', await A.locator('.kare .tutucu img').first().evaluate(i => i.complete && i.naturalWidth > 0));
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
// bitiş ekranına kaydır
await A.evaluate(() => { const a = document.querySelector('.akis'); a.scrollTo({ top: a.scrollHeight }); });
await A.waitForTimeout(1000);
bekle('bitişte 1 kare kaldı', icerir(await metin(A), '1 kare') && icerir(await metin(A), 'Puan vermediğin kareler'));
bekle('eksik ızgarada 1 kart', (await A.locator('.bitti .eksik button').count()) === 1);
await olc(A, '30-oylama-bitis-eksik');
bekle('eksik kart düğmesi doğru', icerir(await yaz(A, '.bitti .btn'), 'puansız'));
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
bekle('tema bitti ekranı', icerir(await metin(A), 'bitti') && !icerir(await metin(A), 'Puan vermediğin'), (await metin(A)).slice(0, 120));
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

// B kendi karelerini oylamıyor
await B.goto(APP + '#/oyla'); await B.waitForTimeout(1500);
bekle('B için Sokak zorunlu', icerir(await metin(B), 'oylaman gerekiyor'));
bekle('B kendi karesini görmüyor', icerir(await metin(B), '0 / 1'), await metin(B));
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
await olc(A, '34-oylama-kapandi');

// 12 · Çıkış
await B.goto(APP + '#/profil'); await B.waitForTimeout(600);
await B.click('button:has-text("Çıkış yap")');
bekle('çıkışta kapak', await bekleMetin(B, 'Google ile gir'));

bekle('konsol hatası yok', hatalar.length === 0, hatalar.join(' | '));
await b.close();
rapor();
