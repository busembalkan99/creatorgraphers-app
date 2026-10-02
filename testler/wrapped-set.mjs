// Wrapped seti (karar 126, 0024): yeni etkinlik sıradaki seti alıyor, kontakt → pano → klasik.
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const yeni = async (ek = {}) => (await admin.from('etkinlikler').insert({ bulusma_gunu: '2026-10-03', yukleme_baslar: saat(-50), yukleme_biter: saat(-40), oylama_biter: saat(-30), kuran: A.id, ...ek }).select('id, wrapped_set').single()).data;
// Eski etkinlik: sütun eklenmeden önce kurulmuş gibi
const eski = await yeni(); await admin.from('etkinlikler').update({ wrapped_set: null }).eq('id', eski.id);
const s1 = await yeni(), s2 = await yeni(), s3 = await yeni(), s4 = await yeni();
bekle('önceki boşsa (eski etkinlik) ilk yeni etkinlik kontakt', s1.wrapped_set === 'kontakt', JSON.stringify(s1));
bekle('sırayla: kontakt → pano → klasik → kontakt', [s2, s3, s4].map(x => x.wrapped_set).join() === 'pano,klasik,kontakt', JSON.stringify([s2, s3, s4]));
const ip = await yeni(); await admin.from('etkinlikler').update({ iptal: true }).eq('id', ip.id);
const s5 = await yeni();
bekle('iptal edilen etkinliğin seti atlanmıyor, yeniden veriliyor', ip.wrapped_set === 'pano' && s5.wrapped_set === 'pano', JSON.stringify([ip, s5]));
const ser = await yeni({ serbest: true });
bekle('ekstra etkinlik de sıraya giriyor', ser.wrapped_set === 'klasik', JSON.stringify(ser));
const elle = await yeni({ wrapped_set: 'pano' });
bekle('açıkça verilen set korunuyor', elle.wrapped_set === 'pano', JSON.stringify(elle));
const r = await admin.from('etkinlikler').insert({ bulusma_gunu: '2026-10-03', yukleme_baslar: saat(1), yukleme_biter: saat(2), oylama_biter: saat(3), kuran: A.id, wrapped_set: 'polaroid' });
bekle('bilinmeyen set reddediliyor', !!r.error, JSON.stringify(r.error));
await B.c.from('etkinlikler').update({ wrapped_set: 'klasik' }).eq('id', s1.id);
bekle('üye seti değiştiremiyor', (await admin.from('etkinlikler').select('wrapped_set').eq('id', s1.id).single()).data.wrapped_set === 'kontakt');
const k = await A.c.rpc('etkinlik_kur', { p_bulusma: '2026-12-05', p_yukleme_baslar: saat(48), p_yukleme_saat: 24, p_oylama_saat: 48, p_temalar: [{ ad: 'Sokak', bulusmada: true }], p_serbest: false });
const kurulan = k.data ? (await admin.from('etkinlikler').select('wrapped_set').eq('id', k.data).single()).data : null;
bekle('etkinlik_kur ile kurulan da set alıyor', !k.error && ['kontakt', 'pano', 'klasik'].includes(kurulan?.wrapped_set), JSON.stringify(k.error ?? kurulan));
rapor();
