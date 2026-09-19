// Yoklama ve diskalifiye (karar 103): sunucu kuralları, atlatma denemeleriyle.
// Aşamalar saatler elle kaydırılarak geçiliyor.
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
const hata = r => r.error?.message ?? '';
await sifirla();

const A = await kullanici('kurucu@test.local', 'Ayşe Kaya');
const B = await kullanici('selin@test.local', 'Selin Arı');
const D = await kullanici('deniz@test.local', 'Deniz Akın');
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').insert([
  { id: B.id, ad: 'Selin Arı', eposta: 'selin@test.local', rol: 'uye' },
  { id: D.id, ad: 'Deniz Akın', eposta: 'deniz@test.local', rol: 'uye' },
]);

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const yarin = new Date(Date.parse(bugun) + 86400000).toISOString().slice(0, 10);
const saat = h => new Date(Date.now() + h * 3600000).toISOString();

// Buluşma olmadan yoklama alınmaz
{
  const e = (await admin.from('etkinlikler').insert({ bulusma_gunu: yarin, yukleme_baslar: saat(20), yukleme_biter: saat(40), oylama_biter: saat(60), kuran: A.id }).select('id').single()).data;
  bekle('buluşma gününden önce yoklama alınmıyor', hata(await A.c.rpc('yoklama_kaydet', { p_etkinlik: e.id, p_gelenler: [A.id] })).includes('bulusma_olmadi'));
  await admin.from('etkinlikler').delete().eq('id', e.id);
}

// Buluşma bugün, yükleme açık
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const temaEkle = await admin.from('temalar').insert([
  { etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true },
  { etkinlik: E, ad: 'Portre', sira: 2, bulusmada: false },
]).select('id, sira');
if (temaEkle.error) throw temaEkle.error;
const [SOKAK, PORTRE] = temaEkle.data.sort((x, y) => x.sira - y.sira);

const yukle = async (K, tema) => {
  const yol = `${E}/${tema.id}/${crypto.randomUUID()}.jpg`;
  const u = await K.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  if (u.error) return { error: u.error };
  return K.c.from('kareler').insert({ tema: tema.id, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id').single();
};

// Yoklama alınmadıysa herkes yükler (yönetici unutursa kulüp beklemesin)
const kD = await yukle(D, SOKAK);
bekle('yoklama yokken herkes yükleyebiliyor', !kD.error, hata(kD));
const kA = await yukle(A, SOKAK);
bekle('yönetici de yükleyebiliyor (kontrol)', !kA.error, hata(kA));
bekle('yoklama yokken durum: alınmadı', (await D.c.rpc('yoklamam', { p_etkinlik: E })).data?.[0]?.alindi === false);

// Yoklamayı yalnız yönetici alır, tabloya doğrudan kimse yazamaz
bekle('üye yoklama alamıyor', hata(await B.c.rpc('yoklama_kaydet', { p_etkinlik: E, p_gelenler: [B.id, D.id] })).includes('yetki_yok'));
bekle('üye yoklamaya kendini doğrudan yazamıyor', !!(await D.c.from('yoklama').insert({ etkinlik: E, uye: D.id })).error);
bekle('üye yoklama listesini göremiyor', ((await B.c.rpc('yoklama_listesi', { p_etkinlik: E })).data ?? []).length === 0);
const liste0 = (await A.c.rpc('yoklama_listesi', { p_etkinlik: E })).data ?? [];
bekle('yönetici bütün üyeleri boş işaretle görüyor', liste0.length === 3 && liste0.every(x => !x.geldi), JSON.stringify(liste0));

bekle('yönetici yoklamayı kaydediyor', !(await A.c.rpc('yoklama_kaydet', { p_etkinlik: E, p_gelenler: [A.id, B.id] })).error);
const liste1 = (await A.c.rpc('yoklama_listesi', { p_etkinlik: E })).data ?? [];
bekle('liste gelenleri işaretli döndürüyor', liste1.filter(x => x.geldi).map(x => x.ad).sort().join() === 'Ayşe Kaya,Selin Arı', JSON.stringify(liste1));
bekle('gelen kendi durumunu görüyor', JSON.stringify((await B.c.rpc('yoklamam', { p_etkinlik: E })).data?.[0]) === '{"alindi":true,"geldim":true}');
bekle('gelmeyen kendi durumunu görüyor', JSON.stringify((await D.c.rpc('yoklamam', { p_etkinlik: E })).data?.[0]) === '{"alindi":true,"geldim":false}');
bekle('üye başkasının yoklama satırını okuyamıyor', ((await D.c.from('yoklama').select('uye')).data ?? []).length === 0);

// Yoklamada olmayan hiçbir temaya yükleyemiyor, serbest temaya da
bekle('gelmeyen serbest temaya yükleyemiyor', hata(await yukle(D, PORTRE)).includes('yoklamada_yok'));
const yolYeni = `${E}/${SOKAK.id}/${crypto.randomUUID()}.jpg`;
await D.c.storage.from('kareler').upload(yolYeni, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
bekle('gelmeyen eski karesini değiştiremiyor', hata(await D.c.from('kareler').update({ dosya: yolYeni }).eq('id', kD.data.id)).includes('yoklamada_yok'));
const kB = await yukle(B, PORTRE);
bekle('gelen serbest temaya yükleyebiliyor', !kB.error, hata(kB));
const kB2 = await yukle(B, SOKAK);
bekle('gelen buluşma temasına yükleyebiliyor', !kB2.error, hata(kB2));

// Yoklamadan önce yüklenmiş kareler: yönetici sayıyı görür, kimin olduğunu görmez, toplu çıkarır
const oz = (await A.c.rpc('gelmeyen_ozeti', { p_etkinlik: E })).data?.[0];
bekle('gelmeyen özeti: 1 kişi 1 kare', oz?.kisi == 1 && oz?.kare == 1, JSON.stringify(oz));
bekle('gelmeyen özeti kimin olduğunu söylemiyor', oz && Object.keys(oz).sort().join() === 'kare,kisi', JSON.stringify(oz));
bekle('üye gelmeyen özetini göremiyor', !((await B.c.rpc('gelmeyen_ozeti', { p_etkinlik: E })).data?.[0]?.kare > 0));
bekle('üye toplu çıkaramıyor', hata(await B.c.rpc('gelmeyenleri_cikar', { p_etkinlik: E })).includes('yetki_yok'));
bekle('yönetici gelmeyenin karesini çıkarıyor', (await A.c.rpc('gelmeyenleri_cikar', { p_etkinlik: E })).data == 1);
bekle('ikinci kez çıkarınca yeni kare yok', (await A.c.rpc('gelmeyenleri_cikar', { p_etkinlik: E })).data == 0);
bekle('çıkarınca özet sıfırlanıyor', (await A.c.rpc('gelmeyen_ozeti', { p_etkinlik: E })).data?.[0]?.kare == 0);

// Nedeni sahibi görür, başkası görmez; kimse tabloya doğrudan yazamaz
const nedenD = (await D.c.from('diskalifiye').select('neden').eq('kare', kD.data.id)).data;
bekle('sahibi çıkarılma nedenini görüyor', nedenD?.[0]?.neden === 'Buluşmaya katılmadın.', JSON.stringify(nedenD));
bekle('başka üye çıkarılanı göremiyor', ((await B.c.from('diskalifiye').select('kare')).data ?? []).length === 0);
bekle('sahibi çıkarılma kaydını silemiyor', ((await D.c.from('diskalifiye').delete().eq('kare', kD.data.id).select()).data ?? []).length === 0
  && ((await admin.from('diskalifiye').select('kare').eq('kare', kD.data.id)).data ?? []).length === 1);
bekle('üye diskalifiye tablosuna yazamıyor', !!(await B.c.from('diskalifiye').insert({ kare: kA.data.id, neden: 'x' })).error);
await D.c.from('kareler').delete().eq('id', kD.data.id);
bekle('sahibi çıkarılan karesini silemiyor', ((await admin.from('kareler').select('id').eq('id', kD.data.id)).data ?? []).length === 1);
bekle('yükleme sayısı çıkarılanı saymıyor', (await B.c.rpc('yukleme_sayilari', { p_etkinlik: E })).data?.find(x => x.tema === SOKAK.id)?.adet == 2);

// Oylama
await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E);
const gorur = async K => ((await K.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? []).map(x => x.id);
bekle('oylamada çıkarılan kare yok', !(await gorur(B)).includes(kD.data.id) && (await gorur(B)).includes(kA.data.id));
bekle('çıkarılan kareye puan verilemiyor', hata(await B.c.from('oylar').insert({ kare: kD.data.id, veren: B.id, puan: 9 })).includes('cikarildi'));
// İsimsizlik: oylamada yoklamayı yeniden yazıp toplu çıkarmak kareleri sahibine bağlatırdı
const yolKD = (await admin.from('kareler').select('dosya').eq('id', kD.data.id).single()).data.dosya;
bekle('saldırı: oylamada yoklama değişmiyor', hata(await A.c.rpc('yoklama_kaydet', { p_etkinlik: E, p_gelenler: [A.id] })).includes('oylama_basladi'));
bekle('saldırı: oylamada toplu çıkarılamıyor', hata(await A.c.rpc('gelmeyenleri_cikar', { p_etkinlik: E })).includes('oylama_basladi'));
bekle('saldırı: oylamada gelmeyen özeti boş', !((await A.c.rpc('gelmeyen_ozeti', { p_etkinlik: E })).data?.[0]?.kare > 0));
const cikO = ((await A.c.rpc('cikarilan_kareler', { p_etkinlik: E })).data ?? []).find(x => x.id === kD.data.id);
bekle('toplu çıkarılan oylamada listede yok, kimliği de', cikO === undefined, JSON.stringify(cikO));
bekle('toplu çıkarılanların yalnız sayısı var', (await A.c.rpc('toplu_ozeti', { p_etkinlik: E })).data == 1);
bekle('üye toplu sayısını göremiyor', (await B.c.rpc('toplu_ozeti', { p_etkinlik: E })).data == 0);
bekle('yönetici toplu çıkarılanın dosyasını oylamada imzalayamıyor', !!(await A.c.storage.from('kareler').createSignedUrl(yolKD, 60)).error);
bekle('toplu çıkarılan oylamada geri alınamıyor (akışa dönerse sahibi belli olur)',
  hata(await A.c.rpc('kare_geri_al', { p_kare: kD.data.id })).includes('toplu_geri')
  && ((await admin.from('diskalifiye').select('kare').eq('kare', kD.data.id)).data ?? []).length === 1);
bekle('karesi çıkarılan o temayı oylamak zorunda değil',
  (await D.c.rpc('oylama_durumu', { p_etkinlik: E })).data?.find(x => x.tema === SOKAK.id)?.zorunlu === false);

// Tek kare çıkarma: nedensiz olmaz, üye yapamaz, yönetici isimsiz yapar
bekle('nedensiz çıkarılmıyor', hata(await A.c.rpc('kare_cikar', { p_kare: kB.data.id, p_neden: '  ' })).includes('neden_gerekli'));
bekle('üye kare çıkaramıyor', hata(await B.c.rpc('kare_cikar', { p_kare: kA.data.id, p_neden: 'x' })).includes('yetki_yok'));
bekle('olmayan kare çıkarılmıyor', hata(await A.c.rpc('kare_cikar', { p_kare: crypto.randomUUID(), p_neden: 'x' })).includes('kare_yok'));
await D.c.from('oylar').insert({ kare: kB.data.id, veren: D.id, puan: 7 });
bekle('yönetici oylamada kare çıkarıyor', !(await A.c.rpc('kare_cikar', { p_kare: kB.data.id, p_neden: 'Tarih değiştirilmiş.' })).error);
bekle('çıkarılan kare oylamadan düşüyor', !(await gorur(D)).includes(kB.data.id));
bekle('oy silinmiyor, yalnız sayılmıyor', ((await admin.from('oylar').select('puan').eq('kare', kB.data.id)).data ?? []).length === 1);
bekle('B artık Portre\'yi oylamak zorunda değil',
  (await B.c.rpc('oylama_durumu', { p_etkinlik: E })).data?.find(x => x.tema === PORTRE.id)?.zorunlu === false);
const cik = (await A.c.rpc('cikarilan_kareler', { p_etkinlik: E })).data ?? [];
bekle('yönetici tek tek çıkardığını nedeniyle görüyor', cik.length === 1 && cik[0].neden === 'Tarih değiştirilmiş.', JSON.stringify(cik));
bekle('çıkarılanlar listesi sahibi söylemiyor', cik.every(x => !('sahip' in x) && !('sahip_ad' in x)));
bekle('üye çıkarılanlar listesini göremiyor', ((await B.c.rpc('cikarilan_kareler', { p_etkinlik: E })).data ?? []).length === 0);

// Geri alma
bekle('üye geri alamıyor', hata(await B.c.rpc('kare_geri_al', { p_kare: kB.data.id })).includes('yetki_yok'));
bekle('yönetici geri alıyor', !(await A.c.rpc('kare_geri_al', { p_kare: kB.data.id })).error);
bekle('geri alınan kare oylamaya dönüyor', (await gorur(D)).includes(kB.data.id));
await A.c.rpc('kare_cikar', { p_kare: kB.data.id, p_neden: 'Tarih değiştirilmiş.' });

// Oylar: A'nın Sokak karesi kazanacak, D'nin çıkarılan karesine eski bir oy da sızsın
await B.c.from('oylar').insert({ kare: kA.data.id, veren: B.id, puan: 8 });
await admin.from('oylar').insert({ kare: kD.data.id, veren: B.id, puan: 10 });
await D.c.from('oylar').insert({ kare: kB2.data.id, veren: D.id, puan: 6 });

// Sonuç
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);
const sonuc = async K => (await K.c.rpc('sonuc_kareleri', { p_etkinlik: E })).data ?? [];
const sB = await sonuc(B);
bekle('sonuçta başkasının çıkarılan karesi hiç yok', !sB.some(x => x.id === kD.data.id), JSON.stringify(sB.map(x => x.id)));
const sokakB = sB.filter(x => x.tema === SOKAK.id && x.sirali);
bekle('çıkarılan karenin 10 puanı sıralamayı etkilemiyor', sokakB[0]?.id === kA.data.id && sokakB[0]?.sira == 1, JSON.stringify(sokakB));
const kendi = (await sonuc(D)).find(x => x.id === kD.data.id);
bekle('sahibi sonuçta karesini nedeniyle görüyor', kendi?.cikarildi === true && kendi?.cikarma_nedeni === 'Buluşmaya katılmadın.' && kendi?.ortalama == null, JSON.stringify(kendi));
const sA = await sonuc(A);
bekle('yönetici sonuçta çıkarılanları görüyor, en sonda', sA.filter(x => x.cikarildi).length === 2 && sA.at(-1)?.cikarildi && sA.filter(x => x.tema === SOKAK.id).at(-1)?.cikarildi, JSON.stringify(sA.map(x => [x.tema_ad, x.cikarildi])));
bekle('yoklama sonuçtan sonra değişmiyor', hata(await A.c.rpc('yoklama_kaydet', { p_etkinlik: E, p_gelenler: [A.id] })).includes('oylama_basladi'));
const cikS = ((await A.c.rpc('cikarilan_kareler', { p_etkinlik: E })).data ?? []).find(x => x.id === kD.data.id);
bekle('sonuçta toplu çıkarılan listede, resmiyle', !!cikS?.dosya, JSON.stringify(cikS));
bekle('sonuçta toplu çıkarılanın dosyası yöneticiye imzalanıyor', !(await A.c.storage.from('kareler').createSignedUrl(yolKD, 60)).error);

// Sonuç açıldıktan sonra da çıkarılır; sıralama ve profil yeniden hesaplanır
const profilA = async () => ((await B.c.rpc('profil_kareleri', { p_uye: A.id })).data ?? []).map(x => x.id);
bekle('kontrol: A\'nın karesi profilde', (await profilA()).includes(kA.data.id));
bekle('sonuçtan sonra kare çıkarılıyor', !(await A.c.rpc('kare_cikar', { p_kare: kA.data.id, p_neden: 'Başka gün çekilmiş.' })).error);
bekle('çıkarılan kare sonuçtan düşüyor', !(await sonuc(B)).some(x => x.id === kA.data.id));
bekle('sıra kayıyor: B\'nin Sokak karesi birinci', (await sonuc(B)).find(x => x.tema === SOKAK.id && x.sirali)?.id === kB2.data.id);
bekle('çıkarılan kare profilden düşüyor', !(await profilA()).includes(kA.data.id));
const sir = (await B.c.rpc('siralama')).data ?? [];
bekle('çıkarılan kare sezon sıralamasında sayılmıyor', !sir.some(x => x.uye === A.id), JSON.stringify(sir.map(x => x.ad)));
const mud = (await B.c.rpc('mudavim')).data ?? [];
bekle('çıkarılan kare müdavim katılımında sayılmıyor', !mud.some(x => x.uye === A.id || x.uye === D.id), JSON.stringify(mud.map(x => x.ad)));

// Yükleme açıkken: yönetici çıkarılan karenin küçük resmini görüyor, etkinliği yine iptal edebiliyor
{
  const E2 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
  const T2 = (await admin.from('temalar').insert({ etkinlik: E2, ad: 'Işık', sira: 1, bulusmada: true }).select('id').single()).data;
  const yol2 = `${E2}/${T2.id}/${crypto.randomUUID()}.jpg`;
  await D.c.storage.from('kareler').upload(yol2, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const k2 = (await D.c.from('kareler').insert({ tema: T2.id, dosya: yol2, genislik: 10, yukseklik: 10, cekim_gunu: bugun }).select('id').single()).data;
  bekle('yönetici yüklemede çıkarmadan önce başkasının dosyasını göremiyor', !!(await A.c.storage.from('kareler').createSignedUrl(yol2, 60)).error);
  await A.c.rpc('kare_cikar', { p_kare: k2.id, p_neden: 'Deneme' });
  const imza = await A.c.storage.from('kareler').createSignedUrl(yol2, 60);
  bekle('yönetici yüklemede çıkarılan karenin resmini görüyor', !imza.error, JSON.stringify(imza.error));
  bekle('başka üye çıkarılan karenin dosyasını göremiyor', !!(await B.c.storage.from('kareler').createSignedUrl(yol2, 60)).error);
  const ip = await A.c.rpc('etkinlik_iptal', { p_etkinlik: E2 });
  bekle('çıkarılan kare varken etkinlik iptal edilebiliyor', !ip.error, hata(ip));
  bekle('iptalde kareler silindi', ((await admin.from('kareler').select('id').eq('id', k2.id)).data ?? []).length === 0);
  await admin.from('etkinlikler').delete().eq('id', E2);
}

// İkinci saldırı (güvenlik incelemesi): yüklemede "X hariç" yoklama + toplu çıkarma ile
// X'in kare kimliklerini not edip geri almak, oylamada kimlikleri resimlerle eşleştirmek
{
  const E3 = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
  const T3 = (await admin.from('temalar').insert({ etkinlik: E3, ad: 'Gölge', sira: 1, bulusmada: false }).select('id').single()).data;
  const yol3 = `${E3}/${T3.id}/${crypto.randomUUID()}.jpg`;
  await B.c.storage.from('kareler').upload(yol3, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const k3 = (await B.c.from('kareler').insert({ tema: T3.id, dosya: yol3, genislik: 10, yukseklik: 10 }).select('id').single()).data;
  await A.c.rpc('yoklama_kaydet', { p_etkinlik: E3, p_gelenler: [A.id, D.id] });   // Selin hariç
  await A.c.rpc('gelmeyenleri_cikar', { p_etkinlik: E3 });
  const liste3 = (await A.c.rpc('cikarilan_kareler', { p_etkinlik: E3 })).data ?? [];
  bekle('saldırı 2: yüklemede toplu çıkarılanın kimliği verilmiyor', !liste3.some(x => x.id === k3.id), JSON.stringify(liste3));
  const dogrudan = (await A.c.from('diskalifiye').select('kare, toplu')).data ?? [];
  bekle('saldırı 3: yönetici tabloyu doğrudan okuyup kimlik alamıyor', !dogrudan.some(x => x.kare === k3.id), JSON.stringify(dogrudan));
  bekle('saldırı 2: yüklemede kare kare geri alınamıyor', hata(await A.c.rpc('kare_geri_al', { p_kare: k3.id })).includes('toplu_geri'));
  await A.c.rpc('yoklama_kaydet', { p_etkinlik: E3, p_gelenler: [A.id, B.id, D.id] });
  bekle('yoklama düzeltilince toplu çıkarılan kendiliğinden dönüyor', ((await admin.from('diskalifiye').select('kare').eq('kare', k3.id)).data ?? []).length === 0);
  bekle('tek tek çıkarılan yoklamayla dönmüyor', await (async () => {
    await A.c.rpc('kare_cikar', { p_kare: k3.id, p_neden: 'Deneme' });
    await A.c.rpc('yoklama_kaydet', { p_etkinlik: E3, p_gelenler: [A.id, B.id, D.id] });
    return ((await admin.from('diskalifiye').select('kare').eq('kare', k3.id)).data ?? []).length === 1;
  })());
  await admin.from('etkinlikler').delete().eq('id', E3);
}

rapor();
