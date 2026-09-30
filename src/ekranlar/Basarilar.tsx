import { BASARILAR, seviyeBul, type BasariAnahtari } from '../lib/basarilar'
import { Rozet } from '../bilesenler/Rozet'

export type BasariSayilari = Record<BasariAnahtari, number>

/**
 * Profil'de Başarılar (karar 115). Kendi profilinde hepsi, kilitliler ve ilerleme dahil;
 * başkasının profilinde yalnız kazanılanlar. Kendinde liste (ne yapacağın ve ilerleme), başkasında
 * küçük rozet ızgarası (Buse, 2026-09-30).
 */
export function Basarilar({ sayilar, benim }: { sayilar: BasariSayilari | null; benim: boolean }) {
  if (!sayilar) return null
  const hepsi = BASARILAR.map(b => ({ b, s: seviyeBul(b, sayilar[b.anahtar]) }))
  const gorunen = benim ? hepsi : hepsi.filter(x => x.s.kazanildi)
  const kazanilan = hepsi.filter(x => x.s.kazanildi).length
  if (!benim && gorunen.length === 0) return null
  const ilerleme = (x: (typeof hepsi)[number]) =>
    x.s.son ? 'En üst seviye' : `${x.s.sayi} / ${x.s.hedef} ${x.b.birim}`

  return (
    <>
      <h2 className="kart-bas">Başarılar{benim && <span>{kazanilan} / {BASARILAR.length}</span>}</h2>
      {!benim ? (
        <div className="kart basari-izgara">
          {gorunen.map(x => (
            <div className={`basari ${x.s.kazanildi ? '' : 'kilitli'}`} key={x.b.anahtar}>
              <Rozet b={x.b} s={x.s} boy={72} />
              <b>{x.b.ad}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="satir-kartlari basari-liste">
          {gorunen.map(x => (
            <div className={`satir basari-satir ${x.s.kazanildi ? '' : 'kilitli'}`} key={x.b.anahtar}>
              <Rozet b={x.b} s={x.s} boy={56} />
              <div className="tx">
                <b>{x.b.ad}</b>
                {benim && <span>{x.b.nasil}</span>}
                {benim && !x.s.son && (
                  <div className="cubuk" style={{ ['--renk' as string]: x.s.kazanildi ? x.b.renk.ana : 'var(--rule)' }}>
                    <i style={{ width: `${Math.min(100, (x.s.sayi / (x.s.hedef ?? 1)) * 100)}%` }} />
                  </div>
                )}
                {benim && <span className="sayi">{ilerleme(x)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
