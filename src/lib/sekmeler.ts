import type { IkonAdi } from '../bilesenler/Ikon'

export const SEKMELER = [
  { yol: 'etkinlikler', ad: 'Etkinlikler', ikon: 'film' },
  { yol: 'siralama', ad: 'Sıralama', ikon: 'sira' },
  { yol: 'profil', ad: 'Profil', ikon: 'kisi' },
] as const

// Masaüstü rayında yalnız yöneticiye (karar 129). Telefonda bu yollar Profil > Ayarlar'da.
export const YONETIM: readonly { yol: 'asama' | 'uyeler' | 'bildirim' | 'havuz'; ad: string; ikon: IkonAdi }[] = [
  { yol: 'asama', ad: 'Aşama', ikon: 'saat' },
  { yol: 'uyeler', ad: 'Üyeler', ikon: 'uyeler' },
  { yol: 'bildirim', ad: 'Bildirim', ikon: 'zil' },
  { yol: 'havuz', ad: 'Tema havuzu', ikon: 'liste' },
]
