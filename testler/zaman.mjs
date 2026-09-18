// Türkçe sayı ekleri: ek, sayının okunuşunun son kelimesine göre değişir.
// Beklenenler okunuştan elle yazıldı; kod son rakama bakarak hesaplarsa kalır.
import { saatEki, sayiEki } from '../src/lib/zaman.ts';
import { bekle, rapor } from './ortak.mjs';

// İstanbul saati UTC+3: yerel HH.MM → ISO
const iso = hhmm => { const [h, m] = hhmm.split('.').map(Number); return new Date(Date.UTC(2026, 8, 19, h - 3, m)).toISOString(); };
for (const [saat, ek, okunus] of [
  ['16.00', 'da', 'on altı'], ['17.00', 'de', 'on yedi'], ['15.00', 'te', 'on beş'], ['19.00', 'da', 'on dokuz'],
  ['20.00', 'de', 'yirmi'], ['10.00', 'da', 'on'], ['12.00', 'de', 'on iki'], ['13.00', 'te', 'on üç'],
  ['18.30', 'da', 'on sekiz otuz'], ['18.15', 'te', 'on sekiz on beş'], ['18.40', 'ta', 'on sekiz kırk'],
  ['18.45', 'te', 'on sekiz kırk beş'], ['23.50', 'de', 'yirmi üç elli'], ['09.05', 'te', 'dokuz beş'],
  ['10.20', 'de', 'on yirmi'], ['21.10', 'da', 'yirmi bir on'],
]) bekle(`${saat}'${ek} (${okunus})`, saatEki(iso(saat)) === ek, saatEki(iso(saat)));

for (const [yil, ek] of [[2026, 'dan'], [2025, 'ten'], [2020, 'den'], [2030, 'dan'], [2040, 'tan'], [2019, 'dan'], [2021, 'den'], [2024, 'ten'],
  // onlar basamağının her okunuşu: elli, altmış (ş → 'tan), yetmiş (ş → 'ten), seksen, doksan
  [2050, 'den'], [2060, 'tan'], [2070, 'ten'], [2080, 'den'], [2090, 'dan'], [2010, 'dan']])
  bekle(`${yil}'${ek}`, sayiEki(yil % 100) + 'n' === ek, sayiEki(yil % 100) + 'n');

rapor();
