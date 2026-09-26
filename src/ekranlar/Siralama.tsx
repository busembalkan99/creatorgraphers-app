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
  const [o, s, m, sr] = await sor(Promise.all([
    sb.rpc('sezon_ozeti'),
    sb.rpc('siralama'),
    sb.rpc('mudavim'),
    sb.rpc('serbest_siralama'),
  ]))
  if (o.error) throw o.error
  if (s.error) throw s.error
  if (m.error) throw m.error
  // Karar 116: serbest temalar ayrı tabloda. Sunucuda fonksiyon yoksa (göç kurulmadan) tablo çıkmaz.
  const liste = ((s.data ?? []) as Satir[])
  const serbest = sr.error ? [] : ((sr.data ?? []) as Satir[])
  const yollar = [...liste, ...serbest].map(x => x.dosya).filter((x): x is string => !!x)
  const imza = yollar.length
    ? (await sor(sb.storage.from('kareler').createSignedUrls(yollar, 3600))).data ?? []
    : []
  const url = new Map(yollar.map((y, i) => [y, imza[i]?.signedUrl ?? null]))
  return {
    ozet: ((o.data ?? [])[0] ?? null) as Ozet | null,
    liste: liste.map(x => ({ ...x, url: x.dosya ? url.get(x.dosya) ?? null : null })),
    serbest: serbest.map(x => ({ ...x, url: x.dosya ? url.get(x.dosya) ?? null : null })),
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

  const satirCiz = (s: Satir, tablo: 'sezon' | 'serbest' = 'sezon') => (
    <button key={s.uye} className={`row ${s.benim ? 'me' : ''} ${s.sira === 1 ? 'lider' : ''}`} data-tablo={tablo} onClick={() => git(`profil/${s.uye}`)}>
      <span className="no">{String(s.sira).padStart(2, '0')}</span>
      {/* Görsel kişinin en iyi karesi, sayı bütün karelerinin ortalaması (karar 53).
          İkisi yan yana durunca sayı o karenin puanı sanılıyordu; iki yarı da ne olduğunu
          söylüyor. Kareninki görselin altında, çünkü kareye ait (karar 110). */}
      {s.url && (
        <span className="kr">
          <img src={s.url} alt="" />
        </span>
      )}
      <span className="nm"><span>{s.ad}</span></span>
      <span className="av">
        {puanYaz(s.ortalama)}
        <small>{s.kare_sayisi > 1 ? `${s.kare_sayisi} kare ort.` : 'tek kare'}</small>
      </span>
    </button>
  )
  const ozet = v.ozet
  const sirali = v.liste.filter(x => x.sirali)
  const sirasiz = v.liste.filter(x => !x.sirali)
  const acik = (ozet?.tamamlanan ?? 0) > 0
  // Vurgu: kişinin kendi yeri en üstte; sıralı değilse ortalaması yalnız kendine (karar 52)
  const ben = v.liste.find(x => x.benim)

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

      {/* Profil'deki sayılar kartıyla aynı dil: sayı üstte, ne olduğu altında (Buse, 2026-09-26) */}
      {acik && ben && (ben.sirali ? (
        <div className="kart sen-yeri"><div><b>{ben.sira}</b><span>Sıralaman</span></div><div><b>{puanYaz(ben.ortalama)}</b><span>Ortalaman</span></div></div>
      ) : ben.ortalama != null && (
        <div className="kart sen-yeri"><div><b>{puanYaz(ben.ortalama)}</b><span>Ortalaman</span></div>
          <p>Sıralamaya girmedin. Ortalamanı yalnız sen görüyorsun.</p></div>
      ))}

      {!acik ? (
        <>
          {/* Karar 34: kilitli kalır, gizlenmez */}
          <h2 className="kart-bas">Sezon sıralaması</h2>
          <div className="kart bos-kart">
            <b>İlk sonuçlarla açılıyor</b>
            <span>İlk etkinliğin oylaması kapanınca sıralama burada başlıyor.</span>
          </div>
          <div className="kart bos-kart">
            <b>Müdavim</b>
            <span>Sonuçlarla birlikte açılıyor.</span>
          </div>
          <div className="kart bos-kart">
            <b>Geçen sezon</b>
            <span>{ozet?.onceki ? 'Sezon bitince buradan bakılıyor.' : 'Henüz yok. Bu kulübün ilk sezonu.'}</span>
          </div>
        </>
      ) : (
        <>
          {v.mudavim.length > 0 && (
            <>
              <h2 className="kart-bas">Müdavim<span>{v.mudavim.length ? `Son ${v.mudavim[0].pencere} etkinlik` : ''}</span></h2>
              {(
                <div className="kart mud-kart">
                  <b>{v.mudavim.length === 1 ? 'Tek kişi' : `${v.mudavim.length} kişi`}</b>
                  <span>Son etkinliklerin hepsine kare verenler.</span>
                  <div className="isimler">
                    {v.mudavim.map(m => (
                      <button key={m.uye} onClick={() => git(`profil/${m.uye}`)}><span className={m.benim ? 'me' : undefined}>{m.ad}</span></button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {(
            <>
              <h2 className="kart-bas">Sıralama<span>İlk {sirali.length}</span></h2>
              {/* Karar 110: kare kişinin en iyisi, puan bütün karelerinin ortalaması. Satırlarda değil, bir kez (Buse, 2026-09-26). */}
              <p className="kart-not">Kare, kişinin en iyi karesi; puan, bütün karelerinin ortalaması.</p>
              {sirali.length === 0 ? (
                <div className="kart bos-kart"><b>Sıralama henüz yok</b><span>Sezonda hiç puan verilmemiş.</span></div>
              ) : (
                <div className="satir-kartlari">{sirali.map(s => satirCiz(s))}</div>
              )}
              {sirasiz.length > 0 && (
                <>
                  <h2 className="kart-bas">Sezonda kare veren diğer isimler</h2>
                  <div className="kart isimler">
                {sirasiz.map(s => (
                  <button key={s.uye} onClick={() => git(`profil/${s.uye}`)}><span className={s.benim ? 'me' : undefined}>{s.ad}</span></button>
                ))}
              </div>
                </>
              )}
            </>
          )}

          {v.serbest.length > 0 && (
            <>
              <h2 className="kart-bas">Serbest temalar<span>İlk {v.serbest.filter(x => x.sirali).length}</span></h2>
              <p className="kart-not">Serbest temalardaki kareler. Sezon sıralamasına yarım ağırlıkla girer.</p>
              {v.serbest.some(x => x.sirali) ? (
                <div className="satir-kartlari">{v.serbest.filter(x => x.sirali).map(s => satirCiz(s, 'serbest'))}</div>
              ) : (
                <div className="kart bos-kart"><b>Henüz serbest kare yok</b><span>Serbest temalı bir etkinlik sonuçlanınca burada.</span></div>
              )}
              {v.serbest.some(x => !x.sirali) && (
                <>
                  <h2 className="kart-bas">Serbest temada kare veren diğer isimler</h2>
                  <div className="kart isimler" data-tablo="serbest">
                {v.serbest.filter(x => !x.sirali).map(s => (
                  <button key={s.uye} onClick={() => git(`profil/${s.uye}`)}><span className={s.benim ? 'me' : undefined}>{s.ad}</span></button>
                ))}
              </div>
                </>
              )}
            </>
          )}

        </>
      )}
    </div>
  )
}
