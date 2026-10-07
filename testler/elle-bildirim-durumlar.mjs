// Bildirim gönder ekranının durumları (0026): yükleme hatası, gönderim hatası, gece, sayısız sonuç,
// satır altı metinleri, kapalı düğmeler, Açılacak yer, gönderince boşalan alanlar, Son gönderilenler.
// Satır durumları sunucunun cevabı değiştirilerek kuruluyor (davranis-paylas.mjs'deki gibi).
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');
for (const [u, n] of [[A, 'a'], [B, 'b']]) await u.c.rpc('bildirim_abone_ol', { p_endpoint: `https://push.example/${n}`, p_p256dh: 'p', p_auth: 'a' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date(Date.now() + 3 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }), yukleme_baslar: saat(-2), yukleme_biter: saat(40), oylama_biter: saat(80), kuran: A.id }).select('id').single()).data.id;
await admin.from('temalar').insert({ etkinlik: E, ad: 'Gece', sira: 1, bulusmada: false });
const hakSifirla = () => admin.from('elle_bildirimler').delete().neq('id', -1);

const b = await webkit.launch(); const hatalar = [];
const giris = async eposta => {
  const p = await (await b.newContext({ ...devices['iPhone 14'] })).newPage();
  p.on('pageerror', x => hatalar.push(String(x)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); }, eposta);
  return p;
};
const ac = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2500); };
const kucuk = t => t.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
const metin = p => p.locator('.app').innerText().then(kucuk);
// Hatırlatma satırı ve onun altındaki onay/sonuç kutusu aynı sarmalayıcıda
const blok = (p, ad) => p.locator('.satir-kartlari').first().locator(':scope > div', { has: p.locator('.satir', { hasText: ad }) });
const gonderDugmesi = (p, ad) => blok(p, ad).locator('.satir').getByRole('button', { name: 'Gönder' });
const sahte = (p, degistir) => p.route('**/rest/v1/rpc/elle_bildirim_durumu*', async r => {
  const cevap = await r.fetch();
  r.fulfill({ response: cevap, json: degistir(await cevap.json()) });
});
const tur = (d, t) => {
  let h = d.hatirlatmalar.find(x => x.tur === t);
  if (!h) { h = { tur: t, gorunur: true, alici: 1, bugun: false, etiket: null }; d.hatirlatmalar.push(h); }
  return h;
};
// İstanbul saatiyle dünün belli bir saati (UTC+3); geçmiş bir an oturumun süresini bozmuyor
const istanbul = (s, d) => {
  const gun = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  return new Date(`${gun}T${String(s).padStart(2, '0')}:${String(d).padStart(2, '0')}:00+03:00`);
};
try {
  const P = await giris('kurucu@test.local');

  // 1. yukle: durum okunamazsa hata görünüyor, form açılmıyor
  await P.route('**/rest/v1/rpc/elle_bildirim_durumu*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }));
  await ac(P, 'bildirim');
  const alarm = await P.locator('[role=alert]').innerText().catch(() => '');
  bekle('durum okunamayınca hata kutusu', alarm.includes('Bir şey ters gitti. Tekrar dene.'), alarm);
  bekle('durum okunamayınca form ve hatırlatmalar yok', !(await metin(P)).includes('kendin yaz') && (await P.getByRole('button', { name: 'Herkese gönder' }).count()) === 0);
  await P.unroute('**/rest/v1/rpc/elle_bildirim_durumu*');

  // 2. serbestHazir: başlık ve metin dolmadan Herkese gönder kapalı
  await ac(P, 'bildirim');
  const herkese = P.getByRole('button', { name: 'Herkese gönder' });
  await P.getByLabel('Başlık').fill(''); await P.getByLabel('Metin').fill('Saat 10.00');
  bekle('başlık boşken Herkese gönder kapalı', await herkese.isDisabled());
  await P.getByLabel('Başlık').fill('Cumartesi'); await P.getByLabel('Metin').fill('   ');
  bekle('metin yalnız boşlukken Herkese gönder kapalı', await herkese.isDisabled());
  await P.getByLabel('Metin').fill('Saat 10.00, Karaköy.');
  bekle('ikisi de doluyken Herkese gönder açık', await herkese.isEnabled());

  // 3. setYer + alanların boşalması + Son gönderilenler'de kendi başlığı
  await P.getByLabel('Açılacak yer').selectOption('profil');
  await herkese.click(); await P.waitForTimeout(300);
  await P.locator('.onay').getByRole('button', { name: 'Gönder' }).click(); await P.waitForTimeout(2000);
  const s = (await admin.from('bildirim_kuyrugu').select('adres').eq('tur', 'elle_serbest')).data ?? [];
  bekle('Açılacak yer Profil seçilince kuyrukta adres profil', s.length === 2 && s.every(x => x.adres === 'profil'), JSON.stringify(s));
  bekle('gönderince başlık boşalıyor', (await P.getByLabel('Başlık').inputValue()) === '');
  bekle('gönderince metin boşalıyor', (await P.getByLabel('Metin').inputValue()) === '');
  const oniz = kucuk(await P.locator('.bildirim-onizleme').innerText());
  bekle('önizleme Başlık / Metin yer tutucusuna dönüyor', oniz.includes('başlık') && oniz.includes('metin') && !oniz.includes('cumartesi'), oniz);
  bekle('Son gönderilenlerde serbest bildirimin kendi başlığı', /son gönderilenler.*cumartesi/.test(await metin(P)), (await metin(P)).slice(-200));
  await hakSifirla();

  // 4. gonder hatası: sonuç satırın altında, alert olarak
  await ac(P, 'bildirim');
  await P.route('**/rest/v1/rpc/elle_bildirim_gonder*', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'elle_sinir', details: null, hint: null }) }), { times: 1 });
  await gonderDugmesi(P, 'Tema önerebilirsin').click(); await P.waitForTimeout(300);
  await P.locator('.onay').getByRole('button', { name: 'Gönder' }).click(); await P.waitForTimeout(1500);
  const hataAlt = await blok(P, 'Tema önerebilirsin').locator('[role=alert]').innerText().catch(() => '');
  bekle('gönderim hatası satırın altında', hataAlt.includes('Bugünkü iki bildirim hakkı doldu'), hataAlt);

  // 5. fotoğrafa bağlı hatırlatmanın sonucu sayısız
  await gonderDugmesi(P, 'Fotoğraf yüklemedin').click(); await P.waitForTimeout(300);
  await P.locator('.onay').getByRole('button', { name: 'Gönder' }).click(); await P.waitForTimeout(2000);
  const yukSonuc = await blok(P, 'Fotoğraf yüklemedin').locator('[role=status]').innerText().catch(() => '');
  bekle('yükleme hatırlatmasının sonucu: İşi kalanlara gönderildi.', yukSonuc.includes('İşi kalanlara gönderildi.') && !/\d+ kişiye/.test(yukSonuc), yukSonuc);
  await hakSifirla();

  // 6. geceMi: onay açıldığı andaki İstanbul saati
  const G = await giris('kurucu@test.local');
  await ac(G, 'bildirim');
  await G.clock.setFixedTime(istanbul(12, 0));
  await gonderDugmesi(G, 'Tema önerebilirsin').click(); await G.waitForTimeout(300);
  bekle('gündüz onayında sabah notu yok', !(await G.locator('.onay').innerText()).includes("Sabah 08.00'de gidecek."));
  await G.locator('.onay').getByRole('button', { name: 'Vazgeç' }).click(); await G.waitForTimeout(200);
  await G.clock.setFixedTime(istanbul(23, 30));
  await gonderDugmesi(G, 'Tema önerebilirsin').click(); await G.waitForTimeout(300);
  const geceOnay = await G.locator('.onay').innerText();
  bekle('23.30 onayında sabah notu', geceOnay.includes("Sabah 08.00'de gidecek."), geceOnay);
  await G.locator('.onay').getByRole('button', { name: 'Gönder' }).click(); await G.waitForTimeout(2000);
  const geceSonuc = await blok(G, 'Tema önerebilirsin').locator('[role=status]').innerText().catch(() => '');
  bekle('gece gönderiminin sonucu sabahı söylüyor', geceSonuc.includes("Sabah 08.00'de gidecek."), geceSonuc);
  await hakSifirla();

  // 7. Bildirimi açık üye yoksa: her satırda sebep, bütün Gönder düğmeleri kapalı
  const alici2 = d => { Object.assign(tur(d, 'tema_oner'), { gorunur: true, alici: 2, bugun: false }); return d; };
  await sahte(P, alici2);
  await ac(P, 'bildirim');
  bekle('aboneli ve alıcılı durumda tema satırı Gönder açık', await gonderDugmesi(P, 'Tema önerebilirsin').isEnabled());
  await P.unroute('**/rest/v1/rpc/elle_bildirim_durumu*');
  await sahte(P, d => ({ ...alici2(d), abone: 0 }));
  await ac(P, 'bildirim');
  const satirlar = P.locator('.satir-kartlari').first().locator('.satir');
  const n = await satirlar.count(); let hepsi = n > 0, kapali = n > 0;
  for (let i = 0; i < n; i++) {
    hepsi &&= (await satirlar.nth(i).innerText()).includes('Bildirimi açık üye yok');
    kapali &&= await satirlar.nth(i).getByRole('button', { name: 'Gönder' }).isDisabled();
  }
  bekle('abone yokken her satır: Bildirimi açık üye yok', hepsi, String(n));
  bekle('abone yokken her satırın Gönder düğmesi kapalı', kapali, String(n));
  await P.unroute('**/rest/v1/rpc/elle_bildirim_durumu*');

  // 8. gece, alıcı 0: Şu an kimseye gitmiyor; Gönder kapalı; Wrapped kime (Ekstra); Son gönderilenler
  const z = new Date().toISOString();
  await sahte(P, d => {
    d.gece = true;
    Object.assign(tur(d, 'tema_oner'), { gorunur: true, alici: 0, bugun: false });
    Object.assign(tur(d, 'wrapped'), { gorunur: true, alici: 1, bugun: false, etiket: 'Ekstra etkinlik' });
    d.son = [{ tur: 'serbest', baslik: 'Kendi başlığım', alici: 3, zaman: z }, { tur: 'yukleme', baslik: 'x', alici: null, zaman: z }];
    return d;
  });
  await ac(P, 'bildirim');
  const tema = await blok(P, 'Tema önerebilirsin').locator('.satir').innerText();
  bekle('gece, alıcı 0: Şu an kimseye gitmiyor', tema.includes('Şu an kimseye gitmiyor'), tema);
  // Hak metni: 23.00'ten sonra yarının, gece yarısından sonra bu sabahın hakkı (kod inceleme paneli N1)
  await P.clock.setFixedTime(istanbul(23, 30)); await P.waitForTimeout(300);
  await ac(P, 'bildirim');
  let lede = await P.locator('.lede').innerText();
  bekle('F4: 23.30 hak metni yarın sabahın hakkını söylüyor', lede.includes('Yarın sabah için'), lede);
  await P.clock.setFixedTime(istanbul(2, 0)); await P.waitForTimeout(300);
  await ac(P, 'bildirim');
  lede = await P.locator('.lede').innerText();
  bekle('N1: 02.00 hak metni bu sabahın hakkını söylüyor', lede.includes('Bu sabah için'), lede);
  bekle('alıcı 0 iken satırın Gönder düğmesi kapalı', await gonderDugmesi(P, 'Tema önerebilirsin').isDisabled());
  const wr = await blok(P, "Wrapped'ini izlemedin").locator('.satir').innerText();
  bekle("Ekstra etkinlik Wrapped'inin kime metni", wr.includes("Ekstra etkinliğin Wrapped'ini açmamış olanlara"), wr);
  const son = P.locator('.satir-kartlari').last().locator('.satir');
  const son0 = kucuk(await son.nth(0).innerText()), son1 = kucuk(await son.nth(1).innerText());
  bekle('Son gönderilenlerde serbest kayıt kendi başlığıyla, kişi sayısıyla', son0.includes('kendi başlığım') && son0.includes('· 3 kişi'), son0);
  bekle('sayısız kayıtta "· N kişi" yok', son1.includes('fotoğraf yüklemedin') && !son1.includes('kişi'), son1);
  await P.unroute('**/rest/v1/rpc/elle_bildirim_durumu*');

  // 9. gündüz, alıcı 0, bugün gönderilmemiş: türün kendi "kimse yok" metni; Wrapped buluşma adıyla
  await sahte(P, d => {
    d.gece = false;
    Object.assign(tur(d, 'tema_oner'), { gorunur: true, alici: 0, bugun: false });
    Object.assign(tur(d, 'wrapped'), { gorunur: true, alici: 1, bugun: false, etiket: 'Moda' });
    return d;
  });
  await ac(P, 'bildirim');
  const tema2 = await blok(P, 'Tema önerebilirsin').locator('.satir').innerText();
  bekle('gündüz, alıcı 0: Herkesin açık önerisi var', tema2.includes('Herkesin açık önerisi var') && !tema2.includes('Şu an kimseye'), tema2);
  const wr2 = await blok(P, "Wrapped'ini izlemedin").locator('.satir').innerText();
  bekle("buluşmalı Wrapped'in kime metni", wr2.includes("Moda buluşmasının Wrapped'ini açmamış olanlara"), wr2);
  await P.unroute('**/rest/v1/rpc/elle_bildirim_durumu*');

  // Yeniden yüklemede yarıda kalan istekler WebKit'te "access control checks" diye düşüyor; başka sayfa hatası olmamalı
  const diger = hatalar.filter(x => !x.includes('due to access control checks'));
  // R1: gündüz hak bitince cümle çift noktayla bitmiyor
  await P.unroute('**/rest/v1/rpc/elle_bildirim_durumu*').catch(() => {});
  await P.clock.setFixedTime(istanbul(12, 0));
  await sahte(P, d => { d.gece = false; d.kalan = 0; return d; });
  await ac(P, 'bildirim');
  const lede0 = await P.locator('.lede').innerText();
  bekle('R1: hak bitti metninde çift nokta yok', lede0.includes('Bugünkü hakların doldu') && !lede0.includes('..'), lede0);
  await P.unroute('**/rest/v1/rpc/elle_bildirim_durumu*');
  bekle('sayfa hatası yok', diger.length === 0, diger.join(' | '));
} finally { await b.close(); }
rapor();
