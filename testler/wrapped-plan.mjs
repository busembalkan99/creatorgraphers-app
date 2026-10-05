// Wrapped kart planı (karar 126): hangi kart var, kişisel kart hangi durumda. Eski setin kuralları aynen.
import { kartPlani, adlarYaz, acilisKareleri } from '../src/ekranlar/wrapped/plan.ts';
import { panoKisalt, panoHarfleri, panoBol } from '../src/ekranlar/wrapped/pano-metin.ts';
import { bekle, rapor } from './ortak.mjs';
const e = { id: 'e', bulusma_gunu: '2026-10-03', yukleme_baslar: '', yukleme_biter: '', oylama_biter: '', iptal: false };
const T1 = { id: 't1', ad: 'Sokak', sira: 1 }, T2 = { id: 't2', ad: 'Portre', sira: 2 };
let n = 0;
const k = (o) => ({ id: `k${n++}`, tema: 't1', tema_ad: 'Sokak', tema_sira: 1, dosya: '', genislik: 1, yukseklik: 1, sahip: `s${n}`, sahip_ad: `Kişi ${n}`,
  benim: false, ortalama: 5, oy_sayisi: 9, sira: null, sirali: false, cikarildi: false, cikarma_nedeni: null, ...o });
const oz = { kisi: 5, kare: 5, puan: 40, benim_oyum: 0, izlendi: false };
const turler = p => p.plan.map(x => x.tur).join(',');
const kisisel = p => p.plan.find(x => x.tur === 'kisisel').durum;

// Tek tema: açılış, tema, kürsü, kişisel, kapanış
let kr = [k({ sira: 1, sirali: true, ortalama: 8.4 }), k({ sira: 2, sirali: true, ortalama: 8.1 }), k({ sira: 3, sirali: true, ortalama: 7.0 }), k({ benim: true, ortalama: 4 })];
let p = kartPlani({ e, temalar: [T1], kareler: kr, ozet: oz });
bekle('tek tema: kart sırası', turler(p) === 'acilis,tema,kursu,kisisel,kapanis', turler(p));
const ku = p.plan.find(x => x.tur === 'kursu');
bekle('kürsü: farklar ve "az farkla" (hepsi 0,5 ve altıysa)', ku.farklar.map(f => f.toFixed(1)).join() === '0.3,1.4' && ku.az === false && ku.girdi === 3, JSON.stringify(ku.farklar));
bekle('tema kartı: adet ve tek değil', (t => t.adet === 4 && t.tek === false)(p.plan.find(x => x.tur === 'tema')));
bekle('kişisel: sıraya girmedi, n temadaki kare', (d => d.tur === 'girmedi' && d.n === 4)(kisisel(p)));
bekle('ekstra etkinlik adı', kartPlani({ e: { ...e, serbest: true }, temalar: [T1], kareler: kr, ozet: oz }).baglam.etkinlikAdi === 'Ekstra etkinlik · Ekim');
bekle('buluşma etkinliği adı', p.baglam.etkinlikAdi === 'Ekim etkinliği' && p.baglam.yil === '2026');

// İki tema: kürsü yok, temalar var
kr = [k({ sira: 1, sirali: true, ortalama: 8 }), k({ tema: 't2', tema_ad: 'Portre', sira: 1, sirali: true, ortalama: 7, benim: true })];
p = kartPlani({ e, temalar: [T1, T2], kareler: kr, ozet: oz });
bekle('iki tema: açılış, iki tema kartı, temalar, kişisel, kapanış', turler(p) === 'acilis,tema,tema,temalar,kisisel,kapanis', turler(p));
bekle('temalar: satır başına adet ve en yüksek', (t => t.toplam === 2 && t.satirlar[1].enYuksek?.ortalama === 7)(p.plan.find(x => x.tur === 'temalar')));
bekle('kişisel: birinci, ortak değil', (d => d.tur === 'birinci' && !d.ortak)(kisisel(p)));

// Eşit birincilik
kr = [k({ sira: 1, sirali: true, ortalama: 8 }), k({ sira: 1, sirali: true, ortalama: 8, benim: true })];
p = kartPlani({ e, temalar: [T1], kareler: kr, ozet: oz });
bekle('eşit: tema kartında iki kazanan', p.plan.find(x => x.tur === 'tema').kazananlar.length === 2);
bekle('eşit: kişisel ortak birinci', kisisel(p).ortak === true);
bekle('isimler: iki ve üç kişi', adlarYaz(['Ayşe Kaya', 'Barış Ak']) === 'Ayşe Kaya ve Barış Ak' && adlarYaz(['A', 'B', 'C']) === 'A, B ve C' && adlarYaz(['A']) === 'A');

// Oylanmamış tema kart açmıyor; kare yok oy var; hiç katılmadı; çıkarıldı; sıralamaya girdi
kr = [k({ ortalama: null, oy_sayisi: 0 })];
p = kartPlani({ e, temalar: [T1], kareler: kr, ozet: { ...oz, benim_oyum: 1 } });
bekle('kimse oylamadıysa tema kartı yok', !p.plan.some(x => x.tur === 'tema'), turler(p));
bekle('kare yok oy var: oyverdi', (d => d.tur === 'oyverdi' && d.adet === 1 && d.hepsi === false)(kisisel(p)));
bekle('hiç katılmadı', kisisel(kartPlani({ e, temalar: [T1], kareler: kr, ozet: oz })).tur === 'katilmadi');
kr = [k({ sira: 1, sirali: true }), k({ benim: true, cikarildi: true, cikarma_nedeni: 'Tarih tutmadı' })];
bekle('çıkarılan kare', kisisel(kartPlani({ e, temalar: [T1], kareler: kr, ozet: oz })).tur === 'cikarildi');
kr = [k({ sira: 1, sirali: true }), k({ benim: true, sira: 2, sirali: true })];
bekle('sıralamaya girdi', (d => d.tur === 'sirali' && d.kare.sira === 2 && d.kac === 1)(kisisel(kartPlani({ e, temalar: [T1], kareler: kr, ozet: oz }))));
kr = [k({ benim: true, ortalama: null, oy_sayisi: 0 })];
bekle('karesi olan ama tema hiç oylanmamış: oylanmamis', kisisel(kartPlani({ e, temalar: [T1], kareler: kr, ozet: oz })).tur === 'oylanmamis');
// Kalkış tabelası metinleri (Task 3): satır en çok 12 harf
bekle('pano: sığan isim aynen, Türkçe büyük harf', panoKisalt('Ayşe Kaya') === 'AYŞE KAYA' && panoKisalt('ilknur iz') === 'İLKNUR İZ', panoKisalt('ilknur iz'));
bekle('pano: sığmayan isim "AD S."', panoKisalt('Muhammed Mustafa Karaosmanoğlu') === 'MUHAMMED K.', panoKisalt('Muhammed Mustafa Karaosmanoğlu'));
bekle('pano: o da sığmazsa ilk ad, 12 harfte', panoKisalt('Abdurrahmanoğulları Ak') === 'ABDURRAHMANO', panoKisalt('Abdurrahmanoğulları Ak'));
bekle('pano: fazla boşluk tek', panoKisalt('  Can   Öz ') === 'CAN ÖZ', panoKisalt('  Can   Öz '));
bekle('pano: geçiş harfleri belirlenimli, dört tane, son harf aralarında değil', JSON.stringify(panoHarfleri('A', 3)) === JSON.stringify(panoHarfleri('A', 3)) && panoHarfleri('A', 3).length === 4 && !panoHarfleri('A', 3).includes('A'));
bekle('pano: boşluk ve noktalama için de geçiş harfi var', panoHarfleri(' ', 0).length === 4 && panoHarfleri(',', 1).length === 4);
bekle('pano: sığan tema adı tek satır', JSON.stringify(panoBol('Portre')) === '["PORTRE"]', JSON.stringify(panoBol('Portre')));
bekle('pano: "Işık ve gölge oyunu" → IŞIK VE / GÖLGE OYUNU', JSON.stringify(panoBol('Işık ve gölge oyunu')) === '["IŞIK VE","GÖLGE OYUNU"]', JSON.stringify(panoBol('Işık ve gölge oyunu')));
bekle('pano: tek uzun kelime iki satıra kesiliyor', JSON.stringify(panoBol('Fotoğrafçılıklarımızdan')) === '["FOTOĞRAFÇILI","KLARIMIZDAN"]', JSON.stringify(panoBol('Fotoğrafçılıklarımızdan')));
bekle('pano: en çok iki satır', panoBol('Bir iki üç dört beş altı yedi sekiz dokuz on on bir').length === 2);

// Kontakt açılışı: etkinliğe bağlı rastgele kareler (her izleyişte aynı), çıkarılan yok, en çok üç
{
  const l = Array.from({ length: 8 }, (_, j) => k({ id: `a${j}`, cikarildi: j === 0 }));
  const a1 = acilisKareleri({ id: 'etk-1' }, l), a2 = acilisKareleri({ id: 'etk-1' }, l), b1 = acilisKareleri({ id: 'etk-2' }, l);
  bekle('açılış kareleri: üç tane, aynı etkinlikte hep aynı', a1.length === 3 && a1.map(x => x.id).join() === a2.map(x => x.id).join(), JSON.stringify(a1.map(x => x.id)));
  bekle('açılış kareleri: çıkarılan kare yok', !a1.some(x => x.cikarildi) && !b1.some(x => x.cikarildi));
  bekle('açılış kareleri: başka etkinlikte başka seçim', a1.map(x => x.id).join() !== b1.map(x => x.id).join(), JSON.stringify([a1.map(x => x.id), b1.map(x => x.id)]));
  bekle('açılış kareleri: az karede olanlar kadar', acilisKareleri({ id: 'x' }, l.slice(0, 3)).length === 2 && acilisKareleri({ id: 'x' }, []).length === 0);
}
rapor();
