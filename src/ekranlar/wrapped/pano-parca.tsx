import type { ReactNode } from 'react'
import { panoHarfleri } from './pano-metin'

/** Kalkış tabelasının parçaları (karar 126). Set pano.tsx'te. */
const tr = (s: string) => s.toLocaleUpperCase('tr-TR')

/** Bir satır: her harf bir kutu. Kutuda son harf en üstte, dönerken görünenler altında; hareket dördüncüden
 *  başlayıp son harfte duruyor. Hareketi azaltta hiç oynamıyor, dinlenme hâli zaten son harf.
 *  Ekran okuyucu kutuları değil satırın düz metnini okuyor. */
export function Satir({ metin, en, vurgu, gecikme = 0 }: { metin: string; en?: number; vurgu?: boolean; gecikme?: number }) {
  const harfler = [...tr(metin)]
  const kutu = Math.max(en ?? harfler.length, 1)
  const dolu = [...harfler, ...Array(Math.max(0, kutu - harfler.length)).fill(' ')].slice(0, kutu)
  return (
    <div className={`pano-satir${vurgu ? ' vurgu' : ''}`} {...(metin.trim() ? { role: 'img', 'aria-label': metin } : { 'aria-hidden': true })}>
      {dolu.map((c, i) => (
        <span key={i} className="h" aria-hidden="true">
          <b style={{ animationDelay: `${(gecikme + i * 0.06).toFixed(2)}s` }}>
            <i>{c === ' ' ? ' ' : c}</i>{panoHarfleri(c, i).map((x, j) => <i key={j}>{x}</i>)}
          </b>
        </span>
      ))}
    </div>
  )
}
/** Etiketli alan: "BİRİNCİ" ve altında satırı */
export const Alan = ({ ad, children }: { ad: string; children: ReactNode }) => (
  <div className="pano-alan"><span className="pano-eti">{ad}</span>{children}</div>
)
export const Yan = ({ children }: { children: ReactNode }) => <div className="pano-yan">{children}</div>
