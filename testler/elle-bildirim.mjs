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
rapor();
