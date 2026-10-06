// Bildirim gönder ekranı (0026, spec 2026-10-06_elle-bildirim_v1). Yalnız sayı, kalan hak, onay, önizleme.
import { webkit, devices } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const APP = 'http://localhost:5180/';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');
for (const [u, n] of [[A, 'a'], [B, 'b']]) await u.c.rpc('bildirim_abone_ol', { p_endpoint: `https://push.example/${n}`, p_p256dh: 'p', p_auth: 'a' });

// Yükleme süren bir etkinlik: fotoğrafa bağlı hatırlatma sayısız (kod incelemesi F1)
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date(Date.now() + 3 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }), yukleme_baslar: saat(-2), yukleme_biter: saat(40), oylama_biter: saat(80), kuran: A.id }).select('id').single()).data.id;
await admin.from('temalar').insert({ etkinlik: E, ad: 'Gece', sira: 1, bulusmada: false });

const b = await webkit.launch(); const hatalar = [];
const giris = async eposta => {
  const p = await (await b.newContext({ ...devices['iPhone 14'] })).newPage();
  p.on('pageerror', x => hatalar.push(String(x)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb, null, { timeout: 20000 });
  await p.evaluate(async e => { await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); }, eposta);
  return p;
};
const ac = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(2500); };
// CSS büyük harfe çeviriyor: karşılaştırma Türkçe küçük harfle
const metin = p => p.locator('.app').innerText().then(t => t.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR'));
try {
  const P = await giris('kurucu@test.local');
  await ac(P, 'profil');
  bekle('yönetimde Bildirim gönder satırı', (await P.getByRole('button', { name: /Bildirim gönder/ }).count()) === 1);
  await P.getByRole('button', { name: /Bildirim gönder/ }).click(); await P.waitForTimeout(2000);
  let m = await metin(P);
  bekle('ekran açılıyor, bugün 2 hak', m.includes('bildirim gönder') && m.includes('bugün 2 hakkın var'), m.slice(0, 200));
  const tema = P.locator('.satir-kartlari').first().locator('.satir', { hasText: 'Tema önerebilirsin' });
  bekle('tema önerisi satırında 2 kişiye gidecek', (await tema.innerText()).includes('2 kişiye gidecek'), await tema.innerText());
  bekle('oylama sürmezken oy hatırlatması görünmüyor', !m.includes('oy vermedin'));
  const yuk = P.locator('.satir-kartlari').first().locator('.satir', { hasText: 'Fotoğraf yüklemedin' });
  const yukMetin = (await yuk.innerText()).toLocaleLowerCase('tr-TR');
  bekle('F1: yükleme satırı sayısız, işi kalana gidecek', yukMetin.includes('işi kalana gidecek') && !/\d+ kişiye/.test(yukMetin), yukMetin);
  await yuk.getByRole('button', { name: 'Gönder' }).click(); await P.waitForTimeout(300);
  bekle('F1: onay sayı söylemiyor', (await metin(P)).includes('işi kalanlara gönderilsin mi?') && !(await P.locator('.onay').innerText()).match(/\d+ KİŞİYE/));
  await P.locator('.onay').getByRole('button', { name: 'Vazgeç' }).click(); await P.waitForTimeout(200);
  bekle('üye kimliği ya da adı yok', !m.includes('barış'));
  // Onay ve gönderme
  await tema.getByRole('button', { name: 'Gönder' }).click(); await P.waitForTimeout(300);
  bekle('onay metni', (await metin(P)).includes('2 kişiye gönderilsin mi?'));
  await P.locator('.onay').getByRole('button', { name: 'Gönder' }).click(); await P.waitForTimeout(2000);
  const k = (await admin.from('bildirim_kuyrugu').select('id').eq('tur', 'elle_tema_oner')).data ?? [];
  m = await metin(P);
  bekle('kuyrukta 2 bildirim', k.length === 2, String(k.length));
  bekle('kalan hak 1', m.includes('bugün 1 hakkın kaldı'), m.slice(0, 200));
  bekle('F7: sonuç düğmenin altında', (await P.locator('.satir-kartlari').first().locator('.gonderildi').innerText().catch(() => '')).includes('2 kişiye gönderildi'), await metin(P));
  bekle('son gönderilenlerde satır', /son gönderilenler.*tema önerebilirsin.*2 kişi/.test(m), m.slice(-200));
  bekle('aynı hatırlatma artık kimseye gitmiyor: sönük, sebep yazıyor', (await tema.innerText()).includes('Bugün herkese gitti'), await tema.innerText());
  // Kendin yaz
  const baslik = P.getByLabel('Başlık');
  await baslik.fill('x'.repeat(45));
  bekle('başlık 40 karakterde duruyor, sayaç 40 / 40', (await baslik.inputValue()).length === 40 && (await metin(P)).includes('40 / 40'));
  await baslik.fill('Cumartesi buluşuyoruz');
  await P.getByLabel('Metin').fill('Saat 10.00, Karaköy iskelesi.');
  const onizleme = await P.locator('.bildirim-onizleme').innerText();
  bekle('canlı önizleme başlık ve metni gösteriyor', onizleme.includes('Cumartesi buluşuyoruz') && onizleme.includes('Karaköy iskelesi'), onizleme);
  await P.getByRole('button', { name: 'Herkese gönder' }).click(); await P.waitForTimeout(300);
  await P.locator('.onay').getByRole('button', { name: 'Gönder' }).click(); await P.waitForTimeout(2000);
  const s = (await admin.from('bildirim_kuyrugu').select('baslik, adres').eq('tur', 'elle_serbest')).data ?? [];
  bekle('serbest metin herkese, Etkinlikler\'i açıyor', s.length === 2 && s.every(x => x.baslik === 'Cumartesi buluşuyoruz' && x.adres === 'etkinlikler'), JSON.stringify(s));
  m = await metin(P);
  bekle('hak bitti metni', m.includes('bugünkü hakların doldu'), m.slice(0, 200));
  bekle('hak bitince gönder düğmeleri kapalı', await P.getByRole('button', { name: 'Herkese gönder' }).isDisabled());
  // Üye
  const U = await giris('baris@test.local');
  await ac(U, 'profil');
  bekle('üye satırı görmüyor', (await U.getByRole('button', { name: /Bildirim gönder/ }).count()) === 0);
  await ac(U, 'bildirim');
  bekle('üye ekrana giremiyor', !(await metin(U)).includes('kendin yaz'));
  bekle('sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
} finally { await b.close(); }
rapor();
