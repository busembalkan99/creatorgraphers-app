/**
 * Başarılar (karar 115; 2026-09-30: beş seviye, başkasının profilinde yalnız kazanılanlar).
 * Sayıları sunucu veriyor (public.basarilar, 0018); seviye eşikleri burada.
 */
export type BasariAnahtari = 'tam_set_sayisi' | 'tema_sayisi' | 'sirali_sayisi' | 'birinci_sayisi'

export interface Basari {
  anahtar: BasariAnahtari
  ad: string
  /** Kendi profilinde, kilitliyken ve ilerlerken */
  nasil: string
  /** Sayının birimi: "4 etkinlik", "12 tema" */
  birim: string
  esikler: [number, number, number, number, number]
  ikon: string
  renk: { ana: string; koyu: string; acik: string }
}

export const BASARILAR: Basari[] = [
  { anahtar: 'tam_set_sayisi', ad: 'Tam Set', nasil: 'Bir etkinliğin bütün temalarına kare ver.', birim: 'etkinlik',
    esikler: [1, 2, 4, 6, 12], ikon: 'film_frames_color.svg', renk: { ana: '#FFC800', koyu: '#D9A300', acik: '#FFF1BF' } },
  { anahtar: 'tema_sayisi', ad: 'Tema Avcısı', nasil: 'Farklı temalarda kare ver.', birim: 'tema',
    esikler: [3, 6, 12, 20, 30], ikon: 'artist_palette_color.svg', renk: { ana: '#FF4B8C', koyu: '#D6336F', acik: '#FFDDEA' } },
  { anahtar: 'sirali_sayisi', ad: 'Kürsü', nasil: 'Karen kendi temasında sıralamaya girsin.', birim: 'kez',
    esikler: [1, 3, 7, 15, 30], ikon: 'sports_medal_color.svg', renk: { ana: '#1CB0F6', koyu: '#1899D6', acik: '#D7F1FF' } },
  { anahtar: 'birinci_sayisi', ad: 'Tema Birincisi', nasil: 'Kendi temanda birinci ol.', birim: 'kez',
    esikler: [1, 2, 4, 7, 12], ikon: 'trophy_color.svg', renk: { ana: '#58CC02', koyu: '#46A302', acik: '#E1F8CC' } },
]

export interface Seviye {
  sayi: number
  /** 0 = kilitli, 1–5 */
  seviye: number
  kazanildi: boolean
  /** Sıradaki seviyenin eşiği; en üstteyse null */
  hedef: number | null
  son: boolean
}

export function seviyeBul(b: Basari, ham: unknown): Seviye {
  const sayi = Math.max(0, Number(ham) || 0)
  const seviye = b.esikler.filter(e => sayi >= e).length
  const son = seviye === b.esikler.length
  return { sayi, seviye, kazanildi: seviye > 0, hedef: son ? null : b.esikler[seviye], son }
}
