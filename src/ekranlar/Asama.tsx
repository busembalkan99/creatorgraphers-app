import { useEffect, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik, Tema } from '../lib/tipler'
import { asama, ayAdi, gunYaz, kalanYaz, saatYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'
import { acikEtkinlik } from './Etkinlikler'

/** Aşama kontrolü (karar 26, 35, 89). Prototip: v21 "Aşama kontrolü". */
export function Asama() {
  const [e, setE] = useState<Etkinlik | null | undefined>(undefined)
  const [temalar, setTemalar] = useState<Tema[]>([])
  const [sayilar, setSayilar] = useState<Record<string, number>>({})
  const [hata, setHata] = useState<string | null>(null)
  const [soru, setSoru] = useState<'oylama' | 'iptal' | null>(null)
  const [kopyalandi, setKopyalandi] = useState(false)
  // Yoklama bölümü kare çıkarınca çıkarılanlar listesi de tazelensin
  const [surum, setSurum] = useState(0)

  async function yukle() {
    const { data, error } = await sor(sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false }))
    if (error) throw error
    const acik = acikEtkinlik((data ?? []) as Etkinlik[]) ?? null
    if (!acik) return setE(null)
    const [t, s] = await sor(Promise.all([
      sb.from('temalar').select('*').eq('etkinlik', acik.id).order('sira'),
      sb.rpc('yukleme_sayilari', { p_etkinlik: acik.id }),
    ]))
    if (t.error) throw t.error
    if (s.error) throw s.error
    // Hepsi gelince birlikte: önce etkinlik çizilirse grup mesajı bir an temasız kalıyordu.
    setTemalar((t.data ?? []) as Tema[])
    setSayilar(Object.fromEntries(((s.data ?? []) as { tema: string; adet: number }[]).map(r => [r.tema, Number(r.adet)])))
    setE(acik)
  }

  useEffect(() => {
    yukle().catch(x => setHata(hataMetni(x)))
  }, [])

  async function cagir(fn: string, args: Record<string, unknown>) {
    setHata(null)
    const { error } = await sb.rpc(fn, args)
    setSoru(null)
    if (error) return setHata(hataMetni(error))
    await yukle().catch(x => setHata(hataMetni(x)))
  }

  if (e === undefined) return hata ? <div className="sc"><Kunye sol="Profil" geri="profil" sag="Yönetim" /><Hata metin={hata} /></div> : <Yukleniyor />
  if (e === null) {
    return (
      <div className="sc">
        <Kunye sol="Profil" geri="profil" sag="Yönetim" />
        <h2 className="t orta">Açık<br />etkinlik yok</h2>
        <button className="btn" onClick={() => git('kur')}>Etkinliği kur</button>
      </div>
    )
  }

  const a = asama(e)
  const ay = ayAdi(e.bulusma_gunu)
  const toplam = Object.values(sayilar).reduce((x, y) => x + y, 0)
  const link = window.location.origin + import.meta.env.BASE_URL
  const temaListesi = temalar.map(t => `${t.ad}${t.bulusmada ? '' : ' (serbest)'}`).join(', ')
  const mesaj =
    a === 'oylama'
      ? `${ay} etkinliğinin oylaması açıldı. Her kareye puan vermeyi unutmayın.\nSon oy: ${saatYaz(e.oylama_biter)}\n${link}`
      : `${ay} etkinliği: buluşma ${gunYaz(e.bulusma_gunu)}.\nTemalar: ${temaListesi}\nYükleme açılışı: ${saatYaz(e.yukleme_baslar)}\nSon yükleme: ${saatYaz(e.yukleme_biter)}\n${link}`

  const durum =
    a === 'baslamadi' ? `Yükleme açılışı ${saatYaz(e.yukleme_baslar)}`
      : a === 'yukleme' ? `Yükleme açık · ${kalanYaz(e.yukleme_biter)} kaldı`
        : `Oylama açık · ${kalanYaz(e.oylama_biter)} kaldı`

  return (
    <div className="sc" data-asama={a === 'oylama' ? 'oylama' : 'yukleme'}>
      <Kunye sol="Profil" geri="profil" sag="Yönetim" />
      <h2 className="sec">{ay} etkinliği<span>{gunYaz(e.bulusma_gunu, false)}</span></h2>
      <p className="veri" style={{ marginTop: 0 }}><b>{durum}</b></p>

      <div className="ozet" style={{ marginTop: 12 }}>
        {temalar.map(t => (
          <div key={t.id}>
            <span className="k">{t.bulusmada ? 'Buluşma' : 'Serbest'}</span>
            <span className="v">{t.ad}</span>
            <span className="v" style={{ marginLeft: 'auto', color: 'var(--soft)' }}>{sayilar[t.id] ?? 0} kare</span>
          </div>
        ))}
        <div><span className="k">Son yükleme</span><span className="v">{saatYaz(e.yukleme_biter)}</span></div>
        <div><span className="k">Son oy</span><span className="v">{saatYaz(e.oylama_biter)}</span></div>
      </div>

      {a === 'yukleme' && soru === null && (
        <div className="akt" style={{ marginTop: 14 }}>
          <button className="btn ik" onClick={() => cagir('yukleme_uzat', { p_etkinlik: e.id, p_saat: 24 })}>24 saat uzat</button>
          <button className="btn ik" onClick={() => setSoru('oylama')}>Oylamayı aç</button>
        </div>
      )}
      {soru === 'oylama' && (
        <div className="kutu">
          <div className="bas"><span>Oylama şimdi açılsın mı?</span></div>
          <p>Yükleme kapanır, {toplam} kareyle oylama başlar. Geri alınamaz.</p>
          <div className="akt">
            <button className="btn ik" onClick={() => setSoru(null)}>Vazgeç</button>
            <button className="btn" onClick={() => cagir('oylamayi_ac', { p_etkinlik: e.id })}>Oylamayı aç</button>
          </div>
        </div>
      )}

      {/* Buluşma günü yöneticinin ilk işi yoklama: grup mesajının altında kalıyordu */}
      <Yoklama e={e} surum={surum} degisti={() => { setSurum(n => n + 1); yukle().catch(x => setHata(hataMetni(x))) }} />
      <Cikarilanlar e={e} surum={surum} degisti={() => setSurum(n => n + 1)} />
      {(a === 'oylama' || a === 'sonuc') && <OyIlerlemesi e={e} surum={surum} />}

      <div className="mesaj">
        <span className="lab">Gruba yazılacak</span>
        <p>{mesaj}</p>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(mesaj)
              setKopyalandi(true)
              window.setTimeout(() => setKopyalandi(false), 2000)
            } catch {
              setHata('Kopyalanamadı. Metni basılı tutup kopyala.')
            }
          }}
        >
          {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
        </button>
      </div>
      <p className="veri">Mesajı gruba sen yapıştıracaksın.</p>

      <Hata metin={hata} />

      {(a === 'baslamadi' || a === 'yukleme') && (
        <>
          <h2 className="sec">Etkinliği iptal et</h2>
          {soru === 'iptal' ? (
            <div className="kutu" style={{ marginTop: 0 }}>
              <div className="bas"><span>{ay} etkinliği iptal edilsin mi?</span></div>
              <p>{toplam > 0 ? `Yüklenen ${toplam} kare silinir. ` : ''}Geri alınamaz.</p>
              <div className="akt">
                <button className="btn ik" onClick={() => setSoru(null)}>Vazgeç</button>
                <button className="btn" onClick={() => cagir('etkinlik_iptal', { p_etkinlik: e.id })}>İptal et</button>
              </div>
            </div>
          ) : (
            <>
              <p className="veri" style={{ marginTop: 0 }}>Oylama açılana kadar mümkün.</p>
              <button className="btn ik" onClick={() => setSoru('iptal')}>İptali başlat</button>
            </>
          )}
        </>
      )}
    </div>
  )
}

const bugunTr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })

/**
 * Yoklama (karar 103). Buluşmada, yükleme açılmadan alınır; alınınca yalnız gelenler kare
 * yükler. Alınmadıysa herkes yükler, yönetici sonradan gelmeyenlerin karelerini çıkarır.
 */
function Yoklama({ e, surum, degisti }: { e: Etkinlik; surum: number; degisti: () => void }) {
  const [liste, setListe] = useState<{ uye: string; ad: string; geldi: boolean }[] | null>(null)
  const [secim, setSecim] = useState<Set<string> | null>(null)   // null: düzenlemiyor
  const [gelmeyen, setGelmeyen] = useState<{ kisi: number; kare: number } | null>(null)
  const [toplu, setToplu] = useState(0)   // gelmeyen diye çıkarılan kare sayısı
  const [hata, setHata] = useState<string | null>(null)
  const [gidiyor, setGidiyor] = useState(false)

  async function oku() {
    const [l, g, t] = await sor(Promise.all([
      sb.rpc('yoklama_listesi', { p_etkinlik: e.id }),
      sb.rpc('gelmeyen_ozeti', { p_etkinlik: e.id }),
      sb.rpc('toplu_ozeti', { p_etkinlik: e.id }),
    ]))
    if (l.error) throw l.error
    if (g.error) throw g.error
    if (t.error) throw t.error
    setToplu(Number(t.data ?? 0))
    setListe((l.data ?? []) as { uye: string; ad: string; geldi: boolean }[])
    const o = ((g.data ?? []) as { kisi: number; kare: number }[])[0]
    setGelmeyen(o ? { kisi: Number(o.kisi), kare: Number(o.kare) } : null)
  }
  // Yoklama zamanı ilk kayıtta sabit kalıyor (0009): tazelemeyi kayıt sayacı tetikliyor
  useEffect(() => { oku().catch(x => setHata(hataMetni(x))) }, [e.id, surum]) // eslint-disable-line react-hooks/exhaustive-deps

  if (bugunTr() < e.bulusma_gunu) {
    return (
      <>
        <h2 className="sec">Yoklama</h2>
        <p className="veri" style={{ marginTop: 0 }}>Buluşma günü açılır.</p>
      </>
    )
  }

  const alindi = !!e.yoklama_at
  const gelen = liste?.filter(x => x.geldi).length ?? 0
  // Oylama açılınca yoklama değişmez: yeniden yazıp toplu çıkarmak kareleri sahiplerine
  // bağlatırdı (isimsizlik, karar 9)
  const kilitli = !['baslamadi', 'yukleme'].includes(asama(e))

  async function kaydet() {
    if (!secim) return
    setGidiyor(true)
    setHata(null)
    const { error } = await sb.rpc('yoklama_kaydet', { p_etkinlik: e.id, p_gelenler: [...secim] })
    setGidiyor(false)
    if (error) return setHata(hataMetni(error))
    setSecim(null)
    degisti()
  }

  async function gelmeyenleriCikar() {
    setHata(null)
    const { error } = await sb.rpc('gelmeyenleri_cikar', { p_etkinlik: e.id })
    if (error) return setHata(hataMetni(error))
    await oku().catch(x => setHata(hataMetni(x)))
    degisti()
  }

  return (
    <div className="yoklama">
      <h2 className="sec">Yoklama{alindi && secim === null && <span>{gelen} / {liste?.length ?? 0} geldi</span>}</h2>
      {secim !== null ? (
        <>
          {(liste ?? []).map(x => {
            const on = secim.has(x.uye)
            return (
              <button key={x.uye} className="izin" aria-pressed={on} onClick={() => {
                const y = new Set(secim)
                if (on) y.delete(x.uye); else y.add(x.uye)
                setSecim(y)
              }}>
                <span className={`box ${on ? 'on' : ''}`} />
                <span><b>{x.ad}</b></span>
              </button>
            )
          })}
          {/* Alt alta: yarım genişlikte "Yoklamayı kaydet" iki satıra bölünüyordu */}
          <button className="btn" disabled={gidiyor} onClick={kaydet}>Yoklamayı kaydet</button>
          <button className="btn ik" onClick={() => setSecim(null)}>Vazgeç</button>
        </>
      ) : kilitli ? (
        <p className="veri" style={{ marginTop: 0 }}>
          {alindi ? 'Oylama başladı, yoklama artık değişmiyor.' : 'Yoklama alınmadı. Oylama başladığı için artık alınmıyor.'}
        </p>
      ) : (
        <>
          <p className="veri" style={{ marginTop: 0 }}>
            {alindi ? 'Gelmeyenler kare yükleyemiyor.' : 'Alınmadı. Alınana kadar herkes kare yükleyebiliyor.'}
          </p>
          <button className="btn ik" disabled={!liste}
            onClick={() => setSecim(new Set((liste ?? []).filter(x => x.geldi).map(x => x.uye)))}>
            {alindi ? 'Yoklamayı düzelt' : 'Yoklamayı al'}
          </button>
        </>
      )}
      {secim === null && !kilitli && gelmeyen && gelmeyen.kare > 0 && (
        <div className="kutu">
          <div className="bas"><span>Gelmeyen {gelmeyen.kisi} kişi {gelmeyen.kare} kare yüklemiş</span></div>
          <p>Yoklamadan önce yüklenmişler. Çıkarırsan sahipleri nedenini görür, geri alabilirsin.</p>
          <button className="btn" onClick={gelmeyenleriCikar}>Karelerini çıkar</button>
        </div>
      )}
      {/* Toplu çıkarılanlar kare kare listelenmiyor, geri alınışı yoklamayı düzeltmek:
          kimlikleri yöneticiye verilse oylamada resimlerle eşleşirdi (karar 103) */}
      {secim === null && toplu > 0 && (
        <p className="veri">
          Gelmeyenlerin {toplu} karesi yarışmadan çıkarıldı.{!kilitli && ' Yanlışlık varsa yoklamayı düzelt, geri gelir.'}
        </p>
      )}
      <Hata metin={hata} />
    </div>
  )
}

/** Kim oyunu verdi, kim vermedi (karar 105). Kaç puan verdiği yazmıyor: sayı, kişinin
    oylayacağı kare sayısı üzerinden kaç kare yüklediğini ele verirdi (isimsizlik, karar 9). */
function OyIlerlemesi({ e, surum }: { e: Etkinlik; surum: number }) {
  // null: daha okunmadı. Boş dizi ile karıştırılmamalı, yoksa liste gelene kadar
  // ekranda "okunamadı" yazıyor.
  const [liste, setListe] = useState<{ uye: string; ad: string; durum: string; kapali: boolean }[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await sor(sb.rpc('oylama_ilerlemesi', { p_etkinlik: e.id }))
      if (error) throw error
      setListe((data ?? []) as { uye: string; ad: string; durum: string; kapali: boolean }[])
    })().catch(x => setHata(hataMetni(x)))
  }, [e.id, surum])

  const veren = (liste ?? []).filter(x => x.durum === 'bitti' || x.durum === 'devam').length
  const sayilan = (liste ?? []).length

  return (
    <>
      <h2 className="sec">Oy veren{sayilan > 0 && <span>{veren} / {sayilan} kişi</span>}</h2>
      {/* Hata varken "okunuyor" demeye devam etmesin: ikisi bir arada duruyordu */}
      {hata ? null : liste === null ? (
        <p className="veri" style={{ marginTop: 0 }}>Okunuyor.</p>
      ) : liste.length === 0 ? (
        <p className="veri" style={{ marginTop: 0 }}>Kulüpte üye yok.</p>
      ) : (
        <div className="ozet" style={{ marginTop: 12 }}>
          {(liste ?? []).map(x => (
            <div key={x.uye}>
              <span className="v">{x.ad}</span>
              <span className="v" style={{ marginLeft: 'auto', color: 'var(--soft)' }}>
                {x.durum === 'bitti' ? 'Bitirdi' : x.durum === 'devam' ? 'Devam ediyor' : 'Başlamadı'}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Oylamada kare çıkarılınca "bitirdi" kapanıyor: o kareyi kimse tamamlayamıyor,
          tamamlayabilen tek kişi sahibi olurdu (isimsizlik, karar 9). */}
      {liste?.[0]?.kapali && (
        <p className="veri">Oylamada kare çıkarıldı. Kimin bitirdiği sonuçlara kadar kapalı.</p>
      )}
      <p className="veri">Kimin hangi kareye kaç puan verdiği burada da görünmüyor.</p>
      <Hata metin={hata} />
    </>
  )
}

/** Yarışmadan çıkarılan kareler. Sahip yazmıyor: oylama sürerken yönetici de isim görmüyor. */
function Cikarilanlar({ e, surum, degisti }: { e: Etkinlik; surum: number; degisti: () => void }) {
  const [liste, setListe] = useState<{ id: string; tema_ad: string; dosya: string; neden: string; url: string | null }[]>([])
  const [hata, setHata] = useState<string | null>(null)

  async function oku() {
    const { data, error } = await sor(sb.rpc('cikarilan_kareler', { p_etkinlik: e.id }))
    if (error) throw error
    const l = (data ?? []) as { id: string; tema_ad: string; dosya: string; neden: string }[]
    const imza = l.length ? (await sb.storage.from('kareler').createSignedUrls(l.map(x => x.dosya), 3600)).data ?? [] : []
    setListe(l.map((x, i) => ({ ...x, url: imza[i]?.signedUrl ?? null })))
  }
  useEffect(() => { oku().catch(x => setHata(hataMetni(x))) }, [e.id, surum]) // eslint-disable-line react-hooks/exhaustive-deps

  async function geriAl(id: string) {
    setHata(null)
    const { error } = await sb.rpc('kare_geri_al', { p_kare: id })
    if (error) return setHata(hataMetni(error))
    // Kare yarışmaya dönünce oylama ilerlemesi de değişiyor; o bölüm sayaçla tazeleniyor
    degisti()
    await oku().catch(x => setHata(hataMetni(x)))
  }

  if (!liste.length && !hata) return null
  return (
    <>
      <h2 className="sec">Yarışmadan çıkarılanlar<span>{liste.length} kare</span></h2>
      {liste.map(x => (
        <div className="cikan" key={x.id}>
          {x.url ? <img src={x.url} alt="" /> : <div className="yer" style={{ width: 52, height: 52 }} />}
          <div className="tx"><b>{x.tema_ad}</b><span>{x.neden}</span></div>
          <button className="btn ik" onClick={() => geriAl(x.id)}>Geri al</button>
        </div>
      ))}
      <Hata metin={hata} />
    </>
  )
}
