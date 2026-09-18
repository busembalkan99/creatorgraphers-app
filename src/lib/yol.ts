import { useEffect, useState } from 'react'
import { geriDon, konumKaydet } from './kaydirma'

const oku = () => window.location.hash.replace(/^#\/?/, '') || 'etkinlikler'

/**
 * Geçişin yönü, sayfa hareketini seçiyor (Buse, 2026-09-18: iOS gibi).
 * ileri: alt ekrana giriş, sağdan kayarak gelir · geri: önceki sayfa soldan belirir ·
 * sekme: alttaki sekmeler arası, hareket yok · ilk: sayfa ilk açılış, hareket yok.
 */
export type Yon = 'ileri' | 'geri' | 'sekme' | 'ilk'

// Uygulamanın kendi yaptığı geçişler işaretleniyor. Tarayıcı adres değişimini geri
// tuşundan ayırmıyor; işaretsiz bir değişim geri ya da ileri hareketi demek.
let bizden = false
let bekleyenYon: Yon = 'ileri'
let yon: Yon = 'ilk'
let simdiki = oku()
window.addEventListener('hashchange', () => {
  konumKaydet(simdiki)
  if (!bizden) geriDon()
  yon = bizden ? bekleyenYon : 'geri'
  bizden = false
  bekleyenYon = 'ileri'
  simdiki = oku()
})

/** Son geçişin yönü. Ekran değişirken okunur. */
export const sonYon = () => yon

/** Basit hash yönlendirme: #/yukle, #/profil ... GitHub Pages'te sunucu ayarı gerektirmez. */
export function useYol() {
  const [yol, setYol] = useState(oku)
  useEffect(() => {
    const f = () => setYol(oku())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return yol
}

export function git(yol: string, gecis: Yon = 'ileri') {
  // Aynı adrese geçiş olay üretmiyor; işaret kalırsa sonraki gerçek geri hareketi
  // bizim geçişimiz sanılırdı.
  if (oku() === yol) return
  bizden = true
  bekleyenYon = gecis
  window.location.hash = '/' + yol
}

/** Künyedeki geri bağlantısı: geçiş geri hareketi sayılır, bırakılan yer geri gelir. */
export function geriGit(yol: string) {
  geriDon()
  git(yol, 'geri')
}

/** Alttaki sekmeler: hareket yok, liste baştan açılır. */
export const sekmeGit = (yol: string) => git(yol, 'sekme')
