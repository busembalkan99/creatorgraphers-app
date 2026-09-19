import { useEffect, useRef, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik, Uye } from '../lib/tipler'
import { asama, ayAdi, gunYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Ikon } from '../bilesenler/Ikon'
import { Buyutec } from '../bilesenler/Buyutec'
import { CikarPenceresi } from '../bilesenler/Cikar'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'

/**
 * Sonuçlar (kararlar 7, 10, 18, 19, 24, 38, 43, 52, 68, 77, 98).
 * Prototip: prototype/creatorgraphers/2026-09-13_v19-etkinlik-sayfasi.html
 * İsimler burada açılıyor. Sıralamaya girmeyenin puanını yalnız sahibi görüyor;
 * bu ayrımı sunucu yapıyor, ekran değil.
 */

interface SonucKare {
  id: string
  tema: string
  tema_ad: string
  tema_sira: number
  dosya: string
  genislik: number
  yukseklik: number
  sahip: string
  sahip_ad: string
  benim: boolean
  ortalama: number | null
  oy_sayisi: number | null
  sira: number | null
  sirali: boolean
  cekim_gunu: string | null
  kamera: string | null
  objektif: string | null
  odak: string | null
  diyafram: string | null
  enstantane: string | null
  iso: string | null
  // Karar 103: yarışmadan çıkarılan kare yalnız sahibine ve yöneticiye gelir
  cikarildi: boolean
  cikarma_nedeni: string | null
  url?: string | null
}

const puanYaz = (n: number | null | undefined) =>
  n == null ? '' : n.toFixed(1).replace('.', ',')

/** Ortak birincilikte kaç kare eşit (karar 98). Bir temada en fazla 5 kare sıralı. */
const sayiYaz = (n: number) => ['', '', 'İki', 'Üç', 'Dört', 'Beş'][n] ?? String(n)

async function sonucVerisi(etkinlikId: string) {
  const [e, k] = await sor(Promise.all([
    sb.from('etkinlikler').select('*').eq('id', etkinlikId).maybeSingle(),
    sb.rpc('sonuc_kareleri', { p_etkinlik: etkinlikId }),
  ]))
  if (e.error) throw e.error
  if (k.error) throw k.error
  const kareler = (k.data ?? []) as SonucKare[]
  const imza = kareler.length
    ? (await sor(sb.storage.from('kareler').createSignedUrls(kareler.map(x => x.dosya), 3600))).data ?? []
    : []
  return {
    etkinlik: (e.data ?? null) as Etkinlik | null,
    kareler: kareler.map((x, i) => ({ ...x, url: imza[i]?.signedUrl ?? null })),
  }
}

export function Sonuc({ uye, etkinlikId }: { uye: Uye; etkinlikId: string }) {
  const [v, setV] = useState<{ etkinlik: Etkinlik | null; kareler: SonucKare[] } | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [sekme, setSekme] = useState(0)
  const [detay, setDetay] = useState<SonucKare | null>(null)
  // Detaydan dönünce galeri kaldığın yerde kalsın (Buse, 2026-09-18)
  const donus = useRef<number | null>(null)
  const ac = (k: SonucKare) => {
    donus.current = document.querySelector('.sc')?.scrollTop ?? null
    setDetay(k)
  }
  useEffect(() => {
    if (detay || donus.current == null) return
    const sc = document.querySelector('.sc')
    if (sc) sc.scrollTop = donus.current
    donus.current = null
  }, [detay])

  const yenile = () => sonucVerisi(etkinlikId).then(setV).catch(x => setHata(hataMetni(x)))
  useEffect(() => { yenile() }, [etkinlikId, uye.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (hata) return <div className="sc"><Kunye sol="Etkinlikler" geri="etkinlikler" sag="Sonuçlar" /><Hata metin={hata} /></div>
  if (!v) return <div className="sc"><Kunye sol="Etkinlikler" geri="etkinlikler" sag="Sonuçlar" /><Yukleniyor /></div>
  if (!v.etkinlik || asama(v.etkinlik) !== 'sonuc') {
    return (
      <div className="sc">
        <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Sonuçlar" />
        <h2 className="t orta">Sonuçlar<br />açılmadı</h2>
        <p className="lede">Kazananlar ve galeri oylama kapanınca açılıyor.</p>
      </div>
    )
  }

  const temalar = [...new Map(v.kareler.map(k => [k.tema, { id: k.tema, ad: k.tema_ad, sira: k.tema_sira }])).values()]
    .sort((a, b) => a.sira - b.sira)
  const secili = temalar[Math.min(sekme, Math.max(0, temalar.length - 1))]
  // Çıkarılan kareler sayılara ve sıralamaya girmiyor, en altta ayrı duruyor
  const yarisan = v.kareler.filter(k => !k.cikarildi)
  const temaKareler = secili ? yarisan.filter(k => k.tema === secili.id) : []
  const cikanlar = secili ? v.kareler.filter(k => k.cikarildi && k.tema === secili.id) : []
  // Puan almamış kare sunucuda sıralamaya girmiyor (karar 98). Temada hiç sıralı kare
  // yoksa o temayı kimse oylamamış demektir: ödül de sıralama da yok.
  const sirali = temaKareler.filter(k => k.sirali)
  const oylanmadi = temaKareler.length > 0 && sirali.length === 0
  // Numara sunucudan geliyor. Eşit puanlı kareler aynı numarayı taşıyor (karar 98),
  // o yüzden bölümler dizideki yerden değil numaradan ayrılıyor.
  const birinciler = sirali.filter(k => k.sira === 1)
  const kursu = sirali.filter(k => k.sira != null && k.sira >= 2 && k.sira <= 3)
  const liste = sirali.filter(k => k.sira != null && k.sira >= 4)
  const galeri = temaKareler.filter(k => !k.sirali)

  // Detay seçili temadan açılıyor, o yüzden temanın oylanıp oylanmadığını taşıyabiliyor
  if (detay) {
    return <KareDetay kare={detay} temaOylanmadi={oylanmadi} yonetici={uye.rol !== 'uye'}
      kapat={() => setDetay(null)} degisti={() => { setDetay(null); yenile() }} />
  }

  return (
    <div className="sc">
      <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Sonuçlar" />
      <div className="bas">
        <h1>{ayAdi(v.etkinlik.bulusma_gunu)}<br />etkinliği</h1>
        <div className="meta">
          <span>{gunYaz(v.etkinlik.bulusma_gunu, false)}</span>
          <span>· {temalar.length} tema</span>
          <span>· {yarisan.length} kare</span>
          <span>· Sonuçlandı</span>
        </div>
      </div>

      {temalar.length === 0 ? (
        <div className="bos-tema">
          <b>Bu etkinlik</b>
          <h3>Hiç kare<br />yüklenmedi</h3>
          <p>Hiçbir temaya kare gelmemiş.</p>
        </div>
      ) : (
        <>
          <div className="sekmeler" style={{ gridTemplateColumns: `repeat(${temalar.length},1fr)` }}>
            {temalar.map((t, i) => (
              <button key={t.id} className={i === sekme ? 'on' : ''} onClick={() => setSekme(i)} aria-pressed={i === sekme}>
                {t.ad}
                <i>{yarisan.filter(k => k.tema === t.id).length} kare</i>
              </button>
            ))}
          </div>

          {oylanmadi && (
            <div className="bos-tema">
              <b>{secili.ad}</b>
              <h3>Bu temada<br />oylama olmadı</h3>
              <p>Bu temayı kimse oylamamış. Kareler aşağıda.</p>
            </div>
          )}

          {birinciler.length > 0 && (
            <div className="odul">
              <span className="lab">Temanın karesi</span>
              {birinciler.length > 1 && (
                <p className="veri esit">{sayiYaz(birinciler.length)} kare eşit puan aldı.</p>
              )}
              {birinciler.map(k => (
                <div className="kazanan" key={k.id}>
                  {k.url && (
                    <img src={k.url} width={k.genislik} height={k.yukseklik}
                      alt={`${secili.ad} temasının kazanan karesi`} onClick={() => ac(k)} />
                  )}
                  <div className="serit">
                    <b>{secili.ad}</b>
                    <span className="ad">{k.sahip_ad}</span>
                    <span className="ort">{puanYaz(k.ortalama)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {kursu.length > 0 && (
            <div className="kursu">
              {kursu.map(k => (
                <figure key={k.id} onClick={() => ac(k)}>
                  {k.url && <img src={k.url} alt="" />}
                  <figcaption>
                    {/* Numara sunucudaki sıradan gelir, dizideki yerden değil */}
                    <span className="sat"><span className="no">{String(k.sira).padStart(2, '0')}</span>
                      <span className="ad">{k.sahip_ad}</span></span>
                    <span className="ort">{puanYaz(k.ortalama)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {liste.map(k => (
            <button className={`satir-kare ${k.benim ? 'benim' : ''}`} key={k.id} onClick={() => ac(k)}>
              <span className="no">{String(k.sira ?? '').padStart(2, '0')}</span>
              {k.url && <img src={k.url} alt="" />}
              <span className="ad">{k.sahip_ad}</span>
              <span className="ort">{puanYaz(k.ortalama)}</span>
            </button>
          ))}

          {galeri.length > 0 && (
            <>
              <h2 className="sec">{secili.ad}{oylanmadi ? ' kareleri' : ' galerisi'}<span>{galeri.length} kare</span></h2>
              <div className="izgara">
                {galeri.map(k => (
                  <figure key={k.id} className={k.benim ? 'benim' : ''} onClick={() => ac(k)}>
                    {k.url && <img src={k.url} alt="" />}
                    {/* Karar 38: kendi ortalamanı her zaman görürsün, başkasınınki gizli */}
                    <figcaption>{k.sahip_ad}{k.benim ? ' · sen' : ''}{k.benim && k.ortalama != null ? ` · ${puanYaz(k.ortalama)}` : ''}</figcaption>
                  </figure>
                ))}
              </div>
              {!oylanmadi && (
                <p className="veri">Sıralamaya girmeyen karelerin puanı gizli. Kendi puanını görürsün.</p>
              )}
            </>
          )}

          {cikanlar.length > 0 && (
            <>
              <h2 className="sec">Yarışmadan çıkarılan<span>{cikanlar.length} kare</span></h2>
              <div className="izgara">
                {cikanlar.map(k => (
                  <figure key={k.id} className="cikti" onClick={() => ac(k)}>
                    {k.url && <img src={k.url} alt="" />}
                    <figcaption>{k.sahip_ad}{k.benim ? ' · sen' : ''}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="veri">{cikanlar.some(k => !k.benim) ? 'Bunları yalnız sahipleri ve yöneticiler görüyor.' : 'Bunu yalnız sen ve yöneticiler görüyorsunuz.'}</p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function KareDetay({ kare, temaOylanmadi, yonetici, kapat, degisti }:
  { kare: SonucKare; temaOylanmadi: boolean; yonetici: boolean; kapat: () => void; degisti: () => void }) {
  const kunye: [string, string | null][] = [
    ['Çekildiği gün', kare.cekim_gunu ? gunYaz(kare.cekim_gunu, false) : null],
    ['Makine', kare.kamera],
    ['Objektif', kare.objektif],
    ['Odak', kare.odak],
    ['Diyafram', kare.diyafram],
    ['Enstantane', kare.enstantane],
    ['ISO', kare.iso],
  ]
  const dolu = kunye.filter(([, v]) => v)
  const [buyuk, setBuyuk] = useState(false)
  const [cikar, setCikar] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  async function geriAl() {
    const { error } = await sb.rpc('kare_geri_al', { p_kare: kare.id })
    if (error) return setHata(hataMetni(error))
    degisti()
  }
  return (
    <div className="sc detay">
      <header className="tepe">
        <div className="mast">
          <button className="geri" onClick={kapat}><Ikon ad="geri" />Sonuçlar</button>
          <span className="r">{kare.tema_ad}</span>
        </div>
        <div className="rb" />
      </header>
      {kare.url && <img src={kare.url} width={kare.genislik} height={kare.yukseklik} alt={`${kare.sahip_ad} · ${kare.tema_ad}`}
        onClick={() => setBuyuk(true)} />}
      {buyuk && kare.url && <Buyutec acik={{ url: kare.url, baslik: kare.tema_ad, sag: kare.sahip_ad }} kapat={() => setBuyuk(false)} />}
      <div className="kim">
        <span className="ad">{kare.sahip_ad}{kare.benim ? ' · sen' : ''}</span>
        {kare.ortalama != null && <span className="ort">{puanYaz(kare.ortalama)}</span>}
      </div>
      {kare.cikarildi ? (
        <div className="cikarildi-not">
          <b>Yarışmadan çıkarıldı</b>
          {kare.cikarma_nedeni && <span>{kare.cikarma_nedeni}</span>}
        </div>
      ) : temaOylanmadi ? (
        // Temada hiç oy yok: "sıralamaya girmedi" demek gizli bir puan varmış gibi okunurdu
        <p className="veri">Bu temayı kimse oylamamış.</p>
      ) : !kare.sirali && !kare.benim ? (
        <p className="veri">Sıralamaya girmedi, puanı gizli.</p>
      ) : kare.ortalama == null ? (
        <p className="veri">Bu kareye kimse puan vermemiş.</p>
      ) : (
        <p className="veri">{kare.oy_sayisi} kişi puan verdi{!kare.sirali && kare.benim ? '. Bu puanı yalnız sen görüyorsun' : ''}.</p>
      )}
      {dolu.length > 0 && (
        <div className="kunye">
          {dolu.map(([k, d]) => (
            <div key={k}><b>{k}</b><span>{d}</span></div>
          ))}
        </div>
      )}
      <Hata metin={hata} />
      {yonetici && (kare.cikarildi
        ? <button className="btn ik" onClick={geriAl}>Yarışmaya geri al</button>
        : <button className="btn ik" onClick={() => setCikar(true)}>Yarışmadan çıkar</button>)}
      {cikar && <CikarPenceresi kare={kare.id} kapat={() => setCikar(false)} bitti={degisti} />}
      <button className="btn ik" onClick={kapat}>Sonuçlara dön</button>
    </div>
  )
}

/** Ana ekrandaki geçmiş etkinlik satırından açılıyor. */
export const sonucaGit = (etkinlikId: string) => git(`sonuc/${etkinlikId}`)
