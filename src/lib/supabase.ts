import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anahtar = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** .env.local doldurulmadıysa uygulama bunu söyleyen bir ekran gösterir. */
export const ayarEksik = !url || !anahtar || url.includes('PROJE-KIMLIGI')

// Boş satır da eksik sayılır: createClient boş anahtarla hata fırlatıp sayfayı düşürüyordu.
export const sb = createClient(ayarEksik ? 'http://localhost:54321' : url!, ayarEksik ? 'eksik' : anahtar!, {
  auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
})

/** Sunucudaki fonksiyonların fırlattığı kısa kodları okunur cümleye çevirir. */
const HATALAR: Record<string, string> = {
  yetki_yok: 'Bunu yapmaya yetkin yok.',
  istek_yok: 'Bu istek artık beklemiyor.',
  kurucu_var: 'Kulübün kurucusu zaten var.',
  tema_sayisi: 'Bir etkinlikte 1 ile 3 arası tema olabilir.',
  sure: 'Süreler en az 1 saat olmalı.',
  acik_etkinlik_var: 'Bitmemiş bir etkinlik var. Önce onu bitir.',
  yukleme_kapali: 'Yükleme kapalı, kareler artık değişmiyor.',
  tarih_yok: 'Bu dosyada çekim tarihi yok.',
  tarih_tutmuyor: 'Bu kare buluşma günü çekilmemiş.',
  dosya_yok: 'Kare yüklenemedi. Tekrar dene.',
  tema_degismez: 'Kare başka temaya taşınamaz.',
  kendi_karen: 'Kendi karene puan veremezsin.',
  oylama_kapali: 'Oylama kapandı, puanlar artık değişmiyor.',
  baska_veren: 'Yalnız kendi puanını verebilirsin.',
  iptal_olmaz: 'Oylama açıldığı için etkinlik artık iptal edilemiyor.',
  yoklamada_yok: 'Yoklamada adın yok, bu etkinliğe kare yükleyemezsin.',
  cikarildi: 'Bu kare yarışmadan çıkarıldı.',
  neden_gerekli: 'Nedenini yaz.',
  bulusma_olmadi: 'Yoklama buluşma günü alınır.',
  oylama_bitti: 'Oylama bitti, yoklama artık değişmiyor.',
  kare_yok: 'Bu kare artık yok.',
  etkinlik_yok: 'Etkinlik bulunamadı.',
}

/**
 * Veri isteklerine süre sınırı. Bağlantı kopunca istemci bazen hiç cevap vermiyor
 * ve ekran sonsuza kadar "yükleniyor" kalıyordu; bu, beklemeyi hataya çeviriyor.
 */
export function sor<T>(istek: PromiseLike<T>, saniye = 12): Promise<T> {
  return new Promise<T>((coz, red) => {
    const z = setTimeout(() => red(new Error('network: zaman aşımı')), saniye * 1000)
    Promise.resolve(istek).then(
      v => { clearTimeout(z); coz(v) },
      e => { clearTimeout(z); red(e) },
    )
  })
}

export function hataMetni(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? String(e)
  for (const [k, v] of Object.entries(HATALAR)) if (m.includes(k)) return v
  if (/fetch|network|Failed to/i.test(m)) return 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.'
  return 'Bir şey ters gitti. Tekrar dene.'
}

// Yalnız geliştirmede: tarayıcı testleri Google'a gitmeden test hesabıyla girebilsin.
if (import.meta.env.DEV) {
  const w = window as unknown as { __sb: typeof sb; __hataMetni: typeof hataMetni }
  w.__sb = sb
  w.__hataMetni = hataMetni
}
