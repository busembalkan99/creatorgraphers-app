export type Rol = 'kurucu' | 'yonetici' | 'uye'

export interface Uye {
  id: string
  ad: string
  eposta: string
  rol: Rol
  afis_izni: boolean
  hosgeldin_goruldu: boolean
  /** Dolu ise kişi kulüpten çıkarılmış: satırı ve kareleri duruyor, giriş yapamıyor (karar 99) */
  cikarildi_at?: string | null
}

export interface Istek {
  id: string
  ad: string
  eposta: string
  notu: string | null
  durum: 'bekliyor' | 'onay' | 'red'
  olusturma: string
}

export interface Etkinlik {
  id: string
  bulusma_gunu: string // YYYY-MM-DD
  yukleme_baslar: string
  yukleme_biter: string
  oylama_biter: string
  iptal: boolean
}

export interface Tema {
  id: string
  etkinlik: string
  ad: string
  sira: number
  bulusmada: boolean
}

export interface Kare {
  id: string
  tema: string
  dosya: string
  genislik: number
  yukseklik: number
  cekim_gunu: string | null
}

export type Asama = 'iptal' | 'baslamadi' | 'yukleme' | 'oylama' | 'sonuc'
