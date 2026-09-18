import { useEffect, useState } from 'react'
import { sb, hataMetni, sor } from '../lib/supabase'
import type { Uye } from '../lib/tipler'
import { git } from '../lib/yol'
import { bellegeYaz, bellektenAl } from '../lib/onbellek'
import { Hata, Kunye, Yukleniyor } from '../bilesenler/Kunye'

/**
 * Sıralama sekmesi (kararlar 51, 52, 53, 54, 55, 62).
 * Prototip: prototype/creatorgraphers/2026-09-12_v17-profil-siralama.html
 * Sekme sezondur; etkinliğin kendi sıralaması etkinlik sayfasında kalıyor.
 * Görünürlük sözleşmesi etkinlikle aynı: ilk N kişi sıralı ve puanlı, kalanlar
 * isimli ama sırasız. Ayrımı sunucu yapıyor, ekran değil.
 */

interface Ozet { sezon: number; tamamlanan: number; toplam: number; uye_sayisi: number; onceki: boolean }
interface Satir {
  uye: string; ad: string; benim: boolean
  ortalama: number | null; sira: number | null; sirali: boolean; esikte: boolean
  kare_sayisi: number; etkinlik_sayisi: number
  dosya: string | null; genislik: number | null; yukseklik: number | null
  url?: string | null
}
interface Mudavim { uye: string; ad: string; benim: boolean; katilim: number; pencere: number }

const puanYaz = (n: number | null) => (n == null ? '' : n.toFixed(1).replace('.', ','))

async function siralamaVerisi() {
  const [o, s, m] = await sor(Promise.all([
    sb.rpc('sezon_ozeti'),
    sb.rpc('siralama'),
    sb.rpc('mudavim'),
  ]))
  if (o.error) throw o.error
  if (s.error) throw s.error
  if (m.error) throw m.error
  const liste = ((s.data ?? []) as Satir[])
  const yollar = liste.map(x => x.dosya).filter((x): x is string => !!x)
  const imza = yollar.length
    ? (await sor(sb.storage.from('kareler').createSignedUrls(yollar, 3600))).data ?? []
    : []
  const url = new Map(yollar.map((y, i) => [y, imza[i]?.signedUrl ?? null]))
  return {
    ozet: ((o.data ?? [])[0] ?? null) as Ozet | null,
    liste: liste.map(x => ({ ...x, url: x.dosya ? url.get(x.dosya) ?? null : null })),
    mudavim: (m.data ?? []) as Mudavim[],
  }
}

export function Siralama({ uye }: { uye: Uye }) {
  type Veri = Awaited<ReturnType<typeof siralamaVerisi>>
  const [v, setV] = useState<Veri | null>(() => bellektenAl<Veri>(`${uye.id}:siralama`) ?? null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    siralamaVerisi().then(d => setV(bellegeYaz(`${uye.id}:siralama`, d))).catch(x => setHata(hataMetni(x)))
  }, [uye.id])

  if (hata) return <div className="sc"><Kunye sol="Creatorgraphers" sag="Sıralama" /><Hata metin={hata} /></div>
  // Veri gelirken de künye yerinde kalsın: sekme değiştirince başlık yanıp sönmesin
  if (!v) return <div className="sc"><Kunye sol="Creatorgraphers" sag="Sıralama" /><Yukleniyor /></div>

  const ozet = v.ozet
  const sirali = v.liste.filter(x => x.sirali)
  const sirasiz = v.liste.filter(x => !x.sirali)
  const acik = (ozet?.tamamlanan ?? 0) > 0

  return (
    <div className="sc">
      <Kunye sol="Creatorgraphers" sag="Sıralama" />

      <div className="seas">
        <h2>Sezon {String(ozet?.sezon ?? 1).padStart(2, '0')}</h2>
        <span className="of">{ozet?.tamamlanan ?? 0} / {ozet?.toplam ?? 6} etkinlik</span>
      </div>
      <div className="prog">
        {Array.from({ length: Number(ozet?.toplam ?? 6) }, (_, i) => (
          <i key={i} className={i < Number(ozet?.tamamlanan ?? 0) ? 'on' : ''} />
        ))}
      </div>

      {/* Karar 55: Müdavim sonuçlarla birlikte açılıyor */}
      {v.mudavim.length > 0 && (
        <div className="mud">
          <div className="k">Müdavim<span>Son {v.mudavim[0].pencere} etkinlik</span></div>
          {v.mudavim.length === 1 ? (
            <div className="one">
              <button onClick={() => git(`profil/${v.mudavim[0].uye}`)}>
                <span className={v.mudavim[0].benim ? 'me' : ''}>{v.mudavim[0].ad}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="big">{v.mudavim.length} kişi</div>
              <div className="list">
                {v.mudavim.map(m => (
                  <button key={m.uye} onClick={() => git(`profil/${m.uye}`)} style={{ marginRight: 9 }}>
                    <span className={m.benim ? 'me' : ''}>{m.ad}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!acik ? (
        <>
          {/* Karar 34: kilitli kalır, gizlenmez */}
          <h2 className="sec">Sezon sıralaması</h2>
          <div className="empty" style={{ marginTop: 0 }}>
            <b>İlk sonuçlarla açılıyor</b>
            <span>İlk etkinliğin oylaması kapanınca sıralama burada başlıyor.</span>
          </div>
          <div className="empty">
            <b>Müdavim</b>
            <span>Sonuçlarla birlikte açılıyor.</span>
          </div>
          <div className="empty">
            <b>Geçen sezon</b>
            <span>{ozet?.onceki ? 'Sezon bitince buradan bakılıyor.' : 'Henüz yok. Bu kulübün ilk sezonu.'}</span>
          </div>
        </>
      ) : (
        <>
          <h2 className="sec">Sezon sıralaması<span>İlk {sirali.length}</span></h2>
          {sirali.length === 0 && (
            <div className="empty" style={{ marginTop: 0 }}>
              <b>Sıralama henüz yok</b>
              <span>Sezonda hiç puan verilmemiş.</span>
            </div>
          )}
          {sirali.map(s => (
            <button key={s.uye} className={`row ${s.benim ? 'me' : ''}`} onClick={() => git(`profil/${s.uye}`)}>
              <span className="no">{String(s.sira).padStart(2, '0')}</span>
              {s.url && <img src={s.url} alt="" />}
              <span className="nm">{s.ad}</span>
              <span className="av">{puanYaz(s.ortalama)}</span>
            </button>
          ))}

          {sirasiz.length > 0 && (
            <div className="unr">
              <div className="hd">Sezonda kare veren diğer isimler</div>
              <div className="names">
                {sirasiz.map(s => (
                  <button key={s.uye} className={s.benim ? 'me' : ''} onClick={() => git(`profil/${s.uye}`)}>
                    {s.ad}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
