// Metin yardımcıları (src/lib/metin.ts)
import { adlarYaz } from '../src/lib/metin.ts';
import { bekle, rapor } from './ortak.mjs';
bekle('tek ad aynen', adlarYaz(['Ayşe Kaya']) === 'Ayşe Kaya');
bekle('iki ad "ve" ile', adlarYaz(['Ayşe Kaya', 'Barış Ak']) === 'Ayşe Kaya ve Barış Ak');
bekle('üç ve fazlası virgül ve son "ve"', adlarYaz(['Ayşe Kaya', 'Barış Ak', 'Can Öz']) === 'Ayşe Kaya, Barış Ak ve Can Öz' && adlarYaz(['A', 'B', 'C', 'D']) === 'A, B, C ve D', adlarYaz(['Ayşe Kaya', 'Barış Ak', 'Can Öz']));
bekle('boş liste boş metin', adlarYaz([]) === '');
rapor();
