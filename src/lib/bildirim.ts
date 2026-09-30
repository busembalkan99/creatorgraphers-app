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

const bayt = (s: string) => {
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
  const a = await bag().abonelik()
  if (a && (await sb.rpc('bildirim_aboneligim_var', { p_endpoint: a.endpoint })).data === true) return 'acik'
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
  return 'acik'
}

export async function kapat() {
  const b = bag(); const a = await b.abonelik()
  if (!a) return
  await sb.rpc('bildirim_aboneligi_sil', { p_endpoint: a.endpoint })
  await b.birak()
}

/** Çıkış: bu cihazın aboneliği önce silinir, başkası girince öncekinin bildirimleri ona gitmesin. */
export async function cikisYap() {
  try { await kapat() } catch { /* çıkış engellenmesin */ }
  await sb.auth.signOut()
}
