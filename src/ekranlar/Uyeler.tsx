import { useEffect, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
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
  cikarilmis: boolean
  sonuc?: 'onay' | 'red'
}

export function Uyeler({ ben }: { ben: Uye }) {
  const [istekler, setIstekler] = useState<BekleyenIstek[] | null>(null)
  const [uyeler, setUyeler] = useState<Uye[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [mesgul, setMesgul] = useState<string | null>(null)
  const [cikarilacak, setCikarilacak] = useState<Uye | null>(null)
  // Düğmeler satıra dokununca açılıyor (Buse, 2026-09-18): hep açıkken 20 kişide
  // 40 düğme alt alta duruyordu.
  const [acik, setAcik] = useState<string | null>(null)

  async function yukle() {
    const [i, u] = await sor(Promise.all([
      sb.rpc('bekleyen_istekler'),
      sb.rpc('uye_listesi'),
    ]))
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

  /** Karar 99: satır duruyor, kareler ve ad geçmişte kalıyor; değişen tek şey giriş. */
  async function cikar(u: Uye, cikarilsin: boolean) {
    setMesgul(u.id)
    setHata(null)
    const { error } = await sb.rpc('uye_cikar', { p_uye: u.id, p_cikar: cikarilsin })
    setMesgul(null)
    setCikarilacak(null)
    if (error) return setHata(hataMetni(error))
    setAcik(null)
    yukle().catch(x => setHata(hataMetni(x)))
  }

  /** Yönetici üyeyi çıkarır, yöneticiyi yalnız kurucu çıkarır, kurucu çıkarılmaz. */
  function cikarabilirMi(u: Uye) {
    if (u.rol === 'kurucu' || u.id === ben.id) return false
    return u.rol === 'uye' ? true : ben.rol === 'kurucu'
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
  const icerideki = uyeler.filter(u => !u.cikarildi_at).length
  const kurucu = ben.rol === 'kurucu'

  return (
    <div className="sc">
      <Kunye sol="Profil" geri="profil" sag="Üyeler" />
      <Hata metin={hata} />
      <h2 className="kart-bas">Katılma istekleri<span className={bekleyen > 0 ? 'bekliyor' : undefined}>{bekleyen} bekliyor</span></h2>
      {istekler.length === 0 && <div className="kart bos-kart"><b>Bekleyen istek yok</b></div>}
      {istekler.map(r => (
        <div className="kart istek" key={r.id}>
          <div className="ust"><b>{r.ad}</b>{!r.sonuc && <span className="rozet bekliyor">Bekliyor</span>}</div>
          <div className="mail">{r.eposta}</div>
          {r.cikarilmis && (
            <div className="tekrar"><Ikon ad="info" /><span>Bu kişi kulüpten çıkarılmıştı</span></div>
          )}
          {r.onceki_red > 0 && (
            <div className="tekrar"><Ikon ad="info" /><span>Daha önce {r.onceki_red} kez reddedildi</span></div>
          )}
          <div className={`not ${r.notu ? '' : 'yok'}`}>{r.notu || 'Not bırakmamış'}</div>
          {r.sonuc ? (
            <div className="karar">
              <Ikon ad={r.sonuc === 'onay' ? 'tik' : 'kapat'} />
              <span>{r.sonuc === 'onay'
                ? 'Onaylandı. Uygulamayı açınca içeri girecek.'
                : 'Reddedildi. Kişi görecek, tekrar isteyebilir.'}</span>
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

      <h2 className="kart-bas">Üyeler<span>{icerideki} üye</span></h2>
      <div className="satir-kartlari">{uyeler.map(u => {
        const disarda = !!u.cikarildi_at
        const aksiyonVar = (kurucu && u.rol !== 'kurucu' && !disarda) || cikarabilirMi(u) || disarda
        const satirIci = (
          <>
            <div className="tx"><b>{u.ad}</b><span>{u.eposta}{u.id === ben.id ? ' · sen' : ''}</span></div>
            {/* Yalnız farklı olan rozet taşıyor (Buse, 2026-09-18): 20 kişinin 19'u
                "Üye" yazınca rozet bir şey söylemiyordu */}
            {(disarda || u.rol !== 'uye') && (
              <span className={`rozet ${disarda ? 'disarda' : u.rol}`}>
                {disarda ? 'Çıkarıldı' : u.rol === 'kurucu' ? 'Kurucu' : 'Yönetici'}
              </span>
            )}
          </>
        )
        return (
          <div key={u.id} className={`uye ${disarda ? 'cikarilmis' : ''}`}>
            {aksiyonVar ? (
              <button className="satir acilir" aria-expanded={acik === u.id}
                onClick={() => { setCikarilacak(null); setAcik(acik === u.id ? null : u.id) }}>
                {satirIci}
                <span className="ok"><Ikon ad="asagi" /></span>
              </button>
            ) : (
              <div className="satir" style={{ cursor: 'default' }}>
                {satirIci}
                {/* Okun yeri boş kalıyor: yoksa rozet sütunu açılır satırlarla hizasını kaybediyor */}
                <span className="ok" style={{ visibility: 'hidden' }} aria-hidden="true"><Ikon ad="asagi" /></span>
              </div>
            )}
            {acik !== u.id ? null : cikarilacak?.id === u.id ? (
              <div className="onaykutu">
                <b>{u.ad} çıkarılsın mı?</b>
                <p>Kareleri ve adı geçmiş etkinliklerde kalır. Uygulamaya giremez, istek bırakarak geri dönebilir.</p>
                <div className="akt">
                  <button className="btn ik kucuk" onClick={() => setCikarilacak(null)}>Vazgeç</button>
                  <button className="btn kucuk" disabled={mesgul === u.id} onClick={() => cikar(u, true)}>Çıkar</button>
                </div>
              </div>
            ) : (
              ((kurucu && u.rol !== 'kurucu' && !disarda) || cikarabilirMi(u) || disarda) && (
                <div className="rolakt">
                  {kurucu && u.rol !== 'kurucu' && !disarda && (
                    <button disabled={mesgul === u.id} onClick={() => rol(u)}>
                      {u.rol === 'uye' ? 'Yönetici yap' : 'Yöneticilikten çıkar'}
                    </button>
                  )}
                  {disarda
                    ? <button disabled={mesgul === u.id} onClick={() => cikar(u, false)}>Geri al</button>
                    : cikarabilirMi(u) && <button disabled={mesgul === u.id} onClick={() => setCikarilacak(u)}>Kulüpten çıkar</button>}
                </div>
              )
            )}
          </div>
        )
      })}</div>
      {kurucu && <p className="veri">Yöneticiyi yalnız kurucu ekler ve çıkarır.</p>}
    </div>
  )
}
