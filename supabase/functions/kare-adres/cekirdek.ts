// kare-adres çekirdeği (karar 127). İzin veritabanında (dosya_izni), imza s3.ts'te. Deno'ya bağlı değil:
// testler düğümde gerçek yerel veritabanına ve yerel S3'e karşı çağırıyor (testler/kare-adres.mjs).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { presign, s3Istek, type S3Ayar } from './s3.ts'

export type Govde = { is: 'oku'; yollar: string[] } | { is: 'yukle'; yol: string } | { is: 'onayla'; yol: string }
  | { is: 'sil'; yollar: string[] } | { is: 'tasi' }
/** kullanici: isteği yapanın oturumuyla (auth.uid() o kişi), uid: o kişi; servis: taşıma ve onaylı kaydı yazmak için */
export type Baglam = { kullanici: SupabaseClient; uid: string; servis: SupabaseClient; s3: S3Ayar }

const OKU = 6 * 3600, YUKLE = 120, EN_COK = 8 * 1024 * 1024
// Dosya adı tekil, içerik değişmiyor: tarayıcı bir yıl önbellekte tutuyor (egress, 2026-09-30)
const KALICI = { 'cache-control': 'max-age=31536000', 'content-type': 'image/jpeg' }
// Var olan nesnenin üstüne yazılmıyor (eski Storage kuralı yalnız eklemeye izin veriyordu)
const BASLIKLAR = { ...KALICI, 'if-none-match': '*' }
const cevap = (durum: number, veri: unknown) => ({ durum, veri })
const izinli = async (b: Baglam, yollar: string[], is: string) =>
  new Set(((await b.kullanici.rpc('dosya_izni', { p_yollar: yollar, p_islem: is })).data ?? []) as string[])
// Yükleme izni yoksa: süre dolduysa ekran bildik "Yükleme kapalı" metnini göstersin, yoksa yetki_yok
const yuklemeRet = async (b: Baglam, yol: string) => {
  const { data } = await b.kullanici.rpc('etkinlik_asamasi', { p_etkinlik: yol.split('/')[0] })
  return cevap(403, { hata: data && data !== 'yukleme' ? 'yukleme_kapali' : 'yetki_yok' })
}

export async function isle(g: Govde, b: Baglam) {
  // Yolu olmayan ya da metin olmayan yükleme isteği izne bile gitmiyor
  if ((g?.is === 'yukle' || g?.is === 'onayla') && typeof g.yol !== 'string') return cevap(400, { hata: 'yol_yok' })
  switch (g?.is) {
    case 'oku': {
      // Sıra korunuyor; izinsiz yola null (ekran karesiz çiziyor)
      const yollar = (Array.isArray(g.yollar) ? g.yollar : []).filter(y => typeof y === 'string').slice(0, 500)
      const iz = await izinli(b, yollar, 'oku')
      return cevap(200, { adresler: await Promise.all(yollar.map(y => (iz.has(y) ? presign(b.s3, 'GET', y, OKU) : null))) })
    }
    case 'yukle':
      if (!(await izinli(b, [g.yol], 'yukle')).has(g.yol)) return yuklemeRet(b, g.yol)
      // Tarayıcı PUT'u tam bu başlıklarla yapıyor (imzaya giriyorlar)
      return cevap(200, { adres: await presign(b.s3, 'PUT', g.yol, YUKLE, BASLIKLAR), basliklar: BASLIKLAR })
    case 'onayla': {
      if (!(await izinli(b, [g.yol], 'yukle')).has(g.yol)) return yuklemeRet(b, g.yol)
      const h = await s3Istek(b.s3, 'HEAD', g.yol)
      if (!h.ok) return cevap(409, { hata: 'dosya_yok' })
      const boyut = Number(h.headers.get('content-length') ?? 0)
      // Kova 8 MB sınırını kendisi uygulamıyor (imzalı PUT boyut taşımıyor): büyükse siliniyor
      if (boyut > EN_COK) { await s3Istek(b.s3, 'DELETE', g.yol); return cevap(413, { hata: 'buyuk' }) }
      // İzin yukarıda kullanıcının oturumuyla soruldu; kaydı servis rolü yazıyor (üye doğrudan çağıramıyor)
      const { error } = await b.servis.rpc('dosya_kaydet', { p_yol: g.yol, p_boyut: boyut, p_sahip: b.uid })
      return error ? cevap(403, { hata: error.message }) : cevap(200, { tamam: true })
    }
    case 'sil': {
      const { data } = await b.kullanici.rpc('dosya_kaydi_sil', { p_yollar: Array.isArray(g.yollar) ? g.yollar : [] })
      const silinen = (data ?? []) as string[]
      await Promise.all(silinen.map(y => s3Istek(b.s3, 'DELETE', y)))
      return cevap(200, { silinen })
    }
    case 'tasi': {
      // Tek seferlik: Supabase Storage'daki bütün kareler R2'ye, sahipleriyle. Tekrar çağrılabilir.
      if (!(await b.kullanici.rpc('yonetici_mi')).data) return cevap(403, { hata: 'yetki_yok' })
      const { data: nesneler, error } = await b.servis.rpc('depo_nesneleri')
      if (error) return cevap(500, { hata: error.message })
      let kopyalanan = 0, atlanan = 0, hata = 0
      for (const n of (nesneler ?? []) as { name: string; owner_id: string }[]) {
        const kayit = (boyut: number) => b.servis.from('dosyalar').upsert(
          { yol: n.name, sahip: n.owner_id, boyut, etkinlik: n.name.split('/')[0] }, { onConflict: 'yol', ignoreDuplicates: true })
        // Zaten R2'deyse kopyalanmıyor; sahiplik kaydı eksikse (yarıda kalmış çalıştırma) tamamlanıyor
        const h = await s3Istek(b.s3, 'HEAD', n.name)
        if (h.ok) { if ((await kayit(Number(h.headers.get('content-length') ?? 0))).error) hata++; else atlanan++; continue }
        const { data: blob } = await b.servis.storage.from('kareler').download(n.name)
        if (!blob) { hata++; continue }
        const govde = new Uint8Array(await blob.arrayBuffer())
        if (!(await s3Istek(b.s3, 'PUT', n.name, govde, KALICI)).ok) { hata++; continue }
        if ((await kayit(govde.length)).error) { hata++; continue }
        kopyalanan++
      }
      return cevap(200, { kopyalanan, atlanan, hata })
    }
    default:
      return cevap(400, { hata: 'bilinmeyen_is' })
  }
}
