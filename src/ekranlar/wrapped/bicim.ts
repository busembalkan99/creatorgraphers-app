/** Wrapped'in sayı ve metin biçimleri (karar 126), bütün setlerde aynı. */
export const iki = (n: number) => String(n).padStart(2, '0')
export const puan = (n: number | null) => (n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
export const SAYI = ['sıfır', 'bir', 'iki', 'üç']
export const buyuk = (s: string) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1)

/** Masaya düşen baskı fotoğrafın kendi oranında (karar 130); ölçüsü bilinmeyen kare 3:2. */
export function baskiOlcu(k: { genislik: number; yukseklik: number }, maxW: number, maxH: number) {
  const oran = k.genislik > 0 && k.yukseklik > 0 ? k.genislik / k.yukseklik : 1.5
  const w = Math.min(maxW, Math.round(maxH * oran))
  return { w, h: Math.round(w / oran) }
}
