import { sb } from './supabase'

/** Bildirimler (karar 120). Cihaz durumu, aç, kapat, çıkış. Tarayıcı push API'sine tek bağdaştırıcı. */
export type BildirimDurumu = 'desteklenmiyor' | 'ana-ekran-gerek' | 'izin-yok' | 'acilabilir' | 'acik'
type Ab = { endpoint: string; p256dh: string; auth: string }
type Bag = {
  ios: boolean; anaEkran: boolean; iosSurum: [number, number] | null; destek: boolean
  izin: NotificationPermission; izinIste(): Promise<NotificationPermission>
  abonelik(): Promise<Ab | null>; aboneOl(): Promise<Ab>; birak(): Promise<void>
}
const ACIK = import.meta.env.VITE_VAPID_ACIK as string | undefined
/** Aç/kapat sonrası: aynı ekrandaki başka parçalar (bekleme metni) durumu yeniden okusun */
export const DEGISTI = 'bildirim-degisti'

/** VAPID açık anahtarı (base64url) → bayt; test için dışa açık */
export const bayt = (s: string) => {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, c => c.charCodeAt(0))
}
const abJson = (a: PushSubscription): Ab => { const j = a.toJSON(); return { endpoint: a.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth } }
const kayit = () => navigator.serviceWorker.getRegistration()

const gercek: Bag = {
  ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  anaEkran: (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches,
  iosSurum: (() => { const m = navigator.userAgent.match(/OS (\d+)_(\d+)/); return m ? [Number(m[1]), Number(m[2])] : null })(),
  destek: !!ACIK && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  get izin() { return 'Notification' in window ? Notification.permission : 'denied' },
  izinIste: () => Notification.requestPermission(),
  abonelik: async () => { const a = await (await kayit())?.pushManager.getSubscription(); return a ? abJson(a) : null },
  aboneOl: async () => {
    const r = (await kayit()) ?? (await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`))
    await navigator.serviceWorker.ready
    const a = (await r.pushManager.getSubscription()) ?? (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bayt(ACIK!) }))
    return abJson(a)
  },
  birak: async () => { await (await (await kayit())?.pushManager.getSubscription())?.unsubscribe() },
}
// Testler cihaz durumlarını taklit ediyor (yalnız geliştirmede)
const bag = (): Bag => (import.meta.env.DEV && (window as unknown as { __pushTaklit?: Bag }).__pushTaklit) || gercek

/** Yalnız yayında: geliştirmede service worker Playwright'ın ağ taklitlerini atlatıyor. Mantığı testler/sw.mjs'de. */
export async function kaydet() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  try { await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`) } catch { /* bildirimsiz devam */ }
}

/** Beklemeden bilinebilen durum; izin verilmişse abonelik sunucuya sorulmalı (null). İlk karede kayma olmasın diye. */
export function hizliDurum(): BildirimDurumu | null {
  const b = bag()
  const eskiIos = !!b.iosSurum && (b.iosSurum[0] < 16 || (b.iosSurum[0] === 16 && b.iosSurum[1] < 4))
  if (b.ios && eskiIos) return 'desteklenmiyor'
  if (b.ios && !b.anaEkran) return 'ana-ekran-gerek'   // iOS'ta Safari sekmesinde push yok
  if (!b.destek) return 'desteklenmiyor'
  if (b.izin === 'denied') return 'izin-yok'
  return b.izin === 'granted' ? null : 'acilabilir'
}

export async function durum(): Promise<BildirimDurumu> {
  const h = hizliDurum()
  if (h) return h
  const b = bag()
  const a = await b.abonelik()
  if (!a) return 'acilabilir'
  const { data, error } = await sb.rpc('bildirim_aboneligim_var', { p_endpoint: a.endpoint })
  if (!error && data === true) return 'acik'
  // Cihaz başkasına bağlı kalmışsa (çıkış cikisYap'tan geçmedi, oturum süresi doldu) bırakılıyor:
  // öncekinin bildirimleri bu kişiye gitmesin. Ağ hatasında dokunulmuyor.
  if (!error && data === false) await b.birak().catch(() => {})
  return 'acilabilir'
}

/** Dokunuşla çağrılmalı: iOS izni yalnız kullanıcı hareketiyle veriyor. */
export async function ac(): Promise<BildirimDurumu> {
  const b = bag()
  const izin = await b.izinIste()
  if (izin !== 'granted') return izin === 'denied' ? 'izin-yok' : 'acilabilir'
  const a = await b.aboneOl()
  const { error } = await sb.rpc('bildirim_abone_ol', { p_endpoint: a.endpoint, p_p256dh: a.p256dh, p_auth: a.auth })
  if (error) throw error
  window.dispatchEvent(new Event(DEGISTI))
  return 'acik'
}

export async function kapat() {
  const b = bag(); const a = await b.abonelik()
  if (!a) return
  // Sunucudan silinemezse cihazda da bırakma: yoksa sunucu göndermeye devam eder, anahtar kapalı görünür
  const { error } = await sb.rpc('bildirim_aboneligi_sil', { p_endpoint: a.endpoint })
  if (error) throw error
  await b.birak()
  window.dispatchEvent(new Event(DEGISTI))
}

/** Çıkış: bu cihazın aboneliği önce silinir, başkası girince öncekinin bildirimleri ona gitmesin. */
export async function cikisYap() {
  // Sunucudan silinemese de cihazda bırakılıyor: çıkılmış telefona bildirim gelmesin, sunucu satırı 410 ile düşer
  try { await kapat() } catch { await bag().birak().catch(() => {}) }
  await sb.auth.signOut()
}
