import type { ReactNode } from 'react'
import type { SK } from './plan'
import { Foto } from './ortak'
import { iki, baskiOlcu } from './bicim'

/** Kontakt baskının parçaları (karar 126). Set kontakt.tsx'te. Film karesinin sınıfı k-kare: uygulamanın genel
 *  .kare kuralı (index.css) çentik payı ekliyor, ana ekrandaki iPhone'da fotoğrafı yok ediyordu. */

const YOL = {
  // Fotoğraf etrafında: ucu içe kıvrılıyor, elle çizilmiş gibi
  foto: 'M26 104 C 18 30, 274 14, 286 92 C 296 166, 72 198, 30 132 C 16 108, 58 60, 124 52',
  // Yazı ve puan etrafında: ucu kenar boyunca bitiyor, rakamı kesmiyor (karar 130)
  yazi: 'M60 40 C 130 6, 252 10, 286 80 C 302 150, 204 194, 120 188 C 40 182, 2 132, 14 92 C 22 58, 62 30, 116 20',
}
/** Yağlı kalemle elle çizilmiş daire. Dinlenme hâli çizili; hareket çizgiyi baştan çiziyor (stroke-dashoffset). */
export const Daire = ({ gecikme = 0, tur = 'foto' }: { gecikme?: number; tur?: 'foto' | 'yazi' }) => (
  <svg className={`kalem-daire ${tur}`} viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true">
    <path pathLength={1} style={{ animationDelay: `${gecikme}s` }} d={YOL[tur]} />
  </svg>
)

/**
 * Negatif şeridi: kareler yan yana, kenarlarda delikler ve kenar yazısı. Şerit sağdan kayıp duruyor.
 * Kareler ortalanıyor; hedef kare(ler) ortada kalsın diye çağıran baştan ve sondan eşit sayıda kare veriyor.
 * Kenardaki numara sıralamadaki yer; sıraya girmeyen karenin numarası yok (karar 52).
 */
export function Serit({ kareler, kenar, secili = [], kucuk, gecikme = 1.1, numarasiz }:
  { kareler: (SK | null)[]; kenar: string; secili?: number[]; kucuk?: boolean; gecikme?: number; numarasiz?: boolean }) {
  return (
    <div className={`serit-pencere${kucuk ? ' kucuk' : ''}`}>
      <div className="serit">
        <span className="kenar ust">{kenar}</span>
        {kareler.map((k, j) => (
          <div key={k?.id ?? `bos${j}`} className={`k-kare${secili.includes(j) ? ' secili' : ''}`}>
            {k ? <Foto k={k} /> : <span className="bos-kare" />}
            {!numarasiz && k?.sirali && k.sira != null && <span className="kare-no">▸ {iki(k.sira)}</span>}
            {secili.includes(j) && k && <>
              <Daire gecikme={gecikme + secili.indexOf(j) * 0.5} />
              <span className="kalem-no" style={{ animationDelay: `${gecikme + 0.8 + secili.indexOf(j) * 0.5}s` }}>{k.sira ?? ''}</span>
            </>}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Kalemle düşülmüş not: isim ve puan, ünlemsiz. */
export const Not = ({ children, gecikme = 1.9 }: { children: ReactNode; gecikme?: number }) => (
  <div className="kalem-not" style={{ animationDelay: `${gecikme}s` }}>{children}</div>
)

/** Masaya düşmüş baskı: fotoğraf kendi oranında (bicim.baskiOlcu), alt payda numara ya da kenar yazısı. */
export function Baski({ k, maxW, maxH, aci, gecikme = 0, children }:
  { k: SK | null; maxW: number; maxH: number; aci: number; gecikme?: number; children?: ReactNode }) {
  const { w, h } = baskiOlcu(k ?? { genislik: 0, yukseklik: 0 }, maxW, maxH)
  return (
    <div className="baski" style={{ ['--aci' as string]: `${aci}deg`, animationDelay: `${gecikme}s` }}>
      {k?.url ? <Foto k={k} stil={{ width: w, height: h }} /> : <span className="bos-foto" style={{ display: 'block', width: w, height: h }} />}
      {children}
    </div>
  )
}

/** Lüp: karenin büyütülmüş hâli, daire içinde. Sap sağ altta, daireyle aynı kapta kayıyor. `gez`: kareler arasında gezip duruyor. */
export function Lup({ k, boy = 280, sol, ust, gez }: { k: SK | null; boy?: number | string; sol: number | string; ust: number | string; gez?: boolean }) {
  return (
    <div className={`lup-kap${gez ? ' gez' : ''}`} style={{ width: boy, height: boy, left: sol, top: ust }} aria-hidden="true">
      <div className="lup"><Foto k={k} /></div>
      <span className="lup-sap" />
    </div>
  )
}
