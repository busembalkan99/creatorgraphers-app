import { sb } from './supabase'

/**
 * Karelerin imzalı adresleri, oturum boyunca aynı (egress, 2026-09-30). Her ekran açılışında yeni adres
 * üretiliyordu; adres değişince tarayıcı aynı kareyi yeniden indiriyordu (25 Eylül'de 39 kare ~2.300 kez).
 * Adres 6 saat geçerli, son yarım saatinde yenileniyor. Aynı anda isteyen ekranlar aynı isteği bekliyor.
 * Çıkışta boşalıyor. Hata olursa adres null (ekran eskisi gibi karesiz çiziliyor).
 */
const SURE = 6 * 3600
const PAY = 30 * 60 * 1000
const bellek = new Map<string, { url: string; bitis: number }>()
const ucusta = new Map<string, Promise<void>>()

export async function imzala(yollar: string[]): Promise<{ signedUrl: string | null }[]> {
  const simdi = Date.now()
  const eksik = [...new Set(yollar)].filter(y => {
    const b = bellek.get(y)
    return !(b && b.bitis - simdi > PAY) && !ucusta.has(y)
  })
  if (eksik.length) {
    const istek = (async () => {
      const { data, error } = await sb.storage.from('kareler').createSignedUrls(eksik, SURE)
      if (error) return
      const bitis = Date.now() + SURE * 1000
      ;(data ?? []).forEach((d, i) => { if (d.signedUrl) bellek.set(eksik[i], { url: d.signedUrl, bitis }) })
    })().catch(() => {}).finally(() => eksik.forEach(y => ucusta.delete(y)))
    eksik.forEach(y => ucusta.set(y, istek))
  }
  await Promise.all([...new Set(yollar.map(y => ucusta.get(y)).filter(Boolean))])
  return yollar.map(y => ({ signedUrl: bellek.get(y)?.url ?? null }))
}

/** Test için */
export const onbellekBoyu = () => bellek.size

// Başka biri girince öncekinin adresleri kalmasın
sb.auth.onAuthStateChange(olay => { if (olay === 'SIGNED_OUT') bellek.clear() })
