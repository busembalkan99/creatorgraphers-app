// dosya_izni (0025, karar 127): depo kurallarının birebir aktarımı. Kova yok, yalnız kurallar.
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
await sifirla();
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
const C = await kullanici('can@test.local', 'Can Öz');   // üye değil
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: new Date().toISOString().slice(0, 10), yukleme_baslar: saat(-2), yukleme_biter: saat(20), oylama_biter: saat(44), kuran: A.id }).select('id').single()).data.id;
const T = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: false }).select('id').single()).data.id;
const izin = async (U, yollar, is) => (await U.c.rpc('dosya_izni', { p_yollar: yollar, p_islem: is })).data ?? [];
const yA = `${E}/${T}/${crypto.randomUUID()}.jpg`, yAk = yA.replace(/\.jpg$/, '.k.jpg');
bekle('yükleme aşamasında üye kendi klasörüne yükleyebilir', (await izin(A, [yA, yAk], 'yukle')).length === 2);
bekle('üye olmayan yükleyemez', (await izin(C, [yA], 'yukle')).length === 0);
bekle('yanlış klasör (başka tema) reddediliyor', (await izin(A, [`${E}/${crypto.randomUUID()}/x.jpg`], 'yukle')).length === 0);
bekle('jpg dışı ad reddediliyor', (await izin(A, [`${E}/${T}/x.png`], 'yukle')).length === 0);
await A.c.rpc('dosya_kaydet', { p_yol: yA, p_boyut: 1000 }); await A.c.rpc('dosya_kaydet', { p_yol: yAk, p_boyut: 100 });
bekle('başkasının yolunu ele geçiremez', (await izin(B, [yA], 'yukle')).length === 0 && !!(await B.c.rpc('dosya_kaydet', { p_yol: yA, p_boyut: 1 })).error);
bekle('8 MB üstü kaydedilmiyor', /buyuk/.test((await A.c.rpc('dosya_kaydet', { p_yol: `${E}/${T}/${crypto.randomUUID()}.jpg`, p_boyut: 8388609 })).error?.message ?? ''));
bekle('yüklemede sahibi okuyabilir, başkası okuyamaz', (await izin(A, [yA, yAk], 'oku')).length === 2 && (await izin(B, [yA], 'oku')).length === 0);
bekle('sıra korunuyor, yalnız izinliler', JSON.stringify(await izin(A, ['yok/yok/yok.jpg', yA], 'oku')) === JSON.stringify([yA]));
// Oylama: üyeler okuyabiliyor, üye olmayan okuyamıyor
await admin.from('etkinlikler').update({ yukleme_biter: saat(-1) }).eq('id', E);
bekle('oylamada üye okuyabilir', (await izin(B, [yA, yAk], 'oku')).length === 2);
bekle('üye olmayan oylamada okuyamaz', (await izin(C, [yA], 'oku')).length === 0);
bekle('oylamada yükleme yok', (await izin(A, [`${E}/${T}/${crypto.randomUUID()}.jpg`], 'yukle')).length === 0);
// Toplu çıkarılan: oylamada başkasına kapalı, önizlemesi de (0020), sahibine açık
const k = (await admin.from('kareler').insert({ tema: T, sahip: A.id, dosya: yA, genislik: 1, yukseklik: 1 }).select('id').single()).data.id;
await admin.from('diskalifiye').insert({ kare: k, neden: 'Gelmedi', eden: A.id, toplu: true });
bekle('toplu çıkarılan oylamada başkasına kapalı, önizlemesi de', (await izin(B, [yA, yAk], 'oku')).length === 0);
bekle('sahibi toplu çıkarılan karesini görüyor', (await izin(A, [yA], 'oku')).length === 1);
// Silme: yalnız sahibi
bekle('başkası silemez', (await izin(B, [yA], 'sil')).length === 0);
bekle('sahibi silebilir', (await izin(A, [yA, yAk], 'sil')).length === 2);
bekle('silme kaydı yalnız izinli satırları siliyor', JSON.stringify((await B.c.rpc('dosya_kaydi_sil', { p_yollar: [yA] })).data) === '[]');
bekle('oturumsuz çağrılamıyor', !!(await (await import('./ortak.mjs')).istemci().rpc('dosya_izni', { p_yollar: [yA], p_islem: 'oku' })).error);
rapor();
