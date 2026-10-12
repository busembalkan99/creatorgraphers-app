import { useEffect, useState } from 'react'
import { Ikon } from './Ikon'
import { sb } from '../lib/supabase'
import { git, sekmeGit } from '../lib/yol'
import { SEKMELER, YONETIM } from '../lib/sekmeler'

/** Masaüstü gezinmesi (karar 129). 768+'da alt sekme çubuğunun yerinde; telefonda CSS'le gizli. */
export function Ray({ sekme, yol, yonetici }: { sekme: string; yol: string; yonetici: boolean }) {
  const [uyeSayisi, setUyeSayisi] = useState<number | null>(null)
  useEffect(() => { sb.rpc('uye_sayisi').then(r => { if (!r.error) setUyeSayisi(Number(r.data)) }) }, [])
  const yonetimde = YONETIM.find(y => y.yol === yol)
  return (
    <nav className="m-ray" aria-label="Gezinme">
      <span className="m-ray-ad"><span className="m-uzun">Creatorgraphers</span><span className="m-kisa" aria-hidden="true">CG</span></span>
      <div className="m-ray-rb" />
      {SEKMELER.map(s => {
        const on = !yonetimde && sekme === s.yol
        return (
          <a key={s.yol} href={`#/${s.yol}`} className={on ? 'on' : ''} title={s.ad} aria-label={s.ad} aria-current={on ? 'page' : undefined}
            onClick={e => { e.preventDefault(); sekmeGit(s.yol) }}>
            <Ikon ad={s.ikon} /><span className="m-uzun">{s.ad}</span>
          </a>
        )
      })}
      {yonetici && (
        <div className="m-ray-grup">
          <span className="m-ray-lb m-uzun">Yönetim</span>
          {YONETIM.map(s => (
            <a key={s.yol} href={`#/${s.yol}`} className={yonetimde === s ? 'on' : ''} title={s.ad} aria-label={s.ad}
              aria-current={yonetimde === s ? 'page' : undefined} onClick={e => { e.preventDefault(); git(s.yol) }}>
              <Ikon ad={s.ikon} /><span className="m-uzun">{s.ad}</span>
            </a>
          ))}
        </div>
      )}
      {uyeSayisi != null && <span className="m-ray-alt">{uyeSayisi} üye</span>}
    </nav>
  )
}
