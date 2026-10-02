/** Wrapped'in sayı ve metin biçimleri (karar 126), bütün setlerde aynı. */
export const iki = (n: number) => String(n).padStart(2, '0')
export const puan = (n: number | null) => (n == null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
export const SAYI = ['sıfır', 'bir', 'iki', 'üç']
export const buyuk = (s: string) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1)
