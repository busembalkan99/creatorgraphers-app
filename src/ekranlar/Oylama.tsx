import { useCallback, useEffect, useRef, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik, Uye } from '../lib/tipler'
import { asama, kalanYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Ikon } from '../bilesenler/Ikon'
import { Buyutec, useBuyutecTetigi, type Acik } from '../bilesenler/Buyutec'
import { CikarPenceresi } from '../bilesenler/Cikar'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'
import { acikEtkinlik } from './Etkinlikler'
import type { TahminDurumu } from './Tahmin'

/**
 * Oylama (kararlar 5, 6, 7, 9, 20, 24, 37, 42, 48, 94).
 * Prototip: prototype/creatorgraphers/2026-09-12_v11-provoke-oylama.html
 * Kareler isimsiz ve sahibi sunucudan hiç gelmiyor. Kişi kendi karesini görmüyor.
 */

interface TemaDurum {
  tema: string
  ad: string
  sira: number
  toplam: number
  puanladigim: number
  zorunlu: boolean
}

interface OyKare {
  id: string
  tema: string
  dosya: string
  genislik: number
  yukseklik: number
  puan: number | null
  url?: string | null
}

const iki = (n: number) => String(n).padStart(2, '0')

async function veriYukle(): Promise<{ e: Etkinlik | null; durum: TemaDurum[]; kareler: OyKare[] }> {
  const { data: ev, error } = await sor(sb.from('etkinlikler').select('*').order('yukleme_baslar', { ascending: false }))
  if (error) throw error
  const acik = acikEtkinlik((ev ?? []) as Etkinlik[]) ?? null
  if (!acik || asama(acik) !== 'oylama') return { e: null, durum: [], kareler: [] }
  const [d, k] = await sor(Promise.all([
    sb.rpc('oylama_durumu', { p_etkinlik: acik.id }),
    sb.rpc('oylama_kareleri', { p_etkinlik: acik.id }),
  ]))
  if (d.error) throw d.error
  if (k.error) throw k.error
  const durum = ((d.data ?? []) as TemaDurum[]).map(t => ({ ...t, toplam: Number(t.toplam), puanladigim: Number(t.puanladigim) }))
  return { e: acik, durum, kareler: (k.data ?? []) as OyKare[] }
}

/** Tema listesi: hangi temada kaç kare kaldı, hangisi zorunlu. */
export function Oylama({ uye }: { uye: Uye }) {
  const [v, setV] = useState<{ e: Etkinlik | null; durum: TemaDurum[] } | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    veriYukle().then(x => setV({ e: x.e, durum: x.durum })).catch(x => setHata(hataMetni(x)))
  }, [uye.id])
  const [tahmin, setTahmin] = useState<TahminDurumu | null>(null)
  useEffect(() => {
    if (!v?.e) return
    sb.rpc('tahmin_durumu', { p_etkinlik: v.e.id }).then(({ data }) => setTahmin(((data ?? []) as TahminDurumu[])[0] ?? null))
  }, [v?.e?.id])

  if (hata) return <div className="sc"><Kunye sol="Etkinlikler" geri="etkinlikler" sag="Oylama" /><Hata metin={hata} /></div>
  if (!v) return <div className="sc"><Kunye sol="Etkinlikler" geri="etkinlikler" sag="Oylama" /><Yukleniyor /></div>
  if (!v.e) {
    return (
      <div className="sc">
        <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Oylama" />
        <h2 className="t orta">Oylama<br />açık değil</h2>
        <p className="lede">Oylama yükleme kapanınca açılıyor.</p>
      </div>
    )
  }

  const kalanToplam = v.durum.reduce((a, t) => a + (t.toplam - t.puanladigim), 0)
  const oyunVar = tahmin && (tahmin.durum === 'acik' || tahmin.basladi)
  const zorunluKalan = v.durum.filter(t => t.zorunlu).reduce((a, t) => a + (t.toplam - t.puanladigim), 0)

  return (
    <div className="sc" data-asama="oylama">
      <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Oylama" />
      <h2 className="t orta">{kalanToplam ? <>{kalanToplam} kare<br />kaldı</> : <>Oyların<br />tamam</>}</h2>
      <div className="kal">
        <b>{kalanYaz(v.e.oylama_biter)}</b> kaldı
        {/* Başlık "3 kare kaldı" derken burada "işin bitti" yazıyordu, ikisi çelişiyordu */}
        {zorunluKalan === 0 && kalanToplam > 0 && ' · bunların hiçbiri zorunlu değil'}
      </div>

      {/* Karar 76: oylamasını bitirene isteğe bağlı oyun. Oylama bitince açık kalan asıl iş bu. */}
      {kalanToplam === 0 && oyunVar && (
        <button className="tahmin-kart" onClick={() => git(`tahmin/${v.e!.id}`)}>
          <span className="lab">Kim çekti · isteğe bağlı</span>
          <b>{tahmin.gonderildi ? 'Tahminlerin gönderildi' : tahmin.basladi ? 'Tahmin oyunu sürüyor' : 'Tahmin oyunu'}</b>
          <span className="git">{tahmin.gonderildi ? 'Bak' : tahmin.basladi ? 'Devam et' : 'Oyna'}<Ikon ad="sag" /></span>
        </button>
      )}
      <h2 className="kart-bas">Temalar<span>{v.durum.length} tema</span></h2>
      <div className="satir-kartlari">{v.durum.map(t => {
        const kalan = t.toplam - t.puanladigim
        const oran = t.toplam ? (t.puanladigim / t.toplam) * 100 : 100
        return (
          <button key={t.tema} className={`tema-satir ${kalan ? '' : 'tamam'}`} onClick={() => git(`oyla/${t.tema}`)}>
            <div className="ust">
              <b>{t.ad}</b>
              <span className="sag">{t.puanladigim} / {t.toplam}</span>
            </div>
            <div className="cizgi"><i style={{ width: `${oran}%` }} /></div>
            <div className="alt">
              <span>
                {t.toplam === 0
                  ? t.zorunlu
                    ? 'Bu temada senin dışında kare yok'
                    : 'Bu temaya kimse kare vermemiş'
                  : kalan === 0
                    ? 'Bitti'
                    : t.zorunlu
                      ? `${kalan} kare kaldı · kare verdin, oylaman gerekiyor`
                      : `${kalan} kare kaldı · karen yok, oylaman şart değil`}
              </span>
              {/* Karar 105: satır bir düğme ama okunur veri satırlarıyla aynı görünüyordu,
                  kimse tıklanabildiğini anlamamıştı. Eylem adı ve ok onu söylüyor. */}
              {t.toplam > 0 && (
                <span className="git">
                  {kalan === 0 ? 'Değiştir' : t.puanladigim ? 'Devam et' : 'Puanla'}
                  <Ikon ad="sag" />
                </span>
              )}
            </div>
          </button>
        )
      })}</div>
      <p className="veri">Kimin çektiği sonuçlara kadar gizli. Kendi karen listede yok.</p>
    </div>
  )
}

/** Bir temanın akışı: kare kare puanlama, sonunda eksikler. */
export function OylamaTema({ uye, temaId }: { uye: Uye; temaId: string }) {
  const [e, setE] = useState<Etkinlik | null | undefined>(undefined)
  const [tema, setTema] = useState<TemaDurum | null>(null)
  const [kareler, setKareler] = useState<OyKare[]>([])
  const [hata, setHata] = useState<string | null>(null)
  // Puan yazılamazsa akış ekranda kalsın, yalnız üstte şerit çıksın.
  const [oyHatasi, setOyHatasi] = useState<string | null>(null)
  // Sunucunun kabul ettiği son puanlar. Hızlı arka arkaya puan verilirse geri alma
  // ekrandaki ara değere değil, sunucudaki değere döner.
  const onaylanan = useRef<Record<string, number | null>>({})
  const akis = useRef<HTMLDivElement>(null)
  const [buyuk, setBuyuk] = useState<Acik | null>(null)
  const tetik = useBuyutecTetigi()
  // Karar 103: yönetici kareyi isimsiz görürken yarışmadan çıkarabiliyor
  const yonetici = uye.rol !== 'uye'
  const [cikar, setCikar] = useState<string | null>(null)
  const [cikti, setCikti] = useState(false)
  // Karar 76: tahmin oyununu başlatan için bu etkinlikte puanlar kilitli
  const [kilitli, setKilitli] = useState(false)
  // Karar 105: kare ekranı tam dolduruyor, altındakinden hiçbir şey görünmüyor ve kaydırma
  // çubuğu gizli. Puan verilince ipucu beliriyor, bir kere kaydıran bir daha görmüyor.
  const [ipucu, setIpucu] = useState(() => {
    try { return localStorage.getItem('cg-oy-kaydirma') !== 'ogrenildi' } catch { return true }
  })
  const ogrendi = useCallback(() => {
    setIpucu(acik => {
      if (!acik) return acik
      try { localStorage.setItem('cg-oy-kaydirma', 'ogrenildi') } catch { /* gizli sekmede yazılamaz */ }
      return false
    })
  }, [])

  useEffect(() => {
    ;(async () => {
      const { e: ev, durum, kareler: hepsi } = await veriYukle()
      if (!ev) return setE(null)
      const t = durum.find(x => x.tema === temaId) ?? null
      const benim = hepsi.filter(k => k.tema === temaId)
      const imza = benim.length
        ? (await sb.storage.from('kareler').createSignedUrls(benim.map(k => k.dosya), 3600)).data ?? []
        : []
      const td = ((await sb.rpc('tahmin_durumu', { p_etkinlik: ev.id })).data ?? []) as { basladi: boolean }[]
      setKilitli(!!td[0]?.basladi)
      setTema(t)
      onaylanan.current = Object.fromEntries(benim.map(k => [k.id, k.puan]))
      setKareler(benim.map((k, i) => ({ ...k, url: imza[i]?.signedUrl ?? null })))
      setE(ev)
    })().catch(x => setHata(hataMetni(x)))
  }, [uye.id, temaId])

  const oyVer = useCallback(async (kare: string, puan: number) => {
    setKareler(l => l.map(k => (k.id === kare ? { ...k, puan } : k)))
    const { error } = await sb.from('oylar').upsert({ kare, veren: uye.id, puan }, { onConflict: 'kare,veren' })
    if (error) {
      // Sunucu reddederse ekranda kabul edilmiş gibi kalmasın (oylama kapanmış olabilir).
      const onceki = onaylanan.current[kare] ?? null
      setKareler(l => l.map(k => (k.id === kare ? { ...k, puan: onceki } : k)))
      setOyHatasi(hataMetni(error))
    } else {
      onaylanan.current[kare] = puan
      setOyHatasi(x => (x ? null : x))
    }
  }, [uye.id])

  if (hata) return <div className="sc"><Kunye sol="Oylama" geri="oyla" sag="Oylama" /><Hata metin={hata} /></div>
  if (e === undefined) return <Yukleniyor />
  if (e === null || !tema) {
    return (
      <div className="sc">
        <Kunye sol="Oylama" geri="oyla" sag="Oylama" />
        <h2 className="t orta">Oylama<br />açık değil</h2>
      </div>
    )
  }

  const eksik = kareler.filter(k => k.puan == null)
  const kaydir = (id: string) => {
    const el = akis.current?.querySelector(`[data-kare="${id}"]`) as HTMLElement | null
    if (el && akis.current) akis.current.scrollTo({ top: el.offsetTop, behavior: 'smooth' })
  }

  return (
    <div className="akis" ref={akis} data-asama="oylama" onScroll={ogrendi}>
      {oyHatasi && <div className="oy-hata"><Hata metin={oyHatasi} /></div>}
      {cikti && <div className="oy-hata"><p className="veri" role="status" style={{ marginTop: 0, paddingBottom: 10 }}>Kare yarışmadan çıkarıldı. Profil'de Yönetim'den geri alabilirsin.</p></div>}
      {kareler.map((k, i) => (
        <section className="kare" key={k.id} data-kare={k.id}>
          <div className="mast">
            <button className="geri" onClick={() => git('oyla')}><Ikon ad="geri" />Temalar</button>
            {yonetici && asama(e) === 'oylama'
              ? <button className="cikar" onClick={() => setCikar(k.id)}>Yarışmadan çıkar</button>
              : <span className="r">{tema.ad}</span>}
          </div>
          <div className="rb" />
          <div className="plaka">
            <span className="no">{iki(i + 1)}</span>
            <span className="of">/ {iki(kareler.length)}</span>
            <span className="tema">{tema.ad}<small>İsimsiz</small></span>
          </div>
          <div className="ince" />
          <div className="sahne">
            <div className="tutucu">
              {k.url ? (
                <img src={k.url} width={k.genislik} height={k.yukseklik} alt={`${tema.ad} ${i + 1}. kare`} draggable={false}
                  {...tetik(olcek => setBuyuk({ url: k.url!, baslik: tema.ad, sag: `${iki(i + 1)} / ${iki(kareler.length)}`, olcek }))} />
              ) : (
                <div className="bos" style={{ width: 200, height: 140 }} />
              )}
              <span className="reg tl" /><span className="reg tr" /><span className="reg bl" /><span className="reg br" />
            </div>
          </div>
          <div className="ince" />
          {kilitli ? (
            <p className="kilit-not"><Ikon ad="kilit" />Puanın {k.puan != null ? iki(k.puan) : 'yok'}. Tahmin oyununu başlattığın için kilitli.</p>
          ) : (
            <Kaydirici puan={k.puan} degisti={p => oyVer(k.id, p)} />
          )}
          {ipucu && k.puan != null && (
            <p className="kaydir-ipucu" role="status">
              <Ikon ad="yukari" />
              {i + 1 < kareler.length ? 'Sonraki kare için yukarı kaydır' : 'Bitirmek için yukarı kaydır'}
            </p>
          )}
        </section>
      ))}

      <section className="bitti">
        <div className="rb" style={{ margin: '0 0 14px' }} />
        {eksik.length ? (
          <>
            <h2>{eksik.length} kare<br />kaldı</h2>
            <p>Puan vermeden tema kapanmıyor.</p>
            <div className="eksikbas">Puan vermediğin kareler<span>{eksik.length}</span></div>
            <div className="eksik" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.ceil(Math.sqrt(eksik.length)))},minmax(0,1fr))` }}>
              {eksik.map(k => (
                <button key={k.id} onClick={() => kaydir(k.id)}>
                  {k.url && <img src={k.url} alt="" draggable={false} />}
                  <span className="etiket"><span>{iki(kareler.indexOf(k) + 1)}</span><span>kare</span></span>
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => kaydir(eksik[0].id)}>İlk puansız kareye dön</button>
          </>
        ) : (
          <>
            <h2>{tema.ad}<br />bitti</h2>
            <p>Hepsini puanladın. Oylama kapanana kadar değiştirebilirsin.</p>
            <button className="btn" onClick={() => git('oyla')}>Temalara dön</button>
          </>
        )}
      </section>
      {buyuk && <Buyutec acik={buyuk} kapat={() => setBuyuk(null)} />}
      {cikar && (
        <CikarPenceresi kare={cikar} kapat={() => setCikar(null)}
          bitti={() => { setKareler(ks => ks.filter(x => x.id !== cikar)); setCikar(null); setCikti(true) }} />
      )}
    </div>
  )
}

/** Puan kaydırıcısı (kararlar 42, 48, 61): 1-10, bırakınca kademeye oturur. */
function Kaydirici({ puan, degisti }: { puan: number | null; degisti: (p: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [suan, setSuan] = useState<number | null>(puan)
  const [tutuyor, setTutuyor] = useState(false)
  const [oturuyor, setOturuyor] = useState(false)

  useEffect(() => setSuan(puan), [puan])

  const xTen = (x: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.round(1 + Math.max(0, Math.min(1, (x - r.left) / r.width)) * 9)
  }
  const boya = (v: number) => {
    if (v !== suan && navigator.vibrate) navigator.vibrate(8)
    setSuan(v)
  }
  const bitir = (v: number | null) => {
    setTutuyor(false)
    setOturuyor(true)
    window.setTimeout(() => setOturuyor(false), 300)
    if (v != null) degisti(v)
  }

  const p = suan == null ? 0 : (suan - 1) / 9
  return (
    <div className="puan">
      <div className="st">
        <span className="lab">Puanın</span>
        <span className={`deger ${suan == null ? 'yok' : ''}`}>{suan == null ? 'Sürükle' : iki(suan)}</span>
      </div>
      <div
        ref={ref}
        className={`kaydirici ${tutuyor ? 'tutuyor' : ''} ${oturuyor ? 'oturuyor' : ''} ${suan != null ? 'dolu' : ''}`}
        style={{ ['--p' as string]: String(p) }}
        role="slider"
        aria-label="Puan"
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={suan ?? undefined}
        tabIndex={0}
        onPointerDown={ev => {
          ev.currentTarget.setPointerCapture(ev.pointerId)
          setTutuyor(true)
          boya(xTen(ev.clientX))
        }}
        onPointerMove={ev => tutuyor && boya(xTen(ev.clientX))}
        onPointerUp={ev => {
          if (!tutuyor) return
          bitir(xTen(ev.clientX))
        }}
        onPointerCancel={() => {
          // Telefonda parmak kaydırmaya dönerse tarayıcı sürüklemeyi iptal ediyor.
          // Kişi puanı bilerek seçmedi: yazma, eski değere dön.
          setTutuyor(false)
          setOturuyor(false)
          setSuan(puan)
        }}
        onKeyDown={ev => {
          const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0
          if (!d) return
          ev.preventDefault()
          const v = Math.max(1, Math.min(10, (suan ?? 0) + d))
          setSuan(v)
          degisti(v)
        }}
      >
        <span className="ray" />
        <span className="dolgu" />
        <span className="centikler">
          {Array.from({ length: 10 }, (_, i) => (
            <i
              key={i}
              className={suan === i + 1 ? (tutuyor ? 'vur' : 'otur') : ''}
              style={{ left: `calc(8px + ${(i / 9).toFixed(4)} * (100% - 16px))` }}
            />
          ))}
        </span>
        <span className="topuz" />
      </div>
      <div className="olcek">
        <span style={{ ['--t' as string]: '0' }}>01</span>
        <span style={{ ['--t' as string]: '1' }}>10</span>
      </div>
    </div>
  )
}
