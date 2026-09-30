// Bildirim altyapısı, sunucu kuralları (karar 120). Yerel veritabanı; zaman p_simdi ile simüle.
import { admin, istemci, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
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
rapor();
