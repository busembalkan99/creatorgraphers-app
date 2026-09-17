import type { Asama, Etkinlik } from './tipler'

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
// Gün adları elle yazılı; tarayıcının Türkçe desteğine bağlı kalmasın.
const GUN = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi']

/** Sunucu saatiyle aynı hesap: aşama saatten çıkar (0001_temel.sql, asama()). */
export function asama(e: Etkinlik, simdi = Date.now()): Asama {
  if (e.iptal) return 'iptal'
  if (simdi < Date.parse(e.yukleme_baslar)) return 'baslamadi'
  if (simdi < Date.parse(e.yukleme_biter)) return 'yukleme'
  if (simdi < Date.parse(e.oylama_biter)) return 'oylama'
  return 'sonuc'
}

/** 'YYYY-MM-DD' → yerel gün (saat dilimi kayması olmadan) */
function gunParca(g: string) {
  const [y, a, d] = g.split('-').map(Number)
  return { y, a, d, hafta: new Date(y, a - 1, d).getDay() }
}

export const ayAdi = (g: string) => AYLAR[gunParca(g).a - 1]

/** "14 Eylül cumartesi" */
export function gunYaz(g: string, haftaGunu = true) {
  const p = gunParca(g)
  const yil = p.y !== new Date().getFullYear() ? ` ${p.y}` : ''
  return `${p.d} ${AYLAR[p.a - 1]}${yil}${haftaGunu ? ' ' + GUN[p.hafta] : ''}`
}

/** "15 Eylül 18.00" (İstanbul saati) */
export function saatYaz(iso: string) {
  const d = new Date(iso)
  const f = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const v = (t: string) => f.find(x => x.type === t)?.value ?? ''
  return `${Number(v('day'))} ${AYLAR[Number(v('month')) - 1]} ${v('hour')}.${v('minute')}`
}

/**
 * Saate gelen bulunma eki: "16.00'da", "17.00'de", "15.00'te".
 * Ek saatin okunuşuna göre değişiyor, son rakama bakmak yetmiyor:
 * 10 "on" ile 20 "yirmi" aynı rakamla bitiyor ama ekleri farklı.
 */
const SAAT_EKI = ['da', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da']

export function saatEki(iso: string) {
  const saat = Number(new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false,
  }).format(new Date(iso)))
  if (saat === 20) return 'de'  // "yirmi"
  return SAAT_EKI[saat % 10]
}

/** Kalan süre: 2 günden fazlaysa gün, değilse saat, bir saatten azsa dakika. */
export function kalanYaz(bitis: string, simdi = Date.now()) {
  const ms = Date.parse(bitis) - simdi
  if (ms <= 0) return '0 dakika'
  const saat = ms / 3_600_000
  if (saat >= 48) return `${Math.floor(saat / 24)} gün`
  if (saat >= 1) return `${Math.floor(saat)} saat`
  return `${Math.max(1, Math.floor(ms / 60_000))} dakika`
}

/** İki gün arası fark (gün), karar 92'nin ±1 günlük payı için. */
export function gunFarki(a: string, b: string) {
  const pa = gunParca(a), pb = gunParca(b)
  return Math.round((Date.UTC(pa.y, pa.a - 1, pa.d) - Date.UTC(pb.y, pb.a - 1, pb.d)) / 86_400_000)
}

/** <input type="datetime-local"> değeri İstanbul saatinde yazılır, ISO'ya çevrilir. */
export function yerelIso(deger: string) {
  // Türkiye 2016'dan beri yıl boyu UTC+3
  return new Date(`${deger}:00+03:00`).toISOString()
}
