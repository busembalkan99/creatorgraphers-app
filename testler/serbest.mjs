// Serbest etkinlik ve serbest temanın sezon ağırlığı (karar 116): sunucu kuralları.
// Temiz veritabanı ister: sezon sayıları bütün etkinliklere bakıyor.
import fs from 'node:fs';
import { admin, istemci, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
await sifirla();
const hata = r => r.error?.message ?? '';

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
const anon = istemci();
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const K = {};
for (const [a, ad, posta] of [['b', 'Barış Ak', 'baris@test.local'], ['c', 'Can Öz', 'can@test.local'],
  ['d', 'Deniz Yılmaz', 'deniz@test.local'], ['z', 'Zeynep Ar', 'zeynep@test.local']]) {
  const k = await kullanici(posta, ad);
  await admin.from('uyeler').insert({ id: k.id, ad, eposta: posta });
  K[a] = { ...k, ad };
}

const gun = n => new Date(Date.now() - n * 86400000).toISOString();
const tarih = n => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
async function etkinlik(gunSayisi, temalar, serbest = false) {
  const e = (await admin.from('etkinlikler').insert({
    bulusma_gunu: tarih(gunSayisi), yukleme_baslar: gun(gunSayisi), yukleme_biter: gun(gunSayisi - 1),
    oylama_biter: gun(gunSayisi - 2), kuran: A.id, serbest,
  }).select('id').single()).data;
  const t = [];
  for (const [i, [ad, bulusmada]] of temalar.entries())
    t.push((await admin.from('temalar').insert({ etkinlik: e.id, ad, sira: i + 1, bulusmada }).select('id').single()).data);
  return { id: e.id, temalar: t };
}
async function kare(etk, i, sahip, puan) {
  const tema = etk.temalar[i].id;
  const yol = `${etk.id}/${tema}/${crypto.randomUUID()}.jpg`;
  await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const k = (await admin.from('kareler').insert({ tema, sahip: sahip.id, dosya: yol, genislik: 1200, yukseklik: 800 }).select('id').single()).data;
  await admin.from('oylar').insert({ kare: k.id, veren: K.z.id, puan });
  return k;
}

// E1: buluşma etkinliği, bir buluşma bir serbest tema. S1: serbest etkinlik (ekstra).
const E1 = await etkinlik(10, [['Sokak', true], ['Portre', false]]);
await kare(E1, 0, K.b, 8); await kare(E1, 1, K.b, 6);
await kare(E1, 0, K.c, 7);
const S1 = await etkinlik(5, [['Doku', false]], true);
await kare(S1, 0, K.b, 9); await kare(S1, 0, K.d, 10);

const sira = async (U, fn = 'siralama') => (await U.c.rpc(fn)).data ?? [];
const satir = (l, ad) => l.find(x => x.ad === ad);

// ---------------------------------------------- sezonun altı yeri yalnız buluşmalar
const oz = ((await A.c.rpc('sezon_ozeti')).data ?? [])[0];
bekle('serbest etkinlik sezonun altı yerinden birini kaplamıyor', Number(oz?.tamamlanan) === 1 && Number(oz?.toplam) === 6, JSON.stringify(oz));
const mud = (await A.c.rpc('mudavim')).data ?? [];
bekle('Müdavim penceresi yalnız buluşmalar', mud.length > 0 && mud.every(m => Number(m.pencere) === 1), JSON.stringify(mud));
bekle('Müdavim serbest etkinliği saymıyor (Deniz yok)', !mud.some(m => m.ad === 'Deniz Yılmaz'), JSON.stringify(mud.map(m => m.ad)));
const pD = ((await K.d.c.rpc('profil')).data ?? [])[0];
bekle('seri serbest etkinliği saymıyor', Number(pD?.seri) === 0, JSON.stringify(pD));
const pB = ((await K.b.c.rpc('profil')).data ?? [])[0];
bekle('seri buluşmaları sayıyor', Number(pB?.seri) === 1, JSON.stringify(pB));

// ---------------------------------------------- ağırlıklı sezon ortalaması
// Barış: 8 (buluşma) + 6 (serbest tema) + 9 (serbest etkinlik) → (8 + 3 + 4,5) / 2 = 7,75 → 7,8
const lB = await sira(K.b);
bekle('serbest yarım ağırlık: kendi ortalaman 7,8 (düz ortalama 7,7 olurdu)', Number(satir(lB, 'Barış Ak')?.ortalama) === 7.8, JSON.stringify(satir(lB, 'Barış Ak')));
const lC = await sira(K.c);
bekle('yalnız buluşma karesi olanın ortalaması değişmiyor', Number(satir(lC, 'Can Öz')?.ortalama) === 7, JSON.stringify(satir(lC, 'Can Öz')));
// Deniz yalnız serbest etkinlikte: eşik buluşmadan sayılıyor, sıralamaya giremiyor
const lD = await sira(K.d);
const d = satir(lD, 'Deniz Yılmaz');
bekle('yalnız serbest etkinliğe katılan eşiği geçmiyor', d && d.esikte === false && d.sirali === false && d.sira == null, JSON.stringify(d));
bekle('eşik için etkinlik sayısı yalnız buluşmalar', Number(satir(lB, 'Barış Ak')?.etkinlik_sayisi) === 1, JSON.stringify(satir(lB, 'Barış Ak')));
// Üç kişi → round(3 / 2,5) = 1 kişi sıralı: Barış (7,8) Can'ın (7,0) önünde
const lA = await sira(A);
bekle('sıralı olan en yüksek ağırlıklı ortalama', lA.filter(x => x.sirali).map(x => x.ad).join() === 'Barış Ak', JSON.stringify(lA.map(x => [x.ad, x.sira, x.ortalama])));
bekle('sıralama dışında kalanın puanı başkasına gizli (karar 52)', satir(lA, 'Can Öz')?.ortalama == null, JSON.stringify(satir(lA, 'Can Öz')));

// ---------------------------------------------- Serbest tablosu
// Barış: 6 ve 9 → 7,5; Deniz: 10. İki kişi → round(2 / 2,5) = 1 sıralı
const sA = await sira(A, 'serbest_siralama');
bekle('Serbest tablosu yalnız serbest kareler (Can yok)', sA.length === 2 && !satir(sA, 'Can Öz'), JSON.stringify(sA.map(x => x.ad)));
bekle('Serbest tablosu: Deniz birinci, puanı görünür', satir(sA, 'Deniz Yılmaz')?.sira === 1 && Number(satir(sA, 'Deniz Yılmaz')?.ortalama) === 10, JSON.stringify(satir(sA, 'Deniz Yılmaz')));
bekle('Serbest tablosu: sıralama dışının puanı başkasına gizli', satir(sA, 'Barış Ak')?.ortalama == null && satir(sA, 'Barış Ak')?.sirali === false, JSON.stringify(satir(sA, 'Barış Ak')));
const sB = await sira(K.b, 'serbest_siralama');
bekle('Serbest tablosu: kendi puanın sana açık (7,5)', Number(satir(sB, 'Barış Ak')?.ortalama) === 7.5, JSON.stringify(satir(sB, 'Barış Ak')));
bekle('Serbest tablosu: kare sayısı', Number(satir(sB, 'Barış Ak')?.kare_sayisi) === 2);

// ---------------------------------------------- yetkiler
bekle('giriş yapmamış Serbest tablosunu çağıramıyor', !!(await anon.rpc('serbest_siralama')).error);
bekle('gizli sezon listesi uygulamadan çağrılamıyor', !!(await A.c.schema('gizli').rpc('sezon_etkinlikleri')).error);
const yabanci = await kullanici('yabanci@test.local', 'Yabancı');
bekle('üye olmayan Serbest tablosunda bir şey görmüyor', ((await yabanci.c.rpc('serbest_siralama')).data ?? []).length === 0);

// ---------------------------------------------- etkinlik kurma
const temalar = [{ ad: 'Pencere', bulusmada: true }, { ad: 'Gölge', bulusmada: false }];
const ileri = new Date(Date.now() + 86400000).toISOString();
bekle('üye etkinlik kuramıyor', hata(await K.b.c.rpc('etkinlik_kur', { p_bulusma: tarih(-1), p_yukleme_baslar: ileri, p_yukleme_saat: 24, p_oylama_saat: 48, p_temalar: temalar })).includes('yetki_yok'));
// Eski çağrı (serbest parametresi yok) çalışmaya devam ediyor, buluşma etkinliği kuruyor
const r1 = await A.c.rpc('etkinlik_kur', { p_bulusma: tarih(-1), p_yukleme_baslar: ileri, p_yukleme_saat: 24, p_oylama_saat: 48, p_temalar: temalar });
bekle('eski çağrı çalışıyor (serbest parametresi olmadan)', !r1.error && !!r1.data, hata(r1));
const e1 = (await admin.from('etkinlikler').select('serbest').eq('id', r1.data).single()).data;
const t1 = (await admin.from('temalar').select('ad, bulusmada').eq('etkinlik', r1.data).order('sira')).data ?? [];
bekle('eski çağrı: buluşma etkinliği, temaların seçimi korunuyor', e1?.serbest === false && JSON.stringify(t1.map(t => t.bulusmada)) === '[true,false]', JSON.stringify([e1, t1]));
await admin.from('etkinlikler').update({ iptal: true }).eq('id', r1.data);
const r2 = await A.c.rpc('etkinlik_kur', { p_bulusma: tarih(-1), p_yukleme_baslar: ileri, p_yukleme_saat: 24, p_oylama_saat: 48, p_temalar: temalar, p_serbest: true });
bekle('serbest etkinlik kuruluyor', !r2.error && !!r2.data, hata(r2));
const e2 = (await admin.from('etkinlikler').select('serbest').eq('id', r2.data).single()).data;
const t2 = (await admin.from('temalar').select('bulusmada').eq('etkinlik', r2.data)).data ?? [];
bekle('serbest etkinlikte bütün temalar serbest (buluşmada seçilse de)', e2?.serbest === true && t2.length === 2 && t2.every(t => t.bulusmada === false), JSON.stringify([e2, t2]));
bekle('iptal edilen etkinlik sezonu etkilemiyor', Number(((await A.c.rpc('sezon_ozeti')).data ?? [])[0]?.tamamlanan) === 1);
bekle('etkinlik sütunu uygulamadan yazılamıyor', !!(await A.c.from('etkinlikler').update({ serbest: false }).eq('id', r2.data).select()).error
  || ((await A.c.from('etkinlikler').update({ serbest: false }).eq('id', r2.data).select()).data ?? []).length === 0);
bekle('serbest işareti değişmedi', (await admin.from('etkinlikler').select('serbest').eq('id', r2.data).single()).data?.serbest === true);


// ---------------------------------------------- ekran
{
  const { chromium } = await import('/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs');
  const APP = 'http://localhost:5180/';
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 1400 }, isMobile: true })).newPage();
  const hatalar = []; p.on('pageerror', e => hatalar.push(String(e)));
  await p.goto(APP); await p.waitForFunction(() => window.__sb);
  await p.evaluate(async () => { const r = await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); if (r.error) throw r.error; });
  const ac = async y => { await p.goto(APP + '#/' + y); await p.reload(); await p.waitForTimeout(2200); };
  // Bu dosya Wrapped'in kendiliğinden açılmasını sınamıyor
  await admin.from('wrapped_izlendi').insert([E1.id, S1.id].map(e => ({ etkinlik: e, uye: A.id })));
  const metin = async () => (await p.locator('.app').innerText()).replace(/\s+/g, ' ');

  await ac('siralama');
  bekle('ekran: Serbest tablosunda sırasız isimler ve "İlk 1"', (await p.locator('.kart.isimler[data-tablo=serbest] button').allTextContents()).join() === 'Barış Ak' && (await p.locator('.kart-bas', { hasText: 'Serbest temalar' }).textContent()).includes('İlk 1'), JSON.stringify(await p.locator('.kart.isimler[data-tablo=serbest] button').allTextContents()));
  bekle('ekran: Serbest tablosu görünüyor', (await p.locator('.kart-bas', { hasText: 'Serbest temalar' }).count()) === 1, (await metin()).slice(0, 300));
  bekle('ekran: sezon ilerlemesi serbest etkinliği saymıyor', (await metin()).includes('1 / 6 etkinlik'));
  // Serbest tablosu hata verirse ana tablo yine görünüyor, Serbest bölümü sessizce yok
  await p.route('**/rest/v1/rpc/serbest_siralama*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deneme"}' }));
  await ac('siralama');
  bekle('ekran: Serbest tablosu düşerse ana tablo duruyor', (await p.locator('.row[data-tablo=sezon]').count()) > 0 && (await p.locator('.row[data-tablo=serbest]').count()) === 0 && (await p.locator('.hata').count()) === 0, (await metin()).slice(0, 200));
  await p.unroute('**/rest/v1/rpc/serbest_siralama*');
  // Serbest'te kare var ama hiçbiri sıralamaya girmedi: boş durum kartı
  await p.route('**/rest/v1/rpc/serbest_siralama*', async r => { const c = await r.fetch(); r.fulfill({ response: c, json: (await c.json()).map(x => ({ ...x, sirali: false, sira: null, ortalama: null })) }); });
  await ac('siralama');
  bekle('ekran: Serbest temasında sıralı kimse yoksa boş durum kartı', (await p.locator('.bos-kart', { hasText: 'Henüz serbest kare yok' }).count()) === 1 && (await p.locator('.row[data-tablo=serbest]').count()) === 0);
  await p.unroute('**/rest/v1/rpc/serbest_siralama*');
  await ac('etkinlikler');
  bekle('ekran: arşivde ekstra etkinlik "EK"', (await p.locator('.ev .no', { hasText: 'EK' }).count()) === 1);
  bekle('ekran: arşivde ay yanında " · ekstra"', (await p.locator('.ev .mo', { hasText: '· ekstra' }).count()) === 1);
  bekle('ekran: arşiv numarası yalnız buluşmaları sayıyor', (await p.locator('.ev .no').allTextContents()).map(x => x.trim()).sort().join() === '01,EK', JSON.stringify(await p.locator('.ev .no').allTextContents()));
  await ac(`wrapped/${S1.id}`);
  bekle('ekran: ekstra etkinliğin açılışı söylüyor', (await metin()).toLocaleLowerCase('tr-TR').includes(`ekstra etkinlik · ${new Date(Date.now() - 5 * 86400000).toLocaleDateString('tr-TR', { month: 'long', timeZone: 'Europe/Istanbul' }).toLocaleLowerCase('tr-TR')}`), (await metin()).slice(0, 160));
  await ac(`sonuc/${S1.id}`);
  bekle('ekran: ekstra etkinliğin sayfası söylüyor', (await metin()).toLocaleLowerCase('tr-TR').includes('ekstra etkinlik'), (await metin()).slice(0, 160));

  // Kurulum: önce açık etkinliği iptal et, sonra ekrandan serbest etkinlik kur
  await admin.from('etkinlikler').update({ iptal: true }).eq('id', r2.data);
  await ac('kur');
  bekle('ekran: buluşma türünde temaların çekim şartı seçilebiliyor', (await p.getByRole('group', { name: 'Çekim şartı' }).count()) === 1);
  await p.getByRole('button', { name: 'Serbest · ekstra' }).click();
  bekle('ekran: serbest türde çekim şartı seçimi yok', (await p.getByRole('group', { name: 'Çekim şartı' }).count()) === 0);
  await p.getByRole('button', { name: 'Buluşma', exact: true }).click();
  bekle('ekran: buluşmaya dönünce çekim şartı seçimi geri geliyor, açıklama gidiyor', (await p.getByRole('group', { name: 'Çekim şartı' }).count()) === 1 && !(await metin()).includes('Sezonun altı etkinliğine sayılmaz'));
  await p.getByRole('button', { name: 'Serbest · ekstra' }).click();
  bekle('ekran: serbest tür ne demek olduğunu söylüyor', (await metin()).includes('Sezonun altı etkinliğine sayılmaz'));
  await p.locator('#bg').fill(tarih(-2));
  bekle('ekran: serbest türde tarih ipucu', (await metin()).includes('Etkinliğin tarihi bu gün olarak görünür'));
  await p.locator('#yb').fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16));
  bekle('ekran: serbest türde tema adı boşken kur düğmesi açık', await p.getByRole('button', { name: 'Etkinliği kur' }).isEnabled());
  bekle('ekran: serbest türde tema adı yer tutucusu "boş bırakırsan serbest"', (await p.locator('#t0').getAttribute('placeholder')) === 'BOŞ BIRAKIRSAN: SERBEST');
  await p.getByRole('button', { name: 'Tema ekle' }).click();
  await p.getByRole('button', { name: 'Tema ekle' }).click();
  await p.locator('#t2').fill('Işık');
  await p.getByRole('button', { name: 'Etkinliği kur' }).click(); await p.waitForTimeout(2000);
  const yeni = (await admin.from('etkinlikler').select('id, serbest').eq('iptal', false).order('olusturma', { ascending: false }).limit(1)).data?.[0];
  const yeniT = yeni ? (await admin.from('temalar').select('ad, bulusmada').eq('etkinlik', yeni.id)).data : [];
  await ac('etkinlikler');
  bekle('ekran: serbest etkinlikte tema adlarının yanında "(serbest)" eki yok', !((await p.locator('.live .temalar').textContent().catch(() => '')) ?? '').includes('(serbest)') && ((await p.locator('.live .temalar').textContent().catch(() => '')) ?? '').includes('Işık'), await p.locator('.live .temalar').textContent().catch(() => ''));
  await ac('asama');
  bekle('ekran: yönetimdeki grup mesajında da "(serbest)" eki yok', !((await p.locator('.mesaj p').textContent().catch(() => '')) ?? '').includes('(serbest)') && ((await p.locator('.mesaj p').textContent().catch(() => '')) ?? '').includes('Işık') && ((await p.locator('.mesaj p').textContent().catch(() => '')) ?? '').startsWith('Ekstra etkinlik:'), await p.locator('.mesaj p').textContent().catch(() => ''));
  await ac('etkinlikler');
  bekle('ekran: canlı kart "Ekstra etkinlik · ay" diyor', ((await p.locator('.live .kick').textContent()) ?? '').startsWith('Ekstra etkinlik · '), await p.locator('.live .kick').textContent().catch(() => ''));
  if (yeni) await admin.from('etkinlikler').update({ yukleme_baslar: gun(2), yukleme_biter: gun(1), oylama_biter: gun(-1) }).eq('id', yeni.id);
  await ac('asama');
  bekle('ekran: oylama aşamasında grup mesajı "Ekstra etkinliğin oylaması açıldı." diye başlıyor', ((await p.locator('.mesaj p').textContent().catch(() => '')) ?? '').startsWith('Ekstra etkinliğin oylaması açıldı.'), await p.locator('.mesaj p').textContent().catch(() => ''));
  bekle('ekran: kurulan etkinlik serbest, temaları serbest; boş adlar "Serbest", "Serbest 2" oluyor', yeni?.serbest === true && yeniT?.length === 3 && yeniT.every(t => t.bulusmada === false) && yeniT.map(t => t.ad).sort().join() === 'Işık,Serbest,Serbest 2', JSON.stringify([yeni, yeniT]));
  bekle('ekran: sayfa hatası yok', hatalar.length === 0, hatalar.join(' | '));
  // Boş p_serbest buluşma sayılıyor
  if (yeni) await admin.from('etkinlikler').update({ iptal: true }).eq('id', yeni.id);
  const r3 = await A.c.rpc('etkinlik_kur', { p_bulusma: tarih(-3), p_yukleme_baslar: ileri, p_yukleme_saat: 24, p_oylama_saat: 48, p_temalar: temalar, p_serbest: null });
  const e3 = r3.data ? (await admin.from('etkinlikler').select('serbest').eq('id', r3.data).single()).data : null;
  bekle('boş serbest parametresi buluşma etkinliği kuruyor', !r3.error && e3?.serbest === false, hata(r3) || JSON.stringify(e3));
  if (r3.data) await admin.from('etkinlikler').update({ iptal: true }).eq('id', r3.data);
  await b.close();
}


// ---------------------------------------------- sezon sınırı (gizli.sezon_etkinlikleri)
// Beş eski buluşma daha: E1 ile birlikte altı → birinci sezon doluyor. Yeni bir buluşma ikinci
// sezonu açıyor. Serbest etkinlik, kendi gününe kadarki son buluşmanın sezonuna düşüyor;
// hiçbir buluşmadan önceyse birinci sezona.
{
  for (const g of [20, 19, 18, 17, 16]) { const e = await etkinlik(g, [['Eski', true]]); await kare(e, 0, K.c, 5); }
  const E7 = await etkinlik(3, [['Yeni', true]]); await kare(E7, 0, K.c, 5);
  const S2 = await etkinlik(2, [['Serbest2', false]], true); await kare(S2, 0, K.b, 4);
  const S0 = await etkinlik(30, [['Erken', false]], true); await kare(S0, 0, K.d, 2);
  const sez = async n => ((await K.b.c.rpc('serbest_siralama', { p_sezon: n })).data ?? []);
  const s1 = await sez(1), s2 = await sez(2);
  bekle('sezon sınırı: ikinci sezon açıldı', Number(((await A.c.rpc('sezon_ozeti')).data ?? [])[0]?.sezon) === 2, JSON.stringify((await A.c.rpc('sezon_ozeti')).data));
  bekle('sezon sınırı: sonraki buluşmadan sonraki serbest etkinlik ikinci sezonda', s2.length === 1 && s2[0].ad === 'Barış Ak' && Number(s2[0].ortalama) === 4, JSON.stringify(s2));
  bekle('sezon sınırı: önceki serbest etkinlikler birinci sezonda kaldı', !!satir(s1, 'Barış Ak') && !!satir(s1, 'Deniz Yılmaz'), JSON.stringify(s1.map(x => x.ad)));
  bekle('sezon sınırı: hiçbir buluşmadan önceki serbest etkinlik birinci sezonda', Number(satir(await sez(1).then(l => l), 'Deniz Yılmaz')?.kare_sayisi) === 2, JSON.stringify(s1));
  // Arşiv numarası yalnız buluşmaları sayıyor: 7 buluşma 01..07, iki eski serbest EK
  const { chromium } = await import('/Users/buse.balkan/.local/playwright-mcp/node_modules/playwright/index.mjs');
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 2400 } })).newPage();
  await p.goto('http://localhost:5180/'); await p.waitForFunction(() => window.__sb);
  await p.evaluate(async () => { await window.__sb.auth.signInWithPassword({ email: 'kurucu@test.local', password: 'test-sifre-1' }); });
  await admin.from('wrapped_izlendi').upsert([E7.id, S2.id, S0.id].map(e => ({ etkinlik: e, uye: A.id })), { ignoreDuplicates: true });
  await p.goto('http://localhost:5180/#/etkinlikler'); await p.reload(); await p.waitForTimeout(2500);
  const no = (await p.locator('.ev .no').allTextContents()).map(x => x.trim());
  const sayi = no.filter(x => x !== 'EK');
  bekle('arşiv: buluşmalar 07..01 kesintisiz, serbest etkinlikler EK', JSON.stringify(sayi) === JSON.stringify(['07', '06', '05', '04', '03', '02', '01']) && no.filter(x => x === 'EK').length === 3, JSON.stringify(no));
  await b.close();
}

rapor();
