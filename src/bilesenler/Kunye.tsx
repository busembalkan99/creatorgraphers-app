import { useLayoutEffect, useRef } from 'react'
import { Ikon } from './Ikon'
import { geriGit } from '../lib/yol'

export function Kunye({ sol, sag, geri }: { sol: string; sag?: string; geri?: string }) {
  // Künyenin yüksekliği ekrana göre değişiyor (geri bağlantısı 44px dokunma alanı taşıyor:
  // 56 ya da 68px). Altına yapışan öğeler (sonuçtaki tema sekmeleri) bu değişkeni kullanıyor.
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const yaz = () => document.documentElement.style.setProperty('--tepe-boy', `${el.getBoundingClientRect().height}px`)
    yaz()
    const g = new ResizeObserver(yaz)
    g.observe(el)
    return () => g.disconnect()
  }, [])
  return (
    // Sabit ust cubuk: mast ve 4px ayrac birlikte yapisiyor (karar 100)
    <header className="tepe" ref={ref}>
      <div className="mast">
        {geri ? (
          <button className="geri" onClick={() => geriGit(geri)}>
            <Ikon ad="geri" />
            {sol}
          </button>
        ) : (
          <span>{sol}</span>
        )}
        {sag && <span className="r">{sag}</span>}
      </div>
      <div className="rb" />
    </header>
  )
}

export function Yukleniyor() {
  return (
    <div className="yukleniyor" role="status" aria-label="Yükleniyor">
      <div className="bar"><i /></div>
    </div>
  )
}

export function Hata({ metin }: { metin: string | null }) {
  if (!metin) return null
  return (
    <div className="hata" role="alert">
      <Ikon ad="info" />
      <span>{metin}</span>
    </div>
  )
}
