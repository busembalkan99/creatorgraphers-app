// Etkinlik saatlerini değiştirme ve oylamayı bitirme (0022, Buse 2026-10-03), sunucu kuralları.
// İsimsizlik: yükleme bitişi geriye alınmıyor, oylama başlayınca kilitli (karar 105'in ölçüsü ona sabit).
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
await sifirla();
const hata = r => r.error?.message ?? '';
const A = await kullanici('kurucu@test.local', 'Ayşe Kaya'); await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
const B = await kullanici('baris@test.local', 'Barış Ak'); await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
const saat = h => new Date(Date.now() + h * 3600e3).toISOString();
const yeni = async (bas, yuk, oy) => (await admin.from('etkinlikler').insert({ bulusma_gunu: '2026-10-03', yukleme_baslar: saat(bas), yukleme_biter: saat(yuk), oylama_biter: saat(oy), kuran: A.id }).select('id').single()).data.id;
const oku = async id => (await admin.from('etkinlikler').select('yukleme_biter, oylama_biter').eq('id', id).single()).data;
const ms = s => Date.parse(s);
const kur = (U, id, y, o) => U.c.rpc('etkinlik_saatleri', { p_etkinlik: id, p_yukleme_biter: y, p_oylama_biter: o });

// Yükleme sürerken
let E = await yeni(-2, 20, 44);
let r = await kur(B, E, saat(30), saat(60));
bekle('üye saatleri değiştiremiyor', hata(r).includes('yetki_yok'), hata(r));
r = await kur(A, E, saat(30), saat(60));
let s = await oku(E);
bekle('yönetici yükleme ve oylama bitişini ileri alıyor', !r.error && Math.abs(ms(s.yukleme_biter) - ms(saat(30))) < 5000 && Math.abs(ms(s.oylama_biter) - ms(saat(60))) < 5000, hata(r) || JSON.stringify(s));
r = await kur(A, E, saat(10), saat(40));
bekle('yükleme sürerken bitiş öne de alınabiliyor (gelecekte kaldıkça)', !r.error && Math.abs(ms((await oku(E)).yukleme_biter) - ms(saat(10))) < 5000, hata(r));
r = await kur(A, E, saat(-1), saat(40));
bekle('yükleme bitişi geçmişe alınamıyor (isimsizlik)', hata(r).includes('gecmise_alinmaz'), hata(r));
r = await kur(A, E, saat(40), saat(30));
bekle('oylama bitişi yüklemeden önce olamıyor (kendi hata kodu)', hata(r).includes('oy_once'), hata(r));
r = await kur(A, E, saat(0), saat(24));
s = await oku(E);
bekle('yükleme bitişi "şimdi" yapılınca oylama açılıyor', !r.error && Math.abs(ms(s.yukleme_biter) - Date.now()) < 10000
  && (await admin.rpc('etkinlik_asamasi', { p_etkinlik: E })).data === 'oylama', hata(r) || JSON.stringify(s));

// Oylama sürerken
const ybOnce = (await oku(E)).yukleme_biter;
r = await kur(A, E, saat(5), saat(48));
bekle('oylamada yükleme bitişi kilitli', hata(r).includes('yukleme_kilitli'), hata(r));
r = await kur(A, E, null, saat(48));
s = await oku(E);
bekle('oylamada oylama bitişi uzatılıyor, yükleme bitişi aynı', !r.error && s.yukleme_biter === ybOnce && Math.abs(ms(s.oylama_biter) - ms(saat(48))) < 5000, hata(r) || JSON.stringify(s));
r = await kur(A, E, ybOnce, saat(2));
bekle('oylamada oylama bitişi kısaltılıyor (aynı yükleme saatiyle)', !r.error && Math.abs(ms((await oku(E)).oylama_biter) - ms(saat(2))) < 5000, hata(r));
r = await kur(A, E, null, saat(-1));
bekle('oylama bitişi geçmişe alınamıyor', hata(r).includes('gecmise_alinmaz'), hata(r));
r = await B.c.rpc('oylamayi_bitir', { p_etkinlik: E });
bekle('üye oylamayı bitiremiyor', hata(r).includes('yetki_yok'), hata(r));
r = await A.c.rpc('oylamayi_bitir', { p_etkinlik: E });
bekle('yönetici oylamayı bitiriyor: sonuçlar açılıyor', !r.error && (await admin.rpc('etkinlik_asamasi', { p_etkinlik: E })).data === 'sonuc', hata(r));

// Sonuçtan sonra ve iptalde
r = await kur(A, E, null, saat(48));
bekle('sonuç açıldıktan sonra saat değişmiyor', hata(r).includes('saat_degismez'), hata(r));
r = await A.c.rpc('oylamayi_bitir', { p_etkinlik: E });
bekle('sonuçtan sonra oylama bitirilemiyor', hata(r).includes('oylama_yok'), hata(r));
const E2 = await yeni(-2, 20, 44);
await admin.from('etkinlikler').update({ iptal: true }).eq('id', E2);
r = await kur(A, E2, saat(30), saat(60));
bekle('iptal edilen etkinliğin saati değişmiyor', hata(r).includes('saat_degismez'), hata(r));

// Başlamadan
const E3 = await yeni(5, 30, 60);
r = await kur(A, E3, saat(40), saat(70));
bekle('başlamamış etkinliğin bitişleri değişiyor', !r.error, hata(r));
r = await kur(A, E3, saat(3), saat(70));
bekle('yükleme bitişi yükleme başlangıcından önce olamıyor (kendi hata kodu)', hata(r).includes('yukleme_once'), hata(r));
r = await A.c.rpc('oylamayi_bitir', { p_etkinlik: E3 });
bekle('başlamamış etkinlikte oylama bitirilemiyor', hata(r).includes('oylama_yok'), hata(r));
rapor();
