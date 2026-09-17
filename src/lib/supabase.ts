import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anahtar = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** .env.local doldurulmadıysa uygulama bunu söyleyen bir ekran gösterir. */
export const ayarEksik = !url || !anahtar || url.includes('PROJE-KIMLIGI')

export const sb = createClient(url ?? 'http://localhost:54321', anahtar ?? 'eksik', {
  auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
})

/** Sunucudaki fonksiyonların fırlattığı kısa kodları okunur cümleye çevirir. */
const HATALAR: Record<string, string> = {
  yetki_yok: 'Bunu yapmaya yetkin yok.',
  istek_yok: 'Bu istek artık beklemiyor.',
  kurucu_var: 'Kulübün kurucusu zaten var.',
  tema_sayisi: 'Bir etkinlikte 1 ile 3 arası tema olabilir.',
  sure: 'Süreler en az 1 saat olmalı.',
  acik_etkinlik_var: 'Bitmemiş bir etkinlik var. Yenisini o bitince kurabilirsin.',
  yukleme_kapali: 'Yükleme kapalı, kareler artık değişmiyor.',
  tarih_yok: 'Bu dosyada çekim tarihi yok.',
  tarih_tutmuyor: 'Bu kare buluşma günü çekilmemiş.',
  iptal_olmaz: 'Oylama açıldığı için etkinlik artık iptal edilemiyor.',
}

export function hataMetni(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? String(e)
  for (const [k, v] of Object.entries(HATALAR)) if (m.includes(k)) return v
  if (/fetch|network|Failed to/i.test(m)) return 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.'
  return 'Bir şey ters gitti. Tekrar dene.'
}

// Yalnız geliştirmede: tarayıcı testleri Google'a gitmeden test hesabıyla girebilsin.
if (import.meta.env.DEV) (window as unknown as { __sb: typeof sb }).__sb = sb
