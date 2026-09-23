// Paylaşım kartının kontakt şeridi (karar 104, karar 41): sunucu kuralları.
import fs from 'node:fs';
import { admin, kullanici, sifirla, bekle, rapor } from './ortak.mjs';
await sifirla();

const KISI = [
  ['kurucu@test.local', 'Ayşe Kaya'], ['k1@test.local', 'Selin Arı'], ['k2@test.local', 'Can Öz'],
  ['k3@test.local', 'Deniz Akın'], ['k4@test.local', 'Elif Sunar'], ['k5@test.local', 'Mert Demir'],
  ['k6@test.local', 'Pelin Er'], ['k7@test.local', 'Onur Tek'], ['k8@test.local', 'Kaan Uz'],
];
const U = [];
for (const [e, ad] of KISI) U.push({ ...(await kullanici(e, ad)), ad, eposta: e });
const [A] = U;
await A.c.rpc('kulubu_kur', { p_ad: 'Ayşe Kaya' });
await admin.from('uyeler').insert(U.slice(1).map(u => ({ id: u.id, ad: u.ad, eposta: u.eposta, rol: 'uye' })));
const yabanci = await kullanici('yabanci@test.local', 'Yabancı');

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = h => new Date(Date.now() + h * 3600000).toISOString();
const E = (await admin.from('etkinlikler').insert({ bulusma_gunu: bugun, yukleme_baslar: saat(-1), yukleme_biter: saat(24), oylama_biter: saat(48), kuran: A.id }).select('id').single()).data.id;
const T = (await admin.from('temalar').insert({ etkinlik: E, ad: 'Sokak', sira: 1, bulusmada: true }).select('id').single()).data.id;
const sahip = {};
for (const u of U.slice(1)) {
  const yol = `${E}/${T}/${crypto.randomUUID()}.jpg`;
  await u.c.storage.from('kareler').upload(yol, fs.readFileSync('/tmp/cgapp/dogru.jpg'), { contentType: 'image/jpeg' });
  const k = (await u.c.from('kareler').insert({ tema: T, dosya: yol, genislik: 3000, yukseklik: 2000, cekim_gunu: bugun }).select('id, dosya').single()).data;
  sahip[k.dosya] = { uye: u.id, kare: k.id };
}
const seritDosyalari = async K => ((await K.c.rpc('paylasim_seridi', { p_etkinlik: E })).data ?? []).map(x => x.dosya);

bekle('yüklemede şerit boş', (await seritDosyalari(U[1])).length === 0);
await admin.from('etkinlikler').update({ yukleme_biter: saat(-0.5) }).eq('id', E);
for (const u of U) {
  const l = (await u.c.rpc('oylama_kareleri', { p_etkinlik: E })).data ?? [];
  for (const [j, k] of l.entries()) await u.c.from('oylar').insert({ kare: k.id, veren: u.id, puan: 1 + (j % 9) });
}
bekle('oylamada şerit boş', (await seritDosyalari(U[1])).length === 0);

// Can afiş iznini kapatıyor; Deniz'in karesi yarışmadan çıkarılıyor
await admin.from('uyeler').update({ afis_izni: false }).eq('id', U[2].id);
const deniz = Object.values(sahip).find(x => x.uye === U[3].id).kare;
await A.c.rpc('kare_cikar', { p_kare: deniz, p_neden: 'deneme' });
await admin.from('etkinlikler').update({ oylama_biter: saat(-0.1) }).eq('id', E);

const s = await seritDosyalari(U[1]);
bekle('şeritte en çok altı kare', s.length > 0 && s.length <= 6, String(s.length));
bekle('paylaşanın kendi karesi şeritte yok', s.every(d => sahip[d].uye !== U[1].id));
bekle('afiş izni kapalı olanın karesi şeritte yok (karar 41)', s.every(d => sahip[d].uye !== U[2].id), JSON.stringify(s.map(d => sahip[d].uye === U[2].id)));
bekle('yarışmadan çıkarılan kare şeritte yok', s.every(d => sahip[d].kare !== deniz));
bekle('üye olmayan şeridi göremiyor', ((await yabanci.c.rpc('paylasim_seridi', { p_etkinlik: E })).data ?? []).length === 0);
// Can'ın kendisi paylaşırken şeritte başkaları var ama kendi karesi yine yok
bekle('izni kapalı olan kendi kartını yine paylaşabiliyor (şerit başkalarından)', (await seritDosyalari(U[2])).every(d => sahip[d].uye !== U[2].id) && (await seritDosyalari(U[2])).length > 0);
// İzin geri açılınca şeride girebiliyor
await admin.from('uyeler').update({ afis_izni: true }).eq('id', U[2].id);
const tum = [];
for (const u of U.slice(1)) tum.push(...(await seritDosyalari(u)));
bekle('izin açılınca şeride girebiliyor', tum.some(d => sahip[d].uye === U[2].id));

rapor();
