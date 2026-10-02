import type { ReactNode } from 'react'
import type { SK } from './plan'
import { Foto } from './ortak'
import { iki } from './bicim'

/** Kontakt baskının parçaları (karar 126). Set kontakt.tsx'te. */

/** Yağlı kalemle elle çizilmiş daire. Dinlenme hâli çizili; hareket çizgiyi baştan çiziyor (stroke-dashoffset). */
export const Daire = ({ gecikme = 0 }: { gecikme?: number }) => (
  <svg className="kalem-daire" viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true">
    <path pathLength={1} style={{ animationDelay: `${gecikme}s` }}
      d="M26 104 C 18 30, 274 14, 286 92 C 296 166, 72 198, 30 132 C 16 108, 58 60, 124 52" />
  </svg>
)

/**
 * Negatif şeridi: kareler yan yana, kenarlarda delikler ve kenar yazısı. Şerit sağdan kayıp duruyor.
 * Kareler ortalanıyor; hedef kare(ler) ortada kalsın diye çağıran baştan ve sondan eşit sayıda kare veriyor.
 * Kenardaki numara sıralamadaki yer; sıraya girmeyen karenin numarası yok (karar 52).
 */
export function Serit({ kareler, kenar, secili = [], kucuk, gecikme = 1.1 }:
  { kareler: (SK | null)[]; kenar: string; secili?: number[]; kucuk?: boolean; gecikme?: number }) {
  return (
    <div className={`serit-pencere${kucuk ? ' kucuk' : ''}`}>
      <div className="serit">
        <span className="kenar ust">{kenar}</span>
        {kareler.map((k, j) => (
          <div key={k?.id ?? `bos${j}`} className={`kare${secili.includes(j) ? ' secili' : ''}`}>
            {k ? <Foto k={k} /> : <span className="bos-kare" />}
            {k?.sirali && k.sira != null && <span className="kare-no">▸ {iki(k.sira)}</span>}
            {secili.includes(j) && k && <>
              <Daire gecikme={gecikme + secili.indexOf(j) * 0.5} />
              <span className="kalem-no" style={{ animationDelay: `${gecikme + 0.8 + secili.indexOf(j) * 0.5}s` }}>{k.sira ?? ''}</span>
            </>}
          </div>
        ))}
        <span className="kenar alt">Creatorgraphers</span>
      </div>
    </div>
  )
}

/** Kalemle düşülmüş not: isim ve puan, ünlemsiz. */
export const Not = ({ children, gecikme = 1.9 }: { children: ReactNode; gecikme?: number }) => (
  <div className="kalem-not" style={{ animationDelay: `${gecikme}s` }}>{children}</div>
)
