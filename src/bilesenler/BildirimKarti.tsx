import { useEffect, useState } from 'react'
import { ac, durum, hizliDurum, type BildirimDurumu } from '../lib/bildirim'

const GIZLE = 'bildirim-karti-gizli'
/** Bir kez çıkan davet kartı (karar 120). Etkinlikler ve bekleme ekranında. */
export function BildirimKarti({ bekleme = false }: { bekleme?: boolean }) {
  const [d, setD] = useState<BildirimDurumu | null>(() => hizliDurum())
  const [gizli, setGizli] = useState(() => localStorage.getItem(GIZLE) === '1')
  const [mesgul, setMesgul] = useState(false)
  useEffect(() => { durum().then(setD).catch(() => setD('desteklenmiyor')) }, [])
  if (gizli || (d !== 'acilabilir' && d !== 'ana-ekran-gerek')) return null
  const vazgec = () => { localStorage.setItem(GIZLE, '1'); setGizli(true) }
  return (
    <div className="kart bildirim-karti belir">
      {d === 'acilabilir' ? (
        <>
          <b>{bekleme ? 'Onaylanınca haber verelim mi?' : 'Bildirimleri aç'}</b>
          <span>{bekleme ? 'İsteğin onaylanınca telefonuna bildirim gelir.' : 'Yükleme, oylama ve sonuçlar açılınca haber verelim.'}</span>
          <div className="akt">
            <button className="btn ik kucuk" onClick={vazgec}>Şimdi değil</button>
            <button className="btn kucuk" disabled={mesgul} onClick={async () => { setMesgul(true); setD(await ac().catch(() => 'acilabilir' as const)); setMesgul(false) }}>Bildirimleri aç</button>
          </div>
        </>
      ) : (
        <>
          <b>Bildirim için ana ekrana ekle</b>
          <span>Paylaş → Ana Ekrana Ekle, sonra uygulamayı oradan aç.</span>
          <div className="akt"><button className="btn ik kucuk" onClick={vazgec}>Şimdi değil</button></div>
        </>
      )}
    </div>
  )
}
