import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Istek } from '../lib/tipler'
import { Ikon } from '../bilesenler/Ikon'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'

/**
 * Giriş (karar 95). Prototip: prototype/creatorgraphers/2026-09-17_v23-giris.html
 * Google ile girilir. Üye değilse istek bırakır; bekler, reddedilirse görür ve
 * istediği kadar tekrar ister. Kulübün kurucusu henüz yoksa ilk giren kulübü kurar.
 */

export async function googleIleGir() {
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
      queryParams: { prompt: 'select_account' },
    },
  })
}

async function baskaHesap() {
  await sb.auth.signOut()
  await googleIleGir()
}

export function Kapak() {
  const [hata, setHata] = useState<string | null>(null)
  return (
    <div className="sc">
      <header className="tepe">
        <div className="mast"><span>Fotoğraf kulübü</span></div>
        <div className="rb" />
      </header>
      <div className="kapak"><img src={import.meta.env.BASE_URL + 'kapak.jpg'} alt="" /></div>
      <div className="marka">Creator&shy;graphers</div>
      <div className="bosluk" />
      <Hata metin={hata} />
      <button className="btn" onClick={() => googleIleGir().catch(e => setHata(hataMetni(e)))}>Google ile gir</button>
      {/* Kapakta tek cümle: "davetle çalışıyor" zaten "listede yoksan"ın içinde */}
      <div className="alt-bilgi">Listede yoksan istek bırak.</div>
      <a className="link" href={import.meta.env.BASE_URL + 'privacy/'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Gizlilik</a>
    </div>
  )
}

/**
 * Kulüpten çıkarılan kişi (karar 99). Satırı duruyor, kareleri geçmişte kalıyor,
 * uygulamaya giremiyor. İstek bırakıp geri dönebiliyor; yönetici de listeden geri alabiliyor.
 */
export function Cikarildin({ ad, istekBirak }: { ad: string; istekBirak: () => void }) {
  return (
    <div className="sc">
      <header className="tepe">
        <div className="mast"><span>Creatorgraphers</span><span className="r">Kulüp</span></div>
        <div className="rb" />
      </header>
      <h2 className="t orta">Artık<br />kulüpte değilsin</h2>
      <p className="lede">{ad}, hesabın kapatıldı. Kareler ve sonuçlar yerinde duruyor.</p>
      <div className="bosluk" />
      <button className="btn" onClick={istekBirak}>İstek bırak</button>
      <button className="btn ik" onClick={() => sb.auth.signOut()}>Çıkış yap</button>
    </div>
  )
}

type Durum =
  | { tip: 'yukleniyor' }
  | { tip: 'kur' }
  | { tip: 'istek'; tekrar: boolean; ad: string }
  | { tip: 'bekliyor'; istek: Istek }
  | { tip: 'ret'; istek: Istek }
  | { tip: 'hata'; metin: string }

/** Oturum açık ama üye satırı yok: hangi ekranın görüneceğine karar verir. */
export function UyeDegil({ kullanici, uyeOldu, cikarildi }:
  { kullanici: User; uyeOldu: () => void; cikarildi?: boolean }) {
  const [d, setD] = useState<Durum>({ tip: 'yukleniyor' })

  async function yenile() {
    try {
      const { data: kurucuVar, error: e1 } = await sor(sb.rpc('kurucu_var'))
      if (e1) throw e1
      if (!kurucuVar) return setD({ tip: 'kur' })
      const { data, error } = await sb
        .from('istekler')
        .select('id, ad, eposta, notu, durum, olusturma')
        .eq('kullanici', kullanici.id)
        .order('olusturma', { ascending: false })
        .limit(1)
      if (error) throw error
      const son = data?.[0] as Istek | undefined
      if (!son) return setD({ tip: 'istek', tekrar: false, ad: '' })
      // Çıkarılan kişinin eski onaylı isteği duruyor. Onu "zaten üye" saymak
      // kişiyi kapalı ekrana geri atıyor ve istek bırakmasına izin vermiyordu.
      if (son.durum === 'onay') return cikarildi ? setD({ tip: 'istek', tekrar: true, ad: son.ad }) : uyeOldu()
      if (son.durum === 'bekliyor') return setD({ tip: 'bekliyor', istek: son })
      setD({ tip: 'ret', istek: son })
    } catch (e) {
      setD({ tip: 'hata', metin: hataMetni(e) })
    }
  }

  useEffect(() => {
    yenile()
    // Bekleyen kişi uygulamayı açık bırakırsa onay gelince kendiliğinden içeri girsin.
    const zaman = window.setInterval(() => {
      if (document.visibilityState === 'visible') yenile()
    }, 30_000)
    const gorunur = () => document.visibilityState === 'visible' && yenile()
    document.addEventListener('visibilitychange', gorunur)
    return () => {
      window.clearInterval(zaman)
      document.removeEventListener('visibilitychange', gorunur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kullanici.id])

  const eposta = kullanici.email ?? ''

  switch (d.tip) {
    case 'yukleniyor':
      return <Yukleniyor />
    case 'hata':
      return (
        <div className="sc">
          <Kunye sol="Creatorgraphers" sag="Giriş" />
          <Hata metin={d.metin} />
          <button className="btn" onClick={() => { setD({ tip: 'yukleniyor' }); yenile() }}>Tekrar dene</button>
          <button className="link" onClick={baskaHesap}>Başka hesapla gir</button>
        </div>
      )
    case 'kur':
      return <KulubuKur kullanici={kullanici} bitti={uyeOldu} />
    case 'istek':
      return (
        <IstekFormu
          eposta={eposta}
          tekrar={d.tekrar}
          ilkAd={d.ad}
          kullaniciId={kullanici.id}
          gonderildi={yenile}
        />
      )
    case 'bekliyor':
      return (
        <div className="sc">
          <Kunye sol="Creatorgraphers" sag="Giriş" />
          <h2 className="t">İsteğin<br />yöneticide</h2>
          <div className="kutu">
            <div className="bas"><Ikon ad="saat" /><span>Onay bekleniyor</span></div>
            <p>Onaylanınca içeri girersin. Bildirim gitmiyor, acelen varsa gruptan yaz.</p>
          </div>
          <h2 className="sec">Gönderdiğin</h2>
          <Ozet istek={d.istek} />
          <div className="bosluk" />
          <button className="link" onClick={baskaHesap}>Başka hesapla gir</button>
        </div>
      )
    case 'ret':
      return (
        <div className="sc">
          <Kunye sol="Creatorgraphers" sag="Giriş" />
          <h2 className="t">İsteğin<br />kabul<br />edilmedi</h2>
          <div className="kutu">
            <div className="bas"><Ikon ad="info" /><span>Bu hesapla kulübe giremiyorsun</span></div>
            <p>Yönetici isteği onaylamadı. Yanlışlık varsa notuna yaz, tekrar iste.</p>
          </div>
          <h2 className="sec">Gönderdiğin</h2>
          <Ozet istek={d.istek} />
          <div className="bosluk" />
          <button className="btn" onClick={() => setD({ tip: 'istek', tekrar: true, ad: d.istek.ad })}>Tekrar istek bırak</button>
          <button className="link" onClick={baskaHesap}>Başka hesapla gir</button>
        </div>
      )
  }
}

function Ozet({ istek }: { istek: Istek }) {
  return (
    <div className="ozet">
      <div><span className="k">Ad</span><span className="v">{istek.ad}</span></div>
      <div><span className="k">Hesap</span><span className="v">{istek.eposta}</span></div>
      <div><span className="k">Not</span><span className="v">{istek.notu || 'Not bırakmadın'}</span></div>
    </div>
  )
}

function IstekFormu({ eposta, tekrar, ilkAd, kullaniciId, gonderildi }: {
  eposta: string; tekrar: boolean; ilkAd: string; kullaniciId: string; gonderildi: () => void
}) {
  // Google'daki ad "selo_1999" olabilir; yalnız tekrar isteğinde önceki ad hazır gelir.
  const [ad, setAd] = useState(tekrar ? ilkAd : '')
  const [not, setNot] = useState('')
  const [gidiyor, setGidiyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const dolu = ad.trim().length >= 2

  async function gonder() {
    setGidiyor(true)
    setHata(null)
    const { error } = await sb.from('istekler').insert({
      kullanici: kullaniciId,
      eposta,
      ad: ad.trim(),
      notu: not.trim() || null,
    })
    setGidiyor(false)
    if (error) return setHata(hataMetni(error))
    gonderildi()
  }

  return (
    <div className="sc">
      <Kunye sol="Creatorgraphers" sag="Giriş" />
      <h2 className="t">{tekrar ? <>Tekrar<br />istek bırak</> : <>Kulüpte<br />henüz yoksun</>}</h2>
      <p className="lede">
        {tekrar
          ? 'Önceki isteğin kabul edilmedi. Notuna sebebini yaz.'
          : 'Bu hesap listede yok. İstek bırak, yönetici onaylasın.'}
      </p>
      <div className="hesap"><span className="lab">Google hesabın</span><b>{eposta}</b></div>
      <div className="alan">
        <label className="lab" htmlFor="ad">Adın soyadın</label>
        <input id="ad" value={ad} onChange={e => setAd(e.target.value)} placeholder="ÖRNEK: SELİN ARI" maxLength={40}
          autoComplete="name" autoCapitalize="words" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
        <div className="ipucu">Kulüpte bu adla görüneceksin.</div>
      </div>
      <div className="alan">
        <label className="lab" htmlFor="not">Yöneticiye not · isteğe bağlı</label>
        <input id="not" className="not" value={not} onChange={e => setNot(e.target.value)} placeholder="Kulüpten kimi tanıyorsun?" maxLength={80}
          autoCapitalize="sentences" enterKeyHint="send" />
      </div>
      <div className="bosluk" />
      <Hata metin={hata} />
      <button className="btn" disabled={!dolu || gidiyor} onClick={gonder}>{gidiyor ? 'Gönderiliyor' : 'İsteği gönder'}</button>
      <button className="link" onClick={baskaHesap}>Başka hesapla gir</button>
    </div>
  )
}

/** Kulübün ilk kurulumu: kurucu yokken ilk giren kurucu olur (bir kez). */
function KulubuKur({ kullanici, bitti }: { kullanici: User; bitti: () => void }) {
  const [ad, setAd] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [gidiyor, setGidiyor] = useState(false)
  async function kur() {
    setGidiyor(true)
    const { error } = await sb.rpc('kulubu_kur', { p_ad: ad.trim() })
    setGidiyor(false)
    if (error) return setHata(hataMetni(error))
    bitti()
  }
  return (
    <div className="sc">
      <Kunye sol="Creatorgraphers" sag="Kurulum" />
      <h2 className="t">Kulübü<br />kur</h2>
      <p className="lede">Kulübün kurucusu yok. Kurarsan sen olursun: etkinliği sen kurarsın, istekleri sen onaylarsın.</p>
      <div className="hesap"><span className="lab">Google hesabın</span><b>{kullanici.email}</b></div>
      <div className="alan">
        <label className="lab" htmlFor="kad">Adın soyadın</label>
        <input id="kad" value={ad} onChange={e => setAd(e.target.value)} maxLength={40}
          autoComplete="name" autoCapitalize="words" autoCorrect="off" spellCheck={false} enterKeyHint="done" />
        <div className="ipucu">Kulüpte bu adla görüneceksin.</div>
      </div>
      <div className="bosluk" />
      <Hata metin={hata} />
      <button className="btn" disabled={ad.trim().length < 2 || gidiyor} onClick={kur}>Kulübü kur</button>
      <button className="link" onClick={baskaHesap}>Başka hesapla gir</button>
    </div>
  )
}

export function Hosgeldin({ ad, devam }: { ad: string; devam: () => void }) {
  return (
    <div className="sc">
      <Kunye sol="Creatorgraphers" />
      <h2 className="t">Hoş geldin,<br />{ad.split(' ')[0]}</h2>
      <p className="lede">İsteğin onaylandı. Kulüp şöyle işliyor:</p>
      <h2 className="sec">Bir etkinlik</h2>
      <div className="adim"><span className="no">01</span><span><b>Buluşup çekiyoruz</b>
        <span>Her temaya bir kare yüklüyorsun. Bazı temalar buluşma günü çekiliyor.</span></span></div>
      <div className="adim"><span className="no">02</span><span><b>İsimsiz oyluyoruz</b>
        <span>Her kareye 1 ile 10 arası puan. Kimin çektiği sonuçlara kadar gizli.</span></span></div>
      <div className="adim"><span className="no">03</span><span><b>Sonuçlar açılıyor</b>
        <span>Kazanan kareler ve galeri. Kendi ortalamanı sadece sen görüyorsun.</span></span></div>
      <div className="bosluk" />
      <button className="btn" onClick={devam}>Etkinliklere geç</button>
    </div>
  )
}
