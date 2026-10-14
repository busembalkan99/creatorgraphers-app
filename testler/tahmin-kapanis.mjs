// Tahmin oyunu oynanırken oylama kapanıyor; cevabın yanıtı yolda kayboluyor (audit 2026-10-14, Must fix 1).
import fs from 'node:fs';
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor, depo } from './ortak.mjs';
const APP = (process.env.CG_APP ?? 'http://localhost:5180/');
await sifirla();
const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'], ['selin@test.local', 'Selin Arı'], ['can@test.local', 'Can Öz'],
  ['deniz@test.local', 'Deniz Akın'], ['elif@test.local', 'Elif Sunar'], ['mert@test.local', 'Mert Demir'],
  ['pelin@test.local', 'Pelin Er'],
];
const U = [];
for (const [e, ad] of KISI) U.push({ ...(await kullanici(e, ad)), ad, eposta: e });
const [A] = U;
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', A.id);
await admin.from('uyeler').insert(U.slice(1).map(u => ({ id: u.id, ad: u.ad, eposta: u.eposta, rol: 'uye', hosgeldin_goruldu: true })));
const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const SOKAK = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true }).select('id').single()).data;
for (const K of U.slice(1)) {
  const yol = `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`;
  await depo.koy(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), K.id);
  await K.c.from('kareler').insert({ tema: SOKAK.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun });
}
await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E);
for (const K of U) for (const [i, k] of ((await K.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? []).entries())
  await K.c.from('oylar').insert({ kare: k.id, veren: K.id, puan: Math.min(10, i + 1) });
// Kurucu oyunu başlatıp ilk soruyu sunucudan geçiyor
await A.c.rpc('tahmin_baslat', { p_etkinlik: E });
const sorular = (await A.c.rpc('tahmin_sorularim', { p_etkinlik: E })).data ?? [];
await A.c.rpc('tahmin_cevapla', { p_etkinlik: E, p_sira: sorular[0].sira, p_cevap: null, p_gec: true });
const toplam = String(sorular.length).padStart(2, '0');

const b = await chromium.launch(); const hatalar = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// Telefonun saati sunucudan 5 sn ileride (son inceleme, Important 1): kapanışta sunucu sonucu henüz vermiyor
await ctx.addInitScript(() => { const asil = Date.now.bind(Date); Date.now = () => asil() + 5000; });
const P = await ctx.newPage(); P.on('pageerror', e => hatalar.push(String(e)));
const metin = () => P.locator('.app').innerText().then(t => t.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR'));
const sayac = () => P.locator('.tahmin-bas span').textContent({ timeout: 1500 }).catch(() => null);
// Oylama 25 sn sonra bitiyor: ekran etkinliği açılışta okuyor, aşamayı saatten hesaplıyor (kapanış ekran açıkken oluyor)
const kapanis = Date.now() + 25000;
await admin.from('etkinlikler').update({ oylama_biter: new Date(kapanis).toISOString() }).eq('id', E);
try {
  await P.goto(APP); await P.waitForFunction(() => window.__sb);
  await P.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });
  // İlk açılışta bağlantı kopuyor: genel hata ekranında da Tekrar dene (kod incelemesi F7)
  await P.route('**/rest/v1/rpc/tahmin_durumu*', r => r.abort(), { times: 1 });
  await P.goto(APP + `#/tahmin/${E}`); await P.reload(); await P.waitForTimeout(1600);
  bekle('ilk açılış hatasında Tekrar dene var', (await P.getByRole('button', { name: 'Tekrar dene' }).count()) === 1, (await metin()).slice(0, 200));
  if (await P.getByRole('button', { name: 'Tekrar dene' }).count()) await P.getByRole('button', { name: 'Tekrar dene' }).click({ timeout: 1500 });
  else await P.reload();
  await P.waitForTimeout(1600);
  bekle('ekran ikinci soruda', (await sayac()) === `02 / ${toplam}`, await sayac());

  // Cevap sunucuya ulaşıyor ama yanıt yolda kayboluyor (Review Focus 5)
  await P.route('**/rest/v1/rpc/tahmin_cevapla*', async r => { await r.fetch(); await r.abort(); }, { times: 1 });
  // Kurtarma okuması yavaş: sürerken Sıradaki yeniden basılamamalı (kod incelemesi F1)
  await P.route('**/rest/v1/rpc/tahmin_sorularim*', async r => { await new Promise(s => setTimeout(s, 2000)); await r.continue(); }, { times: 1 });
  await P.locator('.aday').first().click();
  await P.getByRole('button', { name: 'Sıradaki' }).click(); await P.waitForTimeout(700);
  bekle('kurtarma okuması sürerken Sıradaki kilitli', await P.getByRole('button', { name: 'Sıradaki' }).isDisabled(), (await metin()).slice(0, 200));
  await P.waitForTimeout(2500);
  bekle('yanıt kaybolunca sunucudaki duruma dönüp üçüncü soruya geçiyor', (await sayac()) === `03 / ${toplam}`, await sayac());
  bekle('yanıt kaybolunca yeni soruda hata yazısı yok, seçim boş', (await P.locator('.hata').count()) === 0
    && (await P.locator('.tahmin-alt .secim b').textContent()).trim() === '—', (await metin()).slice(0, 200));
  bekle('takılma yok: "zaten cevapladın" yazmıyor', !(await metin()).includes('zaten cevapladın'), (await metin()).slice(0, 200));

  // Oylama kişi ekrandayken kapanıyor
  // Telefonda bitiş geçti, sunucuda 3 sn var: bu aralıkta dokunuluyor
  await P.waitForTimeout(Math.max(0, kapanis - Date.now() - 3000));
  // Kapanıştan sonraki ilk dokunuş ekranı yeniden çiziyor; sonuç o an yükleniyorsa Sıradaki hiç kalmayabilir
  await P.locator('.aday').first().click();
  await P.getByRole('button', { name: 'Sıradaki' }).click({ timeout: 1500 }).catch(() => {}); await P.waitForTimeout(2200);
  bekle('kapanışta oynayana "oynamadın" denmiyor', !(await metin()).includes('oynamadın'), (await metin()).slice(0, 200));
  await P.waitForTimeout(5000);
  bekle('kapanışta sonuç ekranı açılıyor', (await metin()).includes('doğru bildin'), (await metin()).slice(0, 200));
  const skor = await P.locator('.tahmin-skor b').textContent({ timeout: 1500 }).catch(() => null);
  bekle('telefon saati önde olsa da skor bütün soruları sayıyor (0/0 değil)', skor?.endsWith(`/${sorular.length}`), skor ?? 'skor yok');

  // Sonuç yüklenemezse sonsuz yükleniyor yok (Review Focus 1)
  await P.route('**/rest/v1/rpc/tahmin_sonucum*', r => r.abort());
  await P.goto(APP + `#/tahmin/${E}`); await P.reload(); await P.waitForTimeout(2200);
  bekle('sonuç yüklenemezse hata metni görünüyor, "oynamadın" değil', (await P.locator('.hata').count()) > 0 && !(await metin()).includes('oynamadın'), (await metin()).slice(0, 200));
  // Hata ekranı giriş ekranındaki kalıp: Tekrar dene ve Sonuçlara dön (Buse, 2026-10-14)
  bekle('sonuç hata ekranının künyesi Sonuçlar', (await metin()).startsWith('sonuçlar'), (await metin()).slice(0, 80));
  bekle('sonuç hata ekranında Tekrar dene ve Sonuçlara dön var', (await P.getByRole('button', { name: 'Tekrar dene' }).count()) === 1
    && (await P.getByRole('button', { name: 'Sonuçlara dön' }).count()) === 1, (await metin()).slice(0, 200));
  await P.screenshot({ path: '/tmp/cgapp/ss/kapanis-sonuc-hata.png' });
  await P.unroute('**/rest/v1/rpc/tahmin_sonucum*');
  await P.getByRole('button', { name: 'Tekrar dene' }).click({ timeout: 1500 }); await P.waitForTimeout(2500);
  bekle('Tekrar dene sonucu yüklüyor', (await metin()).includes('doğru bildin') && (await P.locator('.hata').count()) === 0, (await metin()).slice(0, 200));

  // A'nın sonucu yüklenirken B'ye geçiliyor: B'nin ekranında A'nın sonucu görünmemeli (kod incelemesi F3)
  const B = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-3), yukleme_biter: saat(-2), oylama_biter: saat(20), kuran: A.id }).select('id').single()).data.id;
  await P.route('**/rest/v1/rpc/tahmin_sonucum*', async r => { await new Promise(s => setTimeout(s, 3000)); await r.continue(); }, { times: 1 });
  await P.goto(APP + `#/tahmin/${E}`); await P.reload(); await P.waitForTimeout(400);
  await P.evaluate(id => { location.hash = `#/tahmin/${id}`; }, B); await P.waitForTimeout(5000);
  bekle('etkinlik değişince önceki etkinliğin sonucu gösterilmiyor', !(await metin()).includes('doğru bildin'), (await metin()).slice(0, 200));
  await admin.from('etkinlikler').update({ iptal: true }).eq('id', B);

  // Sunucu sonucu hiç vermiyor (hep boş liste): denemeler bitince 0/0 skor değil, hata metni
  await P.unroute('**/rest/v1/rpc/tahmin_sonucum*');
  let bosCagri = 0;
  await P.route('**/rest/v1/rpc/tahmin_sonucum*', async r => { bosCagri++; await r.fulfill({ response: await r.fetch(), body: '[]' }); });
  await P.goto(APP + `#/tahmin/${E}`); await P.reload(); await P.waitForTimeout(16000);
  bekle('boş sonuç tam beş kez deneniyor (paralel ikinci istek yok)', bosCagri === 5, String(bosCagri));
  bekle('boş sonuçta denemeler bitince hata metni görünüyor', (await P.locator('.hata').count()) > 0, (await metin()).slice(0, 200));
  await P.screenshot({ path: '/tmp/cgapp/ss/kapanis-sonuc-hazir-degil.png' });
  bekle('boş sonuçta metin "Sonuçlar birazdan açılıyor."', (await metin()).includes('sonuçlar birazdan açılıyor.'), (await metin()).slice(0, 200));
  bekle('boş sonuçta sayfa yükleniyorda kalmıyor', (await P.locator('.yukleniyor').count()) === 0, (await metin()).slice(0, 200));
  bekle('boş sonuçta "oynamadın" denmiyor, 0/0 skor yok', !(await metin()).includes('oynamadın') && (await P.locator('.tahmin-skor').count()) === 0, (await metin()).slice(0, 200));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
