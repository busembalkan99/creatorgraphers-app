import { useEffect, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Etkinlik, Uye } from '../lib/tipler'
import { asama, ayAdi, gunYaz } from '../lib/zaman'
import { git } from '../lib/yol'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'

/**
 * Sonuçlar (kararlar 7, 10, 18, 19, 24, 38, 43, 52, 68, 77).
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
  url?: string | null
}

const puanYaz = (n: number | null | undefined) =>
  n == null ? '' : n.toFixed(1).replace('.', ',')

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

  useEffect(() => {
    sonucVerisi(etkinlikId).then(setV).catch(x => setHata(hataMetni(x)))
  }, [etkinlikId, uye.id])

  if (hata) return <div className="sc"><Kunye sol="Etkinlikler" geri="etkinlikler" sag="Sonuçlar" /><Hata metin={hata} /></div>
  if (!v) return <Yukleniyor />
  if (!v.etkinlik || asama(v.etkinlik) !== 'sonuc') {
    return (
      <div className="sc">
        <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Sonuçlar" />
        <h2 className="t orta">Sonuçlar<br />açılmadı</h2>
        <p className="lede">Oylama kapanınca kazananlar ve galeri burada açılıyor.</p>
      </div>
    )
  }

  if (detay) return <KareDetay kare={detay} kapat={() => setDetay(null)} />

  const temalar = [...new Map(v.kareler.map(k => [k.tema, { id: k.tema, ad: k.tema_ad, sira: k.tema_sira }])).values()]
    .sort((a, b) => a.sira - b.sira)
  const secili = temalar[Math.min(sekme, Math.max(0, temalar.length - 1))]
  const temaKareler = secili ? v.kareler.filter(k => k.tema === secili.id) : []
  const kazanan = temaKareler[0]
  const kursu = temaKareler.filter(k => k.sirali).slice(1, 3)
  const liste = temaKareler.filter(k => k.sirali).slice(3)
  const galeri = temaKareler.filter(k => !k.sirali)

  return (
    <div className="sc">
      <Kunye sol="Etkinlikler" geri="etkinlikler" sag="Sonuçlar" />
      <div className="bas">
        <h1>{ayAdi(v.etkinlik.bulusma_gunu)}<br />etkinliği</h1>
        <div className="meta">
          <span>{gunYaz(v.etkinlik.bulusma_gunu, false)}</span>
          <span>· {temalar.length} tema</span>
          <span>· {v.kareler.length} kare</span>
          <span>· Sonuçlandı</span>
        </div>
      </div>

      {temalar.length === 0 ? (
        <div className="bos-tema">
          <b>Bu etkinlik</b>
          <h3>Hiç kare<br />yüklenmedi</h3>
          <p>Yükleme kapandığında hiçbir temaya kare gelmemiş, o yüzden sonuç yok.</p>
        </div>
      ) : (
        <>
          <div className="sekmeler" style={{ gridTemplateColumns: `repeat(${temalar.length},1fr)` }}>
            {temalar.map((t, i) => (
              <button key={t.id} className={i === sekme ? 'on' : ''} onClick={() => setSekme(i)} aria-pressed={i === sekme}>
                {t.ad}
                <i>{v.kareler.filter(k => k.tema === t.id).length} kare</i>
              </button>
            ))}
          </div>

          {kazanan && (
            <div className="odul">
              <span className="lab">Temanın karesi</span>
              {kazanan.url && (
                <img src={kazanan.url} width={kazanan.genislik} height={kazanan.yukseklik}
                  alt={`${secili.ad} temasının kazanan karesi`} onClick={() => setDetay(kazanan)} />
              )}
              <div className="serit">
                <b>{secili.ad}</b>
                <span className="ad">{kazanan.sahip_ad}</span>
                <span className="ort">{kazanan.ortalama == null ? 'Puan yok' : puanYaz(kazanan.ortalama)}</span>
              </div>
            </div>
          )}

          {kursu.length > 0 && (
            <div className="kursu">
              {kursu.map((k, i) => (
                <figure key={k.id} onClick={() => setDetay(k)}>
                  {k.url && <img src={k.url} alt="" />}
                  <figcaption>
                    <span className="sat"><span className="no">{String(i + 2).padStart(2, '0')}</span>
                      <span className="ad">{k.sahip_ad}</span></span>
                    <span className="ort">{puanYaz(k.ortalama)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {liste.map(k => (
            <button className={`satir-kare ${k.benim ? 'benim' : ''}`} key={k.id} onClick={() => setDetay(k)}>
              <span className="no">{String(k.sira ?? '').padStart(2, '0')}</span>
              {k.url && <img src={k.url} alt="" />}
              <span className="ad">{k.sahip_ad}</span>
              <span className="ort">{puanYaz(k.ortalama)}</span>
            </button>
          ))}

          {galeri.length > 0 && (
            <>
              <div className="sec">{secili.ad} galerisi<span>{galeri.length} kare</span></div>
              <div className="izgara">
                {galeri.map(k => (
                  <figure key={k.id} className={k.benim ? 'benim' : ''} onClick={() => setDetay(k)}>
                    {k.url && <img src={k.url} alt="" />}
                    {/* Karar 38: kendi ortalamanı her zaman görürsün, başkasınınki gizli */}
                    <figcaption>{k.sahip_ad}{k.benim ? ' · sen' : ''}{k.benim && k.ortalama != null ? ` · ${puanYaz(k.ortalama)}` : ''}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="veri">Sıralamaya girmeyen karelerin puanı gösterilmiyor. Kendi puanını her zaman görürsün.</p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function KareDetay({ kare, kapat }: { kare: SonucKare; kapat: () => void }) {
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
  return (
    <div className="sc detay">
      <div className="mast">
        <button className="geri" onClick={kapat}>Sonuçlar</button>
        <span className="r">{kare.tema_ad}</span>
      </div>
      <div className="rb" />
      {kare.url && <img src={kare.url} width={kare.genislik} height={kare.yukseklik} alt={`${kare.sahip_ad} · ${kare.tema_ad}`} />}
      <div className="kim">
        <span className="ad">{kare.sahip_ad}{kare.benim ? ' · sen' : ''}</span>
        {kare.ortalama != null && <span className="ort">{puanYaz(kare.ortalama)}</span>}
      </div>
      {!kare.sirali && !kare.benim ? (
        <p className="veri">Bu kare sıralamaya girmedi, puanı gösterilmiyor.</p>
      ) : kare.ortalama == null ? (
        // Sıralamaya giren ama hiç puan almayan kare: kimse oylamamış olabilir
        <p className="veri">Bu kareye kimse puan vermemiş.</p>
      ) : (
        <p className="veri">{kare.oy_sayisi} kişi puan verdi{!kare.sirali && kare.benim ? ' · bu puanı yalnız sen görüyorsun' : ''}.</p>
      )}
      {dolu.length > 0 && (
        <div className="kunye">
          {dolu.map(([k, d]) => (
            <div key={k}><b>{k}</b><span>{d}</span></div>
          ))}
        </div>
      )}
      <button className="btn ik" onClick={kapat}>Sonuçlara dön</button>
    </div>
  )
}

/** Ana ekrandaki geçmiş etkinlik satırından açılıyor. */
export const sonucaGit = (etkinlikId: string) => git(`sonuc/${etkinlikId}`)
