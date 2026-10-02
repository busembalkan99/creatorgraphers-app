/** Metin yardımcıları (saf, düğümde test ediliyor: testler/metin.mjs) */

/** "Ayşe Kaya ve Barış Ak", üç ve fazlasında "A, B ve C" (Wrapped'de ortak birinciler, Buse 2026-10-03) */
export const adlarYaz = (adlar: string[]) =>
  adlar.length < 2 ? (adlar[0] ?? '') : `${adlar.slice(0, -1).join(', ')} ve ${adlar[adlar.length - 1]}`
