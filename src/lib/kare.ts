import { gunFarki } from './zaman'

/**
 * Seçilen dosyayı okur: çekim tarihi ve makine bilgisi alınır, kare uzun kenarı
 * 3000 piksele küçültülüp yeniden JPEG yapılır. Yeniden kodlanan dosyada hiçbir
 * gömülü bilgi kalmaz, yani konum (GPS) de gider. Makine bilgisi ayrıca saklanır
 * (karar 24), konum hiç okunmaz.
 */

export interface KareBilgi {
  cekim_gunu: string | null      // 'YYYY-MM-DD', makinenin yerel günü
  cekim_zamani: string | null    // 'YYYY-MM-DDTHH:MM:SS', saat dilimsiz
  kamera: string | null
  objektif: string | null
  odak: string | null
  diyafram: string | null
  enstantane: string | null
  iso: string | null
}

export interface HazirKare {
  blob: Blob
  genislik: number
  yukseklik: number
  bilgi: KareBilgi
  onizleme: string
}

export const UZUN_KENAR = 3000
const KALITE = 0.88

type Ham = Record<string, unknown>

function tarihCoz(v: unknown): { gun: string; zaman: string } | null {
  // exifr reviveValues:false ile "2026:09:14 18:22:05" döner
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m || m[1] === '0000') return null
  return { gun: `${m[1]}-${m[2]}-${m[3]}`, zaman: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` }
}

const metin = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\0/g, '') : null)

function enstantaneYaz(v: unknown) {
  if (typeof v !== 'number' || v <= 0) return null
  return v >= 1 ? `${+v.toFixed(1)}s` : `1/${Math.round(1 / v)}`
}

export async function bilgiOku(dosya: File): Promise<KareBilgi> {
  let h: Ham = {}
  try {
    // Okuyucu büyük; yalnız kare seçilince indirilsin, açılışı yavaşlatmasın.
    const exifr = (await import('exifr')).default
    h = ((await exifr.parse(dosya, {
      reviveValues: false,
      translateValues: false,
      pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO'],
    })) ?? {}) as Ham
  } catch {
    h = {}
  }
  const t = tarihCoz(h.DateTimeOriginal) ?? tarihCoz(h.CreateDate)
  const marka = metin(h.Make), model = metin(h.Model)
  const kamera = model ? (marka && !model.toLowerCase().startsWith(marka.toLowerCase().split(' ')[0]) ? `${marka} ${model}` : model) : marka
  return {
    cekim_gunu: t?.gun ?? null,
    cekim_zamani: t?.zaman ?? null,
    kamera,
    objektif: metin(h.LensModel),
    odak: typeof h.FocalLength === 'number' ? `${Math.round(h.FocalLength)}mm` : null,
    diyafram: typeof h.FNumber === 'number' ? `f/${+h.FNumber.toFixed(1)}` : null,
    enstantane: enstantaneYaz(h.ExposureTime),
    iso: typeof h.ISO === 'number' ? String(h.ISO) : null,
  }
}

export type TarihSonucu = { ok: true } | { ok: false; neden: 'yok' | 'gun' }

/** Karar 92: buluşmada çekilen temada tarih zorunlu, buluşma günü ±1 gün kabul. */
export function tarihKontrol(bulusmada: boolean, bulusmaGunu: string, cekimGunu: string | null): TarihSonucu {
  if (!bulusmada) return { ok: true }
  if (!cekimGunu) return { ok: false, neden: 'yok' }
  return Math.abs(gunFarki(cekimGunu, bulusmaGunu)) <= 1 ? { ok: true } : { ok: false, neden: 'gun' }
}

export class DosyaHatasi extends Error {}

export async function kucult(dosya: File): Promise<Omit<HazirKare, 'bilgi' | 'onizleme'>> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(dosya, { imageOrientation: 'from-image' })
  } catch {
    throw new DosyaHatasi('Bu dosya açılamadı. Makineden gelen JPEG dosyayı seç.')
  }
  const oran = Math.min(1, UZUN_KENAR / Math.max(bmp.width, bmp.height))
  const g = Math.round(bmp.width * oran), y = Math.round(bmp.height * oran)
  const tuval = document.createElement('canvas')
  tuval.width = g
  tuval.height = y
  const ctx = tuval.getContext('2d')
  if (!ctx) throw new DosyaHatasi('Tarayıcı kareyi işleyemedi.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, g, y)
  bmp.close()
  const blob = await new Promise<Blob | null>(r => tuval.toBlob(r, 'image/jpeg', KALITE))
  if (!blob) throw new DosyaHatasi('Tarayıcı kareyi işleyemedi.')
  return { blob, genislik: g, yukseklik: y }
}
