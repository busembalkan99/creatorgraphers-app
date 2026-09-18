import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ayarEksik, sb, hataMetni, sor } from './lib/supabase'
import type { Uye } from './lib/tipler'
import { git, useYol } from './lib/yol'
import { Ikon } from './bilesenler/Ikon'
import { Hata, Kunye, Yukleniyor } from './bilesenler/Kunye'
import { Cikarildin, Hosgeldin, Kapak, UyeDegil } from './ekranlar/Giris'
import { Etkinlikler } from './ekranlar/Etkinlikler'
import { Yukleme } from './ekranlar/Yukleme'
import { Profil } from './ekranlar/Profil'
import { Uyeler } from './ekranlar/Uyeler'
import { Kur } from './ekranlar/Kur'
import { Asama } from './ekranlar/Asama'
import { Oylama, OylamaTema } from './ekranlar/Oylama'
import { Sonuc } from './ekranlar/Sonuc'
import { Siralama } from './ekranlar/Siralama'

export default function App() {
  if (ayarEksik) return <AyarEksik />
  return <Oturum />
}

function Oturum() {
  const [oturum, setOturum] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setOturum(data.session))
    const { data } = sb.auth.onAuthStateChange((_olay, s) => setOturum(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <div className="app">
      {oturum === undefined
        ? <div className="sc"><Kunye sol="Creatorgraphers" /><Yukleniyor /></div>
        : oturum === null ? <Kapak /> : <Icerik oturum={oturum} />}
    </div>
  )
}

function Icerik({ oturum }: { oturum: Session }) {
  const kullanici = oturum.user
  const [uye, setUye] = useState<Uye | null | undefined>(undefined)
  const [hata, setHata] = useState<string | null>(null)
  const [istekAcik, setIstekAcik] = useState(false)

  const uyeYukle = useCallback(async () => {
    const { data, error } = await sor(sb.rpc('ben').maybeSingle()).catch(e => ({ data: null, error: e }))
    if (error) return setHata(hataMetni(error))
    setUye((data as Uye | null) ?? null)
  }, [kullanici.id])

  useEffect(() => {
    uyeYukle()
  }, [uyeYukle])

  if (hata) {
    return (
      <div className="sc">
        <Kunye sol="Creatorgraphers" />
        <Hata metin={hata} />
        <button className="btn" onClick={() => { setHata(null); uyeYukle() }}>Tekrar dene</button>
      </div>
    )
  }
  // Künyeli yükleme: ilk boyamada ekran tamamen boş kalmasın, çerçeve yerinde dursun
  if (uye === undefined) return <div className="sc"><Kunye sol="Creatorgraphers" /><Yukleniyor /></div>
  if (uye === null) return <UyeDegil kullanici={kullanici} uyeOldu={uyeYukle} />
  // Karar 99: çıkarılan kişi kapalı ekranı görür, isterse oradan istek bırakır
  if (uye.cikarildi_at && !istekAcik) {
    return <Cikarildin istekBirak={() => setIstekAcik(true)} />
  }
  if (uye.cikarildi_at) return <UyeDegil kullanici={kullanici} uyeOldu={uyeYukle} cikarildi />
  if (!uye.hosgeldin_goruldu && uye.rol !== 'kurucu') {
    return (
      <Hosgeldin
        ad={uye.ad}
        devam={() => {
          setUye({ ...uye, hosgeldin_goruldu: true })
          sb.from('uyeler').update({ hosgeldin_goruldu: true }).eq('id', uye.id).then()
          git('etkinlikler')
        }}
      />
    )
  }
  return <Uygulama uye={uye} uyeDegisti={setUye} />
}

const SEKMELER = [
  { yol: 'etkinlikler', ad: 'Etkinlikler', ikon: 'film' },
  { yol: 'siralama', ad: 'Sıralama', ikon: 'sira' },
  { yol: 'profil', ad: 'Profil', ikon: 'kisi' },
] as const

function Uygulama({ uye, uyeDegisti }: { uye: Uye; uyeDegisti: (u: Uye) => void }) {
  const yol = useYol()
  const yonetici = uye.rol !== 'uye'

  let ekran
  let sekme = 'etkinlikler'
  // Alt ekranlarda (yükleme, yönetim) sekme çubuğu yok; geri bağlantısı var.
  let altEkran = true
  const temaId = yol.startsWith('oyla/') ? yol.slice(5) : null
  const sonucId = yol.startsWith('sonuc/') ? yol.slice(6) : null
  // profil/<kimlik>: başkasının profili, alt ekran. Kendi kimliğin sekmeye düşüyor.
  const kisiId = yol.startsWith('profil/') && yol.slice(7) !== uye.id ? yol.slice(7) : null
  const profil = <Profil uye={uye} uyeDegisti={uyeDegisti} hedef={kisiId ?? undefined} />
  const hedef = yonetici || !['uyeler', 'kur', 'asama'].includes(yol)
    ? temaId ? 'oyla-tema' : sonucId ? 'sonuc' : kisiId ? 'kisi' : yol.startsWith('profil') ? 'profil' : yol
    : 'profil'
  switch (hedef) {
    case 'sonuc':
      ekran = <Sonuc uye={uye} etkinlikId={sonucId!} />
      break
    case 'oyla':
      ekran = <Oylama uye={uye} />
      break
    case 'oyla-tema':
      ekran = <OylamaTema uye={uye} temaId={temaId!} />
      break
    case 'yukle':
      ekran = <Yukleme uye={uye} uyeDegisti={uyeDegisti} />
      break
    case 'uyeler':
      ekran = <Uyeler ben={uye} />
      break
    case 'kur':
      ekran = <Kur />
      break
    case 'asama':
      ekran = <Asama />
      break
    case 'siralama':
      ekran = <Siralama uye={uye} />
      sekme = 'siralama'
      altEkran = false
      break
    case 'kisi':
      ekran = profil
      break
    case 'profil':
      ekran = profil
      sekme = 'profil'
      altEkran = false
      break
    default:
      ekran = <Etkinlikler uye={uye} />
      altEkran = false
  }

  return (
    <>
      {/* key: aynı ekrana geri dönünce veri tazelensin */}
      <div key={yol} style={{ display: 'contents' }}>{ekran}</div>
      {!altEkran && (
        <nav className="tabs">
          {SEKMELER.map(s => (
            <button key={s.yol} className={sekme === s.yol ? 'on' : ''} aria-current={sekme === s.yol ? 'page' : undefined} onClick={() => git(s.yol)}>
              <Ikon ad={s.ikon} />
              {s.ad}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}

function AyarEksik() {
  return (
    <div className="app">
      <div className="sc">
        <Kunye sol="Creatorgraphers" sag="Kurulum" />
        <h2 className="t orta">Bağlantı<br />ayarı eksik</h2>
        <p className="lede">
          .env.local dosyasına Supabase proje adresi ve publishable anahtarı yazılmamış. Şablon: .env.example
        </p>
      </div>
    </div>
  )
}
