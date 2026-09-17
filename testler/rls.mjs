// Sunucu kuralları: istemcinin atlatmaya çalışabileceği her şey.
import fs from 'node:fs';
import { admin, istemci, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const hata = r => r.error?.message ?? '';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
const B = await kullanici('selin@test.local', 'selo_1999');
const C = await kullanici('yabanci@test.local', 'Yabancı');
const anon = istemci();

// Kurulum
bekle('kurucu yokken kurucu_var false', (await A.c.rpc('kurucu_var')).data === false);
bekle('anonim kulubu_kur çağıramaz', !!(await anon.rpc('kulubu_kur', { p_ad: 'X' })).error);
bekle('A kulübü kurar', !(await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' })).error);
bekle('ikinci kurucu olamaz', hata(await C.c.rpc('kulubu_kur', { p_ad: 'Yabancı' })).includes('kurucu_var'));

// Üye olmayanın görebildikleri
bekle('üye olmayan etkinlik göremez', ((await C.c.from('etkinlikler').select('*')).data ?? []).length === 0);
bekle('üye olmayan üye listesi göremez', ((await C.c.from('uyeler').select('id, ad')).data ?? []).length === 0);
bekle('anonim üye listesi göremez', !!(await anon.from('uyeler').select('id')).error || ((await anon.from('uyeler').select('id')).data ?? []).length === 0);
bekle('ben() üye olmayana boş', ((await C.c.rpc('ben')).data ?? []).length === 0);

// İstek
bekle('başkası adına istek bırakılamaz', !!(await C.c.from('istekler').insert({ kullanici: B.id, eposta: 'selin@test.local', ad: 'Sahte' })).error);
bekle('başka e-postayla istek bırakılamaz', !!(await B.c.from('istekler').insert({ kullanici: B.id, eposta: 'baska@test.local', ad: 'Selin' })).error);
bekle('onaylı durumla istek bırakılamaz', !!(await B.c.from('istekler').insert({ kullanici: B.id, eposta: 'selin@test.local', ad: 'Selin', durum: 'onay' })).error);
const i1 = await B.c.from('istekler').insert({ kullanici: B.id, eposta: 'selin@test.local', ad: 'Selin Arı', notu: 'Ayşe çağırdı' }).select('id').single();
bekle('B istek bırakır', !i1.error, hata(i1));
bekle('aynı anda ikinci bekleyen istek olmaz', !!(await B.c.from('istekler').insert({ kullanici: B.id, eposta: 'selin@test.local', ad: 'Selin Arı' })).error);
bekle('B kendi isteğini onaylayamaz (update yok)', ((await B.c.from('istekler').update({ durum: 'onay' }).eq('id', i1.data.id).select()).data ?? []).length === 0);
bekle('üye olmayan istek_karar çağıramaz', hata(await C.c.rpc('istek_karar', { p_istek: i1.data.id, p_onay: true })).includes('yetki_yok'));
bekle('C, B nin isteğini göremez', ((await C.c.from('istekler').select('*')).data ?? []).length === 0);
const bek = await A.c.rpc('bekleyen_istekler');
bekle('A bekleyen isteği görür', bek.data?.length === 1 && bek.data[0].onceki_red == 0, JSON.stringify(bek));
bekle('A reddeder', !(await A.c.rpc('istek_karar', { p_istek: i1.data.id, p_onay: false })).error);
bekle('aynı istek ikinci kez karara bağlanamaz', hata(await A.c.rpc('istek_karar', { p_istek: i1.data.id, p_onay: true })).includes('istek_yok'));
const i2 = await B.c.from('istekler').insert({ kullanici: B.id, eposta: 'selin@test.local', ad: 'Selin Arı', notu: 'Tekrar' }).select('id').single();
bekle('reddedilen tekrar ister', !i2.error, hata(i2));
bekle('kartta önceki ret sayısı 1', (await A.c.rpc('bekleyen_istekler')).data?.[0]?.onceki_red == 1);
bekle('A onaylar', !(await A.c.rpc('istek_karar', { p_istek: i2.data.id, p_onay: true })).error);
const benB = (await B.c.rpc('ben')).data?.[0];
bekle('B üye oldu, rolü üye', benB?.rol === 'uye' && benB?.ad === 'Selin Arı', JSON.stringify(benB));
bekle('üye olan istek bırakamaz', !!(await B.c.from('istekler').insert({ kullanici: B.id, eposta: 'selin@test.local', ad: 'Selin' })).error);

// Üye gizliliği ve roller
bekle('üye başkasının e-postasını okuyamaz', !!(await B.c.from('uyeler').select('eposta')).error);
bekle('üye ad ve rolü okur', ((await B.c.from('uyeler').select('id, ad, rol')).data ?? []).length === 2);
bekle('üye uye_listesi ile e-posta alamaz', ((await B.c.rpc('uye_listesi')).data ?? []).length === 0);
bekle('yönetici uye_listesi ile e-posta görür', (await A.c.rpc('uye_listesi')).data?.[1]?.eposta === 'selin@test.local');
bekle('üye kendi rolünü yükseltemez', !!(await B.c.from('uyeler').update({ rol: 'kurucu' }).eq('id', B.id)).error);
bekle('üye kendi adını değiştiremez', !!(await B.c.from('uyeler').update({ ad: 'Hacker' }).eq('id', B.id)).error);
await B.c.from('uyeler').update({ afis_izni: false }).eq('id', A.id);
bekle('üye başkasının afiş iznini değiştiremez', (await A.c.rpc('ben')).data?.[0]?.afis_izni === true);
bekle('üye kendi afiş iznini değiştirir', !(await B.c.from('uyeler').update({ afis_izni: false }).eq('id', B.id)).error && (await B.c.rpc('ben')).data?.[0]?.afis_izni === false);
bekle('üye rol_degistir çağıramaz', hata(await B.c.rpc('rol_degistir', { p_uye: B.id, p_yonetici: true })).includes('yetki_yok'));
bekle('üye etkinlik kuramaz', hata(await B.c.rpc('etkinlik_kur', { p_bulusma: '2026-09-19', p_yukleme_baslar: new Date().toISOString(), p_yukleme_saat: 48, p_oylama_saat: 72, p_temalar: [{ ad: 'X' }] })).includes('yetki_yok'));
bekle('üye doğrudan etkinlik ekleyemez', !!(await B.c.from('etkinlikler').insert({ bulusma_gunu: '2026-09-19', yukleme_baslar: new Date().toISOString(), yukleme_biter: new Date(Date.now() + 1e6).toISOString(), oylama_biter: new Date(Date.now() + 2e6).toISOString(), kuran: B.id })).error);

// Etkinlik
const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
bekle('4 tema reddedilir', hata(await A.c.rpc('etkinlik_kur', { p_bulusma: bugun, p_yukleme_baslar: new Date(Date.now() - 60000).toISOString(), p_yukleme_saat: 48, p_oylama_saat: 72, p_temalar: [{ ad: 'a' }, { ad: 'b' }, { ad: 'c' }, { ad: 'd' }] })).includes('tema_sayisi'));
const ek = await A.c.rpc('etkinlik_kur', { p_bulusma: bugun, p_yukleme_baslar: new Date(Date.now() - 60000).toISOString(), p_yukleme_saat: 48, p_oylama_saat: 72, p_temalar: [{ ad: 'Sokak', bulusmada: true }, { ad: 'Portre', bulusmada: false }] });
bekle('A etkinlik kurar', !ek.error, hata(ek));
const E = ek.data;
bekle('açıkken ikinci etkinlik kurulamaz', hata(await A.c.rpc('etkinlik_kur', { p_bulusma: bugun, p_yukleme_baslar: new Date().toISOString(), p_yukleme_saat: 48, p_oylama_saat: 72, p_temalar: [{ ad: 'x' }] })).includes('acik_etkinlik_var'));
const tm = (await B.c.from('temalar').select('*').eq('etkinlik', E).order('sira')).data;
const [SOKAK, PORTRE] = tm;

// Kareler
const dosya = async (c, yol) => c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
const yeniYol = async (c, e, t) => { const y = `${e}/${t}/${crypto.randomUUID()}.jpg`; const r = await dosya(c, y); if (r.error) throw r.error; return y; };
const yA = `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`;
bekle('A dosya yükler', !(await dosya(A.c, yA)).error);
bekle('A kare kaydı (doğru gün)', !(await A.c.from('kareler').insert({ tema: SOKAK.id, sahip: A.id, dosya: yA, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun })).error);
const yB = `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`;
await dosya(B.c, yB);
bekle('sunucu yanlış günü reddeder', hata(await B.c.from('kareler').insert({ tema: SOKAK.id, sahip: B.id, dosya: yB, genislik: 10, yukseklik: 10, cekim_gunu: '2026-08-03' })).includes('tarih_tutmuyor'));
bekle('sunucu tarihsizi reddeder', hata(await B.c.from('kareler').insert({ tema: SOKAK.id, sahip: B.id, dosya: yB, genislik: 10, yukseklik: 10, cekim_gunu: null })).includes('tarih_yok'));
const dun = new Date(Date.parse(bugun) - 86400000).toISOString().slice(0, 10);
bekle('bir gün önce kabul', !(await B.c.from('kareler').insert({ tema: SOKAK.id, sahip: B.id, dosya: yB, genislik: 10, yukseklik: 10, cekim_gunu: dun })).error);
const iki = new Date(Date.parse(bugun) + 2 * 86400000).toISOString().slice(0, 10);
bekle('iki gün sonra reddedilir (değiştirme)', hata(await B.c.from('kareler').update({ cekim_gunu: iki }).eq('tema', SOKAK.id).eq('sahip', B.id)).includes('tarih_tutmuyor'));
bekle('aynı temaya ikinci kare yok', !!(await B.c.from('kareler').insert({ tema: SOKAK.id, sahip: B.id, dosya: await yeniYol(B.c, E, SOKAK.id), genislik: 1, yukseklik: 1, cekim_gunu: bugun })).error);
bekle('olmayan dosya yolu reddedilir', hata(await B.c.from('kareler').insert({ tema: PORTRE.id, sahip: B.id, dosya: `${E}/${PORTRE.id}/${crypto.randomUUID()}.jpg`, genislik: 1, yukseklik: 1 })).includes('dosya_yok'));
bekle('başkasının dosya yolu reddedilir', hata(await B.c.from('kareler').insert({ tema: PORTRE.id, sahip: B.id, dosya: await yeniYol(A.c, E, PORTRE.id), genislik: 1, yukseklik: 1 })).includes('dosya_yok'));
bekle('başka temanın klasöründeki dosya reddedilir', hata(await B.c.from('kareler').insert({ tema: PORTRE.id, sahip: B.id, dosya: await yeniYol(B.c, E, SOKAK.id), genislik: 1, yukseklik: 1 })).includes('dosya_yok'));
bekle('serbest temada tarihsiz kabul', !(await B.c.from('kareler').insert({ tema: PORTRE.id, sahip: B.id, dosya: await yeniYol(B.c, E, PORTRE.id), genislik: 1, yukseklik: 1, cekim_gunu: null })).error);
bekle('kare başka temaya taşınamaz', hata(await B.c.from('kareler').update({ tema: SOKAK.id }).eq('tema', PORTRE.id).eq('sahip', B.id)).includes('tema_degismez'));
bekle('kayıt başkasının dosyasına çevrilemez', hata(await B.c.from('kareler').update({ dosya: yA }).eq('tema', PORTRE.id).eq('sahip', B.id)).includes('dosya_yok'));
bekle('başkası adına kare eklenemez', !!(await B.c.from('kareler').insert({ tema: PORTRE.id, sahip: A.id, dosya: `${E}/z.jpg`, genislik: 1, yukseklik: 1 })).error);
bekle('B, A nın karesini göremez', ((await B.c.from('kareler').select('*')).data ?? []).every(k => k.sahip === B.id));
bekle('yönetici de başkasının karesini göremez', ((await A.c.from('kareler').select('*')).data ?? []).every(k => k.sahip === A.id));
bekle('B, A nın dosyasını indiremez', !!(await B.c.storage.from('kareler').download(yA)).error);
bekle('B, A nın dosyasına imzalı link alamaz', !!(await B.c.storage.from('kareler').createSignedUrl(yA, 60)).error);
await B.c.storage.from('kareler').remove([yA]);
bekle('B, A nın dosyasını silemez', !(await A.c.storage.from('kareler').download(yA)).error);
bekle('B, A nın karesini silemez', (await B.c.from('kareler').delete().eq('dosya', yA).select()).data?.length === 0);
bekle('yabancı dosya yükleyemez', !!(await dosya(C.c, `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`)).error);
bekle('anonim dosya yükleyemez', !!(await dosya(anon, `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`)).error);
bekle('PNG kabul edilmez', !!(await B.c.storage.from('kareler').upload(`${E}/${SOKAK.id}/${crypto.randomUUID()}.png`, Buffer.from('x'), { contentType: 'image/png' })).error);
const say = (await A.c.rpc('yukleme_sayilari', { p_etkinlik: E })).data;
bekle('yönetici sayıları görür (Sokak 2, Portre 1)', say?.find(r => r.tema === SOKAK.id)?.adet == 2 && say?.find(r => r.tema === PORTRE.id)?.adet == 1, JSON.stringify(say));
bekle('yabancı sayıları göremez', ((await C.c.rpc('yukleme_sayilari', { p_etkinlik: E })).data ?? []).length === 0);

// Aşama
const once = (await A.c.from('etkinlikler').select('*').eq('id', E).single()).data;
bekle('üye uzatamaz', hata(await B.c.rpc('yukleme_uzat', { p_etkinlik: E, p_saat: 24 })).includes('yetki_yok'));
await A.c.rpc('yukleme_uzat', { p_etkinlik: E, p_saat: 24 });
const sonra = (await A.c.from('etkinlikler').select('*').eq('id', E).single()).data;
bekle('uzatma 24 saat ekler', Date.parse(sonra.yukleme_biter) - Date.parse(once.yukleme_biter) === 86400000);
bekle('üye doğrudan etkinliği değiştiremez', ((await B.c.from('etkinlikler').update({ yukleme_biter: new Date().toISOString() }).eq('id', E).select()).data ?? []).length === 0);
bekle('A oylamayı açar', !(await A.c.rpc('oylamayi_ac', { p_etkinlik: E })).error);
const acildi = (await A.c.from('etkinlikler').select('*').eq('id', E).single()).data;
bekle('oylama süresi korunur (72 saat)', Math.abs(Date.parse(acildi.oylama_biter) - Date.parse(acildi.yukleme_biter) - 72 * 3600000) < 5000);
bekle('oylamada kare eklenemez', hata(await A.c.from('kareler').insert({ tema: PORTRE.id, sahip: A.id, dosya: `${E}/q.jpg`, genislik: 1, yukseklik: 1 })).includes('yukleme_kapali'));
bekle('oylamada kare silinemez', hata(await B.c.from('kareler').delete().eq('tema', SOKAK.id)).includes('yukleme_kapali'));
bekle('oylamada dosya yüklenemez', !!(await dosya(B.c, `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`)).error);
bekle('oylamada iptal edilemez', hata(await A.c.rpc('etkinlik_iptal', { p_etkinlik: E })).includes('iptal_olmaz'));

// İptal (yükleme açıkken, kareler silinir)
await admin.from('etkinlikler').update({ oylama_biter: new Date(Date.now() - 1000).toISOString(), yukleme_biter: new Date(Date.now() - 2000).toISOString() }).eq('id', E);
const ek2 = await A.c.rpc('etkinlik_kur', { p_bulusma: bugun, p_yukleme_baslar: new Date(Date.now() - 60000).toISOString(), p_yukleme_saat: 48, p_oylama_saat: 72, p_temalar: [{ ad: 'Gece' }] });
bekle('önceki bitince yeni etkinlik kurulur', !ek2.error, hata(ek2));
const G = (await A.c.from('temalar').select('id').eq('etkinlik', ek2.data).single()).data;
const gk = await B.c.from('kareler').insert({ tema: G.id, sahip: B.id, dosya: await yeniYol(B.c, ek2.data, G.id), genislik: 1, yukseklik: 1, cekim_gunu: bugun });
bekle('yeni etkinliğe kare eklenir', !gk.error, hata(gk));
bekle('üye iptal edemez', hata(await B.c.rpc('etkinlik_iptal', { p_etkinlik: ek2.data })).includes('yetki_yok'));
bekle('A iptal eder', !(await A.c.rpc('etkinlik_iptal', { p_etkinlik: ek2.data })).error);
bekle('iptal öncesi 1 kare var, sonra 0', !gk.error && ((await admin.from('kareler').select('id').eq('tema', G.id)).data ?? []).length === 0);

// Kurucu yönetici yapar
bekle('kurucu B yi yönetici yapar', !(await A.c.rpc('rol_degistir', { p_uye: B.id, p_yonetici: true })).error && (await B.c.rpc('ben')).data?.[0]?.rol === 'yonetici');
bekle('yönetici rol veremez (yalnız kurucu)', hata(await B.c.rpc('rol_degistir', { p_uye: B.id, p_yonetici: false })).includes('yetki_yok'));
bekle('kurucu kendini düşüremez', !(await A.c.rpc('rol_degistir', { p_uye: A.id, p_yonetici: false })).error && (await A.c.rpc('ben')).data?.[0]?.rol === 'kurucu');
bekle('yönetici bekleyen istekleri görür', !(await B.c.rpc('bekleyen_istekler')).error);
await A.c.rpc('rol_degistir', { p_uye: B.id, p_yonetici: false });

// ---------------------------------------------------------------- oylama
await sifirla();
const A2 = await kullanici('kurucu@test.local', 'Ayşe Kaya');
const B2 = await kullanici('selin@test.local', 'Selin Arı');
await A2.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const iX = await B2.c.from('istekler').insert({ kullanici: B2.id, eposta: 'selin@test.local', ad: 'Selin Arı' }).select('id').single();
await A2.c.rpc('istek_karar', { p_istek: iX.data.id, p_onay: true });
const bugun2 = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const E2 = (await A2.c.rpc('etkinlik_kur', { p_bulusma: bugun2, p_yukleme_baslar: new Date(Date.now() - 60000).toISOString(), p_yukleme_saat: 48, p_oylama_saat: 72, p_temalar: [{ ad: 'Sokak', bulusmada: true }, { ad: 'Portre', bulusmada: false }] })).data;
const tm2 = (await A2.c.from('temalar').select('*').eq('etkinlik', E2).order('sira')).data;
const [S2, P2] = tm2;
const kare = async (kisi, tema, gun) => {
  const yol = `${E2}/${tema}/${crypto.randomUUID()}.jpg`;
  await kisi.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const r = await kisi.c.from('kareler').insert({ tema, sahip: kisi.id, dosya: yol, genislik: 10, yukseklik: 10, cekim_gunu: gun,
    kamera: 'NIKON Z 6_2', objektif: '35mm f/1.8', odak: '35mm', diyafram: 'f/2.8', enstantane: '1/250', iso: '400' }).select('id, dosya').single();
  if (r.error) throw r.error;
  return r.data;
};
const kA = await kare(A2, S2.id, bugun2);
const kB = await kare(B2, S2.id, bugun2);
const kBp = await kare(B2, P2.id, null);
bekle('yükleme açıkken oy verilemez', hata(await B2.c.from('oylar').insert({ kare: kA.id, veren: B2.id, puan: 7 })).includes('oylama_kapali'));
bekle('yükleme açıkken oylama listesi boş', ((await B2.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? []).length === 0);
await A2.c.rpc('oylamayi_ac', { p_etkinlik: E2 });
const listeB = (await B2.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [];
bekle('oylamada kendi karesi listede yok', listeB.length === 1 && listeB[0].id === kA.id, JSON.stringify(listeB.map(x => x.id)));
bekle('listede sahip bilgisi yok', listeB[0] && !('sahip' in listeB[0]), JSON.stringify(Object.keys(listeB[0] ?? {})));
const listeA = (await A2.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [];
bekle('A iki kareyi görür (B nin iki karesi)', listeA.length === 2);
bekle('yabancı oylama listesi göremez', ((await C.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? []).length === 0);
bekle('oylamada başkasının karesi doğrudan okunamaz', ((await B2.c.from('kareler').select('*')).data ?? []).every(k => k.sahip === B2.id));
bekle('oylamada dosya indirilebilir (isimsiz)', !(await B2.c.storage.from('kareler').download(kA.dosya)).error);
bekle('yabancı dosyayı indiremez', !!(await C.c.storage.from('kareler').download(kA.dosya)).error);
bekle('kendi karene puan verilemez', hata(await A2.c.from('oylar').insert({ kare: kA.id, veren: A2.id, puan: 9 })).includes('kendi_karen'));
bekle('0 puan kabul edilmez', !!(await B2.c.from('oylar').insert({ kare: kA.id, veren: B2.id, puan: 0 })).error);
bekle('11 puan kabul edilmez', !!(await B2.c.from('oylar').insert({ kare: kA.id, veren: B2.id, puan: 11 })).error);
bekle('başkası adına oy verilemez', hata(await B2.c.from('oylar').insert({ kare: kA.id, veren: A2.id, puan: 5 })).includes('baska_veren'));
bekle('B oy verir', !(await B2.c.from('oylar').insert({ kare: kA.id, veren: B2.id, puan: 7 })).error);
bekle('puan değiştirilebilir (karar 37)', !(await B2.c.from('oylar').upsert({ kare: kA.id, veren: B2.id, puan: 9 }, { onConflict: 'kare,veren' })).error);
bekle('kendi puanını görür', (await B2.c.from('oylar').select('*')).data?.[0]?.puan === 9);
bekle('başkasının puanını göremez', ((await A2.c.from('oylar').select('*')).data ?? []).length === 0);
bekle('liste kendi puanını taşır', ((await B2.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [])[0]?.puan === 9);
const durB = (await B2.c.rpc('oylama_durumu', { p_etkinlik: E2 })).data ?? [];
const sokakB = durB.find(d => d.tema === S2.id), portreB = durB.find(d => d.tema === P2.id);
bekle('durum: Sokak zorunlu, 1/1', sokakB?.zorunlu === true && Number(sokakB?.toplam) === 1 && Number(sokakB?.puanladigim) === 1, JSON.stringify(durB));
bekle('durum: Portre de zorunlu (karesi var), 0/0', portreB?.zorunlu === true && Number(portreB?.toplam) === 0, JSON.stringify(portreB));
const durA = (await A2.c.rpc('oylama_durumu', { p_etkinlik: E2 })).data ?? [];
bekle('karesi olmayan temada zorunlu değil', durA.find(d => d.tema === P2.id)?.zorunlu === false && Number(durA.find(d => d.tema === P2.id)?.toplam) === 1, JSON.stringify(durA));
bekle('oylamada kare silinemez', hata(await B2.c.from('kareler').delete().eq('id', kBp.id)).includes('yukleme_kapali'));
// sonuç aşamasına geç
// Sıra kişiye göre karışık ve kişi için sabit (yükleme sırası avantaj olmasın)
let karisikKareler = [];
{
  // dört ayrı kişi, çünkü bir kişi bir temaya tek kare veriyor (karar 3)
  karisikKareler = [];
  for (let i = 0; i < 4; i++) {
    const posta = `karisik${i}@test.local`;
    const { data: l } = await admin.auth.admin.listUsers();
    const k = l.users.find(u => u.email === posta)
      ?? (await admin.auth.admin.createUser({ email: posta, password: 'test-sifre-1', email_confirm: true })).data.user;
    await admin.from('uyeler').insert({ id: k.id, ad: `Karışık ${i}`, eposta: posta });
    const yol = `${E2}/${P2.id}/${crypto.randomUUID()}.jpg`;
    await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
    const r = await admin.from('kareler').insert({ tema: P2.id, sahip: k.id, dosya: yol, genislik: 10, yukseklik: 10 }).select('id').single();
    if (r.error) throw r.error;
    karisikKareler.push(r.data.id);
  }
  const sira = async k => ((await k.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? []).filter(x => x.tema === P2.id).map(x => x.id).join(',');
  const a1 = await sira(A2.c), a2 = await sira(A2.c), b1 = await sira(B2.c);
  bekle('sıra aynı kişide sabit', a1 === a2 && a1.split(',').length >= 4, a1);
  bekle('sıra kişiden kişiye farklı', a1 !== b1, `A: ${a1}\nB: ${b1}`);
}
// Sonuç maskesini sınamak için gerçek puanlar: sıralamaya girmeyen karelerde de puan olsun
await B2.c.from('oylar').insert({ kare: karisikKareler[0], veren: B2.id, puan: 9 });
await B2.c.from('oylar').insert({ kare: karisikKareler[1], veren: B2.id, puan: 8 });
await A2.c.from('oylar').insert({ kare: kBp.id, veren: A2.id, puan: 6 });
// en son yüklenen kareye daha yüksek puan: galeri sırası testi sıra ile yükleme sırasını ayırt edebilsin
await B2.c.from('oylar').insert({ kare: karisikKareler[3], veren: B2.id, puan: 7 });
bekle('oylama sürerken sonuçlar kapalı', ((await A2.c.rpc('sonuc_kareleri', { p_etkinlik: E2 })).data ?? []).length === 0);
{
  const satir = ((await B2.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [])[0] ?? {};
  bekle('oylama listesi kimliğe dair hiçbir alan taşımıyor',
    Object.keys(satir).length > 0
    && !('sahip' in satir) && !('sahip_ad' in satir) && !('kamera' in satir) && !('objektif' in satir) && !('ortalama' in satir),
    JSON.stringify(Object.keys(satir)));
}

await admin.from('etkinlikler').update({ yukleme_biter: new Date(Date.now() - 2000).toISOString(), oylama_biter: new Date(Date.now() - 1000).toISOString() }).eq('id', E2);
bekle('etkinlik sonuç aşamasında', (await B2.c.rpc('etkinlik_asamasi', { p_etkinlik: E2 })).data === 'sonuc');
bekle('oylama kapanınca puan değişmez', hata(await B2.c.from('oylar').upsert({ kare: kA.id, veren: B2.id, puan: 3 }, { onConflict: 'kare,veren' })).includes('oylama_kapali'));
bekle('anonim oylama listesi alamaz', ((await anon.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? []).length === 0 || !!(await anon.rpc('oylama_kareleri', { p_etkinlik: E2 })).error);
bekle('anonim oy tablosunu okuyamaz', !!(await anon.from('oylar').select('*')).error || ((await anon.from('oylar').select('*')).data ?? []).length === 0);
bekle('yabancı tema durumunu göremez', ((await C.c.rpc('oylama_durumu', { p_etkinlik: E2 })).data ?? []).length === 0);
{
  const r = await B2.c.from('oylar').insert({ kare: '00000000-0000-0000-0000-000000000000', veren: B2.id, puan: 5 });
  bekle('olmayan kareye oy verilemez', hata(r).includes('kare_yok') || r.error?.code === '23503', JSON.stringify(r.error));
}
bekle('kendi oyunu silemez', ((await B2.c.from('oylar').delete().eq('kare', kA.id).select()).data ?? []).length === 0 && ((await admin.from('oylar').select('kare').eq('kare', kA.id)).data ?? []).length === 1);
bekle('sonuçta dosya hâlâ indirilebilir', !(await B2.c.storage.from('kareler').download(kA.dosya)).error);
bekle('sonuçta yabancı hâlâ indiremez', !!(await C.c.storage.from('kareler').download(kA.dosya)).error);
{
  const l = (await B2.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? [];
  bekle('sonuçta A nın karesi listede, B nin kendi karesi değil',
    l.some(x => x.id === kA.id) && !l.some(x => x.id === kB.id), JSON.stringify(l.map(x => x.id)));
}


// ---------------------------------------------------------------- sonuçlar
{
  // E2 sonuç aşamasında: Portre'de 5 kare var (B + dört "Karışık"), Sokak'ta kA ve kB
  const sonucA = (await A2.c.rpc('sonuc_kareleri', { p_etkinlik: E2 })).data ?? [];
  const sonucB = (await B2.c.rpc('sonuc_kareleri', { p_etkinlik: E2 })).data ?? [];
  bekle('sonuçta bütün kareler görünüyor', sonucA.length === 7, String(sonucA.length));
  bekle('sonuçta isimler açık', sonucA.every(k => !!k.sahip_ad), JSON.stringify(sonucA.map(k => k.sahip_ad)));
  const kAs = sonucA.find(k => k.id === kA.id);
  bekle('kendi karen işaretli', kAs?.benim === true && sonucB.find(k => k.id === kA.id)?.benim === false);
  bekle('oy alan karenin ortalaması var', Number(kAs?.ortalama) === 9 && Number(kAs?.oy_sayisi) === 1, JSON.stringify(kAs));
  bekle('makine bilgisi sonuçta açılıyor', !!kAs?.kamera, String(kAs?.kamera));
  // Portre: 5 kare, karar 19 → round(5/2,5)=2 sıralı
  const portre = sonucA.filter(k => k.tema === P2.id);
  bekle('Portre 5 kare', portre.length === 5, String(portre.length));
  bekle('karar 19: 5 karede 2 sıralı', portre.filter(k => k.sirali).length === 2, JSON.stringify(portre.map(k => k.sira)));
  bekle('sıralananların puanı herkese açık', portre.filter(k => k.sirali).every(k => k.ortalama !== null), JSON.stringify(portre.filter(k => k.sirali)));
  // B'nin Portre karesi: 6 puan aldı ama sıralamaya girmedi (iki kare daha yüksek aldı)
  const bninKaresiA = sonucA.find(k => k.id === kBp.id);
  const bninKaresiB = sonucB.find(k => k.id === kBp.id);
  bekle('sıralamaya girmeyen kare gerçekten puan almış', Number(bninKaresiB?.ortalama) === 6, JSON.stringify(bninKaresiB));
  bekle('başkası o puanı göremiyor', bninKaresiA?.ortalama === null, JSON.stringify(bninKaresiA));
  bekle('oy sayısı da gizli', bninKaresiA?.oy_sayisi === null, JSON.stringify(bninKaresiA));
  bekle('sahibi kendi puanını görüyor', Number(bninKaresiB?.oy_sayisi) === 1 && bninKaresiB?.sirali === false);
  bekle('sahibi kendi sırasını görüyor, başkası göremiyor', bninKaresiB?.sira !== null && bninKaresiA?.sira === null,
    `${bninKaresiB?.sira} / ${bninKaresiA?.sira}`);
  const digerininSirasiz = portre.find(k => !k.sirali && !k.benim);
  bekle('sıralamaya girmeyenin puanı gizli', digerininSirasiz && digerininSirasiz.ortalama === null, JSON.stringify(digerininSirasiz));
  bekle('sıralamaya girmeyenin sırası da gizli', digerininSirasiz && digerininSirasiz.sira === null, JSON.stringify(digerininSirasiz));
  bekle('sıralananın sırası var', portre.filter(k => k.sirali).every(k => k.sira !== null));
  // Galeri sırası puanı ele vermemeli: sıralamaya girmeyenler yükleme sırasına göre (karar 68)
  {
    const gizli = portre.filter(k => !k.sirali && !k.benim).map(k => k.id);
    const yuklemeSirasi = ((await admin.from('kareler').select('id, yukleme_at').in('id', gizli)).data ?? [])
      .sort((x, y) => x.yukleme_at.localeCompare(y.yukleme_at)).map(k => k.id);
    bekle('galeri yükleme sırasına göre', JSON.stringify(gizli) === JSON.stringify(yuklemeSirasi),
      `${JSON.stringify(gizli)} vs ${JSON.stringify(yuklemeSirasi)}`);
  }
  bekle('yabancı sonuçları göremez', ((await C.c.rpc('sonuc_kareleri', { p_etkinlik: E2 })).data ?? []).length === 0);
  bekle('anonim sonuçları göremez', ((await anon.rpc('sonuc_kareleri', { p_etkinlik: E2 })).data ?? []).length === 0 || !!(await anon.rpc('sonuc_kareleri', { p_etkinlik: E2 })).error);
  // oylama sürerken sonuç yok
  const ek3 = await A2.c.rpc('etkinlik_kur', { p_bulusma: bugun2, p_yukleme_baslar: new Date(Date.now() - 60000).toISOString(), p_yukleme_saat: 48, p_oylama_saat: 72, p_temalar: [{ ad: 'Deneme' }] });
  bekle('yükleme aşamasında sonuç yok', ((await A2.c.rpc('sonuc_kareleri', { p_etkinlik: ek3.data })).data ?? []).length === 0);
  await A2.c.rpc('etkinlik_iptal', { p_etkinlik: ek3.data });
}


// ---------------------------------------------------------------- karar 19'un sınırları
{
  // 14 kareli tema: round(14/2,5)=6 ama en fazla 5 sıralı (karar 19)
  const ek = (await admin.from('etkinlikler').insert({
    bulusma_gunu: bugun2,
    yukleme_baslar: new Date(Date.now() - 5 * 86400000).toISOString(),
    yukleme_biter: new Date(Date.now() - 4 * 86400000).toISOString(),
    oylama_biter: new Date(Date.now() - 3 * 86400000).toISOString(),
    kuran: A2.id,
  }).select('id').single()).data;
  const tema = (await admin.from('temalar').insert({ etkinlik: ek.id, ad: 'Kalabalık', sira: 1, bulusmada: false }).select('id').single()).data;
  const { data: liste } = await admin.auth.admin.listUsers();
  const kimlikler = [];
  const yuklemeSirasi = [];
  for (let i = 0; i < 14; i++) {
    const posta = `kalabalik${i}@test.local`;
    const k = liste.users.find(u => u.email === posta)
      ?? (await admin.auth.admin.createUser({ email: posta, password: 'test-sifre-1', email_confirm: true })).data.user;
    // İlk iki kare eşit puan alacak. Adları bilerek ters: alfabetik sıra yükleme
    // sırasının tersi, yani hangi kuralın işlediği ölçülebiliyor (karar 98).
    const ad = i === 0 ? 'Zeynep Kalabalık' : i === 1 ? 'Ada Kalabalık' : `Kalabalık ${i}`;
    await admin.from('uyeler').insert({ id: k.id, ad, eposta: posta });
    kimlikler.push(k.id);
    const yol = `${ek.id}/${tema.id}/${crypto.randomUUID()}.jpg`;
    await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
    const kr = (await admin.from('kareler').insert({ tema: tema.id, sahip: k.id, dosya: yol, genislik: 10, yukseklik: 10 }).select('id').single()).data;
    yuklemeSirasi.push(kr.id);
    // puanlar: 10, 9, 8 ... ilk ikisi eşit olsun (sıra eşitliği sınanacak)
    const puan = i === 0 ? 10 : i === 1 ? 10 : Math.max(1, 10 - i);
    await admin.from('oylar').insert({ kare: kr.id, veren: A2.id, puan });
  }
  const sonuc = (await A2.c.rpc('sonuc_kareleri', { p_etkinlik: ek.id })).data ?? [];
  bekle('14 kare döndü', sonuc.length === 14, String(sonuc.length));
  bekle('karar 19 tavanı: en fazla 5 sıralı', sonuc.filter(k => k.sirali).length === 5,
    JSON.stringify(sonuc.map(k => [k.sira, k.ortalama])));
  // Karar 98: eşit ortalama aynı numarayı alır, ortak birincilik var
  bekle('eşit puanda ortak birincilik', sonuc.filter(k => Number(k.sira) === 1).length === 2,
    JSON.stringify(sonuc.slice(0, 3).map(k => [k.sira, k.ortalama])));
  bekle('ortak birincilikten sonra numara atlıyor',
    !sonuc.some(k => Number(k.sira) === 2) && sonuc.filter(k => Number(k.sira) === 3).length === 1,
    JSON.stringify(sonuc.slice(0, 4).map(k => [k.sira, k.sahip_ad])));
  bekle('eşitler alfabetik dizilir, yükleme sırasına göre değil',
    sonuc[0].sahip_ad === 'Ada Kalabalık' && sonuc[1].sahip_ad === 'Zeynep Kalabalık'
    && sonuc[0].id === yuklemeSirasi[1] && sonuc[1].id === yuklemeSirasi[0],
    JSON.stringify(sonuc.slice(0, 2).map(k => k.sahip_ad)));
  bekle('ortak birincilerin ikisinin de puanı açık',
    sonuc.filter(k => Number(k.sira) === 1).every(k => Number(k.ortalama) === 10),
    JSON.stringify(sonuc.slice(0, 2).map(k => k.ortalama)));
  bekle('ortak birincilik sıralı sayısını şişirmiyor', sonuc.filter(k => k.sirali).length === 5,
    JSON.stringify(sonuc.filter(k => k.sirali).map(k => k.sira)));
  bekle('sonuç listesi yükleme saatini vermiyor', sonuc[0].yukleme_at === undefined);
  bekle('altıncı ve sonrası gizli', sonuc.filter(k => !k.sirali).every(k => k.ortalama === null && k.sira === null));
  // Sonuç açılmamış etkinlik
  const acik = (await admin.from('etkinlikler').insert({
    bulusma_gunu: bugun2,
    yukleme_baslar: new Date(Date.now() - 1000).toISOString(),
    yukleme_biter: new Date(Date.now() + 86400000).toISOString(),
    oylama_biter: new Date(Date.now() + 2 * 86400000).toISOString(),
    kuran: A2.id,
  }).select('id').single()).data;
  bekle('yükleme sürerken sonuç yok', ((await A2.c.rpc('sonuc_kareleri', { p_etkinlik: acik.id })).data ?? []).length === 0);
  await admin.from('etkinlikler').delete().eq('id', acik.id);
}

// ------------------------------------------------- puan almamış kare sıralamaya girmez
{
  // Karar 98'in ikinci yarısı. Tek kişi oyladıysa kendi karesi hiç puan almaz
  // (karar 20: kimse kendi karesine puan vermiyor). Eskiden sıra yükleme saatinden
  // çıktığı için o kare sıralı görünebiliyordu, şimdi galeriye düşüyor.
  const ek = (await admin.from('etkinlikler').insert({
    bulusma_gunu: bugun2,
    yukleme_baslar: new Date(Date.now() - 5 * 86400000).toISOString(),
    yukleme_biter: new Date(Date.now() - 4 * 86400000).toISOString(),
    oylama_biter: new Date(Date.now() - 3 * 86400000).toISOString(),
    kuran: A2.id,
  }).select('id').single()).data;
  const tema = (await admin.from('temalar').insert({ etkinlik: ek.id, ad: 'Yarım', sira: 1, bulusmada: false }).select('id').single()).data;
  const kareler = {};
  for (const [kim, sahip] of [['a', A2.id], ['b', B2.id]]) {
    const yol = `${ek.id}/${tema.id}/${crypto.randomUUID()}.jpg`;
    await admin.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
    kareler[kim] = (await admin.from('kareler').insert({ tema: tema.id, sahip, dosya: yol, genislik: 10, yukseklik: 10 }).select('id').single()).data;
  }
  // Yalnız A oyladı: B'nin karesine puan verdi, kendi karesi puansız kaldı
  await admin.from('oylar').insert({ kare: kareler.b.id, veren: A2.id, puan: 7 });
  const sonuc = (await A2.c.rpc('sonuc_kareleri', { p_etkinlik: ek.id })).data ?? [];
  const puansiz = sonuc.find(k => k.id === kareler.a.id);
  const puanli = sonuc.find(k => k.id === kareler.b.id);
  bekle('puan almamış kare sıralamaya girmiyor', puansiz?.sirali === false && puansiz?.sira === null,
    JSON.stringify(puansiz));
  bekle('puan almamış kendi karende de sıra yok', puansiz?.ortalama === null && puansiz?.oy_sayisi === 0,
    JSON.stringify(puansiz));
  bekle('puan alan kare birinci', puanli?.sirali === true && Number(puanli?.sira) === 1, JSON.stringify(puanli));
  bekle('puansız kare galeride, sıralının arkasında', sonuc[0].id === kareler.b.id, JSON.stringify(sonuc.map(k => k.sira)));
}

// ---------------------------------------------------------------- üye çıkarma (karar 99)
{
  // A2 kurucu. Yönetici ve düz üye kur.
  const Y = await kullanici('yonetici@test.local', 'Yönetici Kişi');
  const U = await kullanici('duzuye@test.local', 'Düz Üye');
  for (const k of [Y, U]) await admin.from('uyeler').insert({ id: k.id, ad: k === Y ? 'Yönetici Kişi' : 'Düz Üye', eposta: k === Y ? 'yonetici@test.local' : 'duzuye@test.local' });
  await A2.c.rpc('rol_degistir', { p_uye: Y.id, p_yonetici: true });

  bekle('üye kimseyi çıkaramaz', hata(await U.c.rpc('uye_cikar', { p_uye: Y.id, p_cikar: true })).includes('yetki_yok'));
  bekle('kimse kurucuyu çıkaramaz', hata(await Y.c.rpc('uye_cikar', { p_uye: A2.id, p_cikar: true })).includes('kurucu_cikarilmaz'));
  bekle('kimse kendini çıkaramaz', hata(await Y.c.rpc('uye_cikar', { p_uye: Y.id, p_cikar: true })).includes('kendini_cikaramazsin'));
  // İkinci yönetici, yöneticinin yöneticiyi çıkaramadığını sınamak için
  const Y2 = await kullanici('yonetici2@test.local', 'İkinci Yönetici');
  await admin.from('uyeler').insert({ id: Y2.id, ad: 'İkinci Yönetici', eposta: 'yonetici2@test.local' });
  await A2.c.rpc('rol_degistir', { p_uye: Y2.id, p_yonetici: true });
  bekle('yönetici yöneticiyi çıkaramaz', hata(await Y.c.rpc('uye_cikar', { p_uye: Y2.id, p_cikar: true })).includes('yetki_yok'));
  bekle('kurucu yöneticiyi çıkarır', !(await A2.c.rpc('uye_cikar', { p_uye: Y2.id, p_cikar: true })).error);
  await A2.c.rpc('uye_cikar', { p_uye: Y2.id, p_cikar: false });

  bekle('yönetici üyeyi çıkarır', !(await Y.c.rpc('uye_cikar', { p_uye: U.id, p_cikar: true })).error);

  // Çıkarılan kişi: satırı duruyor ama hiçbir yere erişemiyor
  const ben = (await U.c.rpc('ben')).data?.[0];
  bekle('çıkarılanın satırı duruyor', !!ben && ben.ad === 'Düz Üye', JSON.stringify(ben));
  bekle('çıkarılma anı kayıtlı', !!ben?.cikarildi_at, JSON.stringify(ben?.cikarildi_at));
  bekle('çıkarılan üye sayılmıyor', (await U.c.rpc('uye_mi')).data === false);
  bekle('çıkarılan etkinlik göremez', ((await U.c.from('etkinlikler').select('id')).data ?? []).length === 0);
  bekle('çıkarılan üye listesi göremez', ((await U.c.from('uyeler').select('id, ad')).data ?? []).length === 0);
  bekle('çıkarılan sonuç göremez', ((await U.c.rpc('sonuc_kareleri', { p_etkinlik: E2 })).data ?? []).length === 0);
  bekle('çıkarılan sıralamayı göremez', ((await U.c.rpc('siralama')).data ?? []).length === 0);

  // Adı ve kareleri geçmişte duruyor: kurucunun gördüğü sonuç değişmedi
  const sonucAd = ((await A2.c.rpc('sonuc_kareleri', { p_etkinlik: E2 })).data ?? []).map(k => k.sahip_ad);
  bekle('çıkarma geçmiş sonuçları bozmuyor', sonucAd.length > 0 && sonucAd.every(a => !!a), JSON.stringify(sonucAd));

  // Listede duruyor, sonda ve işaretli
  const liste2 = (await Y.c.rpc('uye_listesi')).data ?? [];
  const cikan = liste2.find(x => x.id === U.id);
  bekle('çıkarılan üye listesinde duruyor', !!cikan && !!cikan.cikarildi_at);
  bekle('çıkarılanlar listenin sonunda', liste2[liste2.length - 1].id === U.id, JSON.stringify(liste2.map(x => x.ad)));

  // İstek bırakıp geri dönebiliyor
  const ist = await U.c.from('istekler').insert({ kullanici: U.id, eposta: 'duzuye@test.local', ad: 'Düz Üye', notu: 'Geri almanızı istiyorum' }).select('id').single();
  bekle('çıkarılan istek bırakabiliyor', !ist.error, hata(ist));
  const kart = ((await Y.c.rpc('bekleyen_istekler')).data ?? []).find(x => x.id === ist.data?.id);
  bekle('kartta çıkarılmış olduğu yazıyor', kart?.cikarilmis === true, JSON.stringify(kart));
  bekle('onaylanınca geri giriyor', !(await Y.c.rpc('istek_karar', { p_istek: ist.data.id, p_onay: true })).error
    && (await U.c.rpc('uye_mi')).data === true);
  bekle('geri alınınca çıkarılma anı siliniyor', (await U.c.rpc('ben')).data?.[0]?.cikarildi_at === null);

  // Yönetici listeden de geri alabiliyor
  await Y.c.rpc('uye_cikar', { p_uye: U.id, p_cikar: true });
  bekle('listeden geri alma çalışıyor', !(await Y.c.rpc('uye_cikar', { p_uye: U.id, p_cikar: false })).error
    && (await U.c.rpc('uye_mi')).data === true);
}

rapor();
