import { useEffect, useState } from 'react'
import { geriDon, konumKaydet } from './kaydirma'

const oku = () => window.location.hash.replace(/^#\/?/, '') || 'etkinlikler'

// Uygulamanın kendi yaptığı geçişler işaretleniyor. Tarayıcı adres değişimini geri
// tuşundan ayırmıyor; işaretsiz bir değişim geri ya da ileri hareketi demek.
let bizden = false
let simdiki = oku()
window.addEventListener('hashchange', () => {
  konumKaydet(simdiki)
  if (!bizden) geriDon()
  bizden = false
  simdiki = oku()
})

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

export function git(yol: string) {
  // Aynı adrese geçiş olay üretmiyor; işaret kalırsa sonraki gerçek geri hareketi
  // bizim geçişimiz sanılırdı.
  if (oku() === yol) return
  bizden = true
  window.location.hash = '/' + yol
}

/** Künyedeki geri bağlantısı: geçiş geri hareketi sayılır, bırakılan yer geri gelir. */
export function geriGit(yol: string) {
  geriDon()
  git(yol)
}
