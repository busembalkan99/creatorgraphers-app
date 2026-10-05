import { sb } from './supabase'

// Kareler R2'de (karar 127). Tarayıcı dosyayı kare-adres'in verdiği süreli adrese doğrudan koyuyor;
// izin ve sahiplik veritabanında (dosya_izni, dosyalar).
const cagir = async <T>(govde: object) => {
  const { data, error } = await sb.functions.invoke('kare-adres', { body: govde })
  if (error) {
    // Sunucunun hata kodu (yetki_yok, dosya_yok…) hataMetni'nin tanıdığı biçimde iletiliyor
    const cevap = (error as { context?: Response }).context
    const kod = await cevap?.json?.().then((g: { hata?: string }) => g?.hata).catch(() => undefined)
    throw new Error(kod ?? error.message)
  }
  return data as T
}

/** Yükleme: izin → R2'ye PUT → onay. Hata fırlatır; çağıran ekran mesajı gösteriyor. */
export async function kareYukle(yol: string, blob: Blob) {
  const { adres, basliklar } = await cagir<{ adres: string; basliklar: Record<string, string> }>({ is: 'yukle', yol })
  const r = await fetch(adres, { method: 'PUT', body: blob, headers: basliklar })
  if (!r.ok) throw new Error('dosya_yok')
  await cagir({ is: 'onayla', yol })
}

/** Silme: sunucu yalnız sahibinin dosyasını siliyor. Hata yutuluyor (kare kaydı zaten silindi, eskisi gibi). */
export async function kareSil(yollar: string[]) {
  await cagir({ is: 'sil', yollar }).catch(() => {})
}
