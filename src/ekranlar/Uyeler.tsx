import { useEffect, useState } from 'react'
import { sb, hataMetni } from '../lib/supabase'
import type { Uye } from '../lib/tipler'
import { Ikon } from '../bilesenler/Ikon'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'

/** Katılma istekleri (karar 95) ve üyeler, roller (karar 86). Prototip: v21 Üyeler. */

interface BekleyenIstek {
  id: string
  ad: string
  eposta: string
  notu: string | null
  onceki_red: number
  sonuc?: 'onay' | 'red'
}

export function Uyeler({ ben }: { ben: Uye }) {
  const [istekler, setIstekler] = useState<BekleyenIstek[] | null>(null)
  const [uyeler, setUyeler] = useState<Uye[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [mesgul, setMesgul] = useState<string | null>(null)

  async function yukle() {
    const [i, u] = await Promise.all([
      sb.rpc('bekleyen_istekler'),
      sb.rpc('uye_listesi'),
    ])
    if (i.error) throw i.error
    if (u.error) throw u.error
    setIstekler(prev => {
      // Karar verilenler sonuç satırıyla ekranda kalsın
      const karar = (prev ?? []).filter(p => p.sonuc)
      return [...karar, ...((i.data ?? []) as BekleyenIstek[]).filter(n => !karar.some(k => k.id === n.id))]
    })
    setUyeler((u.data ?? []) as Uye[])
  }

  useEffect(() => {
    yukle().catch(x => setHata(hataMetni(x)))
  }, [])

  async function karar(id: string, onay: boolean) {
    setMesgul(id)
    setHata(null)
    const { error } = await sb.rpc('istek_karar', { p_istek: id, p_onay: onay })
    setMesgul(null)
    if (error) return setHata(hataMetni(error))
    setIstekler(l => (l ?? []).map(x => (x.id === id ? { ...x, sonuc: onay ? 'onay' : 'red' } : x)))
    if (onay) yukle().catch(x => setHata(hataMetni(x)))
  }

  async function rol(u: Uye) {
    setMesgul(u.id)
    setHata(null)
    const { error } = await sb.rpc('rol_degistir', { p_uye: u.id, p_yonetici: u.rol === 'uye' })
    setMesgul(null)
    if (error) return setHata(hataMetni(error))
    yukle().catch(x => setHata(hataMetni(x)))
  }

  if (!istekler || !uyeler) {
    return hata
      ? <div className="sc"><Kunye sol="Profil" geri="profil" sag="Üyeler" /><Hata metin={hata} /></div>
      : <Yukleniyor />
  }

  const bekleyen = istekler.filter(i => !i.sonuc).length
  const kurucu = ben.rol === 'kurucu'

  return (
    <div className="sc">
      <Kunye sol="Profil" geri="profil" sag="Üyeler" />
      <Hata metin={hata} />
      <div className="sec">Katılma istekleri<span>{bekleyen} bekliyor</span></div>
      {istekler.length === 0 && <p className="veri">Bekleyen istek yok.</p>}
      {istekler.map(r => (
        <div className="istek" key={r.id}>
          <div className="ust"><b>{r.ad}</b>{!r.sonuc && <span className="rozet bekliyor">Bekliyor</span>}</div>
          <div className="mail">{r.eposta}</div>
          {r.onceki_red > 0 && (
            <div className="tekrar"><Ikon ad="info" /><span>Daha önce {r.onceki_red} kez reddedildi</span></div>
          )}
          <div className={`not ${r.notu ? '' : 'yok'}`}>{r.notu || 'Not bırakmamış'}</div>
          {r.sonuc ? (
            <div className="karar">
              <Ikon ad={r.sonuc === 'onay' ? 'tik' : 'kapat'} />
              <span>{r.sonuc === 'onay'
                ? 'Onaylandı. Uygulamayı açınca içeri girecek.'
                : 'Reddedildi. Kişi bunu görecek, isterse tekrar isteyebilir.'}</span>
            </div>
          ) : (
            <div className="akt">
              <button className="btn ik kucuk" disabled={mesgul === r.id} onClick={() => karar(r.id, false)}>
                <Ikon ad="kapat" />Reddet
              </button>
              <button className="btn kucuk" disabled={mesgul === r.id} onClick={() => karar(r.id, true)}>
                <Ikon ad="tik" />Onayla
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="sec">Üyeler<span>{uyeler.length} üye</span></div>
      {uyeler.map(u => (
        <div key={u.id}>
          <div className="satir" style={{ cursor: 'default' }}>
            <div className="tx"><b>{u.ad}</b><span>{u.eposta}{u.id === ben.id ? ' · sen' : ''}</span></div>
            <span className={`rozet ${u.rol}`}>{u.rol === 'kurucu' ? 'Kurucu' : u.rol === 'yonetici' ? 'Yönetici' : 'Üye'}</span>
          </div>
          {kurucu && u.rol !== 'kurucu' && (
            <div className="rolakt">
              <button disabled={mesgul === u.id} onClick={() => rol(u)}>
                {u.rol === 'uye' ? 'Yönetici yap' : 'Yöneticilikten çıkar'}
              </button>
            </div>
          )}
        </div>
      ))}
      {kurucu && <p className="veri">Yöneticileri yalnız kurucu ekleyip çıkarabiliyor.</p>}
    </div>
  )
}
