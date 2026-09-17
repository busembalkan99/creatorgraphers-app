import { useEffect, useState } from 'react'

/** Basit hash yönlendirme: #/yukle, #/profil ... GitHub Pages'te sunucu ayarı gerektirmez. */
export function useYol() {
  const oku = () => window.location.hash.replace(/^#\/?/, '') || 'etkinlikler'
  const [yol, setYol] = useState(oku)
  useEffect(() => {
    const f = () => {
      setYol(oku())
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return yol
}

export function git(yol: string) {
  window.location.hash = '/' + yol
}
