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
const E2 = (await admin.from('etkinlikler').insert({ bulusma_gunu: yarin, yukleme_baslar: new Date(Math.min(Date.now(), Date.parse(geceYarim)) - 3600e3).toISOString(), yukleme_biter: saat(8), oylama_biter: saat(30), kuran: A.id }).select('id').single()).data.id;
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
rapor();
