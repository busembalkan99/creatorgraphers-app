import { useEffect, useState } from 'react'
import { sb, hataMetni } from '../lib/supabase'
import type { Etkinlik, Uye } from '../lib/tipler'
import { asama, ayAdi, kalanYaz, saatYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Hata, Kunye } from '../bilesenler/Kunye'
import { acikEtkinlik } from './Etkinlikler'

/**
 * Profil. Yönetim Profil'in içinde, yalnız yöneticiye görünen blok (karar 83).
 * Prototip: v21 (giriş ekranı).
 */
export function Profil({ uye, uyeDegisti }: { uye: Uye; uyeDegisti: (u: Uye) => void }) {
  const [bekleyen, setBekleyen] = useState<number | null>(null)
  const [acik, setAcik] = useState<Etkinlik | null | undefined>(undefined)
  const [hata, setHata] = useState<string | null>(null)
  const yonetici = uye.rol !== 'uye'

  useEffect(() => {
    if (!yonetici) return
    ;(async () => {
      const [b, e] = await Promise.all([
        sb.rpc('bekleyen_istekler'),
        sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false }),
      ])
      if (b.error) throw b.error
      if (e.error) throw e.error
      setBekleyen((b.data ?? []).length)
      setAcik(acikEtkinlik((e.data ?? []) as Etkinlik[]) ?? null)
    })().catch(x => setHata(hataMetni(x)))
  }, [yonetici])

  async function afis() {
    const yeni = !uye.afis_izni
    uyeDegisti({ ...uye, afis_izni: yeni })
    const { error } = await sb.from('uyeler').update({ afis_izni: yeni }).eq('id', uye.id)
    if (error) {
      uyeDegisti({ ...uye, afis_izni: !yeni })
      setHata(hataMetni(error))
    }
  }

  const rolAdi = uye.rol === 'kurucu' ? 'Kulüp kurucusu' : uye.rol === 'yonetici' ? 'Yönetici' : 'Üye'

  return (
    <div className="sc">
      <Kunye sol="Creatorgraphers" sag="Profil" />
      <div className="sec">Profilin<span>{uye.ad}</span></div>
      <div className="satir" style={{ cursor: 'default' }}>
        <div className="tx"><b>{rolAdi}</b><span>{uye.eposta}</span></div>
      </div>
      <button className="izin" onClick={afis} aria-pressed={uye.afis_izni} style={{ marginTop: 0 }}>
        <span className={`box ${uye.afis_izni ? 'on' : ''}`} />
        <span><b>Kulüp afişi</b><span>Kazanırsam karem kulüp afişinde kullanılabilir.</span></span>
      </button>

      {yonetici && (
        <>
          <div className="sec">Yönetim</div>
          {bekleyen !== null && bekleyen > 0 && (
            <button className="satir" onClick={() => git('uyeler')}>
              <div className="tx"><b>{bekleyen} katılma isteği</b><span>Onaylaman ya da reddetmen bekleniyor</span></div>
              <div className="deg">Aç</div>
            </button>
          )}
          {acik === null && (
            <button className="satir" onClick={() => git('kur')}>
              <div className="tx"><b>Etkinliği kur</b><span>Açık etkinlik yok</span></div>
              <div className="deg">Kur</div>
            </button>
          )}
          {acik && (
            <button className="satir" onClick={() => git('asama')}>
              <div className="tx">
                <b>{ayAdi(acik.bulusma_gunu)} etkinliği</b>
                <span>{asamaCumlesi(acik)}</span>
              </div>
              <div className="deg">Aç</div>
            </button>
          )}
          <button className="satir" onClick={() => git('uyeler')}>
            <div className="tx"><b>Üyeler</b><span>{uye.rol === 'kurucu' ? 'İstekler, roller' : 'Katılma istekleri, üye listesi'}</span></div>
            <div className="deg">Aç</div>
          </button>
        </>
      )}

      <Hata metin={hata} />
      <div className="bosluk" />
      <button className="btn ik" onClick={() => sb.auth.signOut()}>Çıkış yap</button>
    </div>
  )
}

function asamaCumlesi(e: Etkinlik) {
  const a = asama(e)
  if (a === 'baslamadi') return `Yükleme açılışı: ${saatYaz(e.yukleme_baslar)}`
  if (a === 'yukleme') return `Yükleme açık · ${kalanYaz(e.yukleme_biter)} kaldı`
  return `Oylama açık · ${kalanYaz(e.oylama_biter)} kaldı`
}
