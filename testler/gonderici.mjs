// Gönderici çekirdeği: gerçek yerel veritabanına karşı, sahte gönderme fonksiyonuyla
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
import { isle, yanitla } from '../supabase/functions/bildirim-gonder/cekirdek.ts';
await sifirla();
const B = await kullanici('baris@test.local', 'Barış Ak');
await admin.from('uyeler').insert({ id: B.id, ad: 'Barış Ak', eposta: 'baris@test.local' });
for (const n of ['iyi', 'olu']) await B.c.rpc('bildirim_abone_ol', { p_endpoint: `https://push.example/${n}`, p_p256dh: 'p', p_auth: 'a' });
await admin.from('bildirim_kuyrugu').insert({ kullanici: B.id, anahtar: 'g:1', tur: 'yeni_etkinlik', baslik: 'Yeni etkinlik: 9 Kasım', govde: 'Temalar: Gece', adres: 'etkinlikler', zaman: new Date(Date.now() - 1000).toISOString() });
const giden = [];
const sahte = async (abonelik, yuk) => {
  if (abonelik.endpoint.endsWith('/olu')) { const e = new Error('Gone'); e.statusCode = 410; throw e; }
  giden.push({ abonelik, yuk: JSON.parse(yuk) });
};
const s = await isle(admin, sahte);
bekle('iyi cihaza gönderildi, yük doğru', giden.length === 1 && giden[0].yuk.baslik === 'Yeni etkinlik: 9 Kasım' && giden[0].yuk.adres === 'etkinlikler' && giden[0].abonelik.keys.p256dh === 'p', JSON.stringify(giden));
bekle('410 veren cihazın aboneliği silindi', ((await admin.from('bildirim_abonelikleri').select('id').eq('endpoint', 'https://push.example/olu')).data ?? []).length === 0);
bekle('bir cihaz başardıysa bildirim gönderildi sayılıyor', !!(await admin.from('bildirim_kuyrugu').select('gonderildi_at').eq('anahtar', 'g:1').single()).data?.gonderildi_at);
bekle('özet', s.gonderilen === 1 && s.toplam === 1, JSON.stringify(s));
// Tümü başarısızsa deneme artıyor
await admin.from('bildirim_kuyrugu').insert({ kullanici: B.id, anahtar: 'g:2', tur: 'yeni_etkinlik', baslik: 'X', govde: 'Y', adres: 'etkinlikler', zaman: new Date(Date.now() - 1000).toISOString() });
await isle(admin, async () => { const e = new Error('Sunucu'); e.statusCode = 500; throw e; });
const k = (await admin.from('bildirim_kuyrugu').select('deneme, gonderildi_at, son_hata').eq('anahtar', 'g:2').single()).data;
bekle('hepsi başarısızsa deneme artıyor, gönderildi sayılmıyor', k.deneme === 1 && !k.gonderildi_at && k.son_hata === '500', JSON.stringify(k));
// Gönderilecekler okunamazsa isle atıyor, hiçbir şey göndermiyor (kapsam incelemesi)
let gonderilen = 0, atti = false;
try { await isle({ rpc: async ad => ad === 'bildirim_gonderilecekler' ? { data: null, error: { message: 'kapali' } } : { data: null, error: null } }, async () => { gonderilen++; }); } catch { atti = true; }
bekle('gönderilecekler okunamazsa atıyor, göndermiyor', atti && gonderilen === 0);
// Edge Function'ın kapısı: gizli başlık yok ya da yanlışsa 401, doğruysa çalışır, hata 500
const istek = h => new Request('https://x/functions/v1/bildirim-gonder', { method: 'POST', headers: h });
let calisti = 0;
const is = async () => { calisti++; return { gonderilen: 0, toplam: 0 }; };
bekle('gizli başlık yoksa 401, çalışmıyor', (await yanitla(istek({}), 'dogru', is)).status === 401 && calisti === 0);
bekle('gizli başlık yanlışsa 401', (await yanitla(istek({ 'x-bildirim-gizli': 'yanlis' }), 'dogru', is)).status === 401 && calisti === 0);
bekle('sunucuda gizli tanımsızsa her çağrı 401', (await yanitla(istek({ 'x-bildirim-gizli': '' }), '', is)).status === 401 && calisti === 0);
const ok = await yanitla(istek({ 'x-bildirim-gizli': 'dogru' }), 'dogru', is);
bekle('doğru gizliyle 200 ve özet', ok.status === 200 && JSON.stringify(await ok.json()) === '{"gonderilen":0,"toplam":0}' && calisti === 1);
bekle('iş hata verirse 500', (await yanitla(istek({ 'x-bildirim-gizli': 'dogru' }), 'dogru', async () => { throw new Error('bozuk'); })).status === 500);

// Yarıda kalan çalışma (son inceleme #3): gönderilen satır anında işaretleniyor, çöken çalışma onu yeniden göndermiyor
await admin.from('bildirim_kuyrugu').delete().neq('id', -1);
await admin.from('bildirim_kuyrugu').insert([
  { kullanici: B.id, anahtar: 'g:3', tur: 'yeni_etkinlik', baslik: 'Bir', govde: 'Y', adres: 'etkinlikler', zaman: new Date(Date.now() - 2000).toISOString() },
  { kullanici: B.id, anahtar: 'g:4', tur: 'yeni_etkinlik', baslik: 'İki', govde: 'Y', adres: 'etkinlikler', zaman: new Date(Date.now() - 1000).toISOString() }]);
isle(admin, async (a, yuk) => { if (JSON.parse(yuk).baslik === 'İki') await new Promise(() => {}); });   // ikincide takılıyor
await new Promise(r => setTimeout(r, 1500));
bekle('takılan çalışmada ilk bildirim gönderildi olarak işaretli', !!(await admin.from('bildirim_kuyrugu').select('gonderildi_at').eq('anahtar', 'g:3').single()).data?.gonderildi_at);
rapor();
process.exit(0);   // takılı söz bitmiyor
