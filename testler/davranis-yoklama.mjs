// Davranış testi: yoklama ve yarışmadan çıkarma (karar 103), skills/behaviour-check.md.
// Her adımda iki yarı ölçülüyor: ekranın söylediği ve veritabanında olan.
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';

const APP = 'http://localhost:5180/';
const SS = '/tmp/cgapp/ss';
fs.mkdirSync(SS, { recursive: true });
await sifirla();

const kA = await kullanici('kurucu@test.local', 'Ayşe Kaya');
const kB = await kullanici('selin@test.local', 'Selin Arı');
const kD = await kullanici('deniz@test.local', 'Deniz Akın');
await kA.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', kA.id);
await admin.from('uyeler').insert([
  { id: kB.id, ad: 'Selin Arı', eposta: 'selin@test.local', rol: 'uye', hosgeldin_goruldu: true },
  { id: kD.id, ad: 'Deniz Akın', eposta: 'deniz@test.local', rol: 'uye', hosgeldin_goruldu: true },
]);
const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: kA.id }).select('id').single()).data.id;
const tm = (await admin.from('temalar').insert([
  { etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true },
  { etkinlik: E, ad: 'Doku', sira: 2, bulusmada: false },
]).select('id, sira, ad')).data.sort((x, y) => x.sira - y.sira);
const [SOKAK] = tm;
// Deniz yoklamadan önce yüklüyor (sonra yoklamada adı olmayacak)
const yolD = `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`;
await kD.c.storage.from('kareler').upload(yolD, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
const kareD = (await kD.c.from('kareler').insert({ tema: SOKAK.id, dosya: yolD, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single()).data.id;

const b = await chromium.launch();
const hatalar = [];
async function kisi(eposta) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(`${eposta}: ${e}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) hatalar.push(`${eposta}: ${m.text()}`); });
  await p.goto(APP);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error; }, eposta);
  return p;
}
const git = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(1300); };
const metin = p => p.locator('.app').innerText().then(t => t.replace(/\s+/g, ' '));
const var_ = async (p, t) => (await metin(p)).toLocaleLowerCase('tr-TR').includes(t.toLocaleLowerCase('tr-TR'));
const ulasilir = (p, sec) => p.evaluate(s => {
  const l = document.querySelectorAll(s); const e = l[l.length - 1]; if (!e) return 'yok';
  const r = e.getBoundingClientRect();
  const u = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return u === e || e.contains(u) ? 'evet' : `örtülü: ${u?.className}`;
}, sec);

const A = await kisi('kurucu@test.local');
const B = await kisi('selin@test.local');
const D = await kisi('deniz@test.local');
try {

// ---------------------------------------------------------------- 1. yönetici yoklamayı alır
await git(A, 'profil');
bekle('1: profilde yoklama hatırlatması', await var_(A, 'Yoklamayı al'));
await A.locator('button.satir', { hasText: 'Yoklamayı al' }).click();
await A.waitForTimeout(1300);
bekle('1: hatırlatma aşama ekranına götürüyor', await var_(A, 'Yoklama') && await var_(A, 'Alınana kadar herkes kare yükleyebiliyor'));
await A.getByRole('button', { name: 'Yoklamayı al', exact: true }).click();
await A.waitForTimeout(300);
const satirlar = await A.locator('.yoklama .izin').allInnerTexts();
bekle('1: listede bütün üyeler, boş işaretli', satirlar.length === 3 && (await A.locator('.yoklama .box.on').count()) === 0, JSON.stringify(satirlar));
const ulas = await ulasilir(A, '.yoklama .izin');
bekle('1: onay kutuları dokunulabilir', ulas === 'evet', ulas);
await A.locator('.yoklama .izin', { hasText: 'Ayşe Kaya' }).click();
await A.locator('.yoklama .izin', { hasText: 'Selin Arı' }).click();
bekle('1: işaret ekranda görünüyor', (await A.locator('.yoklama .box.on').count()) === 2);
bekle('1: işaretlemek henüz kaydetmiyor', ((await admin.from('yoklama').select('uye').eq('etkinlik', E)).data ?? []).length === 0);
await A.screenshot({ path: `${SS}/50-yoklama-al.png` });
await A.getByRole('button', { name: 'Yoklamayı kaydet' }).click();
await A.waitForTimeout(1500);
const dbY = ((await admin.from('yoklama').select('uye').eq('etkinlik', E)).data ?? []).map(x => x.uye).sort();
bekle('1: kaydedilen veritabanında', JSON.stringify(dbY) === JSON.stringify([kA.id, kB.id].sort()), JSON.stringify(dbY));
bekle('1: ekran sayıyı söylüyor', await var_(A, '2 / 3 geldi') && await var_(A, 'Gelmeyenler kare yükleyemiyor'));
bekle('1: gelmeyenin önceki karesi yöneticiye bildiriliyor', await var_(A, 'Gelmeyen 1 kişi 1 kare yüklemiş'));
await A.screenshot({ path: `${SS}/51-yoklama-alindi.png`, fullPage: true });
await git(A, 'profil');
bekle('1: yoklama alınınca hatırlatma kalkıyor', !(await var_(A, 'Yoklamayı al')));

// Düzeltme: mevcut işaretlerle açılıyor, vazgeçince hiçbir şey değişmiyor
await git(A, 'asama');
await A.getByRole('button', { name: 'Yoklamayı düzelt' }).click();
await A.waitForTimeout(300);
bekle('1: düzeltme kayıtlı işaretlerle açılıyor', (await A.locator('.yoklama .box.on').count()) === 2);
await A.locator('.yoklama .izin', { hasText: 'Selin Arı' }).click();
await A.getByRole('button', { name: 'Vazgeç' }).first().click();
await A.waitForTimeout(300);
bekle('1: vazgeçince kayıt değişmiyor', ((await admin.from('yoklama').select('uye').eq('etkinlik', E)).data ?? []).length === 2 && await var_(A, '2 / 3 geldi'));

// ---------------------------------------------------------------- 2. gelmeyen üye
await git(D, 'etkinlikler');
bekle('2: ana kartta yoklama durumu', await var_(D, 'Durumuna bak') && await var_(D, 'Yoklamada adın yok'));
await D.locator('.live .act').click();
await D.waitForTimeout(1300);
bekle('2: yükleme ekranı nedenini söylüyor', await var_(D, 'Yoklamada adın yok, bu etkinliğe kare yükleyemezsin'));
await D.locator('.kontakt .k').nth(1).click();
await D.waitForTimeout(200);
bekle('2: serbest temada da kilitli, kare seçilemiyor', (await D.locator('button.bos').count()) === 0 && await var_(D, 'Yoklamada adın yok'));
await D.screenshot({ path: `${SS}/52-gelmeyen-yukleme.png` });

// ---------------------------------------------------------------- 3. gelen üye yükler, çıkmaz sokak yok
await git(B, 'etkinlikler');
bekle('3: iki temada düğme tek temayı adlandırmıyor', await var_(B, 'Karelerini yükle') && !(await var_(B, 'için kare yükle')));
await B.locator('.live .act').click();
await B.waitForTimeout(1300);
// Kullanıcının yolu: "Kare seç"e dokun, dosya seçiciden seç
const sec = async () => {
  const [fc] = await Promise.all([B.waitForEvent('filechooser'), B.locator('button.bos').click()]);
  await fc.setFiles('/tmp/cgapp/dogru.jpg');
};
await sec();
await B.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
await B.waitForTimeout(500);
bekle('3: yükleyince sıradaki temaya geçiş öneriliyor', await var_(B, 'Doku temasına geç'));
await B.getByRole('button', { name: 'Doku temasına geç' }).click();
await B.waitForTimeout(200);
bekle('3: geçiş gerçekten Doku temasını seçiyor', (await B.locator('.kontakt .k.secili .ad').textContent()) === 'Doku' && (await B.locator('button.bos').count()) === 1);
// Yarıda bırakıp ana ekrana dönünce kart kaldığı yeri söylüyor
await git(B, 'etkinlikler');
bekle('3: yarım kalınca kart devam etmeyi ve kalanı söylüyor', await var_(B, 'Yüklemeye devam et') && await var_(B, '1 tema kaldı'), (await metin(B)).slice(0, 200));
await B.locator('.live .act').click();
await B.waitForTimeout(1300);
bekle('3: dönünce ilk boş tema açılıyor', (await B.locator('.kontakt .k.secili .ad').textContent()) === 'Doku');
await sec();
await B.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
await B.waitForTimeout(500);
bekle('3: hepsi yüklenince kapanış ve dönüş düğmesi', await var_(B, 'Kareler yüklendi') && await var_(B, 'Etkinliklere dön'));
bekle('3: iki kare veritabanında', ((await admin.from('kareler').select('id').eq('sahip', kB.id)).data ?? []).length === 2);
await B.screenshot({ path: `${SS}/53-yukleme-bitti.png`, fullPage: true });
const ulas3 = await ulasilir(B, '.kutu .btn');
bekle('3: dönüş düğmesi dokunulabilir', ulas3 === 'evet', ulas3);
await B.getByRole('button', { name: 'Etkinliklere dön' }).click();
await B.waitForTimeout(1200);
bekle('3: ana ekrana dönüyor, kart tamamlandığını söylüyor', B.url().endsWith('#/etkinlikler') && await var_(B, 'Karelerine bak') && await var_(B, '2 / 2 tema'), B.url());

// ---------------------------------------------------------------- 4. toplu çıkarma ve geri alma
await git(A, 'asama');
await A.getByRole('button', { name: 'Karelerini çıkar' }).click();
await A.waitForTimeout(1500);
bekle('4: gelmeyenin karesi çıkarıldı (veritabanı)', ((await admin.from('diskalifiye').select('neden').eq('kare', kareD)).data ?? [])[0]?.neden === 'Buluşmaya katılmadın.');
bekle('4: özet kutusu kalkıyor', !(await var_(A, 'Gelmeyen 1 kişi')));
bekle('4: toplu çıkarılan kare kare listelenmiyor, yalnız sayısı', (await A.locator('.cikan').count()) === 0 && await var_(A, 'Gelmeyenlerin 1 karesi yarışmadan çıkarıldı'));
bekle('4: geri alma yolu yazıyor', await var_(A, 'yoklamayı düzelt, geri gelir'));
bekle('4: aşama sayacı çıkarılanı saymıyor', (await A.locator('.ozet').innerText()).includes('1 kare'), await A.locator('.ozet').innerText());
await A.screenshot({ path: `${SS}/54-cikarilanlar.png`, fullPage: true });
// Geri alma: yoklamada Deniz'i gelmiş işaretle
await A.getByRole('button', { name: 'Yoklamayı düzelt' }).click();
await A.locator('.yoklama .izin', { hasText: 'Deniz Akın' }).click();
await A.getByRole('button', { name: 'Yoklamayı kaydet' }).click();
await A.waitForTimeout(1500);
bekle('4: yoklama düzeltilince kare geri geliyor (veritabanı)', ((await admin.from('diskalifiye').select('kare')).data ?? []).length === 0);
bekle('4: ekranda sayı kalkıyor, sayaç düzeliyor', !(await var_(A, 'Gelmeyenlerin 1 karesi')) && (await A.locator('.ozet').innerText()).includes('2 kare'), await A.locator('.ozet').innerText());
// Yeniden: Deniz gelmedi, karesi çıkar (sonraki adımlar için)
await A.getByRole('button', { name: 'Yoklamayı düzelt' }).click();
await A.locator('.yoklama .izin', { hasText: 'Deniz Akın' }).click();
await A.getByRole('button', { name: 'Yoklamayı kaydet' }).click();
await A.waitForTimeout(1500);
bekle('4: gelmeyen kutusu yeniden çıkıyor', await var_(A, 'Gelmeyen 1 kişi 1 kare yüklemiş'));
await A.getByRole('button', { name: 'Karelerini çıkar' }).click();
await A.waitForTimeout(1300);

// ---------------------------------------------------------------- 5. sahibi çıkarılan karesini görür
await git(D, 'yukle');
bekle('5: sahibi nedeni görüyor', await var_(D, 'Yarışmadan çıkarıldı') && await var_(D, 'Buluşmaya katılmadın.'), (await metin(D)).slice(0, 260));
bekle('5: ekran çıkarılan kareyle açılıyor', (await D.locator('.kontakt .k.secili .ad').textContent()) === 'Sokak');
bekle('5: kontakt baskıda "çıkarıldı" yazıyor, "yüklendi" değil', (await D.locator('.kontakt .k').first().locator('.d').textContent()) === 'çıkarıldı');
bekle('5: değiştir/kaldır yok', (await D.getByRole('button', { name: 'Değiştir' }).count()) === 0 && (await D.getByRole('button', { name: 'Kaldır' }).count()) === 0);
await D.screenshot({ path: `${SS}/55-sahip-cikarildi.png`, fullPage: true });

// ---------------------------------------------------------------- 6. oylamada yönetici isimsiz çıkarır
await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.2) }).eq('id', E);
await git(A, 'asama');
bekle('6: oylamada yoklama kilitli', await var_(A, 'Oylama başladı, yoklama artık değişmiyor') && (await A.getByRole('button', { name: 'Yoklamayı düzelt' }).count()) === 0);
bekle('6: oylamada toplu çıkarılanın yalnız sayısı, düzeltme önerisi yok', (await A.getByRole('button', { name: 'Geri al' }).count()) === 0 && await var_(A, 'Gelmeyenlerin 1 karesi yarışmadan çıkarıldı') && !(await var_(A, 'yoklamayı düzelt')));
await A.screenshot({ path: `${SS}/55b-asama-oylamada.png`, fullPage: true });
await git(A, 'oyla/' + SOKAK.id);
const oncekiSayi = await A.locator('.kare').count();
bekle('6: yöneticide çıkarma düğmesi künyede', (await A.locator('.kare .mast .cikar').count()) === oncekiSayi && oncekiSayi > 0, String(oncekiSayi));
bekle('6: çıkarılan kare yöneticinin akışında yok', oncekiSayi === 1, String(oncekiSayi));
await git(B, 'oyla/' + SOKAK.id);
bekle('6: üyede çıkarma düğmesi yok', (await B.locator('.cikar').count()) === 0);
await A.locator('.kare .mast .cikar').first().click();
await A.waitForTimeout(300);
bekle('6: pencere açıldı, düğmesi nedensiz kapalı', (await A.locator('.pencere').count()) === 1 && await A.locator('.pencere .btn:not(.ik)').isDisabled());
bekle('6: neden alanı 16px (iOS yakınlaştırmasın)', await A.locator('#cikar-neden').evaluate(e => getComputedStyle(e).fontSize) === '16px');
const ulas6 = await ulasilir(A, '.pencere .btn:not(.ik)');
bekle('6: çıkar düğmesi dokunulabilir', ulas6 === 'evet', ulas6);
await A.screenshot({ path: `${SS}/56-oylama-cikar.png` });
await A.getByRole('button', { name: 'Vazgeç' }).click();
await A.waitForTimeout(200);
bekle('6: vazgeçince pencere kapanıyor, kare yerinde', (await A.locator('.pencere').count()) === 0 && (await A.locator('.kare').count()) === 1);
const hedefKare = await A.locator('.kare').first().getAttribute('data-kare');
// Hata yolu: kare bu arada başka yerden çıkarılmış olsun, pencere hatayı gösterip açık kalmalı
await A.evaluate(() => { window.__eskiRpc = window.__sb.rpc.bind(window.__sb); window.__sb.rpc = (f, a) => f === 'kare_cikar' ? window.__eskiRpc(f, { ...a, p_kare: '00000000-0000-0000-0000-000000000000' }) : window.__eskiRpc(f, a); });
await A.locator('.kare .mast .cikar').first().click();
await A.locator('#cikar-neden').fill('Deneme');
await A.locator('.pencere .btn:not(.ik)').click();
await A.waitForTimeout(800);
bekle('6: hata pencerede görünüyor, pencere açık kalıyor', (await A.locator('.pencere').count()) === 1 && (await A.locator('.pencere').innerText()).includes('Bu kare artık yok'), await A.locator('.pencere').innerText().catch(() => ''));
await A.evaluate(() => { window.__sb.rpc = window.__eskiRpc; });
await A.locator('.pencere').click({ position: { x: 20, y: 20 } });
await A.waitForTimeout(200);
bekle('6: pencerenin dışına dokununca kapanıyor', (await A.locator('.pencere').count()) === 0);
await A.locator('.kare .mast .cikar').first().click();
await A.locator('#cikar-neden').fill('Başka gün çekilmiş');
await A.locator('.pencere .btn:not(.ik)').click();
await A.waitForTimeout(1200);
bekle('6: kare veritabanında çıkarıldı', ((await admin.from('diskalifiye').select('neden').eq('kare', hedefKare)).data ?? [])[0]?.neden === 'Başka gün çekilmiş');
bekle('6: kare akıştan düştü ve bildirim göründü', (await A.locator('.kare').count()) === 0 && await var_(A, 'Kare yarışmadan çıkarıldı'));
bekle('6: bildirim geri alma yerini söylüyor', await var_(A, "Profil'de Yönetim'den geri alabilirsin"));
await A.screenshot({ path: `${SS}/57-oylama-cikti.png` });
await git(B, 'oyla/' + SOKAK.id);
bekle('6: üyenin akışından da düştü', (await B.locator(`[data-kare="${hedefKare}"]`).count()) === 0);

// ---------------------------------------------------------------- 7. sonuç
// Yönetici oylamada çıkardığını Aşama'dan geri alıyor (bildirim oraya yönlendiriyor)
await git(A, 'asama');
bekle('6: oylamada kare çıkınca bitirdi kapanıyor', await var_(A, 'Kimin bitirdiği sonuçlara kadar kapalı'), (await metin(A)).slice(0, 300));
bekle('6: kapalıyken kimse bitirdi görünmüyor', !(await A.locator('.ozet').last().innerText()).includes('Bitirdi'), await A.locator('.ozet').last().innerText());
bekle('6: çıkarılanlar listesinde tek tek çıkarılan, resmi ve nedeniyle', (await A.locator('.cikan').count()) === 1
  && (await A.locator('.cikan img').count()) === 1 && (await A.locator('.cikan').innerText()).includes('Başka gün çekilmiş'));
await A.getByRole('button', { name: 'Geri al' }).click();
await A.waitForTimeout(1300);
await A.waitForTimeout(900);   // liste sayaçla tazeleniyor, eski satırlara bakmayalım
bekle('6: geri alınca perde kalkmıyor', await var_(A, 'Kimin bitirdiği sonuçlara kadar kapalı'), (await metin(A)).slice(0, 300));
bekle('6: geri al düğmesi kareyi yarışmaya döndürüyor', ((await admin.from('diskalifiye').select('kare').eq('kare', hedefKare)).data ?? []).length === 0
  && (await A.locator('.cikan').count()) === 0);
// Kare Selin'in; kendi karesi kendi akışında olmaz, başka üyeye bak
await git(D, 'oyla/' + SOKAK.id);
bekle('6: geri alınan kare üyenin akışına dönüyor', (await D.locator(`[data-kare="${hedefKare}"]`).count()) === 1);
// Ayşe puan versin ki sonuçta sıralama olsun
await kA.c.from('oylar').insert({ kare: hedefKare, veren: kA.id, puan: 8 });
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
await git(D, 'sonuc/' + E);
bekle('7: sahibi kendi çıkarılan karesini ayrı bölümde görüyor', await var_(D, 'Yarışmadan çıkarılan') && (await D.locator('.izgara figure.cikti').count()) === 1);
bekle('7: sahibe kimin gördüğü yazıyor', await var_(D, 'Bunu yalnız sen ve yöneticiler görüyorsunuz'));
bekle('7: sayılar çıkarılanı saymıyor', (await D.locator('.bas .meta').innerText()).includes('2 kare'), await D.locator('.bas .meta').innerText());
await D.locator('.izgara figure.cikti').click();
await D.waitForTimeout(400);
bekle('7: detayda neden', await var_(D, 'Yarışmadan çıkarıldı') && await var_(D, 'Buluşmaya katılmadın.'));
bekle('7: sahipte geri alma düğmesi yok', (await D.getByRole('button', { name: 'Yarışmaya geri al' }).count()) === 0);
await git(B, 'sonuc/' + E);
bekle('7: başka üye çıkarılanı hiç görmüyor', !(await var_(B, 'Yarışmadan çıkarılan')) && !(await var_(B, 'Deniz')));
await git(A, 'sonuc/' + E);
bekle('7: yönetici çıkarılanı görüyor', (await A.locator('.izgara figure.cikti').count()) === 1);
bekle('7: yöneticiye kimin gördüğü yazıyor', await var_(A, 'Bunları yalnız sahipleri ve yöneticiler görüyor'));
bekle('7: kazanan Selin', (await A.locator('.odul').textContent()).includes('Selin'), await A.locator('.odul').textContent().catch(() => ''));
await A.locator('.kazanan img').first().click();
await A.waitForTimeout(400);
await A.getByRole('button', { name: 'Yarışmadan çıkar' }).click();
await A.locator('#cikar-neden').fill('Deneme');
await A.locator('.pencere .btn:not(.ik)').click();
await A.waitForTimeout(1500);
bekle('7: sonuçtan sonra çıkarınca detay kapanıp liste tazeleniyor', (await A.locator('.detay').count()) === 0 && (await A.locator('.izgara figure.cikti').count()) === 2);
bekle('7: temanın kazananı kalmadı', (await A.locator('.odul').count()) === 0);
await A.locator('.izgara figure.cikti').first().click();
await A.waitForTimeout(400);
const geriAlVar = await A.getByRole('button', { name: 'Yarışmaya geri al' }).count();
bekle('7: yönetici detaydan geri alabiliyor', geriAlVar === 1);
await A.screenshot({ path: `${SS}/58-sonuc-cikarilan.png`, fullPage: true });
await A.getByRole('button', { name: 'Yarışmaya geri al' }).click();
await A.waitForTimeout(1500);
bekle('7: geri alınca detay kapanıyor, kare yarışmaya dönüyor', (await A.locator('.detay').count()) === 0
  && (await A.locator('.izgara figure.cikti').count()) === 1
  && ((await admin.from('diskalifiye').select('kare')).data ?? []).length === 1);


// ---------------------------------------------------------------- 8. tek temalı etkinlik: tekil dil
{
  const E1 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-0.5), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: kA.id }).select('id').single()).data.id;
  await admin.from('temalar').insert({ etkinlik: E1, ad: 'Pencere', sira: 1, bulusmada: false });
  await git(B, 'etkinlikler');
  bekle('8: tek temada kart "Kareni yükle" diyor', await var_(B, 'Kareni yükle') && !(await var_(B, 'Karelerini yükle')));
  await B.locator('.live .act').click();
  await B.waitForTimeout(1300);
  const [fc] = await Promise.all([B.waitForEvent('filechooser'), B.locator('button.bos').click()]);
  await fc.setFiles('/tmp/cgapp/dogru.jpg');
  await B.locator('.yuk').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await B.waitForTimeout(500);
  bekle('8: tek temada kapanış "Karen yüklendi"', await var_(B, 'Karen yüklendi') && !(await var_(B, 'temasına geç')));
}

// ---------------------------------------------------------------- 9. yoklamanın zaman sınırları
{
  await admin.from('etkinlikler').delete().neq('id', E);
  const yarin = new Date(Date.parse(bugun) + 86400000).toISOString().slice(0, 10);
  const E9 = (await admin.from('etkinlikler').insert({ bulusma_gunu: yarin, yukleme_baslar: saat(20), yukleme_biter: saat(40), oylama_biter: saat(60), kuran: kA.id }).select('id').single()).data.id;
  await admin.from('temalar').insert({ etkinlik: E9, ad: 'Yarın', sira: 1, bulusmada: true });
  await git(A, 'asama');
  bekle('9: buluşmadan önce yoklama açılmıyor', await var_(A, 'Buluşma günü açılır') && (await A.getByRole('button', { name: 'Yoklamayı al' }).count()) === 0);
  await git(A, 'profil');
  bekle('9: buluşmadan önce hatırlatma yok', !(await var_(A, 'Yoklamayı al')));
  await admin.from('etkinlikler').update({ bulusma_gunu: bugun, yukleme_baslar: saat(-2), yukleme_biter: saat(-1), oylama_biter: saat(20) }).eq('id', E9);
  await git(A, 'asama');
  bekle('9: yoklama alınmadan oylama başladıysa bunu söylüyor', await var_(A, 'Yoklama alınmadı. Oylama başladığı için artık alınmıyor') && (await A.getByRole('button', { name: 'Yoklamayı al' }).count()) === 0);
  await git(A, 'profil');
  bekle('9: oylamada hatırlatma yok', !(await var_(A, 'Yoklamayı al')));
}
} catch (x) {
  bekle('akış yarıda kalmadı', false, String(x).split('\n')[0].slice(0, 300));
}
bekle('konsol hatası yok', hatalar.length === 0, hatalar.join(' | '));
await b.close();
rapor();
