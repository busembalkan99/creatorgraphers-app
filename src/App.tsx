import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ayarEksik, sb, hataMetni } from './lib/supabase'
import type { Uye } from './lib/tipler'
import { git, useYol } from './lib/yol'
import { Ikon } from './bilesenler/Ikon'
import { Hata, Kunye, Yukleniyor } from './bilesenler/Kunye'
import { Hosgeldin, Kapak, UyeDegil } from './ekranlar/Giris'
import { Etkinlikler } from './ekranlar/Etkinlikler'
import { Yukleme } from './ekranlar/Yukleme'
import { Profil } from './ekranlar/Profil'
import { Uyeler } from './ekranlar/Uyeler'
import { Kur } from './ekranlar/Kur'
import { Asama } from './ekranlar/Asama'

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
      {oturum === undefined ? <Yukleniyor /> : oturum === null ? <Kapak /> : <Icerik oturum={oturum} />}
    </div>
  )
}

function Icerik({ oturum }: { oturum: Session }) {
  const kullanici = oturum.user
  const [uye, setUye] = useState<Uye | null | undefined>(undefined)
  const [hata, setHata] = useState<string | null>(null)

  const uyeYukle = useCallback(async () => {
    const { data, error } = await sb.rpc('ben').maybeSingle()
    if (error) return setHata(hataMetni(error))
    setUye((data as Uye | null) ?? null)
  }, [kullanici.id])

  useEffect(() => {
    uyeYukle()
  }, [uyeYukle])

  if (hata) {
    return (
      <div className="sc">
        <Kunye sol="Creatographers" />
        <Hata metin={hata} />
        <button className="btn" onClick={() => { setHata(null); uyeYukle() }}>Tekrar dene</button>
      </div>
    )
  }
  if (uye === undefined) return <Yukleniyor />
  if (uye === null) return <UyeDegil kullanici={kullanici} uyeOldu={uyeYukle} />
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
  const profil = <Profil uye={uye} uyeDegisti={uyeDegisti} />
  switch (yonetici || !['uyeler', 'kur', 'asama'].includes(yol) ? yol : 'profil') {
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
      ekran = <Siralama />
      sekme = 'siralama'
      altEkran = false
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

/** Karar 34: sonuç yayınlanmadan Sıralama kilitli görünür, gizlenmez. */
function Siralama() {
  return (
    <div className="sc">
      <Kunye sol="Creatographers" sag="Sıralama" />
      <h2 className="t orta">Sıralama<br />henüz yok</h2>
      <div className="kutu">
        <div className="bas"><Ikon ad="kilit" /><span>İlk sonuçlarla açılıyor</span></div>
        <p>İlk etkinliğin oylaması bitince burada etkinlik sıralaması ve sezon tablosu çıkacak.</p>
      </div>
    </div>
  )
}

function AyarEksik() {
  return (
    <div className="app">
      <div className="sc">
        <Kunye sol="Creatographers" sag="Kurulum" />
        <h2 className="t orta">Bağlantı<br />ayarı eksik</h2>
        <p className="lede">
          .env.local dosyasına Supabase proje adresi ve publishable anahtarı yazılmamış. Şablon: .env.example
        </p>
      </div>
    </div>
  )
}
