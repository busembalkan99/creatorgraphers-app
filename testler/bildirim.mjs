// Bildirim altyapısı, sunucu kuralları (karar 120). Yerel veritabanı; zaman p_simdi ile simüle.
import { admin, istemci, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { execSync } from 'node:child_process';
// Test sarmalayıcıları: planlayıcı ve gece kuralı gizli şemada, PostgREST'e açık değil. Yalnız test veritabanında.
execSync(`docker exec -i supabase_db_creatorgraphers-app psql -U postgres -d postgres -v ON_ERROR_STOP=1`, { input: `
create or replace function public.bildirim_planla_test(p_simdi timestamptz default now()) returns int
  language sql security definer set search_path = public as $$ select gizli.bildirim_planla(p_simdi) $$;
create or replace function public.gece_disi_test(p timestamptz, p_hatirlatma boolean) returns timestamptz
  language sql stable security definer set search_path = public as $$ select gizli.gece_disi(p, p_hatirlatma) $$;
revoke execute on function public.bildirim_planla_test(timestamptz), public.gece_disi_test(timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.bildirim_planla_test(timestamptz), public.gece_disi_test(timestamptz, boolean) to service_role;` });
await sifirla();
const hata = r => r.error?.message ?? '';
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak');
await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
const uc = n => `https://push.example/${n}`;

// Abonelik
let r = await B.c.rpc('bildirim_abone_ol', { p_endpoint: uc('b1'), p_p256dh: 'p', p_auth: 'a' });
bekle('abone olunuyor', !r.error, hata(r));
bekle('kendi aboneliğini görüyor', (await B.c.rpc('bildirim_aboneligim_var', { p_endpoint: uc('b1') })).data === true);
bekle('tabloyu doğrudan okuyamıyor', ((await B.c.from('bildirim_abonelikleri').select('*')).data ?? []).length === 0);
bekle('başkasının aboneliğini görmüyor', (await A.c.rpc('bildirim_aboneligim_var', { p_endpoint: uc('b1') })).data === false);
r = await A.c.rpc('bildirim_aboneligi_sil', { p_endpoint: uc('b1') });
bekle('başkasının aboneliğini silemiyor', ((await admin.from('bildirim_abonelikleri').select('id').eq('endpoint', uc('b1'))).data ?? []).length === 1);
// Aynı cihaza başka biri girip abone olursa abonelik ona geçer
r = await A.c.rpc('bildirim_abone_ol', { p_endpoint: uc('b1'), p_p256dh: 'p2', p_auth: 'a2' });
const sahip = (await admin.from('bildirim_abonelikleri').select('kullanici').eq('endpoint', uc('b1')).single()).data?.kullanici;
bekle('aynı cihazda yeni abonelik sahibini değiştiriyor', sahip === A.id, sahip);
r = await istemci().rpc('bildirim_abone_ol', { p_endpoint: uc('x'), p_p256dh: 'p', p_auth: 'a' });
bekle('girişsiz abone olunamıyor', !!r.error);
r = await B.c.rpc('bildirim_abone_ol', { p_endpoint: 'http://kotu', p_p256dh: 'p', p_auth: 'a' });
bekle('https olmayan adres reddediliyor', !!r.error);
// Yönetici sayısı
await B.c.rpc('bildirim_abone_ol', { p_endpoint: uc('b2'), p_p256dh: 'p', p_auth: 'a' });
const say = (await A.c.rpc('bildirim_acik_sayisi')).data?.[0];
bekle('yönetici açık / toplam üye sayısını görüyor', Number(say?.acik) === 2 && Number(say?.toplam) === 2, JSON.stringify(say));
const sayB = (await B.c.rpc('bildirim_acik_sayisi')).data?.[0];
bekle('üye sayıyı göremiyor', Number(sayB?.acik ?? 0) === 0 && Number(sayB?.toplam ?? 0) === 0, JSON.stringify(sayB));
// ---- planlayıcı ----
const C = await kullanici('can@test.local', 'Can Öz');
await admin.from('uyeler').insert({ id: C.id, ad: 'Can Öz', eposta: 'can@test.local' });
await C.c.rpc('bildirim_abone_ol', { p_endpoint: uc('c1'), p_p256dh: 'p', p_auth: 'a' });
const tz = s => new Date(s).toISOString();             // '2026-10-12T17:00:00Z' gibi UTC
const kuyruk = async () => (await admin.from('bildirim_kuyrugu').select('*').order('id')).data ?? [];
const temizle = () => admin.from('bildirim_kuyrugu').delete().neq('id', -1);
const planla = s => admin.rpc('bildirim_planla_test', { p_simdi: tz(s) });
// Etkinlik: yükleme 12 Ekim 09.00 (İst) açılıyor, 13 Ekim 20.00 kapanıyor, oylama 15 Ekim 20.00
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: '2026-10-12', yukleme_baslar: tz('2026-10-12T06:00:00Z'),
  yukleme_biter: tz('2026-10-13T17:00:00Z'), oylama_biter: tz('2026-10-15T17:00:00Z'), kuran: A.id }).select('*').single()).data;
const [T1, T2] = (await admin.from('temalar').insert([{ etkinlik: E.id, ad: 'Sokak', sira: 1, bulusmada: false },
  { etkinlik: E.id, ad: 'Portre', sira: 2, bulusmada: false }]).select('id, ad, sira').order('sira')).data;
await temizle();
await planla('2026-10-12T06:03:00Z');
let q = await kuyruk();
bekle('yükleme açılınca abone her üyeye bir bildirim', q.filter(x => x.tur === 'yukleme_acildi').length === 3, JSON.stringify(q.map(x => x.tur)));
bekle('yükleme metni son yüklemeyi söylüyor', q.find(x => x.tur === 'yukleme_acildi')?.govde === 'Son yükleme: 13 Ekim 20.00', q[0]?.govde);
await planla('2026-10-12T06:08:00Z');
bekle('aynı bildirim iki kez sıraya girmiyor', (await kuyruk()).filter(x => x.tur === 'yukleme_acildi').length === 3);
// 12 saat kala (13 Ekim 08.00 İst): yalnız boş teması olan; Can iki temaya yükledi
for (const t of [T1, T2]) await admin.from('kareler').insert({ tema: t.id, sahip: C.id, dosya: `${E.id}/${t.id}/c.jpg`, genislik: 10, yukseklik: 10 });
await temizle();
await planla('2026-10-13T05:01:00Z');
q = (await kuyruk()).filter(x => x.tur === 'hatirlatma_yukleme');
bekle('yükleme hatırlatması yalnız boş teması olana', q.length === 2 && !q.some(x => x.kullanici === C.id), JSON.stringify(q.map(x => x.kullanici)));
bekle('hatırlatma metni', q[0]?.baslik === 'Yükleme 12 saat sonra kapanıyor' && q[0]?.govde === '2 temaya karen yok', JSON.stringify(q[0]));
// Yoklamada gelmedi olan hatırlatma almıyor
await admin.from('etkinlikler').update({ yoklama_at: tz('2026-10-12T10:00:00Z') }).eq('id', E.id);
await admin.from('yoklama').insert([{ etkinlik: E.id, uye: A.id }, { etkinlik: E.id, uye: C.id }]);
await temizle();
await planla('2026-10-13T15:01:00Z');   // 2 saat kala
q = (await kuyruk()).filter(x => x.tur === 'hatirlatma_yukleme');
bekle('yoklamada gelmedi olan hatırlatma almıyor', q.length === 1 && q[0].kullanici === A.id, JSON.stringify(q.map(x => x.kullanici)));
// Süre uzatılınca eski hatırlatma geçersiz, yenisine göre planlanıyor
await admin.from('etkinlikler').update({ yukleme_biter: tz('2026-10-14T17:00:00Z') }).eq('id', E.id);
await planla('2026-10-14T05:01:00Z');
bekle('uzatılan son tarihe göre yeni hatırlatma', (await kuyruk()).some(x => x.tur === 'hatirlatma_yukleme' && x.son_tarih === tz('2026-10-14T17:00:00Z').replace('.000Z', '+00:00')),
  JSON.stringify((await kuyruk()).map(x => x.son_tarih)));
// Gece kuralı
const g = async (s, h) => (await admin.rpc('gece_disi_test', { p: tz(s), p_hatirlatma: h })).data;
bekle('gündüz olduğu gibi', await g('2026-10-13T09:00:00Z', true) === tz('2026-10-13T09:00:00Z').replace('.000Z', '+00:00'));
bekle('gece hatırlatması önceki akşam 22.30', await g('2026-10-13T02:00:00Z', true) === '2026-10-12T19:30:00+00:00', await g('2026-10-13T02:00:00Z', true));
bekle('23.30 hatırlatması aynı akşam 22.30', await g('2026-10-12T20:30:00Z', true) === '2026-10-12T19:30:00+00:00');
bekle('gece aşama bildirimi 08.00', await g('2026-10-13T02:00:00Z', false) === '2026-10-13T05:00:00+00:00');
// Sabah 07.00 kapanan yükleme: 2 saatlik hatırlatma geceye düşüyor, önceki akşam 22.30'a kayıyor
const E2 = (await admin.from('etkinlikler').insert({ bulusma_gunu: '2026-10-20', yukleme_baslar: tz('2026-10-19T05:00:00Z'),
  yukleme_biter: tz('2026-10-21T04:00:00Z'), oylama_biter: tz('2026-10-23T17:00:00Z'), kuran: A.id }).select('*').single()).data;
await admin.from('temalar').insert({ etkinlik: E2.id, ad: 'Işık', sira: 1, bulusmada: false });
// 12 saat kala = 20 Ekim 19.00 (gündüz); 2 saat kala = 05.00 → 20 Ekim 22.30'a kayıyor
await temizle();
await planla('2026-10-20T19:31:00Z');   // 20 Ekim 22.31 İst
q = (await kuyruk()).filter(x => x.tur === 'hatirlatma_yukleme' && x.etkinlik === E2.id && x.kullanici === B.id);
bekle('3,5 saat önceki 12 saatlik hatırlatma geç gönderilmiyor, yalnız geceye kayan', q.length === 1, JSON.stringify(q.map(x => x.anahtar)));
bekle('geceye kayan hatırlatma gerçek kalan süreyi söylüyor (8 saat)', q[0]?.baslik === 'Yükleme 8 saat sonra kapanıyor', q[0]?.baslik);
// Sunucu durmuşsa: 10 saat önceki 12 saatlik geç gitmiyor, yalnız zamanı yeni gelen 2 saatlik
await temizle();
await planla('2026-10-14T15:40:00Z');   // E (uzatılmış, 14 Ekim 17.00Z): 12 saatlik 05.00Z'de, 2 saatlik 15.00Z'de
q = (await kuyruk()).filter(x => x.tur === 'hatirlatma_yukleme' && x.etkinlik === E.id && x.kullanici === A.id);   // B yoklamada gelmedi
bekle('sunucu durmuşsa eski hatırlatma geç gitmiyor, yalnız 2 saatlik', q.length === 1 && q[0].baslik === 'Yükleme 1 saat sonra kapanıyor', JSON.stringify(q.map(x => x.baslik)));
// Oy hatırlatması: yalnız oylaması zorunlu (kare vermiş) ve karesi kalan
await admin.from('kareler').insert({ tema: T1.id, sahip: B.id, dosya: `${E.id}/${T1.id}/b.jpg`, genislik: 10, yukseklik: 10 });
await temizle();
await planla('2026-10-15T05:01:00Z');   // oylamaya 12 saat
q = (await kuyruk()).filter(x => x.tur === 'hatirlatma_oy' && x.etkinlik === E.id);
bekle('oy hatırlatması yalnız zorunlu olup karesi kalana', q.length === 2 && !q.some(x => x.kullanici === A.id), JSON.stringify(q.map(x => x.kullanici)));
bekle('oy metni kalan kareyi söylüyor', q.find(x => x.kullanici === B.id)?.govde === '1 kare kaldı', JSON.stringify(q.map(x => x.govde)));
// Sonuç ve oylama açılışı
await temizle();
await planla('2026-10-15T17:04:00Z');
q = await kuyruk();
bekle('sonuçlar açıldı, birinci adı yok', q.some(x => x.tur === 'sonuc_acildi' && x.govde === 'Ekim etkinliğinin birincileri belli'), JSON.stringify(q.map(x => x.govde)));
await admin.from('etkinlikler').update({ serbest: true }).eq('id', E.id);
await temizle(); await planla('2026-10-15T17:04:00Z');
bekle('ekstra etkinlikte sonuç metni', (await kuyruk()).some(x => x.tur === 'sonuc_acildi' && x.govde === 'Ekstra etkinliğin birincileri belli'));
await admin.from('etkinlikler').update({ serbest: false }).eq('id', E.id);
// Son 6 saat sınırı
await temizle();
await planla('2026-10-16T17:04:00Z');
bekle('6 saatten eski aşama bildirim üretmiyor', (await kuyruk()).filter(x => x.tur === 'sonuc_acildi').length === 0);
// İptal edilen etkinlik
await admin.from('etkinlikler').update({ iptal: true }).eq('id', E2.id);
await temizle();
await planla('2026-10-20T19:31:00Z');
bekle('iptal edilen etkinlik bildirim üretmiyor', (await kuyruk()).filter(x => x.etkinlik === E2.id).length === 0);
// Yeni etkinlik
const E3 = (await admin.from('etkinlikler').insert({ bulusma_gunu: '2026-11-09', yukleme_baslar: tz('2026-11-09T06:00:00Z'),
  yukleme_biter: tz('2026-11-10T17:00:00Z'), oylama_biter: tz('2026-11-12T17:00:00Z'), kuran: A.id, olusturma: tz('2026-11-01T09:00:00Z') }).select('*').single()).data;
await admin.from('temalar').insert([{ etkinlik: E3.id, ad: 'Gece', sira: 1, bulusmada: true }, { etkinlik: E3.id, ad: 'Eller', sira: 2, bulusmada: false }]);
await temizle();
await planla('2026-11-01T09:03:00Z');
q = (await kuyruk()).filter(x => x.tur === 'yeni_etkinlik');
bekle('yeni etkinlik kurana değil diğer abonelere', q.length === 2 && !q.some(x => x.kullanici === A.id), JSON.stringify(q.map(x => x.kullanici)));
bekle('yeni etkinlik metni', q[0]?.baslik === 'Yeni etkinlik: 9 Kasım' && q[0]?.govde === 'Temalar: Gece, Eller', JSON.stringify(q[0]));
rapor();
