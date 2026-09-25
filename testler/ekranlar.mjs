// Ekranların veri hâlleri: kapsam analizinin (2026-09-18) test edilmemiş dediği dallar.
// siralama.mjs'in kurduğu veriyi kullanır, önce o çalıştırılmalı. Değiştirdiği her şeyi
// sonunda geri koyar; kabuk.mjs aynı veriye güveniyor.
import { chromium } from '/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs';
import { admin, bekle, rapor } from './ortak.mjs';
import { sayiEki } from '../src/lib/zaman.ts';

const APP = 'http://localhost:5180/';
const { data: liste } = await admin.auth.admin.listUsers({ perPage: 1000 });
const kim = e => liste.users.find(u => u.email === e);
const [ayse, baris, can, deniz, zeynep] = ['kurucu', 'baris', 'can', 'deniz', 'zeynep'].map(k => kim(`${k}@test.local`));
bekle('siralama.mjs verisi duruyor', !!(ayse && baris && can && zeynep), 'önce node testler/siralama.mjs');
// Hoş geldin ekranı ilk girişte bir kez çıkıyor; bu dosya o ekranı değil sonrasını sınıyor
await admin.from('uyeler').update({ hosgeldin_goruldu: true }).neq('id', '00000000-0000-0000-0000-000000000000');

const b = await chromium.launch();
const hatalar = [];
async function oturum(eposta) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => hatalar.push(`${eposta}: ${e}`));
  await p.goto(APP); await p.waitForFunction(() => window.__sb);
  await p.evaluate(async e => { const r = await window.__sb.auth.signInWithPassword({ email: e, password: 'test-sifre-1' }); if (r.error) throw r.error }, eposta);
  return p;
}
const ac = async (p, yol) => { await p.goto(APP + '#/' + yol); await p.reload(); await p.waitForTimeout(1800) };
const yazi = p => p.evaluate(() => document.querySelector('.sc')?.textContent ?? '');
const A = await oturum('kurucu@test.local');

// ---------------------------------------------------------------- Profil: kendi, dolu
{
  await ac(A, 'profil');
  const t = await yazi(A);
  const habit = await A.evaluate(() => [...document.querySelectorAll('.habit')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  bekle('çekim tarifi: en çok kullanılan odak ve oranı', habit.some(h => h.includes('En çok') && h.includes('35mm') && h.includes('3 / 4 kare')), JSON.stringify(habit));
  bekle('çekim tarifi: diyafram satırı', habit.some(h => h.includes('Diyafram') && h.includes('Genelde açık')), JSON.stringify(habit));
  bekle('çekim tarifi: ışık satırı', habit.some(h => h.includes('Işık') && h.includes('Bol ışıkta')), JSON.stringify(habit));
  bekle('katkı: tam set rozeti', t.includes('Tam set'));
  bekle('katkı: tema sayısı rozeti', t.includes('4 tema'), t.slice(0, 200));
  bekle('kendi profilinde rozet ikinci tekil: verdin', t.includes('temalara kare verdin.') && t.includes('temada kare verdin.'));
  const yil = Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 4));
  bekle(`katılım satırı doğru ekle: ${yil}'${sayiEki(yil % 100)}n beri`, t.includes(`${yil}'${sayiEki(yil % 100)}n beri`), t.slice(0, 120));
}

// ---------------------------------------------------------------- Profil: başkası ve boş hâller
{
  await ac(A, 'profil/' + baris.id);
  const t = await yazi(A);
  bekle('makine bilgisi olmayan üç kare: doğru boş durum', t.includes('Karelerinde makine bilgisi yok.') && !t.includes('Üç kareden sonra'), t);
  bekle('başkasının gizli puan notu', t.includes('Sıralamaya girmeyen karelerin puanı gizli.'));
  bekle('bir temayı atlayanda tam set yok', !t.includes('Tam set'));
  bekle('başkasının profilinde rozet üçüncü tekil: verdi', t.includes('temada kare verdi.') && !t.includes('verdin'));

  await ac(A, 'profil/' + zeynep.id);
  const z = await yazi(A);
  bekle('karesi olmayan: henüz kare yok', z.includes('Henüz kare yok'));
  bekle('karesi olmayan: üç kareden sonra', z.includes('Üç kareden sonra.'));
  bekle('karesi olmayan: sayaçlar sönük', (await A.locator('.stats.zero').count()) === 1);

  await ac(A, 'profil/00000000-0000-0000-0000-000000000000');
  bekle('olmayan kişi: kulüpte yok', (await yazi(A)).includes('kulüpte yok'), await yazi(A));
}

// ---------------------------------------------------------------- Sıralama: Müdavim ve boş durum
{
  await ac(A, 'siralama');
  bekle('Müdavim çok kişilik: sayı yazıyor', (await A.locator('.mud .big').textContent())?.includes('2 kişi'));
  bekle('sırasız blokta üç isim', (await A.locator('.unr .names button').count()) === 3);

  // Tek Müdavim: Barış'ın ilk etkinlikteki karesi geçici olarak kaldırılıyor
  const { data: bk } = await admin.from('kareler').select('*, temalar!inner(etkinlik, etkinlikler!inner(bulusma_gunu))').eq('sahip', baris.id);
  const eski = bk.sort((x, y) => x.temalar.etkinlikler.bulusma_gunu.localeCompare(y.temalar.etkinlikler.bulusma_gunu))[0];
  const { data: eskiOy } = await admin.from('oylar').select('*').eq('kare', eski.id);
  await admin.from('kareler').delete().eq('id', eski.id);
  await ac(A, 'siralama');
  bekle('Müdavim tek kişilik: adı büyük yazıyor', (await A.locator('.mud .one').count()) === 1 && (await A.locator('.mud .big').count()) === 0);
  const { temalar: _t, ...satir } = eski;
  await admin.from('kareler').insert(satir);
  if (eskiOy?.length) await admin.from('oylar').insert(eskiOy);

  // Sezonda hiç oy yok: sıralı satır yerine boş durum
  const oylar = (await admin.from('oylar').select('*')).data ?? [];
  await admin.from('oylar').delete().neq('puan', -1);
  await ac(A, 'siralama');
  bekle('oysuz sezonda boş durum', (await yazi(A)).includes('Sezonda hiç puan verilmemiş') && (await A.locator('.row').count()) === 0, await yazi(A));
  await admin.from('oylar').insert(oylar);
  await ac(A, 'siralama');
  bekle('veri geri kondu: sıralı satırlar döndü', (await A.locator('.row').count()) > 0);

  // Karar 110: tek karesi olan sıralı kişide sayı o karenin puanı; "en yüksek" yazmıyor
  await A.route('**/rest/v1/rpc/siralama*', async r => {
    const c = await r.fetch();
    r.fulfill({ response: c, json: (await c.json()).map((x, i) => (i === 0 ? { ...x, kare_sayisi: 1 } : x)) });
  });
  await ac(A, 'siralama');
  const ilk = A.locator('.row').first();
  bekle('tek kareli sıralı satır: sayının altında "tek kare"', (await ilk.locator('.av small').textContent())?.trim() === 'tek kare');
  bekle('tek kareli sıralı satır: "en iyi karesi" yazmıyor', (await ilk.locator('.kr small').count()) === 0);
  bekle('çok kareli satır: iki altyazı da duruyor', (await A.locator('.row').nth(1).locator('.kr small').textContent())?.trim() === 'en iyi karesi'
    && /^\d+ kare ort\.$/.test((await A.locator('.row').nth(1).locator('.av small').textContent())?.trim() ?? ''));
  await A.unroute('**/rest/v1/rpc/siralama*');
}

// ---------------------------------------------------------------- Üyeler: rozet, sayaç, yetki
{
  await ac(A, 'uyeler');
  const r = await A.evaluate(() => [...document.querySelectorAll('.satir')].map(e => ({
    ad: e.querySelector('.tx b')?.textContent, rozet: e.querySelector('.rozet')?.textContent ?? null })));
  bekle('düz üyelerde rozet yok', r.filter(x => x.ad !== 'Ayşe Kaya').every(x => x.rozet === null), JSON.stringify(r));
  bekle('kurucuda rozet var', r.find(x => x.ad === 'Ayşe Kaya')?.rozet === 'Kurucu');

  // Çıkarılan üye sayılmıyor: hem Üyeler sayacı hem Etkinlikler başlığı
  await A.evaluate(async id => window.__sb.rpc('uye_cikar', { p_uye: id, p_cikar: true }), zeynep.id);
  await ac(A, 'uyeler');
  const sayac = await A.evaluate(() => [...document.querySelectorAll('h2.sec')].find(h => h.textContent.startsWith('Üyeler'))?.querySelector('span')?.textContent);
  bekle('üyeler sayacı çıkarılanı saymıyor', sayac === '5 üye', sayac);
  await ac(A, 'etkinlikler');
  bekle('etkinlikler başlığı çıkarılanı saymıyor', (await A.locator('.mast .r').textContent())?.trim() === '5 üye', await A.locator('.mast .r').textContent());

  // Çıkarılan kişi istek bırakınca yönetici bunu kartta görüyor
  const Z = await oturum('zeynep@test.local');
  const ist = await Z.evaluate(async () => {
    const u = (await window.__sb.auth.getUser()).data.user;
    return (await window.__sb.from('istekler').insert({ kullanici: u.id, eposta: u.email, ad: 'Zeynep Ar', notu: 'Dönmek istiyorum' }).select('id').single()).data?.id;
  });
  await ac(A, 'uyeler');
  bekle('istek kartında çıkarılmış olduğu yazıyor', (await yazi(A)).includes('Bu kişi kulüpten çıkarılmıştı'));
  await admin.from('istekler').delete().eq('id', ist);
  await A.evaluate(async id => window.__sb.rpc('uye_cikar', { p_uye: id, p_cikar: false }), zeynep.id);

  // Yönetici yöneticiyi çıkaramaz; kurucu değilse rol de veremez
  await A.evaluate(async ids => { for (const id of ids) await window.__sb.rpc('rol_degistir', { p_uye: id, p_yonetici: true }) }, [baris.id, can.id]);
  const B = await oturum('baris@test.local');
  await ac(B, 'uyeler');
  bekle('yönetici gözünde yöneticinin satırı açılmıyor', (await B.locator('button.satir.acilir', { hasText: 'can@test.local' }).count()) === 0);
  await B.locator('button.satir.acilir', { hasText: 'deniz@test.local' }).click(); await B.waitForTimeout(300);
  bekle('yönetici üyeyi çıkarabiliyor', (await B.getByRole('button', { name: 'Kulüpten çıkar', exact: true }).count()) === 1);
  bekle('yönetici rol veremiyor', (await B.getByRole('button', { name: 'Yönetici yap', exact: true }).count()) === 0);
  bekle('yönetici gözünde kurucunun satırı açılmıyor', (await B.locator('button.satir.acilir', { hasText: 'kurucu@test.local' }).count()) === 0);
  await ac(A, 'uyeler');
  await A.locator('button.satir.acilir', { hasText: 'baris@test.local' }).click(); await A.waitForTimeout(300);
  bekle('kurucu yöneticiyi çıkarabiliyor', (await A.getByRole('button', { name: 'Kulüpten çıkar', exact: true }).count()) === 1);
  bekle('kurucu yöneticinin yetkisini alabiliyor', (await A.getByRole('button', { name: 'Yöneticilikten çıkar', exact: true }).count()) === 1);
  await A.evaluate(async ids => { for (const id of ids) await window.__sb.rpc('rol_degistir', { p_uye: id, p_yonetici: false }) }, [baris.id, can.id]);
}

// ---------------------------------------------------------------- Aynı adrese dokunup sonra geri
// Aynı sekmeye dokunmak olay üretmiyor. git() orada işaret bırakırsa sonraki gerçek geri
// hareketi uygulamanın kendi geçişi sanılır ve yer geri gelmez. Aradaki başka bir geçiş
// işareti sıfırladığı için hemen ardından geri gidilmeli, yoksa test kusuru görmez.
{
  await A.setViewportSize({ width: 390, height: 460 });
  await ac(A, 'siralama');
  const y1 = await A.evaluate(() => { const sc = document.querySelector('.sc'); sc.scrollTop = sc.scrollHeight; return Math.round(sc.scrollTop) });
  await A.locator('.tabs button', { hasText: 'Profil' }).click(); await A.waitForTimeout(1400);
  await A.locator('.tabs button', { hasText: 'Profil' }).click(); await A.waitForTimeout(400);   // aynı adres
  await A.goBack(); await A.waitForTimeout(1500);
  const y2 = await A.evaluate(() => Math.round(document.querySelector('.sc')?.scrollTop ?? -1));
  bekle('aynı sekmeye dokunmak sonraki geri dönüşü bozmuyor', y1 > 40 && Math.abs(y2 - y1) <= 2, `${y2} / ${y1}`);
  await A.setViewportSize({ width: 390, height: 844 });
}

// ---------------------------------------------------------------- Yakında başlayacak etkinlik kartı
// Kart "Yükleme 19 Eylül 18.30'da açılıyor" diyor; ek dakikanın okunuşuna göre (zaman.mjs)
{
  const yarin = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const baslar = new Date(`${yarin}T18:30:00+03:00`);
  const { data: ev } = await admin.from('etkinlikler').insert({
    bulusma_gunu: yarin, yukleme_baslar: baslar.toISOString(),
    yukleme_biter: new Date(baslar.getTime() + 48 * 3600000).toISOString(),
    oylama_biter: new Date(baslar.getTime() + 120 * 3600000).toISOString(), kuran: ayse.id,
  }).select('id').single();
  await admin.from('temalar').insert({ etkinlik: ev.id, ad: 'Doku', sira: 1, bulusmada: true });
  await ac(A, 'etkinlikler');
  const meta = (await A.locator('.live .meta').textContent().catch(() => '')) ?? '';
  bekle('yakında başlayacak kart: saat doğru ekle', meta.replace(/\s+/g, ' ').includes("18.30'da açılıyor"), meta);
  await admin.from('etkinlikler').delete().eq('id', ev.id);
}

bekle('konsol hatası yok', hatalar.length === 0, hatalar.join(' | '));
await b.close();
rapor();
