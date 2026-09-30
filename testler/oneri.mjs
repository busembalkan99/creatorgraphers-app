// Tema önerisi (kararlar 81, 82, 85, 89; 2026-09-30): sunucu kuralları
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
await sifirla();
const hata = r => r.error?.message ?? '';
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const K = {};
for (const [a, ad, e] of [['B', 'Barış Ak', 'baris'], ['C', 'Can Öz', 'can']]) {
  const k = await kullanici(`${e}@test.local`, ad); await admin.from('uyeler').insert({ id: k.id, ad, eposta: `${e}@test.local` }); K[a] = k;
}
let r = await K.B.c.rpc('oneri_birak', { p_ad: 'Gece', p_gerekce: 'Işıkların altında' });
bekle('öneri bırakılıyor', !r.error, hata(r));
r = await K.C.c.rpc('oneri_birak', { p_ad: '  gece ' });
let h = (await A.c.rpc('havuz')).data ?? [];
bekle('aynı tema birleşiyor, iki öneren', h.length === 1 && h[0].kac_kisi === 2 && /Barış Ak/.test(h[0].onerenler) && /Can Öz/.test(h[0].onerenler), JSON.stringify(h));
bekle('üye havuzu göremiyor', ((await K.B.c.rpc('havuz')).data ?? []).length === 0);
bekle('tablolar doğrudan okunamıyor', ((await K.B.c.from('tema_onerileri').select('*')).data ?? []).length === 0);
await K.B.c.rpc('oneri_birak', { p_ad: 'Eller' }); await K.B.c.rpc('oneri_birak', { p_ad: 'Su' });
r = await K.B.c.rpc('oneri_birak', { p_ad: 'Rüzgar' });
bekle('4. açık öneri reddediliyor', hata(r).includes('oneri_siniri'), hata(r));
r = await K.B.c.rpc('oneri_birak', { p_ad: 'Bu tema adı yirmi dört karakteri aşıyor' });
bekle('24 karakteri aşan ad reddediliyor', hata(r).includes('ad_gecersiz'), hata(r));
r = await K.B.c.rpc('oneri_birak', { p_ad: 'Kış', p_gerekce: 'x'.repeat(141) });
bekle('140 karakteri aşan gerekçe reddediliyor', !!r.error);
// Geri çekme: birleşik kalemde yalnız kendi adı düşüyor
const gece = h[0].id;
await K.C.c.rpc('oneri_geri_cek', { p_oneri: gece });
h = (await A.c.rpc('havuz')).data ?? [];
bekle('geri çekince yalnız kendi adı düşüyor', h.find(x => x.id === gece)?.kac_kisi === 1, JSON.stringify(h));
const su = h.find(x => x.ad === 'Su').id;
await K.B.c.rpc('oneri_geri_cek', { p_oneri: su });
bekle('tek önereni geri çekince kalem gidiyor', !((await A.c.rpc('havuz')).data ?? []).some(x => x.id === su));
r = await K.B.c.rpc('oneri_birak', { p_ad: 'Rüzgar' });
bekle('geri çekince yer açılıyor', !r.error, hata(r));
// Seçim: etkinlik kur, bağla
const ileri = new Date(Date.now() + 86400e3).toISOString();
const eid = (await A.c.rpc('etkinlik_kur', { p_bulusma: new Date(Date.now() + 86400e3).toISOString().slice(0, 10), p_yukleme_baslar: ileri,
  p_yukleme_saat: 24, p_oylama_saat: 48, p_temalar: [{ ad: 'Gece', bulusmada: true }, { ad: 'Kendi fikrim', bulusmada: false }], p_serbest: false })).data;
r = await K.B.c.rpc('onerileri_bagla', { p_etkinlik: eid, p_baglar: [{ oneri: gece, sira: 1 }] });
bekle('üye bağlayamıyor', !!r.error);
r = await A.c.rpc('onerileri_bagla', { p_etkinlik: eid, p_baglar: [{ oneri: gece, sira: 1 }] });
bekle('yönetici bağlıyor', !r.error, hata(r));
const benim = (await K.B.c.rpc('onerilerim')).data ?? [];
bekle('öneren "seçildi" görüyor, tarihle', benim.find(x => x.ad === 'Gece')?.durum === 'secildi' && !!benim.find(x => x.ad === 'Gece')?.bulusma_gunu, JSON.stringify(benim));
bekle('seçilen havuzdan çıktı', !((await A.c.rpc('havuz')).data ?? []).some(x => x.id === gece));
bekle('seçilen yer açtı: 3 açık öneri tekrar mümkün', !(await K.B.c.rpc('oneri_birak', { p_ad: 'Kapılar' })).error);
// Bildirim: öneren abone ise "Önerin seçildi"
await K.B.c.rpc('bildirim_abone_ol', { p_endpoint: 'https://push.example/b', p_p256dh: 'p', p_auth: 'a' });
const { execSync } = await import('node:child_process');
execSync(`docker exec -i supabase_db_creatorgraphers-app psql -U postgres -d postgres -v ON_ERROR_STOP=1`, { input: `select gizli.bildirim_planla();` });
const q = (await admin.from('bildirim_kuyrugu').select('*').eq('tur', 'oneri_secildi')).data ?? [];
bekle('önerin seçildi bildirimi', q.length === 1 && q[0].kullanici === K.B.id && /^Gece, \d+ \S+ buluşmasının teması\.$/.test(q[0].govde) && q[0].baslik === 'Önerin seçildi', JSON.stringify(q));
// İptal: seçilen havuza döner, elle yazılan "yönetici yazdı" olarak düşer
await A.c.rpc('etkinlik_iptal', { p_etkinlik: eid });
h = (await A.c.rpc('havuz')).data ?? [];
bekle('iptalde seçilen öneri havuza döndü', h.some(x => x.ad === 'Gece' && !x.elle && x.kac_kisi === 1), JSON.stringify(h));
bekle('iptalde elle yazılan tema havuza "yönetici yazdı"', h.some(x => x.ad === 'Kendi fikrim' && x.elle), JSON.stringify(h));
// Ekstra etkinliğin kendiliğinden adları havuza düşmüyor
const sid = (await A.c.rpc('etkinlik_kur', { p_bulusma: new Date(Date.now() + 86400e3).toISOString().slice(0, 10), p_yukleme_baslar: ileri,
  p_yukleme_saat: 24, p_oylama_saat: 48, p_temalar: [{ ad: 'Serbest', bulusmada: false }], p_serbest: true })).data;
await A.c.rpc('etkinlik_iptal', { p_etkinlik: sid });
bekle('iptal edilen ekstra etkinliğin temaları havuza düşmüyor', !((await A.c.rpc('havuz')).data ?? []).some(x => x.ad === 'Serbest'));
// Bekleme süresi: havuzdayken kurulan etkinlik sayısı
bekle('havuz "kaç etkinliktir" sayıyor', ((await A.c.rpc('havuz')).data ?? []).find(x => x.ad === 'Eller')?.bekledigi >= 0);
rapor();
