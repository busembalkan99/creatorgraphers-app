import { useState } from 'react'
import { createPortal } from 'react-dom'
import { sb, hataMetni } from '../lib/supabase'
import { Hata } from './Kunye'

/* Kareyi yarışmadan çıkarma (karar 103). Yönetici oylamada kareyi isimsiz görüyor,
   sonuçtan sonra isimli; ikisinde de aynı pencere. Sahibi nedeni görüyor, geri alınabiliyor. */
export function CikarPenceresi({ kare, bitti, kapat }: { kare: string; bitti: () => void; kapat: () => void }) {
  const [neden, setNeden] = useState('')
  const [gidiyor, setGidiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function cikar() {
    setGidiyor(true)
    setHata(null)
    const { error } = await sb.rpc('kare_cikar', { p_kare: kare, p_neden: neden })
    setGidiyor(false)
    if (error) return setHata(hataMetni(error))
    bitti()
  }

  return createPortal(
    <div className="pencere" role="dialog" aria-modal="true" aria-labelledby="cikar-bas" onClick={x => { if (x.target === x.currentTarget) kapat() }}>
      <div className="kutu">
        <div className="bas" id="cikar-bas"><span>Bu kare yarışmadan çıkarılsın mı?</span></div>
        <p>Sahibi nedenini görür. Geri alabilirsin.</p>
        <div className="alan">
          <label className="lab" htmlFor="cikar-neden">Neden</label>
          <input id="cikar-neden" className="not" value={neden} maxLength={140} autoFocus enterKeyHint="done"
            placeholder="ÖRNEK: BAŞKA GÜN ÇEKİLMİŞ" onChange={x => setNeden(x.target.value)} />
        </div>
        <Hata metin={hata} />
        <div className="akt">
          <button className="btn ik" onClick={kapat}>Vazgeç</button>
          <button className="btn" disabled={!neden.trim() || gidiyor} onClick={cikar}>Yarışmadan çıkar</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
