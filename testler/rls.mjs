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
  const r = await kisi.c.from('kareler').insert({ tema, sahip: kisi.id, dosya: yol, genislik: 10, yukseklik: 10, cekim_gunu: gun }).select('id, dosya').single();
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
bekle('kendi oyunu silemez', ((await B2.c.from('oylar').delete().eq('kare', kA.id).select()).data ?? []).length === 0 && ((await admin.from('oylar').select('kare')).data ?? []).length === 1);
bekle('sonuçta dosya hâlâ indirilebilir', !(await B2.c.storage.from('kareler').download(kA.dosya)).error);
bekle('sonuçta yabancı hâlâ indiremez', !!(await C.c.storage.from('kareler').download(kA.dosya)).error);
bekle('sonuçta kareler hâlâ okunur', ((await B2.c.rpc('oylama_kareleri', { p_etkinlik: E2 })).data ?? []).length === 1);

rapor();
