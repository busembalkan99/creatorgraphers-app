// Wrapped kart planı (karar 126): hangi kart var, kişisel kart hangi durumda. Eski setin kuralları aynen.
import { kartPlani, adlarYaz, acilisKareleri, acilisSeritleri, temaDuzeni, kapanisYigini, temaSeridiKareleri, izgaraKareleri, esitKalanNotu } from '../src/ekranlar/wrapped/plan.ts';
import { baskiOlcu } from '../src/ekranlar/wrapped/bicim.ts';
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

// Kürsü: fark 0,5 ve altıysa "az farkla"; temada tek kare
{
  const kr2 = [k({ sira: 1, sirali: true, ortalama: 8.4 }), k({ sira: 2, sirali: true, ortalama: 8.1 }), k({ sira: 3, sirali: true, ortalama: 8.0 })];
  bekle('kürsü: farklar 0,5 ve altı → az farkla', kartPlani({ e, temalar: [T1], kareler: kr2, ozet: oz }).plan.find(x => x.tur === 'kursu')?.az === true);
  bekle('tema kartı: temada tek kare', kartPlani({ e, temalar: [T1], kareler: [k({ sira: 1, sirali: true })], ozet: oz }).plan.find(x => x.tur === 'tema')?.tek === true);
}

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
bekle('pano: ikinci kelimesi uzun ad kesilmiyor, harf harf iki satıra', JSON.stringify(panoBol('Sokak fotoğrafçılığı')) === '["SOKAK FOTOĞR","AFÇILIĞI"]', JSON.stringify(panoBol('Sokak fotoğrafçılığı')));
bekle('pano: 24 harfi aşan ad iki satırda, kesildiği belli (…)', (l => l.length === 2 && l[1].endsWith('…') && [...l[1]].length === 12)(panoBol('Bir iki üç dört beş altı yedi sekiz dokuz on on bir')), JSON.stringify(panoBol('Bir iki üç dört beş altı yedi sekiz dokuz on on bir')));

// Kontakt açılışı: etkinliğe bağlı rastgele kareler (her izleyişte aynı), çıkarılan yok, en çok üç
{
  const l = Array.from({ length: 8 }, (_, j) => k({ id: `a${j}`, cikarildi: j === 0 }));
  const a1 = acilisKareleri({ id: 'etk-1' }, l), a2 = acilisKareleri({ id: 'etk-1' }, l), b1 = acilisKareleri({ id: 'etk-2' }, l);
  bekle('açılış kareleri: üç tane, aynı etkinlikte hep aynı', a1.length === 3 && a1.map(x => x.id).join() === a2.map(x => x.id).join(), JSON.stringify(a1.map(x => x.id)));
  bekle('açılış kareleri: çıkarılan kare yok', !a1.some(x => x.cikarildi) && !b1.some(x => x.cikarildi));
  bekle('açılış kareleri: başka etkinlikte başka seçim', a1.map(x => x.id).join() !== b1.map(x => x.id).join(), JSON.stringify([a1.map(x => x.id), b1.map(x => x.id)]));
  bekle('açılış kareleri: az karede olanlar kadar', acilisKareleri({ id: 'x' }, l.slice(0, 3)).length === 2 && acilisKareleri({ id: 'x' }, []).length === 0);
}
// --- Kontakt v2 (karar 130)
{
  const kar = m => Array.from({ length: m }, (_, i) => k({ id: `a${i}` }));
  const say = m => acilisSeritleri(e, kar(m)).map(s => s.length);
  bekle('açılış: 3 kare tek şerit', JSON.stringify(say(3)) === '[3]', JSON.stringify(say(3)));
  bekle('açılış: 4 kare tek şerit', JSON.stringify(say(4)) === '[4]');
  bekle('açılış: 7 kare iki şerit (4+3)', JSON.stringify(say(7)) === '[4,3]', JSON.stringify(say(7)));
  bekle('açılış: 16 kare üç şerit, en çok 12', JSON.stringify(say(16)) === '[4,4,4]', JSON.stringify(say(16)));
  bekle('açılış: 10 kare 4+3+3 (son şerit küçülmüyor)', JSON.stringify(say(10)) === '[4,3,3]', JSON.stringify(say(10)));
  const s16 = acilisSeritleri(e, kar(16)).flat().map(x => x.id);
  bekle('açılış: kare tekrar etmiyor', new Set(s16).size === s16.length);
  bekle('açılış: aynı etkinlikte aynı kareler', JSON.stringify(acilisSeritleri(e, kar(16)).flat().map(x => x.id)) === JSON.stringify(s16));
  bekle('açılış: çıkarılan kare yok', acilisSeritleri(e, [...kar(3), k({ id: 'cik', cikarildi: true })]).flat().every(x => x.id !== 'cik'));
  bekle('açılış: kare yoksa şerit yok', acilisSeritleri(e, []).length === 0);

  // İki tema: 1. şerit, 2. baskı; eşit tema iki baskı
  let kr2 = [k({ sira: 1, sirali: true }), k({ tema: 't2', tema_ad: 'Portre', sira: 1, sirali: true })];
  bekle('düzen: iki tema şerit, baskı', temaDuzeni(kartPlani({ e, temalar: [T1, T2], kareler: kr2, ozet: oz }).plan).join() === 'serit,baski');
  kr2 = [k({ sira: 1, sirali: true }), k({ tema: 't2', tema_ad: 'Portre', sira: 1, sirali: true }), k({ tema: 't2', tema_ad: 'Portre', sira: 1, sirali: true })];
  bekle('düzen: eşit tema iki baskı', temaDuzeni(kartPlani({ e, temalar: [T1, T2], kareler: kr2, ozet: oz }).plan).join() === 'serit,esit');
  bekle('düzen: tek tema şerit', temaDuzeni(kartPlani({ e, temalar: [T1], kareler: [k({ sira: 1, sirali: true })], ozet: oz }).plan).join() === 'serit');

  // Kapanış yığını
  const b1 = k({ id: 'b1', sira: 1, sirali: true }), b2 = k({ id: 'b2', sira: 2, sirali: true }), b3 = k({ id: 'b3', sira: 3, sirali: true }), ben = k({ id: 'ben', benim: true, ortalama: 3 });
  bekle('yığın: kürsü altta, kendi karesi üstte', kapanisYigini([b1, b2, b3, ben]).map(x => x.id).join() === 'b3,b2,b1,ben');
  bekle('yığın: kendi karesi kazananlardaysa iki kez yok', kapanisYigini([{ ...b1, benim: true }, b2]).map(x => x.id).join() === 'b2,b1');
  bekle('yığın: karesi yoksa yalnız kazananlar', kapanisYigini([b1, b2]).map(x => x.id).join() === 'b2,b1');
  const p1 = k({ id: 'p1', tema: 't2', tema_sira: 2, sira: 1, sirali: true });
  bekle('yığın: iki temada tema birincileri', kapanisYigini([b1, b2, p1]).map(x => x.id).join() === 'p1,b1');
  bekle('yığın: çıkarılan kendi karesi üste konmuyor', kapanisYigini([b1, { ...ben, cikarildi: true }]).map(x => x.id).join() === 'b1');
  // Altı temalı etkinlik: en çok dört baskı (son üç kazanan ve kendi karesi)
  const alti = Array.from({ length: 6 }, (_, i) => k({ id: `t${i + 1}`, tema: `t${i + 1}`, tema_sira: i + 1, sira: 1, sirali: true }));
  bekle('yığın: altı temada en çok dört baskı, en üstte kendi karesi', kapanisYigini([...alti, ben]).map(x => x.id).join() === 't3,t2,t1,ben', kapanisYigini([...alti, ben]).map(x => x.id).join());
  bekle('yığın: karesi yoksa en çok üç kazanan', kapanisYigini(alti).map(x => x.id).join() === 't3,t2,t1', kapanisYigini(alti).map(x => x.id).join());
  bekle('yığın: kendi karesi kazananlardaysa yine en çok dört', kapanisYigini(alti.map((x, i) => i === 4 ? { ...x, benim: true } : x)).map(x => x.id).join() === 't3,t2,t1,t5', kapanisYigini(alti.map((x, i) => i === 4 ? { ...x, benim: true } : x)).map(x => x.id).join());

  // Eşit birincilik: iki baskıdan sonrakilerin adı ve puanı notta
  const es = ['Ayşe Kaya', 'Barış Ak', 'Can Öz', 'Deniz Akın'].map(ad => k({ sahip_ad: ad, sira: 1, sirali: true, ortalama: 9 }));
  bekle('eşit: iki birincide not yok', esitKalanNotu(es.slice(0, 2)) === null);
  bekle('eşit: üç birincide üçüncünün adı ve puanı', esitKalanNotu(es.slice(0, 3)) === 'Can Öz 9,0', esitKalanNotu(es.slice(0, 3)));
  bekle('eşit: dört birincide kalan iki ad "ve" ile', esitKalanNotu(es) === 'Can Öz ve Deniz Akın 9,0', esitKalanNotu(es));

  // Temalar şeridi en çok 6
  bekle('temalar şeridi: en çok 6 kare', temaSeridiKareleri(kar(9).map(x => ({ ...x, tema: 't1' })), 't1').length === 6);
  bekle('paylaşım ızgarası: 0,1,3,4,6 → 0,1,2,2,5', [0, 1, 3, 4, 6].map(izgaraKareleri).join() === '0,1,2,2,5');

  // Baskı kendi oranında
  const y = baskiOlcu({ genislik: 3000, yukseklik: 2000 }, 310, 290), d = baskiOlcu({ genislik: 2000, yukseklik: 3000 }, 310, 290);
  bekle('baskı: yatay 310x207', y.w === 310 && y.h === 207, JSON.stringify(y));
  bekle('baskı: dikey 193x290', d.w === 193 && d.h === 290, JSON.stringify(d));
  bekle('baskı: ölçüsü bozuk kare 3:2', JSON.stringify(baskiOlcu({ genislik: 0, yukseklik: 0 }, 310, 290)) === '{"w":310,"h":207}');
}
rapor();
