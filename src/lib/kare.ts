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

// 2400 px ve 0,85 (Buse, 2026-09-30, egress ve depolama; önceden 3000 px, 0,88)
export const UZUN_KENAR = 2400
const KALITE = 0.85

type Ham = Record<string, unknown>

function tarihCoz(v: unknown): { gun: string; zaman: string } | null {
  // exifr reviveValues:false ile "2026:09:14 18:22:05" döner
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m || m[1] === '0000') return null
  return { gun: `${m[1]}-${m[2]}-${m[3]}`, zaman: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` }
}

// Denetim karakterleri de atılır: Lightroom iOS boş bıraktığı alana tek bir "\x06" yazabiliyor
const metin = (v: unknown) => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, '').trim() || null : null)

const aralikta = (v: unknown, alt: number, ust: number): v is number => typeof v === 'number' && v >= alt && v <= ust

function enstantaneYaz(v: number) {
  return v >= 1 ? `${+v.toFixed(1)}s` : `1/${Math.round(1 / v)}`
}

/** Okuyucu dosyası indirilemedi (bağlantı yok ya da yayında yeni sürüm var, eski dosya silinmiş). */
export class OkuyucuHatasi extends Error {}

interface Okuyucu { parse(dosya: File, secenek: object): Promise<unknown> }

// Okuyucu büyük; yalnız kare seçilince indirilsin, açılışı yavaşlatmasın.
const okuyucuGetir = async (): Promise<Okuyucu> => (await import('exifr')).default

export function bilgiKur(h: Ham): KareBilgi {
  const t = tarihCoz(h.DateTimeOriginal) ?? tarihCoz(h.CreateDate)
  const marka = metin(h.Make), model = metin(h.Model)
  const kamera = model ? (marka && !model.toLowerCase().startsWith(marka.toLowerCase().split(' ')[0]) ? `${marka} ${model}` : model) : marka
  // Üç ayrı büyüklük aynı sayı olamaz: dosyayı yazan program makine bilgisini bozmuş, hiçbiri gösterilmez.
  const bozuk = typeof h.FNumber === 'number' && h.FNumber === h.ExposureTime && h.FNumber === h.FocalLength
  return {
    cekim_gunu: t?.gun ?? null,
    cekim_zamani: t?.zaman ?? null,
    kamera,
    objektif: metin(h.LensModel),
    odak: !bozuk && aralikta(h.FocalLength, 1, 3000) ? `${Math.round(h.FocalLength)}mm` : null,
    diyafram: !bozuk && aralikta(h.FNumber, 0.5, 128) ? `f/${+h.FNumber.toFixed(1)}` : null,
    enstantane: !bozuk && aralikta(h.ExposureTime, 1 / 100000, 3600) ? enstantaneYaz(h.ExposureTime) : null,
    iso: typeof h.ISO === 'number' ? String(h.ISO) : null,
  }
}

/**
 * Okuyucunun yüklenememesi ile dosyada bilgi olmaması ayrı şeyler. İlki OkuyucuHatasi atar;
 * eskiden ikisi de boş bilgi dönüyor, kişi "Bu dosyada çekim tarihi yok" görüyordu.
 */
export async function bilgiOku(dosya: File, getir: () => Promise<Okuyucu> = okuyucuGetir): Promise<KareBilgi> {
  let okuyucu: Okuyucu
  try {
    okuyucu = await getir()
  } catch {
    throw new OkuyucuHatasi('Okuyucu yüklenemedi')
  }
  let h: Ham = {}
  try {
    h = ((await okuyucu.parse(dosya, {
      reviveValues: false,
      translateValues: false,
      pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO'],
    })) ?? {}) as Ham
  } catch {
    h = {}
  }
  return bilgiKur(h)
}

export type TarihSonucu = { ok: true } | { ok: false; neden: 'yok' | 'gun' }

/** Karar 92: buluşmada çekilen temada tarih zorunlu, buluşma günü ±1 gün kabul. */
export function tarihKontrol(bulusmada: boolean, bulusmaGunu: string, cekimGunu: string | null): TarihSonucu {
  if (!bulusmada) return { ok: true }
  if (!cekimGunu) return { ok: false, neden: 'yok' }
  return Math.abs(gunFarki(cekimGunu, bulusmaGunu)) <= 1 ? { ok: true } : { ok: false, neden: 'gun' }
}

export class DosyaHatasi extends Error {}

/** JPEG'in EXIF çevirme değeri (1–8); etiket yoksa ya da okunamazsa 1 */
export function yonOku(buf: ArrayBuffer): number {
  try {
    const v = new DataView(buf)
    if (v.getUint16(0) !== 0xffd8) return 1
    let i = 2
    while (i + 4 <= v.byteLength) {
      const m = v.getUint16(i)
      if ((m & 0xff00) !== 0xff00 || m === 0xffda) return 1
      const l = v.getUint16(i + 2)
      if (m === 0xffe1 && v.getUint32(i + 4) === 0x45786966) {   // "Exif"
        const t = i + 10, le = v.getUint16(t) === 0x4949
        const ifd = v.getUint32(t + 4, le), n = v.getUint16(t + ifd, le)
        for (let k = 0; k < n; k++) {
          const e = t + ifd + 2 + k * 12
          if (v.getUint16(e, le) === 0x0112) { const y = v.getUint16(e + 8, le); return y >= 1 && y <= 8 ? y : 1 }
        }
        return 1
      }
      i += 2 + l
    }
  } catch { /* bozuk başlık: çevirmesiz */ }
  return 1
}

/** Ham (çevrilmemiş) kaynağı çevirme bilgisine göre g x y'lik (görünen boyut) tuvale çiz */
export function yonluCiz(ctx: CanvasRenderingContext2D, kaynak: CanvasImageSource, yon: number, g: number, y: number) {
  const dik = yon >= 5 && yon <= 8
  const hg = dik ? y : g, hy = dik ? g : y   // ham çizimin boyutu
  ctx.save()
  switch (yon) {
    case 2: ctx.transform(-1, 0, 0, 1, hg, 0); break
    case 3: ctx.transform(-1, 0, 0, -1, hg, hy); break
    case 4: ctx.transform(1, 0, 0, -1, 0, hy); break
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break
    case 6: ctx.transform(0, 1, -1, 0, hy, 0); break
    case 7: ctx.transform(0, -1, -1, 0, hy, hg); break
    case 8: ctx.transform(0, -1, 1, 0, 0, hg); break
  }
  ctx.drawImage(kaynak, 0, 0, hg, hy)
  ctx.restore()
}

// Ölçüm karesi: ham 16x8, sol yarı kırmızı sağ yarı mavi, EXIF 6 (90° saat yönünde göster).
// Doğru çevrilmiş çizimde üst kırmızı, alt mavi; ham çizimde sol kırmızı, sağ mavi.
const SONDA = '/9j/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAAIABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAACP/EABgRAAIDAAAAAAAAAAAAAAAAAAAJRoTE/9oADAMBAAIRAxEAPwCL0hgVCy5XR2DUYZGbuQ//2Q=='
type Olcum = { dogalYonlu: boolean; cizimYonlu: boolean }
let olcum: Promise<Olcum> | null = null
/** Bu tarayıcı <img>'in boyutunu ve drawImage çizimini çevirme bilgisine göre veriyor mu (bir kez ölçülür) */
export function cizimOlc(): Promise<Olcum> {
  olcum ??= (async () => {
    const img = new Image()
    img.src = 'data:image/jpeg;base64,' + SONDA
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 16
    const x = c.getContext('2d')!
    x.drawImage(img, 0, 0, 8, 16)
    const renk = (px: number, py: number) => {
      const d = x.getImageData(px, py, 1, 1).data
      return d[0] > 150 && d[2] < 110 ? 'k' : d[2] > 150 && d[0] < 110 ? 'm' : '?'
    }
    return { dogalYonlu: img.naturalHeight > img.naturalWidth, cizimYonlu: renk(6, 2) === 'k' && renk(2, 14) === 'm' }
  })().catch(() => ({ dogalYonlu: true, cizimYonlu: true }))
  return olcum
}

/**
 * Kareyi çöz, makinenin çevirme bilgisini (EXIF Orientation) uygulayarak. Safari 16 ve öncesi
 * imageOrientation: 'from-image' değerini tanımıyor ve çağrıyı TypeError ile reddediyor; iPhone X
 * en fazla iOS 16'ya çıktığı için orada her kare "açılamadı" diyordu (2026-09-29). O tarayıcılarda
 * <img> ile çözülüyor. <img>'in boyutu ve drawImage'ın çevirmeyi uygulayıp uygulamadığı tarayıcıdan
 * tarayıcıya değişiyor: uygulamayan birinde dikey kareler sündürülerek kaydediliyordu (2026-09-30).
 * Artık ölçülüyor; uygulamıyorsa çevirme elle yapılıyor.
 */
async function coz(dosya: File): Promise<{ g: number; y: number; ciz: (ctx: CanvasRenderingContext2D, g: number, y: number) => void; birak: () => void }> {
  try {
    const bmp = await createImageBitmap(dosya, { imageOrientation: 'from-image' })
    return { g: bmp.width, y: bmp.height, ciz: (c, g, y) => c.drawImage(bmp, 0, 0, g, y), birak: () => bmp.close() }
  } catch {
    const adres = URL.createObjectURL(dosya)
    const img = new Image()
    img.src = adres
    try {
      await img.decode()
    } catch {
      URL.revokeObjectURL(adres)
      throw new DosyaHatasi('Bu dosya açılamadı. Makineden gelen JPEG dosyayı seç.')
    }
    const yon = yonOku(await dosya.slice(0, 256 * 1024).arrayBuffer())
    const { dogalYonlu, cizimYonlu } = await cizimOlc()
    const dik = yon >= 5 && yon <= 8
    // Ham boyut: tarayıcı boyutu çevirerek veriyorsa geri çevir
    const hg = dik && dogalYonlu ? img.naturalHeight : img.naturalWidth
    const hy = dik && dogalYonlu ? img.naturalWidth : img.naturalHeight
    const g = dik ? hy : hg, y = dik ? hg : hy
    const ciz = cizimYonlu
      ? (c: CanvasRenderingContext2D, w: number, h: number) => c.drawImage(img, 0, 0, w, h)
      : (c: CanvasRenderingContext2D, w: number, h: number) => yonluCiz(c, img, yon, w, h)
    return { g, y, ciz, birak: () => URL.revokeObjectURL(adres) }
  }
}

export async function kucult(dosya: File): Promise<Omit<HazirKare, 'bilgi' | 'onizleme'>> {
  const bmp = await coz(dosya)
  const oran = Math.min(1, UZUN_KENAR / Math.max(bmp.g, bmp.y))
  const g = Math.round(bmp.g * oran), y = Math.round(bmp.y * oran)
  const tuval = document.createElement('canvas')
  tuval.width = g
  tuval.height = y
  const ctx = tuval.getContext('2d')
  if (!ctx) { bmp.birak(); throw new DosyaHatasi('Tarayıcı kareyi işleyemedi.') }
  ctx.imageSmoothingQuality = 'high'
  bmp.ciz(ctx, g, y)
  bmp.birak()
  const blob = await new Promise<Blob | null>(r => tuval.toBlob(r, 'image/jpeg', KALITE))
  if (!blob) throw new DosyaHatasi('Tarayıcı kareyi işleyemedi.')
  return { blob, genislik: g, yukseklik: y }
}
