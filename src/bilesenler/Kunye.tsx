import { Ikon } from './Ikon'
import { git } from '../lib/yol'

export function Kunye({ sol, sag, geri }: { sol: string; sag?: string; geri?: string }) {
  return (
    // Sabit ust cubuk: mast ve 4px ayrac birlikte yapisiyor (karar 100)
    <header className="tepe">
      <div className="mast">
        {geri ? (
          <button className="geri" onClick={() => git(geri)}>
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
