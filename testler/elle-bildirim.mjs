// Yöneticinin elle bildirimi (0026, spec 2026-10-06_elle-bildirim_v1). Yerel veritabanı; zaman p_simdi ile.
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { execSync } from 'node:child_process';
execSync(`docker exec -i supabase_db_creatorgraphers-app psql -U postgres -d postgres -v ON_ERROR_STOP=1`, { input: `
set check_function_bodies = off;
create or replace function public.elle_gonder_test(p_gonderen uuid, p_tur text, p_baslik text, p_govde text, p_adres text, p_simdi timestamptz)
  returns int language sql security definer set search_path = public as $$ select gizli.elle_gonder(p_gonderen, p_tur, p_baslik, p_govde, p_adres, p_simdi) $$;
create or replace function public.elle_alici_sayisi_test(p_tur text, p_zaman timestamptz) returns int
  language sql stable security definer set search_path = public as $$ select count(*)::int from gizli.elle_alicilar(p_tur, p_zaman) $$;
create or replace function public.bildirim_gecerli_test(p_id bigint, p_simdi timestamptz) returns boolean
  language sql stable security definer set search_path = public as $$ select gizli.bildirim_gecerli(q, p_simdi) from public.bildirim_kuyrugu q where q.id = p_id $$;
create or replace function public.elle_durum_test(p_simdi timestamptz) returns jsonb
  language sql stable security definer set search_path = public as $$ select gizli.elle_durum(p_simdi) $$;
revoke execute on function public.elle_durum_test(timestamptz) from public, anon, authenticated;
grant execute on function public.elle_durum_test(timestamptz) to service_role;
revoke execute on function public.elle_gonder_test(uuid, text, text, text, text, timestamptz), public.elle_alici_sayisi_test(text, timestamptz), public.bildirim_gecerli_test(bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.elle_gonder_test(uuid, text, text, text, text, timestamptz), public.elle_alici_sayisi_test(text, timestamptz), public.bildirim_gecerli_test(bigint, timestamptz) to service_role;` });
await sifirla();
const hata = r => r.error?.message ?? '';
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const UYE = [];
for (const [e, ad] of [['b@test.local', 'Barış Ak'], ['c@test.local', 'Can Öz'], ['d@test.local', 'Deniz Er']]) {
  const u = await kullanici(e, ad); await admin.from('uyeler').insert({ id: u.id, ad, eposta: e }); UYE.push(u);
}
const [B, C, D] = UYE;
// A, B, C abone; D değil
for (const [u, n] of [[A, 'a'], [B, 'b'], [C, 'c']]) await u.c.rpc('bildirim_abone_ol', { p_endpoint: `https://push.example/${n}`, p_p256dh: 'p', p_auth: 'a' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const sayi = async (tur, zaman = new Date().toISOString()) => (await admin.rpc('elle_alici_sayisi_test', { p_tur: tur, p_zaman: zaman })).data;

// Yetki
bekle('üye durumu okuyamıyor', !!(await B.c.rpc('elle_bildirim_durumu')).error);
bekle('üye kayıt tablosunu okuyamıyor', ((await B.c.from('elle_bildirimler').select('id')).data ?? []).length === 0);
let d = (await A.c.rpc('elle_bildirim_durumu')).data;
bekle('yönetici durumu okuyor, bugün 2 hak', d?.kalan === 2 && d?.abone === 3, JSON.stringify(d));
bekle('durum kimlik döndürmüyor', !JSON.stringify(d).includes(B.id) && !JSON.stringify(d).includes(C.id));

// Tema önerisi: açık önerisi olmayan aboneler. B'nin havuzda önerisi var.
const o = (await admin.from('tema_onerileri').insert({ ad: 'Gece', anahtar: 'gece' }).select('id').single()).data;
await admin.from('oneri_sahipleri').insert({ oneri: o.id, uye: B.id });
bekle('tema önerisi: açık önerisi olmayan aboneler (A, C)', (await sayi('tema_oner')) === 2, String(await sayi('tema_oner')));
await admin.from('tema_onerileri').update({ durum: 'secildi' }).eq('id', o.id);
bekle('seçilen öneri açık sayılmıyor', (await sayi('tema_oner')) === 3);

// Açık etkinlik yokken yükleme/oy/tahmin/buluşma görünmüyor
d = (await A.c.rpc('elle_bildirim_durumu')).data;
const gor = t => d.hatirlatmalar.find(x => x.tur === t);
bekle('etkinlik yokken yalnız tema önerisi görünür', gor('tema_oner').gorunur && !gor('yukleme').gorunur && !gor('oy').gorunur && !gor('tahmin').gorunur && !gor('bulusma').gorunur && !gor('wrapped').gorunur, JSON.stringify(d.hatirlatmalar));

// Yükleme sürerken: boş teması olan aboneler
const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const yarin = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: yarin, yukleme_baslar: saat(-2), yukleme_biter: saat(5), oylama_biter: saat(30), kuran: A.id }).select('id').single()).data.id;
const T1 = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Gece', sira: 1, bulusmada: false }).select('id').single()).data.id;
await admin.from('temalar').insert({ etkinlik: E, ad: 'Su', sira: 2, bulusmada: false });
const kareKoy = async (u, tema) => {
  const yol = `${E}/${tema}/${crypto.randomUUID()}.jpg`;
  await admin.from('dosyalar').insert({ yol, sahip: u.id, etkinlik: E, boyut: 1 });
  return (await admin.from('kareler').insert({ tema, sahip: u.id, dosya: yol, genislik: 10, yukseklik: 10 }).select('id').single()).data.id;
};
await kareKoy(B, T1);   // B'nin Su teması boş, A ve C'nin ikisi de boş
bekle('yükleme: boş teması olan aboneler (A, B, C)', (await sayi('yukleme')) === 3);
bekle('yükleme hatırlatması görünür', (await A.c.rpc('elle_bildirim_durumu')).data.hatirlatmalar.find(x => x.tur === 'yukleme').gorunur);
bekle('buluşma: yarınki buluşma, bütün aboneler', (await sayi('bulusma')) === 3);

// Oylama: oy ve tahmin
await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).eq('id', E);
bekle('oylamada yükleme görünmüyor', !(await A.c.rpc('elle_bildirim_durumu')).data.hatirlatmalar.find(x => x.tur === 'yukleme').gorunur);
// B'nin karesi var: oylaması zorunlu olan yok (başka kare yok) → oy 0
bekle('oy: oylaması eksik kimse yok', (await sayi('oy')) === 0);

// Wrapped: sonucu açık son etkinlik, izlemeyen aboneler
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.5) }).eq('id', E);
await admin.from('wrapped_izlendi').insert({ uye: A.id, etkinlik: E });
bekle('wrapped: izlemeyen aboneler (B, C)', (await sayi('wrapped')) === 2);
d = (await A.c.rpc('elle_bildirim_durumu')).data;
bekle('wrapped görünür, etiket etkinlik günü', d.hatirlatmalar.find(x => x.tur === 'wrapped').gorunur && !!d.hatirlatmalar.find(x => x.tur === 'wrapped').etiket, JSON.stringify(d.hatirlatmalar.find(x => x.tur === 'wrapped')));
const iptal = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-50), yukleme_biter: saat(-40), oylama_biter: saat(-0.1), kuran: A.id, iptal: true }).select('id').single()).data.id;
bekle('iptal edilen etkinlik wrapped için seçilmiyor', (await sayi('wrapped')) === 2);
bekle('serbest: bütün aboneler', (await sayi('serbest')) === 3);
// ---- Gönderme ----
const kuyruk = async tur => (await admin.from('bildirim_kuyrugu').select('id, kullanici, baslik, govde, adres, zaman, son_tarih').eq('tur', tur)).data ?? [];
const gonder = (tur, simdi, baslik = null, govde = null, adres = null) =>
  admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: tur, p_baslik: baslik, p_govde: govde, p_adres: adres, p_simdi: simdi });
bekle('üye gönderemiyor', /yetki_yok/.test(hata(await B.c.rpc('elle_bildirim_gonder', { p_tur: 'tema_oner' }))));
const ogle = new Date(`${bugun}T09:00:00Z`).toISOString();   // İstanbul 12.00
let g = await gonder('wrapped', ogle);
bekle('wrapped gönderildi: 2 kişi', g.data === 2 && (await kuyruk('elle_wrapped')).length === 2, hata(g));
{
  const w0 = (await admin.rpc('elle_durum_test', { p_simdi: ogle })).data.hatirlatmalar.find(x => x.tur === 'wrapped');
  bekle('gönderilen hatırlatma bugün sayılmıyor, bugün gönderildi işaretli', w0.alici === 0 && w0.bugun === true, JSON.stringify(w0));
}
bekle('kayıt tutuldu', ((await admin.from('elle_bildirimler').select('alici').eq('tur', 'wrapped')).data ?? [])[0]?.alici === 2);
bekle('aynı gün aynı hatırlatma kişiye bir kez (kuyruk tekrar etmiyor)', (await gonder('wrapped', ogle), (await kuyruk('elle_wrapped')).length === 2));
// Yukarıdaki ikinci wrapped hakkı yedi mi? Alıcı 0 olduğu için yememeli
bekle('alıcısı kalmayan gönderim alici_yok, hak yemiyor', (await admin.from('elle_bildirimler').select('id')).data.length === 1);
// Serbest metin
bekle('serbest: 41 karakter başlık reddediliyor', /metin_gecersiz/.test(hata(await gonder('serbest', ogle, 'x'.repeat(41), 'Metin', 'etkinlikler'))));
bekle('serbest: boş metin reddediliyor', /metin_gecersiz/.test(hata(await gonder('serbest', ogle, 'Başlık', '   ', 'etkinlikler'))));
bekle('serbest: listede olmayan adres reddediliyor', /metin_gecersiz/.test(hata(await gonder('serbest', ogle, 'Başlık', 'Metin', 'uyeler'))));
g = await gonder('serbest', ogle, '  Cumartesi buluşuyoruz ', 'Saat 10.00, Karaköy iskelesi.', 'etkinlikler');
const s = await kuyruk('elle_serbest');
bekle('serbest: bütün abonelere, başlık kırpılmış', g.data === 3 && s.length === 3 && s.every(x => x.baslik === 'Cumartesi buluşuyoruz' && x.adres === 'etkinlikler'), JSON.stringify(s[0]));
bekle('günün üçüncü gönderimi reddediliyor', /elle_sinir/.test(hata(await gonder('tema_oner', ogle))));
const ertesi = new Date(Date.parse(ogle) + 864e5).toISOString();
bekle('ertesi gün hak yenileniyor', (await gonder('tema_oner', ertesi)).data === 3);
// Gece: İstanbul 23.30 → 08.00
const gece = new Date(Date.parse(ertesi) + 11.5 * 3600e3).toISOString();   // 23.30
await gonder('serbest', gece, 'Gece', 'Gece metni', 'profil');
const gs = (await kuyruk('elle_serbest')).filter(x => x.baslik === 'Gece');
const sabah = new Date(gs[0]?.zaman).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
bekle('gece gönderimi 08.00\'e yazılıyor', gs.length === 3 && sabah === '08:00', sabah);
// ---- Gönderim anı ----
const gecerli = async (id, simdi) => (await admin.rpc('bildirim_gecerli_test', { p_id: id, p_simdi: simdi })).data;
const w = (await kuyruk('elle_wrapped')).find(x => x.kullanici === B.id);
await admin.from('wrapped_izlendi').insert({ uye: B.id, etkinlik: E });
bekle('wrapped: izledikten sonra gitmiyor', (await gecerli(w.id, ogle)) === false);
const t = (await kuyruk('elle_tema_oner')).find(x => x.kullanici === C.id);
const o2 = (await admin.from('tema_onerileri').insert({ ad: 'Su', anahtar: 'su' }).select('id').single()).data;
await admin.from('oneri_sahipleri').insert({ oneri: o2.id, uye: C.id });
bekle('tema önerisi: öneri yaptıktan sonra gitmiyor', (await gecerli(t.id, ertesi)) === false);
bekle('serbest hep geçerli', (await gecerli(s[0].id, ogle)) === true);
// Yükleme: işini yapan gitmiyor
const geceYarim = new Date(Date.parse(`${bugun}T20:30:00Z`)).toISOString();   // bugün İstanbul 23.30
const E2 = (await admin.from('etkinlikler').insert({ bulusma_gunu: yarin, yukleme_baslar: new Date(Math.min(Date.now(), Date.parse(geceYarim)) - 3600e3).toISOString(), yukleme_biter: saat(30), oylama_biter: saat(60), kuran: A.id }).select('id').single()).data.id;
await admin.from('etkinlikler').update({ iptal: true }).eq('id', E);
const T3 = (await admin.from('temalar').insert({ etkinlik: E2, ad: 'Işık', sira: 1, bulusmada: false }).select('id').single()).data.id;
await admin.from('elle_bildirimler').delete().neq('id', 0);
await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'yukleme', p_baslik: null, p_govde: null, p_adres: null, p_simdi: new Date().toISOString() });
const y = (await kuyruk('elle_yukleme')).find(x => x.kullanici === C.id);
bekle('yükleme hatırlatması metni otomatikle aynı biçimde', /^Yükleme \d+ saat sonra kapanıyor$/.test(y?.baslik) && y?.govde === 'Işık temasına karen yok', JSON.stringify(y));
const yolC = `${E2}/${T3}/${crypto.randomUUID()}.jpg`;
await admin.from('dosyalar').insert({ yol: yolC, sahip: C.id, etkinlik: E2, boyut: 1 });
await admin.from('kareler').insert({ tema: T3, sahip: C.id, dosya: yolC, genislik: 10, yukseklik: 10 });
bekle('yükleme: kare verdikten sonra gitmiyor', (await gecerli(y.id, new Date().toISOString())) === false);
// Gece ertelemesi yüklemenin kapanışını geçiyorsa hiç kuyruğa girmiyor (Review Focus 1)
await admin.from('elle_bildirimler').delete().neq('id', 0);
const kapanis = new Date(Date.parse(`${bugun}T04:00:00Z`) + 864e5).toISOString();   // yarın İstanbul 07.00
await admin.from('etkinlikler').update({ yukleme_biter: kapanis }).eq('id', E2);
bekle('08.00\'e kalan ve o saatte kapanmış yükleme: alici_yok', /alici_yok/.test(hata(await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'yukleme', p_baslik: null, p_govde: null, p_adres: null, p_simdi: geceYarim }))));

// ---- Kod incelemesi düzeltmeleri ----
const sil = () => admin.from('elle_bildirimler').delete().neq('id', 0);
await admin.from('etkinlikler').update({ yukleme_biter: saat(30) }).eq('id', E2);
// F1: fotoğrafa bağlı hatırlatmalarda yöneticiye sayı yok (kare çıkar/geri al ile sahip çıkarılabiliyordu)
await sil();
d = (await A.c.rpc('elle_bildirim_durumu')).data;
const yh = d.hatirlatmalar.find(x => x.tur === 'yukleme');
bekle('F1: yükleme satırı görünür ama sayısız', yh.gorunur && yh.alici === null, JSON.stringify(yh));
bekle('F1: oy ve tahmin sayısız', d.hatirlatmalar.filter(x => ['oy', 'tahmin'].includes(x.tur)).every(x => x.alici === null), JSON.stringify(d.hatirlatmalar));
bekle('F1: görünmeyen satırda da sayı yok', d.hatirlatmalar.filter(x => !x.gorunur).every(x => x.alici === null), JSON.stringify(d.hatirlatmalar));
await admin.from('bildirim_kuyrugu').delete().eq('tur', 'elle_yukleme');   // yukarıdaki gönderim bugünü doldurdu
g = await A.c.rpc('elle_bildirim_gonder', { p_tur: 'yukleme' });
bekle('F1: yükleme gönderimi sayı döndürmüyor', !g.error && g.data === null, JSON.stringify(g));
d = (await A.c.rpc('elle_bildirim_durumu')).data;
bekle('F1: son gönderilenlerde yüklemenin sayısı yok', d.son[0]?.tur === 'yukleme' && d.son[0]?.alici === null, JSON.stringify(d.son));
// F2: 23.30'da gönderilen sabaha kalıyor; gün ve hak teslim gününe göre
await sil();
await admin.from('bildirim_kuyrugu').delete().eq('tur', 'elle_tema_oner');   // önceki adımlar aynı teslim gününe göndermişti
const g1 = await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'tema_oner', p_baslik: null, p_govde: null, p_adres: null, p_simdi: geceYarim });
const gece2 = new Date(Date.parse(geceYarim) + 3600e3).toISOString();   // 00.30
const g2 = await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'tema_oner', p_baslik: null, p_govde: null, p_adres: null, p_simdi: gece2 });
bekle('F2: 23.30 ve 00.30 aynı sabaha: ikinci kez gitmiyor', g1.data > 0 && /alici_yok/.test(hata(g2)), `${JSON.stringify(g1)} ${hata(g2)}`);
await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'serbest', p_baslik: 'Bir', p_govde: 'Bir', p_adres: 'profil', p_simdi: gece2 });
const sabah9 = new Date(Date.parse(geceYarim) + 9.5 * 3600e3).toISOString();   // ertesi gün 09.00
bekle('F2: gece gönderilen ertesi günün hakkından düşüyor', /elle_sinir/.test(hata(await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'serbest', p_baslik: 'Üç', p_govde: 'Üç', p_adres: 'profil', p_simdi: sabah9 }))));
// Oylama etkinliği: altı fotoğrafçı (tahmin oyunu var), oy ve tahmin
await admin.from('etkinlikler').update({ iptal: true }).eq('id', E2);
const EK = [];
for (const [e, ad] of [['e@test.local', 'Ece Tan'], ['f@test.local', 'Filiz Ok'], ['g@test.local', 'Gül Ay'], ['h@test.local', 'Hale Su']]) {
  const u = await kullanici(e, ad); await admin.from('uyeler').insert({ id: u.id, ad, eposta: e }); EK.push(u);
}
const bes = new Date(Date.now() + 5 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const E3 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bes, yukleme_baslar: saat(-30), yukleme_biter: saat(-20), oylama_biter: saat(40), kuran: A.id }).select('id').single()).data.id;
const T4 = (await admin.from('temalar').insert({ etkinlik: E3, ad: 'Ses', sira: 1, bulusmada: false }).select('id').single()).data.id;
const kare3 = {};
for (const u of [B, C, ...EK]) {
  const yol = `${E3}/${T4}/${crypto.randomUUID()}.jpg`;
  await admin.from('dosyalar').insert({ yol, sahip: u.id, etkinlik: E3, boyut: 1 });
  kare3[u.id] = (await admin.from('kareler').insert({ tema: T4, sahip: u.id, dosya: yol, genislik: 10, yukseklik: 10 }).select('id').single()).data.id;
}
// Oy: B ve C'nin oylaması eksik (her birinin 5 kare)
await sil();
await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'oy', p_baslik: null, p_govde: null, p_adres: null, p_simdi: saat(0) });
const oyB = (await kuyruk('elle_oy')).find(x => x.kullanici === B.id);
bekle('oy: oylaması eksik aboneye, kalan kare sayısıyla', !!oyB && oyB.govde === '5 kare kaldı' && /^Oylama \d+ saat sonra kapanıyor$/.test(oyB.baslik) && !(await kuyruk('elle_oy')).some(x => x.kullanici === A.id), JSON.stringify(await kuyruk('elle_oy')));
for (const u of [C, ...EK]) await admin.from('oylar').insert({ kare: kare3[u.id], veren: B.id, puan: 7 });
bekle('oy: oylamasını bitirince gitmiyor', (await gecerli(oyB.id, saat(0))) === false);
// Tahmin: B bütün oylarını verdi, oyunu açmadı
await sil();
await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'tahmin', p_baslik: null, p_govde: null, p_adres: null, p_simdi: saat(0) });
const th = await kuyruk('elle_tahmin');
bekle('tahmin: yalnız oylamasını bitiren aboneye (B)', th.length === 1 && th[0].kullanici === B.id && th[0].adres === `tahmin/${E3}`, JSON.stringify(th));
await admin.from('etkinlikler').update({ oylama_biter: saat(1) }).eq('id', E3);   // Oylamayı erken bitirme gibi: bitiş değişti
bekle('F3: oylama bitişi değişince tahmin hatırlatması gitmiyor', (await gecerli(th[0].id, saat(0))) === false);
await admin.from('etkinlikler').update({ oylama_biter: saat(40) }).eq('id', E3);
// Buluşma: gün geçince gitmiyor
await sil();
await admin.rpc('elle_gonder_test', { p_gonderen: A.id, p_tur: 'bulusma', p_baslik: null, p_govde: null, p_adres: null, p_simdi: saat(0) });
const bu = (await kuyruk('elle_bulusma'))[0];
bekle('buluşma: gün başlığı ve temalar', /^Buluşma günü: \d+ \S+$/.test(bu?.baslik ?? '') && bu?.govde === 'Temalar: Ses.', JSON.stringify(bu));
await admin.from('etkinlikler').update({ bulusma_gunu: new Date(Date.now() - 2 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }) }).eq('id', E3);
bekle('buluşma: gün geçince gitmiyor', (await gecerli(bu.id, saat(0))) === false);

// Wrapped: yeni etkinliğin yüklemesi açılınca eski Wrapped hatırlatması kalkıyor (Buse, 2026-10-06)
const E4 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-90), yukleme_biter: saat(-80), oylama_biter: saat(-70), kuran: A.id }).select('id').single()).data.id;
await admin.from('etkinlikler').update({ bulusma_gunu: bes }).eq('id', E3);
const wd = async () => (await admin.rpc('elle_durum_test', { p_simdi: saat(0) })).data.hatirlatmalar.find(x => x.tur === 'wrapped');
bekle('wrapped: yeni etkinliğin oylaması sürerken görünmüyor', (await wd()).gorunur === false, JSON.stringify(await wd()));
await admin.from('etkinlikler').update({ yukleme_baslar: saat(5), yukleme_biter: saat(30), oylama_biter: saat(60) }).eq('id', E3);
bekle('wrapped: yeni etkinlik kurulu ama yükleme açılmamışken görünür', (await wd()).gorunur === true, JSON.stringify(await wd()));
rapor();
