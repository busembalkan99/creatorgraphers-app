/**
 * Tuvale çizilecek resim (paylaşım kartı). Kareler R2'de (karar 127): R2, Origin'siz isteğe CORS başlığı koymuyor
 * ve Vary göndermiyor. Sonuç ve Wrapped aynı imzalı adresi CORS'suz <img> ile önbelleğe alınca CORS'lu <img>
 * önbellekten gelip reddediliyor, kart fotoğrafsız çıkıyordu. Resim önbelleğe bakmadan CORS'la indirilip
 * kendi kopyasından çiziliyor; R2'den indirmek ücretsiz.
 */
export async function resimYukle(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null
  try {
    const r = await fetch(url, { mode: 'cors', cache: 'no-store' })
    if (!r.ok) return null
    const adres = URL.createObjectURL(await r.blob())
    return await new Promise(son => {
      const im = new Image()
      im.onload = () => son(im)
      im.onerror = () => son(null)
      im.src = adres
    })
  } catch {
    return null
  }
}
